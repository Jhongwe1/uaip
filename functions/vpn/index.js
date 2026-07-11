// GET /vpn — VPN 訂閱（會員頁）。
// 未登入 → 登入閘門；待核准 → 提示等核准；已核准 → 顯示專屬訂閱網址＋複製鈕＋一鍵匯入＋教學。
// 站長另外看到「訂閱來源設定」卡：上游訂閱網址＋手動節點（存 settings 表）。
// 訂閱內容由 functions/vpn/sub/<token> 產生（驗 token→抓上游→轉發）。
import { html, pageShell, getChrome } from "../../lib/site.js";
import { MEMBER_CSS, MEMBER_JS } from "../../lib/memberui.js";

const PAGE_CSS = `
  .card{border:1px solid var(--line);border-radius:13px;padding:16px 18px;margin-bottom:16px;background:var(--card)}
  .card h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);margin:0 0 12px;padding-bottom:9px;border-bottom:1px solid var(--line)}
  .btn{border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:8px;padding:9px 15px;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;transition:.15s;white-space:nowrap;text-decoration:none;display:inline-flex;align-items:center;gap:6px}
  .btn:hover{border-color:var(--line2)}
  .btn.pri{background:var(--accent);color:var(--accent-fg);border-color:var(--line2)}
  .btn:disabled{opacity:.5;cursor:default}
  .field{margin-bottom:12px}
  .field label{display:block;font-size:12px;font-weight:700;color:var(--muted);letter-spacing:.05em;margin-bottom:5px}
  .field input,.field textarea{width:100%;border:1px solid var(--line);background:var(--field);color:var(--fg);border-radius:8px;padding:10px 11px;font-size:14px;font-family:inherit;outline:none;box-sizing:border-box}
  .field textarea{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;line-height:1.6;resize:vertical}
  .field input:focus,.field textarea:focus{border-color:var(--line2)}
  .btnrow{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
  ol.steps{margin:0;padding-left:20px;font-size:13.5px;line-height:1.9;color:var(--muted)}
  ol.steps code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:var(--field);border:1px solid var(--line);border-radius:5px;padding:1px 6px}
`;

export async function onRequestGet({ env }) {
  const chrome = await getChrome(env);
  const body =
    '<div id="root"><div class="gate"><div class="spin"></div></div></div>\n' +
    '<script>' + MEMBER_JS + '</script>\n' +
    '<script>' + VPN_JS + '</script>';
  return html(pageShell({
    title: "VPN",
    tkey: "page.vpn",
    desc: "會員專用的 VPN 訂閱 — 一個網址匯入所有節點，自動更新。",
    noindex: true,
    chrome: chrome,
    activePath: "/vpn",
    h1: '<a href="/" data-zh="VPN" data-en="VPN">VPN</a>',
    headExtra: "<style>" + MEMBER_CSS + PAGE_CSS + "</style>\n",
    body: body
  }));
}

