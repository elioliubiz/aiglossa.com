/* aiglossa skin — multi-product ingredient scan, report, history, share. */
(function () {
  "use strict";
  var UI = JSON.parse(document.getElementById("ui").textContent);
  var $ = function (id) { return document.getElementById(id); };
  var host = location.hostname;
  var IS_LOCAL = host === "localhost" || host === "127.0.0.1";
  var IS_STAGING = host.indexOf("staging.aiglossa.com") >= 0;
  var API = IS_LOCAL ? "/api" : (IS_STAGING ? "https://dev.staging.aiglossa.com" : "https://api.aiglossa.com");
  var MAIN = IS_LOCAL ? "http://localhost:8000" : (IS_STAGING ? "https://staging.aiglossa.com" : "https://aiglossa.com");
  var LANG = document.documentElement.lang || "en";
  var FEATURE = "skin-scan";
  var device = localStorage.getItem("aig_device") || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  localStorage.setItem("aig_device", device);
  var state = { user: null, balance: 0, files: [], previews: [], scan: null, history: [], warned: false };

  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function call(path, data) {
    var body = Object.assign({ app_key: "tools", feature: FEATURE, device: device, timestamp: Math.floor(Date.now() / 1000) }, data || {});
    return fetch(API + path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-Client": "web" }, body: JSON.stringify(body) }).then(function (r) { return r.json(); });
  }
  function coinText(v) { var n = Number(v || 0); return Number.isInteger(n) ? String(n) : n.toFixed(2); }
  function toast(text) { var el = $("toast"); el.textContent = text || ""; el.classList.toggle("hidden", !text); clearTimeout(el._timer); if (text) el._timer = setTimeout(function () { el.classList.add("hidden"); }, 2800); }
  function loginUrl() { return MAIN + "/" + LANG + "/login.html?next=" + encodeURIComponent(location.href); }
  function accountUrl() { return MAIN + "/" + LANG + "/account.html?next=" + encodeURIComponent(location.href); }
  function pricingUrl() { return MAIN + "/" + LANG + "/pricing.html"; }
  function needLogin() { location.href = loginUrl(); }

  function setAvatar(user) {
    var el = $("avatar"); var initial = user ? String(user.email || user.nickname || "?").charAt(0).toUpperCase() : "?";
    if (user && user.avatar) {
      el.innerHTML = '<img src="' + esc(/^https?:\/\//.test(user.avatar) ? user.avatar : API + user.avatar) + '" alt="">';
      var img = el.querySelector("img"); img.onerror = function () { el.textContent = initial; };
    } else el.textContent = initial;
  }
  function syncAuth(signedIn) {
    ["accountBtn", "buyBtn"].forEach(function (id) { if ($(id)) $(id).classList.toggle("hidden", !signedIn); });
    if ($("loginBtn")) $("loginBtn").classList.toggle("hidden", signedIn);
    if ($("recentSection")) $("recentSection").classList.toggle("hidden", !signedIn);
    if (!signedIn && !$("resultView").classList.contains("hidden")) showHome();
  }
  function refreshAccount() {
    return call("/wallet/summary", {}).then(function (d) {
      if (d.code === 200 && d.data) {
        state.user = d.data.user || {}; state.balance = Number(d.data.coins || 0);
        setAvatar(state.user); $("balanceText").innerHTML = coinText(state.balance) + " <span>" + esc(UI.credits) + "</span>";
        syncAuth(true); loadHistory(); return true;
      }
      state.user = null; state.balance = 0; setAvatar(null); $("balanceText").innerHTML = esc(UI.sign_in) + " <span>" + esc(UI.credits) + "</span>"; syncAuth(false); return false;
    }).catch(function () { setAvatar(null); syncAuth(false); return false; });
  }

  function filesToPreview() {
    var grid = $("previewGrid");
    grid.innerHTML = state.previews.map(function (url, index) { return '<div class="preview-item"><img src="' + esc(url) + '" alt=""><button type="button" class="preview-remove" data-index="' + index + '">×</button></div>'; }).join("");
    $("previewWrap").classList.toggle("hidden", !state.previews.length);
    $("scanButton").classList.toggle("hidden", !state.files.length);
    Array.prototype.forEach.call(grid.querySelectorAll(".preview-remove"), function (btn) {
      btn.onclick = function () { var i = Number(btn.dataset.index); URL.revokeObjectURL(state.previews[i]); state.previews.splice(i, 1); state.files.splice(i, 1); filesToPreview(); };
    });
  }
  function handleFiles(files) {
    var remaining = 3 - state.files.length;
    if (remaining <= 0) { toast(UI.multi_hint); return; }
    var accepted = [];
    Array.prototype.forEach.call(files || [], function (file) {
      if (accepted.length >= remaining) return;
      if (!/^image\/(jpeg|png|webp)$/.test(file.type || "") || file.size > 8 * 1024 * 1024) { toast(UI.image_invalid); return; }
      accepted.push(file);
    });
    if (!accepted.length) return;
    accepted.forEach(function (file) { state.files.push(file); state.previews.push(URL.createObjectURL(file)); });
    filesToPreview();
  }
  function compress(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var max = 1600, scale = Math.min(1, max / Math.max(img.width, img.height));
          var canvas = document.createElement("canvas"); canvas.width = Math.round(img.width * scale); canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          var data = canvas.toDataURL("image/jpeg", .86).split(",")[1];
          resolve(data);
        };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }
  function requestId() { return (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, "") : String(Date.now()) + Math.random().toString(16).slice(2)).slice(0, 48); }
  function setScanning(on, text) {
    $("scanLoading").classList.toggle("hidden", !on);
    $("scanLoadingText").textContent = text || UI.scanning;
    $("scanButton").disabled = on;
  }
  function startScan() {
    if (!state.files.length) { toast(UI.image_invalid); return; }
    if (state.files.length > 3) { toast(UI.multi_hint); return; }
    setScanning(true);
    Promise.all(state.files.map(compress)).then(function (images) {
      return call("/ai/skin/scan", { language: LANG, request_id: requestId(), images: images, mime: "image/jpeg" });
    }).then(function (d) {
      if (d.code !== 200) { setScanning(false); toast(d.msg || UI.scan_failed); if (d.code === 401) needLogin(); if (d.code === 402) location.href = pricingUrl(); return; }
      state.scan = d.data; pollScan(d.data.id);
    }).catch(function () { setScanning(false); toast(UI.network_error); });
  }
  function pollScan(id) {
    var attempts = 0;
    var tick = function () {
      attempts++;
      call("/ai/skin/scan/" + id, {}).then(function (d) {
        if (d.code !== 200 || !d.data) { setScanning(false); toast(d.msg || UI.scan_failed); return; }
        var row = d.data;
        if (row.status === "done") { setScanning(false); state.scan = row; state.balance = row.balance != null ? Number(row.balance) : state.balance; renderResult(row); refreshAccount(); return; }
        if (row.status === "failed") { setScanning(false); toast(UI.scan_failed); return; }
        if (attempts > 90) { setScanning(false); toast(UI.scan_timeout); return; }
        setTimeout(tick, 1500);
      }).catch(function () { setScanning(false); toast(UI.network_error); });
    };
    tick();
  }

  function chip(text, level) { return '<span class="skin-chip ' + (level === "caution" ? "warn" : (level === "avoid_if_allergic" ? "bad" : (level === "generally_suitable" ? "good" : ""))) + '">' + esc(text) + '</span>'; }
  function list(items) { if (!items || !items.length) return ""; return '<ul class="skin-list">' + items.map(function (x) { return '<li>' + esc(typeof x === "string" ? x : (x.text || x.advice || x.reason || "")) + '</li>'; }).join("") + '</ul>'; }
  function productCard(p, index) {
    var pr = p.product || {};
    var ings = p.ingredients || [];
    var keys = p.key_ingredients || [];
    var skins = p.skin_types || [];
    var pops = p.population_notes || [];
    var cautions = p.cautions || [];
    var usage = p.usage || [];
    var notes = p.data_notes || [];
    var unsupported = p.category_supported === false;
    var ingRows = ings.map(function (x, i) {
      var orig = String(x.original_text || "").trim(), name = String(x.name || "").trim();
      var same = orig && orig.toLowerCase() === name.toLowerCase();
      return '<div class="skin-ing-row' + (i >= 6 ? " ing-extra hidden" : "") + '"><div><b>' + esc(name || orig) + '</b>' + (orig && !same ? '<em>' + esc(UI.original) + ': ' + esc(orig) + '</em>' : '') + '</div><span>' + esc(x.function || x.what_it_is || "") + (x.flags && x.flags.length ? ' · ' + esc(x.flags.join(", ")) : "") + '</span></div>';
    }).join("");
    var keyHtml = keys.length ? '<div class="skin-key">' + keys.map(function (k) { return '<div><b>' + esc(k.name) + '</b><span>' + esc(k.why || "") + (k.caution ? ' · ' + esc(k.caution) : "") + '</span></div>'; }).join("") + '</div>' : "";
    var skinHtml = skins.length ? '<div class="skin-badges">' + skins.map(function (s) { return chip(s.type + ": " + (s.level || ""), s.level); }).join("") + '</div>' : "";
    var popHtml = pops.length ? '<ul class="skin-list">' + pops.map(function (x) { return '<li><b>' + esc(x.group) + '</b> · ' + esc(x.advice || "") + (x.reason ? ' — ' + esc(x.reason) : "") + '</li>'; }).join("") + '</ul>' : "";
    return '<section class="card skin-product" data-product="' + index + '"><div class="skin-product-head"><div><div class="skin-product-brand">' + esc(pr.brand || "") + ' · ' + esc(pr.category || "") + '</div><div class="skin-product-name">' + esc(pr.name || pr.name_original || UI.product) + '</div></div><span class="skin-chip">' + esc(UI.product) + " " + (index + 1) + '</span></div>' +
      (unsupported ? '<div class="skin-unsupported">' + esc(UI.unsupported) + '</div>' : '') +
      '<p class="skin-card">' + esc(p.summary || "") + '</p>' +
      (keyHtml ? '<h3 class="skin-card">' + esc(UI.key_ingredients) + '</h3>' + keyHtml : '') +
      (skinHtml ? '<h3 class="skin-card">' + esc(UI.skin_types) + '</h3>' + skinHtml : '') +
      (popHtml ? '<h3 class="skin-card">' + esc(UI.population) + '</h3>' + popHtml : '') +
      '<h3 class="skin-card">' + esc(UI.ingredients) + ' <span style="color:var(--muted);font-weight:400">' + ings.length + '</span></h3>' +
      (ingRows ? '<div class="skin-ing">' + ingRows + '</div>' + (ings.length > 6 ? '<button type="button" class="ing-more" data-more="' + index + '">' + esc(UI.show_all) + ' (' + ings.length + ')</button>' : '') : '<p class="skin-empty">' + esc(UI.no_ingredients) + '</p>') +
      (cautions.length ? '<h3 class="skin-card">' + esc(UI.cautions) + '</h3>' + list(cautions) : '') +
      (usage.length ? '<h3 class="skin-card">' + esc(UI.usage) + '</h3>' + list(usage) : '') +
      (notes.length ? '<h3 class="skin-card">' + esc(UI.data_notes) + '</h3>' + list(notes) : '') +
      '</section>';
  }
  function combinedCard(c) {
    if (!c || !Object.keys(c).length) return "";
    var roles = (c.product_roles || []).map(function (r) { return '<div class="skin-role"><b>' + esc(UI.product) + " " + (Number(r.image_index) + 1) + '</b><span>' + esc(r.role || "") + '</span></div>'; }).join("");
    var overlaps = (c.overlaps || []).map(function (o) { return '<li><b>' + esc(o.ingredient || "") + '</b> · ' + esc(o.note || "") + '</li>'; }).join("");
    var cautions = (c.cautions || []).map(function (o) { return '<li><b>' + esc(o.text || "") + '</b> · ' + esc(o.reason || "") + '</li>'; }).join("");
    return '<section class="skin-combined skin-card"><h3>' + esc(UI.combined) + '</h3><p>' + esc(c.summary || "") + '</p>' +
      (roles ? '<h3 class="skin-card">' + esc(UI.roles) + '</h3>' + roles : '') +
      (overlaps ? '<h3 class="skin-card">' + esc(UI.overlaps) + '</h3><ul class="skin-list">' + overlaps + '</ul>' : '') +
      (cautions ? '<h3 class="skin-card">' + esc(UI.cautions) + '</h3><ul class="skin-list">' + cautions + '</ul>' : '') +
      (c.routine && c.routine.notes && c.routine.notes.length ? '<h3 class="skin-card">' + esc(UI.routine) + '</h3>' + list(c.routine.notes) : '') +
      '</section>';
  }
  function renderResult(row) {
    var report = row.report || {}; var products = report.products || [];
    $("heroView").classList.add("hidden"); $("resultView").classList.remove("hidden");
    var first = products[0] || {}; var pr = first.product || {};
    $("resultName").textContent = pr.name || pr.name_original || UI.product;
    $("resultMeta").textContent = products.length + " " + UI.products + " · " + (row.language || LANG).toUpperCase();
    $("resultThumb").innerHTML = state.previews.length ? '<img src="' + esc(state.previews[0]) + '" alt="">' : '<span class="thumb-skeleton"></span>';
    $("reportMain").innerHTML = (products.length > 1 ? combinedCard(report.combined) : "") + products.map(productCard).join("") + '<p class="nutrition-note">' + esc(UI.footer_disclaimer || report.disclaimer || "") + '</p>';
    $("reportSide").innerHTML = '<div class="skin-side">' +
      '<div class="skin-side-kicker">ANALYSIS</div>' +
      '<div class="skin-side-price">' + coinText(row.credits || 0) + '<span> ' + esc(UI.credits) + '</span></div>' +
      '<div class="side-line"><span>' + esc(UI.products) + '</span><b>' + products.length + '</b></div>' +
      '<div class="side-line"><span>' + esc(UI.pay_balance) + '</span><b>' + coinText(state.balance) + '</b></div>' +
      '<button class="btn full" id="scanAnother">' + esc(UI.scan_button) + '</button>' +
      '<a class="btn ghost full skin-side-buy" href="' + pricingUrl() + '">' + esc(UI.buy) + '</a>' +
      '<p class="skin-side-note">' + esc(UI.footer_disclaimer || report.disclaimer || "") + '</p></div>';
    $("scanAnother").onclick = resetScan;
    Array.prototype.forEach.call(document.querySelectorAll("[data-more]"), function (btn) {
      btn.onclick = function () { var card = btn.closest(".skin-product"); Array.prototype.forEach.call(card.querySelectorAll(".ing-extra"), function (x) { x.classList.toggle("hidden"); }); btn.textContent = btn.textContent === UI.show_less ? UI.show_all : UI.show_less; };
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function showHome() { $("heroView").classList.remove("hidden"); $("resultView").classList.add("hidden"); }
  function resetScan() {
    state.files = []; state.previews.forEach(function (u) { URL.revokeObjectURL(u); }); state.previews = []; state.scan = null;
    filesToPreview(); showHome(); $("scanButton").classList.add("hidden"); $("fileInput").value = ""; $("cameraInput").value = ""; $("reportMain").innerHTML = ""; $("reportSide").innerHTML = "";
  }
  function loadHistory() {
    if (!state.user) return;
    call("/ai/skin/works", {}).then(function (d) {
      if (d.code !== 200 || !d.data) return;
      state.history = d.data.items || [];
      if (!state.history.length) { $("historyList").innerHTML = '<div class="history-empty">' + esc(UI.no_history) + '</div>'; return; }
      $("historyList").innerHTML = state.history.map(function (x) {
        return '<button class="history-item" data-id="' + x.id + '"><span class="history-thumb">' + (x.has_image ? "◌" : "—") + '</span><span class="history-copy"><b>' + esc(x.product_name || UI.product) + '</b><small>' + esc(x.headline || "") + '</small></span><span class="history-status">' + esc(x.product_count || 1) + ' · ' + esc(x.status) + '</span></button>';
      }).join("");
      Array.prototype.forEach.call(document.querySelectorAll(".history-item"), function (el) { el.onclick = function () { openHistory(Number(el.dataset.id)); }; });
    });
  }
  function openHistory(id) {
    call("/ai/skin/scan/" + id, {}).then(function (d) {
      if (d.code !== 200 || !d.data) { toast(d.msg || UI.scan_failed); return; }
      var row = d.data; state.scan = row;
      if (row.status === "done") {
        renderResult(row);
        fetch(API + "/ai/skin/scan/" + id + "/image", {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json", "X-Client": "web" },
          body: JSON.stringify({ app_key: "tools", feature: FEATURE, device: device, timestamp: Math.floor(Date.now() / 1000) })
        }).then(function (r) { return r.ok ? r.blob() : null; }).then(function (blob) {
          if (!blob) return;
          var url = URL.createObjectURL(blob);
          $("resultThumb").innerHTML = '<img src="' + esc(url) + '" alt="">';
        }).catch(function () {});
      } else { toast(row.status === "failed" ? UI.scan_failed : UI.scan_pending); }
    });
  }
  function share() {
    if (!state.scan) return;
    call("/ai/skin/scan/" + state.scan.id + "/share", {}).then(function (d) {
      if (d.code !== 200 || !d.data) { toast(d.msg || UI.share_failed); return; }
      var url = "https://" + location.host + "/" + LANG + "/skin/share/?token=" + encodeURIComponent(d.data.token);
      if (navigator.share) navigator.share({ title: document.title, url: url }).catch(function () {});
      else if (navigator.clipboard) navigator.clipboard.writeText(url).then(function () { toast(UI.share_copied); });
      else prompt(UI.share, url);
    });
  }
  function deleteScan() {
    if (!state.scan || !confirm(UI.delete_confirm)) return;
    call("/ai/skin/scan/" + state.scan.id + "/delete", {}).then(function (d) { if (d.code === 200) { resetScan(); refreshAccount(); } else toast(d.msg || UI.scan_failed); });
  }

  $("loginBtn").onclick = function (e) { e.preventDefault(); needLogin(); };
  $("accountBtn").onclick = function () { location.href = accountUrl(); };
  $("buyBtn").href = pricingUrl();
  $("fileInput").onchange = function () { handleFiles(this.files); this.value = ""; };
  $("cameraInput").onchange = function () { handleFiles(this.files); this.value = ""; };
  $("scanButton").onclick = function () { if (!state.warned) { $("warningModal").classList.remove("hidden"); return; } startScan(); };
  $("warningContinue").onclick = function () { state.warned = true; $("warningModal").classList.add("hidden"); startScan(); };
  $("confirmScan").onclick = function () { $("confirmModal").classList.add("hidden"); startScan(); };
  $("backBtn").onclick = function (e) { e.preventDefault(); resetScan(); };
  $("shareBtn").onclick = share;
  $("deleteBtn").onclick = deleteScan;
  $("historyRefresh").onclick = function (e) { e.preventDefault(); loadHistory(); };
  $("installBtn").onclick = function () { if (window.__deferredPrompt) { window.__deferredPrompt.prompt(); window.__deferredPrompt = null; } };
  document.querySelectorAll("[data-close]").forEach(function (b) { b.onclick = function () { b.closest(".modal").classList.add("hidden"); }; });
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); window.__deferredPrompt = e; $("pwaBanner").classList.remove("hidden"); });
  window.addEventListener("online", function () { $("offlineBar").classList.add("hidden"); });
  window.addEventListener("offline", function () { $("offlineBar").classList.remove("hidden"); });
  if (!navigator.onLine) $("offlineBar").classList.remove("hidden");
  refreshAccount();
})();
