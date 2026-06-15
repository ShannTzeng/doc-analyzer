const { getStore } = require('@netlify/blobs');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };

  try {
    const jobId = event.queryStringParameters && event.queryStringParameters.id;
    if (!jobId) return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: '缺少 job ID' }) };

    const store = getStore('job-results');
    const result = await store.get(jobId, { type: 'json' });

    if (!result) return { statusCode: 200, headers: CORS, body: JSON.stringify({ status: 'pending' }) };

    return { statusCode: 200, headers: CORS, body: JSON.stringify(result) };
  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
