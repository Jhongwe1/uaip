// /relay/<slug>/<path> 轉發引擎 — 安全邊界與直通保真。
// 上游用 cloudflare:test 的 fetchMock 攔截：能斷言「上游實際收到什麼」，
// 特別是會員身分標頭有沒有被剝乾淨、金鑰有沒有換成站長的上游金鑰。
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { env, fetchMock } from "cloudflare:test";
import { onRequest } from "../../functions/relay/[[path]].js";
import { makeCtx, drainWaits, seedUser, giveKey, seedChannel, ORIGIN } from "../helpers.js";

const UP = "https://api.example.com";

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});
afterEach(() => fetchMock.assertNoPendingInterceptors());

// 攔一次上游請求並捕捉其 path/headers/body；回傳讀取器
function interceptUpstream(reply) {
  const cap = { path: null, headers: null, body: null };
  fetchMock.get(UP).intercept({
    path: (p) => { cap.path = p; return true; },
    method: (m) => { cap.method = m; return true; },
    headers: (h) => { cap.headers = h; return true; },
    body: (b) => { cap.body = b; return true; }
  }).reply(reply.status || 200, reply.body || "", { headers: reply.headers || {} });
  cap.header = (name) => {
    const h = cap.headers || {};
    for (const k of Object.keys(h)) if (k.toLowerCase() === name) return h[k];
    return undefined;
  };
  return cap;
}

async function relayCtx(path, init, params) {
  return makeCtx({
    url: ORIGIN + path,
    init,
    params: { path: params }
  });
}

// 佈置：已批准會員（有 relay 服務）＋金鑰＋一個 openai 渠道
async function setup(chOver) {
  const user = await seedUser({ status: "approved", services: "relay" });
  const key = await giveKey(user);
  const ch = await seedChannel(Object.assign({ slug: "up", kind: "openai" }, chOver || {}));
  return { user, key, ch };
}

describe("relay 安全邊界", () => {
  it("OPTIONS 預檢 → 204＋CORS", async () => {
    const ctx = await relayCtx("/relay/up/v1/x", { method: "OPTIONS" }, ["up", "v1", "x"]);
    const r = await onRequest(ctx);
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
  });

  it("沒帶金鑰 → 401 no-key", async () => {
    const ctx = await relayCtx("/relay/up/v1/x", {}, ["up", "v1", "x"]);
    const r = await onRequest(ctx);
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe("no-key");
  });

  it("金鑰無效 → 401 bad-key", async () => {
    const ctx = await relayCtx("/relay/up/v1/x", {
      headers: { authorization: "Bearer uak-nosuchkeyaaaaaaaaaa" }
    }, ["up", "v1", "x"]);
    const r = await onRequest(ctx);
    expect(r.status).toBe(401);
    expect((await r.json()).error).toBe("bad-key");
  });

  it("沒被批准 relay 服務 → 403；封鎖 → 403", async () => {
    for (const over of [{ status: "approved", services: "vpn" }, { status: "blocked", services: "relay" }]) {
      const u = await seedUser(over);
      const key = await giveKey(u);
      const ctx = await relayCtx("/relay/up/v1/x", { headers: { authorization: "Bearer " + key } }, ["up", "v1", "x"]);
      const r = await onRequest(ctx);
      expect(r.status).toBe(403);
      expect((await r.json()).error).toBe("not-approved");
    }
  });

  it("不存在／停用的管道 → 404", async () => {
    const { key } = await setup();
    await seedChannel({ slug: "off", enabled: 0 });
    for (const slug of ["nope", "off"]) {
      const ctx = await relayCtx("/relay/" + slug + "/v1/x", { headers: { authorization: "Bearer " + key } }, [slug, "v1", "x"]);
      const r = await onRequest(ctx);
      expect(r.status).toBe(404);
      expect((await r.json()).error).toBe("unknown-channel");
    }
  });
});

