// GET /news/<編號> — 單篇新聞頁。實作在 lib/pages.js（與 /articles/<編號> 共用）。
import { articlePage } from "../../lib/pages.js";
export async function onRequestGet(context) { return articlePage(context, "news"); }
