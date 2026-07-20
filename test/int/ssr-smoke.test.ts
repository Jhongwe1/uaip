// 所有 SSR 頁面的冒煙測試：狀態碼、CSP nonce（走 html() 出口）、noindex 標記。
// 遷移到 Workers 後這些頁要一字不差地照常出，這層網先立在遷移之前。
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { onRequestGet as newsList } from "../../src/routes/news/index.js";
import { onRequestGet as articlesList } from "../../src/routes/articles/index.js";
import { onRequestGet as newsItem } from "../../src/routes/news/[id].js";
import { onRequestGet as customPage } from "../../src/routes/p/[slug].js";
import { onRequestGet as adminPage } from "../../src/routes/admin.js";
import { onRequestGet as logsPage } from "../../src/routes/logs.js";
import { onRequestGet as membersPage } from "../../src/routes/members.js";
import { onRequestGet as settingsPage } from "../../src/routes/settings.js";
import { onRequest as relayRoute } from "../../src/routes/relay/[[path]].js";
import { onRequestGet as playgroundPage } from "../../src/routes/playground.js";
import { makeCtx, seedAdmin, ORIGIN } from "../helpers.js";
import { createSession } from "../../src/lib/auth.js";

async function adminHeaders() {
  const adm = await seedAdmin();
  const s = await createSession(env, adm, new URL(ORIGIN + "/"));
  return { cookie: "ipua_sess=" + s.sid };
}

/**
 * 頁面內嵌 <script> 的語法檢查（2026-07-21 加）。
 *
 * 為什麼需要：這些頁的前端 JS 是寫在 .ts 的**樣板字串**裡的，反斜線會先被樣板字串吃掉
 * 一層 —— 正則要寫 \\s、\\/ 才是 JS 看到的 \s、\/。少跳一次就是語法錯誤，
 * 而語法錯誤會讓「整包腳本」都不執行：頁面永遠停在轉圈圈的 loading 態，
 * HTTP 200、CSP nonce 正確、TypeScript 過、Prettier 過、其他測試全綠 —— 完全看不出來。
 * 2026-07-21 就是這樣把 /playground 推上正式站的（showErr 裡的網址正則）。
 *
 * new Function 只做**解析**、不執行，所以拿不到 window/document 也無所謂 —— 這裡要抓的
 * 就是「解析階段」的錯。抓不到邏輯錯誤，但那本來就是別的測試的事。
 */
function expectScriptsParse(html: string, where: string) {
  const re = /<script((?:\s[^>]*)?)>([\s\S]*?)<\/script>/g;
  let m: RegExpExecArray | null,
    n = 0;
  while ((m = re.exec(html))) {
    const attrs = m[1],
      code = m[2];
    if (!code.trim()) continue; // 外部 src 或空殼
    // type 不是 JS 的別碰：JSON-LD（application/ld+json）拿去 new Function 一定炸
    const t = attrs.match(/type\s*=\s*"([^"]*)"/);
    if (t && !/^(module|text\/javascript|application\/javascript)$/i.test(t[1].trim())) continue;
    n++;
    try {
      new Function(code);
    } catch (e: any) {
      throw new Error(where + " 的第 " + n + " 個 inline script 語法錯誤：" + ((e && e.message) || e));
    }
  }
  return n;
}

// 共用斷言：200＋text/html＋CSP nonce＋內嵌 JS 解析得過
async function expectPage(r: Response, where = "頁面") {
  expect(r.status).toBe(200);
  expect(r.headers.get("content-type")).toContain("text/html");
  expect(r.headers.get("content-security-policy")).toContain("nonce-");
  const text = await r.text();
  // 蓋到 nonce 的 script 一定帶本回應的 nonce（外殼至少一顆）
  const nonce = r.headers.get("content-security-policy")!.match(/'nonce-([^']+)'/)![1];
  expect(text).toContain('nonce="' + nonce + '"');
  expectScriptsParse(text, where);
  return text;
}

