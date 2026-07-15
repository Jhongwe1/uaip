// GET /api/logs — 訪客紀錄查詢（管理員專用，給 /logs 管理頁呼叫）。
// 驗證：Authorization: Bearer <LOGS_TOKEN>；LOGS_TOKEN 是 Cloudflare Pages 的加密環境變數
//（用 `npx wrangler pages secret put LOGS_TOKEN --project-name uaip` 設定/更換）。
// 本機開發（localhost 且沒設 LOGS_TOKEN）免驗證，方便測試；正式站一定要過金鑰。
//
// 參數：limit（1–200，預設 50）、offset（分頁）、q（模糊搜尋 ip/ua/path/country/city/isp）、
//       since（ISO 時間，回傳該時間之後的瀏覽數與不重複 IP 數，管理頁拿來算「今日」）。

// 2026-07-11 起：管理員 Google 帳號的登入 cookie 也可以（與金鑰並存），驗證邏輯統一在 lib/auth.js
import { adminOk } from "../../lib/auth.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  const json = (obj, status) =>
    new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });

  if (!(await adminOk(request, env, url))) return json({ error: "unauthorized" }, 401);
  if (!env.DB) return json({ error: "no-db" }, 500);

  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit"), 10) || 50, 1), 200);
  const offset = Math.max(parseInt(url.searchParams.get("offset"), 10) || 0, 0);
  const q = (url.searchParams.get("q") || "").trim();
  const since = (url.searchParams.get("since") || "").trim();

  let where = "",
    binds = [];
  if (q) {
    where =
      " WHERE (ip LIKE ?1 OR ua LIKE ?1 OR path LIKE ?1 OR country LIKE ?1 OR city LIKE ?1 OR isp LIKE ?1)";
    binds.push("%" + q + "%");
  }

  // limit/offset 已驗證為整數，可安全串進 SQL；搜尋字串一律走參數繫結
  const stmts = [
    env.DB.prepare(
      "SELECT * FROM visits" + where + " ORDER BY id DESC LIMIT " + limit + " OFFSET " + offset
    ).bind(...binds),
    env.DB.prepare("SELECT COUNT(*) AS c FROM visits" + where).bind(...binds)
  ];
  if (since) {
    stmts.push(
      env.DB.prepare("SELECT COUNT(*) AS c, COUNT(DISTINCT ip) AS ips FROM visits WHERE ts >= ?").bind(since)
    );
  }

  try {
    const res = await env.DB.batch(stmts);
    const out = { rows: res[0].results, total: res[1].results[0].c };
    if (since) {
      out.today = res[2].results[0].c;
      out.todayIps = res[2].results[0].ips;
    }
    return json(out);
  } catch (e) {
    return json({ error: "query-failed", detail: String((e && e.message) || e) }, 500);
  }
}
