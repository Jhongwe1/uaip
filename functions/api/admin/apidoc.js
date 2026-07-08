// GET /api/admin/apidoc — 站長專用：回傳 API 文件的 Markdown 原稿 { md }。
// /api-docs 頁面用金鑰打這支拿內容再渲染 — 所以文件「只有站長看得到」；
// Claude 之後要查 API 用法，也可以直接讀專案裡的 lib/apidoc.js。
import { authed, json } from "../../../lib/site.js";
import { APIDOC } from "../../../lib/apidoc.js";

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!authed(request, env, url)) return json({ error: "unauthorized" }, 401);
  return json({ md: APIDOC });
}
