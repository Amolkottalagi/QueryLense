"use strict";
App.start(async function (out) {
  var esc = App.esc, api = App.api, cur = App.meta.currency;
  var r = await api("GET", "/api/billing/public-plans"), u = App.user;
  function lim(n, unit) { return n === null ? "Unlimited " + unit : App.fmtNum(n) + " " + unit + " a day"; }
  var blurb = { free: "For trying things out and light use.", pro: "For regular, heavier use." };
  function card(p) {
    var price = Number(p.price_monthly), current = u && u.plan === p.name, cta;
    if (current) cta = '<button class="btn plain" type="button" disabled>Current plan</button>';
    else if (!u) cta = price ? '<a class="btn" href="/login?next=/pricing">Log in to upgrade</a>' : '<a class="btn plain" href="/signup">Sign up free</a>';
    else cta = price ? '<button class="btn" type="button" data-buy="plan:' + esc(p.name) + '">Upgrade to ' + esc(App.cap(p.name)) + "</button>" : "";
    return '<div class="plan' + (current ? " current" : "") + '"><h3>' + esc(App.cap(p.name)) + (current ? ' <span class="pill ok">Current plan</span>' : "") + '</h3><p class="price"><strong>' + (price ? esc(App.fmtMoney(price, cur)) : "Free") + "</strong> <span>" + (price ? "per month" : "forever") + "</span></p>" +
      '<p class="muted">' + esc(blurb[p.name] || "") + '</p><ul class="plain-list"><li>' + lim(p.daily_query_limit, "queries") + "</li><li>" + lim(p.daily_token_limit, "tokens") + "</li><li>" + (p.can_use_charts ? "Bar, line and pie charts" : "Tables only") + "</li><li>" + (p.can_export_csv ? "CSV export" : "No CSV export") + "</li></ul>" + cta + "</div>";
  }
  var rows = [["Price", function (p) { return Number(p.price_monthly) ? App.fmtMoney(p.price_monthly, cur) + " per month" : "Free"; }], ["Queries per day", function (p) { return App.fmtNum(p.daily_query_limit); }],
    ["Tokens per day", function (p) { return App.fmtNum(p.daily_token_limit); }], ["Charts", function (p) { return p.can_use_charts ? "Included" : "Not included"; }], ["CSV export", function (p) { return p.can_export_csv ? "Included" : "Not included"; }], ["History and saved queries", function () { return "Included"; }]];
  App.html(out, '<div class="page"><h1>Pricing</h1><p class="lead">Start free. Upgrade when you need more queries or tokens each day.</p>' +
    (r.demo ? '<div class="banner info"><strong>Demo payments.</strong>Checkout takes no real payment until Razorpay keys are added to the .env file.</div>' : "") +
    '<div class="plans">' + r.plans.map(card).join("") + "</div>" +
    '<div class="compare"><h2>Compare plans</h2><div class="table-wrap tall"><table><thead><tr><th></th>' + r.plans.map(function (p) { return "<th>" + esc(App.cap(p.name)) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (row) { return "<tr><td>" + row[0] + "</td>" + r.plans.map(function (p) { return "<td>" + esc(row[1](p)) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div></div>" +
    '<h2 class="h2-sec mt-l">Token packs</h2><p class="lead">One-off tokens that never expire. They are used after your daily token allowance runs out.</p><div class="packs">' +
    r.packs.map(function (k) {
      return '<div class="pack"><strong>' + esc(App.fmtNum(k.tokens)) + ' tokens</strong><span class="muted">' + esc(App.fmtMoney(k.price, cur)) + " one-time</span>" +
        (u ? '<button class="btn plain" type="button" data-buy="pack:' + esc(k.key) + '">Buy pack</button>' : '<a class="btn plain" href="/login?next=/pricing">Log in to buy</a>') + "</div>";
    }).join("") + "</div></div>");
  App.$(".page", out).addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-buy]");
    if (!b) return;
    var kv = b.getAttribute("data-buy").split(":"), target = {}, label;
    target[kv[0]] = kv[1];
    if (kv[0] === "plan") label = App.cap(kv[1]) + " plan (1 month)"; else label = App.fmtNum(r.packs.filter(function (x) { return x.key === kv[1]; })[0].tokens) + " tokens";
    App.checkout(target, label);
  });
});
