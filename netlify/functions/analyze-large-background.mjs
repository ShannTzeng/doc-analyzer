import { getStore } from '@netlify/blobs';

const ANALYSIS_PROMPT = `你是教育課程分析專家。請仔細分析這份文件（可能包含學生回饋單、學習單、繪圖、課程記錄等），完成下列任務，並以指定 JSON 格式（繁體中文）回覆。

共同規則：
- 條列重點要簡潔、具體、有實質意義，每組最多 8 點，不用湊數。
- 去識別化：若出現學生姓名，務必去識別化，例如「王小明」顯示為「王○○」或以「學生A」代稱，切勿呈現完整姓名。
- 學習單可能是「注音版」，國字旁邊會有注音符號（ㄅㄆㄇ）。請忽略注音、只讀國字與學生填答內容。
- 學生的開放式填答（例如「我覺得這堂課我自己做得很不錯的地方是…？」「記下這堂課最棒的回憶」等手寫內容）是重要的質性素材，請優先引用這些學生原話（去識別化後）來佐證分析。

【任務 1：逐份記錄每位學生的作答 —— 這是最重要的任務】
⚠️ 絕對不要做任何統計、清點、加總或平均。你唯一的工作是「**一份一份**」把每位學生的作答如實記錄下來，系統會自動完成所有統計。

請為**每一份學習單各產生一筆 responses 紀錄**，依檔案順序排列。每筆包含：
- file：第幾份檔案（從 1 起算）
- grade：該生年級（讀學習單上的「我的年級」，例如「三年級」；讀不到填 ""）
- like：「我喜歡這堂課嗎？」的作答，必須正好是下列其中一個詞：
  超級喜歡 / 喜歡 / 還好 / 不太喜歡 / 未作答
- understand：「我聽懂多少呢？」的作答，必須正好是下列其中一個詞：
  全部聽懂 / 大部分聽懂 / 聽懂一點點 / 幾乎沒聽懂 / 未作答
- competencies：六大亮能各自的作答，key 固定用 覺察力、表達力、驅動力、合作力、探索力、實踐力，
  值必須正好是下列其中一個詞：很像我 / 有點像我 / 不太像我 / 很不像我 / 我不確定 / 未作答

作業方式（請務必遵守）：
1. 一次只專注看「一份」學習單，把該份的所有答案記錄完再看下一份。
2. responses 的筆數**必須正好等於學習單的份數**，一份一筆，不可合併、不可遺漏、不可重複。
3. 不確定時請據實填「未作答」，不要猜測，也不要為了湊數而填。

★ 判讀規則：心情溫度計（「我喜歡這堂課嗎？」）
這一題**不是圈選題，而是請學生把溫度計「塗一塗」**。溫度計由下往上分成四段，依序是：
不太喜歡（最低）→ 還好 → 喜歡 → 超級喜歡（最高）。

⚠️ 重要前提：**學生不一定會從最底部開始塗**，很多人只塗中間的某一段。請勿假設塗色一定是從底部填滿上來。

判讀方式：**一律只看「塗色區域的最上緣」落在哪一段**，該段就是答案。塗色從哪裡開始、總共塗多長，都不影響判讀。
- 只塗「喜歡～超級喜歡」這段 → 最上緣在超級喜歡 → 判為「超級喜歡」
- 只塗「還好～喜歡」這段 → 最上緣在喜歡 → 判為「喜歡」
- 只塗「不太喜歡～還好」這段 → 最上緣若**明確碰到或進入「還好」** → 判為「還好」；
  若最上緣仍停在「不太喜歡」範圍內、沒有明確碰到「還好」 → 判為「不太喜歡」

邊界原則（請嚴格遵守）：最上緣必須**明確進入或碰到**某一段才算該段；
若最上緣恰好介於兩段之間、難以確定，一律採**較低**的那一段（保守判讀）。
完全沒有塗色 → 計入「未作答」。

★ 判讀規則：其他選項題
學生可能用圈選、打勾、塗色或其他明顯記號作答，任何清楚的記號都算有效作答。
若記號橫跨兩個選項，以「記號涵蓋較多、或最高」的那個選項為準。

【任務 2：三個對象的條列重點】
針對下列三個對象分別整理條列重點。每一點都是一個物件 {"text": 重點內容, "page": 頁碼, "file": 第幾份檔案}：
- text：重點內容（簡潔、去識別化）。
- page：該重點主要依據的頁碼（純數字，該檔案中的頁數）。若無法對應特定頁碼，填 null。
- file：該重點來自第幾份檔案（從 1 起算）。文件可能有多份（標記為【第N份檔案】），請正確標出；只有一份檔案時一律填 1。
對象說明：
- foundation（給基金會）：全面評估本課程的執行成效，涵蓋課程設計、學生參與度、學習成果、亮點與可改進處。
- school（給學校）：聚焦學生在這堂課的成長與改變。
- instructor（給講師）：呈現學生在課堂上的收穫、以及對講師課程設計與執行的影響。若有負面回饋（如覺得無聊、無趣），只擷取「有建設性、可供改進」的內容（例如希望課程如何調整），不要單純抱怨。

【任務 3：六大亮能統計（competencies）】
name 必須完全使用這六個名稱之一：覺察力、表達力、驅動力、合作力、探索力、實踐力。
⚠️ 注意：學習單上的標籤可能省略「力」字，只印出「覺察／表達／驅動／合作／探索／實踐」，也可能寫成「覺察力」等完整名稱。無論學習單上怎麼印，回傳的 name 一律使用上面六個「完整名稱」（含「力」字）。

⚠️ **這裡不要做任何統計**。各亮能的人數、平均、樣本數，系統會依任務 1 的逐份紀錄自動計算。
你在這裡只需要提供每項亮能的**文字說明**。

- 每個亮能回傳：name 與 evidence（一句話描述學生在該亮能的具體表現，可引用學習單原話，需去識別化）。
- 六個亮能都要列出。
- 亮能自評題是「圈起最接近的那張臉」；圈選記號若橫跨兩張臉，以被圈涵蓋較多的那張為準（此規則用於任務 1 的逐份判讀）。

若為舊版回饋單（沒有亮能自評題），則只列出「有達成」的亮能並提供 evidence。

六大亮能定義：
- 覺察力：敏銳感受自我與環境變化（自我覺知、環境意識、美感素養）
- 表達力：將內在想法、情緒或創意轉化為溝通、創作或行動（符號運用與溝通表達、透過創作表達）
- 驅動力：建立穩定的內在支持，由內而外推動學習的內在動機
- 合作力：理解他人、建立關係，合作共學共創（人際關係與團隊合作、多元文化理解）
- 探索力：對未知保持好奇，主動發現選項、勇於提問與嘗試（系統思考解決問題、創新應變）
- 實踐力：將所學付諸實踐，轉化為生活中真實的行動與選擇（規劃執行、道德實踐與公民意識）

【任務 4：代表性插圖】
找出學生繪圖或填答最精彩、最具代表性的頁面，每項為 {"file": 第幾份檔案, "page": 該檔案中的頁碼}（兩者皆從 1 起算），最多 3 項。文件可能有多份（標記為【第N份檔案】），請正確標出 file。只有一份檔案時 file 一律填 1。若無插圖或無法判斷，回傳空陣列。

【任務 5：課程對象】
從回饋單或文件內容判斷這堂課的參與年級／對象，例如「一～六年級」「三、四年級」「五年級」。填入 audience（字串）。若無法判斷，填空字串 ""。

只回覆以下 JSON，不要加任何其他文字（responses 必須每份學習單一筆）：
{"responses": [{"file":1,"grade":"三年級","like":"超級喜歡","understand":"大部分聽懂","competencies":{"覺察力":"很像我","表達力":"有點像我","驅動力":"很像我","合作力":"我不確定","探索力":"很像我","實踐力":"有點像我"}}], "audience": "一～六年級", "foundation": [{"text":"...","page":3,"file":1}], "school": [{"text":"...","page":null,"file":1}], "instructor": [{"text":"...","page":5,"file":2}], "competencies": [{"name":"覺察力","evidence":"..."}], "illustrations": [{"file":1,"page":5}]}`;

