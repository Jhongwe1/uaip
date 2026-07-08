// GET /api/settings — 公開：讀網站公開設定（目前只有站名 brand）。
// 沒自訂過（settings 表沒 brand 鍵）→ 回程式內建預設，custom:false。
import { json, BRAND } from "../../lib/site.js";

export async function onRequestGet({ env }) {
  let brand = BRAND, custom = false;
  try {
    const r = await env.DB.prepare("SELECT v FROM settings WHERE k='brand'").first();
    if (r && r.v) { brand = r.v; custom = true; }
  } catch (e) { /* 表未建立 → 預設 */ }
  return json({ brand: brand, custom: custom });
}
