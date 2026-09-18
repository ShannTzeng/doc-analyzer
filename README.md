# 文件內容分析系統

上傳 PDF / Word / 圖片，或貼上 Google Drive 連結（最多 6 份合併分析），由 Claude AI 自動萃取課程重點，並產出三份報告（基金會 / 學校 / 講師）。

## 功能
- 單檔上傳（PDF、Word .docx、JPG、PNG，上限約 4MB）
- Google Drive 連結，可一次分析多份檔案（最多 6 份，合併為「同一課程」分析）
- 學生姓名自動去識別化
- 回饋分數（喜歡程度、理解程度）自動計算平均
- 六大亮能達成評估（含對應圖片）
- 三份獨立報告：基金會 / 學校 / 講師，項目可勾選
- 代表性插圖自動擷取、附入報告
- 報告可列印 / 另存為 PDF

## 架構
- 前端：`index.html`（靜態網頁）
- 後端：Netlify Functions（`netlify/functions/`）
  - `analyze.js`：單檔上傳分析
  - `analyze-large-background.mjs`：Google Drive 多檔背景分析
  - `job-status.mjs`：查詢背景分析進度
  - `drive-file.mjs`：串流代理，供前端渲染 Drive 檔案頁面
- AI：Anthropic Claude API

## 部署步驟（Netlify）
1. 將此資料夾推上 GitHub。
2. 在 Netlify「Add new project → Import an existing project」匯入此 repo。
3. 設定環境變數：
   - Key：`ANTHROPIC_API_KEY`
   - Value：你的 Anthropic API Key（至 console.anthropic.com 取得，需先儲值）
4. 部署完成後即可使用。

## 注意事項
- 需要有效的 Anthropic API 額度（預付制，用完即停，不會自動扣款）。
- 預設網址為公開狀態，正式給多人使用前建議加上存取保護（共用通行碼或 Google 網域登入）。
- Claude 單次分析合計約 32MB / 100 頁上限，超過會回報錯誤。