const VALID_COMPETENCIES = ['覺察力', '表達力', '驅動力', '合作力', '探索力', '實踐力'];

// 選項對應分數。由程式換算，避免模型心算出錯
const LIKE_MAP = { '超級喜歡': 4, '喜歡': 3, '還好': 2, '不太喜歡': 1 };
const UNDERSTAND_MAP = { '全部聽懂': 4, '大部分聽懂': 3, '聽懂一點點': 2, '幾乎沒聽懂': 1 };
const COMP_MAP = { '很像我': 4, '有點像我': 3, '不太像我': 2, '很不像我': 1 };

const toCount = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};

// 依「各選項人數」精確計算平均；n 為有效樣本數（不含我不確定／未作答）
function statsFromCounts(counts, map) {
  if (!counts || typeof counts !== 'object') return { score: null, n: 0, answered: 0 };
  let sum = 0, n = 0;
  for (const [option, value] of Object.entries(map)) {
    const c = toCount(counts[option]);
    sum += value * c;
    n += c;
  }
  return { score: n ? Math.round((sum / n) * 10) / 10 : null, n, answered: n };
}

// 清點總人數（含未作答與我不確定），用來和 studentCount 對帳
function totalCounted(counts, map, extraKeys) {
  if (!counts || typeof counts !== 'object') return 0;
  let t = 0;
  Object.keys(map).forEach((k) => { t += toCount(counts[k]); });
  (extraKeys || []).forEach((k) => { t += toCount(counts[k]); });
  return t;
}


