"use strict";
App.start(async function (out) {
  var esc = App.esc, attr = App.attr, api = App.api;
  App.html(out, '<div class="page"><h1>History</h1><p class="lead">Every question you have asked, with the SQL that was written for it.</p>' +
    '<div class="toolbar"><div class="grow"><input type="search" id="hSearch" placeholder="Search your questions" aria-label="Search your questions"></div>' +
    '<select id="hStatus" aria-label="Filter by status"><option value="">All statuses</option><option value="success">Succeeded</option><option value="error">Failed</option><option value="blocked">Blocked</option></select>' +
    '<button type="button" class="btn plain danger" id="hClear" hidden>Clear history</button></div><div id="hList"></div></div>');
  var list = App.$("#hList", out), search = App.$("#hSearch", out), status = App.$("#hStatus", out), items = [], total = 0;

  function pill(it) {
    if (!it.status) return '<span class="pill">No answer</span>';
    if (it.status === "success") return '<span class="pill ok">Succeeded</span>';
    if (it.status === "clarification") return '<span class="pill warn">Needs detail</span>';
    return '<span class="pill err" title="' + attr(it.error_message || "") + '">' + (it.status === "blocked" ? "Blocked" : "Failed") + "</span>";
  }
  function draw() {
    App.$("#hClear", out).hidden = !total;
    if (!items.length) {
      list.innerHTML = total || search.value || status.value ? '<div class="empty-state"><h2>Nothing matches</h2><p>Try a different search or status.</p></div>'
        : '<div class="empty-state"><h2>No questions yet</h2><p>Questions you ask in chat will be listed here.</p><a class="btn" href="/chat">Ask a question</a></div>';
      return;
    }
    list.innerHTML = '<div class="table-wrap tall"><table><thead><tr><th>Question</th><th>Status</th><th>Date</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>' +
      items.map(function (x) {
        return '<tr data-pid="' + x.prompt_id + '" data-sid="' + x.chat_session_id + '"><td class="cell-wrap"><div>' + esc(x.question_text) + "</div>" +
          (x.generated_sql ? '<details class="sql-peek"><summary>View SQL</summary><pre>' + App.highlight(x.generated_sql) + "</pre></details>" : "") + "</td><td>" + pill(x) + "</td><td>" + esc(App.fmtDateTime(x.created_at)) +
          '</td><td><div class="actions"><button type="button" class="btn plain sm" data-a="open">Open chat</button>' +
          (x.status === "success" ? '<button type="button" class="btn plain sm" data-a="rerun">Run again</button><button type="button" class="btn plain sm" data-a="save"' + (x.is_saved ? " disabled" : "") + ">" + (x.is_saved ? "Saved" : "Save") + "</button>" : "") +
          '<button type="button" class="btn plain sm danger" data-a="del">Delete</button></div></td></tr>';
      }).join("") + "</tbody></table></div>";
  }
  async function load() {
    var qs = "?limit=200" + (search.value.trim() ? "&q=" + encodeURIComponent(search.value.trim()) : "") + (status.value ? "&status=" + status.value : "");
    try {
      items = (await api("GET", "/api/history" + qs)).items;
      if (!total || (!search.value && !status.value)) total = items.length;
      draw();
    } catch (e) { App.toast(e.message, "error"); }
  }
  var timer; search.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(load, 250); });
  status.addEventListener("change", load);
  list.addEventListener("click", function (ev) {
    var btn = ev.target.closest("[data-a]"), row = ev.target.closest("tr[data-pid]");
    if (!btn || !row) return;
    var pid = Number(row.getAttribute("data-pid")), sid = row.getAttribute("data-sid"), a = btn.getAttribute("data-a");
    if (a === "open") location.href = "/chat?session=" + sid;
    else if (a === "rerun") App.run(btn, async function () {
      var r = await api("POST", "/api/history/prompt/" + pid + "/rerun");
      App.modal({ title: "Results", html: '<pre class="sql sql-light">' + App.highlight(r.sql) + "</pre>" + '<p class="muted">' + r.row_count + " rows" + (r.truncated ? " (first rows only)" : "") + "</p>" + App.resultTable(r, { id: "x", max: 200 }), foot: [{ label: "Close", cls: "plain", value: false }] });
    });
    else if (a === "save") App.run(btn, async function () { await api("POST", "/api/history/prompt/" + pid + "/save", {}); App.toast("Saved to Saved queries."); load(); });
    else if (a === "del") App.confirm({ title: "Delete this question?", message: "It will be removed from your history. This can't be undone.", confirm: "Delete", danger: true }).then(function (yes) {
      if (!yes) return;
      App.run(null, async function () { await api("DELETE", "/api/history/prompt/" + pid); App.toast("Question deleted."); total = 0; await load(); App.refreshShell(); });
    });
  });
  App.$("#hClear", out).addEventListener("click", function () {
    App.confirm({ title: "Clear all history?", message: "Every question and answer will be deleted. Saved queries are kept. This can't be undone.", confirm: "Clear history", danger: true }).then(function (yes) {
      if (!yes) return;
      App.run(null, async function () { await api("DELETE", "/api/history"); App.toast("History cleared."); total = 0; await load(); App.refreshShell(); });
    });
  });
  await load();
});
