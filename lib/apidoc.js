// lib/apidoc.js — 全站 API 文件（Markdown 原稿，單一來源）。
// 顯示位置：/api-docs 頁（站長金鑰才看得到，內容經 GET /api/admin/apidoc 取得後前端渲染）。
// ⚠ 新增或修改任何 API 時，記得同步更新這份文件。
// 注意：這個字串刻意完全不用反引號（避免跟 template literal 打架），程式碼區塊用 ~~~ 圍欄。

export const APIDOC = `
本站所有功能都有對應的 HTTP API — 網頁後台能做的事，用程式（curl、排程、Claude）也都能做。

- 正式站：**https://uaip.cc.cd**（等同 https://uaip.pages.dev）
- 本機開發：**http://localhost:8788**（npx wrangler pages dev）
- 所有回應都是 JSON（UTF-8）；時間欄位一律 UTC 的 ISO 8601（例 2026-07-09T03:00:00.000Z），前端顯示時自行轉時區。

## 驗證

| 類型 | 驗證方式 |
|---|---|
| 公開 API | 免驗證，任何人可用 |
| 站長 API（路徑含 /admin 與 /api/logs） | 請求標頭 **Authorization: Bearer 管理金鑰** |

- 管理金鑰＝Cloudflare Pages 環境變數 **LOGS_TOKEN**（跟 /logs、/admin 網頁登入是同一把；目前的值記在專案根目錄 ADMIN.md，不會上網）。
- 換金鑰：printf '新金鑰' | npx wrangler pages secret put LOGS_TOKEN --project-name uaip，跑完要重新部署才生效。
- **本機開發（localhost）免金鑰**，方便測試；正式站沒帶或帶錯一律回 401。

## 公開 API（免金鑰）

| 方法與路徑 | 用途 |
|---|---|
| GET /api/whoami | 訪客自己的連線資訊（IP、UA、地理位置） |
| GET /api/articles | 已發佈文章列表（分頁、可篩分類） |
| GET /api/articles/{id} | 單篇已發佈文章（含 Markdown 原稿） |
| GET /api/menu | 側邊欄選單 |
| GET /api/settings | 網站公開設定（站名） |
| GET /img/{id} | 圖片（D1 讀出、邊緣快取一年） |
| GET /feed | RSS 訂閱源（最新 20 篇） |
| GET /sitemap | 搜尋引擎網址清單 |

### GET /api/whoami

回傳由 Cloudflare 邊緣節點觀測到的請求資訊，欄位：ip、ua、lang、country、city、region、region_code、postal、latitude、longitude、timezone、asn、isp、colo、http、tls。

### GET /api/articles

已發佈文章列表（**草稿一律看不到**；要含草稿用站長版）。

| 參數 | 說明 |
|---|---|
| category | news 或 article；省略＝全部 |
| p | 頁碼，預設 1 |
| per | 每頁筆數 1–50，預設 10 |

回傳 { rows, total, page, per, pages }；rows 每筆含 id、category、title、summary、cover、views、published_at。依發佈時間新到舊排序。用 API 讀**不會**增加瀏覽數（views 只算真人看文章頁）。

### GET /api/articles/{id}

單篇已發佈文章，回 { row }，含 body_md（Markdown 原稿）。加參數 **?html=1** 會多回 body_html（伺服器轉好的 HTML，跟正式文章頁同設定）。找不到或還是草稿 → 404 { "error": "not-found" }。

### GET /api/menu

側邊欄選單，回 { items, custom }。items 是「由上到下」的平面陣列，每項：

| 欄位 | 說明 |
|---|---|
| kind | section（分類標題）或 link（連結） |
| label | 中文名稱 |
| label_en | 英文名稱（空字串＝英文介面也顯示中文） |
| url | 連結網址（section 為空字串） |

custom:false 表示還沒自訂過，回的是內建預設選單。

### GET /api/settings

回 { brand, custom }。brand＝站名（用在分頁標題、og:site_name、JSON-LD、RSS 頻道名）；custom:false 表示用的是內建預設。

## 站長 API（要金鑰）

| 方法與路徑 | 用途 |
|---|---|
| GET /api/admin/articles | 全部文章列表（**含草稿**，依更新時間排序，最多 500 筆） |
| POST /api/admin/articles | 新增文章 |
| GET /api/admin/articles/{id} | 讀單篇（含草稿、含 Markdown 原稿） |
| PUT /api/admin/articles/{id} | 更新文章（**整包覆蓋**，見下） |
| DELETE /api/admin/articles/{id} | 刪除文章（不可復原） |
| POST /api/admin/media | 上傳圖片 |
| PUT /api/admin/menu | 覆蓋側邊欄選單 |
| PUT /api/admin/settings | 改網站設定（站名） |
| GET /api/logs | 訪客紀錄查詢 |
| GET /api/admin/apidoc | 這份文件的 Markdown 原稿（{ md }） |

### 文章的 JSON 欄位（POST / PUT 共用）

| 欄位 | 規則 |
|---|---|
| category | news（新聞）或 article（文章）；預設 news |
| status | draft（草稿）或 published（發佈）；預設 draft |
| title | **必填**，最長 200 字 |
| summary | 最長 500 字 — 列表兩行摘要，也是搜尋結果與分享卡描述 |
| cover | 縮圖網址，最長 300 字（通常是 /img/編號，也可貼外部網址） |
| body_md | 內文 Markdown，最長 200KB（空一行分段、## 小標、**粗體**、[文字](網址)、圖片 ![說明](/img/編號)；設了 breaks 模式：按一次 Enter 就是換行） |

規則：

- **PUT 是整包覆蓋**：先 GET 拿舊資料、改完再整包 PUT；沒帶的欄位會被清空。
- published_at 在**第一次發佈**時寫入，之後再編輯、轉草稿再發佈都不變（列表排序穩定）。
- POST 回 { id, status }；PUT 回 { id, status }；DELETE 回 { ok:true }。

### POST /api/admin/media — 上傳圖片

- 請求本體＝圖片**二進位**（不是表單、不是 base64），Content-Type 要帶 image/webp、image/jpeg、image/png 或 image/gif。
- 大小上限 **1.8MB**（D1 單值限 2MB）。走 API 上傳**不會自動壓縮**，請先自己縮好（建議最寬 1400–1600px、JPEG 品質 85 左右）；網頁後台上傳才有自動壓縮。
- 可選參數 ?w=寬&h=高（記尺寸，後台顯示用）。
- 回 { id, url, bytes, w, h }，url 形如 /img/9 — 填進文章 cover 或內文 ![說明](/img/9)。

**⚠ 圖片編號永遠不能重複使用**：/img/編號 掛一年 immutable 邊緣快取，而 uaip.cc.cd 的快取清除權在 cc.cd 網域主手上、我們清不掉。刪過的編號作廢；換圖＝上傳拿新編號＋更新文章裡的網址。也**不要**重設 media 資料表的流水號。

### PUT /api/admin/menu — 覆蓋側邊欄選單

本體 { "items": [ … ] }，格式同 GET /api/menu 的 items；整份選單照陣列順序覆蓋寫入。

- 每項規則：label 必填最長 60 字；label_en 選填最長 60 字；link 的 url 必填最長 300 字，**必須以 / 或 http:// 或 https:// 開頭**；最多 60 項。
- 傳 **{ "items": [] }（空陣列）＝清掉自訂選單＝還原內建預設**。
- 回 { ok, count, custom }。
- 側邊欄的「站長區」（文章管理、訪客紀錄、API 文件）不在選單資料裡 — 那是登入過的裝置由前端動態長出來的，改不到也不用管。

### PUT /api/admin/settings — 網站設定

本體 { "brand": "新站名" }（最長 60 字）。**brand 傳空字串＝還原內建預設站名**。回 { ok, brand, custom }。改完立即生效（影響分頁標題、og:site_name、JSON-LD、RSS 頻道名；主站首頁的「IP·UA 查詢」標題不受影響）。

### GET /api/logs — 訪客紀錄

| 參數 | 說明 |
|---|---|
| limit | 1–200，預設 50 |
| offset | 分頁位移 |
| q | 模糊搜尋（ip / ua / path / country / city / isp） |
| since | ISO 時間 — 額外回傳該時間之後的瀏覽數與不重複 IP 數（today / todayIps） |

回 { rows, total, today?, todayIps? }。

## 常用範例（Windows cmd 的 curl；金鑰見 ADMIN.md）

**發一篇新聞**（中文內容一定要存成 UTF-8 檔案再用 --data-binary 送，直接寫在指令列會變亂碼）：

~~~
:: 1) 先把文章存成 UTF-8 編碼的 art.json：
::    { "category":"news", "status":"published", "title":"標題",
::      "summary":"一兩句摘要", "cover":"/img/5", "body_md":"內文 **Markdown**" }
:: 2) 送出：
curl -X POST https://uaip.cc.cd/api/admin/articles ^
  -H "Authorization: Bearer 管理金鑰" ^
  -H "content-type: application/json; charset=utf-8" ^
  --data-binary @art.json
~~~

**上傳圖片**（先自己縮到 1.8MB 以下）：

~~~
curl -X POST "https://uaip.cc.cd/api/admin/media?w=1400&h=788" ^
  -H "Authorization: Bearer 管理金鑰" ^
  -H "content-type: image/jpeg" --data-binary @cover.jpg
~~~

**改文章**（先 GET 再整包 PUT）：

~~~
curl https://uaip.cc.cd/api/admin/articles/12 -H "Authorization: Bearer 管理金鑰"
:: 把回傳的 row 改一改、存成 UTF-8 的 art.json（六個欄位都要帶），然後：
curl -X PUT https://uaip.cc.cd/api/admin/articles/12 ^
  -H "Authorization: Bearer 管理金鑰" ^
  -H "content-type: application/json; charset=utf-8" --data-binary @art.json
~~~

**改選單**（先 GET /api/menu 拿現況、改完整包 PUT）：

~~~
curl https://uaip.cc.cd/api/menu > menu.json
:: 編輯 menu.json（保留 items 陣列的格式），然後：
curl -X PUT https://uaip.cc.cd/api/admin/menu ^
  -H "Authorization: Bearer 管理金鑰" ^
  -H "content-type: application/json; charset=utf-8" --data-binary @menu.json
~~~

**改站名**：

~~~
curl -X PUT https://uaip.cc.cd/api/admin/settings ^
  -H "Authorization: Bearer 管理金鑰" ^
  -H "content-type: application/json" --data-binary "{\\"brand\\":\\"新站名\\"}"
~~~

其他提醒：

- 轉貼別站新聞：**用自己的話改寫＋文末附資料來源連結**，不要整篇照抄。
- 這些操作在網頁上也都能做：文章後台 /admin、右上角 ✎ 編輯模式（改選單、改站名）、訪客紀錄 /logs。

## 錯誤回應

出錯時回 { "error": "代碼", "hint": "中文提示（可能沒有）", "detail": "技術細節（可能沒有）" }：

| HTTP 狀態 | 常見 error | 說明 |
|---|---|---|
| 400 | bad-input / bad-id / bad-url / too-many / empty | 參數或本體不合規則（看 hint） |
| 401 | unauthorized | 金鑰沒帶或不對 |
| 404 | not-found | 文章不存在（或公開 API 查到的是草稿） |
| 413 | too-large | 圖片超過 1.8MB |
| 415 | bad-type | 圖片格式不是 webp / jpeg / png / gif |
| 500 | no-db / query-failed / insert-failed / update-failed / delete-failed / save-failed | 伺服器或資料庫問題（看 detail） |
`;
