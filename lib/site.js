// lib/site.js — 新聞／文章功能的共用程式，給 functions/ 底下的路由 import。
// 部署時 wrangler 會把這個資料夾打包進 Functions；lib/ 在 public/ 之外，不會被當成靜態檔上傳。
// 頁面外殼刻意沿用主站 index.html 的設計語言：同一組 CSS 變數、☰ 側邊欄、日夜主題。
// 外殼（選單、頁首、頁尾、相對時間等「框架」）支援中英切換 — 伺服器先輸出中文，
// 瀏覽器端依 localStorage `ipua-lang`（與主站共用）或裝置語言套用翻譯；文章內容本身不翻譯。

export const CANON = "https://uaip.cc.cd";   // SEO 用的正式網址（canonical、og、sitemap、RSS）
export const BRAND = "uaip.cc.cd";           // 站名（之後想好網站名字，改這裡即可）

export const CATS = {
  news:    { key: "news",    path: "/news",     label: "新聞", tkey: "cat.news",    desc: "最新消息與快訊" },
  article: { key: "article", path: "/articles", label: "文章", tkey: "cat.article", desc: "專題、心得與長文" }
};

export function esc(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// 與 functions/api/logs.js 相同的站長驗證：Authorization: Bearer <LOGS_TOKEN>。
// 金鑰沒設定時正式站一律 401；本機開發（localhost）免驗證，方便測試。
export function authed(request, env, url) {
  const auth = request.headers.get("authorization") || "";
  const token = auth.indexOf("Bearer ") === 0 ? auth.slice(7).trim() : "";
  if (env.LOGS_TOKEN) return token === env.LOGS_TOKEN;
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

export function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

export function html(body, status) {
  return new Response(body, {
    status: status || 200,
    headers: { "content-type": "text/html; charset=utf-8" }
  });
}

// UTC ISO → 台灣日期 YYYY-MM-DD（台灣固定 UTC+8，無日光節約）
export function fmtDate(iso) {
  const t = Date.parse(iso || "");
  if (isNaN(t)) return "";
  return new Date(t + 8 * 3600e3).toISOString().slice(0, 10);
}

// 伺服器先放絕對日期（沒有 JS 的環境與搜尋引擎都看得懂），
// 瀏覽器端外殼腳本再把它換算成「3 小時前 / 3 hr ago」這種相對時間。
export function timeAgo(iso) {
  return '<time datetime="' + esc(iso) + '" data-ts="' + esc(iso) + '">' + fmtDate(iso) + "</time>";
}

// 眼睛小圖示（瀏覽數）
export const EYE = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg>';

/* 頁面外殼：o = {
     title      分頁標題（會自動加上「 · 站名」）
     tkey       分頁標題的翻譯 key（列表頁用；文章頁標題不翻譯就不給）
     desc       meta description
     canonical  正式網址（絕對網址）
     active     側邊欄目前分區："news" | "article" | ""
     h1         頁首左上的大標（HTML，可含連結與 data-i18n）
     headExtra  額外塞進 <head> 的東西（og、JSON-LD…）
     body       主要內容 HTML
     noindex    true = 不讓搜尋引擎收錄
   } */
export function pageShell(o) {
  return '<!DOCTYPE html>\n<html lang="zh-Hant" data-theme="light">\n<head>\n' +
    '<meta charset="UTF-8">\n<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
    "<title>" + esc(o.title) + " · " + BRAND + "</title>\n" +
    '<meta name="description" content="' + esc(o.desc || "") + '">\n' +
    (o.noindex ? '<meta name="robots" content="noindex,nofollow">\n' : "") +
    (o.canonical ? '<link rel="canonical" href="' + esc(o.canonical) + '">\n' : "") +
    '<link rel="alternate" type="application/rss+xml" title="' + BRAND + ' RSS" href="/feed">\n' +
    '<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">\n' +
    '<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0b0b0b">\n' +
    "<link rel=\"icon\" href=\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ctext y='.9em' font-size='90'%3E%F0%9F%8C%90%3C/text%3E%3C/svg%3E\">\n" +
    (o.headExtra || "") +
    "<style>" + SHELL_CSS + "</style>\n</head>\n<body>\n" +
    '<button id="menuBtn" class="ctrl" aria-label="選單" data-i18n-aria="sb.title" aria-expanded="false" aria-controls="sidebar">' +
    '<svg width="16" height="14" viewBox="0 0 16 14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M1 1h14M1 7h14M1 13h14"/></svg></button>\n' +
    '<div id="sbOverlay" class="sb-overlay"></div>\n' +
    '<aside id="sidebar" class="sb" aria-hidden="true" inert>\n' +
    '  <div class="sb-head"><span data-i18n="sb.title">選單</span><button id="sbClose" class="ctrl" aria-label="關閉">✕</button></div>\n' +
    "  <nav>\n" +
    '    <div class="sb-sec" data-i18n="sb.content">內容</div>\n' +
    '    <a class="sb-link' + (o.active === "news" ? " active" : "") + '" href="/news" data-i18n="cat.news">新聞</a>\n' +
    '    <a class="sb-link' + (o.active === "article" ? " active" : "") + '" href="/articles" data-i18n="cat.article">文章</a>\n' +
    '    <div class="sb-sec" data-i18n="sb.tools">工具</div>\n' +
    '    <a class="sb-link" href="/ip" data-i18n="tab.ip">IP 查詢</a>\n' +
    '    <a class="sb-link" href="/ua" data-i18n="tab.ua">UA 查詢</a>\n' +
    "  </nav>\n</aside>\n" +
    '<div class="wrap">\n' +
    "  <header><h1>" + o.h1 + '</h1><div class="ctrls">' +
    '<button id="langToggle" class="ctrl" title="Language / 語言">EN</button>' +
    '<button id="themeToggle" class="ctrl" title="Day / Night">☾</button></div></header>\n' +
    o.body + "\n" +
    '  <footer><a href="/news" data-i18n="cat.news">新聞</a> · <a href="/articles" data-i18n="cat.article">文章</a> · <a href="/" data-i18n="foot.tool">IP·UA 查詢</a> · <a href="/feed" data-i18n="foot.rss">RSS 訂閱</a></footer>\n' +
    "</div>\n<script>var __TKEY=" + JSON.stringify(o.tkey || null) + ";" + SHELL_JS + "</script>\n</body>\n</html>\n";
}

// ===== 外殼樣式：變數與元件抄自主站 index.html，後面加上列表／文章頁專用樣式 =====
const SHELL_CSS = `
  *{box-sizing:border-box;margin:0;padding:0}
  :root{--bg:#ffffff;--fg:#111111;--muted:#7a7a7a;--sub:#a0a0a0;--line:#e6e6e6;--line2:#111111;--card:#ffffff;--accent:#111111;--accent-fg:#ffffff;--field:#fafafa;color-scheme:light}
  [data-theme="dark"]{--bg:#0b0b0b;--fg:#f4f4f4;--muted:#8f8f8f;--sub:#6b6b6b;--line:#262626;--line2:#f4f4f4;--card:#131313;--accent:#f4f4f4;--accent-fg:#0b0b0b;--field:#181818;color-scheme:dark}
  html,body{background:var(--bg);color:var(--fg)}
  body{font-family:-apple-system,"Segoe UI","Microsoft JhengHei",system-ui,"PingFang TC",sans-serif;line-height:1.55;-webkit-font-smoothing:antialiased;padding:26px 16px 56px;transition:background .25s,color .25s}
  .wrap{max-width:720px;margin:0 auto}
  header{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;gap:10px}
  h1{font-size:20px;font-weight:700;letter-spacing:.03em}
  h1 a{color:var(--fg);text-decoration:none}
  h1 a:hover{text-decoration:underline}
  .ctrls{display:flex;gap:8px;flex:0 0 auto}
  .ctrl{height:38px;min-width:38px;padding:0 13px;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:20px;cursor:pointer;font-size:13px;font-weight:600;line-height:1;font-family:inherit;transition:.15s;display:inline-flex;align-items:center;justify-content:center;text-decoration:none}
  .ctrl:hover{border-color:var(--line2)}
  #themeToggle{width:38px;padding:0;font-size:15px}
  #menuBtn{position:fixed;top:14px;left:14px;z-index:50}
  #menuBtn svg{display:block}
  /* 窄螢幕：標題讓位給 ☰，且 ☰ 下移到與標題列（右側圓鈕）同一水平線（body 上留白 26px） */
  @media(max-width:839.98px){header{padding-left:52px}#menuBtn{top:26px}}
  .sb-overlay{position:fixed;inset:0;background:rgba(0,0,0,.45);opacity:0;visibility:hidden;transition:opacity .2s,visibility .2s;z-index:60}
  .sb-overlay.show{opacity:1;visibility:visible}
  .sb{position:fixed;top:0;left:0;bottom:0;width:264px;max-width:82vw;background:var(--card);border-right:1px solid var(--line);z-index:61;transform:translateX(-103%);transition:transform .22s ease;display:flex;flex-direction:column}
  .sb.open{transform:none;box-shadow:0 0 42px rgba(0,0,0,.25)}
  .sb-head{display:flex;align-items:center;justify-content:space-between;padding:13px 13px 11px 20px;font-size:15px;font-weight:700;border-bottom:1px solid var(--line)}
  #sbClose{width:34px;height:34px;min-width:34px;padding:0;font-size:13px;border-radius:17px}
  .sb nav{padding:6px 10px 22px;overflow-y:auto;flex:1}
  .sb-sec{font-size:11px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--muted);padding:16px 10px 7px}
  .sb-link{display:block;padding:10px;border-radius:8px;color:var(--fg);text-decoration:none;font-size:14px;font-weight:600;transition:.15s}
  .sb-link:hover{background:var(--field)}
  .sb-link.active{background:var(--accent);color:var(--accent-fg)}
  footer{margin-top:34px;text-align:center;color:var(--sub);font-size:11px;line-height:1.8}
  footer a{color:var(--muted);text-decoration:none}
  footer a:hover{text-decoration:underline}
  /* ===== 列表（排版仿 antutu：左縮圖、右標題＋兩行摘要＋時間/瀏覽數） ===== */
  .list{border-top:1px solid var(--line)}
  .item{display:flex;gap:18px;padding:20px 0;border-bottom:1px solid var(--line);text-decoration:none;color:var(--fg)}
  .thumb{flex:0 0 228px;aspect-ratio:5/3;border-radius:10px;overflow:hidden;background:var(--field);border:1px solid var(--line);display:flex;align-items:center;justify-content:center;font-size:34px}
  .thumb img{width:100%;height:100%;object-fit:cover;display:block}
  .it{flex:1;min-width:0;display:flex;flex-direction:column}
  .it h2{font-size:17.5px;line-height:1.5;font-weight:700;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .item:hover h2{text-decoration:underline}
  .it p{margin-top:7px;font-size:13.5px;color:var(--muted);line-height:1.65;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .meta{margin-top:auto;padding-top:8px;font-size:12.5px;color:var(--sub);display:flex;gap:16px;align-items:center}
  .meta .views{display:inline-flex;align-items:center;gap:5px}
  .empty{padding:44px 0;text-align:center;color:var(--muted);font-size:14px;border-bottom:1px solid var(--line)}
  @media(max-width:560px){
    .item{gap:12px;padding:14px 0}
    .thumb{flex-basis:124px;aspect-ratio:3/2;border-radius:8px;font-size:22px}
    .it h2{font-size:15px}
    .it p{display:none}
    .meta{padding-top:4px;font-size:12px}
  }
  /* ===== 頁碼分頁 ===== */
  .pager{display:flex;gap:8px;justify-content:center;align-items:center;margin:26px 0 4px;flex-wrap:wrap}
  .pager a,.pager .cur,.pager .gap{min-width:36px;height:36px;padding:0 12px;border:1px solid var(--line);border-radius:9px;display:inline-flex;align-items:center;justify-content:center;font-size:13.5px;font-weight:600;text-decoration:none;color:var(--fg)}
  .pager a:hover{border-color:var(--line2)}
  .pager .cur{background:var(--accent);color:var(--accent-fg);border-color:var(--line2)}
  .pager .gap{border:0;color:var(--sub);min-width:auto;padding:0 2px}
  /* ===== 文章頁 ===== */
  .art h1.t{font-size:24px;line-height:1.45;font-weight:700;margin:2px 0 12px;letter-spacing:0}
  .ameta{color:var(--sub);font-size:13px;display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-bottom:18px}
  .ameta .views{display:inline-flex;align-items:center;gap:5px}
  .cover{width:100%;border-radius:11px;border:1px solid var(--line);display:block;margin-bottom:20px}
  .prose{font-size:16px;line-height:1.95;overflow-wrap:anywhere}
  .prose p{margin:0 0 1.1em}
  .prose h2{font-size:20px;line-height:1.5;margin:1.5em 0 .65em}
  .prose h3{font-size:17.5px;margin:1.3em 0 .55em}
  .prose h4{font-size:16px;margin:1.2em 0 .5em}
  .prose img{max-width:100%;height:auto;border-radius:10px;display:block;margin:18px auto}
  .prose a{color:var(--fg)}
  .prose ul,.prose ol{padding-left:1.7em;margin:0 0 1.1em}
  .prose li{margin:.28em 0}
  .prose blockquote{border-left:3px solid var(--line2);padding:2px 0 2px 14px;color:var(--muted);margin:0 0 1.1em}
  .prose code{font-family:ui-monospace,Menlo,Consolas,monospace;background:var(--field);border:1px solid var(--line);border-radius:5px;padding:1px 6px;font-size:.88em}
  .prose pre{background:var(--field);border:1px solid var(--line);border-radius:10px;padding:14px;overflow-x:auto;margin:0 0 1.1em;line-height:1.6}
  .prose pre code{border:0;background:none;padding:0}
  .prose hr{border:0;border-top:1px solid var(--line);margin:1.6em 0}
  .prose table{border-collapse:collapse;margin:0 0 1.1em;max-width:100%;display:block;overflow-x:auto}
  .prose th,.prose td{border:1px solid var(--line);padding:6px 12px;font-size:14px}
  /* 上一篇／下一篇 */
  .anav{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:28px}
  .anav a{border:1px solid var(--line);border-radius:11px;padding:12px 14px;text-decoration:none;color:var(--fg);min-width:0;transition:.15s}
  .anav a:hover{border-color:var(--line2)}
  .anav a.nx{text-align:right}
  .anav .lbl{display:block;font-size:11px;font-weight:700;letter-spacing:.08em;color:var(--muted);margin-bottom:4px;text-transform:uppercase}
  .anav .ttl{display:block;font-size:14px;font-weight:600;line-height:1.5;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  @media(max-width:560px){.anav{grid-template-columns:1fr}.anav a.nx{text-align:left}}
  .backrow{margin-top:16px}
  @media(max-width:480px){h1{font-size:17px}body{padding:20px 13px 48px}#menuBtn{top:20px}.art h1.t{font-size:20px}.prose{font-size:15.5px}}
`;

// ===== 外殼腳本：框架中英切換（與主站共用 ipua-lang）、主題、側邊欄、站長捷徑、相對時間 =====
const SHELL_JS = `
(function(){
  "use strict";
  /* --- 框架翻譯字典（只翻框架，文章內容不翻） --- */
  var I18N={
    zh:{"sb.title":"選單","sb.content":"內容","sb.tools":"工具","sb.admin":"站長","sb.manage":"文章管理","sb.logs":"訪客紀錄",
        "cat.news":"新聞","cat.article":"文章","tab.ip":"IP 查詢","tab.ua":"UA 查詢",
        "foot.tool":"IP·UA 查詢","foot.rss":"RSS 訂閱",
        "back.news":"← 回新聞列表","back.article":"← 回文章列表",
        "empty.list":"目前還沒有內容，敬請期待。","empty.404":"找不到這篇內容 — 可能已下架或網址有誤。",
        "pg.prev":"‹ 上一頁","pg.next":"下一頁 ›","an.prev":"上一篇","an.next":"下一篇",
        "t.now":"剛剛","t.min":"{n} 分鐘前","t.hour":"{n} 小時前","t.day":"{n} 天前",
        "theme.day":"白天模式（點擊切換）","theme.night":"夜間模式（點擊切換）","theme.auto":"自動日夜（點擊切換）"},
    en:{"sb.title":"Menu","sb.content":"Content","sb.tools":"Tools","sb.admin":"Admin","sb.manage":"Manage posts","sb.logs":"Visitor logs",
        "cat.news":"News","cat.article":"Articles","tab.ip":"IP Lookup","tab.ua":"UA Lookup",
        "foot.tool":"IP·UA Lookup","foot.rss":"RSS",
        "back.news":"← Back to News","back.article":"← Back to Articles",
        "empty.list":"Nothing here yet — stay tuned.","empty.404":"Content not found — it may have been removed or the URL is wrong.",
        "pg.prev":"‹ Prev","pg.next":"Next ›","an.prev":"Previous","an.next":"Next",
        "t.now":"just now","t.min":"{n} min ago","t.hour":"{n} hr ago","t.day":"{n} days ago",
        "theme.day":"Day mode (tap to switch)","theme.night":"Night mode (tap to switch)","theme.auto":"Auto day/night (tap to switch)"}
  };
  var lang="zh";
  try{
    var saved=localStorage.getItem("ipua-lang");
    if(saved==="zh"||saved==="en") lang=saved;
    else{var l=(navigator.language||"").toLowerCase();lang=l.indexOf("zh")===0?"zh":"en";}
  }catch(e){}
  function t(key,vars){
    var s=(I18N[lang]&&I18N[lang][key])||I18N.zh[key]||key;
    if(vars)for(var k in vars)s=s.split("{"+k+"}").join(vars[k]);
    return s;
  }
  /* --- 相對時間：伺服器輸出絕對日期，這裡換算成「3 小時前」；太久以前維持日期 --- */
  function relText(iso){
    var ts=Date.parse(iso);if(isNaN(ts))return null;
    var s=(Date.now()-ts)/1000;if(s<0)return null;
    if(s<60)return t("t.now");
    if(s<3600)return t("t.min",{n:Math.floor(s/60)});
    if(s<86400)return t("t.hour",{n:Math.floor(s/3600)});
    if(s<86400*30)return t("t.day",{n:Math.floor(s/86400)});
    return null;
  }
  function renderTimes(){
    var ts=document.querySelectorAll("time[data-ts]");
    for(var i=0;i<ts.length;i++){
      var el=ts[i];
      if(!el.getAttribute("data-abs"))el.setAttribute("data-abs",el.textContent);
      var r=relText(el.getAttribute("data-ts"));
      el.textContent=r||el.getAttribute("data-abs");
    }
  }
  function applyI18n(){
    document.documentElement.lang=(lang==="zh"?"zh-Hant":"en");
    var els=document.querySelectorAll("[data-i18n]");
    for(var i=0;i<els.length;i++)els[i].textContent=t(els[i].getAttribute("data-i18n"));
    var ars=document.querySelectorAll("[data-i18n-aria]");
    for(var j=0;j<ars.length;j++)ars[j].setAttribute("aria-label",t(ars[j].getAttribute("data-i18n-aria")));
    var lb=document.getElementById("langToggle");if(lb)lb.textContent=(lang==="zh"?"EN":"中");
    if(typeof __TKEY==="string"&&__TKEY)document.title=t(__TKEY)+" · uaip.cc.cd";
    renderTimes();
  }
  document.getElementById("langToggle").addEventListener("click",function(){
    lang=(lang==="zh")?"en":"zh";
    try{localStorage.setItem("ipua-lang",lang)}catch(e){}
    applyI18n();applyTheme();
  });
  /* --- 主題三段式（與主站同邏輯、同儲存鍵）：day 白底（預設）/ night 黑底 / auto 依當地日夜。
         auto 用主站算好的日夜快取（ipua-auto），沒有就用裝置時鐘 6–18 點當白天。 --- */
  var THEME_MODES=["day","night","auto"],themeMode="day",autoCache=null;
  try{var m0=localStorage.getItem("ipua-theme-mode");if(THEME_MODES.indexOf(m0)>=0)themeMode=m0}catch(e){}
  try{autoCache=localStorage.getItem("ipua-auto")}catch(e){}
  function autoThemeGuess(){
    if(autoCache==="light"||autoCache==="dark")return autoCache;
    var h=new Date().getHours();return(h>=6&&h<18)?"light":"dark";
  }
  function applyTheme(){
    var th=themeMode==="night"?"dark":(themeMode==="auto"?autoThemeGuess():"light");
    document.documentElement.setAttribute("data-theme",th);
    var b=document.getElementById("themeToggle");
    b.textContent=themeMode==="day"?"\\u2600":(themeMode==="night"?"\\u263e":"\\ud83c\\udf13");
    b.title=t("theme."+themeMode);b.setAttribute("aria-label",t("theme."+themeMode));
  }
  document.getElementById("themeToggle").addEventListener("click",function(){
    themeMode=THEME_MODES[(THEME_MODES.indexOf(themeMode)+1)%THEME_MODES.length];
    try{localStorage.setItem("ipua-theme-mode",themeMode)}catch(e){}
    applyTheme();
  });
  /* --- 側邊欄 --- */
  var sb=document.getElementById("sidebar"),ov=document.getElementById("sbOverlay"),
      btn=document.getElementById("menuBtn"),cls=document.getElementById("sbClose");
  function setOpen(open){
    sb.classList.toggle("open",open);ov.classList.toggle("show",open);
    sb.setAttribute("aria-hidden",open?"false":"true");btn.setAttribute("aria-expanded",open?"true":"false");
    if(open)sb.removeAttribute("inert");else sb.setAttribute("inert","");
    document.body.style.overflow=open?"hidden":"";
    if(open){var f=sb.querySelector(".sb-link");if(f)f.focus()}else btn.focus();
  }
  btn.addEventListener("click",function(){setOpen(!sb.classList.contains("open"))});
  cls.addEventListener("click",function(){setOpen(false)});
  ov.addEventListener("click",function(){setOpen(false)});
  document.addEventListener("keydown",function(e){if(e.key==="Escape"&&sb.classList.contains("open"))setOpen(false)});
  /* --- 站長捷徑：跟主站同規則 — 這台裝置登入過後台（localStorage 有金鑰）才動態長出 --- */
  try{
    if(localStorage.getItem("ipua-logs-token")){
      var nav=sb.querySelector("nav"),sec=document.createElement("div");
      sec.className="sb-sec";sec.setAttribute("data-i18n","sb.admin");nav.appendChild(sec);
      [["/admin","sb.manage"],["/logs","sb.logs"]].forEach(function(x){
        var a=document.createElement("a");a.className="sb-link";a.href=x[0];a.setAttribute("data-i18n",x[1]);nav.appendChild(a);
      });
    }
  }catch(e){}
  applyI18n();
  applyTheme();
})();
`;
