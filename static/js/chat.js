"use strict";
App.start(async function (out, ctx) {
  var esc = App.esc, attr = App.attr, api = App.api, t = App.t;
  var thread = [], busy = false, sessionId = null, nextId = 1, connectionId = 0, connectionItems = [];
  var EXAMPLES = ["How many customers do we have?", "Total revenue per product", "Which customers live in Pune?", "Most expensive product", "Orders per month", "Best selling products"];

  function usage() { return App.me.usage; }
  function find(id) { return thread.filter(function (m) { return m.id === id; })[0] || null; }
  function defaultView(result) {
    var pref = App.me.settings.default_chart_type;
    return usage().can_use_charts && App.chartable(result) && pref !== "none" ? pref : "table";
  }
  function perPage() { return App.me.settings.rows_per_page || 50; }
  function greeting() {
    var h = new Date().getHours();
    return (h < 12 ? t("morning") : h < 18 ? t("afternoon") : t("evening")) + ", " + App.user.username;
  }

  /* A saved question from the server -> a chat turn. Results are not stored, so they load on demand. */
  function fromHistory(it) {
    var ok = it.status === "success";
    return { id: nextId++, promptId: it.prompt_id, responseId: it.response_id, question: it.question_text, status: "done", sql: it.generated_sql || "",
      explanation: it.status === "clarification" ? "" : (it.explanation || ""), clarification: it.status === "clarification" ? it.explanation : null,
      result: null, rowCount: it.row_count || 0, truncated: false, ms: 0, view: "table", sort: null, rating: it.my_rating || 0, saved: !!it.is_saved,
      error: it.status === "error" || it.status === "blocked" ? { title: it.status === "blocked" ? "Blocked for safety" : "That didn't work", message: it.error_message || "" } : null,
      stored: ok, shown: perPage() };
  }
  function fromAnswer(question, r) {
    var m = { id: nextId++, promptId: r.prompt_id, responseId: r.response_id, question: question, status: "done", sql: r.sql || "", explanation: r.explanation || "",
      clarification: r.status === "clarification" ? (r.clarification || r.explanation) : null, result: null, rowCount: r.row_count || 0, truncated: !!r.truncated,
      ms: 0, view: "table", sort: null, rating: 0, saved: false, error: null, stored: false, shown: perPage() };
    if (r.status === "success" && r.rows) { m.result = { columns: r.columns, rows: r.rows }; m.view = defaultView(m.result); m.stored = true; }
    else if (r.status === "blocked") m.error = { title: "Blocked for safety", message: r.error || "Only read-only queries are allowed." };
    else if (r.status === "error") m.error = { title: "That didn't work", message: r.error || "The query failed.", hint: "Try rephrasing the question." };
    return m;
  }

  /* ------------------------------------------------------------ rendering */
  function turnHtml(m) {
    var id = attr(m.id), h = '<div class="u"><div class="bubble">' + esc(m.question) + '</div></div><div class="b">';
    if (m.status === "loading") return h + '<div class="loading"><span class="dots"><span></span><span></span><span></span></span>' + esc(t("writing")) + "</div></div>";
    if (m.clarification) h += '<div class="banner info"><strong>I need a bit more detail</strong>' + esc(m.clarification) + "</div>";
    if (m.explanation && !m.editing && !m.error) h += '<p class="explain">' + esc(m.explanation) + "</p>";
    if (m.sql) {
      h += '<div class="sqlbox"><div class="sqlbar"><span>SQL</span><div class="acts">' +
        (m.editing ? "" : '<button type="button" data-action="copy" data-id="' + id + '">' + esc(t(m.copied ? "copied" : "copy")) + "</button>" +
          '<button type="button" data-action="edit" data-id="' + id + '">' + esc(t("edit")) + "</button>" +
          (m.promptId && m.stored ? '<button type="button" data-action="save" data-id="' + id + '" aria-pressed="' + !!m.saved + '"' + (m.saved ? " disabled" : "") + ">" + (m.saved ? "Saved" : "Save") + "</button>" : "")) +
        "</div></div>";
      if (m.editing) {
        h += '<textarea class="sql-edit" id="edit-' + id + '" spellcheck="false" aria-label="Edit SQL">' + esc(m.draft) + "</textarea>" +
          '<div class="edit-actions"><button type="button" class="btn" data-action="run" data-id="' + id + '">' + esc(t("runSql")) + "</button>" +
          '<button type="button" class="btn ghost" data-action="cancel" data-id="' + id + '">' + esc(t("cancel")) + "</button></div>";
      } else h += '<pre class="sql">' + App.highlight(m.sql) + "</pre>";
      h += "</div>";
    }
    if (m.status === "running") h += '<div class="loading mt"><span class="dots"><span></span><span></span><span></span></span>' + esc(t("running")) + "</div>";
    if (m.error) {
      h += '<div class="error" role="alert"><strong>' + esc(m.error.title) + "</strong>" + esc(m.error.message || "") +
        (m.error.hint ? '<div class="hint">' + esc(m.error.hint) + "</div>" : "") +
        (m.error.link ? '<div class="hint"><a href="' + attr(m.error.link.href) + '">' + esc(m.error.link.label) + "</a></div>" : "") + "</div>";
    }
    if (m.result && m.status !== "running") {
      var total = m.result.rows.length, canChart = usage().can_use_charts && App.chartable(m.result), view = canChart ? m.view : "table";
      h += '<div class="results"><div class="results-bar"><span class="muted">' + total + " " + esc(t(total === 1 ? "rowOne" : "rowMany")) +
        (m.truncated ? " (first rows only, narrow your question to see the rest)" : "") + (m.ms ? " · " + (m.ms / 1000).toFixed(1) + "s" : "") + '</span><div class="right">' +
        (canChart ? '<div class="seg" role="group" aria-label="View">' + ["table", "bar", "line", "pie"].map(function (v) {
          return '<button type="button" data-action="view" data-view="' + v + '" data-id="' + id + '" class="' + (view === v ? "on" : "") + '" aria-pressed="' + (view === v) + '">' + App.cap(v) + "</button>";
        }).join("") + "</div>" : "") +
        '<button type="button" class="btn plain sm" data-action="csv" data-id="' + id + '">' + esc(t("download")) + "</button></div></div>";
      if (view !== "table") h += '<div class="chart-box">' + App.chartSvg(view, m.result.rows.map(function (r) { return r[0]; }), m.result.rows.map(function (r) { return Number(r[1]); }), { label: m.result.columns[1] + " by " + m.result.columns[0] }) + "</div>";
      else {
        h += App.resultTable(m.result, { id: m.id, sort: m.sort, max: m.shown });
        if (total > m.shown) h += '<div class="mt-s"><button type="button" class="btn plain sm" data-action="more" data-id="' + id + '">Show ' + Math.min(perPage(), total - m.shown) + " more rows</button></div>";
      }
      h += "</div>";
    } else if (!m.result && m.stored && !m.error && m.status === "done" && !m.clarification) {
      h += '<div class="results"><div class="row-actions"><button type="button" class="btn plain sm" data-action="load" data-id="' + id + '">Show results</button><span class="muted">' + App.fmtNum(m.rowCount) + " rows. Re-running is free (no AI call).</span></div></div>";
    }
    if (m.responseId && m.status === "done" && !m.error) {
      h += '<div class="rate"><span>Was this helpful?</span>' + [1, -1].map(function (v) {
        return '<button type="button" data-action="rate" data-v="' + v + '" data-id="' + id + '" aria-pressed="' + (m.rating === v) + '" aria-label="' + (v > 0 ? "Helpful" : "Not helpful") + '">' + (v > 0 ? "👍" : "👎") + "</button>";
      }).join("") + "</div>";
    }
    return h + "</div>";
  }
  function paint(m) {
    var msgs = document.getElementById("msgs");
    var node = document.getElementById("m-" + m.id);
    if (!node) { node = document.createElement("article"); node.className = "turn"; node.id = "m-" + m.id; msgs.appendChild(node); }
    node.innerHTML = turnHtml(m);
    if (m.editing) { var ta = document.getElementById("edit-" + m.id); if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); } }
  }
  function scrollBottom() { var s = document.getElementById("chatScroll"); if (s) s.scrollTop = s.scrollHeight; }
  function setStarted(on) { document.getElementById("chat").classList.toggle("empty", !on); }

  /* ----------------------------------------------------------------- asking */
  async function ask(question) {
    question = String(question || "").trim();
    if (!question || busy) return;
    busy = true; document.getElementById("send").disabled = true;
    setStarted(true);
    var m = { id: nextId++, question: question, status: "loading" };
    thread.push(m); paint(m); scrollBottom();
    var t0 = Date.now();
    try {
      var r = await api("POST", "/api/chat/ask", { question: question, chat_session_id: sessionId, connection_id: connectionId });
      var turn = fromAnswer(question, r);
      turn.ms = Date.now() - t0; turn.id = m.id;
      thread[thread.indexOf(m)] = turn; m = turn;
      sessionId = r.chat_session_id;
      history.replaceState(null, "", "/chat?session=" + sessionId);
      if (r.usage) App.me.usage = r.usage;
    } catch (e) {
      var quota = e.status === 429;
      m.status = "done"; m.sql = ""; m.result = null;
      m.error = { title: quota ? "You've reached today's limit" : "Couldn't answer that question", message: e.message,
        hint: quota ? "Upgrade your plan or add a token pack to keep going." : "", link: quota ? { href: "/pricing", label: "See plans" } : null };
    }
    m.status = "done"; busy = false;
    document.getElementById("send").disabled = false;
    paint(m); scrollBottom();
    App.refreshShell();
    var q = document.getElementById("question"); if (q) q.focus();
  }

  async function runEdited(m) {
    var ta = document.getElementById("edit-" + m.id), sql = (ta ? ta.value : m.draft || "").trim();
    if (!sql) return;
    m.sql = sql; m.editing = false; m.status = "running"; m.error = null; m.sort = null; m.explanation = ""; m.clarification = null; m.shown = perPage();
    paint(m);
    var t0 = Date.now();
    try {
      var d = await api("POST", "/api/chat/run-sql", { sql: sql, connection_id: connectionId });
      m.result = { columns: d.columns, rows: d.rows }; m.rowCount = d.row_count; m.truncated = d.truncated; m.ms = Date.now() - t0; m.view = defaultView(m.result); m.stored = true;
      m.edited = true; m.responseId = null; m.promptId = null;      // an edited query isn't the saved answer any more
    } catch (e) { m.result = null; m.error = { title: "Couldn't run that SQL", message: e.message }; }
    m.status = "done"; paint(m);
  }

  async function loadResults(m, btn) {
    await App.run(btn, async function () {
      var r = await api("POST", "/api/history/prompt/" + m.promptId + "/rerun");
      m.result = { columns: r.columns, rows: r.rows }; m.truncated = r.truncated; m.view = defaultView(m.result); m.shown = perPage(); paint(m);
    });
  }

  /* --------------------------------------------------------------- sessions */
  async function openSession(id) {
    var s = document.getElementById("msgs");
    sessionId = id; thread = [];
    s.innerHTML = '<div class="empty-result"><span class="spinner" aria-label="Loading"></span></div>';
    setStarted(true);
    try {
      var r = await api("GET", "/api/history/session/" + id);
      s.innerHTML = "";
      thread = r.items.map(fromHistory);
      if (thread.length && r.items[0].connection_id !== undefined && r.items[0].connection_id !== null) { connectionId = Number(r.items[0].connection_id); var sel = document.getElementById("connectionSelect"); if (sel) sel.value = String(connectionId); await loadSchema(connectionId); }
      thread.forEach(paint);
      setStarted(thread.length > 0);
      scrollBottom();
    } catch (e) { sessionId = null; s.innerHTML = ""; setStarted(false); App.toast(e.message, "error"); history.replaceState(null, "", "/chat"); }
  }
  App.onNewChat = function () {
    sessionId = null; thread = []; if (connectionItems.length) { var def = connectionItems.filter(function (c) { return c.is_default; })[0]; connectionId = def ? def.id : 0; var sel = document.getElementById("connectionSelect"); if (sel) sel.value = String(connectionId); } document.getElementById("msgs").innerHTML = ""; setStarted(false);
    history.pushState(null, "", "/chat"); App.closeSide(); document.getElementById("question").focus();
  };

  /* ------------------------------------------------------------------- page */
  App.html(out, '<section class="chat empty" id="chat"><div class="chat-scroll" id="chatScroll"><div class="column">' +
    '<div class="hero"><svg width="34" height="34" viewBox="0 0 34 34" fill="none" aria-hidden="true"><ellipse cx="17" cy="8" rx="11" ry="4.5" fill="#F2B134"/>' +
      '<path d="M6 8v9c0 2.5 4.9 4.5 11 4.5s11-2 11-4.5V8" stroke="currentColor" stroke-width="2" fill="none"/><path d="M6 17v9c0 2.5 4.9 4.5 11 4.5s11-2 11-4.5v-9" stroke="currentColor" stroke-width="2" fill="none"/></svg>' +
      "<h1>" + esc(greeting()) + "</h1></div>" +
    '<div class="connection-picker" id="connectionPicker"><label for="connectionSelect">Database</label><select id="connectionSelect" aria-label="Selected database"><option value="0">Original shop_db (legacy)</option></select><a href="/connections">Manage connections</a></div>' +
    (App.meta.demo_ai ? '<div class="banner info slim demo"><strong>Demo mode.</strong>Answers come from a small built-in rule set about the sample shop database. Add GEMINI_API_KEY to the .env file to use a real AI model.</div>' : "") +
    '<div class="faq tables-box" id="tablesBox" hidden><details><summary>Tables you can ask about</summary><div id="tablesList" class="muted tables-list"></div></details></div>' +
    '<div id="msgs"></div></div></div>' +
    '<div class="composer-wrap"><form class="composer" id="askForm"><textarea id="question" rows="1" maxlength="500" placeholder="' + attr(t("placeholder")) + '" aria-label="' + attr(t("yourQ")) + '"></textarea>' +
    '<button class="send" id="send" type="submit" aria-label="' + attr(t("sendQ")) + '"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M9 15V3M9 3L3.5 8.5M9 3l5.5 5.5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button></form>' +
    '<div class="chips" id="chips"></div><p class="fine">' + esc(t("fine")) + "</p></div></section>");

  var form = document.getElementById("askForm"), input = document.getElementById("question");
  document.getElementById("chips").innerHTML = EXAMPLES.slice(0, 4).map(function (q) { return '<button type="button" class="chip" data-q="' + attr(q) + '">' + esc(q) + "</button>"; }).join("");
  function resize() { input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 180) + "px"; }
  input.addEventListener("input", resize);
  input.addEventListener("keydown", function (ev) { if (ev.key === "Enter" && !ev.shiftKey && !ev.isComposing) { ev.preventDefault(); form.requestSubmit(); } });
  form.addEventListener("submit", function (ev) { ev.preventDefault(); var q = input.value; if (!q.trim() || busy) return; input.value = ""; resize(); ask(q); });
  document.getElementById("chips").addEventListener("click", function (ev) { var c = ev.target.closest("[data-q]"); if (c) ask(c.getAttribute("data-q")); });
  window.addEventListener("popstate", function () { var s = new URLSearchParams(location.search).get("session"); if (s) openSession(Number(s)); else App.onNewChat(); });

  document.getElementById("msgs").addEventListener("click", async function (ev) {
    var el = ev.target.closest("[data-action]");
    if (!el) return;
    var m = find(Number(el.getAttribute("data-id")));
    if (!m) return;
    var a = el.getAttribute("data-action");
    if (a === "copy") { App.copy(m.sql); m.copied = true; paint(m); setTimeout(function () { m.copied = false; paint(m); }, 1500); }
    else if (a === "edit") { m.editing = true; m.draft = m.sql; paint(m); }
    else if (a === "cancel") { m.editing = false; paint(m); }
    else if (a === "run") runEdited(m);
    else if (a === "load") loadResults(m, el);
    else if (a === "more") { m.shown += perPage(); paint(m); }
    else if (a === "view") { m.view = el.getAttribute("data-view"); paint(m); }
    else if (a === "sort") {
      var col = Number(el.getAttribute("data-col"));
      m.sort = m.sort && m.sort.col === col ? (m.sort.dir === "asc" ? { col: col, dir: "desc" } : null) : { col: col, dir: "asc" };
      paint(m);
    } else if (a === "csv") {
      if (!usage().can_export_csv) { App.toast("CSV export is part of the Pro plan.", "warn"); return; }
      if (m.responseId && !m.edited) location.href = "/api/chat/export/" + m.responseId + ".csv";
      else App.toast("Save the original answer or ask again to export it. Edited queries can't be exported.", "warn");
    } else if (a === "rate") {
      var v = Number(el.getAttribute("data-v"));
      if (v === -1) {
        App.modal({ title: "What went wrong?", html: '<div class="fld"><label for="fbReason">Reason</label><select id="fbReason"><option value="">Choose one (optional)</option><option value="wrong_result">Wrong result</option><option value="wrong_sql">Wrong SQL</option><option value="slow">Too slow</option><option value="confusing">Confusing</option><option value="other">Something else</option></select></div><div class="fld mt"><label for="fbComment">Comment (optional)</label><textarea id="fbComment" rows="3" maxlength="2000"></textarea></div>',
          foot: [{ label: "Cancel", cls: "plain", value: false }, { label: "Send feedback", value: true, onClick: function () {
            api("POST", "/api/chat/feedback", { response_id: m.responseId, rating: -1, reason: App.$("#fbReason").value || null, comment: App.$("#fbComment").value.trim() || null })
              .then(function () { m.rating = -1; paint(m); App.toast("Thanks, feedback saved."); }).catch(function (e) { App.toast(e.message, "error"); });
          } }] });
      } else App.run(el, async function () { await api("POST", "/api/chat/feedback", { response_id: m.responseId, rating: 1 }); m.rating = 1; paint(m); });
    } else if (a === "save") {
      await App.run(el, async function () { await api("POST", "/api/history/prompt/" + m.promptId + "/save", {}); m.saved = true; paint(m); App.toast("Saved to Saved queries."); });
    }
  });
  document.getElementById("msgs").addEventListener("keydown", function (ev) {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.matches('th[data-action="sort"]')) { ev.preventDefault(); ev.target.click(); }
  });

  // Show the schema for the currently selected database (never mix schemas between connections).
  async function loadSchema(id) {
    try {
      var s = await api("GET", "/api/schema?connection_id=" + encodeURIComponent(id));
      if (!s.tables.length) { document.getElementById("tablesBox").hidden = true; return; }
      document.getElementById("tablesBox").hidden = false;
      document.getElementById("tablesList").innerHTML = s.tables.map(function (tb) {
        return "<div><strong>" + esc(tb.name) + "</strong>: " + esc(tb.columns.map(function (c) { return c.name; }).join(", ")) + "</div>";
      }).join("");
    } catch (e) { document.getElementById("tablesBox").hidden = true; }
  }

  async function loadConnections() {
    var select = document.getElementById("connectionSelect");
    if (!select) return;
    try {
      var data = await api("GET", "/api/connections");
      connectionItems = data.items || [];
      select.innerHTML = '<option value="0">Original shop_db (legacy)</option>' + connectionItems.map(function (c) {
        return '<option value="' + attr(c.id) + '">' + esc(c.name) + ' (' + esc(c.dialect) + ')' + (c.is_default ? ' — default' : '') + '</option>';
      }).join("");
      var def = connectionItems.filter(function (c) { return c.is_default; })[0];
      connectionId = def ? Number(def.id) : 0;
      select.value = String(connectionId);
      select.addEventListener("change", function () {
        if (sessionId) { App.toast("Start a new chat to switch databases.", "warn"); select.value = String(connectionId); return; }
        connectionId = Number(select.value) || 0;
        loadSchema(connectionId);
      });
    } catch (e) { App.toast("Couldn't load database connections: " + e.message, "error"); }
  }
  await loadConnections();
  await loadSchema(connectionId);

  var params = new URLSearchParams(location.search);
  if (params.get("session")) await openSession(Number(params.get("session")));
  if (params.get("q")) { input.value = params.get("q").slice(0, 500); resize(); }
  input.focus();
}, { flush: true });
