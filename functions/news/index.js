// GET /news — 新聞列表（?p=2 換頁）。實作在 lib/pages.js（與 /articles 共用）。
import { listPage } from "../../lib/pages.js";
export async function onRequestGet(context) { return listPage(context, "news"); }
