"use strict";
App.start(async function (out, ctx) {
  var esc = App.esc, attr = App.attr, api = App.api;
  var current = null, failuresOnly = false, detail = null;
  function tbl(head, rows, o) {
    o = o || {};
    if (!rows.length) return '<p class="muted">' + esc(o.empty || "Nothing here yet.") + "</p>";
    return '<div class="table-wrap tall"><table><thead><tr>' + head.map(function (h, i) { return '<th class="' + ((o.num || []).indexOf(i) >= 0 ? "num" : "") + '">' + esc(h) + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) { return "<tr>" + r.map(function (c, i) { return '<td class="' + ((o.num || []).indexOf(i) >= 0 ? "num" : "") + '">' + c + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  }
  function pct(x) { return x === null || x === undefined ? "–" : Number(x).toFixed(1) + "%"; }
  function peek(sql, label) { return '<details class="sql-peek"><summary>' + esc(label) + "</summary><pre>" + App.highlight(sql || "") + "</pre></details>"; }

  App.html(out, '<div class="page"><h1>Evaluation</h1><p class="lead">Compare zero-shot prompting (the question alone) with few-shot prompting (the question plus worked examples) on a fixed set of test questions. A question counts as correct when the generated SQL returns the same rows as the expected SQL.</p>' +
    (ctx.meta.demo_ai ? '<div class="banner info"><strong>Demo AI is active.</strong>The built-in rule-based demo ignores prompt examples, so zero-shot and few-shot score the same. Add GEMINI_API_KEY to the .env file for a meaningful comparison.</div>' : "") +
    '<div class="card mt"><h2>Run an experiment</h2><div class="toolbar toolbar-tight"><div class="fld field-inline"><label for="strategy">Strategy</label><select id="strategy"><option value="zero_shot">Zero-shot</option><option value="few_shot">Few-shot</option></select></div>' +
    '<div class="fld field-inline"><label for="k">Examples (few-shot)</label><input id="k" type="number" min="1" max="10" value="3" class="w-80"></div><button type="button" class="btn" id="runBtn">Run experiment</button><span id="runStatus" class="muted" role="status"></span></div>' +
    '<p class="muted mb0">Every test question is sent to the model, so a run uses tokens and takes a while.</p></div>' +
    '<div id="detail" hidden></div><h2 class="h2-sec">Run history</h2><div id="runs"></div><h2 class="h2-sec">Test questions</h2><p class="muted" id="qCount"></p><div id="questions"></div>' +
    '<div class="mt"><button type="button" class="btn plain" id="addQ">Add test question</button></div></div>');

  async function loadRuns() {
    var r = await api("GET", "/api/admin/eval/runs");
    var byStrat = {};
    r.items.forEach(function (x) { if (!byStrat[x.strategy]) byStrat[x.strategy] = x; });   // newest first -> latest per strategy
    var z = byStrat.zero_shot, f = byStrat.few_shot;
    var summary = (z || f) ? '<h2 class="h2-sec">Zero-shot vs few-shot</h2><p class="muted">From the most recent run of each strategy.</p>' + tbl(["", "Zero-shot", "Few-shot", "Change"],
      [["<strong>Overall accuracy</strong>", z ? pct(z.accuracy_pct) + ' <span class="muted">(' + z.correct + "/" + z.total + ")</span>" : "–", f ? pct(f.accuracy_pct) + ' <span class="muted">(' + f.correct + "/" + f.total + ")</span>" : "–",
        z && f ? (f.accuracy_pct - z.accuracy_pct >= 0 ? "+" : "") + (f.accuracy_pct - z.accuracy_pct).toFixed(1) + " pts" : "–"]], { num: [1, 2, 3] }) : "";
    App.html(App.$("#runs", out), summary + tbl(["Run", "Strategy", "Model", "Correct", "Accuracy", "When", ""], r.items.map(function (x) {
      return ["#" + x.id, esc(x.strategy.replace(/_/g, "-")), esc(x.model_name), x.correct + " / " + x.total, pct(x.accuracy_pct), esc(App.fmtDateTime(x.started_at)),
        '<button type="button" class="btn plain sm" data-run="' + x.id + '">' + (current === x.id ? "Showing" : "Details") + "</button>"];
    }), { num: [3, 4], empty: "No experiments yet. Choose a strategy above and run one." }));
    return r.items;
  }
  function drawDetail() {
    var box = App.$("#detail", out);
    if (!detail) { box.hidden = true; return; }
    var r = detail, run = r.run, rows = r.details.filter(function (d) { return !failuresOnly || !d.is_correct; });
    box.hidden = false;
    App.html(box, '<h2 class="h2-sec">Run #' + run.id + ": " + esc(run.strategy.replace(/_/g, "-")) + '</h2><div class="grid k4">' +
      '<div class="kpi"><div class="k-label">Accuracy</div><div class="k-value">' + pct(run.accuracy_pct) + '</div><div class="k-sub">' + run.correct + " of " + run.total + ' correct</div></div>' +
      '<div class="kpi"><div class="k-label">Model</div><div class="k-value k-model">' + esc(run.model_name) + "</div></div>" +
      '<div class="kpi"><div class="k-label">Failures</div><div class="k-value">' + (run.total - run.correct) + '</div><div class="k-sub">' + esc(r.failures.map(function (f) { return f.failure_type.replace(/_/g, " ") + ": " + f.n; }).join(" · ") || "none") + "</div></div></div>" +
      '<div class="card mt"><h2>Accuracy by difficulty</h2>' + App.chartBox("bar", r.by_difficulty.map(function (d) { return { label: d.difficulty, value: Number(d.accuracy_pct) }; }), { format: function (v) { return v.toFixed(0) + "%"; }, label: "Accuracy by difficulty" }) + "</div>" +
      '<h2 class="h2-sec">Question by question</h2><div class="toolbar"><label class="check"><input type="checkbox" id="evFail"' + (failuresOnly ? " checked" : "") + "><span>Show failures only</span></label></div>" +
      tbl(["Question", "Result", "Failure type"], rows.map(function (d) {
        return ['<div class="cell-wrap-inline">' + esc(d.question_text) + ' <span class="pill">' + esc(d.difficulty) + "</span></div>" + peek(d.expected_sql, "Expected SQL") + peek(d.generated_sql || "(none)", "Generated SQL"),
          d.is_correct ? '<span class="pill ok">Correct</span>' : '<span class="pill err">Wrong</span>', esc(d.failure_type ? d.failure_type.replace(/_/g, " ") : "–")];
      }), { empty: "No failures in this run." }));
  }
  async function showRun(id) {
    current = id;
    detail = await api("GET", "/api/admin/eval/runs/" + id);
    drawDetail(); loadRuns();
    App.$("#detail", out).scrollIntoView({ block: "start" });
  }
  async function loadQuestions() {
    var r = await api("GET", "/api/admin/eval/questions");
    App.$("#qCount", out).textContent = r.items.length + " test question" + (r.items.length === 1 ? "" : "s");
    App.html(App.$("#questions", out), tbl(["Question", "Expected SQL", "Category", "Difficulty", ""], r.items.map(function (q) {
      return [esc(q.question_text), '<code class="sqlc">' + esc(q.expected_sql) + "</code>", esc(q.category || ""), esc(q.difficulty), '<button type="button" class="btn plain sm danger" data-del="' + q.id + '">Delete</button>'];
    }), { empty: "No test questions yet." }));
  }

  App.$("#runBtn", out).addEventListener("click", function (ev) {
    var btn = ev.target, status = App.$("#runStatus", out);
    status.innerHTML = '<span class="spinner" aria-hidden="true"></span> Running every test question…';
    App.run(btn, async function () {
      try {
        var r = await api("POST", "/api/admin/eval/run", { strategy: App.$("#strategy", out).value, few_shot_k: Number(App.$("#k", out).value) });
        App.toast("Experiment finished."); await showRun(r.run_id);
      } finally { status.textContent = ""; }
    });
  });
  out.addEventListener("click", function (ev) {
    var run = ev.target.closest("[data-run]"), del = ev.target.closest("[data-del]");
    if (run) App.run(run, function () { return showRun(Number(run.getAttribute("data-run"))); });
    else if (del) App.confirm({ title: "Delete this test question?", message: "Past experiment results for it are deleted too.", confirm: "Delete", danger: true }).then(function (yes) {
      if (yes) App.run(del, async function () { await api("DELETE", "/api/admin/eval/questions/" + del.getAttribute("data-del")); App.toast("Deleted."); await loadQuestions(); });
    });
  });
  out.addEventListener("change", function (ev) { if (ev.target.id === "evFail") { failuresOnly = ev.target.checked; drawDetail(); } });
  App.$("#addQ", out).addEventListener("click", function () {
    App.modal({ title: "New test question", html: '<div class="fld"><label for="qQ">Question</label><input id="qQ" type="text" maxlength="1000"></div><div class="fld mt"><label for="qS">Correct SQL</label><textarea id="qS" class="mono" rows="4" maxlength="10000"></textarea><p class="hint">It must run successfully. Results are compared against this query\'s output.</p></div>' +
      '<div class="fld mt"><label for="qC">Category (optional)</label><input id="qC" type="text" maxlength="40" placeholder="e.g. join, aggregate"></div><div class="fld mt"><label for="qD">Difficulty</label><select id="qD"><option>easy</option><option>medium</option><option>hard</option></select></div><p class="err-text" id="qErr" role="alert"></p>',
      foot: [{ label: "Cancel", cls: "plain", value: false }, { label: "Add test question", value: true, onClick: function () {
        api("POST", "/api/admin/eval/questions", { question: App.$("#qQ").value.trim(), expected_sql: App.$("#qS").value, category: App.$("#qC").value.trim() || null, difficulty: App.$("#qD").value })
          .then(function () { App.closeModal(true); App.toast("Test question added."); loadQuestions(); }).catch(function (e) { App.$("#qErr").textContent = e.message; });
        return false;
      } }] });
  });
  await loadRuns(); await loadQuestions();
});
