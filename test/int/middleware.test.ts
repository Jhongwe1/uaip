// functions/_middleware.js — 訪客紀錄的 shouldLog 判斷矩陣。
// shouldLog 沒對外 export，所以透過 onRequest 驅動：用一顆「記錄型」假 DB 觀測
// 到底有沒有寫入 visits（順便驗 logVisit 的 SQL 綁定不會炸）。
import { describe, it, expect } from "vitest";
import { onRequest } from "../../src/routes/_middleware.js";
import { ORIGIN } from "../helpers.js";

// 假 DB：只認 INSERT INTO visits，記下呼叫次數與**綁定的欄位值**（欄位順序見
// _middleware.ts 的 INSERT：ts, host, path, method, ip, ua, …）；其餘語句照樣回傳 no-op。
function recordingEnv() {
  const state: { inserts: number; binds: unknown[] } = { inserts: 0, binds: [] };
  const stmt = (sql: string) => ({
    bind: (...args: unknown[]) => ({
      run: async () => {
        if (/INSERT INTO visits/i.test(sql)) {
          state.inserts++;
          state.binds = args;
        }
        return { success: true };
      }
    }),
    first: async () => null,
    all: async () => ({ results: [] })
  });
  return { env: { DB: { prepare: stmt } }, state };
}

// 驅動一次請求並等背景寫入跑完；回傳 inserts 次數與寫進 visits 的欄位值。
async function run(path: string, opts: { method?: string; headers?: Record<string, string> } = {}) {
  const { env, state } = recordingEnv();
  const waits: Promise<unknown>[] = [];
  const ctx: any = {
    request: new Request(ORIGIN + path, { method: opts.method || "GET", headers: opts.headers || {} }),
    env,
    waitUntil: (p: Promise<unknown>) => waits.push(Promise.resolve(p)),
    next: async () => new Response("ok")
  };
  const r = await onRequest(ctx);
  await Promise.allSettled(waits);
  return { logged: state.inserts > 0, resp: r, binds: state.binds };
}

// visits 的 INSERT 欄位順序（_middleware.ts logVisit）
const COL = { ts: 0, host: 1, path: 2, method: 3, ip: 4, ua: 5, lang: 12, referer: 13 };

const HTML = { accept: "text/html" };

describe("shouldLog：會記錄的頁面瀏覽", () => {
  it("首頁與工具頁（Accept: text/html）", async () => {
    for (const p of ["/", "/ip", "/ua", "/news", "/articles"]) {
      expect((await run(p, { headers: HTML })).logged).toBe(true);
    }
  });
  it("動態文章頁與自訂頁面（樣式比對，免 Accept）", async () => {
    expect((await run("/news/12")).logged).toBe(true);
    expect((await run("/articles/345")).logged).toBe(true);
    expect((await run("/p/about")).logged).toBe(true);
  });
  it("尾斜線正規化：/news/ 等同 /news", async () => {
    expect((await run("/news/", { headers: HTML })).logged).toBe(true);
  });
});

describe("shouldLog：不記錄的請求", () => {
  it("API／管理頁／圖片／登入／中轉／VPN 抓取一律不記", async () => {
    for (const p of [
      "/api/me",
      "/api/health",
      "/logs",
      "/admin",
      "/img/5",
      "/auth/login",
      "/auth/callback",
      "/relay/openai/v1/models",
      "/vpn/sub/uvtabc"
    ]) {
      expect((await run(p, { headers: HTML })).logged).toBe(false);
    }
  });
  it("非 GET/HEAD（POST/PUT…）不記", async () => {
    expect((await run("/news", { method: "POST", headers: HTML })).logged).toBe(false);
    expect((await run("/", { method: "PUT", headers: HTML })).logged).toBe(false);
  });
  it("HEAD 記（也是頁面瀏覽）", async () => {
    expect((await run("/", { method: "HEAD", headers: HTML })).logged).toBe(true);
  });
  it("預先抓取（sec-purpose: prefetch）不記", async () => {
    expect((await run("/news", { headers: { accept: "text/html", "sec-purpose": "prefetch" } })).logged).toBe(
      false
    );
    expect((await run("/", { headers: { accept: "text/html", purpose: "prefetch" } })).logged).toBe(false);
  });
  it("非頁面路徑且沒帶 text/html Accept（多為靜態資產請求）不記", async () => {
    expect((await run("/assets/account.js", { headers: { accept: "*/*" } })).logged).toBe(false);
    expect((await run("/favicon.ico")).logged).toBe(false);
  });
  it("沒帶 Accept 但打固定頁面路徑（機器人）仍記", async () => {
    expect((await run("/")).logged).toBe(true);
    expect((await run("/ip")).logged).toBe(true);
  });
});

// 隔壁的 ua/lang/referer 都截了長度，只有 path 沒有 —— 而 Cloudflare 接受約 16 KB 的 URL，
// 等於任何人都能往 visits 塞 16 KB 一列。截到 500 跟 referer 同一個數量級。
describe("visits 欄位長度上限", () => {
  it("path 超長截斷到 500 字（含 query string）", async () => {
    const long = "/news?q=" + "a".repeat(20000);
    const { logged, binds } = await run(long, { headers: HTML });
    expect(logged).toBe(true);
    expect(String(binds[COL.path]).length).toBe(500);
    expect(String(binds[COL.path]).startsWith("/news?q=aaa")).toBe(true);
  });
  it("一般長度的 path 原樣寫入（含 query string）", async () => {
    const { binds } = await run("/news?q=1", { headers: HTML });
    expect(binds[COL.path]).toBe("/news?q=1");
  });
  it("ua / lang / referer 維持既有上限（700 / 200 / 500）", async () => {
    const { binds } = await run("/news", {
      headers: {
        accept: "text/html",
        "user-agent": "u".repeat(2000),
        "accept-language": "l".repeat(2000),
        referer: "https://example.com/" + "r".repeat(2000)
      }
    });
    expect(String(binds[COL.ua]).length).toBe(700);
    expect(String(binds[COL.lang]).length).toBe(200);
    expect(String(binds[COL.referer]).length).toBe(500);
  });
});

describe("中介層永不影響網站本體", () => {
  it("一律 return next() 的回應", async () => {
    const { resp } = await run("/news", { headers: HTML });
    expect(await resp.text()).toBe("ok");
  });
  it("沒有 env.DB 也不炸、照樣放行", async () => {
    const waits: Promise<unknown>[] = [];
    const ctx: any = {
      request: new Request(ORIGIN + "/news", { headers: HTML }),
      env: {},
      waitUntil: (p: Promise<unknown>) => waits.push(Promise.resolve(p)),
      next: async () => new Response("ok")
    };
    const r = await onRequest(ctx);
    expect(await r.text()).toBe("ok");
  });
});
