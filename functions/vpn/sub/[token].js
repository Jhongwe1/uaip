// GET /vpn/sub/<token> — VPN 訂閱鏡像端點（給 Clash／v2rayN 等 App 直接訂閱）。
// token 就是驗證本身（等於會員的訂閱網址），不需要登入 cookie，方便 App 定時更新。
//
// 行為：驗 token → 確認帳號已核准 → 抓站長設定的上游訂閱（邊緣快取 5 分鐘）→
//       （若上游是標準 base64 訂閱且站長另外貼了手動節點，就解碼、附加、再編碼）→ 原樣回傳。
// 上游的流量／到期資訊（Subscription-Userinfo 標頭）也一併透傳，App 才顯示得出額度。

function textResp(body, status, extraHeaders) {
  const h = Object.assign({
    "content-type": "text/plain; charset=utf-8",
    "cache-control": "no-store"
  }, extraHeaders || {});
  return new Response(body, { status: status || 200, headers: h });
}

// base64（可能有 URL-safe 變體）→ 文字；失敗回 null
function b64decode(s) {
  try {
    const t = s.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
    const pad = t + "===".slice((t.length + 3) % 4);
    const bin = atob(pad);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch (e) { return null; }
}
function b64encode(s) {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const token = String(params.token || "");
  if (!/^uvt[a-z2-7]{10,40}$/.test(token)) return textResp("invalid token", 404);
  if (!env.DB) return textResp("service unavailable", 503);

  // 驗 token → 會員
  let user = null;
  try {
    user = await env.DB.prepare("SELECT id,status,is_admin FROM users WHERE vpn_token=?1").bind(token).first();
  } catch (e) {}
  if (!user) return textResp("invalid token", 404);
  if (user.status === "blocked") return textResp("account blocked", 403);
  if (user.status !== "approved" && user.is_admin !== 1) return textResp("account not approved yet", 403);

  // 站長設定
  let source = "", nodes = "";
  try {
    const res = await env.DB.batch([
      env.DB.prepare("SELECT v FROM settings WHERE k='vpn_source'"),
      env.DB.prepare("SELECT v FROM settings WHERE k='vpn_nodes'")
    ]);
    source = ((res[0].results || [])[0] || {}).v || "";
    nodes = ((res[1].results || [])[0] || {}).v || "";
  } catch (e) {}

  const manual = nodes.split(/\r?\n/).map(function (s) { return s.trim(); })
    .filter(function (s) { return s && s.indexOf("://") > 0; });

  // 記一次抓取（背景執行，不拖慢訂閱更新）
  try {
    context.waitUntil(
      env.DB.prepare("UPDATE users SET vpn_pulls = vpn_pulls + 1 WHERE id=?1").bind(user.id).run().catch(function () {})
    );
  } catch (e) {}

  // 只有手動節點：直接回標準 base64 訂閱
  if (!source) {
    if (!manual.length) return textResp("no subscription configured", 404);
    return textResp(b64encode(manual.join("\n")), 200, { "profile-update-interval": "12" });
  }

  // 有上游訂閱：抓回來（邊緣快取 5 分鐘），把訂閱者的 UA 透傳給上游（有些機場靠 UA 回不同格式）
  let up = null;
  try {
    up = await fetch(source, {
      headers: { "user-agent": request.headers.get("user-agent") || "clash" },
      cf: { cacheTtl: 300, cacheEverything: true }
    });
  } catch (e) {
    return textResp("upstream unreachable", 502);
  }
  if (!up.ok) return textResp("upstream error " + up.status, 502);

  const raw = await up.text();
  const passHeaders = {};
  const ui = up.headers.get("subscription-userinfo");
  if (ui) passHeaders["subscription-userinfo"] = ui;
  const pui = up.headers.get("profile-update-interval");
  passHeaders["profile-update-interval"] = pui || "12";
  const ct = up.headers.get("content-type");
  if (ct) passHeaders["content-type"] = ct;

  // 沒有手動節點要附加 → 原樣透傳
  if (!manual.length) return textResp(raw, 200, passHeaders);

  // 有手動節點：只有在「上游是標準 base64 節點清單」時安全附加（YAML/其他格式不動，以免弄壞）
  const decoded = b64decode(raw.trim());
  if (decoded && decoded.indexOf("://") > 0) {
    const merged = decoded.replace(/\s+$/, "") + "\n" + manual.join("\n");
    delete passHeaders["content-type"];   // 重新編碼後就是純 base64 訂閱
    return textResp(b64encode(merged), 200, passHeaders);
  }
  // 上游不是 base64（可能是 Clash YAML）→ 原樣透傳，手動節點這次不附加
  return textResp(raw, 200, passHeaders);
}
