exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS, body: JSON.stringify({ error: 'Method Not Allowed' }) };
  }

  try {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: '未設定 API Key' }) };
    }

    const { fileData, mimeType, fileName } = JSON.parse(event.body);

    let messageContent = [];

    if (mimeType && mimeType.startsWith('image/')) {
      const effectiveMime = ['image/jpeg','image/png','image/gif','image/webp'].includes(mimeType) ? mimeType : 'image/jpeg';
      messageContent = [
        { type: 'image', source: { type: 'base64', media_type: effectiveMime, data: fileData } },
        { type: 'text', text: '請分析這份內容，提取最有價值的重點，最多10點，只保留真正重要的資訊。用繁體中文，以JSON格式回覆：{"points":["重點1","重點2",...]}' },
      ];
    } else if (mimeType === 'application/pdf') {
      messageContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileData } },
        { type: 'text', text: '請分析這份內容，提取最有價值的重點，最多10點，只保留真正重要的資訊。用繁體中文，以JSON格式回覆：{"points":["重點1","重點2",...]}' },
      ];
    } else {
      return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: '此測試版本僅支援 PDF 和圖片' }) };
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

    if (!res.ok) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: `API錯誤 ${res.status}: ${JSON.stringify(data)}` }) };
    }

    const raw = data.content[0].text;
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: '格式錯誤', raw }) };
    }

    const parsed = JSON.parse(match[0]);
    return { statusCode: 200, headers: CORS, body: JSON.stringify({ points: parsed.points || [] }) };

  } catch (err) {
    return { statusCode: 500, headers: CORS, body: JSON.stringify({ error: err.message }) };
  }
};
