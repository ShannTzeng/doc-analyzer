import { getStore } from '@netlify/blobs';

// 背景 function 的請求上限只有 256KB，無法直接接收上傳的檔案內容。
// 因此改成兩段式：先由這支「同步」function 把檔案暫存到 Netlify Blobs（可用 6MB），
// 背景 function 再憑 jobId 取出來分析。
//
// 單次請求同樣受 6MB 限制，整班 30 位（60 頁）會超過，因此支援「分批」：
// 前端依序呼叫多次，每次帶 chunk 序號，各自存成一個 blob；
// 背景 function 再依 chunks 數量把它們讀回來串接。
const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers: HEADERS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405, headers: HEADERS });
  }

  try {
    const body = await req.json();
    const jobId = body.jobId;
    if (!jobId) {
      return new Response(JSON.stringify({ error: '缺少 job ID' }), { status: 400, headers: HEADERS });
    }

    const store = getStore('upload-staging');

    // 新格式：一批已切分好的頁面影像
    if (Array.isArray(body.pages)) {
      const chunk = Number.isInteger(body.chunk) && body.chunk >= 0 ? body.chunk : 0;
      if (!body.pages.length) {
        return new Response(JSON.stringify({ error: '這一批沒有任何頁面' }), { status: 400, headers: HEADERS });
      }
      await store.setJSON(`${jobId}/${chunk}`, { pages: body.pages });
      return new Response(JSON.stringify({ ok: true, chunk, count: body.pages.length }), { status: 200, headers: HEADERS });
    }

    // 舊格式：整份檔案（Word 等仍走這條）
    const files = Array.isArray(body.files) ? body.files.slice(0, 10) : [];
    if (!files.length) {
      return new Response(JSON.stringify({ error: '未提供任何檔案' }), { status: 400, headers: HEADERS });
    }
    await store.setJSON(jobId, { files });
    return new Response(JSON.stringify({ ok: true, count: files.length }), { status: 200, headers: HEADERS });
  } catch (err) {
    console.error('stage-upload error:', err);
    return new Response(JSON.stringify({ error: `暫存失敗：${err.message}` }), { status: 500, headers: HEADERS });
  }
};
