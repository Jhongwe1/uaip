// GET /api/pages — 公開：已發佈自訂頁面列表（草稿看不到；要含草稿用管理員版 /api/admin/pages）。
// 回傳：{ rows:[{slug,title,summary,updated_at}] }；每頁的公開網址是 /p/<slug>。
import { json } from "../../../lib/site.js";
import type { RouteCtx } from "../../../types.js";

export async function onRequestGet({ env }: RouteCtx): Promise<Response> {
  if (!env.DB) return json({ error: "no-db" }, 500);
  try {
    const res = await env.DB.prepare(
      "SELECT slug,title,summary,updated_at FROM pages WHERE status='published' ORDER BY slug LIMIT 500"
    ).all();
    return json({ rows: res.results || [] });
  } catch (e: any) {
    return json({ error: "query-failed", detail: String((e && e.message) || e) }, 500);
  }
}
