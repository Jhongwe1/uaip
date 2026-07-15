// GET /vpn/sub/<token> — token 即驗證；矩陣＋多渠道合併去重＋計數。
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { env, fetchMock } from "cloudflare:test";
import { onRequestGet } from "../../functions/vpn/sub/[token].js";
import { makeCtx, drainWaits, seedUser, ORIGIN } from "../helpers.js";

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());

const TOKEN = "uvt" + "a".repeat(20);

function subCtx(token, ua) {
  return makeCtx({
    url: ORIGIN + "/vpn/sub/" + token,
    init: { headers: ua ? { "user-agent": ua } : {} },
    params: { token }
  });
}

async function vpnUser(over) {
  return seedUser(Object.assign({ status: "approved", services: "vpn", vpn_token: TOKEN }, over || {}));
}

async function addChannel(o) {
  await env.DB.prepare(
    "INSERT INTO vpn_channels (name,kind,url,nodes,enabled,created_at) VALUES (?1,?2,?3,?4,?5,?6)"
  )
    .bind(
      o.name || "ch",
      o.kind || "sub",
      o.url || "",
      o.nodes || "",
      o.enabled == null ? 1 : o.enabled,
      new Date().toISOString()
    )
    .run();
}

const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
const unb64 = (s) => decodeURIComponent(escape(atob(s)));

describe("vpn sub token 矩陣", () => {
  it("格式不對 → 404（不打庫）", async () => {
    expect((await onRequestGet(subCtx("bogus"))).status).toBe(404);
    expect((await onRequestGet(subCtx("uvtUPPER"))).status).toBe(404);
  });
  it("查無此 token → 404", async () => {
    expect((await onRequestGet(subCtx(TOKEN))).status).toBe(404);
  });
  it("封鎖 → 403；沒 vpn 服務 → 403", async () => {
    await vpnUser({ status: "blocked" });
    expect((await onRequestGet(subCtx(TOKEN))).status).toBe(403);
  });
  it("有 vpn 服務但管理員沒設任何渠道 → 404", async () => {
    await vpnUser();
    const ctx = subCtx(TOKEN);
    const r = await onRequestGet(ctx);
    expect(r.status).toBe(404);
    expect(await r.text()).toContain("no subscription");
    await drainWaits(ctx);
  });
});

describe("vpn sub 合併規則", () => {
  it("只有手動節點 → base64 清單＋去重", async () => {
    await vpnUser();
    await addChannel({ kind: "nodes", nodes: "vless://aaa\nvmess://bbb\nvless://aaa\n不是節點的行" });
    const ctx = subCtx(TOKEN);
    const r = await onRequestGet(ctx);
    expect(r.status).toBe(200);
    expect(unb64((await r.text()).trim()).split("\n")).toEqual(["vless://aaa", "vmess://bbb"]);
    await drainWaits(ctx);
  });

  it("恰好一個訂閱渠道 → 透傳（UA、流量標頭照傳）", async () => {
    await vpnUser();
    await addChannel({ kind: "sub", url: "https://airport.example.com/sub" });
    let seenUA = null;
    fetchMock
      .get("https://airport.example.com")
      .intercept({
        path: "/sub",
        headers: (h) => {
          for (const k of Object.keys(h)) if (k.toLowerCase() === "user-agent") seenUA = h[k];
          return true;
        }
      })
      .reply(200, "raw-yaml-content:\n- node", {
        headers: { "subscription-userinfo": "upload=1; download=2; total=99", "content-type": "text/yaml" }
      });
    const ctx = subCtx(TOKEN, "clash-verge/1.0");
    const r = await onRequestGet(ctx);
    expect(r.status).toBe(200);
    expect(await r.text()).toBe("raw-yaml-content:\n- node"); // 原樣轉發
    expect(r.headers.get("subscription-userinfo")).toBe("upload=1; download=2; total=99");
    expect(seenUA).toBe("clash-verge/1.0"); // 會員 App 的 UA 透傳
    await drainWaits(ctx);
  });

  it("兩個訂閱渠道 → 解 base64、合併、去重、回 base64", async () => {
    await vpnUser();
    await addChannel({ kind: "sub", url: "https://a1.example.com/sub" });
    await addChannel({ kind: "sub", url: "https://a2.example.com/sub" });
    await addChannel({ kind: "nodes", nodes: "trojan://manual" });
    fetchMock
      .get("https://a1.example.com")
      .intercept({ path: "/sub" })
      .reply(200, b64("vless://n1\nvmess://n2"));
    fetchMock
      .get("https://a2.example.com")
      .intercept({ path: "/sub" })
      .reply(200, b64("vmess://n2\nss://n3"));
    const ctx = subCtx(TOKEN);
    const r = await onRequestGet(ctx);
    expect(r.status).toBe(200);
    expect(unb64((await r.text()).trim()).split("\n")).toEqual([
      "vless://n1",
      "vmess://n2",
      "ss://n3",
      "trojan://manual"
    ]);
    await drainWaits(ctx);
  });

  it("多渠道時解不開的略過；全掛且無手動節點 → 502", async () => {
    await vpnUser();
    await addChannel({ kind: "sub", url: "https://b1.example.com/sub" });
    await addChannel({ kind: "sub", url: "https://b2.example.com/sub" });
    fetchMock.get("https://b1.example.com").intercept({ path: "/sub" }).reply(500, "boom");
    fetchMock.get("https://b2.example.com").intercept({ path: "/sub" }).reply(500, "boom");
    const ctx = subCtx(TOKEN);
    const r = await onRequestGet(ctx);
    await r.text();
    expect(r.status).toBe(502);
    await drainWaits(ctx);
  });

  it("抓一次訂閱 vpn_pulls +1", async () => {
    const u = await vpnUser();
    await addChannel({ kind: "nodes", nodes: "vless://one" });
    const ctx = subCtx(TOKEN);
    await (await onRequestGet(ctx)).text();
    await drainWaits(ctx);
    const row = await env.DB.prepare("SELECT vpn_pulls FROM users WHERE id=?1").bind(u.id).first();
    expect(row.vpn_pulls).toBe(1);
  });
});
