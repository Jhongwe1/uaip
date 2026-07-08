// PUT /api/admin/settings — 站長專用：改網站設定。本體 { brand: "新站名" }。
// brand 傳空字串（或整個不帶）= 刪掉自訂站名 = 還原成程式內建預設（lib/site.js 的 BRAND）。
// 站名會用在：分頁標題、og:site_name、JSON-LD、RSS 頻道名。
import { authed, json, BRAND } from "../../../lib/site.js";

export async function onRequestPut({ request, env }) {
  const url = new URL(request.url);
  if (!authed(request, env, url)) return json({ error: "unauthorized" }, 401);
  if (!env.DB) return json({ error: "no-db" }, 500);

  let body = null;
  try { body = await request.json(); } catch (e) {}
  if (!body || typeof body !== "object") return json({ error: "bad-input", hint: "需要 JSON 本體" }, 400);
  const brand = String(body.brand == null ? "" : body.brand).trim().slice(0, 60);

  try {
    if (!brand) {
      await env.DB.prepare("DELETE FROM settings WHERE k='brand'").run();
      return json({ ok: true, brand: BRAND, custom: false });
    }
    await env.DB.prepare(
      "INSERT INTO settings (k, v) VALUES ('brand', ?1) ON CONFLICT(k) DO UPDATE SET v=excluded.v"
    ).bind(brand).run();
    return json({ ok: true, brand: brand, custom: true });
  } catch (e) {
    return json({ error: "save-failed", detail: String(e && e.message || e) }, 500);
  }
}