describe("relay 轉發：標頭剝除＋金鑰置換", () => {
  it("會員身分標頭全剝掉、Authorization 換成上游金鑰、自訂標頭放行", async () => {
    const { key } = await setup();
    const cap = interceptUpstream({ body: '{"ok":1}', headers: { "content-type": "application/json" } });
    const ctx = await relayCtx("/relay/up/v1/chat/completions", {
      method: "POST",
      headers: {
        "x-api-key": key,                      // 會員金鑰擺 Anthropic 位（也要驗、也要剝）
        cookie: "ipua_sess=secret",
        origin: "https://uaip.cc.cd",
        referer: "https://uaip.cc.cd/relay",
        "x-forwarded-for": "1.2.3.4",
        "content-type": "application/json",
        "x-client-tag": "keep-me"
      },
      body: '{"model":"m"}'
    }, ["up", "v1", "chat", "completions"]);
    const r = await onRequest(ctx);
    await r.text();
    await drainWaits(ctx);
    expect(r.status).toBe(200);
    // 上游收到的：金鑰換成站長的、會員身分痕跡為零
    expect(cap.header("authorization")).toBe("Bearer sk-upstream-secret");
    expect(cap.header("x-api-key")).toBeUndefined();
    expect(cap.header("cookie")).toBeUndefined();
    expect(cap.header("origin")).toBeUndefined();
    expect(cap.header("referer")).toBeUndefined();
    expect(cap.header("x-forwarded-for")).toBeUndefined();
    expect(cap.header("content-type")).toBe("application/json");
    expect(cap.header("x-client-tag")).toBe("keep-me");
    expect(cap.body).toBe('{"model":"m"}');
  });

  it("?key= 會員金鑰不落到上游網址；其他查詢參數保留", async () => {
    const { key } = await setup();
    const cap = interceptUpstream({ body: "{}" });
    const ctx = await relayCtx("/relay/up/v1/models?key=" + key + "&alt=sse", {}, ["up", "v1", "models"]);
    const r = await onRequest(ctx);
    await r.text();
    await drainWaits(ctx);
    expect(r.status).toBe(200);
    expect(cap.path).toBe("/v1/models?alt=sse");
  });

  it("anthropic 原生路徑用 x-api-key；gemini 原生用 x-goog-api-key", async () => {
    const { key } = await setup({ slug: "ant", kind: "anthropic", api_key: "sk-ant-up" });
    const cap = interceptUpstream({ body: "{}" });
    const ctx = await relayCtx("/relay/ant/v1/messages", {
      method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json" }, body: "{}"
    }, ["ant", "v1", "messages"]);
    await (await onRequest(ctx)).text();
    await drainWaits(ctx);
    expect(cap.header("x-api-key")).toBe("sk-ant-up");
    expect(cap.header("authorization")).toBeUndefined();

    await seedChannel({ slug: "gem", kind: "gemini", api_key: "sk-goog-up" });
    const cap2 = interceptUpstream({ body: "{}" });
    const ctx2 = await relayCtx("/relay/gem/v1beta/models/gemini-x:generateContent", {
      method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json" }, body: "{}"
    }, ["gem", "v1beta", "models", "gemini-x:generateContent"]);
    await (await onRequest(ctx2)).text();
    await drainWaits(ctx2);
    expect(cap2.header("x-goog-api-key")).toBe("sk-goog-up");
    expect(cap2.path).toContain("gemini-x:generateContent");   // 路徑冒號不被重新編碼
  });

  it("OpenAI 相容路徑（gemini 渠道的 /openai/）統一用 Bearer", async () => {
    const { key } = await setup({ slug: "gemc", kind: "gemini", api_key: "sk-goog-up" });
    const cap = interceptUpstream({ body: "{}" });
    const ctx = await relayCtx("/relay/gemc/v1beta/openai/chat/completions", {
      method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json" }, body: "{}"
    }, ["gemc", "v1beta", "openai", "chat", "completions"]);
    await (await onRequest(ctx)).text();
    await drainWaits(ctx);
    expect(cap.header("authorization")).toBe("Bearer sk-goog-up");
    expect(cap.header("x-goog-api-key")).toBeUndefined();
  });
});

describe("relay 回應直通", () => {
  it("串流位元組保真＋set-cookie 剝除＋CORS＋no-store", async () => {
    const { key } = await setup();
    const sse = 'data: {"choices":[{"delta":{"content":"你好"}}]}\n\ndata: [DONE]\n\n';
    interceptUpstream({
      body: sse,
      headers: { "content-type": "text/event-stream", "set-cookie": "up=1; Path=/", "x-upstream": "yes" }
    });
    const ctx = await relayCtx("/relay/up/v1/chat/completions", {
      method: "POST", headers: { authorization: "Bearer " + key, "content-type": "application/json" }, body: "{}"
    }, ["up", "v1", "chat", "completions"]);
    const r = await onRequest(ctx);
    expect(await r.text()).toBe(sse);                              // 一位元組都不動
    await drainWaits(ctx);
    expect(r.headers.get("set-cookie")).toBeNull();                // 上游 cookie 不落地
    expect(r.headers.get("access-control-allow-origin")).toBe("*");
    expect(r.headers.get("cache-control")).toBe("no-store");
    expect(r.headers.get("x-upstream")).toBe("yes");               // 其他上游標頭照傳
  });

  it("上游錯誤狀態碼原樣轉回", async () => {
    const { key } = await setup();
    interceptUpstream({ status: 429, body: '{"error":"rate"}' });
    const ctx = await relayCtx("/relay/up/v1/chat/completions", {
      method: "POST", headers: { authorization: "Bearer " + key }, body: "{}"
    }, ["up", "v1", "chat", "completions"]);
    const r = await onRequest(ctx);
    await r.text();
    await drainWaits(ctx);
    expect(r.status).toBe(429);
  });

  it("記用量：成功轉發後 relay_calls +1", async () => {
    const { user, key } = await setup();
    interceptUpstream({ body: "{}" });
    const ctx = await relayCtx("/relay/up/v1/models", { headers: { authorization: "Bearer " + key } }, ["up", "v1", "models"]);
    const r = await onRequest(ctx);
    await r.text();
    await drainWaits(ctx);
    const row = await env.DB.prepare("SELECT relay_calls FROM users WHERE id=?1").bind(user.id).first();
    expect(row.relay_calls).toBe(1);
  });
});
