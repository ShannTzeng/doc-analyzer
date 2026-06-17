import { getStore } from '@netlify/blobs';

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

function extractDriveId(url) {
  const patterns = [/\/file\/d\/([a-zA-Z0-9_-]+)/, /\/d\/([a-zA-Z0-9_-]+)/, /id=([a-zA-Z0-9_-]+)/];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

export default async (req) => {
  let jobId;
  const store = getStore('job-results');

  try {
    const body = await req.json();
    jobId = body.jobId;
    const driveUrl = body.driveUrl;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      await store.setJSON(jobId, { status: 'error', error: '未設定 API Key' });
      return new Response('ok');
    }

    await store.setJSON(jobId, { status: 'processing' });

    // 下載 Google Drive 檔案
    const fileId = extractDriveId(driveUrl);
    if (!fileId) {
      await store.setJSON(jobId, { status: 'error', error: '無法解析 Google Drive 連結' });
      return new Response('ok');
    }

    const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
    const driveRes = await fetch(downloadUrl, { redirect: 'follow' });

    if (!driveRes.ok) {
      await store.setJSON(jobId, { status: 'error', error: `下載失敗：HTTP ${driveRes.status}` });
      return new Response('ok');
    }

    const contentType = driveRes.headers.get('content-type') || '';
    if (contentType.includes('text/html')) {
      await store.setJSON(jobId, { status: 'error', error: '無法存取檔案，請確認分享設定為「知道連結的人都可以檢視」' });
      return new Response('ok');
    }

    const buffer = Buffer.from(await driveRes.arrayBuffer());
    const base64 = buffer.toString('base64');
    let mimeType = contentType.split(';')[0].trim() || 'application/pdf';

    // 組 Claude 訊息
    let messageContent = [];
    if (mimeType.startsWith('image/')) {
      const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const m = supported.includes(mimeType) ? mimeType : 'image/jpeg';
      messageContent = [
        { type: 'image', source: { type: 'base64', media_type: m, data: base64 } },
        { type: 'text', text: ANALYSIS_PROMPT },
      ];
    } else {
      messageContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: ANALYSIS_PROMPT },
      ];
    }

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
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

    const data = await claudeRes.json();
    if (!claudeRes.ok) {
      await store.setJSON(jobId, { status: 'error', error: `API錯誤 ${claudeRes.status}: ${data?.error?.message}` });
      return new Response('ok');
    }

    const rawText = data.content[0].text;
    const match = rawText.match(/\{[\s\S]*\}/);
    if (!match) {
      await store.setJSON(jobId, { status: 'error', error: '分析結果格式錯誤，請重試' });
      return new Response('ok');
    }

    const parsed = JSON.parse(match[0]);
    const points = (parsed.points || []).filter((p) => p && p.trim());
    const illustrationPages = Array.isArray(parsed.illustrationPages)
      ? parsed.illustrationPages.filter((n) => Number.isInteger(n) && n > 0).slice(0, 3)
      : [];
    await store.setJSON(jobId, { status: 'done', points, illustrationPages });

  } catch (err) {
    console.error('Background handler error:', err);
    if (jobId) {
      try { await store.setJSON(jobId, { status: 'error', error: err.message }); } catch (_) {}
    }
  }

  return new Response('ok');
};
