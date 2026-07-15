// GET /articles/<編號> — 單篇文章頁。實作在 lib/pages.js（與 /news/<編號> 共用）。
import { articlePage } from "../../lib/pages.js";
export async function onRequestGet(context) {
  return articlePage(context, "article");
}
