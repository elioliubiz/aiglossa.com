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
  var state = { user: null, balance: 0, files: [], previews: [], images: [], active: 0, scan: null, history: [], historyUrls: [], warned: false };

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
  function statusLabel(status) { return UI["status_" + status] || status; }
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

  function skinTypeText(value) { var key = value === "acne-prone" ? "acne" : value; return UI["skin_" + key] || value || ""; }
  function levelText(value) { var key = value === "generally_suitable" ? "suitable" : value; return UI["level_" + key] || value || ""; }
  function imageFor(index) { return state.images[index] || state.previews[index] || ""; }
  function chip(text, level) {
    var cls = level === "caution" ? "warn" : (level === "avoid_if_allergic" ? "bad" : (level === "generally_suitable" || level === "level_suitable" ? "good" : ""));
    return '<span class="skin-chip ' + cls + '">' + esc(text) + '</span>';
  }
  function list(items) {
    if (!items || !items.length) return "";
    return '<ul class="skin-list">' + items.map(function (x) { return '<li>' + esc(typeof x === "string" ? x : (x.text || x.advice || x.reason || "")) + '</li>'; }).join("") + '</ul>';
  }
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
    var keyHtml = keys.length ? '<div class="skin-key-grid">' + keys.map(function (k) {
      return '<div class="skin-key-card"><b>' + esc(k.name) + '</b><span>' + esc(k.why || "") + (k.caution ? ' · ' + esc(k.caution) : "") + '</span></div>';
    }).join("") + '</div>' : "";
    var skinHtml = skins.length ? '<div class="skin-badges">' + skins.map(function (x) { return chip(skinTypeText(x.type) + " · " + levelText(x.level), x.level); }).join("") + '</div>' : "";
    var popHtml = pops.length ? '<ul class="skin-list">' + pops.map(function (x) { return '<li><b>' + esc(x.group) + '</b> · ' + esc(x.advice || "") + (x.reason ? ' — ' + esc(x.reason) : "") + '</li>'; }).join("") + '</ul>' : "";
    return '<section class="skin-product" data-product="' + index + '">' +
      '<div class="skin-product-head"><div><div class="skin-product-brand">' + esc(pr.brand || "") + ' · ' + esc(pr.category || "") + '</div><div class="skin-product-name">' + esc(pr.name || pr.name_original || UI.product) + '</div></div></div>' +
      (unsupported ? '<div class="skin-unsupported">' + esc(UI.unsupported) + '</div>' : '') +
      '<p class="skin-summary">' + esc(p.summary || "") + '</p>' +
      (keyHtml ? '<h3 class="skin-section-title">' + esc(UI.key_ingredients) + '</h3>' + keyHtml : '') +
      '<div class="skin-duo">' +
        (skinHtml ? '<div><h3 class="skin-section-title">' + esc(UI.skin_types) + '</h3>' + skinHtml + '</div>' : '') +
        (popHtml ? '<div><h3 class="skin-section-title">' + esc(UI.population) + '</h3>' + popHtml + '</div>' : '') +
      '</div>' +
      (cautions.length ? '<h3 class="skin-section-title">' + esc(UI.cautions) + '</h3>' + list(cautions) : '') +
      (usage.length ? '<h3 class="skin-section-title">' + esc(UI.usage) + '</h3>' + list(usage) : '') +
      '<div class="skin-ing-head"><h3 class="skin-section-title">' + esc(UI.ingredients) + ' <span>' + ings.length + '</span></h3>' + (ings.length ? '<button type="button" class="ing-more" data-ing-toggle="' + index + '">' + esc(UI.show_all) + '</button>' : '') + '</div>' +
      (ings.length ? '<div class="skin-ing hidden" id="skin-ing-' + index + '">' + ings.map(function (x) {
        var orig = String(x.original_text || "").trim(), name = String(x.name || "").trim();
        var same = orig && orig.toLowerCase() === name.toLowerCase();
        return '<div class="skin-ing-row"><div><b>' + esc(name || orig) + '</b>' + (orig && !same ? '<em>' + esc(UI.original) + ': ' + esc(orig) + '</em>' : '') + '</div><span>' + esc(x.function || x.what_it_is || "") + (x.flags && x.flags.length ? ' · ' + esc(x.flags.join(", ")) : "") + '</span></div>';
      }).join("") + '</div>' : '<p class="skin-empty">' + esc(UI.no_ingredients) + '</p>') +
      (notes.length ? '<h3 class="skin-section-title">' + esc(UI.data_notes) + '</h3>' + list(notes) : '') +
      '</section>';
  }
  function overviewCard(c, products) {
    if (!c || !Object.keys(c).length) return "";
    var roles = (c.product_roles || []).map(function (r) { return '<span class="skin-role-chip"><b>' + (Number(r.image_index) + 1) + '</b>' + esc(r.role || "") + '</span>'; }).join("");
    var overlaps = (c.overlaps || []).map(function (o) { return '<li><b>' + esc(o.ingredient || "") + '</b> · ' + esc(o.note || "") + '</li>'; }).join("");
    var cautions = (c.cautions || []).map(function (o) { return '<li><b>' + esc(o.text || "") + '</b> · ' + esc(o.reason || "") + '</li>'; }).join("");
    var routine = c.routine || {};
    var route = "";
    if (routine.am && routine.am.length) route += '<span class="skin-route">AM ' + routine.am.map(function (i) { return Number(i) + 1; }).join(" → ") + '</span>';
    if (routine.pm && routine.pm.length) route += '<span class="skin-route">PM ' + routine.pm.map(function (i) { return Number(i) + 1; }).join(" → ") + '</span>';
    return '<section class="skin-overview"><div class="skin-overview-kicker">' + esc(UI.combined) + '</div><p class="skin-overview-summary">' + esc(c.summary || "") + '</p>' +
      (roles ? '<div class="skin-role-row">' + roles + '</div>' : '') +
      (overlaps ? '<div class="skin-overview-block"><h4>' + esc(UI.overlaps) + '</h4><ul class="skin-list">' + overlaps + '</ul></div>' : '') +
      (cautions ? '<div class="skin-overview-block"><h4>' + esc(UI.cautions) + '</h4><ul class="skin-list">' + cautions + '</ul></div>' : '') +
      ((route || (routine.notes && routine.notes.length)) ? '<div class="skin-overview-block"><h4>' + esc(UI.routine) + '</h4>' + (route ? '<div class="skin-route-row">' + route + '</div>' : '') + list(routine.notes) + '</div>' : '') +
      '</section>';
  }
  function tabButton(p, index) {
    var pr = p.product || {};
    var img = imageFor(index);
    return '<button type="button" class="skin-tab' + (index === state.active ? ' active' : '') + '" data-tab="' + index + '" role="tab" aria-selected="' + (index === state.active) + '">' +
      '<span class="skin-tab-thumb">' + (img ? '<img src="' + esc(img) + '" alt="">' : '<span>' + (index + 1) + '</span>') + '</span>' +
      '<span class="skin-tab-copy"><b>' + esc(pr.name || pr.name_original || UI.product) + '</b><small>' + esc(pr.category || "") + '</small></span></button>';
  }
  function renderProductPanel(products) {
    $("productPanel").innerHTML = productCard(products[state.active], state.active);
    var toggle = $("productPanel").querySelector("[data-ing-toggle]");
    if (toggle) toggle.onclick = function () {
      var box = $("skin-ing-" + state.active);
      if (box) box.classList.toggle("hidden");
      toggle.textContent = box && box.classList.contains("hidden") ? UI.show_all : UI.show_less;
    };
  }
  function renderTabs(products) {
    var tabs = $("skinTabs");
    if (!tabs) return;
    tabs.innerHTML = products.map(tabButton).join("");
    Array.prototype.forEach.call(tabs.querySelectorAll("[data-tab]"), function (btn) {
      btn.onclick = function () { state.active = Number(btn.dataset.tab); renderTabs(products); renderProductPanel(products); };
    });
  }
  function renderStack(products) {
    var stack = $("resultThumb");
    var imgs = products.map(function (_, i) {
      var img = imageFor(i);
      return '<span class="scan-stack-item">' + (img ? '<img src="' + esc(img) + '" alt="">' : '<i>' + (i + 1) + '</i>') + '</span>';
    }).join("");
    stack.innerHTML = '<div class="scan-stack">' + imgs + '</div>';
  }
  function renderResult(row) {
    var report = row.report || {}; var products = report.products || [];
    if (!products.length) return;
    state.active = 0;
    if (state.previews.length) state.images = state.previews.slice();
    var multi = products.length > 1;
    $("heroView").classList.add("hidden"); $("resultView").classList.remove("hidden");
    var first = products[0] || {}; var pr = first.product || {};
    $("resultKicker").textContent = UI.result_title;
    var productNames = products.map(function (x) { var pp = x.product || {}; return pp.name || pp.name_original || UI.product; });
    $("resultName").classList.toggle("multi", multi);
    $("resultName").textContent = multi ? productNames.join(" + ") : productNames[0];
    $("resultMeta").textContent = multi ? (products.length + " " + (UI.product_unit || UI.products)) : ((pr.brand || "") + (pr.category ? " · " + pr.category : ""));
    renderStack(products);
    var tabs = multi ? '<div class="skin-tabs" id="skinTabs" role="tablist"></div>' : "";
    $("reportMain").innerHTML = (multi ? overviewCard(report.combined, products) : "") + tabs + '<div id="productPanel" class="skin-panel"></div>';
    if (multi) renderTabs(products);
    renderProductPanel(products);
    $("reportSide").innerHTML = '<div class="skin-side">' +
      '<div class="skin-side-kicker">' + esc(UI.result_title) + '</div>' +
      '<div class="skin-side-price">' + coinText(row.credits || 0) + '<span> ' + esc(UI.credits) + '</span></div>' +
      '<div class="side-line"><span>' + esc(UI.products) + '</span><b>' + products.length + '</b></div>' +
      '<div class="side-line"><span>' + esc(UI.pay_balance) + '</span><b>' + coinText(state.balance) + '</b></div>' +
      '<button class="btn full" id="scanAnother">' + esc(UI.scan_button) + '</button>' +
      '<a class="btn ghost full skin-side-buy" href="' + pricingUrl() + '">' + esc(UI.buy) + '</a>' +
      '<p class="skin-side-note">' + esc(UI.footer_disclaimer || report.disclaimer || "") + '</p></div>';
    $("scanAnother").onclick = resetScan;
    ensureImages(row, products);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function ensureImages(row, products) {
    var jobs = [];
    for (var i = 0; i < products.length; i++) {
      if (imageFor(i)) continue;
      jobs.push((function (index) {
        return fetch(API + "/ai/skin/scan/" + row.id + "/image?index=" + index, {
          method: "POST", credentials: "include",
          headers: { "Content-Type": "application/json", "X-Client": "web" },
          body: JSON.stringify({ app_key: "tools", feature: FEATURE, device: device, timestamp: Math.floor(Date.now() / 1000) })
        }).then(function (r) { return r.ok ? r.blob() : null; }).then(function (blob) {
          if (blob) state.images[index] = URL.createObjectURL(blob);
        }).catch(function () {});
      })(i));
    }
    if (!jobs.length) return;
    Promise.all(jobs).then(function () {
      renderStack(products);
      if (products.length > 1) renderTabs(products);
    });
  }
  function showHome() { $("heroView").classList.remove("hidden"); $("resultView").classList.add("hidden"); }
  function resetScan() {
    state.files = []; state.previews.forEach(function (u) { URL.revokeObjectURL(u); }); state.images.forEach(function (u) { if (u) URL.revokeObjectURL(u); }); state.previews = []; state.images = []; state.scan = null;
    filesToPreview(); showHome(); $("scanButton").classList.add("hidden"); $("fileInput").value = ""; $("cameraInput").value = ""; $("reportMain").innerHTML = ""; $("reportSide").innerHTML = "";
  }
  function loadHistory() {
    if (!state.user) return;
    state.historyUrls.forEach(function (u) { URL.revokeObjectURL(u); });
    state.historyUrls = [];
    call("/ai/skin/works", {}).then(function (d) {
      if (d.code !== 200 || !d.data) return;
      state.history = d.data.items || [];
      if (!state.history.length) { $("historyList").innerHTML = '<div class="history-empty">' + esc(UI.no_history) + '</div>'; return; }
      $("historyList").innerHTML = state.history.map(function (x) {
        var count = x.product_count || 1;
        var meta = count + " " + (UI.product_unit || UI.products) + " · " + statusLabel(x.status);
        return '<button class="history-item" data-id="' + x.id + '"><span class="history-thumb" data-history-thumb="' + x.id + '">' + (x.has_image ? "◌" : "—") + '</span><span class="history-copy"><b>' + esc(x.product_name || UI.product) + '</b><small>' + esc(x.headline || "") + '</small></span><span class="history-status">' + esc(meta) + '</span></button>';
      }).join("");
      Array.prototype.forEach.call(document.querySelectorAll(".history-item"), function (el) { el.onclick = function () { openHistory(Number(el.dataset.id)); }; });
      state.history.forEach(function (x) { if (x.has_image) loadHistoryThumb(x.id); });
    });
  }
  function loadHistoryThumb(id) {
    fetch(API + "/ai/skin/scan/" + id + "/image?index=0", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", "X-Client": "web" },
      body: JSON.stringify({ app_key: "tools", feature: FEATURE, device: device, timestamp: Math.floor(Date.now() / 1000) })
    }).then(function (r) { return r.ok ? r.blob() : null; }).then(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob); state.historyUrls.push(url);
      var el = document.querySelector('[data-history-thumb="' + id + '"]');
      if (el) el.innerHTML = '<img src="' + esc(url) + '" alt="">';
    }).catch(function () {});
  }
  function openHistory(id) {
    call("/ai/skin/scan/" + id, {}).then(function (d) {
      if (d.code !== 200 || !d.data) { toast(d.msg || UI.scan_failed); return; }
      var row = d.data; state.scan = row;
      if (row.status === "done") { state.images = []; renderResult(row); } else { toast(row.status === "failed" ? UI.scan_failed : UI.scan_pending); }
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
  function closeLangOutside(e) {
    var el = $("footerLang");
    if (el && el.open && !el.contains(e.target)) el.open = false;
  }
  document.addEventListener("click", closeLangOutside);
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") { var el = $("footerLang"); if (el) el.open = false; } });
  refreshAccount();
})();
