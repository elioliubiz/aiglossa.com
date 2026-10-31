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
  function chip(text, level) { return '<span class="skin-chip ' + (level === "caution" ? "warn" : (level === "avoid_if_allergic" ? "bad" : (level === "generally_suitable" ? "good" : ""))) + '">' + esc(text) + '</span>'; }
  function list(items) { return items && items.length ? '<ul class="skin-list">' + items.map(function (x) { return '<li>' + esc(typeof x === "string" ? x : (x.text || x.advice || x.reason || "")) + '</li>'; }).join("") + '</ul>' : ""; }
  function card(p) {
    var pr = p.product || {}, ings = p.ingredients || [];
    var key = (p.key_ingredients || []).map(function (k) { return '<div><b>' + esc(k.name) + '</b><span>' + esc(k.why || "") + (k.caution ? ' · ' + esc(k.caution) : "") + '</span></div>'; }).join("");
    var skins = (p.skin_types || []).map(function (s) { return chip(s.type + ": " + (s.level || ""), s.level); }).join("");
    var rows = ings.map(function (x) { return '<div class="skin-ing-row"><div><b>' + esc(x.name || x.original_text) + '</b>' + (x.original_text && x.original_text !== x.name ? '<em>' + esc(UI.original) + ': ' + esc(x.original_text) + '</em>' : '') + '</div><span>' + esc(x.function || x.what_it_is || "") + (x.flags && x.flags.length ? ' · ' + esc(x.flags.join(", ")) : "") + '</span></div>'; }).join("");
    return '<section class="card skin-product"><div class="skin-product-brand">' + esc(pr.brand || "") + ' · ' + esc(pr.category || "") + '</div><h1 class="skin-share-title">' + esc(pr.name || pr.name_original || UI.product) + '</h1><p class="skin-share-meta">' + esc(p.headline || "") + '</p>' +
      (p.category_supported === false ? '<div class="skin-unsupported">' + esc(UI.unsupported) + '</div>' : '') +
      '<p class="skin-card">' + esc(p.summary || "") + '</p>' +
      (key ? '<h3 class="skin-card">' + esc(UI.key_ingredients) + '</h3><div class="skin-key">' + key + '</div>' : '') +
      (skins ? '<h3 class="skin-card">' + esc(UI.skin_types) + '</h3><div class="skin-badges">' + skins + '</div>' : '') +
      (p.population_notes && p.population_notes.length ? '<h3 class="skin-card">' + esc(UI.population) + '</h3><ul class="skin-list">' + p.population_notes.map(function (x) { return '<li><b>' + esc(x.group) + '</b> · ' + esc(x.advice || "") + '</li>'; }).join("") + '</ul>' : '') +
      '<h3 class="skin-card">' + esc(UI.ingredients) + ' <span style="color:var(--muted);font-weight:400">' + ings.length + '</span></h3><div class="skin-ing">' + rows + '</div>' +
      (p.cautions && p.cautions.length ? '<h3 class="skin-card">' + esc(UI.cautions) + '</h3>' + list(p.cautions) : '') +
      (p.usage && p.usage.length ? '<h3 class="skin-card">' + esc(UI.usage) + '</h3>' + list(p.usage) : '') +
      '</section>';
  }
  function combined(c) {
    if (!c || !Object.keys(c).length) return "";
    var roles = (c.product_roles || []).map(function (r) { return '<div class="skin-role"><b>' + esc(UI.product) + " " + (Number(r.image_index) + 1) + '</b><span>' + esc(r.role || "") + '</span></div>'; }).join("");
    return '<section class="skin-combined skin-card"><h3>' + esc(UI.combined) + '</h3><p>' + esc(c.summary || "") + '</p>' + (roles ? '<h3 class="skin-card">' + esc(UI.roles) + '</h3>' + roles : '') +
      (c.cautions && c.cautions.length ? '<h3 class="skin-card">' + esc(UI.cautions) + '</h3><ul class="skin-list">' + c.cautions.map(function (x) { return '<li><b>' + esc(x.text) + '</b> · ' + esc(x.reason || "") + '</li>'; }).join("") + '</ul>' : '') + '</section>';
  }
  if (!token) { $("shareContent").innerHTML = '<div class="skin-empty">' + esc(UI.no_history) + '</div>'; return; }
  call("/ai/skin/share/" + encodeURIComponent(token), {}).then(function (d) {
    if (d.code !== 200 || !d.data) { $("shareContent").innerHTML = '<div class="skin-empty">' + esc(UI.scan_failed) + '</div>'; return; }
    var report = d.data.report || {}, products = report.products || [];
    $("shareContent").innerHTML = (products.length > 1 ? combined(report.combined) : "") + products.map(card).join("") + '<p class="nutrition-note">' + esc(report.disclaimer || "") + '</p>';
    document.title = (products[0] && (products[0].product.name || products[0].product.name_original) || document.title) + " — AIGLOSSA";
  }).catch(function () { $("shareContent").innerHTML = '<div class="skin-empty">' + esc(UI.network_error) + '</div>'; });
})();
