const { getStore } = require('@netlify/blobs');

const ANALYSIS_PROMPT = `請仔細分析這份文件/圖片的內容，提取真正有價值的重點。

規則：
- 只保留真正重要、有實質意義的資訊
- 最多10點，但不用湊滿10點
- 每個重點簡潔清楚，說明核心內容
- 請用繁體中文回覆

請以下列 JSON 格式回覆，不要加其他說明文字：
{"points": ["重點1", "重點2", ...]}`;

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

  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error('無法存取檔案，請確認 Google Drive 分享設定為「知道連結的人都可以檢視」');
  }

  const buffer = Buffer.from(await res.arrayBuffer());
  const base64 = buffer.toString('base64');
  let mimeType = contentType.split(';')[0].trim();
  if (!mimeType || mimeType === 'application/octet-stream') mimeType = 'application/pdf';

  return { base64, mimeType };
}

async function analyzeWithClaude(base64, mimeType, apiKey) {
  let messageContent = [];

  if (mimeType.startsWith('image/')) {
    const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    const effectiveMime = supported.includes(mimeType) ? mimeType : 'image/jpeg';
    messageContent = [
      { type: 'image', source: { type: 'base64', media_type: effectiveMime, data: base64 } },
      { type: 'text', text: ANALYSIS_PROMPT },
    ];
  } else {
    messageContent = [
      { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
      { type: 'text', text: ANALYSIS_PROMPT },
    ];
  }

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
  if (!res.ok) throw new Error(`API錯誤 ${res.status}: ${data?.error?.message || '未知錯誤'}`);

  const rawText = data.content[0].text;
  const match = rawText.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('分析結果格式錯誤，請重試');

  const parsed = JSON.parse(match[0]);
  return (parsed.points || []).filter((p) => p && p.trim());
}

exports.handler = async (event) => {
  const store = getStore('job-results');

  try {
    const { jobId, driveUrl } = JSON.parse(event.body);
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      await store.setJSON(jobId, { status: 'error', error: '未設定 API Key' });
      return;
    }

    await store.setJSON(jobId, { status: 'processing' });

    const { base64, mimeType } = await downloadFromDrive(driveUrl);
    const points = await analyzeWithClaude(base64, mimeType, apiKey);

    await store.setJSON(jobId, { status: 'done', points });
  } catch (err) {
    console.error('Background function error:', err);
    try {
      const { jobId } = JSON.parse(event.body);
      const store2 = getStore('job-results');
      await store2.setJSON(jobId, { status: 'error', error: err.message });
    } catch (_) {}
  }
};