// 整理「逐份紀錄」：每份學習單一筆，欄位正規化
function cleanResponses(arr) {
  if (!Array.isArray(arr)) return [];
  const str = (v) => (typeof v === 'string' ? v.trim() : '');
  return arr.map((r, i) => {
    const comps = {};
    if (r && r.competencies && typeof r.competencies === 'object') {
      Object.entries(r.competencies).forEach(([k, v]) => {
        const name = normalizeCompetencyName(k);
        if (name && str(v)) comps[name] = str(v);
      });
    }
    return {
      file: Number.isInteger(r && r.file) && r.file > 0 ? r.file : i + 1,
      grade: str(r && r.grade),
      like: str(r && r.like),
      understand: str(r && r.understand),
      competencies: comps,
    };
  });
}

// 由逐份紀錄統計各選項人數。Claude 只負責逐份判讀，統計一律由程式完成
function tallyResponses(responses) {
  const like = {}, understand = {}, comp = {};
  const bump = (obj, key) => { if (key) obj[key] = (obj[key] || 0) + 1; };
  responses.forEach((r) => {
    bump(like, r.like);
    bump(understand, r.understand);
    Object.entries(r.competencies || {}).forEach(([name, val]) => {
      comp[name] = comp[name] || {};
      bump(comp[name], val);
    });
  });
  return { like, understand, comp };
}

// 學習單上可能只印「覺察」不印「覺察力」，統一正規化成完整名稱
function normalizeCompetencyName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.trim();
  if (VALID_COMPETENCIES.includes(name)) return name;
  const withForce = name + '力';
  if (VALID_COMPETENCIES.includes(withForce)) return withForce;
  return null;
}


