"use strict";
App.start(async function (out) {
  var esc = App.esc, api = App.api, items = [];
  App.html(out, '<div class="page"><h1>Saved queries</h1><p class="lead">Questions you starred. Run one again whenever you need fresh results.</p><div id="sList"></div></div>');
  var list = App.$("#sList", out);
  function draw() {
    if (!items.length) { list.innerHTML = '<div class="empty-state"><h2>Nothing saved yet</h2><p>Choose Save above the SQL in chat, or in History, to keep a question here.</p><a class="btn" href="/chat">Go to chat</a></div>'; return; }
    list.innerHTML = '<div class="table-wrap tall"><table><thead><tr><th>Question</th><th>Saved</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>' +
      items.map(function (s) {
        return '<tr data-id="' + s.id + '"><td class="cell-wrap"><div>' + esc(s.title && s.title !== s.question_text ? s.title : s.question_text) + "</div>" +
          (s.sql_text ? '<details class="sql-peek"><summary>View SQL</summary><pre>' + App.highlight(s.sql_text) + "</pre></details>" : "") + "</td><td>" + esc(App.fmtDate(s.created_at)) +
          '</td><td><div class="actions">' + (s.sql_text ? '<button type="button" class="btn plain sm" data-a="run">Run again</button><button type="button" class="btn plain sm" data-a="copy">Copy SQL</button>' : '<a class="btn plain sm" href="/chat?q=' + encodeURIComponent(s.question_text.slice(0, 500)) + '">Ask again</a>') +
          '<button type="button" class="btn plain sm danger" data-a="remove">Remove</button></div></td></tr>';
      }).join("") + "</tbody></table></div>";
  }
  async function load() { items = (await api("GET", "/api/saved")).items; draw(); }
  list.addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-a]"), row = ev.target.closest("tr[data-id]");
    if (!btn || !row) return;
    var id = Number(row.getAttribute("data-id")), a = btn.getAttribute("data-a"), s = items.filter(function (x) { return x.id === id; })[0];
    if (a === "run") App.run(btn, async function () {
      var r = await api("POST", "/api/saved/" + id + "/rerun");
      App.modal({ title: "Results", html: '<p class="muted">' + r.row_count + " rows" + (r.truncated ? " (first rows only)" : "") + "</p>" + App.resultTable(r, { id: "x", max: 200 }), foot: [{ label: "Close", cls: "plain", value: false }] });
    });
    else if (a === "copy") App.copy(s.sql_text, "SQL copied.");
    else if (a === "remove") App.run(btn, async function () { await api("DELETE", "/api/saved/" + id); App.toast("Removed from Saved queries."); await load(); });
  });
  await load();
});
