/* adminbar.js — 站長「編輯模式」（2026-07-09）。
   只有登入過後台的裝置（localStorage 有金鑰）或本機開發才會載入這支：
   主站 index.html 與內容頁外殼（lib/site.js SHELL_JS）都有同一段載入判斷。

   提供：
   1. 右上角 ✎ 按鈕 → 下拉選單（編輯這篇文章／新增文章／編輯選單／網站名稱／各管理頁捷徑）
   2. 側邊欄「站長」區（文章管理、訪客紀錄、API 文件）— 一般訪客的選單裡沒有這一區
   3. 選單編輯器：像手機整理桌面 — ↑↓ 排順序、改名、刪除、＋分類、＋連結、還原預設；
      每個動作都即時 PUT /api/admin/menu（整包覆蓋），按「完成」重新整理頁面套用
   4. 網站名稱設定（存 settings 表，全站標題/RSS/分享卡立即生效）

   注意：這裡只是「入口顯示」，真正的權限在伺服器 — 每支 /api/admin/* 都會驗金鑰。 */
(function () {
  "use strict";
  if (window.__ipuaAdminbar) return;
  window.__ipuaAdminbar = 1;

  var token = "";
  try { token = localStorage.getItem("ipua-logs-token") || ""; } catch (e) {}
  var isLocal = /^(localhost|127\.)/.test(location.hostname);
  if (!token && !isLocal) return;

  var lang = "zh";
  try { if (localStorage.getItem("ipua-lang") === "en") lang = "en"; } catch (e) {}

  /* ===== 小工具 ===== */
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }
  function api(path, opts) {
    opts = opts || {};
    opts.headers = opts.headers || {};
    if (token) opts.headers["Authorization"] = "Bearer " + token;
    if (opts.json !== undefined) {
      opts.method = opts.method || "POST";
      opts.headers["content-type"] = "application/json";
      opts.body = JSON.stringify(opts.json);
      delete opts.json;
    }
    return fetch(path, opts).then(function (r) {
      if (r.status === 401) throw { auth: true };
      return r.json().catch(function () { return {}; }).then(function (d) {
        if (!r.ok) throw new Error(d.hint || d.error || ("HTTP " + r.status));
        return d;
      });
    });
  }
  function alertErr(e) {
    if (e && e.auth) alert("管理金鑰無效或已更換 — 請到 /admin 重新登入一次。");
    else alert("操作失敗：" + (e && e.message || e));
  }

  /* ===== 樣式 ===== */
  var css =
    "#abBtn{width:38px;padding:0;font-size:15px}" +
    "#abBtn.on{background:var(--accent);color:var(--accent-fg);border-color:var(--line2)}" +
    ".ab-panel{position:fixed;z-index:70;min-width:196px;background:var(--card);border:1px solid var(--line);border-radius:12px;box-shadow:0 10px 34px rgba(0,0,0,.2);padding:6px;display:none}" +
    ".ab-panel.open{display:block}" +
    ".ab-item{display:block;width:100%;text-align:left;padding:10px 12px;border:0;background:none;color:var(--fg);font-family:inherit;font-size:14px;font-weight:600;line-height:1.4;border-radius:8px;cursor:pointer;text-decoration:none;box-sizing:border-box}" +
    ".ab-item:hover{background:var(--field)}" +
    ".ab-hr{border-top:1px solid var(--line);margin:6px 4px}" +
    ".ab-ov{position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:80;display:flex;align-items:center;justify-content:center;padding:16px}" +
    ".ab-dlg{background:var(--card);color:var(--fg);border:1px solid var(--line);border-radius:14px;padding:18px;width:100%;max-width:360px;box-shadow:0 12px 44px rgba(0,0,0,.3)}" +
    ".ab-dlg h3{font-size:16px;font-weight:700;margin:0 0 4px}" +
    ".ab-dlg label{display:block;font-size:12px;font-weight:700;color:var(--muted);margin:12px 0 5px}" +
    ".ab-dlg input{width:100%;border:1px solid var(--line);background:var(--field);color:var(--fg);border-radius:8px;padding:10px 11px;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box}" +
    ".ab-dlg input:focus{border-color:var(--line2)}" +
    ".ab-btns{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}" +
    ".ab-btn{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:8px;padding:9px 16px;font-size:13.5px;font-weight:600;cursor:pointer;font-family:inherit}" +
    ".ab-btn:hover{border-color:var(--line2)}" +
    ".ab-btn.pri{background:var(--accent);color:var(--accent-fg);border-color:var(--line2)}" +
    ".ab-ed{padding:4px 2px 18px}" +
    ".ab-ed-head{font-size:12px;color:var(--muted);padding:12px 8px 4px;line-height:1.6}" +
    ".ab-status{font-size:12px;color:var(--muted);padding:0 8px 6px;min-height:17px}" +
    ".ab-row{display:flex;align-items:center;gap:5px;padding:6px 6px;border-radius:8px;margin:1px 0}" +
    ".ab-row:hover{background:var(--field)}" +
    ".ab-row.ab-sec{margin-top:7px}" +
    ".ab-row.ab-sec .ab-lab{text-transform:uppercase;letter-spacing:.07em;font-size:11.5px;color:var(--muted)}" +
    ".ab-main{flex:1;min-width:0}" +
    ".ab-lab{font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".ab-url{font-size:11px;color:var(--sub);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}" +
    ".ab-mini{width:27px;height:27px;min-width:27px;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:7px;font-size:12px;cursor:pointer;padding:0;font-family:inherit;display:inline-flex;align-items:center;justify-content:center}" +
    ".ab-mini:hover{border-color:var(--line2)}" +
    ".ab-mini[disabled]{opacity:.3;cursor:default}" +
    ".ab-ed-foot{display:flex;flex-wrap:wrap;gap:6px;padding:12px 6px 0}";
  var styleEl = el("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ===== 頁面情境：在哪一頁決定下拉選單長怎樣 ===== */
  var artM = location.pathname.match(/^\/(news|articles)\/(\d+)$/);   // 文章頁 → 可「編輯這篇」
  var newCat = /^\/articles/.test(location.pathname) ? "article" : "news";

  /* ===== 側邊欄「站長」區（只有這台裝置看得到；伺服器端仍會驗金鑰） ===== */
  function tx(zh, en) { return lang === "en" ? en : zh; }
  function adminNav() {
    var host = document.getElementById("sbAdmin") ||
      (document.getElementById("sidebar") && document.getElementById("sidebar").querySelector("nav"));
    if (!host || host.getAttribute("data-ab")) return;
    host.setAttribute("data-ab", "1");
    var sec = el("div", "sb-sec", tx("站長", "Admin"));
    sec.setAttribute("data-en", "Admin"); sec.setAttribute("data-zh", "站長");
    host.appendChild(sec);
    [["/admin", "文章管理", "Manage posts"],
     ["/logs", "訪客紀錄", "Visitor logs"],
     ["/api-docs", "API 文件", "API docs"]].forEach(function (x) {
      var a = el("a", "sb-link" + (location.pathname === x[0] ? " active" : ""), tx(x[1], x[2]));
      a.href = x[0];
      a.setAttribute("data-en", x[2]); a.setAttribute("data-zh", x[1]);
      host.appendChild(a);
    });
  }

  /* ===== 通用小對話框（取代 prompt，手機上也好按） ===== */
  function dialog(title, hint, fields, onOk) {
    var ov = el("div", "ab-ov"), dlg = el("div", "ab-dlg");
    dlg.appendChild(el("h3", null, title));
    if (hint) { var h = el("div", null, hint); h.style.cssText = "font-size:12px;color:var(--muted);line-height:1.6"; dlg.appendChild(h); }
    var form = el("form"), inputs = {};
    fields.forEach(function (f) {
      var lb = el("label", null, f.label);
      var inp = el("input");
      inp.type = "text"; inp.value = f.val || ""; inp.placeholder = f.ph || "";
      inp.autocomplete = "off"; inp.spellcheck = false;
      inputs[f.k] = inp;
      form.appendChild(lb); form.appendChild(inp);
    });
    var btns = el("div", "ab-btns");
    var cancel = el("button", "ab-btn", "取消"); cancel.type = "button";
    var ok = el("button", "ab-btn pri", "確定"); ok.type = "submit";
    btns.appendChild(cancel); btns.appendChild(ok);
    form.appendChild(btns);
    dlg.appendChild(form);
    ov.appendChild(dlg);
    function close() { document.removeEventListener("keydown", onKey); ov.remove(); }
    function onKey(e) { if (e.key === "Escape") close(); }
    cancel.addEventListener("click", close);
    ov.addEventListener("click", function (e) { if (e.target === ov) close(); });
    document.addEventListener("keydown", onKey);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var vals = {};
      for (var k in inputs) vals[k] = inputs[k].value.trim();
      close();
      onOk(vals);
    });
    document.body.appendChild(ov);
    var first = form.querySelector("input");
    if (first) first.focus();
  }

  /* ===== ✎ 按鈕與下拉選單 ===== */
  var panel = null, btn = null;
  function closePanel() {
    if (panel) { panel.classList.remove("open"); btn.classList.remove("on"); }
  }
  function buildPanel() {
    panel = el("div", "ab-panel");
    function add(text, hrefOrFn) {
      var it;
      if (typeof hrefOrFn === "string") { it = el("a", "ab-item", text); it.href = hrefOrFn; }
      else { it = el("button", "ab-item", text); it.type = "button"; it.addEventListener("click", hrefOrFn); }
      panel.appendChild(it);
      return it;
    }
    if (artM) add("✏️ 編輯這篇文章", "/admin?edit=" + artM[2]);
    add("＋ 新增文章", "/admin?new=" + newCat);
    add("☰ 編輯選單", startMenuEdit);
    add("⚙️ 網站名稱", editBrand);
    panel.appendChild(el("div", "ab-hr"));
    add("📄 文章管理", "/admin");
    add("👣 訪客紀錄", "/logs");
    add("📖 API 文件", "/api-docs");
    document.body.appendChild(panel);
  }
  function togglePanel() {
    if (!panel) buildPanel();
    if (panel.classList.contains("open")) { closePanel(); return; }
    var r = btn.getBoundingClientRect();
    panel.style.top = (r.bottom + 8) + "px";
    panel.style.right = Math.max(8, window.innerWidth - r.right) + "px";
    panel.classList.add("open");
    btn.classList.add("on");
  }
  function mountBtn() {
    var ctrls = document.querySelector("header .ctrls");
    if (!ctrls || document.getElementById("abBtn")) return;
    btn = el("button", "ctrl", "✎");
    btn.id = "abBtn";
    btn.title = "編輯模式";
    btn.setAttribute("aria-label", "編輯模式");
    ctrls.insertBefore(btn, ctrls.firstChild);
    btn.addEventListener("click", function (e) { e.stopPropagation(); togglePanel(); });
    document.addEventListener("click", function (e) {
      if (panel && panel.classList.contains("open") && !panel.contains(e.target)) closePanel();
    });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") closePanel(); });
    window.addEventListener("scroll", closePanel, { passive: true });
  }

  /* ===== 選單編輯器 ===== */
  var items = null, saveTimer = null, statusEl = null, rowsBox = null;

  function status(t) { if (statusEl) statusEl.textContent = t || ""; }
  function scheduleSave() {
    status("儲存中…");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      api("/api/admin/menu", { method: "PUT", json: { items: items } })
        .then(function () { status("✓ 已儲存"); })
        .catch(function (e) { status("⚠ 儲存失敗"); alertErr(e); });
    }, 600);
  }
  function openSidebar() {
    var sb = document.getElementById("sidebar");
    if (sb && !sb.classList.contains("open")) {
      var mb = document.getElementById("menuBtn");
      if (mb) mb.click();
    }
  }
  function startMenuEdit() {
    closePanel();
    api("/api/menu").then(function (d) {
      items = (d.items || []).map(function (it) {
        return {
          kind: it.kind === "section" ? "section" : "link",
          label: it.label || "",
          label_en: it.label_en || "",
          url: it.url || ""
        };
      });
      openSidebar();
      buildEditor();
      renderRows();
      if (!d.custom) status("目前是預設選單，改了才會存成自訂");
    }).catch(alertErr);
  }
  function buildEditor() {
    if (document.querySelector(".ab-ed")) return;
    var sb = document.getElementById("sidebar");
    var nav = sb && sb.querySelector("nav");
    if (!nav) return;
    // 隱藏原本的選單與站長區（.ab-ed 的存在也讓主站知道「編輯中，別重繪選單」）
    var m = document.getElementById("sbMenu"); if (m) m.style.display = "none";
    var a = document.getElementById("sbAdmin"); if (a) a.style.display = "none";
    var ed = el("div", "ab-ed");
    ed.appendChild(el("div", "ab-ed-head", "編輯選單 — ↑↓ 排順序、「改」改名／改網址；改動會自動儲存，按「完成」重新整理套用。"));
    statusEl = el("div", "ab-status");
    ed.appendChild(statusEl);
    rowsBox = el("div");
    ed.appendChild(rowsBox);
    var foot = el("div", "ab-ed-foot");
    function fbtn(text, pri, fn) {
      var b = el("button", "ab-btn" + (pri ? " pri" : ""), text);
      b.type = "button";
      b.addEventListener("click", fn);
      foot.appendChild(b);
      return b;
    }
    fbtn("＋ 連結", false, addLink);
    fbtn("＋ 分類", false, addSection);
    fbtn("還原預設", false, restoreDefault);
    fbtn("✓ 完成", true, finishEdit);
    ed.appendChild(foot);
    nav.appendChild(ed);
  }
  function renderRows() {
    if (!rowsBox) return;
    rowsBox.innerHTML = "";
    items.forEach(function (it, i) {
      var row = el("div", "ab-row" + (it.kind === "section" ? " ab-sec" : ""));
      function mini(text, disabled, fn) {
        var b = el("button", "ab-mini", text);
        b.type = "button";
        if (disabled) b.disabled = true;
        else b.addEventListener("click", fn);
        row.appendChild(b);
        return b;
      }
      mini("↑", i === 0, function () { move(i, -1); });
      mini("↓", i === items.length - 1, function () { move(i, 1); });
      var main = el("div", "ab-main");
      main.appendChild(el("div", "ab-lab", it.label + (it.label_en ? "｜" + it.label_en : "")));
      main.appendChild(el("div", "ab-url", it.kind === "section" ? "分類標題" : it.url));
      row.appendChild(main);
      mini("改", false, function () { editItem(i); });
      mini("✕", false, function () { removeItem(i); });
      rowsBox.appendChild(row);
    });
    if (!items.length) rowsBox.appendChild(el("div", "ab-ed-head", "（選單是空的 — 加點東西，或「還原預設」）"));
  }
  function move(i, d) {
    var j = i + d;
    if (j < 0 || j >= items.length) return;
    var t = items[i]; items[i] = items[j]; items[j] = t;
    renderRows();
    scheduleSave();
  }
  function removeItem(i) {
    if (!confirm("刪除「" + items[i].label + "」？")) return;
    items.splice(i, 1);
    renderRows();
    scheduleSave();
  }
  function validUrl(u) { return /^(\/|https?:\/\/)/.test(u); }
  function editItem(i) {
    var it = items[i];
    var fields = [
      { k: "label", label: "名稱（中文）", val: it.label },
      { k: "label_en", label: "英文名稱（可留空）", val: it.label_en }
    ];
    if (it.kind === "link") fields.push({ k: "url", label: "連結網址", val: it.url, ph: "/news 或 https://…" });
    dialog(it.kind === "section" ? "編輯分類" : "編輯連結", "", fields, function (v) {
      if (!v.label) { alert("名稱不能是空的"); return; }
      if (it.kind === "link" && !validUrl(v.url)) { alert("網址要以 / 或 http(s):// 開頭"); return; }
      it.label = v.label; it.label_en = v.label_en;
      if (it.kind === "link") it.url = v.url;
      renderRows();
      scheduleSave();
    });
  }
  function addLink() {
    dialog("新增連結", "會加在選單最下面，再用 ↑ 移到想要的位置。", [
      { k: "label", label: "名稱（中文）", ph: "例：關於本站" },
      { k: "label_en", label: "英文名稱（可留空）", ph: "About" },
      { k: "url", label: "連結網址", ph: "/news 或 https://…" }
    ], function (v) {
      if (!v.label) { alert("名稱不能是空的"); return; }
      if (!validUrl(v.url)) { alert("網址要以 / 或 http(s):// 開頭"); return; }
      items.push({ kind: "link", label: v.label, label_en: v.label_en, url: v.url });
      renderRows();
      scheduleSave();
    });
  }
  function addSection() {
    dialog("新增分類", "分類是選單裡的小標題，用來把連結分組。", [
      { k: "label", label: "名稱（中文）", ph: "例：站外連結" },
      { k: "label_en", label: "英文名稱（可留空）", ph: "Links" }
    ], function (v) {
      if (!v.label) { alert("名稱不能是空的"); return; }
      items.push({ kind: "section", label: v.label, label_en: v.label_en, url: "" });
      renderRows();
      scheduleSave();
    });
  }
  function restoreDefault() {
    if (!confirm("還原成預設選單？自訂的項目會全部刪除。")) return;
    clearTimeout(saveTimer);
    api("/api/admin/menu", { method: "PUT", json: { items: [] } })
      .then(function () { location.reload(); })
      .catch(alertErr);
  }
  function finishEdit() {
    clearTimeout(saveTimer);
    api("/api/admin/menu", { method: "PUT", json: { items: items } })
      .then(function () { location.reload(); })
      .catch(alertErr);
  }

  /* ===== 網站名稱 ===== */
  function editBrand() {
    closePanel();
    api("/api/settings").then(function (d) {
      dialog("網站名稱",
        "用在分頁標題、分享卡、RSS。留空＝還原預設（" + (d.custom ? "uaip.cc.cd" : d.brand) + "）。",
        [{ k: "brand", label: "站名", val: d.custom ? d.brand : "", ph: d.brand }],
        function (v) {
          api("/api/admin/settings", { method: "PUT", json: { brand: v.brand } })
            .then(function () { location.reload(); })
            .catch(alertErr);
        });
    }).catch(alertErr);
  }

  /* ===== 啟動 ===== */
  mountBtn();
  adminNav();
})();
