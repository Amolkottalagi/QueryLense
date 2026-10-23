"use strict";
App.start(function (out) {
  var esc = App.esc, attr = App.attr, api = App.api, cur = App.meta.currency, me = App.user;
  var TABS = [["overview", "Overview"], ["users", "Users"], ["payments", "Payments"], ["prompts", "Prompts"], ["logs", "Logs"]];
  var current = "overview", planNames = [], cache = {};

  App.html(out, '<div class="page"><h1>Admin dashboard</h1><p class="lead">How the assistant is being used, and who is using it.</p>' +
    '<div class="tabbar" role="tablist">' + TABS.map(function (x) { return '<button type="button" role="tab" class="tab" data-tab="' + x[0] + '">' + x[1] + "</button>"; }).join("") + '</div><div id="pane"></div></div>');
  var pane = App.$("#pane", out);

  function tbl(head, rows, o) {
    o = o || {};
    if (!rows.length) return '<p class="muted">' + esc(o.empty || "Nothing here yet.") + "</p>";
    return '<div class="table-wrap"><table><thead><tr>' + head.map(function (h, i) { return '<th class="' + ((o.num || []).indexOf(i) >= 0 ? "num" : "") + '">' + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return '<td class="' + ((o.num || []).indexOf(i) >= 0 ? "num" : "") + '">' + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  }
  function kpi(label, value, sub) { return '<div class="kpi"><div class="k-label">' + esc(label) + '</div><div class="k-value">' + esc(value) + '</div><div class="k-sub">' + esc(sub || "") + "</div></div>"; }
  function pill(s, cls) { return '<span class="pill ' + (cls || "") + '">' + esc(s) + "</span>"; }
  function item(p) { return p.plan ? App.cap(p.plan) + " plan" : App.fmtNum(p.tokens_purchased) + " tokens"; }
  function fail(e) { pane.innerHTML = '<div class="banner error"><strong>Couldn\'t load this tab.</strong>' + esc(e.message) + "</div>"; }

  /* ------------------------------------------------------------- overview */
  async function overview() {
    var r = await api("GET", "/api/admin/overview"), o = r.overview;
    var reasons = r.feedback_reasons.map(function (d) { return { label: d.reason, value: d.n }; });
    var maxR = reasons.reduce(function (m, x) { return Math.max(m, x.value); }, 1);
    App.html(pane, '<div class="stack"><div class="grid k4">' +
      kpi("Total users", App.fmtNum(o.total_users), App.fmtNum(o.active_users) + " active") + kpi("Questions", App.fmtNum(o.total_questions), App.fmtNum(o.queries_today) + " today") +
      kpi("Tokens used", App.fmtCompact(o.total_tokens), App.fmtCompact(o.tokens_today) + " today") + kpi("Error rate", (o.error_rate * 100).toFixed(1) + "%", "Questions whose final answer failed") +
      kpi("Feedback", o.thumbs_up + " 👍  " + o.thumbs_down + " 👎", "From users") + kpi("Revenue", App.fmtMoney(o.revenue, cur), "Successful payments") + "</div>" +
      '<div class="grid k2"><div class="card"><h2>Tokens per day</h2><p class="muted">All users</p>' + App.chartBox("bar", r.daily.map(function (d) { return { label: String(d.day).slice(5), value: d.tokens }; }), { label: "Tokens used per day", empty: "No usage yet." }) + "</div>" +
      '<div class="card"><h2>Questions by final status</h2><p class="muted">Success, failed, blocked or needing detail</p>' + App.chartBox("pie", r.status.map(function (s) { return { label: s.status, value: s.n }; }), { label: "Questions by status", empty: "No questions yet." }) + "</div></div>" +
      '<div class="grid k2"><div class="card"><h2>Queries per day</h2><p class="muted">All users</p>' + App.chartBox("line", r.daily.map(function (d) { return { label: String(d.day).slice(5), value: d.queries }; }), { label: "Queries per day", empty: "No queries yet." }) + "</div>" +
      '<div class="card"><h2>Why answers were rated down</h2><p class="muted">Reasons given with a thumbs down</p>' + (reasons.length ? '<ul class="bar-list">' + reasons.map(function (d) {
        return "<li><span>" + esc(d.label.replace(/_/g, " ")) + '</span><div class="track warnbar"><span data-w="' + Math.round(d.value / maxR * 100) + '"></span></div><span class="val">' + d.value + "</span></li>"; }).join("") + "</ul>" : '<p class="muted">No negative feedback.</p>') + "</div></div>" +
      '<div class="card"><h2>Most active users</h2><p class="muted">By tokens used</p>' + tbl(["User", "Plan", "Questions", "Tokens"], r.top_users.map(function (u) { return [esc(u.username), pill(App.cap(u.plan), u.plan === "free" ? "" : "pro"), App.fmtNum(u.questions), App.fmtNum(u.tokens)]; }), { num: [2, 3], empty: "No users." }) + "</div></div>");
  }

  /* ---------------------------------------------------------------- users */
  async function users() {
    if (!planNames.length) planNames = (await api("GET", "/api/admin/plans")).items.map(function (p) { return p.name; });
    var q = cache.userQ || "";
    var r = await api("GET", "/api/admin/users" + (q ? "?q=" + encodeURIComponent(q) : ""));
    var keep = document.getElementById("userSearch");
    App.html(pane, '<div class="toolbar"><div class="grow"><input type="search" id="userSearch" placeholder="Search by username or email" aria-label="Search users" value="' + attr(q) + '"></div></div>' +
      tbl(["User", "Role", "Plan", "Status", "Last login", "Actions"], r.items.map(function (u) {
        var self = u.id === me.id;
        return ["<strong>" + esc(u.username) + '</strong><div class="muted">' + esc(u.email) + "</div>", pill(App.cap(u.role), u.role === "admin" ? "pro" : ""),
          '<select data-plan-for="' + u.id + '" aria-label="Plan for ' + attr(u.username) + '">' + planNames.map(function (n) { return '<option value="' + attr(n) + '"' + (n === u.plan ? " selected" : "") + ">" + esc(App.cap(n)) + "</option>"; }).join("") + "</select>",
          pill(u.is_active ? "Active" : "Disabled", u.is_active ? "ok" : "err"), esc(App.fmtDateTime(u.last_login_at) || "never"),
          '<div class="actions"><button type="button" class="btn plain sm" data-u="active" data-id="' + u.id + '" data-v="' + (u.is_active ? 0 : 1) + '"' + (self ? " disabled" : "") + ">" + (u.is_active ? "Disable" : "Enable") + "</button>" +
          '<button type="button" class="btn plain sm" data-u="role" data-id="' + u.id + '" data-name="' + attr(u.username) + '" data-v="' + (u.role === "admin" ? "user" : "admin") + '"' + (self ? " disabled" : "") + ">" + (u.role === "admin" ? "Make user" : "Make admin") + "</button>" +
          '<button type="button" class="btn plain sm" data-u="tokens" data-id="' + u.id + '" data-name="' + attr(u.username) + '">Give tokens</button></div>'];
      }), { empty: "No users match." }));
    var s = document.getElementById("userSearch");
    if (keep) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
  }

  /* ------------------------------------------------------------- payments */
  async function payments() {
    var r = await api("GET", "/api/admin/payments");
    App.html(pane, tbl(["Date", "User", "Item", "Amount", "Status", ""], r.items.map(function (p) {
      return [esc(App.fmtDate(p.created_at)), esc(p.username), esc(item(p)), esc(App.fmtMoney(p.amount, p.currency)), pill(App.cap(p.status), p.status === "success" ? "ok" : p.status === "failed" ? "err" : "warn"),
        p.status === "success" ? '<button type="button" class="btn plain sm" data-u="refund" data-id="' + p.id + '">Refund</button>' : ""];
    }), { num: [3], empty: "No payments yet." }));
  }

  /* -------------------------------------------------------------- prompts */
  async function prompts() {
    var both = await Promise.all([api("GET", "/api/admin/templates"), api("GET", "/api/admin/examples")]);
    cache.templates = both[0].items;
    App.html(pane, '<div class="stack"><div class="card"><h2>Prompt templates</h2><p class="muted">The active template is used for every question. Saving a name again creates a new version.</p>' +
      tbl(["Name", "Version", "Strategy", "Status", ""], cache.templates.map(function (x) {
        return [esc(x.name), "v" + x.version, esc(x.strategy.replace(/_/g, "-")), x.is_active ? pill("Active", "ok") : "",
          '<div class="actions"><button type="button" class="btn plain sm" data-u="viewtpl" data-id="' + x.id + '">View</button>' + (x.is_active ? "" : '<button type="button" class="btn plain sm" data-u="activate" data-id="' + x.id + '">Activate</button>') + "</div>"];
      }), { empty: "No templates." }) + '<div class="mt"><button type="button" class="btn" data-u="newtpl">New template</button></div></div>' +
      '<div class="card"><h2>Few-shot examples</h2><p class="muted">Worked examples added to few-shot prompts. They are never taken from the test questions.</p>' +
      tbl(["Question", "SQL", "Difficulty", "Active"], both[1].items.map(function (x) {
        return [esc(x.question_text), '<code class="sqlc">' + esc(x.sql_text) + "</code>", esc(x.difficulty), '<input type="checkbox" data-u="exactive" data-id="' + x.id + '"' + (x.is_active ? " checked" : "") + ' aria-label="Use example ' + x.id + '">'];
      }), { empty: "No few-shot examples." }) + '<div class="mt"><button type="button" class="btn" data-u="newex">New example</button></div></div></div>');
  }

  /* ----------------------------------------------------------------- logs */
  async function logs() {
    var which = cache.logKind || "errors";
    var r = await api("GET", { errors: "/api/admin/errors", blocked: "/api/admin/blocked", audit: "/api/admin/audit" }[which]);
    var t = {
      errors: [["Time", "User", "Source", "Code", "Message"], r.items.map(function (x) { return [esc(App.fmtDateTime(x.created_at)), esc(x.username || "–"), esc(x.source), esc(x.error_code || ""), esc(x.message)]; })],
      blocked: [["Time", "User", "Reason", "Question", "SQL"], r.items.map(function (x) { return [esc(App.fmtDateTime(x.created_at)), esc(x.username || "–"), pill(x.reason, "warn"), esc(x.question_text || ""), '<code class="sqlc">' + esc(x.attempted_sql || "") + "</code>"]; })],
      audit: [["Time", "Admin", "Action", "Target", "Details"], r.items.map(function (x) { return [esc(App.fmtDateTime(x.created_at)), esc(x.admin || "–"), esc(x.action), esc(x.target_type ? x.target_type + " #" + (x.target_id == null ? "" : x.target_id) : ""), '<code class="sqlc">' + esc(x.details ? JSON.stringify(x.details) : "") + "</code>"]; })]
    }[which];
    App.html(pane, '<div class="toolbar"><select id="logKind" aria-label="Log type"><option value="errors">Errors</option><option value="blocked">Blocked queries</option><option value="audit">Admin audit log</option></select></div>' + tbl(t[0], t[1], { empty: "Nothing logged." }));
    document.getElementById("logKind").value = which;
  }

  var loaders = { overview: overview, users: users, payments: payments, prompts: prompts, logs: logs };
  function tab(which) {
    current = which;
    App.$$(".tab", out).forEach(function (b) { var on = b.getAttribute("data-tab") === which; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    pane.innerHTML = '<div class="empty-result"><span class="spinner" aria-label="Loading"></span></div>';
    return loaders[which]().catch(fail);
  }
  function reload() { return loaders[current]().catch(fail); }

  function tokensDialog(id, name) {
    App.modal({ title: "Give tokens to " + name, html: '<div class="fld"><label for="gAmt">Tokens</label><input id="gAmt" type="number" min="1" max="1000000000" value="10000"></div><p class="err-text" id="gErr" role="alert"></p>',
      foot: [{ label: "Cancel", cls: "plain", value: false }, { label: "Give tokens", value: true, onClick: function () {
        api("POST", "/api/admin/users/" + id + "/grant-tokens", { tokens: Number(App.$("#gAmt").value) }).then(function () { App.closeModal(true); App.toast("Tokens added."); }).catch(function (e) { App.$("#gErr").textContent = e.message; });
        return false;
      } }] });
  }
  function templateDialog() {
    App.modal({ title: "New prompt template", html: '<div class="fld"><label for="tName">Name</label><input id="tName" type="text" maxlength="60"></div><div class="fld mt"><label for="tStrat">Strategy</label><select id="tStrat"><option value="few_shot">few-shot</option><option value="zero_shot">zero-shot</option><option value="chain_of_thought">chain-of-thought</option></select></div>' +
      '<div class="fld mt"><label for="tText">Template text</label><textarea id="tText" class="mono" rows="10" maxlength="20000"></textarea><p class="hint">Must contain {schema} and {question}. {examples} is optional.</p></div><p class="err-text" id="tErr" role="alert"></p>',
      onMount: function (b) { App.$("#tText", b).value = "You are an expert MySQL analyst. Write ONE read-only SELECT query that answers the question.\nReply as:\nSQL: <query>\nEXPLANATION: <one sentence>\nIf the question is unclear reply: CLARIFY: <question>\n\nSchema:\n{schema}\n{examples}\nQuestion: {question}"; },
      foot: [{ label: "Cancel", cls: "plain", value: false }, { label: "Create template", value: true, onClick: function () {
        api("POST", "/api/admin/templates", { name: App.$("#tName").value.trim(), strategy: App.$("#tStrat").value, template_text: App.$("#tText").value }).then(function () { App.closeModal(true); App.toast("Template created (not active yet)."); reload(); }).catch(function (e) { App.$("#tErr").textContent = e.message; });
        return false;
      } }] });
  }
  function exampleDialog() {
    App.modal({ title: "New few-shot example", html: '<div class="fld"><label for="eQ">Question</label><input id="eQ" type="text" maxlength="1000"></div><div class="fld mt"><label for="eS">SQL (SELECT only)</label><textarea id="eS" class="mono" rows="4" maxlength="10000"></textarea></div><div class="fld mt"><label for="eD">Difficulty</label><select id="eD"><option>easy</option><option>medium</option><option>hard</option></select></div><p class="err-text" id="eErr" role="alert"></p>',
      foot: [{ label: "Cancel", cls: "plain", value: false }, { label: "Add example", value: true, onClick: function () {
        api("POST", "/api/admin/examples", { question: App.$("#eQ").value.trim(), sql_text: App.$("#eS").value, difficulty: App.$("#eD").value }).then(function () { App.closeModal(true); App.toast("Example added."); reload(); }).catch(function (e) { App.$("#eErr").textContent = e.message; });
        return false;
      } }] });
  }

  out.addEventListener("click", function (ev) {
    var tb = ev.target.closest(".tab[data-tab]");
    if (tb) { tab(tb.getAttribute("data-tab")); return; }
    var b = ev.target.closest("[data-u]");
    if (!b) return;
    var a = b.getAttribute("data-u"), id = Number(b.getAttribute("data-id"));
    if (a === "active") App.run(b, async function () { await api("POST", "/api/admin/users/" + id + "/active", { active: b.getAttribute("data-v") === "1" }); await reload(); });
    else if (a === "role") {
      var v = b.getAttribute("data-v");
      (v === "admin" ? App.confirm({ title: "Make " + b.getAttribute("data-name") + " an admin?", message: "They will get full admin access.", confirm: "Make admin" }) : Promise.resolve(true)).then(function (yes) {
        if (yes) App.run(b, async function () { await api("POST", "/api/admin/users/" + id + "/role", { role: v }); await reload(); });
      });
    }
    else if (a === "tokens") tokensDialog(id, b.getAttribute("data-name"));
    else if (a === "refund") App.confirm({ title: "Refund this payment?", message: "This marks it refunded and takes back what it granted. Return the money itself in your payment gateway.", confirm: "Refund", danger: true }).then(function (yes) {
      if (yes) App.run(b, async function () { await api("POST", "/api/admin/payments/" + id + "/refund"); App.toast("Marked as refunded."); await reload(); });
    });
    else if (a === "viewtpl") { var x = cache.templates.filter(function (t) { return t.id === id; })[0]; App.modal({ title: x.name + " v" + x.version, html: '<pre class="sql sql-light">' + esc(x.template_text) + "</pre>", foot: [{ label: "Close", cls: "plain", value: false }] }); }
    else if (a === "activate") App.run(b, async function () { await api("POST", "/api/admin/templates/" + id + "/activate"); App.toast("Template activated."); await reload(); });
    else if (a === "newtpl") templateDialog();
    else if (a === "newex") exampleDialog();
  });
  out.addEventListener("change", function (ev) {
    var el = ev.target;
    if (el.matches("[data-plan-for]")) App.run(el, async function () { await api("POST", "/api/admin/users/" + el.getAttribute("data-plan-for") + "/plan", { plan: el.value }); App.toast("Plan updated."); });
    else if (el.matches('[data-u="exactive"]')) App.run(el, function () { return api("POST", "/api/admin/examples/" + el.getAttribute("data-id") + "/active", { active: el.checked }); });
    else if (el.id === "logKind") { cache.logKind = el.value; logs().catch(fail); }
  });
  var timer;
  out.addEventListener("input", function (ev) { if (ev.target.id === "userSearch") { clearTimeout(timer); timer = setTimeout(function () { cache.userQ = ev.target.value.trim(); users().catch(fail); }, 300); } });
  tab("overview");
});
