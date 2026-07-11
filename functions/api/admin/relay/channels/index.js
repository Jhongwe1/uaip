// /api/admin/relay/channels — 站長專用：API 中轉站的上游管道管理。
//   GET  列出全部管道（上游金鑰一律遮罩，只回 has_key 與提示）
//   POST 新增管道 { slug, name, kind, base_url, api_key?, enabled? }
// kind：openai（OpenAI 與所有 OpenAI 相容服務，含本地 AI）/ anthropic / gemini / custom。
// custom 與 openai 的差別只在顯示，驗證方式同樣是 Authorization: Bearer。
import { json, SLUG_RE } from "../../../../../lib/site.js";
import { adminOk, keyHint } from "../../../../../lib/auth.js";

export const KINDS = { openai: 1, anthropic: 1, gemini: 1, custom: 1 };

// 欄位整理：回 { ch } 或 { err }。api_key 缺席（undefined）＝「保留舊值」，由呼叫端處理。
export function cleanChannel(b) {
  if (!b || typeof b !== "object") return { err: "需要 JSON 本體" };
  const slug = String(b.slug == null ? "" : b.slug).trim().toLowerCase();
  if (!SLUG_RE.test(slug)) return { err: "slug 只能用小寫英數與連字號（頭尾不能是連字號）" };
  const name = String(b.name == null ? "" : b.name).trim().slice(0, 60);
  if (!name) return { err: "名稱不能是空的" };
  const kind = KINDS[b.kind] ? b.kind : "openai";
  let base = String(b.base_url == null ? "" : b.base_url).trim().replace(/\/+$/, "");
  if (!/^https?:\/\/[^\s]+$/.test(base)) return { err: "base_url 要是 http(s):// 開頭的網址" };
  const ch = {
    slug: slug, name: name, kind: kind, base_url: base.slice(0, 300),
    enabled: b.enabled === false || b.enabled === 0 ? 0 : 1
  };
  if (b.api_key !== undefined) ch.api_key = String(b.api_key == null ? "" : b.api_key).trim().slice(0, 500);
  return { ch: ch };
}

export function maskRow(r) {
  return {
    id: r.id, slug: r.slug, name: r.name, kind: r.kind, base_url: r.base_url,
    enabled: r.enabled, created_at: r.created_at,
    has_key: !!r.api_key, key_hint: r.api_key ? keyHint(r.api_key) : ""
  };
}

export async function onRequestGet({ request, env }) {
  const url = new URL(request.url);
  if (!(await adminOk(request, env, url))) return json({ error: "unauthorized" }, 401);
  if (!env.DB) return json({ error: "no-db" }, 500);
  try {
    const res = await env.DB.prepare("SELECT * FROM relay_channels ORDER BY id").all();
    return json({ rows: (res.results || []).map(maskRow) });
  } catch (e) {
    return json({ error: "query-failed", detail: String(e && e.message || e) }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  const url = new URL(request.url);
  if (!(await adminOk(request, env, url))) return json({ error: "unauthorized" }, 401);
  if (!env.DB) return json({ error: "no-db" }, 500);

  let body = null;
  try { body = await request.json(); } catch (e) {}
  const c = cleanChannel(body);
  if (c.err) return json({ error: "bad-input", hint: c.err }, 400);

  try {
    const r = await env.DB.prepare(
      "INSERT INTO relay_channels (slug,name,kind,base_url,api_key,enabled,created_at) VALUES (?1,?2,?3,?4,?5,?6,?7)"
    ).bind(c.ch.slug, c.ch.name, c.ch.kind, c.ch.base_url, c.ch.api_key || "", c.ch.enabled,
           new Date().toISOString()).run();
    return json({ id: r.meta.last_row_id, slug: c.ch.slug, url: "/relay/" + c.ch.slug });
  } catch (e) {
    const msg = String(e && e.message || e);
    if (msg.indexOf("UNIQUE") >= 0) return json({ error: "slug-taken", hint: "slug「" + c.ch.slug + "」已有管道在用" }, 409);
    return json({ error: "insert-failed", detail: msg }, 500);
  }
}
