/* aiglossa skin — public report share page. */
(function () {
  "use strict";
  var UI = JSON.parse(document.getElementById("ui").textContent);
  var host = location.hostname;
  var API = host.indexOf("staging.aiglossa.com") >= 0 ? "https://dev.staging.aiglossa.com" : "https://api.aiglossa.com";
  var LANG = document.documentElement.lang || "en";
  var token = new URLSearchParams(location.search).get("token") || "";
  var $ = function (id) { return document.getElementById(id); };
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function call(path, data) { return fetch(API + path, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-Client": "web" }, body: JSON.stringify(Object.assign({ app_key: "tools", feature: "skin-scan", timestamp: Math.floor(Date.now() / 1000) }, data || {})) }).then(function (r) { return r.json(); }); }
  function skinTypeText(value) { var key = value === "acne-prone" ? "acne" : value; return UI["skin_" + key] || value || ""; }
  function levelText(value) { var key = value === "generally_suitable" ? "suitable" : value; return UI["level_" + key] || value || ""; }
  function chip(text, level) {
    var cls = level === "caution" ? "warn" : (level === "avoid_if_allergic" ? "bad" : (level === "generally_suitable" ? "good" : ""));
    return '<span class="skin-chip ' + cls + '">' + esc(text) + '</span>';
  }
  function list(items) {
    return items && items.length ? '<ul class="skin-list">' + items.map(function (x) { return '<li>' + esc(typeof x === "string" ? x : (x.text || x.advice || x.reason || "")) + '</li>'; }).join("") + '</ul>' : "";
  }
  function productCard(p, index) {
    var pr = p.product || {}, ings = p.ingredients || [];
    var key = (p.key_ingredients || []).map(function (k) { return '<div class="skin-key-card"><b>' + esc(k.name) + '</b><span>' + esc(k.why || "") + (k.caution ? ' · ' + esc(k.caution) : "") + '</span></div>'; }).join("");
    var skins = (p.skin_types || []).map(function (x) { return chip(skinTypeText(x.type) + " · " + levelText(x.level), x.level); }).join("");
    var pops = (p.population_notes || []).map(function (x) { return '<li><b>' + esc(x.group) + '</b> · ' + esc(x.advice || "") + (x.reason ? ' — ' + esc(x.reason) : "") + '</li>'; }).join("");
    var rows = ings.map(function (x) { return '<div class="skin-ing-row"><div><b>' + esc(x.name || x.original_text) + '</b>' + (x.original_text && x.original_text !== x.name ? '<em>' + esc(UI.original) + ': ' + esc(x.original_text) + '</em>' : '') + '</div><span>' + esc(x.function || x.what_it_is || "") + (x.flags && x.flags.length ? ' · ' + esc(x.flags.join(", ")) : "") + '</span></div>'; }).join("");
    return '<section class="skin-product" data-product="' + index + '">' +
      '<div class="skin-product-brand">' + esc(pr.brand || "") + ' · ' + esc(pr.category || "") + '</div><h2 class="skin-product-name">' + esc(pr.name || pr.name_original || UI.product) + '</h2>' +
      (p.category_supported === false ? '<div class="skin-unsupported">' + esc(UI.unsupported) + '</div>' : '') +
      '<p class="skin-summary">' + esc(p.summary || "") + '</p>' +
      (key ? '<h3 class="skin-section-title">' + esc(UI.key_ingredients) + '</h3><div class="skin-key-grid">' + key + '</div>' : '') +
      '<div class="skin-duo">' + (skins ? '<div><h3 class="skin-section-title">' + esc(UI.skin_types) + '</h3><div class="skin-badges">' + skins + '</div></div>' : '') + (pops ? '<div><h3 class="skin-section-title">' + esc(UI.population) + '</h3><ul class="skin-list">' + pops + '</ul></div>' : '') + '</div>' +
      (p.cautions && p.cautions.length ? '<h3 class="skin-section-title">' + esc(UI.cautions) + '</h3>' + list(p.cautions) : '') +
      (p.usage && p.usage.length ? '<h3 class="skin-section-title">' + esc(UI.usage) + '</h3>' + list(p.usage) : '') +
      '<div class="skin-ing-head"><h3 class="skin-section-title">' + esc(UI.ingredients) + ' <span>' + ings.length + '</span></h3>' + (ings.length ? '<button type="button" class="ing-more" data-ing-toggle="' + index + '">' + esc(UI.show_all) + '</button>' : '') + '</div>' +
      (ings.length ? '<div class="skin-ing hidden" id="share-ing-' + index + '">' + rows + '</div>' : '') +
      '</section>';
  }
  function overview(c) {
    if (!c || !Object.keys(c).length) return "";
    var roles = (c.product_roles || []).map(function (r) { return '<span class="skin-role-chip"><b>' + (Number(r.image_index) + 1) + '</b>' + esc(r.role || "") + '</span>'; }).join("");
    var overlaps = (c.overlaps || []).map(function (o) { return '<li><b>' + esc(o.ingredient || "") + '</b> · ' + esc(o.note || "") + '</li>'; }).join("");
    var cautions = (c.cautions || []).map(function (o) { return '<li><b>' + esc(o.text || "") + '</b> · ' + esc(o.reason || "") + '</li>'; }).join("");
    var routine = c.routine || {}, route = "";
    if (routine.am && routine.am.length) route += '<span class="skin-route">AM ' + routine.am.map(function (i) { return Number(i) + 1; }).join(" → ") + '</span>';
    if (routine.pm && routine.pm.length) route += '<span class="skin-route">PM ' + routine.pm.map(function (i) { return Number(i) + 1; }).join(" → ") + '</span>';
    return '<section class="skin-overview"><div class="skin-overview-kicker">' + esc(UI.combined) + '</div><p class="skin-overview-summary">' + esc(c.summary || "") + '</p>' +
      (roles ? '<div class="skin-role-row">' + roles + '</div>' : '') +
      (overlaps ? '<div class="skin-overview-block"><h4>' + esc(UI.overlaps) + '</h4><ul class="skin-list">' + overlaps + '</ul></div>' : '') +
      (cautions ? '<div class="skin-overview-block"><h4>' + esc(UI.cautions) + '</h4><ul class="skin-list">' + cautions + '</ul></div>' : '') +
      ((route || (routine.notes && routine.notes.length)) ? '<div class="skin-overview-block"><h4>' + esc(UI.routine) + '</h4>' + (route ? '<div class="skin-route-row">' + route + '</div>' : '') + list(routine.notes) + '</div>' : '') +
      '</section>';
  }
  function tab(p, i, active) {
    var pr = p.product || {};
    return '<button class="skin-tab' + (i === active ? ' active' : '') + '" data-tab="' + i + '"><span class="skin-tab-thumb">' + (i + 1) + '</span><span class="skin-tab-copy"><b>' + esc(pr.name || pr.name_original || UI.product) + '</b><small>' + esc(pr.category || "") + '</small></span></button>';
  }
  function renderShare(report) {
    var products = report.products || [], multi = products.length > 1;
    if (!products.length) { $("shareContent").innerHTML = '<div class="skin-empty">' + esc(UI.scan_failed) + '</div>'; return; }
    var names = products.map(function (x) { var p = x.product || {}; return p.name || p.name_original || UI.product; });
    var active = 0;
    var head = '<div class="skin-overview-kicker">' + esc(UI.result_title) + '</div><h1 class="skin-share-title">' + esc(multi ? names.join(" + ") : names[0]) + '</h1><p class="skin-share-meta">' + (multi ? products.length + " " + (UI.product_unit || UI.products) : esc((products[0].product || {}).brand || "")) + '</p>';
    function panel(index) { return productCard(products[index], index); }
    function tabs() { return '<div class="skin-tabs" id="shareTabs">' + products.map(function (p, i) { return tab(p, i, active); }).join("") + '</div>'; }
    function bind() {
      Array.prototype.forEach.call(document.querySelectorAll('[data-ing-toggle]'), function (btn) {
        btn.onclick = function () {
          var box = document.getElementById("share-ing-" + active);
          if (box) box.classList.toggle("hidden");
          btn.textContent = box && box.classList.contains("hidden") ? UI.show_all : UI.show_less;
        };
      });
      Array.prototype.forEach.call(document.querySelectorAll("[data-tab]"), function (btn) {
        btn.onclick = function () { active = Number(btn.dataset.tab); update(); };
      });
    }
    function update() {
      $("shareContent").innerHTML = head + (multi ? overview(report.combined) + tabs() : "") + '<div id="sharePanel">' + panel(active) + '</div><p class="nutrition-note">' + esc(UI.footer_disclaimer || report.disclaimer || "") + '</p>';
      bind();
    }
    update();
    document.title = (multi ? names.join(" + ") : names[0]) + " — AIGLOSSA";
  }
  if (!token) { $("shareContent").innerHTML = '<div class="skin-empty">' + esc(UI.no_history) + '</div>'; return; }
  call("/ai/skin/share/" + encodeURIComponent(token), {}).then(function (d) {
    if (d.code !== 200 || !d.data) { $("shareContent").innerHTML = '<div class="skin-empty">' + esc(UI.scan_failed) + '</div>'; return; }
    renderShare(d.data.report || {});
  }).catch(function () { $("shareContent").innerHTML = '<div class="skin-empty">' + esc(UI.network_error) + '</div>'; });
})();