describe("公開內容頁", () => {
  it("/news 列表：200＋nonce＋帶 canonical", async () => {
    const text = await expectPage(await newsList(makeCtx({ url: ORIGIN + "/news" })));
    expect(text).toContain('rel="canonical"');
    expect(text).toContain("https://uaip.cc.cd/news"); // 用 SITE_ORIGIN
  });
  it("/articles 列表：200＋nonce", async () => {
    await expectPage(await articlesList(makeCtx({ url: ORIGIN + "/articles" })));
  });
  it("空資料庫的列表頁顯示 empty，不掛掉", async () => {
    const text = await expectPage(await articlesList(makeCtx({ url: ORIGIN + "/articles" })));
    expect(text).toContain("empty.list");
  });
  it("/news/<id> 存在的文章：200＋og:title＋JSON-LD", async () => {
    const now = new Date().toISOString();
    const ins = await env.DB.prepare(
      "INSERT INTO articles (category,title,summary,cover,body_md,status,views,created_at,updated_at,published_at) " +
        "VALUES ('news','冒煙標題','摘要','','內文','published',0,?1,?1,?1)"
    )
      .bind(now)
      .run();
    const id = ins.meta.last_row_id;
    const text = await expectPage(
      await newsItem(makeCtx({ url: ORIGIN + "/news/" + id, params: { id: String(id) } }))
    );
    expect(text).toContain("冒煙標題");
    expect(text).toContain('property="og:title"');
    expect(text).toContain("application/ld+json");
  });
  it("/news/<id> 不存在：404＋noindex", async () => {
    const r = await newsItem(makeCtx({ url: ORIGIN + "/news/999999", params: { id: "999999" } }));
    expect(r.status).toBe(404);
    expect(await r.text()).toContain("noindex");
  });
  it("/p/<slug> 不存在：404＋noindex", async () => {
    const r = await customPage(makeCtx({ url: ORIGIN + "/p/nope", params: { slug: "nope" } }));
    expect(r.status).toBe(404);
    expect(await r.text()).toContain("noindex");
  });
  it("/p/<slug> 已發佈：200＋內容", async () => {
    const now = new Date().toISOString();
    await env.DB.prepare(
      "INSERT INTO pages (slug,title,summary,body_md,status,created_at,updated_at) " +
        "VALUES ('smoke','冒煙頁','','頁面內文','published',?1,?1)"
    )
      .bind(now)
      .run();
    const text = await expectPage(
      await customPage(makeCtx({ url: ORIGIN + "/p/smoke", params: { slug: "smoke" } }))
    );
    expect(text).toContain("冒煙頁");
  });
});

describe("管理員／會員頁（noindex）", () => {
  it("/admin：200＋noindex＋nonce", async () => {
    const text = await expectPage(
      await adminPage(makeCtx({ url: ORIGIN + "/admin", init: { headers: await adminHeaders() } }))
    );
    expect(text).toContain("noindex");
  });
  it("/logs：200＋noindex", async () => {
    const text = await expectPage(
      await logsPage(makeCtx({ url: ORIGIN + "/logs", init: { headers: await adminHeaders() } }))
    );
    expect(text).toContain("noindex");
  });
  it("/members：200＋noindex", async () => {
    const text = await expectPage(
      await membersPage(makeCtx({ url: ORIGIN + "/members", init: { headers: await adminHeaders() } }))
    );
    expect(text).toContain("noindex");
  });
  it("/settings：200＋noindex（2026-07-17 管理員設定頁）", async () => {
    const text = await expectPage(
      await settingsPage(makeCtx({ url: ORIGIN + "/settings", init: { headers: await adminHeaders() } }))
    );
    expect(text).toContain("noindex");
    expect(text).toContain("管理員設定");
  });
  it("/relay：匿名也 200（catch-all 零段落＝操作頁，頁內自帶登入閘門）＋nonce", async () => {
    await expectPage(await relayRoute(makeCtx({ url: ORIGIN + "/relay", params: { path: [] } })), "/relay");
  });
  it("/playground：匿名也 200＋nonce", async () => {
    await expectPage(await playgroundPage(makeCtx({ url: ORIGIN + "/playground" })), "/playground");
  });
});
