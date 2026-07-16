// GET /news — 新聞列表（?p=2 換頁）。實作在 src/lib/pages.ts（與 /articles 共用）。
import { listPage } from "../../lib/pages.js";
import type { RouteCtx } from "../../types.js";
export async function onRequestGet(context: RouteCtx): Promise<Response> {
  return listPage(context, "news");
}
