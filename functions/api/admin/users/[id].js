// /api/admin/users/<編號> — 站長專用：管理單一會員。
//   PUT    { action: "approve" | "block" | "unblock" | "make_admin" | "drop_admin" }
//   DELETE 刪除帳號（連同其 session）
// 護欄：站長不能封鎖／降級／刪除「自己」，也不能動到「環境變數指定的站長信箱」帳號
//       （那些是設定裡的老大，只能改設定，不能在網頁上互鎖）。
import { json } from "../../../../lib/site.js";
import { adminOk, getSessionUser, adminEmails } from "../../../../lib/auth.js";

const ACTIONS = {
  approve:    { status: "approved" },
  block:      { status: "blocked" },
  unblock:    { status: "approved" },
  make_admin: { is_admin: 1, status: "approved" },
  drop_admin: { is_admin: 0 }
};

function idOf(params) {
  const id = parseInt(params.id, 10);
  return id > 0 ? id : null;
}

// 這個帳號是不是「設定檔裡欽定的站長」（環境變數 ADMIN_EMAILS）—— 網頁上不能動他
function isRootAdmin(row, env) {
  return adminEmails(env).indexOf(String(row.email || "").toLowerCase()) >= 0;
}

export async function onRequestPut({ request, env, params }) {
  const url = new URL(request.url);
  if (!(await adminOk(request, env, url))) return json({ error: "unauthorized" }, 401);
  const id = idOf(params);
  if (!id || !env.DB) return json({ error: "bad-id" }, 400);

  let body = null;
  try { body = await request.json(); } catch (e) {}
  const act = body && ACTIONS[body.action];
  if (!act) return json({ error: "bad-action", hint: "action 要是 approve/block/unblock/make_admin/drop_admin" }, 400);

  const me = await getSessionUser(request, env);   // 金鑰身分時為 null（金鑰＝超級站長，不受自我保護限制）
  const target = await env.DB.prepare("SELECT * FROM users WHERE id=?1").bind(id).first();
  if (!target) return json({ error: "not-found" }, 404);

  const demoting = body.action === "block" || body.action === "drop_admin";
  if (demoting && isRootAdmin(target, env)) {
    return json({ error: "protected", hint: "這是設定檔指定的站長帳號，請改 ADMIN_EMAILS 環境變數" }, 403);
  }
  if (me && me.id === target.id && demoting) {
    return json({ error: "self", hint: "不能封鎖或降級自己" }, 400);
  }

  const sets = [], binds = [];
  if (act.status !== undefined) { sets.push("status=?" + (binds.length + 1)); binds.push(act.status); }
  if (act.is_admin !== undefined) { sets.push("is_admin=?" + (binds.length + 1)); binds.push(act.is_admin); }
  binds.push(id);
  try {
    await env.DB.prepare("UPDATE users SET " + sets.join(",") + " WHERE id=?" + binds.length).bind(...binds).run();
    if (body.action === "block") {
      await env.DB.prepare("DELETE FROM sessions WHERE user_id=?1").bind(id).run();   // 封鎖＝踢下線
    }
    return json({ ok: true });
  } catch (e) {
    return json({ error: "save-failed", detail: String(e && e.message || e) }, 500);
  }
}

export async function onRequestDelete({ request, env, params }) {
  const url = new URL(request.url);
  if (!(await adminOk(request, env, url))) return json({ error: "unauthorized" }, 401);
  const id = idOf(params);
  if (!id || !env.DB) return json({ error: "bad-id" }, 400);

  const me = await getSessionUser(request, env);
  const target = await env.DB.prepare("SELECT * FROM users WHERE id=?1").bind(id).first();
  if (!target) return json({ error: "not-found" }, 404);
  if (isRootAdmin(target, env)) return json({ error: "protected", hint: "設定檔指定的站長帳號不能在此刪除" }, 403);
  if (me && me.id === target.id) return json({ error: "self", hint: "不能刪除自己" }, 400);

  try {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM sessions WHERE user_id=?1").bind(id),
      env.DB.prepare("DELETE FROM users WHERE id=?1").bind(id)
    ]);
    return json({ ok: true });
  } catch (e) {
    return json({ error: "delete-failed", detail: String(e && e.message || e) }, 500);
  }
}
