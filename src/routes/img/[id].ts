// GET /img/<編號> — 從 D1 的 media 表讀出圖片回傳。
// 圖片內容永不改變（改圖＝上傳新編號），所以標成 immutable 並寫進 Cloudflare 邊緣快取：
// 同一節點的重複請求直接從快取回，不會一直打資料庫。
import type { RouteCtx } from "../../types.js";

export async function onRequestGet(context: RouteCtx): Promise<Response> {
  const { request, env, params } = context;
  const id = parseInt(String(params.id), 10);
  if (!(id > 0)) return new Response("Not found", { status: 404 });

  const cache = caches.default;
  try {
    const hit = await cache.match(request);
    if (hit) return hit;
  } catch (e) {}

  let row: { mime?: string; data?: ArrayBuffer | ArrayLike<number> } | null = null;
  try {
    row = await env.DB.prepare("SELECT mime, data FROM media WHERE id=?1")
      .bind(id)
      .first<{ mime?: string; data?: ArrayBuffer | ArrayLike<number> }>();
  } catch (e) {}
  if (!row || !row.data) return new Response("Not found", { status: 404 });

  // D1 的 BLOB 正常回 ArrayBuffer；保險起見也接受位元組陣列
  const body = row.data instanceof ArrayBuffer ? row.data : new Uint8Array(row.data).buffer;
  const resp = new Response(body, {
    headers: {
      "content-type": String(row.mime || "application/octet-stream"),
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff"
    }
  });
  try {
    context.waitUntil(cache.put(request, resp.clone()));
  } catch (e) {}
  return resp;
}
