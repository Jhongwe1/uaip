// GET /api/health — 公開健康檢查：{ ok, version, db }。
// db=false 表示 D1 連不上（網站殼還活著、資料功能故障）— 部署後 smoke 測試第一站。
import { json, VERSION } from "../../lib/site.js";
import type { RouteCtx } from "../../types.js";

export async function onRequestGet({ env }: RouteCtx): Promise<Response> {
  let db = false;
  try {
    if (env.DB) {
      await env.DB.prepare("SELECT 1").first();
      db = true;
    }
  } catch (e) {}
  return json({ ok: true, version: VERSION, db: db });
}
