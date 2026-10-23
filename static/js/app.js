/* Shared client library: API client, helpers, SQL highlighting, result tables, charts, dialogs and the app shell
   (sidebar, notifications, profile menu). Every dynamic value goes through esc()/attr() before it is put in markup.
   The page's Content-Security-Policy forbids inline scripts and styles, so widths are set from data-w attributes. */
(function () {
  "use strict";
  var App = window.App = window.App || {};
  var body = document.body;
  var ACCESS = body.dataset.access || "user";          // public | user | admin
  var LAYOUT = body.dataset.layout || (ACCESS === "public" ? "public" : "app");   // app | public | bare
  var PAGE = body.dataset.page || "";

  /* ---------------------------------------------------------------- helpers */
  var $ = App.$ = function (s, r) { return (r || document).querySelector(s); };
  App.$$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var esc = App.esc = function (t) { return String(t === null || t === undefined ? "" : t).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); };
  var attr = App.attr = function (t) { return esc(t).replace(/"/g, "&quot;").replace(/'/g, "&#39;"); };
  var t = function (k) { return App.t(k); };
  App.isNumber = function (v) { return typeof v === "number" || (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)); };
  App.fmtNum = function (n) { return n === null || n === undefined ? "Unlimited" : Number(n).toLocaleString("en-US"); };
  App.fmtDate = function (s) { if (!s) return ""; var d = new Date(String(s).replace(" ", "T")); return isNaN(d) ? String(s) : d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }); };
  App.fmtDateTime = function (s) { if (!s) return ""; var d = new Date(String(s).replace(" ", "T")); return isNaN(d) ? String(s) : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); };
  App.fmtMoney = function (n, cur) {
    try { return new Intl.NumberFormat(undefined, { style: "currency", currency: cur || (App.meta && App.meta.currency) || "INR", maximumFractionDigits: Number(n) % 1 ? 2 : 0 }).format(Number(n)); }
    catch (e) { return String(n); }
  };
  App.fmtCompact = function (v) {
    var a = Math.abs(v);
    if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 0 : 1).replace(/\.0$/, "") + "M";
    if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1).replace(/\.0$/, "") + "K";
    return String(Math.round(v * 100) / 100);
  };
  App.cap = function (s) { s = String(s || ""); return s.charAt(0).toUpperCase() + s.slice(1); };
  App.paintWidths = function (root) {
    App.$$("[data-w]", root || document).forEach(function (el) { el.style.width = el.getAttribute("data-w") + "%"; });
  };
  /** Set markup safely built with esc(), then apply data-w widths. */
  App.html = function (el, markup) { el.innerHTML = markup; App.paintWidths(el); return el; };

  /* -------------------------------------------------------------------- API */
  function ApiError(message, status) { var e = new Error(message); e.status = status; return e; }
  App.api = async function (method, url, data) {
    var opts = { method: method, credentials: "same-origin", headers: { "X-Requested-With": "XMLHttpRequest" } };
    if (data !== undefined) { opts.headers["Content-Type"] = "application/json"; opts.body = JSON.stringify(data); }
    var res;
    try { res = await fetch(url, opts); } catch (e) { throw ApiError("Can't reach the server. Check your connection.", 0); }
    var json = null;
    if ((res.headers.get("content-type") || "").indexOf("json") >= 0) json = await res.json().catch(function () { return null; });
    if (!res.ok) {
      if (res.status === 401 && ACCESS !== "public" && LAYOUT !== "bare") location.href = "/login?next=" + encodeURIComponent(location.pathname + location.search);
      throw ApiError((json && json.detail) || "Request failed (" + res.status + ").", res.status);
    }
    return json;
  };
  var api = App.api;

  /* ------------------------------------------------------------ toasts, theme */
  App.toast = function (msg, type) {
    var box = $("#toasts");
    if (!box) return;
    var el = document.createElement("div");
    el.className = "toast " + (type === "success" ? "" : type || "");
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(function () { el.classList.add("out"); setTimeout(function () { el.remove(); }, 250); }, type === "error" ? 6000 : 3500);
  };
  App.setTheme = function (theme) {
    document.documentElement.setAttribute("data-theme", theme);
    try { localStorage.setItem("theme", theme); } catch (e) { /* ignore */ }
  };
  /** Disable a button while an async action runs; errors become toasts. */
  App.run = async function (btn, fn) {
    if (btn) btn.disabled = true;
    try { return await fn(); }
    catch (e) { App.toast(e.message || "Something went wrong.", "error"); }
    finally { if (btn) btn.disabled = false; }
  };

  /* -------------------------------------------------------- SQL highlighting */
  var KEYWORDS = "SELECT|FROM|WHERE|GROUP BY|ORDER BY|LIMIT|OFFSET|JOIN|LEFT|RIGHT|INNER|OUTER|FULL|CROSS|ON|AS|AND|OR|NOT|IN|IS|NULL|COUNT|SUM|AVG|MIN|MAX|ROUND|DISTINCT|HAVING|DESC|ASC|CASE|WHEN|THEN|ELSE|END|LIKE|BETWEEN|UNION|ALL|WITH|OVER|PARTITION BY|EXISTS|DATE_FORMAT|YEAR|MONTH|COALESCE|IFNULL|CURDATE|NOW|INTERVAL";
  var HL = new RegExp("(--[^\\n]*)|('(?:[^'\\\\]|\\\\.)*')|(\\b\\d+(?:\\.\\d+)?\\b)|\\b(" + KEYWORDS + ")\\b", "gi");
  App.highlight = function (sql) {
    return esc(sql).replace(HL, function (m, c, s, n, k) {
      if (c) return '<span class="c">' + c + "</span>";
      if (s) return '<span class="s">' + s + "</span>";
      if (n) return '<span class="n">' + n + "</span>";
      return '<span class="k">' + k + "</span>";
    });
  };

  /* ------------------------------------------------------------ result table */
  App.sortRows = function (result, sort) {
    var rows = result.rows.slice();
    if (sort) {
      var i = sort.col, d = sort.dir === "asc" ? 1 : -1;
      rows.sort(function (a, b) {
        var x = a[i], y = b[i];
        if (x === null || x === undefined) return 1;
        if (y === null || y === undefined) return -1;
        if (App.isNumber(x) && App.isNumber(y)) return (Number(x) - Number(y)) * d;
        return String(x).localeCompare(String(y)) * d;
      });
    }
    return rows;
  };
  App.resultTable = function (result, o) {
    o = o || {};
    if (!result.columns.length) return '<div class="empty-result">The query ran but returned no columns.</div>';
    var rows = App.sortRows(result, o.sort);
    if (!rows.length) return '<div class="table-wrap"><div class="empty-result">No rows matched. Try rephrasing the question or loosening a filter.</div></div>';
    var shown = rows.slice(0, o.max || 200);
    var numCol = result.columns.map(function (_, i) { return result.rows.every(function (row) { return row[i] === null || row[i] === undefined || App.isNumber(row[i]); }); });
    var head = result.columns.map(function (c, i) {
      var arrow = o.sort && o.sort.col === i ? '<span class="arrow">' + (o.sort.dir === "asc" ? "↑" : "↓") + "</span>" : "";
      return '<th class="' + (numCol[i] ? "num" : "") + '" data-action="sort" data-id="' + attr(o.id) + '" data-col="' + i + '" tabindex="0" scope="col">' + esc(c) + arrow + "</th>";
    }).join("");
    var rowsHtml = shown.map(function (row) {
      return "<tr>" + result.columns.map(function (_, i) {
        var v = row[i];
        if (v === null || v === undefined) return '<td class="null">null</td>';
        return '<td class="' + (numCol[i] ? "num" : "") + '">' + esc(typeof v === "object" ? JSON.stringify(v) : v) + "</td>";
      }).join("") + "</tr>";
    }).join("");
    return '<div class="table-wrap"><table><thead><tr>' + head + "</tr></thead><tbody>" + rowsHtml + "</tbody></table></div>";
  };
  App.chartable = function (result) {
    return !!result && result.columns.length >= 2 && result.rows.length >= 2 && result.rows.length <= 60 &&
      result.rows.every(function (r) { return App.isNumber(r[1]) && Number(r[1]) >= 0; });
  };

  /* ------------------------------------------------------------------ charts */
  function niceTop(max) {
    if (!(max > 0)) return 1;
    var mag = Math.pow(10, Math.floor(Math.log(max) / Math.LN10)), nm = max / mag;
    return (nm <= 1 ? 1 : nm <= 2 ? 2 : nm <= 2.5 ? 2.5 : nm <= 5 ? 5 : 10) * mag;
  }
  App.chartSvg = function (type, labels, values, o) {
    o = o || {};
    var n = values.length;
    if (!n) return "";
    if (type === "pie") return App.pieSvg(labels, values, o);
    var fmtV = o.format || App.fmtCompact;
    var rotate = n > 6, W = 640, H = o.height || 260, L = 50, R = 14, T = 14, B = rotate ? 58 : 38;
    var top = niceTop(Math.max.apply(null, values));
    var iw = W - L - R, ih = H - T - B, step = iw / n, i;
    var out = ['<svg class="chart" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + attr(o.label || "Chart") + '">'];
    for (i = 0; i <= 4; i++) {
      var y = T + ih - ih * i / 4;
      out.push('<line class="ch-grid" x1="' + L + '" x2="' + (W - R) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '"/><text class="ch-axis" x="' + (L - 7) + '" y="' + (y + 4).toFixed(1) + '" text-anchor="end">' + esc(fmtV(top * i / 4)) + "</text>");
    }
    if (type === "line") {
      var pts = values.map(function (v, k) { return [L + step * k + step / 2, T + ih - ih * v / top]; });
      out.push('<polyline class="ch-line" fill="none" points="' + pts.map(function (p) { return p[0].toFixed(1) + "," + p[1].toFixed(1); }).join(" ") + '"/>');
      if (n <= 40) pts.forEach(function (p, k) { out.push('<circle class="ch-dot" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="3.5"><title>' + esc(labels[k]) + ": " + esc(App.fmtNum(values[k])) + "</title></circle>"); });
    } else {
      var bw = Math.min(56, step * 0.62);
      values.forEach(function (v, k) {
        var h = Math.max(v > 0 ? 1 : 0, ih * v / top);
        out.push('<rect class="ch-bar" x="' + (L + step * k + (step - bw) / 2).toFixed(1) + '" y="' + (T + ih - h).toFixed(1) + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1) + '" rx="2"><title>' + esc(labels[k]) + ": " + esc(App.fmtNum(v)) + "</title></rect>");
      });
    }
    var every = Math.ceil(n / (rotate ? 14 : 8));
    labels.forEach(function (l, k) {
      if (k % every) return;
      var s = String(l); if (s.length > 12) s = s.slice(0, 11) + "…";
      var x = L + step * k + step / 2, ly = H - B + 16;
      if (rotate) out.push('<text class="ch-axis" transform="rotate(-35 ' + x.toFixed(1) + " " + ly + ')" x="' + x.toFixed(1) + '" y="' + ly + '" text-anchor="end">' + esc(s) + "</text>");
      else out.push('<text class="ch-axis" x="' + x.toFixed(1) + '" y="' + ly + '" text-anchor="middle">' + esc(s) + "</text>");
    });
    out.push("</svg>");
    return out.join("");
  };
  App.pieSvg = function (labels, values, o) {
    o = o || {};
    var items = labels.map(function (l, i) { return { l: String(l), v: Number(values[i]) }; }).filter(function (x) { return x.v > 0; });
    var total = items.reduce(function (s, x) { return s + x.v; }, 0);
    if (!total) return "";
    if (items.length > 8) {   // keep the 7 biggest, group the rest
      items.sort(function (a, b) { return b.v - a.v; });
      var rest = items.slice(7).reduce(function (s, x) { return s + x.v; }, 0);
      items = items.slice(0, 7).concat([{ l: "Other", v: rest }]);
    }
    var cx = 100, cy = 100, r = 90, ang = -Math.PI / 2, paths = [], legend = [];
    items.forEach(function (x, i) {
      var cls = "s" + (i % 8), pct = Math.round(x.v / total * 1000) / 10;
      if (items.length === 1) paths.push('<circle class="pie-seg ' + cls + '" cx="' + cx + '" cy="' + cy + '" r="' + r + '"><title>' + esc(x.l) + ": " + pct + '%</title></circle>');
      else {
        var a2 = ang + x.v / total * Math.PI * 2;
        var x1 = cx + r * Math.cos(ang), y1 = cy + r * Math.sin(ang), x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
        paths.push('<path class="pie-seg ' + cls + '" d="M' + cx + " " + cy + " L" + x1.toFixed(2) + " " + y1.toFixed(2) + " A" + r + " " + r + " 0 " + (a2 - ang > Math.PI ? 1 : 0) + " 1 " + x2.toFixed(2) + " " + y2.toFixed(2) + ' Z"><title>' + esc(x.l) + ": " + esc(App.fmtNum(x.v)) + " (" + pct + "%)</title></path>");
        ang = a2;
      }
      legend.push('<div><i class="l' + (i % 8) + '"></i>' + esc(x.l.length > 22 ? x.l.slice(0, 21) + "…" : x.l) + ' <span class="muted">' + pct + "%</span></div>");
    });
    return '<div class="pie-wrap"><svg class="pie-svg" viewBox="0 0 200 200" role="img" aria-label="' + attr(o.label || "Pie chart") + '">' + paths.join("") + '</svg><div class="legend">' + legend.join("") + "</div></div>";
  };
  /** A chart inside a titled box, for dashboards. points = [{label, value}] */
  App.chartBox = function (type, points, o) {
    o = o || {};
    if (!points.length) return '<p class="muted">' + esc(o.empty || "Nothing to show yet.") + "</p>";
    return '<div class="chart-box">' + App.chartSvg(type, points.map(function (p) { return p.label; }), points.map(function (p) { return Number(p.value); }), o) + "</div>";
  };

  /* -------------------------------------------------------------- dialogs */
  var modalState = null;
  App.modal = function (o) {
    var m = $("#modal");
    modalState = o;
    $("#modalTitle").textContent = o.title || "";
    $("#modalBody").innerHTML = o.html || "";
    App.paintWidths($("#modalBody"));
    var foot = $("#modalFoot");
    foot.hidden = !(o.foot && o.foot.length);
    foot.innerHTML = (o.foot || []).map(function (b, i) { return '<button type="button" class="btn ' + (b.cls || "") + '" data-foot="' + i + '">' + esc(b.label) + "</button>"; }).join("");
    if (o.onMount) o.onMount($("#modalBody"));
    if (!m.open) m.showModal();
  };
  App.closeModal = function (value) {
    var m = $("#modal"), s = modalState;
    modalState = null;
    if (m.open) m.close();
    if (s && s.onClose) s.onClose(value);
  };
  App.confirm = function (o) {
    return new Promise(function (resolve) {
      App.modal({ title: o.title, html: "<p>" + esc(o.message) + "</p>", onClose: function (v) { resolve(!!v); },
        foot: [{ label: o.cancel || "Cancel", cls: "plain", value: false }, { label: o.confirm || "Confirm", cls: o.danger ? "danger-fill" : "", value: true }] });
    });
  };

  /* ---------------------------------------------------------- form helpers */
  App.fieldErr = function (form, name, msg) {
    var out = $('[data-err="' + name + '"]', form), input = form.elements[name];
    if (out) out.textContent = msg || "";
    if (input && input.setAttribute) { if (msg) input.setAttribute("aria-invalid", "true"); else input.removeAttribute("aria-invalid"); }
  };
  App.showErrors = function (form, errors, order) {
    var first = null;
    order.forEach(function (n) { App.fieldErr(form, n, errors[n] || ""); if (errors[n] && !first) first = n; });
    if (first && form.elements[first] && form.elements[first].focus) form.elements[first].focus();
    return !first;
  };
  App.banner = function (el, type, title, msg) {
    if (!el) return;
    if (!type) { el.hidden = true; return; }
    el.hidden = false; el.className = "banner " + type; el.setAttribute("role", type === "error" ? "alert" : "status");
    el.innerHTML = "<strong>" + esc(title) + "</strong>" + (msg ? esc(msg) : "");
  };
  App.pwToggles = function (root) {
    App.$$(".toggle-pw", root).forEach(function (btn) {
      btn.addEventListener("click", function () {
        var input = document.getElementById(btn.getAttribute("data-target"));
        var show = input.type === "password";
        input.type = show ? "text" : "password";
        btn.textContent = show ? "Hide" : "Show";
        btn.setAttribute("aria-pressed", show ? "true" : "false");
      });
    });
  };
  App.field = function (name, label, type, auto, extra, idp) {
    var id = (idp || "f") + "-" + name;
    return '<div class="fld"><label for="' + id + '">' + esc(label) + "</label>" +
      '<input id="' + id + '" name="' + name + '" type="' + type + '" autocomplete="' + auto + '" aria-describedby="e-' + name + '"' + (extra || "") + ">" +
      '<p class="field-error" id="e-' + name + '" data-err="' + name + '"></p></div>';
  };
  App.pwField = function (name, label, auto, hint, idp) {
    var id = (idp || "f") + "-" + name;
    return '<div class="fld"><label for="' + id + '">' + esc(label) + '</label><div class="input-wrap"><input id="' + id + '" name="' + name + '" type="password" autocomplete="' + auto + '" aria-describedby="e-' + name + '">' +
      '<button type="button" class="toggle-pw" data-target="' + id + '" aria-pressed="false" aria-label="Show password">Show</button></div>' +
      (hint ? '<p class="hint">' + esc(hint) + "</p>" : "") + '<p class="field-error" id="e-' + name + '" data-err="' + name + '"></p></div>';
  };
  App.download = function (filename, text, mime) {
    var blob = new Blob([text], { type: mime || "text/plain;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 500);
  };
  App.copy = function (text, doneMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(function () { if (doneMsg) App.toast(doneMsg); }, function () { App.toast("Couldn't copy. Select the text and copy it by hand.", "warn"); });
  };

  /* ------------------------------------------------------------------ icons */
  var ICONS = {
    chat: '<path d="M3 4h12v8H8l-3.5 3V12H3z"/>', database: '<ellipse cx="9" cy="4" rx="6" ry="2.5"/><path d="M3 4v10c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5V4M3 9c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5"/>', history: '<circle cx="9" cy="9" r="6.5"/><path d="M9 5.5V9l2.5 1.5"/>', saved: '<path d="M9 2.5l2 4.2 4.5.6-3.3 3.1.9 4.5L9 12.7 4.9 14.9l.9-4.5L2.5 7.3 7 6.7z"/>',
    usage: '<path d="M3.5 14.5v-5M7.5 14.5v-9M11.5 14.5v-6M15 14.5H2.5"/>', pricing: '<path d="M2.5 9.5l6.5 6.5 6.5-6.5V3H9z"/><circle cx="12" cy="6" r="1"/>',
    billing: '<rect x="2.5" y="4" width="13" height="10" rx="1.5"/><path d="M2.5 7.5h13"/>', admin: '<path d="M9 2l6 2.2v4.3c0 3.4-2.4 5.9-6 7.5-3.6-1.6-6-4.1-6-7.5V4.2z"/>',
    evaluation: '<path d="M7 2.5h4M8 2.5v4.5L3.8 13.5a1.4 1.4 0 001.2 2h8a1.4 1.4 0 001.2-2L10 7V2.5"/>', about: '<circle cx="9" cy="9" r="6.5"/><path d="M9 8v4.2M9 5.6v.1"/>',
    settings: '<path d="M3 5h5M12 5h3M3 9h2M9 9h6M3 13h8M15 13h0"/><circle cx="10" cy="5" r="1.6"/><circle cx="7" cy="9" r="1.6"/><circle cx="13" cy="13" r="1.6"/>',
    language: '<circle cx="9" cy="9" r="7"/><path d="M2 9h14M9 2c2.2 2.2 2.2 11.8 0 14M9 2c-2.2 2.2-2.2 11.8 0 14"/>', upgrade: '<path d="M9 2l2.1 4.6 5 .6-3.7 3.4 1 5L9 13.2 4.6 15.6l1-5L1.9 7.2l5-.6z"/>',
    help: '<circle cx="9" cy="9" r="7"/><path d="M7 7.2a2 2 0 113 1.7c-.7.4-1 .8-1 1.6M9 12.6v.1"/>', logout: '<path d="M7 3H4v12h3M11 6l3 3-3 3M14 9H7"/>', chev: '<path d="M7 4l5 5-5 5"/>',
    bell: '<path d="M4.5 12.5V8a4.5 4.5 0 019 0v4.5l1.2 1.5H3.3zM7.5 15.5a1.6 1.6 0 003 0"/>', plus: '<path d="M9 3v12M3 9h12"/>'
  };
  App.icon = function (name, size) {
    var s = size || 18;
    return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[name] + "</svg>";
  };

  /* ------------------------------------------------------------------- shell */
  var sessions = [], notes = null;

  function navLink(href, icon, label) {
    var on = location.pathname === href;
    return '<a class="nav-item' + (on ? " on" : "") + '" href="' + href + '"' + (on ? ' aria-current="page"' : "") + ">" + App.icon(icon) + "<span>" + esc(label) + "</span></a>";
  }
  function usageBox(u) {
    var q = u.queries_limit, qPct = q ? Math.min(100, Math.round(u.queries_used / q * 100)) : 0;
    return '<div class="usage-box"><div class="u-row"><span>' + esc(t("queriesToday")) + "</span><strong>" + u.queries_used + " / " + (q === null ? "∞" : q) + "</strong></div>" +
      '<div class="bar' + (qPct >= 100 ? " full" : qPct >= 80 ? " warn" : "") + '" role="progressbar" aria-valuemin="0" aria-valuemax="' + (q === null ? 0 : q) + '" aria-valuenow="' + u.queries_used + '"><span data-w="' + qPct + '"></span></div>' +
      '<div class="u-row"><span>' + esc(t("tokensLeft")) + "</span><strong>" + (u.tokens_left === null ? "Unlimited" : App.fmtNum(u.tokens_left + (u.token_balance || 0))) + "</strong></div>" +
      '<div class="u-foot"><a href="/usage">' + esc(t("usage")) + "</a>" +
      (App.user.plan === "free" ? '<a href="/pricing">' + esc(t("upgrade")) + "</a>" : '<span class="plan-chip">' + esc(App.cap(u.plan)) + "</span>") + "</div></div>";
  }
  function renderSidebar() {
    var side = $("#side"), u = App.user, us = App.me.usage;
    if (!side || !u) return;
    var unread = App.me.unread_notifications || 0;
    var menuOpen = $("#userMenu") && !$("#userMenu").hidden;
    var learnOpen = $("#learnToggle") && $("#learnToggle").getAttribute("aria-expanded") === "true";
    var recents = sessions.slice(0, 5);
    side.innerHTML =
      '<div class="side-top"><a class="brand" href="/chat">' + esc(App.meta.app_name || "SQL assistant") + '</a><div class="side-tools">' +
        '<button class="icon-btn bell" id="bellBtn" type="button" aria-label="' + attr(t("notifications") + (unread ? " (" + unread + " new)" : "")) + '" aria-expanded="false">' + App.icon("bell") + (unread ? '<span class="badge">' + (unread > 9 ? "9+" : unread) + "</span>" : "") + "</button>" +
        '<button class="icon-btn close-side" id="closeSide" type="button" aria-label="' + attr(t("closeSide")) + '">✕</button></div></div>' +
      '<div class="bell-panel" id="bellPanel" hidden></div>' +
      '<button class="new-chat" id="newChat" type="button"><span class="plus" aria-hidden="true">+</span> <span>' + esc(t("newChat")) + "</span></button>" +
      '<nav class="nav" aria-label="Main">' +
        navLink("/history", "history", t("history")) + navLink("/saved", "saved", t("saved")) + navLink("/connections", "database", "Database connections") + navLink("/usage", "usage", t("usage")) +
        navLink("/pricing", "pricing", t("pricing")) + navLink("/billing", "billing", t("billing")) +
        (u.role === "admin" ? '<div class="nav-sep"></div>' + navLink("/admin", "admin", t("admin")) + navLink("/evaluation", "evaluation", t("evaluation")) : "") +
        '<div class="nav-sep"></div>' + navLink("/about", "about", t("aboutHelp")) +
      "</nav>" +
      '<div class="side-scroll"><h3>' + esc(t("recents")) + "</h3>" +
        (recents.length ? '<ul class="recents">' + recents.map(function (s) { return '<li><a class="r-open" href="/chat?session=' + s.id + '" title="' + attr(s.title) + '">' + esc(s.title) + "</a></li>"; }).join("") + "</ul>" : '<p class="muted">' + esc(t("recentsEmpty")) + "</p>") + "</div>" +
      usageBox(us) +
      '<div class="user"><button class="user-btn" id="userBtn" type="button" aria-haspopup="menu" aria-expanded="' + (menuOpen ? "true" : "false") + '"><span class="avatar">' + esc(u.username.charAt(0).toUpperCase()) + '</span><span class="uname">' + esc(u.username) + "</span></button>" +
        '<div class="menu" id="userMenu" role="menu"' + (menuOpen ? "" : " hidden") + '><p class="menu-head">' + esc(u.email) + "</p>" +
          '<button type="button" class="item" role="menuitem" data-open="upgrade">' + App.icon("upgrade") + "<span>" + esc(t("upgrade")) + "</span></button>" +
          '<button type="button" class="item" role="menuitem" data-open="settings">' + App.icon("settings") + "<span>" + esc(t("settings")) + "</span></button>" +
          '<button type="button" class="item" role="menuitem" data-open="language">' + App.icon("language") + "<span>" + esc(t("language")) + '</span><span class="aside">' + esc(App.langName()) + "</span></button><hr>" +
          '<button type="button" class="item" role="menuitem" data-open="help">' + App.icon("help") + "<span>" + esc(t("help")) + "</span></button>" +
          '<button type="button" class="item" role="menuitem" id="learnToggle" aria-expanded="' + (learnOpen ? "true" : "false") + '" aria-controls="learnSub">' + App.icon("about") + "<span>" + esc(t("learn")) + '</span><span class="aside chev">' + App.icon("chev", 14) + "</span></button>" +
          '<div class="submenu" id="learnSub"' + (learnOpen ? "" : " hidden") + '><button type="button" class="item sub" role="menuitem" data-open="learn-about">' + esc(t("about")) + '</button><button type="button" class="item sub" role="menuitem" data-open="learn-how">' + esc(t("how")) + '</button><button type="button" class="item sub" role="menuitem" data-open="learn-privacy">' + esc(t("privacy")) + "</button></div><hr>" +
          '<button type="button" class="item" role="menuitem" id="authAction">' + App.icon("logout") + "<span>" + esc(t("logOut")) + "</span></button></div></div>";
    App.paintWidths(side);
  }
  App.refreshShell = async function () {
    try {
      App.me = await api("GET", "/api/auth/me"); App.user = App.me.user;
      var r = await api("GET", "/api/history/sessions"); sessions = r.items;
    } catch (e) { /* keep the old sidebar */ }
    if ($("#side")) renderSidebar();
  };

  function renderBellPanel() {
    var panel = $("#bellPanel");
    var list = notes || [];
    panel.innerHTML = '<div class="bell-head"><strong>' + esc(t("notifications")) + '</strong><button type="button" class="link" id="markRead">' + esc(t("markRead")) + "</button></div>" +
      (list.length ? '<ul class="notifs">' + list.slice(0, 12).map(function (n) { return '<li class="' + (n.is_read ? "" : "unread") + '"><span>' + esc(n.message) + "</span><time>" + esc(App.fmtDateTime(n.created_at)) + "</time></li>"; }).join("") + "</ul>" : '<p class="muted pad">' + esc(t("noNotifs")) + "</p>");
  }

  function publicBar() {
    return '<header class="pubbar"><a class="brand" href="/about">' + esc(App.meta.app_name || "SQL assistant") + '</a><nav class="pub-nav" aria-label="Main"><a href="/pricing">' + esc(t("pricing")) + '</a><a href="/about">' + esc(t("aboutHelp")) + "</a>" +
      '<button type="button" class="link" data-open="language">' + esc(App.langName()) + '</button><a class="btn plain" href="/login">' + esc(t("logIn")) + '</a><a class="btn" href="/signup">' + esc(t("signUp")) + "</a></nav></header>";
  }

  function buildLayout(kind, flush) {
    var root = $("#root");
    if (kind === "app") {
      root.innerHTML = '<div class="app" id="app"><aside class="side" id="side" aria-label="Sidebar"></aside><div class="scrim" id="scrim"></div>' +
        '<div class="main-col"><header class="mtop"><button class="icon-btn" id="openSide" type="button" aria-label="' + attr(t("openSide")) + '">☰</button><span class="mtitle" id="mtitle"></span></header>' +
        '<main id="main" class="main' + (flush ? " flush" : "") + '" tabindex="-1"><div id="outlet"></div></main></div></div>';
      renderSidebar();
    } else if (kind === "public") {
      root.innerHTML = '<div class="public">' + publicBar() + '<main id="main" class="main" tabindex="-1"><div id="outlet"></div></main></div>';
    } else {
      root.innerHTML = '<main id="main" class="main bare" tabindex="-1"><div id="outlet"></div></main>';
    }
    var mt = $("#mtitle"); if (mt) mt.textContent = document.title.split(" · ")[0];
  }

  function setMenu(open) { var m = $("#userMenu"), b = $("#userBtn"); if (!m) return; m.hidden = !open; if (b) b.setAttribute("aria-expanded", open ? "true" : "false"); }
  async function setBell(open) {
    var p = $("#bellPanel"), b = $("#bellBtn");
    if (!p) return;
    p.hidden = !open;
    if (b) b.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) {
      try { var r = await api("GET", "/api/notifications"); notes = r.items; } catch (e) { notes = []; }
      renderBellPanel();
      if (App.me.unread_notifications) {
        App.me.unread_notifications = 0;
        api("POST", "/api/notifications/read-all").catch(function () {});
        var badge = $(".bell .badge"); if (badge) badge.remove();
      }
    }
  }
  App.closeSide = function () { var a = $("#app"); if (a) a.classList.remove("side-open"); };

  function setLanguage(code) {
    if (!App.setLangCode(code)) return;
    if ($("#side")) renderSidebar();
    var pb = $(".pubbar"); if (pb) pb.outerHTML = publicBar();
  }
  function languageBody() {
    return '<div class="langs">' + App.LANGS.map(function (l) {
      var on = l.code === App.lang;
      return '<button type="button" class="lang-opt' + (on ? " on" : "") + '" data-lang="' + l.code + '" aria-pressed="' + on + '"><span>' + esc(l.name) + "</span>" + (on ? '<span aria-hidden="true">✓</span>' : "") + "</button>";
    }).join("") + '</div><p class="muted mt">Menus, navigation and buttons change language. Page text, your questions and your data stay as they are.</p>';
  }

  function bindShell() {
    document.addEventListener("click", function (ev) {
      var el = ev.target;
      if (el.closest("#userBtn")) { setBell(false); setMenu($("#userMenu").hidden); return; }
      if (el.closest("#bellBtn")) { setMenu(false); setBell($("#bellPanel").hidden); return; }
      if (el.closest("#learnToggle")) { var b = $("#learnToggle"), show = $("#learnSub").hidden; $("#learnSub").hidden = !show; b.setAttribute("aria-expanded", show ? "true" : "false"); return; }
      if (el.closest("#markRead")) { App.$$("#bellPanel .unread").forEach(function (n) { n.classList.remove("unread"); }); return; }
      if (el.closest("#authAction")) { setMenu(false); api("POST", "/api/auth/logout").catch(function () {}).then(function () { location.href = "/login"; }); return; }
      var open = el.closest("[data-open]");
      if (open) { setMenu(false); App.closeSide(); App.openDialog(open.getAttribute("data-open")); return; }
      if (el.closest("#newChat")) { App.closeSide(); if (App.onNewChat) App.onNewChat(); else location.href = "/chat"; return; }
      if (el.closest("#openSide")) { $("#app").classList.add("side-open"); return; }
      if (el.closest("#closeSide") || el.closest("#scrim")) { App.closeSide(); return; }
      if (el.closest(".nav-item") || el.closest(".r-open")) { App.closeSide(); return; }
      if (!el.closest("#userMenu")) setMenu(false);
      if (!el.closest("#bellPanel")) setBell(false);
    });
    document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") { setMenu(false); setBell(false); App.closeSide(); } });
    var modal = $("#modal");
    modal.addEventListener("click", function (ev) {
      if (ev.target === modal) { App.closeModal(undefined); return; }
      var f = ev.target.closest("[data-foot]");
      if (f && modalState) {
        var b = modalState.foot[Number(f.getAttribute("data-foot"))];
        if (b.onClick && b.onClick() === false) return;
        App.closeModal(b.value);
        return;
      }
      if (ev.target.closest("#modalClose")) { App.closeModal(undefined); return; }
      var lg = ev.target.closest("[data-lang]");
      if (lg) {
        setLanguage(lg.getAttribute("data-lang"));
        $("#modalTitle").textContent = t("language");
        $("#modalBody").innerHTML = languageBody();
      }
    });
    modal.addEventListener("close", function () { if (modalState) { var s = modalState; modalState = null; if (s.onClose) s.onClose(undefined); } });
  }

  /* --------------------------------------------------- checkout and dialogs */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) return resolve();
      var s = document.createElement("script");
      s.src = src; s.onload = resolve; s.onerror = function () { reject(new Error("Could not load the payment form.")); };
      document.head.appendChild(s);
    });
  }
  async function confirmOnServer(order, paymentId, signature) {
    await api("POST", "/api/billing/confirm", { gateway_order_id: order.gateway_order_id, gateway_payment_id: paymentId, signature: signature });
    App.toast("Payment successful. Thank you!");
    setTimeout(function () { location.href = "/billing"; }, 600);
  }
  /** target = {plan: "pro"} or {pack: "small"}; label is shown in the summary. */
  App.checkout = async function (target, label) {
    var order;
    try { order = await api("POST", "/api/billing/order", target); } catch (e) { App.toast(e.message, "error"); return; }
    var cur = order.currency || App.meta.currency;
    if (order.gateway === "demo") {
      App.modal({
        title: "Checkout",
        html: '<div class="checkout card flat"><div class="sum-row"><span>' + esc(label) + "</span><span>" + esc(App.fmtMoney(order.amount, cur)) + "</span></div>" +
          '<div class="sum-row total"><span>Total today</span><span>' + esc(App.fmtMoney(order.amount, cur)) + "</span></div></div>" +
          '<p class="muted mt">Billed to ' + esc(App.user.email) + '.</p><div class="banner info mt"><strong>Demo checkout</strong>No payment is taken and no card details are collected. Add Razorpay keys in the .env file to charge for real.</div>',
        foot: [{ label: "Cancel", cls: "plain", value: false }, { label: "Pay " + App.fmtMoney(order.amount, cur) + " (demo)", value: true, onClick: function () {
          App.run(null, function () { return confirmOnServer(order, "demo_pay_" + Math.random().toString(36).slice(2, 12), "demo"); });
          return false;
        } }]
      });
      return;
    }
    try {
      await loadScript("https://checkout.razorpay.com/v1/checkout.js");
      var rz = new window.Razorpay({ key: order.razorpay_key_id, amount: Math.round(order.amount * 100), currency: cur, name: App.meta.app_name, description: label, order_id: order.gateway_order_id,
        prefill: { email: App.user.email }, handler: function (r) { App.run(null, function () { return confirmOnServer(order, r.razorpay_payment_id, r.razorpay_signature); }); } });
      rz.on("payment.failed", function () { App.toast("Payment failed. You were not charged.", "error"); });
      rz.open();
    } catch (e) { App.toast(e.message, "error"); }
  };

  function selectRow(id, label, opts, cur) {
    return '<div class="pref-row"><label for="' + id + '">' + esc(label) + '</label><select id="' + id + '" class="w-field">' +
      opts.map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === cur ? " selected" : "") + ">" + esc(o[1]) + "</option>"; }).join("") + "</select></div>";
  }
  App.CHART_OPTS = [["none", "Table only"], ["bar", "Bar chart"], ["line", "Line chart"], ["pie", "Pie chart"]];
  App.saveSettings = async function (patch) {
    var s = Object.assign({}, App.me.settings, patch);
    App.me.settings = await api("PUT", "/api/settings", { default_chart_type: s.default_chart_type, theme: s.theme, rows_per_page: s.rows_per_page });
    return App.me.settings;
  };

  var LEARN = {
    about: ["About SQL assistant", "Ask questions about your data in plain English. SQL assistant writes a SQL query for each question, runs it, and shows you the query next to the answer so you can check it. The project also compares zero-shot and few-shot prompting for SQL generation."],
    how: ["How it works", "1. You ask a question in plain English. 2. A model writes the SQL using your table and column names. 3. Only read-only queries run; anything that would change data is blocked. 4. You see the SQL, an explanation, a table and a chart, and can edit and re-run the SQL."],
    privacy: ["Privacy and data", "Your account, questions, results and settings are stored in the app's database. When you ask a question, its text goes to the model that writes the SQL, together with the table and column names of the sample database. Token counts are tracked for daily limits. AI-written SQL can be wrong, so check it. You can delete your account in Settings."]
  };
  var DIALOGS = {
    settings: function () {
      var u = App.user, s = App.me.settings;
      App.modal({
        title: t("settings"),
        html: '<p class="muted mb0">' + esc(u.username) + " · " + esc(u.email) + "</p>" +
          selectRow("dgTheme", "Theme", [["light", "Light"], ["dark", "Dark"]], s.theme) +
          selectRow("dgChart", "Default chart", App.CHART_OPTS, s.default_chart_type) +
          selectRow("dgLang", "Language", App.LANGS.map(function (l) { return [l.code, l.name]; }), App.lang) +
          '<p class="muted">Changes save as soon as you pick them. Password and account deletion are on the full settings page.</p>',
        foot: [{ label: "Close", cls: "plain", value: false }, { label: "All settings", value: true, onClick: function () { location.href = "/settings"; } }],
        onMount: function (b) {
          $("#dgTheme", b).addEventListener("change", function (e) { App.run(e.target, async function () { await App.saveSettings({ theme: e.target.value }); App.setTheme(e.target.value); App.toast("Theme saved."); }); });
          $("#dgChart", b).addEventListener("change", function (e) { App.run(e.target, async function () { await App.saveSettings({ default_chart_type: e.target.value }); App.toast("Default chart saved."); }); });
          $("#dgLang", b).addEventListener("change", function (e) { App.closeModal(false); setLanguage(e.target.value); });
        }
      });
    },
    language: function () { App.modal({ title: t("language"), html: languageBody() }); },
    upgrade: async function () {
      var r;
      try { r = await api("GET", "/api/billing/plans"); } catch (e) { App.toast(e.message, "error"); return; }
      var cur = App.meta.currency;
      function lim(n, unit) { return n === null ? "Unlimited " + unit : App.fmtNum(n) + " " + unit + " a day"; }
      var cards = r.plans.map(function (p) {
        var isCur = p.name === r.current_plan, price = Number(p.price_monthly);
        return '<div class="plan' + (isCur ? " current" : "") + '"><h3>' + esc(App.cap(p.name)) + (isCur ? ' <span class="pill ok">Current</span>' : "") + '</h3><p class="price"><strong>' + (price ? esc(App.fmtMoney(price, cur)) : "Free") + "</strong> <span>" + (price ? "per month" : "forever") + "</span></p>" +
          '<ul class="plain-list"><li>' + lim(p.daily_query_limit, "queries") + "</li><li>" + lim(p.daily_token_limit, "tokens") + "</li></ul>" +
          (!isCur && price ? '<button type="button" class="btn" data-dlg-buy="plan:' + attr(p.name) + '">Upgrade to ' + esc(App.cap(p.name)) + "</button>" : "") + "</div>";
      }).join("");
      var packs = r.packs.map(function (k) {
        return '<div class="pack"><strong>' + esc(App.fmtNum(k.tokens)) + ' tokens</strong><span class="muted">' + esc(App.fmtMoney(k.price, cur)) + ' one-time</span><button type="button" class="btn plain" data-dlg-buy="pack:' + attr(k.key) + '">Buy pack</button></div>';
      }).join("");
      App.modal({
        title: t("upgrade"),
        html: '<div class="plans">' + cards + '</div><h3 class="h2-sec">Token packs</h3><div class="packs">' + packs + "</div>",
        foot: [{ label: "Close", cls: "plain", value: false }, { label: "Compare plans", value: true, onClick: function () { location.href = "/pricing"; } }],
        onMount: function (b) {
          b.addEventListener("click", function (ev) {
            var btn = ev.target.closest("[data-dlg-buy]");
            if (!btn) return;
            var kv = btn.getAttribute("data-dlg-buy").split(":"), target = {}, label = "";
            target[kv[0]] = kv[1];
            if (kv[0] === "plan") label = App.cap(kv[1]) + " plan (1 month)";
            else { var k = r.packs.filter(function (x) { return x.key === kv[1]; })[0]; label = App.fmtNum(k.tokens) + " tokens"; }
            App.closeModal(false); setTimeout(function () { App.checkout(target, label); }, 0);
          });
        }
      });
    },
    help: function () {
      var faq = [["How do I ask a question?", "Type it in the box on the chat page and press Enter. Shift and Enter starts a new line."],
        ["Can I change the SQL?", "Yes. Choose Edit above the SQL, change it, then choose Run SQL. Only read-only SELECT queries run."],
        ["What happens at my daily limit?", "You'll see a message with a link to the plans. Limits reset at midnight, and token packs are used after your daily tokens run out."],
        ["Where are my questions saved?", "In History. Star one to keep it in Saved queries."]];
      App.modal({ title: t("help"), html: '<div class="faq">' + faq.map(function (f) { return "<details><summary>" + esc(f[0]) + "</summary><p>" + esc(f[1]) + "</p></details>"; }).join("") + "</div>",
        foot: [{ label: "Close", cls: "plain", value: false }, { label: "Full help page", value: true, onClick: function () { location.href = "/about#help"; } }] });
    }
  };
  App.openDialog = function (name) {
    if (name === "language") return DIALOGS.language();
    if (!App.user) return;
    if (DIALOGS[name]) return DIALOGS[name]();
    var m = /^learn-(\w+)$/.exec(name);
    if (m && LEARN[m[1]]) App.modal({ title: LEARN[m[1]][0], html: "<p>" + esc(LEARN[m[1]][1]) + "</p>",
      foot: [{ label: "Close", cls: "plain", value: false }, { label: "Read more", value: true, onClick: function () { location.href = "/about#" + m[1]; } }] });
  };

  /* ------------------------------------------------------------------- start */
  /** Every page script calls App.start(render[, {flush}]). render(outlet, ctx) draws the page. */
  App.start = async function (render, opts) {
    opts = opts || {};
    document.documentElement.lang = App.lang;
    try { App.meta = await api("GET", "/api/meta"); } catch (e) { App.meta = { app_name: "SQL assistant", currency: "INR" }; }
    var kind = LAYOUT;
    if (ACCESS !== "public" || kind === "public") {
      try {
        App.me = await api("GET", "/api/auth/me");
        App.user = App.me.user;
        App.setTheme(App.me.settings.theme);
      } catch (e) { if (ACCESS !== "public" && LAYOUT !== "bare") return; }
    }
    if (App.user && kind === "public") kind = "app";           // logged-in visitors get the full sidebar on public pages
    if (kind === "app" && !App.user) kind = "public";
    if (kind === "app") {
      try { sessions = (await api("GET", "/api/history/sessions")).items; } catch (e) { sessions = []; }
    }
    buildLayout(kind, opts.flush);
    bindShell();
    var ctx = { user: App.user, me: App.me, meta: App.meta, layout: kind };
    try { await render($("#outlet"), ctx); }
    catch (e) { var o = $("#outlet"); if (o) o.innerHTML = '<div class="page"><div class="banner error"><strong>Something went wrong.</strong>' + esc(e.message || "Please reload the page.") + "</div></div>"; }
  };
  App.sessions = function () { return sessions; };
  App.page = PAGE;
})();
