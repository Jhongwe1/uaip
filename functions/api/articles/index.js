// GET /api/articles — 公開：已發佈文章列表（草稿一律看不到；要含草稿請用站長版 /api/admin/articles）。
// 參數：category=news|article（省略＝全部）、p=頁碼（預設 1）、per=每頁筆數（1–50，預設 10）。
// 回傳：{ rows:[{id,category,title,summary,cover,views,published_at}], total, page, per, pages }
import { json } from "../../../lib/site.js";

export async function onRequestGet({ request, env }) {
  if (!env.DB) return json({ error: "no-db" }, 500);
  const url = new URL(request.url);

  const cat = url.searchParams.get("category");
  const catOk = cat === "news" || cat === "article" ? cat : null;
  let p = parseInt(url.searchParams.get("p"), 10);
  if (!p || p < 1 || p > 100000) p = 1;
  let per = parseInt(url.searchParams.get("per"), 10);
  if (!per || per < 1) per = 10;
  if (per > 50) per = 50;

  const where = "WHERE status='published'" + (catOk ? " AND category=?1" : "");
  const binds = catOk ? [catOk] : [];
  try {
    const res = await env.DB.batch([
      env.DB.prepare(
        "SELECT id,category,title,summary,cover,views,published_at FROM articles " +
          where +
          " ORDER BY published_at DESC, id DESC LIMIT " +
          per +
          " OFFSET " +
          (p - 1) * per
      ).bind(...binds),
      env.DB.prepare("SELECT COUNT(*) AS c FROM articles " + where).bind(...binds)
    ]);
    const total = (res[1].results[0] || {}).c || 0;
    return json({
      rows: res[0].results || [],
      total: total,
      page: p,
      per: per,
      pages: Math.max(1, Math.ceil(total / per))
    });
  } catch (e) {
    return json({ error: "query-failed", detail: String((e && e.message) || e) }, 500);
  }
}
