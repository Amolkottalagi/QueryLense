"use strict";
App.start(async function (out) {
  var esc = App.esc, api = App.api, cur = App.meta.currency;
  var results = await Promise.all([api("GET", "/api/usage?days=1"), api("GET", "/api/billing/payments")]);
  var us = results[0].today, pays = results[1].items, pro = App.user.plan !== "free";
  function item(p) { return p.plan ? App.cap(p.plan) + " plan (1 month)" : App.fmtNum(p.tokens_purchased) + " tokens"; }
  function pill(s) { return '<span class="pill ' + (s === "success" ? "ok" : s === "failed" ? "err" : s === "refunded" ? "warn" : "") + '">' + esc(App.cap(s)) + "</span>"; }
  App.html(out, '<div class="page"><h1>Billing</h1><p class="lead">Your plan, token balance and payment history.</p><div class="stack">' +
    '<div class="card"><h2>Current plan</h2><div class="pref-row"><div><strong class="plan-name">' + esc(App.cap(us.plan)) + "</strong> " + (pro ? '<span class="pill pro">' + esc(App.cap(us.plan)) + "</span>" : '<span class="pill">Free</span>') +
      '<div class="muted">' + (pro ? "Higher limits, charts and CSV export are active." : "Free forever. Upgrade any time.") + '</div></div><div class="actions">' + (pro ? "" : '<a class="btn" href="/pricing">Upgrade</a>') + '<a class="btn plain" href="/pricing">Compare plans</a></div></div>' +
      '<div class="pref-row"><span>Token pack balance</span><strong>' + App.fmtNum(us.token_balance) + ' tokens</strong></div>' +
      '<div class="pref-row"><span class="muted">Pack tokens are used after your daily allowance runs out and never expire.</span><a class="btn plain sm" href="/pricing">Buy tokens</a></div></div>' +
    '<div class="card"><h2>Payment history</h2>' + (pays.length ? '<div class="table-wrap"><table><thead><tr><th>Date</th><th>Item</th><th class="num">Amount</th><th>Status</th><th><span class="sr-only">Invoice</span></th></tr></thead><tbody>' +
      pays.map(function (p) {
        return "<tr><td>" + esc(App.fmtDate(p.paid_at || p.created_at)) + "</td><td>" + esc(item(p)) + '</td><td class="num">' + esc(App.fmtMoney(p.amount, p.currency)) + "</td><td>" + pill(p.status) + "</td><td>" +
          (p.invoice_number ? '<button type="button" class="btn plain sm" data-inv="' + p.id + '">Invoice ' + esc(p.invoice_number) + "</button>" : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>" : '<div class="empty-state"><h2>No payments yet</h2><p>Payments and invoices will appear here after your first purchase.</p><a class="btn" href="/pricing">See plans</a></div>') + "</div></div></div>");
  App.$(".page", out).addEventListener("click", function (ev) {
    var b = ev.target.closest("[data-inv]");
    if (!b) return;
    App.run(b, async function () {
      var inv = await api("GET", "/api/billing/invoice/" + b.getAttribute("data-inv")), c = inv.currency;
      App.modal({ title: "Invoice", html: '<div class="invoice"><h3>Invoice ' + esc(inv.invoice_number) + '</h3><div class="inv-grid"><div><div class="muted">Billed to</div><div>' + esc(inv.username) + "<br>" + esc(inv.email) + '</div></div><div><div class="muted">Date</div><div>' + esc(App.fmtDate(inv.issued_at)) + "</div></div></div>" +
        '<div class="sum-row"><span>' + esc(inv.plan ? App.cap(inv.plan) + " plan (1 month)" : App.fmtNum(inv.tokens_purchased) + " tokens") + "</span><span>" + esc(App.fmtMoney(inv.subtotal, c)) + "</span></div>" +
        '<div class="sum-row"><span>Tax</span><span>' + esc(App.fmtMoney(inv.tax_amount, c)) + '</span></div><div class="sum-row total"><span>Total</span><span>' + esc(App.fmtMoney(inv.total, c)) + "</span></div></div>",
        foot: [{ label: "Close", cls: "plain", value: false }, { label: "Print", value: true, onClick: function () { window.print(); return false; } }] });
    });
  });
});
