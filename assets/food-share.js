/* Public read-only food report page. No auth, no user identity, no label image. */
(function () {
  "use strict";
  var UI = JSON.parse(document.getElementById("ui").textContent);
  var host = location.hostname;
  var API = host === "localhost" || host === "127.0.0.1" ? "/api" : (host.indexOf("staging.aiglossa.com") >= 0 ? "https://dev.staging.aiglossa.com" : "https://api.aiglossa.com");
  var params = new URLSearchParams(location.search);
  var token = params.get("token") || "";
  var $ = function (id) { return document.getElementById(id); };
  function esc(v) { return String(v == null ? "" : v).replace(/[&<>"']/g, function (c) { return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]; }); }
  function fmt(v, unit) { return v === null || v === undefined || v === "" ? UI.not_labeled : esc(v) + (unit ? " " + esc(unit) : ""); }
  function nrv(report, key) { var n = (report.nrv_percent || {})[key]; return n == null ? "—" : esc(UI.nrv) + " " + n + "%"; }
  function level(n) { return n >= 30 ? "red" : n >= 15 ? "amber" : ""; }
  function nut(label, value, unit, value2, report, key) {
    var n = (report.nrv_percent || {})[key]; var lv = n == null ? "" : level(Number(n));
    return '<div class="nut-item"><div class="nut-line"><span class="nut-label">' + esc(label) + '</span><span class="nut-value"><b>' + fmt(value, unit) + '</b>' + (value2 ? '<em>· ' + esc(value2) + '</em>' : '') + '</span><span class="nut-nrv ' + (lv === "red" ? "hi" : lv === "amber" ? "mid" : "") + '">' + nrv(report, key) + '</span></div><div class="bar"><i class="' + lv + '" style="width:' + (n == null ? 0 : Math.min(100, Math.max(2, Number(n)))) + '%"></i></div></div>';
  }
  function fail() { $("shareLoading").classList.add("hidden"); $("shareError").classList.remove("hidden"); }
  if (!token) { fail(); return; }
  fetch(API + "/ai/food/share/" + encodeURIComponent(token), {
    method: "POST", credentials: "include",
    headers: {"Content-Type":"application/json","X-Client":"web"},
    body: JSON.stringify({app_key:"tools", timestamp: Math.floor(Date.now()/1000)})
  }).then(function (r) { return r.json(); }).then(function (data) {
    if (data.code !== 200 || !data.data || !data.data.report) { fail(); return; }
    var report = data.data.report, p = report.product || {}, a = report.analysis || {};
    var name = p.name || p.name_original || UI.result_title;
    document.title = name + " · AIGLOSSA FOOD";
    $("shareName").textContent = name;
    var meta = []; if (p.brand) meta.push(p.brand); if (p.category) meta.push(p.category); if (report.serving && report.serving.basis) meta.push(report.serving.basis);
    $("shareMeta").textContent = meta.join(" · ");
    var cautions = (a.cautions || []).map(function (x) { return "<li>" + esc(x.text || "") + "</li>"; }).join("");
    $("shareVerdict").innerHTML = '<span class="pill ' + (cautions ? "warn" : "good") + '">' + esc(UI.verdict) + '</span><h2>' + esc(a.headline || UI.result_title) + '</h2><p>' + esc(a.summary || "") + '</p>' + (cautions ? '<ul class="report-note">' + cautions + '</ul>' : "");
    var people = (report.population_notes || []).map(function (x) { var lv = x.level === "high" ? "high" : x.level === "medium" ? "medium" : ""; return '<div class="report-person ' + lv + '"><div class="rp-head"><b>' + esc(x.group || "") + '</b><span class="rp-advice">' + esc(x.advice || "") + '</span></div><p>' + esc(x.reason || "") + '</p></div>'; }).join("");
    if (people) { $("sharePeople").classList.remove("hidden"); $("sharePeople").innerHTML = '<div class="card-head"><h3>' + esc(UI.who_notes) + '</h3><span>' + esc(UI.info) + '</span></div><div class="report-people">' + people + '</div>'; }
    var n = report.nutrition || {};
    $("shareServing").textContent = (report.serving && report.serving.basis) || UI.per_100g;
    $("shareNutrition").innerHTML = nut(UI.energy, n.calories_kcal != null ? n.calories_kcal : (n.energy_kj ? Math.round(n.energy_kj / 4.184) : null), "kcal", n.energy_kj ? n.energy_kj + " kJ" : "", report, "energy") + nut(UI.protein, n.protein_g, "g", "", report, "protein") + nut(UI.fat, n.fat_g, "g", "", report, "fat") + nut(UI.sat_fat, n.saturated_fat_g, "g", "", report, "saturated_fat") + nut(UI.carb, n.carbohydrate_g, "g", "", report, "carbohydrate") + nut(UI.sugar, n.sugars_g, "g", "", report, "sugars") + nut(UI.sodium, n.sodium_mg, "mg", "", report, "sodium") + nut(UI.fiber, n.fiber_g, "g", "", report, "fiber");
    var all = report.ingredients || [];
    var normalize = function (x) { return String(x || "").replace(/\s+/g, "").toLowerCase(); };
    var ing = all.slice(0, 80).map(function (x, i) {
      var orig = String(x.original_text || "").trim(), nm = String(x.name || "").trim();
      var origHtml = orig && normalize(orig) !== normalize(nm) ? ' <span class="orig-inline">' + esc(orig) + '</span>' : "";
      var fn = String(x.function || "").trim();
      var flags = (x.flags || []).map(function (f) { return String(f || "").trim(); }).filter(Boolean);
      var badges = (fn || flags.length) ? '<div class="ing-badges">' + (fn ? '<span class="ing-badge">' + esc(fn) + '</span>' : "") + flags.map(function (f) { return '<span class="ing-badge add">' + esc(f) + '</span>'; }).join("") + '</div>' : "";
      return '<div class="report-ing' + (i >= 6 ? ' ing-extra hidden' : '') + '"><div class="ing-title"><div class="nm">' + esc(nm) + origHtml + '</div></div><div class="why">' + esc([x.what_it_is || "", x.note || ""].filter(Boolean).join(" ")) + '</div>' + badges + '</div>';
    }).join("");
    $("shareIngCount").textContent = all.length;
    $("shareIngredients").innerHTML = ing || '<p class="report-note">' + esc(UI.not_labeled) + '</p>';
    if (all.length > 6) {
      var more = document.createElement("button"); more.className = "ing-more"; more.textContent = UI.show_all + " (" + all.length + ")";
      more.onclick = function () { var open = more.dataset.open === "1"; Array.prototype.forEach.call(document.querySelectorAll(".ing-extra"), function (row) { row.classList.toggle("hidden", open); }); more.dataset.open = open ? "0" : "1"; more.textContent = open ? UI.show_all + " (" + all.length + ")" : UI.show_less; };
      $("shareIngredients").appendChild(more);
    }
    $("shareDisclaimer").textContent = report.disclaimer || UI.footer_disclaimer;
    $("shareLoading").classList.add("hidden"); $("shareContent").classList.remove("hidden");
  }).catch(fail);
})();
