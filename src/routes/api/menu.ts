// GET /api/menu — 公開：讀側邊欄選單（主站 index.html 用它渲染側邊欄；編輯模式也先讀這支）。
// menu 資料表是空的（還沒自訂過）→ 回內建預設選單，custom:false。
import { json, DEFAULT_MENU } from "../../lib/site.js";
import type { RouteCtx } from "../../types.js";

export async function onRequestGet({ env }: RouteCtx): Promise<Response> {
  let rows: unknown[] = [];
  try {
    const res = await env.DB.prepare("SELECT kind,label,label_en,url FROM menu ORDER BY pos, id").all();
    rows = res.results || [];
  } catch (e) {
    /* 表未建立 → 預設 */
  }
  return rows.length ? json({ items: rows, custom: true }) : json({ items: DEFAULT_MENU, custom: false });
}
