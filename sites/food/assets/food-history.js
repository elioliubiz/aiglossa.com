(function () {
  "use strict";
  var UI = JSON.parse(document.getElementById("ui").textContent), host = location.hostname;
  var IS_LOCAL = host === "localhost" || host === "127.0.0.1", IS_STAGING = host.indexOf("staging.aiglossa.com") >= 0;
  var API = IS_LOCAL ? "/api" : (IS_STAGING ? "https://dev.staging.aiglossa.com" : "https://api.aiglossa.com");
  var MAIN = IS_LOCAL ? "http://localhost:8301" : (IS_STAGING ? "https://staging.aiglossa.com" : "https://aiglossa.com");
  var LANG = document.documentElement.lang || "en", device = localStorage.getItem("aig_device") || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  localStorage.setItem("aig_device", device);
  var list = document.getElementById("historyPageList"), urls = [];
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function call(path, data) { return fetch(API + path, {method:"POST", credentials:"include", headers:{"Content-Type":"application/json","X-Client":"web"}, body:JSON.stringify(Object.assign({app_key:"tools",feature:"food-scan",device:device,timestamp:Math.floor(Date.now()/1000)},data||{}))}).then(function (r) { return r.json(); }); }
  function status(value) { return value === "done" ? UI.status_done : value === "failed" ? UI.status_failed : UI.status_pending; }
  function login() { location.href = MAIN + "/" + LANG + "/login.html?next=" + encodeURIComponent(location.href); }
  function goBack() {
    var previous = document.referrer;
    if (previous && new URL(previous).origin === location.origin && previous.indexOf("/food/") >= 0) history.back();
    else location.href = "../";
  }
  function thumb(id, box) { fetch(API + "/ai/food/scan/" + id + "/image", {method:"POST",credentials:"include",headers:{"Content-Type":"application/json","X-Client":"web"},body:JSON.stringify({app_key:"tools",feature:"food-scan",device:device,timestamp:Math.floor(Date.now()/1000)})}).then(function(r){return r.ok?r.blob():null}).then(function(blob){if(!blob)return;var url=URL.createObjectURL(blob);urls.push(url);box.innerHTML='<img src="'+url+'" alt="'+esc(UI.image_alt)+'">'}).catch(function(){}); }
  document.getElementById("historyBack").onclick = goBack;
  call("/wallet/summary", {}).then(function (account) {
    if (account.code !== 200) { login(); return null; }
    return call("/ai/food/works?limit=50", {});
  }).then(function (data) {
    if (!data) return;
    var items = data.code === 200 && data.data ? data.data.items || [] : [];
    list.removeAttribute("aria-busy");
    if (!items.length) { list.innerHTML = '<div class="history-empty content-enter">' + esc(UI.no_history) + '</div>'; return; }
    list.innerHTML = items.map(function(item){return '<a class="history-item content-enter" href="../result/?id='+encodeURIComponent(item.id)+'"><span class="history-thumb" data-id="'+esc(item.id)+'"><svg viewBox="0 0 24 24"><rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8 8h8M8 11h8M8 14h5"/></svg></span><span class="history-copy"><b>'+esc(item.product_name||UI.result_title)+'</b><span>'+esc(item.headline||item.created_at||"")+'</span></span><span class="mini">'+esc(status(item.status))+'</span><span class="history-arrow">→</span></a>'}).join("");
    Array.prototype.forEach.call(list.querySelectorAll(".history-thumb"),function(box){var item=items.find(function(row){return String(row.id)===box.dataset.id});if(item&&item.has_image)thumb(item.id,box)});
  }).catch(function () { list.removeAttribute("aria-busy"); list.innerHTML = '<div class="history-empty content-enter">' + esc(UI.network_error) + '</div>'; });
  window.addEventListener("pagehide", function(){urls.forEach(function(url){URL.revokeObjectURL(url)})});
})();
