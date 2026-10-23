"use strict";
App.start(function (out) {
  var esc = App.esc;
  var faq = [["How do I ask a question?", "Type it in the box at the bottom of the chat page and press Enter. Press Shift and Enter together for a new line. You can also pick one of the example questions."],
    ["Can I change the SQL?", "Yes. Choose Edit above the SQL, change it, then choose Run SQL. Only read-only SELECT queries can be run."],
    ["What do the thumbs up and down do?", "They tell us whether an answer was helpful. Your ratings help show where the assistant gets things wrong."],
    ["What happens when I reach my daily limit?", "You'll see a message with a link to the plans. Limits reset at midnight. You can also add a token pack, which is used after your daily tokens run out."],
    ["Where are my questions saved?", "In your History. Save a question to keep it in Saved queries. You can delete questions one by one, or clear everything."],
    ["Why can't I export to CSV?", "CSV export is part of the Pro plan."]];
  var keys = [["Enter", "Send your question"], ["Shift + Enter", "Start a new line"], ["Esc", "Close menus and popups"]];
  App.html(out, '<div class="page"><div class="prose"><h1 id="about">About ' + esc(App.meta.app_name) + '</h1><p class="lead">Ask questions about your data in plain English. Get the SQL, the results and a chart back.</p>' +
    "<p>The assistant writes a SQL query for each question, runs it on the database and shows you the query next to the answer, so you can check it instead of taking it on trust. Every question is saved to your history, and you can rate answers and keep your favourites.</p>" +
    "<p>The project also compares two ways of prompting a language model to write SQL: zero-shot (the question alone) and few-shot (the question plus worked examples). Administrators can run that experiment on the Evaluation page.</p>" +
    '<h2 id="how">How it works</h2><ol class="steps"><li><strong>You ask.</strong> Type a question in plain English, such as which customers spent the most.</li><li><strong>A model writes the SQL.</strong> It sees your question and the names of the tables and columns.</li>' +
    "<li><strong>The query runs.</strong> Only read-only queries are allowed, and they run with a read-only database account. Anything that would change or delete data is blocked.</li><li><strong>You see the answer.</strong> The SQL, a short explanation, a results table and a chart. Edit the SQL and run it again if it isn't quite right.</li></ol>" +
    '<h2 id="privacy">Privacy and data</h2><ul><li>Your account, questions, answers and settings are stored in the app\'s database. Passwords are stored as one-way hashes.</li><li>When you ask a question, its text is sent to the model that writes the SQL, together with the table and column names of the database.</li>' +
    "<li>We count the tokens each question uses so daily limits can be applied. Administrators can see usage totals, error rates and which plan each person is on.</li><li>AI-written SQL can be wrong. Check it before you rely on the results.</li><li>You can delete your account at any time in Settings. That removes your questions, saved queries and usage history.</li></ul>" +
    '<h2 id="help">Get help</h2><div class="faq">' + faq.map(function (f) { return "<details><summary>" + esc(f[0]) + "</summary><p>" + esc(f[1]) + "</p></details>"; }).join("") + "</div>" +
    '<h3 class="h3-sec">Keyboard shortcuts</h3>' + keys.map(function (k) { return '<div class="kbd-row"><span>' + esc(k[1]) + "</span><kbd>" + esc(k[0]) + "</kbd></div>"; }).join("") + "</div></div>");
  var target = location.hash && document.getElementById(location.hash.slice(1));
  if (target) setTimeout(function () { target.scrollIntoView(); }, 0);
});
