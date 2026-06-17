const ANALYSIS_PROMPT = `請仔細分析這份文件/圖片的內容，提取真正有價值的重點。

規則：
- 只保留真正重要、有實質意義的資訊
- 最多10點，但不用湊滿10點
- 每個重點簡潔清楚，說明核心內容
- 請用繁體中文回覆
- 去識別化：若內容出現學生姓名，務必去識別化，例如「王小明」顯示為「王○○」，或以「學生A」「學生B」代稱，切勿呈現完整姓名

另外，請找出文件中「學生繪圖或填答內容最精彩、最具代表性」的頁面，列出頁碼（從第 1 頁開始計算，最多 3 頁）。若文件沒有插圖、只有單張圖片、或無法判斷頁碼，請回傳空陣列。

請以下列 JSON 格式回覆，不要加其他說明文字：
{"points": ["重點1", "重點2", ...], "illustrationPages": [頁碼1, 頁碼2, ...]}`;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

function extractDriveId(url) {
  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
    /id=([a-zA-Z0-9_-]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

async function downloadFromDrive(url) {
  const fileId = extractDriveId(url);
  if (!fileId) throw new Error('無法解析 Google Drive 連結，請確認連結格式正確');

  const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
  const res = await fetch(downloadUrl, { redirect: 'follow' });

  if (!res.ok) throw new Error(`Google Drive 下載失敗：HTTP ${res.status}`);

  const contentType = res.headers.get('content-type') || 'application/octet-stream';

  // If Google returns an HTML page, the file isn't publicly shared
  if (contentType.includes('text/html')) {
    throw new Error('無法存取檔案，請確認 Google Drive 分享設定為「知道連結的人都可以檢視」');
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const base64 = buffer.toString('base64');

  // Normalize content type
  let mimeType = contentType.split(';')[0].trim();
  if (mimeType === 'application/octet-stream') mimeType = 'application/pdf'; // fallback

  return { base64, mimeType };
}

async function buildMessageContent(fileData, mimeType, fileName) {
  if (mimeType.startsWith('image/')) {
    const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const effectiveMime = supported.includes(mimeType) ? mimeType : 'image/jpeg';
    return [
      { type: 'image', source: { type: 'base64', media_type: effectiveMime, data: fileData } },
      { type: 'text', text: ANALYSIS_PROMPT },
    ];
  }

  if (mimeType === 'application/pdf') {
    return [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileData } },
      { type: 'text', text: ANALYSIS_PROMPT },
    ];
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    mimeType === 'application/msword' ||
    (fileName && fileName.toLowerCase().endsWith('.docx'))
  ) {
    const mammoth = require('mammoth');
    const buffer = Buffer.from(fileData, 'base64');
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();
    if (!text) throw new Error('Word 文件內容為空或無法讀取');
    return [{ type: 'text', text: `以下是 Word 文件內容：\n\n${text}\n\n---\n\n${ANALYSIS_PROMPT}` }];
  }

  throw new Error(`不支援的檔案類型：${mimeType}`);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: '未設定 API Key' }) };

    const body = JSON.parse(event.body);
    let fileData, mimeType, fileName;

    if (body.driveUrl) {
      // Google Drive link mode
      ({ base64: fileData, mimeType } = await downloadFromDrive(body.driveUrl));
      fileName = body.fileName || 'document';
    } else if (body.fileData) {
      // Direct upload mode
      ({ fileData, mimeType, fileName } = body);
    } else {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: '請上傳檔案或貼上 Google Drive 連結' }) };
    }

    const messageContent = await buildMessageContent(fileData, mimeType, fileName);

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1024,
        messages: [{ role: 'user', content: messageContent }],
      }),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error('Anthropic error:', JSON.stringify(data));
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: `API錯誤 ${res.status}: ${data?.error?.message || '未知錯誤'}` }) };
    }

    const rawText = data.content[0].text;
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: '分析結果格式錯誤，請重試' }) };

    const parsed = JSON.parse(match[0]);
    const points = (parsed.points || []).filter((p) => p && p.trim());
    const illustrationPages = Array.isArray(parsed.illustrationPages)
      ? parsed.illustrationPages.filter((n) => Number.isInteger(n) && n > 0).slice(0, 3)
      : [];

    return { statusCode: 200, headers: CORS, body: JSON.stringify({ points, illustrationPages }) };

  } catch (err) {
    console.error('Handler error:', err);
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
