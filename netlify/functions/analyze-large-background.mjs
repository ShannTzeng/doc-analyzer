import { getStore } from '@netlify/blobs';

const ANALYSIS_PROMPT = `你是教育課程分析專家。請仔細分析這份文件（可能包含學生回饋單、學習單、繪圖、課程記錄等），完成下列任務，並以指定 JSON 格式（繁體中文）回覆。

共同規則：
- 條列重點要簡潔、具體、有實質意義，每組最多 8 點，不用湊數。
- 去識別化：若出現學生姓名，務必去識別化，例如「王小明」顯示為「王○○」或以「學生A」代稱，切勿呈現完整姓名。

【任務 1：回饋分數】
- 找出回饋單中「我喜歡這堂課嗎？」這類題目的所有學生評分，計算平均填入 likeScore，並指出滿分 likeScale（例如 5）。
- 找出「課後我對這個主題的了解有幾分呢？」這類題目的評分，計算平均填入 understandScore，滿分填 understandScale。
- 若文件中找不到對應題目，對應的分數欄位填 null。

【任務 2：三個對象的條列重點】
針對下列三個對象分別整理條列重點。每一點都是一個物件 {"text": 重點內容, "page": 頁碼}：
- text：重點內容（簡潔、去識別化）。
- page：該重點主要依據的原始文件頁碼（純數字）。若無法對應特定頁碼，填 null。
對象說明：
- foundation（給基金會）：全面評估本課程的執行成效，涵蓋課程設計、學生參與度、學習成果、亮點與可改進處。
- school（給學校）：聚焦學生在這堂課的成長與改變。
- instructor（給講師）：呈現學生在課堂上的收穫、以及對講師課程設計與執行的影響。若有負面回饋（如覺得無聊、無趣），只擷取「有建設性、可供改進」的內容（例如希望課程如何調整），不要單純抱怨。

【任務 3：六大亮能達成評估（competencies）】
判斷本課程達成了下列哪幾項亮能，只列出「有達成」的。name 必須完全使用這六個名稱之一：覺察力、表達力、驅動力、合作力、探索力、實踐力。每項附一句 evidence 說明本課程如何展現該亮能。
六大亮能定義：
- 覺察力：敏銳感受自我與環境變化（自我覺知、環境意識、美感素養）
- 表達力：將內在想法、情緒或創意轉化為溝通、創作或行動（符號運用與溝通表達、透過創作表達）
- 驅動力：建立穩定的內在支持，由內而外推動學習的內在動機
- 合作力：理解他人、建立關係，合作共學共創（人際關係與團隊合作、多元文化理解）
- 探索力：對未知保持好奇，主動發現選項、勇於提問與嘗試（系統思考解決問題、創新應變）
- 實踐力：將所學付諸實踐，轉化為生活中真實的行動與選擇（規劃執行、道德實踐與公民意識）

【任務 4：代表性插圖】
找出學生繪圖或填答最精彩、最具代表性的頁面，每項為 {"file": 第幾份檔案, "page": 該檔案中的頁碼}（兩者皆從 1 起算），最多 3 項。文件可能有多份（標記為【第N份檔案】），請正確標出 file。只有一份檔案時 file 一律填 1。若無插圖或無法判斷，回傳空陣列。

只回覆以下 JSON，不要加任何其他文字：
{"likeScore": 數字或null, "likeScale": 數字, "understandScore": 數字或null, "understandScale": 數字, "foundation": [{"text":"...","page":3}], "school": [{"text":"...","page":null}], "instructor": [{"text":"...","page":5}], "competencies": [{"name":"覺察力","evidence":"..."}], "illustrations": [{"file":1,"page":5}]}`;

const VALID_COMPETENCIES = ['覺察力', '表達力', '驅動力', '合作力', '探索力', '實踐力'];

