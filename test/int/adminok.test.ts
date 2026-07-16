// adminOk（管理員驗證，兩種身分都收）矩陣：
// Bearer 對/錯/缺 × LOGS_TOKEN 有/無、管理員 cookie、跨站 Origin 拒斥。
import { describe, it, expect } from "vitest";
import { env } from "cloudflare:test";
import { adminOk, createSession } from "../../src/lib/auth.js";
import { seedUser, seedAdmin, envWith, ORIGIN } from "../helpers.js";

const URL_ = new URL(ORIGIN + "/api/admin/x");
const req = (headers?: Record<string, string>) =>
  new Request(ORIGIN + "/api/admin/x", { headers: headers || {} });

describe("adminOk × LOGS_TOKEN 已設定", () => {
  const e = () => envWith({ LOGS_TOKEN: "sekret-token" });

  it("Bearer 正確 → 放行", async () => {
    expect(await adminOk(req({ authorization: "Bearer sekret-token" }), e(), URL_)).toBe(true);
  });
  it("Bearer 錯誤／缺 → 沒 session 就擋", async () => {
    expect(await adminOk(req({ authorization: "Bearer wrong" }), e(), URL_)).toBe(false);
    expect(await adminOk(req(), e(), URL_)).toBe(false);
  });
  it("管理員 cookie → 放行；一般會員 cookie → 擋", async () => {
    const adm = await seedAdmin();
    const sa = await createSession(env, adm, URL_);
    expect(await adminOk(req({ cookie: "ipua_sess=" + sa.sid }), e(), URL_)).toBe(true);

    const mem = await seedUser({ status: "approved" });
    const sm = await createSession(env, mem, URL_);
    expect(await adminOk(req({ cookie: "ipua_sess=" + sm.sid }), e(), URL_)).toBe(false);
  });
  it("管理員 cookie＋跨站 Origin → 擋（CSRF）", async () => {
    const adm = await seedAdmin();
    const sa = await createSession(env, adm, URL_);
    expect(await adminOk(req({ cookie: "ipua_sess=" + sa.sid, origin: "https://evil.com" }), e(), URL_)).toBe(
      false
    );
  });
});

describe("adminOk × LOGS_TOKEN 未設定", () => {
  it("localhost 免驗放行（本機開發）", async () => {
    const local = new URL("http://localhost:8788/api/admin/x");
    expect(await adminOk(new Request(local), envWith({}), local)).toBe(true);
  });
  it("正式站沒 token 沒 session → 擋", async () => {
    expect(await adminOk(req(), envWith({}), URL_)).toBe(false);
  });
  it("正式站沒 token 但管理員 cookie 還是能用", async () => {
    const adm = await seedAdmin();
    const sa = await createSession(env, adm, URL_);
    expect(await adminOk(req({ cookie: "ipua_sess=" + sa.sid }), envWith({}), URL_)).toBe(true);
  });
});
