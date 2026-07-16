// GET /articles — 文章列表（?p=2 換頁）。實作在 src/lib/pages.ts（與 /news 共用）。
import { listPage } from "../../lib/pages.js";
import type { RouteCtx } from "../../types.js";
export async function onRequestGet(context: RouteCtx): Promise<Response> {
  return listPage(context, "article");
}
