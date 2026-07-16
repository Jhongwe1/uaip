// GET /news/<編號> — 單篇新聞頁。實作在 src/lib/pages.ts（與 /articles/<編號> 共用）。
import { articlePage } from "../../lib/pages.js";
import type { RouteCtx } from "../../types.js";
export async function onRequestGet(context: RouteCtx): Promise<Response> {
  return articlePage(context, "news");
}
