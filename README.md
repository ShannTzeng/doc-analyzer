# 學生學習單分析系統

上傳學生學習單掃描檔，由 Claude 逐份判讀，產出三份報告（基金會 / 學校 / 講師）。

支援兩種學習單版本，上傳前需先選擇：

| 版本 | 題型 |
|---|---|
| **心創力計畫**（目前版本） | 心情溫度計（4 級）＋ 聽懂程度 ＋ 六大亮能學生自評 |
| **超能力解鎖計畫**（舊版） | 心情溫度計（5 級）＋ 課後了解程度 ＋ 下次還想再聽 |

---

## 部署步驟

### 必要條件

1. **Anthropic API 金鑰**，且該 Console 組織**有額度**
   - Max / Ultra / Team 方案含每月 API credits，在 Console → Billing 可看到
   - 金鑰必須建在「看得到額度的那個組織」底下，否則會扣到別的地方
2. **Netlify 帳號**

### ⚠️ 必須用 Git 連結部署，不能用拖曳上傳

本專案的 Netlify Functions 依賴 `mammoth` 與 `@netlify/blobs`，
需要在建置時執行 `npm install` 才會打包進去。

**拖曳整個資料夾到 Netlify 不會執行建置指令，Functions 會壞掉。**

### 步驟

1. 把這個資料夾推上 GitHub（新建一個 repo 即可）

   ```bash
   git init
   git add -A
   git commit -m "init"
   git branch -M main
   git remote add origin <你的 repo 網址>
   git push -u origin main
   ```

2. Netlify → **Add new project → Import an existing project** → 選剛才的 repo

3. 建置設定**保持預設即可**（`netlify.toml` 已經寫好）：
   - Build command：`npm install`
   - Publish directory：`.`
   - Functions directory：`netlify/functions`

4. 設定環境變數
   - **Site configuration → Environment variables → Add a variable**
   - Key：`ANTHROPIC_API_KEY`
   - Value：Anthropic API 金鑰
   - 勾選 **Secret**
   - Scopes 全選（**Functions 一定要勾**，否則後端讀不到）
   - Deploy contexts：若只能選「Different values for each context」，**每個欄位都貼同一把金鑰**

5. **Deploys → Trigger deploy → Deploy site**
   （環境變數改動不會自動重新部署）

### 驗證

部署完成後上傳一份學習單測試，並確認兩件事：

1. 清點說明沒有出現「判讀失敗」警示
2. Anthropic Console → **Usage** 有出現這筆用量（確認扣的是正確的組織）

---

## 常見問題

| 畫面訊息 | 原因 | 處理 |
|---|---|---|
| `API錯誤 401` | 金鑰無效、貼到多餘空白，或某個 deploy context 沒貼到 | 重新設定環境變數後重新部署 |
| `credit balance is too low` | 金鑰建在沒有額度的 Console 組織 | 請管理員在有 credits 的組織重新建立金鑰 |
| `所有 N 份都無法送出分析` | 同上兩者之一，訊息會附原始錯誤 | 依附帶的錯誤訊息處理 |
| 卡在「正在逐份判讀（x / N 份）」很久 | 新 Console 組織速率限制低（Tier 1），系統會自動退避重試 | 整班 30 人約需 5～8 分鐘屬正常；用量累積後會提速 |
| 找不到暫存的檔案 | 上傳中斷 | 重新上傳 |

---

## 使用限制

| 項目 | 上限 |
|---|---|
| 單次頁數 | **70 頁**（約 35 位學生，一人 2 頁） |
| 單次檔案份數 | 10 份（整班掃成一份時用不到） |
| 原始檔案大小 | **無上限**——前端會把每頁重新渲染成 1568px 影像後才上傳 |
| Google 雲端連結分頁 | 20MB；此分頁為舊架構，量化準確度較低，建議改用「上傳檔案」 |

### 成本

每次分析約：

- 7 份學習單 ≈ NT$8
- 30 份學習單 ≈ NT$25

---

## 架構

- **前端**：`index.html`（單一靜態檔，已內嵌 logo 與六大亮能圖片）
  - 用 PDF.js 把每頁渲染成 1568px 影像（Claude 的影像上限，再高也會被縮掉）
  - 以版型指紋自動把「整班一份」的 PDF 切分成每位學生一份，可人工調整
  - 另外裁切「心情溫度計」高解析放大圖，提升判讀準確度
  - 分批上傳，避開 Netlify 單次請求大小限制

- **後端**：Netlify Functions
  | 檔案 | 用途 |
  |---|---|
  | `stage-upload.mjs` | 接收分批上傳的頁面影像，暫存到 Netlify Blobs |
  | `analyze-large-background.mjs` | 逐份呼叫 Claude 判讀，再以純文字呼叫合併成報告重點 |
  | `job-status.mjs` | 前端輪詢分析進度 |
  | `drive-file.mjs` | Google Drive 檔案串流代理 |
  | `analyze.js` | 舊版單次分析，目前前端已不使用（保留以免既有連結失效） |

- **統計**：所有人數清點、平均、正向比例**一律由程式計算**，不交給模型做算術。
  模型只負責逐份判讀，結果會顯示在「逐份判讀結果」表格中，可人工修正，修正後統計即時重算。

---

## 注意事項

- 網站預設為公開網址，正式給多人使用前建議加上存取保護（Netlify 的 Password protection 或 Google 網域登入）。
- 學生姓名會自動去識別化（顯示為「王○○」）。
- 報告產出前請務必檢查「逐份判讀結果」表格，AI 判讀仍可能出錯，表格修正後數字會立即更新。
