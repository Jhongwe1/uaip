// GET /api/relay/channels — 會員看得到的管道清單（要登入；不含任何金鑰）。
// /relay 頁面用它列出「有哪些入口可以用」。
import { json } from "../../../lib/site.js";
import { getSessionUser, isApproved } from "../../../lib/auth.js";

export async function onRequestGet({ request, env }) {
  const user = await getSessionUser(request, env);
  if (!user) return json({ error: "unauthorized", hint: "請先登入" }, 401);
  if (!env.DB) return json({ error: "no-db" }, 500);
  try {
    const res = await env.DB.prepare(
      "SELECT slug,name,kind FROM relay_channels WHERE enabled=1 ORDER BY id"
    ).all();
    return json({ rows: res.results || [], approved: isApproved(user, env) });
  } catch (e) {
    return json({ error: "query-failed", detail: String(e && e.message || e) }, 500);
  }
}
