// session 生命週期：建立→取回→過期→登出。核心安全性質：庫內只存 sid 的 SHA-256。
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { createSession, getSessionUser, deleteSession, sha256hex } from "../../lib/auth.js";
import { seedUser, ORIGIN } from "../helpers.js";

const URL_ = new URL(ORIGIN + "/");
const reqWith = (sid) => new Request(ORIGIN + "/api/me", {
  headers: sid ? { cookie: "ipua_sess=" + sid } : {}
});

describe("session 生命週期", () => {
  it("createSession → getSessionUser 往返", async () => {
    const u = await seedUser({ status: "approved" });
    const sess = await createSession(env, u, URL_);
    expect(sess.sid).toMatch(/^[a-z2-7]{32}$/);
    expect(sess.cookies.some((c) => c.startsWith("ipua_sess=") && c.includes("HttpOnly"))).toBe(true);
    const back = await getSessionUser(reqWith(sess.sid), env);
    expect(back).toBeTruthy();
    expect(back.id).toBe(u.id);
    expect(back.email).toBe(u.email);
  });

  it("資料庫裡沒有明文 sid — 存的是 SHA-256", async () => {
    const u = await seedUser();
    const sess = await createSession(env, u, URL_);
    const plain = await env.DB.prepare("SELECT sid FROM sessions WHERE sid=?1").bind(sess.sid).first();
    expect(plain).toBeNull();
    const hashed = await env.DB.prepare("SELECT sid FROM sessions WHERE sid=?1")
      .bind(await sha256hex(sess.sid)).first();
    expect(hashed).toBeTruthy();
  });

  it("過期 session 取不回", async () => {
    const u = await seedUser();
    const sid = "b".repeat(32);
    await env.DB.prepare(
      "INSERT INTO sessions (sid,user_id,created_at,expires_at) VALUES (?1,?2,?3,?4)"
    ).bind(await sha256hex(sid), u.id, "2026-01-01T00:00:00Z", "2026-01-02T00:00:00Z").run();
    expect(await getSessionUser(reqWith(sid), env)).toBeNull();
  });

  it("createSession 順手清掉過期列", async () => {
    const u = await seedUser();
    await env.DB.prepare(
      "INSERT INTO sessions (sid,user_id,created_at,expires_at) VALUES ('deadhash',?1,'2026-01-01T00:00:00Z','2026-01-02T00:00:00Z')"
    ).bind(u.id).run();
    await createSession(env, u, URL_);
    const dead = await env.DB.prepare("SELECT sid FROM sessions WHERE sid='deadhash'").first();
    expect(dead).toBeNull();
  });

  it("cookie 值格式不對直接短路（不打資料庫）", async () => {
    expect(await getSessionUser(reqWith("UPPER!!!"), env)).toBeNull();
    expect(await getSessionUser(reqWith(""), env)).toBeNull();
    expect(await getSessionUser(reqWith(null), env)).toBeNull();
  });

  it("deleteSession 之後同一 cookie 失效", async () => {
    const u = await seedUser();
    const sess = await createSession(env, u, URL_);
    await deleteSession(reqWith(sess.sid), env);
    expect(await getSessionUser(reqWith(sess.sid), env)).toBeNull();
  });

  it("撤銷全部：刪掉 user 的所有 session 列 → 每把 cookie 都失效", async () => {
    const u = await seedUser();
    const s1 = await createSession(env, u, URL_);
    const s2 = await createSession(env, u, URL_);
    await env.DB.prepare("DELETE FROM sessions WHERE user_id=?1").bind(u.id).run();
    expect(await getSessionUser(reqWith(s1.sid), env)).toBeNull();
    expect(await getSessionUser(reqWith(s2.sid), env)).toBeNull();
  });
});
