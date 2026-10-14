import { getStore } from '@netlify/blobs';

// 背景 function 的請求上限只有 256KB，無法直接接收上傳的檔案內容。
// 因此改成兩段式：先由這支「同步」function 把檔案暫存到 Netlify Blobs（可用 6MB），
// 背景 function 再憑 jobId 取出來分析。
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
    const files = Array.isArray(body.files) ? body.files.slice(0, 10) : [];

    if (!jobId) {
      return new Response(JSON.stringify({ error: '缺少 job ID' }), { status: 400, headers: HEADERS });
    }
    if (!files.length) {
      return new Response(JSON.stringify({ error: '未提供任何檔案' }), { status: 400, headers: HEADERS });
    }

    const store = getStore('upload-staging');
    await store.setJSON(jobId, { files });

    return new Response(JSON.stringify({ ok: true, count: files.length }), { status: 200, headers: HEADERS });
  } catch (err) {
    console.error('stage-upload error:', err);
    return new Response(JSON.stringify({ error: `暫存失敗：${err.message}` }), { status: 500, headers: HEADERS });
  }
};
