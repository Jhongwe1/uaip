// /api/admin/vpn — 站長專用：VPN 訂閱設定（存 settings 表）。
//   GET 讀目前設定（上游訂閱網址遮罩顯示）
//   PUT 設定 { source_url, node_links }
// source_url：你的上游訂閱網址（機場／自建），會員訂閱時伺服器去抓它再轉發。
// node_links：手動貼的節點連結（一行一條 vmess:// vless:// … ），會附加在訂閱內容後面。
// 兩者可只填一個或都填；都空＝關閉 VPN 訂閱功能。
import { json } from "../../../lib/site.js";
import { adminOk, keyHint } from "../../../lib/auth.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!(await adminOk(request, env, url))) return json({ error: "unauthorized" }, 401);
  if (!env.DB) return json({ error: "no-db" }, 500);
  try {
    const res = await env.DB.batch([
      env.DB.prepare("SELECT v FROM settings WHERE k='vpn_source'"),
      env.DB.prepare("SELECT v FROM settings WHERE k='vpn_nodes'")
    ]);
    const src = ((res[0].results || [])[0] || {}).v || "";
    const nodes = ((res[1].results || [])[0] || {}).v || "";
    return json({
      has_source: !!src,
      source_hint: src ? keyHint(src) : "",
      node_count: nodes ? nodes.split(/\r?\n/).filter(function (s) { return s.trim(); }).length : 0,
      node_links: nodes
    });
  } catch (e) {
    return json({ error: "query-failed", detail: String(e && e.message || e) }, 500);
  }
}

export async function onRequestPut({ request, env }) {
  const url = new URL(request.url);
  if (!(await adminOk(request, env, url))) return json({ error: "unauthorized" }, 401);
  if (!env.DB) return json({ error: "no-db" }, 500);

  let body = null;
  try { body = await request.json(); } catch (e) {}
  if (!body || typeof body !== "object") return json({ error: "bad-input", hint: "需要 JSON 本體" }, 400);

  // source_url 缺席＝不動；空字串＝清掉。node_links 同理。
  const stmts = [];
  if (body.source_url !== undefined) {
    const s = String(body.source_url || "").trim();
    if (s && !/^https?:\/\/[^\s]+$/.test(s)) return json({ error: "bad-url", hint: "訂閱網址要是 http(s):// 開頭" }, 400);
    stmts.push(s
      ? env.DB.prepare("INSERT INTO settings (k,v) VALUES ('vpn_source',?1) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(s.slice(0, 1000))
      : env.DB.prepare("DELETE FROM settings WHERE k='vpn_source'"));
  }
  if (body.node_links !== undefined) {
    const n = String(body.node_links || "").trim();
    stmts.push(n
      ? env.DB.prepare("INSERT INTO settings (k,v) VALUES ('vpn_nodes',?1) ON CONFLICT(k) DO UPDATE SET v=excluded.v").bind(n.slice(0, 20000))
      : env.DB.prepare("DELETE FROM settings WHERE k='vpn_nodes'"));
  }
  if (!stmts.length) return json({ error: "nothing", hint: "沒有要更新的欄位" }, 400);

  try {
    await env.DB.batch(stmts);
    return json({ ok: true });
  } catch (e) {
    return json({ error: "save-failed", detail: String(e && e.message || e) }, 500);
  }
}
