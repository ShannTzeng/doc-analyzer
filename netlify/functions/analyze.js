const mammoth = require('mammoth');

const ANALYSIS_PROMPT = `請仔細分析這份文件/圖片的內容，提取真正有價值的重點。

規則：
- 只保留真正重要、有實質意義的資訊
- 最多10點，但不用湊滿10點
- 每個重點簡潔清楚，說明核心內容
- 請用繁體中文回覆

請以下列 JSON 格式回覆，不要加其他說明文字：
{"points": ["重點1", "重點2", ...]}`;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { fileData, mimeType, fileName } = JSON.parse(event.body);

    if (!fileData || !mimeType) {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: '缺少必要的檔案資料' }),
      };
    }

    let messageContent = [];

    if (mimeType.startsWith('image/')) {
      const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
      const effectiveMime = supported.includes(mimeType) ? mimeType : 'image/jpeg';
      messageContent = [
        { type: 'image', source: { type: 'base64', media_type: effectiveMime, data: fileData } },
        { type: 'text', text: ANALYSIS_PROMPT },
      ];
    } else if (mimeType === 'application/pdf') {
      messageContent = [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileData } },
        { type: 'text', text: ANALYSIS_PROMPT },
      ];
    } else if (
      mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword' ||
      (fileName && fileName.toLowerCase().endsWith('.docx'))
    ) {
      const buffer = Buffer.from(fileData, 'base64');
      const result = await mammoth.extractRawText({ buffer });
      const text = result.value.trim();

      if (!text) {
        return {
          statusCode: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Word 文件內容為空或無法讀取' }),
        };
      }

      messageContent = [
        {
          type: 'text',
          text: `以下是 Word 文件「${fileName || '文件'}」的內容：\n\n${text}\n\n---\n\n${ANALYSIS_PROMPT}`,
        },
      ];
    } else {
      return {
        statusCode: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `不支援的檔案類型：${mimeType}` }),
      };
    }

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        statusCode: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: '伺服器未設定 API Key' }),
      };
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
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

    if (!response.ok) {
      const errText = await response.text();
      console.error('Anthropic API error:', errText);
      return {
        statusCode: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: `Claude API 錯誤：${response.status}` }),
      };
    }

    const data = await response.json();
    const rawText = data.content[0].text;
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
      return {
        statusCode: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: '分析結果格式錯誤，請重試' }),
      };
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const points = (parsed.points || []).filter((p) => p && p.trim());

    return {
      statusCode: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
    };
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `分析失敗：${error.message}` }),
    };
  }
};