const VPN_JS = `
(function(){
  "use strict";
  var $=MU.$,el=MU.el,tx=MU.tx,esc=MU.esc,origin=MU.origin;
  var root=$("root"),me=null;

  function api(path,opts){
    opts=opts||{};opts.headers=opts.headers||{};
    if(opts.json!==undefined){opts.method=opts.method||"POST";opts.headers["content-type"]="application/json";opts.body=JSON.stringify(opts.json);delete opts.json;}
    return fetch(path,opts).then(function(r){return r.json().catch(function(){return{};}).then(function(d){if(!r.ok)throw new Error(d.hint||d.error||("HTTP "+r.status));return d;});});
  }
  function subUrl(){return origin+"/vpn/sub/"+me.vpn_token;}

  function paint(){
    if(!me){MU.gateLogin(root,tx("VPN","VPN"),tx("一個訂閱網址匯入所有節點、自動更新。請先用 Google 登入。","One subscription URL for all nodes. Please sign in with Google first."));return;}
    if(!me.approved){MU.gatePending(root,me);return;}
    render();
  }
  function start(){
    MU.me(true).then(function(u){ me=u; paint(); })
      .catch(function(e){root.innerHTML='<div class="gate"><p>'+tx("讀取失敗：","Failed: ")+esc(e.message||e)+'</p></div>';});
  }
  MU.onLang(paint);

  function render(){
    root.innerHTML="";
    root.appendChild(MU.acctCard(me));

    // 訂閱網址卡
    var sc=el("div","card");
    sc.appendChild(el("h2",null,tx("你的訂閱網址","Your subscription URL")));
    sc.appendChild(el("p","lead",tx("把這個網址加進 Clash／v2rayN／Shadowrocket 等 App 的「訂閱」，就會自動拿到全部節點並定時更新。這網址等於你的通行證，別分享給別人。","Add this URL to Clash / v2rayN / Shadowrocket as a subscription. It's your personal pass — don't share it.")));
    var kbox=el("div","kbox");
    var code=el("div","code");code.id="subView";code.textContent=subUrl();
    kbox.appendChild(code);
    var cp=el("button","copy2",tx("複製","Copy"));
    MU.copyBtn(cp,subUrl);
    kbox.appendChild(cp);
    sc.appendChild(kbox);
    // 一鍵匯入（clash 深連結）＋重設
    var br=el("div","btnrow");
    var imp=el("a","btn pri",tx("匯入到 Clash","Import to Clash"));
    imp.href="clash://install-config?url="+encodeURIComponent(subUrl())+"&name=uaip";
    br.appendChild(imp);
    var reset=el("button","btn",tx("重設網址","Reset URL"));
    reset.addEventListener("click",function(){
      if(!confirm(tx("重設後舊的訂閱網址會立刻失效，你 App 裡要重新匯入。確定？","Old URL stops working immediately and you'll need to re-import. Continue?")))return;
      reset.disabled=true;
      api("/api/account/vpn-token",{method:"POST"}).then(function(d){
        me.vpn_token=d.vpn_token;code.textContent=subUrl();imp.href="clash://install-config?url="+encodeURIComponent(subUrl())+"&name=uaip";
        reset.disabled=false;MU.flash(tx("已重設","Reset"));
      }).catch(function(e){reset.disabled=false;MU.flash(esc(e.message||e));});
    });
    br.appendChild(reset);
    sc.appendChild(br);
    root.appendChild(sc);

    // 教學卡
    var hc=el("div","card");
    hc.appendChild(el("h2",null,tx("怎麼用","How to use")));
    var ol=el("ol","steps");
    [tx("複製上面的訂閱網址。","Copy the subscription URL above."),
     tx("打開你的 App（Clash Verge／v2rayN／Clash Meta／Shadowrocket…）。","Open your app (Clash Verge / v2rayN / Shadowrocket…)."),
     tx("找到「訂閱 / Profiles / Subscribe」，貼上網址、命名後匯入。","Find Subscriptions / Profiles, paste the URL, name it, import."),
     tx("之後 App 會定時自動更新節點，你不用再手動貼。","The app auto-updates nodes on a schedule from now on.")].forEach(function(s){
      ol.appendChild(el("li",null,s));
    });
    hc.appendChild(ol);
    root.appendChild(hc);

    if(me.is_admin)root.appendChild(adminCard());
  }

  /* ===== 站長：訂閱來源設定 ===== */
  function adminCard(){
    var card=el("div","card");
    card.appendChild(el("h2",null,tx("訂閱來源設定（站長）","Subscription source (admin)")));
    card.appendChild(el("p","lead",tx("上游訂閱網址：會員訂閱時伺服器去抓它再轉發（含流量／到期資訊）。手動節點：一行一條 vmess:// vless:// … 會附加在後面。兩者可只填一個。","Upstream subscription URL is fetched and relayed to members. Manual nodes (one per line) are appended.")));
    var f1=el("div","field");
    f1.appendChild(el("label",null,tx("上游訂閱網址","Upstream subscription URL")));
    var src=el("input");src.id="vSrc";src.placeholder="https://…（機場／自建訂閱）";src.autocomplete="off";
    f1.appendChild(src);card.appendChild(f1);
    var f2=el("div","field");
    f2.appendChild(el("label",null,tx("手動節點（一行一條）","Manual nodes (one per line)")));
    var nodes=el("textarea");nodes.id="vNodes";nodes.rows=5;nodes.placeholder="vless://…\\nvmess://…";
    f2.appendChild(nodes);card.appendChild(f2);
    var status=el("div","muted");status.style.marginBottom="8px";card.appendChild(status);
    var br=el("div","btnrow");
    var save=el("button","btn pri",tx("儲存","Save"));
    br.appendChild(save);card.appendChild(br);

    api("/api/admin/vpn").then(function(d){
      if(d.has_source)src.placeholder=tx("目前：","Current: ")+d.source_hint+tx("（留空＝不變；清空請填一個空格再存前先清）","");
      nodes.value=d.node_links||"";
      status.textContent=(d.has_source?tx("上游：已設定","Upstream: set"):tx("上游：未設定","Upstream: none"))+"  ·  "+tx("手動節點：","Manual nodes: ")+d.node_count;
    }).catch(function(e){status.textContent=esc(e.message||e);});

    save.addEventListener("click",function(){
      var payload={node_links:nodes.value};
      if(src.value.trim()!=="")payload.source_url=src.value.trim();
      save.disabled=true;save.textContent=tx("儲存中…","Saving…");
      api("/api/admin/vpn",{method:"PUT",json:payload}).then(function(){
        save.disabled=false;save.textContent=tx("儲存","Save");MU.flash(tx("已儲存","Saved"));
        src.value="";
        return api("/api/admin/vpn");
      }).then(function(d){
        if(d)status.textContent=(d.has_source?tx("上游：已設定","Upstream: set"):tx("上游：未設定","Upstream: none"))+"  ·  "+tx("手動節點：","Manual nodes: ")+d.node_count;
      }).catch(function(e){save.disabled=false;save.textContent=tx("儲存","Save");MU.flash(esc(e.message||e));});
    });
    return card;
  }

  start();
})();
`;
