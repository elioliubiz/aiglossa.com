/* aiglossa food — scan, report, history, wallet, PWA. */
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
  var LANG_NAME = document.documentElement.getAttribute("data-lang-name") || LANG;
  var FEATURE = "food-scan";
  var SCAN_CREDITS = 3;
  var device = localStorage.getItem("aig_device") || (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()));
  localStorage.setItem("aig_device", device);
  var state = { user: null, balance: 0, file: null, preview: "", scan: null, history: [], lastScan: null, thumbUrls: [] };

  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function call(path, data) {
    var body = Object.assign({ app_key: "tools", feature: FEATURE, device: device, timestamp: Math.floor(Date.now() / 1000) }, data || {});
    return fetch(API + path, {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", "X-Client": "web" },
      body: JSON.stringify(body)
    }).then(function (r) { return r.json(); });
  }
  function coinText(value) {
    var n = Number(value || 0);
    return (Number.isInteger(n) ? String(n) : n.toFixed(2));
  }
  function coinHtml(value) {
    return coinText(value) + " <span>" + esc(UI.credits) + "</span>";
  }

  function toast(text) {
    var el = $("toast");
    el.textContent = text || "";
    el.classList.toggle("hidden", !text);
    clearTimeout(el._timer);
    if (text) el._timer = setTimeout(function () { el.classList.add("hidden"); }, 2800);
  }
  function loginUrl() { return MAIN + "/" + LANG + "/login.html?next=" + encodeURIComponent(location.href); }
  function accountUrl() { return MAIN + "/" + LANG + "/account.html?next=" + encodeURIComponent(location.href); }
  function needLogin() { location.href = loginUrl(); }

  function avatarUrl(url) {
    return /^https?:\/\//.test(url) ? url : API + url;
  }

  function setAvatar(user) {
    var el = $("avatar");
    var initial = user ? String(user.email || user.nickname || "?").charAt(0).toUpperCase() : "?";
    if (user && user.avatar) {
      el.innerHTML = '<img src="' + esc(avatarUrl(user.avatar)) + '" alt="">';
      var img = el.querySelector("img");
      img.onerror = function () { el.textContent = initial; };
    } else {
      el.textContent = initial;
    }
  }

  function statusLabel(status) {
    if (status === "done") return UI.status_done;
    if (status === "failed") return UI.status_failed;
    return UI.status_pending;
  }

  function syncAuth(signedIn) {
    var recent = $("recentSection");
    if (recent) recent.classList.toggle("hidden", !signedIn);
    if (!signedIn && !$("resultView").classList.contains("hidden")) showHome();
  }

  function refreshAccount() {
    return call("/wallet/summary", {}).then(function (data) {
      if (data.code === 200 && data.data) {
        state.user = data.data.user || {};
        state.balance = Number(data.data.coins || 0);
        setAvatar(state.user);
        $("balanceText").innerHTML = coinHtml(state.balance);
        syncAuth(true);
        return true;
      }
      state.user = null;
      state.balance = 0;
      setAvatar(null);
      $("balanceText").innerHTML = esc(UI.sign_in) + " <span>" + esc(UI.credits) + "</span>";
      syncAuth(false);
      return false;
    }).catch(function () {
      state.user = null;
      setAvatar(null);
      $("balanceText").innerHTML = esc(UI.sign_in) + " <span>" + esc(UI.credits) + "</span>";
      syncAuth(false);
      return false;
    });
  }

  function fileToImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("read failed")); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("decode failed")); };
        img.onload = function () { resolve(img); };
        img.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  function compress(file) {
    return fileToImage(file).then(function (img) {
      var max = 1600;
      var width = img.naturalWidth || img.width;
      var height = img.naturalHeight || img.height;
      var scale = Math.min(1, max / Math.max(width, height));
      var canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      var ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      var data = canvas.toDataURL("image/jpeg", 0.88);
      return { image: data.split(",")[1], mime: "image/jpeg", preview: data };
    });
  }

  function handleFile(file) {
    if (!file) return;
    if (!/^image\/(jpeg|png|webp)$/.test(file.type || "")) { toast(UI.image_invalid); return; }
    if (file.size > 8 * 1024 * 1024) { toast(UI.image_invalid); return; }
    state.file = file;
    var reader = new FileReader();
    reader.onload = function () {
      state.preview = String(reader.result);
      $("preview").src = state.preview;
      $("previewWrap").classList.remove("hidden");
      $("scanButton").classList.remove("hidden");
      $("scanButton").disabled = false;
    };
    reader.readAsDataURL(file);
  }

  function setScanning(on, text) {
    $("scanLoading").classList.toggle("hidden", !on);
    if (text) $("scanLoadingText").textContent = text;
    var button = $("scanButton");
    if (button) button.disabled = !!on;
    Array.prototype.forEach.call(document.querySelectorAll(".scan-actions .btn"), function (btn) {
      btn.classList.toggle("disabled", !!on);
    });
  }

  function imageCall(id) {
    return fetch(API + "/ai/food/scan/" + id + "/image", {
      method: "POST", credentials: "include",
      headers: { "Content-Type": "application/json", "X-Client": "web" },
      body: JSON.stringify({ app_key: "tools", feature: FEATURE, device: device, timestamp: Math.floor(Date.now() / 1000) })
    }).then(function (r) { return r.ok ? r.blob() : null; });
  }

  function thumbFallback() {
    var thumb = $("resultThumb");
    if (thumb) thumb.innerHTML = '<span class="thumb-empty"><svg viewBox="0 0 24 24"><rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8 8h8M8 11h8M8 14h5"/></svg></span>';
  }

  function loadScanImage(scan) {
    if (!scan || state.preview) return;
    if (!scan.has_image) { thumbFallback(); return; }
    imageCall(scan.id).then(function (blob) {
      if (!blob) { thumbFallback(); return; }
      if (state.imageUrl) URL.revokeObjectURL(state.imageUrl);
      state.imageUrl = URL.createObjectURL(blob);
      var thumb = $("resultThumb");
      thumb.innerHTML = '<img src="' + esc(state.imageUrl) + '" alt="' + esc(UI.image_alt) + '">';
    }).catch(function () { thumbFallback(); });
  }

  function showScanConfirm() {
    if (!state.user) { needLogin(); return; }
    if (!state.file) { toast(UI.image_invalid); return; }
    if (state.balance < SCAN_CREDITS) { openPay(); toast(UI.insufficient); return; }
    $("confirmText").textContent = UI.one_scan + " · " + UI.scan_cost;
    $("confirmModal").classList.remove("hidden");
  }

  function requestId() {
    return crypto.randomUUID ? crypto.randomUUID() : "scan-" + Date.now() + "-" + Math.random().toString(16).slice(2);
  }

  function startScan() {
    $("confirmModal").classList.add("hidden");
    if (!state.file) return;
    setScanning(true, UI.scanning);
    toast(UI.scanning);
    compress(state.file).then(function (data) {
      return call("/ai/food/scan", {
        language: LANG, request_id: requestId(), image: data.image, mime: data.mime
      });
    }).then(function (data) {
      if (data.code === 401) { needLogin(); return; }
      if (data.code === 402) { setScanning(false); openPay(); toast(UI.insufficient); return; }
      if (data.code === 409 && data.data && data.data.id) { poll(data.data.id); return; }
      if (data.code !== 200 || !data.data) { setScanning(false); toast(UI.scan_failed); return; }
      state.balance = Number(data.data.balance || state.balance);
      poll(data.data.id);
    }).catch(function () { setScanning(false); toast(UI.network_error); });
  }

  function poll(id, tries) {
    tries = tries || 0;
    if (tries > 40) { setScanning(false); toast(UI.scan_timeout); return; }
    setTimeout(function () {
      call("/ai/food/scan/" + id, {}).then(function (data) {
        if (data.code === 401) { needLogin(); return; }
        if (data.code !== 200 || !data.data) { setScanning(false); toast(UI.scan_failed); return; }
        var row = data.data;
        if (row.status === "done") {
          state.balance = Number(row.balance || state.balance);
          $("balanceText").innerHTML = coinHtml(state.balance);
          setScanning(false);
          renderResult(row);
          loadHistory();
          return;
        }
        if (row.status === "failed") {
          setScanning(false);
          toast(UI.scan_failed);
          loadHistory();
          return;
        }
        setScanning(true, UI.scan_pending);
        poll(id, tries + 1);
      }).catch(function () { poll(id, tries + 1); });
    }, 1400);
  }

  function showResult() {
    var footerLang = $("footerLang"); if (footerLang) footerLang.classList.add("hidden");
    $("heroView").classList.add("hidden");
    $("resultView").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function showHome() {
    var footerLang = $("footerLang"); if (footerLang) footerLang.classList.remove("hidden");
    $("resultView").classList.add("hidden");
    $("heroView").classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function fmt(value, unit) {
    if (value === null || value === undefined || value === "") return UI.not_labeled;
    return esc(value) + (unit ? " " + esc(unit) : "");
  }
  function nrvOf(report, key) {
    var n = (report.nrv_percent || {})[key];
    return (n === null || n === undefined) ? null : Number(n);
  }
  function levelOf(nrv) {
    if (nrv === null) return "";
    if (nrv >= 30) return "red";
    if (nrv >= 15) return "amber";
    return "";
  }
  function nutItem(label, value, unit, nrv, secondary, limit) {
    var level = limit ? levelOf(nrv) : "";
    var nrvText = nrv === null ? "—" : esc(UI.daily_ref) + " " + nrv + "%";
    return '<div class="nut-item"><div class="nut-line"><span class="nut-label">' + esc(label) + '</span>' +
      '<span class="nut-value"><b>' + fmt(value, unit) + '</b>' + (secondary ? '<em>（' + esc(secondary) + '）</em>' : "") + '</span>' +
      '<span class="nut-nrv ' + (level === "red" ? "hi" : level === "amber" ? "mid" : "") + '">' + nrvText + '</span></div></div>';
  }

  function renderResult(scan) {
    var report = scan.report || {};
    state.scan = scan;
    state.lastScan = report;
    var product = report.product || {};
    var name = product.name || product.name_original || UI.result_title;
    $("resultName").textContent = name;
    $("resultKicker").textContent = UI.result_title + " · " + LANG_NAME;
    var meta = [];
    if (product.brand) meta.push(product.brand);
    if (product.category) meta.push(product.category);
    if (report.serving && report.serving.basis) meta.push(report.serving.basis);
    $("resultMeta").textContent = meta.join(" · ");
    var thumb = $("resultThumb");
    thumb.innerHTML = state.preview ? '<img src="' + esc(state.preview) + '" alt="' + esc(UI.image_alt) + '">' : '<span class="thumb-skeleton" aria-label=""></span>';
    loadScanImage(scan);

    var analysis = report.analysis || {};
    var nutrition = report.nutrition || {};
    var cautions = (analysis.cautions || []).map(function (item) {
      return '<li>' + esc(item.text || "") + '</li>';
    }).join("");
    var main = '<section class="card verdict"><div class="verdict-top"><span class="pill ' + (cautions ? "warn" : "good") + '">' + esc(UI.verdict) + '</span></div>' +
      '<h2>' + esc(analysis.headline || UI.result_title) + '</h2><p>' + esc(analysis.summary || "") + '</p>' +
      (cautions ? '<div class="report-section"><h3>' + esc(UI.cautions) + '</h3><ul class="report-note">' + cautions + '</ul></div>' : '') + '</section>';

    var nut = '<section class="card"><div class="card-head"><h3>' + esc(UI.nutrition) + '</h3><span>' + esc(report.serving && report.serving.basis || UI.per_100g) + '</span></div><div class="nut-grid report">';
    nut += nutItem(UI.energy, nutrition.calories_kcal !== null && nutrition.calories_kcal !== undefined ? nutrition.calories_kcal : (nutrition.energy_kj ? Math.round(nutrition.energy_kj / 4.184) : null), "kcal", nrvOf(report, "energy"), nutrition.energy_kj ? nutrition.energy_kj + " kJ" : "", false);
    nut += nutItem(UI.protein, nutrition.protein_g, "g", nrvOf(report, "protein"), "", false);
    nut += nutItem(UI.fat, nutrition.fat_g, "g", nrvOf(report, "fat"), "", false);
    nut += nutItem(UI.sat_fat, nutrition.saturated_fat_g, "g", nrvOf(report, "saturated_fat"), "", true);
    nut += nutItem(UI.carb, nutrition.carbohydrate_g, "g", nrvOf(report, "carbohydrate"), "", false);
    nut += nutItem(UI.sugar, nutrition.sugars_g, "g", nrvOf(report, "sugars"), "", true);
    nut += nutItem(UI.sodium, nutrition.sodium_mg, "mg", nrvOf(report, "sodium"), "", true);
    nut += nutItem(UI.fiber, nutrition.fiber_g, "g", null, "", false);
    nut += '</div><p class="nutrition-note">' + esc(UI.nutrition_note) + '</p><p class="nutrition-note">' + esc(UI.energy_note) + '</p></section>';

    var allIng = report.ingredients || [];
    var normalize = function (text) { return String(text || "").replace(/\s+/g, "").toLowerCase(); };
    var ing = allIng.slice(0, 80).map(function (item, index) {
      var fn = String(item.function || "").trim();
      var flags = (item.flags || []).map(function (flag) { return String(flag || "").trim(); }).filter(Boolean);
      var flagHtml = flags.map(function (flag) { return '<span class="ing-badge add">' + esc(flag) + '</span>'; }).join("");
      var badgeHtml = (fn || flagHtml) ? '<div class="ing-badges">' + (fn ? '<span class="ing-badge">' + esc(fn) + '</span>' : "") + flagHtml + '</div>' : "";
      var why = [item.what_it_is || "", item.note || ""].filter(Boolean).join(" ");
      var orig = String(item.original_text || "").trim();
      var nm = String(item.name || "").trim();
      var same = orig && normalize(orig) === normalize(nm);
      var origHtml = (orig && !same) ? ' <span class="orig-inline">' + esc(orig) + '</span>' : "";
      var extra = index >= 6 ? " ing-extra hidden" : "";
      return '<div class="report-ing' + extra + '"><div class="ing-title"><div class="nm">' + esc(nm) + origHtml + '</div></div><div class="why">' + esc(why) + '</div>' + badgeHtml + '</div>';
    }).join("");
    var more = allIng.length > 6 ? '<button class="ing-more" id="ingMore">' + esc(UI.show_all) + " (" + allIng.length + ')</button>' : "";
    var ingCard = '<section class="card"><div class="card-head"><h3>' + esc(UI.ingredients) + '</h3><span>' + allIng.length + '</span></div>' + (ing || '<p class="report-note">' + esc(UI.not_labeled) + '</p>') + more + '</section>';

    var people = (report.population_notes || []).map(function (item) {
      var lvl = item.level === "high" ? "high" : item.level === "medium" ? "medium" : "";
      return '<div class="report-person ' + lvl + '"><div class="rp-head"><b>' + esc(item.group || "") + '</b><span class="rp-advice">' + esc(item.advice || "") + '</span></div><p>' + esc(item.reason || "") + '</p></div>';
    }).join("");
    var peopleCard = people ? '<section class="card"><div class="card-head"><h3>' + esc(UI.who_notes) + '</h3><span>' + esc(UI.info) + '</span></div><div class="report-people">' + people + '</div></section>' : '';

    var eat = (analysis.how_to_eat || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("");
    var eatCard = eat ? '<section class="card eat"><h3>' + esc(UI.how_to_eat) + '</h3><ul>' + eat + '</ul></section>' : '';
    var dataNotes = (analysis.data_notes || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join("");
    var dataCard = dataNotes ? '<section class="card"><h3>' + esc(UI.data_notes) + '</h3><ul class="report-note">' + dataNotes + '</ul></section>' : '';
    var disc = report.disclaimer ? '<p class="report-disclaimer">' + esc(report.disclaimer) + '</p>' : '';
    $("reportMain").innerHTML = main + peopleCard + nut + ingCard + eatCard + dataCard + disc;
    var ingMore = $("ingMore");
    if (ingMore) {
      ingMore.onclick = function () {
        var open = ingMore.dataset.open === "1";
        Array.prototype.forEach.call(document.querySelectorAll("#reportMain .ing-extra"), function (row) { row.classList.toggle("hidden", open); });
        ingMore.dataset.open = open ? "0" : "1";
        ingMore.textContent = open ? (UI.show_all + " (" + allIng.length + ")") : UI.show_less;
      };
    }

    $("reportSide").innerHTML = '<h3>' + esc(UI.result_title) + '</h3><div class="sc-stats">' +
      '<div class="sc-row"><span>' + esc(UI.scan_cost) + '</span><b>' + SCAN_CREDITS + ' ' + esc(UI.credits) + '</b></div>' +
      '<div class="sc-row"><span>' + esc(UI.analyzed_in) + '</span><b>' + esc(LANG_NAME) + '</b></div>' +
      '<div class="sc-row"><span>' + esc(UI.pay_balance) + '</span><b>' + coinText(state.balance) + ' ' + esc(UI.credits) + '</b></div>' +
      '</div><hr><button class="btn full" id="newScan">' + esc(UI.new_scan) + '</button>' +
      '<button class="btn ghost full" id="sideBuy">' + esc(UI.buy) + '</button>' +
      '<p class="small">' + esc(UI.footer_disclaimer) + '</p>';
    $("newScan").onclick = function () { showHome(); resetScan(); };
    $("sideBuy").onclick = openPay;
    showResult();
  }

  function resetScan() {
    state.file = null; state.preview = "";
    $("previewWrap").classList.add("hidden");
    $("scanButton").classList.add("hidden");
    $("scanButton").disabled = false;
    setScanning(false);
    if (state.imageUrl) { URL.revokeObjectURL(state.imageUrl); state.imageUrl = ""; }
    $("preview").removeAttribute("src");
    $("fileInput").value = "";
    $("cameraInput").value = "";
  }

  function loadHistoryThumb(id, box) {
    if (!id || !box || !state.user) return;
    imageCall(id).then(function (blob) {
      if (!blob) return;
      var url = URL.createObjectURL(blob);
      state.thumbUrls.push(url);
      box.innerHTML = '<img src="' + esc(url) + '" alt="' + esc(UI.image_alt) + '">';
    }).catch(function () {});
  }

  function loadHistory() {
    if (!state.user) { $("historyList").innerHTML = '<div class="history-empty">' + esc(UI.login_required) + '</div>'; return; }
    call("/ai/food/works?limit=20", {}).then(function (data) {
      if (data.code !== 200 || !data.data) return;
      state.history = data.data.items || [];
      if (!state.history.length) { $("historyList").innerHTML = '<div class="history-empty">' + esc(UI.no_history) + '</div>'; return; }
      state.thumbUrls.forEach(function (url) { URL.revokeObjectURL(url); });
      state.thumbUrls = [];
      $("historyList").innerHTML = state.history.map(function (item, index) {
        return '<button class="history-item" data-index="' + index + '"><span class="history-thumb" data-scan-id="' + item.id + '"><svg viewBox="0 0 24 24"><rect x="4" y="3.5" width="16" height="17" rx="3"/><path d="M8 8h8M8 11h8M8 14h5"/></svg></span><span class="history-copy"><b>' + esc(item.product_name || UI.result_title) + '</b><span>' + esc(item.headline || item.created_at || "") + '</span></span><span class="mini">' + esc(statusLabel(item.status)) + '</span></button>';
      }).join("");
      Array.prototype.forEach.call($("historyList").querySelectorAll(".history-thumb"), function (box) {
        var item = state.history.find(function (x) { return String(x.id) === box.dataset.scanId; });
        if (item && item.has_image) loadHistoryThumb(item.id, box);
      });
      Array.prototype.forEach.call($("historyList").querySelectorAll(".history-item"), function (btn) {
        btn.onclick = function () {
          var item = state.history[Number(btn.dataset.index)];
          if (!item) return;
          call("/ai/food/scan/" + item.id, {}).then(function (data) {
            if (data.code === 200 && data.data) { state.preview = ""; renderResult(data.data); }
          });
        };
      });
    });
  }

  function openPay() {
    if (!state.user) { needLogin(); return; }
    $("payBalance").textContent = UI.pay_balance + " " + coinText(state.balance) + " " + UI.credits;
    $("payMsg").textContent = "";
    $("payPacks").innerHTML = "";
    $("payModal").classList.remove("hidden");
    call("/wallet/products", {}).then(function (data) {
      var items = (data.data && data.data.items) || [];
      if (!items.length) { $("payMsg").textContent = UI.network_error; return; }
      items.forEach(function (item) {
        var btn = document.createElement("button");
        btn.className = "pay-pack";
        btn.innerHTML = "<b>" + item.credits + " " + esc(UI.credits) + "</b><span>" + esc(item.price) + "</span>";
        btn.onclick = function () { buy(item.credits); };
        $("payPacks").appendChild(btn);
      });
    }).catch(function () { $("payMsg").textContent = UI.network_error; });
  }

  function buy(credits) {
    $("payMsg").textContent = UI.pay_waiting;
    AiglossaWallet.purchase({
      call: call, credits: credits, successUrl: location.href,
      getBalance: function () { return state.balance; },
      refresh: refreshAccount,
      onWaiting: function () { $("payMsg").textContent = UI.pay_waiting; },
      onCompleted: function () { $("payModal").classList.add("hidden"); toast(UI.pay_success); loadHistory(); },
      onTimeout: function () { $("payMsg").textContent = UI.scan_timeout; },
      onError: function () { $("payMsg").textContent = UI.pay_failed; }
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var area = document.createElement("textarea");
      area.value = text; area.style.position = "fixed"; area.style.opacity = "0";
      document.body.appendChild(area); area.select();
      try { document.execCommand("copy"); resolve(); } catch (err) { reject(err); }
      document.body.removeChild(area);
    });
  }

  function shareScan() {
    if (!state.scan || !state.scan.id) return;
    call("/ai/food/scan/" + state.scan.id + "/share", {}).then(function (data) {
      if (data.code !== 200 || !data.data || !data.data.token) { toast(UI.share_failed); return; }
      var report = state.scan.report || {};
      var product = report.product || {};
      var name = product.name || product.name_original || UI.result_title;
      var headline = (report.analysis && report.analysis.headline) || "";
      var url = location.origin + "/" + LANG + "/food/share/?token=" + encodeURIComponent(data.data.token);
      var text = String(UI.share_text || "{product}").replace("{product}", name).replace("{headline}", headline);
      if (navigator.share) {
        navigator.share({ title: name + " · " + UI.share_heading, text: text, url: url }).catch(function () {});
        return;
      }
      copyText(text + "\n" + url).then(function () { toast(UI.share_copied); }).catch(function () { toast(UI.share_failed); });
    }).catch(function () { toast(UI.share_failed); });
  }

  function deleteScan() {
    if (!state.scan || !state.scan.id) return;
    if (!confirm(UI.delete_confirm)) return;
    call("/ai/food/scan/" + state.scan.id + "/delete", {}).then(function (data) {
      if (data.code === 200) { showHome(); loadHistory(); toast(UI.delete); }
      else toast(UI.scan_failed);
    });
  }

  $("fileInput").onchange = function () { handleFile(this.files && this.files[0]); };
  $("cameraInput").onchange = function () { handleFile(this.files && this.files[0]); };
  $("scanButton").onclick = showScanConfirm;
  $("confirmScan").onclick = startScan;
  $("accountBtn").onclick = function () { if (state.user) location.href = accountUrl(); else needLogin(); };
  $("buyBtn").onclick = function (e) { e.preventDefault(); openPay(); };
  Array.prototype.forEach.call(document.querySelectorAll(".scan-actions label"), function (label) {
    label.addEventListener("click", function (e) {
      if (!state.user) { e.preventDefault(); needLogin(); }
    });
  });
  $("historyRefresh").onclick = function (e) { e.preventDefault(); loadHistory(); };
  $("backBtn").onclick = function (e) { e.preventDefault(); showHome(); };
  $("deleteBtn").onclick = deleteScan;
  $("shareBtn").onclick = shareScan;
  Array.prototype.forEach.call(document.querySelectorAll("[data-close]"), function (btn) {
    btn.onclick = function () { btn.closest(".modal").classList.add("hidden"); };
  });
  Array.prototype.forEach.call(document.querySelectorAll(".modal"), function (modal) {
    modal.onclick = function (e) { if (e.target === modal) modal.classList.add("hidden"); };
  });

  // PWA
  var deferredPrompt = null;
  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault(); deferredPrompt = e; $("pwaBanner").classList.remove("hidden");
  });
  $("installBtn").onclick = function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function () { deferredPrompt = null; $("pwaBanner").classList.add("hidden"); });
  };
  if ("serviceWorker" in navigator && (location.protocol === "https:" || IS_LOCAL)) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
  function syncOnline() { $("offlineBar").classList.toggle("hidden", navigator.onLine); }
  window.addEventListener("online", syncOnline); window.addEventListener("offline", syncOnline); syncOnline();

  window.addEventListener("pageshow", function (event) {
    if (!event.persisted) return;
    refreshAccount().then(function (ok) { if (ok) loadHistory(); });
  });
  refreshAccount().then(function (ok) { if (ok) loadHistory(); });
})();
