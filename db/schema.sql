-- 訪客紀錄資料表：functions/_middleware.js 每次頁面瀏覽寫入一列。
-- 套用方式（可重複執行，IF NOT EXISTS 不會蓋掉既有資料）：
--   本機測試庫：npx wrangler d1 execute ipua-logs --local  --file db/schema.sql
--   正式庫　　：npx wrangler d1 execute ipua-logs --remote --file db/schema.sql
CREATE TABLE IF NOT EXISTS visits (
  id      INTEGER PRIMARY KEY AUTOINCREMENT,
  ts      TEXT NOT NULL,   -- UTC ISO 時間（顯示時由管理頁轉成本地時間）
  host    TEXT,            -- uaip.cc.cd 或 uaip.pages.dev
  path    TEXT,
  method  TEXT,
  ip      TEXT,
  ua      TEXT,
  country TEXT,
  city    TEXT,
  region  TEXT,
  colo    TEXT,            -- 訪客連到的 Cloudflare 節點（例：TPE）
  asn     INTEGER,
  isp     TEXT,
  lang    TEXT,            -- Accept-Language 標頭
  referer TEXT,
  http    TEXT,            -- HTTP 協定版本
  tls     TEXT             -- TLS 版本
);
CREATE INDEX IF NOT EXISTS idx_visits_ts ON visits (ts);
CREATE INDEX IF NOT EXISTS idx_visits_ip ON visits (ip);

-- 文章（新聞／文章共用一張表，category 區分）：/admin 後台寫入，/news、/articles 讀出。
CREATE TABLE IF NOT EXISTS articles (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  category     TEXT NOT NULL DEFAULT 'news',   -- 'news'（新聞）或 'article'（文章）
  title        TEXT NOT NULL,
  summary      TEXT NOT NULL DEFAULT '',       -- 列表顯示的兩行摘要，也是 SEO 描述
  cover        TEXT NOT NULL DEFAULT '',       -- 縮圖網址（通常是 /img/編號，也可貼外部網址）
  body_md      TEXT NOT NULL DEFAULT '',       -- 內文（Markdown 原稿；顯示時由伺服器轉 HTML）
  status       TEXT NOT NULL DEFAULT 'draft',  -- 'draft'（草稿）或 'published'（已發佈）
  views        INTEGER NOT NULL DEFAULT 0,     -- 瀏覽數（文章頁每次真人瀏覽 +1）
  created_at   TEXT NOT NULL,                  -- UTC ISO
  updated_at   TEXT NOT NULL,
  published_at TEXT                            -- 第一次發佈的時間（列表排序、RSS 用；再編輯不變）
);
CREATE INDEX IF NOT EXISTS idx_articles_list ON articles (status, category, published_at DESC);

-- 圖片（縮圖與文中配圖）：後台上傳前先在瀏覽器壓縮，存進 D1，由 /img/編號 讀出並快取。
CREATE TABLE IF NOT EXISTS media (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  mime       TEXT NOT NULL,        -- image/webp、image/jpeg…
  bytes      INTEGER NOT NULL,     -- 檔案大小（上限約 1.8MB，D1 單值限制 2MB）
  w          INTEGER, h INTEGER,   -- 像素尺寸（後台顯示用）
  data       BLOB NOT NULL,
  created_at TEXT NOT NULL
);