function normalizeResult(parsed) {
  const num = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : null);
  const pageRe = /[（(][^（()）]*(?:頁|页|page|p\.?)[^（()）]*\d[^（()）]*[)）]\s*$/i;
  const cleanItems = (arr) => (Array.isArray(arr) ? arr.map((it) => {
    let text, page;
    if (typeof it === 'string') { text = it.trim(); page = null; }
    else if (it && typeof it.text === 'string') {
      text = it.text.trim();
      page = it.page;
      if (typeof page === 'number') page = Number.isFinite(page) ? page : null;
      else if (typeof page === 'string') page = page.trim() || null;
      else page = null;
    } else return null;
    const trailing = text.match(pageRe);
    if (trailing) {
      if (page == null) { const d = trailing[0].match(/\d+/); if (d) page = Number(d[0]); }
      text = text.replace(pageRe, '').trim();
    }
    return { text, page };
  }).filter((x) => x && x.text) : []);
  const competencies = Array.isArray(parsed.competencies)
    ? parsed.competencies
        .filter((c) => c && VALID_COMPETENCIES.includes(c.name))
        .map((c) => ({ name: c.name, evidence: typeof c.evidence === 'string' ? c.evidence.trim() : '' }))
    : [];
  return {
    likeScore: num(parsed.likeScore),
    likeScale: num(parsed.likeScale) || 5,
    understandScore: num(parsed.understandScore),
    understandScale: num(parsed.understandScale) || 5,
    foundation: cleanItems(parsed.foundation),
    school: cleanItems(parsed.school),
    instructor: cleanItems(parsed.instructor),
    competencies,
    illustrations: normalizeIllustrations(parsed),
  };
}

function normalizeIllustrations(parsed) {
  if (Array.isArray(parsed.illustrations)) {
    return parsed.illustrations
      .map((o) => ({
        file: Number.isInteger(o && o.file) && o.file > 0 ? o.file : 1,
        page: Number.isInteger(o && o.page) && o.page > 0 ? o.page : null,
      }))
      .filter((o) => o.page != null)
      .slice(0, 3);
  }
  if (Array.isArray(parsed.illustrationPages)) {
    return parsed.illustrationPages
      .filter((n) => Number.isInteger(n) && n > 0)
      .slice(0, 3)
      .map((p) => ({ file: 1, page: p }));
  }
  return [];
}

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
    const apiKey = process.env.ANTHROPIC_API_KEY;

    // 支援多份連結（driveUrls），並向後相容單一 driveUrl
    let driveUrls = Array.isArray(body.driveUrls) ? body.driveUrls : [];
    if (!driveUrls.length && body.driveUrl) driveUrls = [body.driveUrl];
    driveUrls = driveUrls.map((u) => (u || '').trim()).filter(Boolean).slice(0, 6);

    if (!apiKey) {
      await store.setJSON(jobId, { status: 'error', error: '未設定 API Key' });
      return new Response('ok');
    }
    if (!driveUrls.length) {
      await store.setJSON(jobId, { status: 'error', error: '未提供任何 Google Drive 連結' });
      return new Response('ok');
    }

    await store.setJSON(jobId, { status: 'processing' });

    // 逐一下載每份檔案，組成同一則 Claude 訊息（合併分析）
    const messageContent = [];
    for (let i = 0; i < driveUrls.length; i++) {
      const fileId = extractDriveId(driveUrls[i]);
      if (!fileId) {
        await store.setJSON(jobId, { status: 'error', error: `第 ${i + 1} 個連結無法解析，請確認格式` });
        return new Response('ok');
      }

      const downloadUrl = `https://drive.google.com/uc?export=download&id=${fileId}&confirm=t`;
      const driveRes = await fetch(downloadUrl, { redirect: 'follow' });
      if (!driveRes.ok) {
        await store.setJSON(jobId, { status: 'error', error: `第 ${i + 1} 個檔案下載失敗：HTTP ${driveRes.status}` });
        return new Response('ok');
      }

      const contentType = driveRes.headers.get('content-type') || '';
      if (contentType.includes('text/html')) {
        await store.setJSON(jobId, { status: 'error', error: `第 ${i + 1} 個檔案無法存取，請確認分享設定為「知道連結的人都可以檢視」` });
        return new Response('ok');
      }

      const buffer = Buffer.from(await driveRes.arrayBuffer());
      const base64 = buffer.toString('base64');
      const mimeType = contentType.split(';')[0].trim() || 'application/pdf';

      // 檔案標籤，讓 Claude 能正確標出插圖屬於第幾份
      messageContent.push({ type: 'text', text: `【第${i + 1}份檔案】` });
      if (mimeType.startsWith('image/')) {
        const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
        const m = supported.includes(mimeType) ? mimeType : 'image/jpeg';
        messageContent.push({ type: 'image', source: { type: 'base64', media_type: m, data: base64 } });
      } else {
        messageContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } });
      }
    }

    messageContent.push({ type: 'text', text: ANALYSIS_PROMPT });

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 3072,
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
    const result = normalizeResult(parsed);
    await store.setJSON(jobId, { status: 'done', ...result });

  } catch (err) {
    console.error('Background handler error:', err);
    if (jobId) {
      try { await store.setJSON(jobId, { status: 'error', error: err.message }); } catch (_) {}
    }
  }

  return new Response('ok');
};
