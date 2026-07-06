// GET /sitemap — 給搜尋引擎的全站網址清單（public/robots.txt 裡有指路）。
// 固定頁面＋所有已發佈的文章；lastmod 用文章的最後更新時間。
import { CANON, CATS } from "../lib/site.js";

export async function onRequestGet({ env }) {
  let rows = [];
  try {
    const res = await env.DB.prepare(
      "SELECT id,category,updated_at FROM articles WHERE status='published' " +
      "ORDER BY published_at DESC, id DESC LIMIT 5000"
    ).all();
    rows = res.results || [];
  } catch (e) {}

  const urls = [];
  ["/", "/ip", "/ua", "/news", "/articles"].forEach(function (p) {
    urls.push("  <url><loc>" + CANON + p + "</loc></url>");
  });
  rows.forEach(function (r) {
    const cat = CATS[r.category] || CATS.news;
    const lastmod = (r.updated_at || "").slice(0, 10);
    urls.push("  <url><loc>" + CANON + cat.path + "/" + r.id + "</loc>" +
      (lastmod ? "<lastmod>" + lastmod + "</lastmod>" : "") + "</url>");
  });

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    urls.join("\n") + "\n</urlset>\n";

  return new Response(xml, {
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=600"
    }
  });
}
