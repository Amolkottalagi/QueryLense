"use strict";
App.start(async function (out) {
  var esc = App.esc, api = App.api;
  var r = await api("GET", "/api/usage?days=14"), u = r.today, d = r.daily;
  var total = d.reduce(function (s, x) { return s + Number(x.tokens); }, 0);
  var left = u.queries_left === null ? "Unlimited" : u.queries_left;
  App.html(out, '<div class="page"><h1>Usage</h1><p class="lead">How much of your daily allowance you have used. Limits reset at midnight.</p><div class="stack"><div class="grid k4">' +
    '<div class="kpi"><div class="k-label">Queries today</div><div class="k-value">' + u.queries_used + " / " + (u.queries_limit === null ? "∞" : u.queries_limit) + '</div><div class="k-sub">' + u.errors_today + " failed today</div></div>" +
    '<div class="kpi"><div class="k-label">Tokens today</div><div class="k-value">' + App.fmtNum(u.tokens_used) + '</div><div class="k-sub">of ' + (u.tokens_limit === null ? "unlimited" : App.fmtNum(u.tokens_limit)) + " daily</div></div>" +
    '<div class="kpi"><div class="k-label">Queries left</div><div class="k-value">' + left + '</div><div class="k-sub">' + (u.tokens_left === null ? "Unlimited" : App.fmtNum(u.tokens_left)) + " daily tokens left" + (u.token_balance ? " + " + App.fmtNum(u.token_balance) + " from token packs" : "") + "</div></div>" +
    '<div class="kpi"><div class="k-label">Plan</div><div class="k-value">' + esc(App.cap(u.plan)) + '</div><div class="k-sub">' + (App.user.plan === "free" ? '<a href="/pricing">Upgrade for higher limits</a>' : "Charts and CSV export included") + "</div></div></div>" +
    '<div class="card"><h2>Tokens per day</h2><p class="muted">Last 14 days · ' + App.fmtNum(total) + " tokens in total</p>" +
    App.chartBox("bar", d.map(function (x) { return { label: String(x.day).slice(5), value: x.tokens }; }), { label: "Tokens used per day for the last 14 days" }) + "</div>" +
    '<div class="card"><h2>Daily breakdown</h2><div class="table-wrap"><table><thead><tr><th>Date</th><th class="num">Queries</th><th class="num">Failed</th><th class="num">Tokens</th></tr></thead><tbody>' +
    d.slice().reverse().map(function (x) { return "<tr><td>" + esc(x.day) + '</td><td class="num">' + x.queries + '</td><td class="num">' + x.errors + '</td><td class="num">' + App.fmtNum(x.tokens) + "</td></tr>"; }).join("") + "</tbody></table></div></div></div></div>");
});
