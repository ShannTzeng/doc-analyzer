import { getStore } from '@netlify/blobs';

const HEADERS = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

export default async (req) => {
  if (req.method === 'OPTIONS') return new Response('', { status: 200, headers: HEADERS });

  const url = new URL(req.url);
  const jobId = url.searchParams.get('id');

  if (!jobId) {
    return new Response(JSON.stringify({ error: '缺少 job ID' }), { status: 400, headers: HEADERS });
  }

  try {
    const store = getStore('job-results');
    const result = await store.get(jobId, { type: 'json' });

    if (result === null || result === undefined) {
      return new Response(JSON.stringify({ status: 'pending' }), { headers: HEADERS });
    }

    return new Response(JSON.stringify(result), { headers: HEADERS });
  } catch (err) {
    console.error('job-status error:', err.message);
    return new Response(JSON.stringify({ status: 'pending', debug: err.message }), { headers: HEADERS });
  }
};