function normalizeResult(parsed) {
  const num = (v) => (typeof v === 'number' && isFinite(v) ? Math.round(v * 10) / 10 : null);
  const pageRe = /[（(][^（()）]*(?:頁|页|page|p\.?)[^（()）]*\d[^（()）]*[)）]\s*$/i;
  const cleanItems = (arr) => (Array.isArray(arr) ? arr.map((it) => {
    let text, page, file = 1;
    if (typeof it === 'string') { text = it.trim(); page = null; }
    else if (it && typeof it.text === 'string') {
      text = it.text.trim();
      page = it.page;
      if (typeof page === 'number') page = Number.isFinite(page) ? page : null;
      else if (typeof page === 'string') page = page.trim() || null;
      else page = null;
      if (Number.isInteger(it.file) && it.file > 0) file = it.file;
    } else return null;
    // 若頁碼被寫進文字（如「…（頁50）」），抽出來並從文字移除
    const trailing = text.match(pageRe);
    if (trailing) {
      if (page == null) { const d = trailing[0].match(/\d+/); if (d) page = Number(d[0]); }
      text = text.replace(pageRe, '').trim();
    }
    return { text, page, file };
  }).filter((x) => x && x.text) : []);

  // 逐份紀錄是統計的唯一依據；舊格式（模型自報 counts）仍保留為後備
  const responses = cleanResponses(parsed.responses);
  const tallied = responses.length ? tallyResponses(responses) : null;
  const studentCount = responses.length || toCount(parsed.studentCount) || null;

  const likeSrc = tallied ? tallied.like : parsed.like;
  const understandSrc = tallied ? tallied.understand : parsed.understand;

  // 六大亮能：統計一律來自逐份紀錄，evidence 取自模型的文字說明
  const evidenceByName = {};
  if (Array.isArray(parsed.competencies)) {
    parsed.competencies.forEach((c) => {
      const name = normalizeCompetencyName(c && c.name);
      if (name) evidenceByName[name] = typeof c.evidence === 'string' ? c.evidence.trim() : '';
    });
  }

  let competencies;
  if (tallied) {
    competencies = VALID_COMPETENCIES
      .filter((name) => tallied.comp[name])
      .map((name) => {
        const counts = tallied.comp[name];
        const { score, n } = statsFromCounts(counts, COMP_MAP);
        return {
          name,
          evidence: evidenceByName[name] || '',
          avg: score,
          n,
          excluded: toCount(counts['我不確定']),
          counts,
          mismatch: false,   // 由逐份紀錄統計，份數不可能對不上
        };
      });
  } else {
    competencies = Array.isArray(parsed.competencies)
      ? parsed.competencies
          .map((c) => (c ? { ...c, name: normalizeCompetencyName(c.name) } : null))
          .filter((c) => c && c.name)
          .map((c) => {
            const counts = c.counts && typeof c.counts === 'object' ? c.counts : null;
            const { score, n } = statsFromCounts(counts, COMP_MAP);
            const counted = totalCounted(counts, COMP_MAP, ['我不確定', '未作答']);
            return {
              name: c.name,
              evidence: typeof c.evidence === 'string' ? c.evidence.trim() : '',
              avg: score != null ? score : (typeof c.avg === 'number' && isFinite(c.avg) ? Math.round(c.avg * 10) / 10 : null),
              n: score != null ? n : (Number.isInteger(c.n) ? c.n : null),
              excluded: counts ? toCount(counts['我不確定']) : (Number.isInteger(c.excluded) ? c.excluded : null),
              counts: counts || null,
              mismatch: !!(counts && studentCount && counted !== studentCount),
            };
          })
      : [];
  }

  const likeStats = statsFromCounts(likeSrc, LIKE_MAP);
  const understandStats = statsFromCounts(understandSrc, UNDERSTAND_MAP);
  const likeCounted = totalCounted(likeSrc, LIKE_MAP, ['未作答']);
  const understandCounted = totalCounted(understandSrc, UNDERSTAND_MAP, ['未作答']);

  return {
    responses,
    studentCount,
    likeScore: likeStats.score != null ? likeStats.score : num(parsed.likeScore),
    likeScale: likeStats.score != null ? 4 : (num(parsed.likeScale) || 5),
    likeCounts: likeSrc && typeof likeSrc === 'object' ? likeSrc : null,
    likeMismatch: !tallied && !!(studentCount && likeCounted && likeCounted !== studentCount),
    understandScore: understandStats.score != null ? understandStats.score : num(parsed.understandScore),
    understandScale: understandStats.score != null ? 4 : (num(parsed.understandScale) || 5),
    understandCounts: understandSrc && typeof understandSrc === 'object' ? understandSrc : null,
    understandMismatch: !tallied && !!(studentCount && understandCounted && understandCounted !== studentCount),
    audience: typeof parsed.audience === 'string' ? parsed.audience.trim() : '',
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
    driveUrls = driveUrls.map((u) => (u || '').trim()).filter(Boolean).slice(0, 10);

    // 上傳的檔案：因背景 function 請求上限僅 256KB，檔案由 stage-upload 先存入 Blobs，這裡再取出
    let uploadFiles = Array.isArray(body.files) ? body.files.slice(0, 10) : [];
    if (!uploadFiles.length && body.staged) {
      try {
        const staging = getStore('upload-staging');
        const staged = await staging.get(jobId, { type: 'json' });
        if (staged && Array.isArray(staged.files)) uploadFiles = staged.files.slice(0, 10);
      } catch (e) {
        console.error('讀取暫存檔案失敗:', e.message);
      }
      if (!uploadFiles.length) {
        await store.setJSON(jobId, { status: 'error', error: '找不到暫存的檔案，請重新上傳' });
        return new Response('ok');
      }
    }

    if (!apiKey) {
      await store.setJSON(jobId, { status: 'error', error: '未設定 API Key' });
      return new Response('ok');
    }
    if (!driveUrls.length && !uploadFiles.length) {
      await store.setJSON(jobId, { status: 'error', error: '未提供任何檔案或 Google Drive 連結' });
      return new Response('ok');
    }

    await store.setJSON(jobId, { status: 'processing' });

    const messageContent = [];

    // 上傳模式：檔案內容已隨請求送達，直接組成訊息
    if (uploadFiles.length) {
      const multi = uploadFiles.length > 1;
      for (let i = 0; i < uploadFiles.length; i++) {
        const f = uploadFiles[i] || {};
        const mime = f.mimeType || 'application/pdf';
        const name = f.fileName || 'document';
        if (multi) messageContent.push({ type: 'text', text: `【第${i + 1}份檔案】` });

        if (mime.startsWith('image/')) {
          const supported = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
          const m = supported.includes(mime) ? mime : 'image/jpeg';
          messageContent.push({ type: 'image', source: { type: 'base64', media_type: m, data: f.fileData } });
        } else if (
          mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
          mime === 'application/msword' ||
          name.toLowerCase().endsWith('.docx')
        ) {
          const mammoth = (await import('mammoth')).default;
          const result = await mammoth.extractRawText({ buffer: Buffer.from(f.fileData, 'base64') });
          const text = (result.value || '').trim();
          if (!text) {
            await store.setJSON(jobId, { status: 'error', error: `「${name}」內容為空或無法讀取` });
            return new Response('ok');
          }
          messageContent.push({ type: 'text', text: `以下是 Word 文件內容：\n\n${text}` });
        } else {
          messageContent.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: f.fileData } });
        }
      }
      messageContent.push({ type: 'text', text: ANALYSIS_PROMPT });
    }

    // 雲端連結模式：逐一下載每份檔案，組成同一則 Claude 訊息（合併分析）
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

    // 上傳模式已在上方附加指令，這裡只處理雲端連結模式
    if (driveUrls.length) messageContent.push({ type: 'text', text: ANALYSIS_PROMPT });

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 8192,
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

    // 分析完成，清掉暫存的檔案內容
    if (body.staged) {
      try { await getStore('upload-staging').delete(jobId); } catch (_) {}
    }

  } catch (err) {
    console.error('Background handler error:', err);
    if (jobId) {
      try { await store.setJSON(jobId, { status: 'error', error: err.message }); } catch (_) {}
    }
  }

  return new Response('ok');
};
