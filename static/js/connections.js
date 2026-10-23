"use strict";
App.start(async function (out) {
  var esc = App.esc, attr = App.attr, api = App.api;
  App.html(out, '<div class="page"><h1>Database connections</h1><p class="lead">Connect your own database and choose it when asking questions. Your database URL is encrypted before it is stored and is never shown again.</p><div class="stack page-narrow">' +
    '<div class="card"><h2>Add a database</h2><p class="muted">Use a dedicated read-only database account. Do not use an administrator/root account.</p><form id="connectionForm" class="form" novalidate>' +
    '<div class="fld"><label for="dbName">Connection name</label><input id="dbName" name="name" type="text" maxlength="80" required placeholder="Company reporting database"></div>' +
    '<div class="fld"><label for="dbUrl">SQLAlchemy database URL</label><input id="dbUrl" name="database_url" type="password" maxlength="4096" autocomplete="off" required placeholder="mysql+mysqlconnector://user:password@host:3306/database"><p class="help">The URL may contain credentials. It is sent only to this application over your current connection. SQLite files must be inside the server data/user_dbs folder.</p></div>' +
    '<div class="fld"><label><input id="dbDefault" type="checkbox"> Make this my default database</label></div>' +
    '<div class="connection-actions"><button class="btn plain" type="button" id="testConnection">Test connection</button><button class="btn" type="submit" id="saveConnection">Save connection</button></div><p id="connectionStatus" class="muted" role="status"></p></form></div>' +
    '<div class="card"><h2>Supported database URL examples</h2><div class="stack">' +
    '<div><strong>MySQL</strong><p class="muted">mysql+mysqlconnector://user:password@host:3306/database</p></div>' +
    '<div><strong>PostgreSQL</strong><p class="muted">postgresql+psycopg://user:password@host:5432/database</p></div>' +
    '<div><strong>SQLite</strong><p class="muted">sqlite:///reporting.db</p></div>' +
    '<div><strong>SQL Server</strong><p class="muted">mssql+pyodbc://user:password@host/database?driver=ODBC+Driver+18+for+SQL+Server</p></div>' +
    '<div><strong>Oracle</strong><p class="muted">oracle+oracledb://user:password@host:1521/?service_name=service</p></div>' +
    '</div><p class="muted">The dialect Python driver must be installed. Additional SQLAlchemy dialects can work when their driver is installed, but database-specific syntax and read-only behavior can vary.</p></div>' +
    '<div class="card"><h2>Your connections</h2><div id="connectionList" class="connection-cards"><p class="muted">Loading connections…</p></div></div></div></div>');

  var form = App.$("#connectionForm", out), nameEl = App.$("#dbName", out), urlEl = App.$("#dbUrl", out), status = App.$("#connectionStatus", out);
  async function refresh() {
    var data = await api("GET", "/api/connections"), items = data.items || [], box = App.$("#connectionList", out);
    if (!items.length) { box.innerHTML = '<p class="muted">No saved connections yet. The Chat page will continue to offer the original shop_db until you add a connection.</p>'; return; }
    box.innerHTML = items.map(function (c) {
      return '<div class="card flat connection-card"><div><strong>' + esc(c.name) + '</strong><p class="muted">' + esc(c.dialect) + ' · Added ' + esc(App.fmtDate(c.created_at)) + (c.is_default ? ' · <span class="pill pro">Default</span>' : '') + '</p></div><div class="connection-actions">' +
        (c.is_default ? '' : '<button class="btn plain sm" data-default="' + attr(c.id) + '">Make default</button>') +
        '<button class="btn danger sm" data-delete="' + attr(c.id) + '">Delete</button></div></div>';
    }).join("");
  }
  App.$("#testConnection", out).addEventListener("click", async function (ev) {
    var btn = ev.currentTarget;
    if (!urlEl.value.trim()) { App.toast("Enter a database URL first.", "warn"); return; }
    await App.run(btn, async function () {
      status.textContent = "Testing connection…";
      var result = await api("POST", "/api/connections/test", { database_url: urlEl.value.trim() });
      status.textContent = result.message + " Database type: " + result.dialect + ".";
      App.toast("Database connection successful.");
    });
  });
  form.addEventListener("submit", async function (ev) {
    ev.preventDefault();
    if (!nameEl.value.trim() || !urlEl.value.trim()) { App.toast("Enter a name and database URL.", "warn"); return; }
    await App.run(App.$("#saveConnection", out), async function () {
      var result = await api("POST", "/api/connections", { name: nameEl.value.trim(), database_url: urlEl.value.trim(), is_default: App.$("#dbDefault", out).checked });
      urlEl.value = ""; nameEl.value = ""; App.$("#dbDefault", out).checked = false;
      status.textContent = "Saved " + result.name + ".";
      App.toast("Database connection saved."); await refresh();
    });
  });
  App.$("#connectionList", out).addEventListener("click", async function (ev) {
    var make = ev.target.closest("[data-default]"), del = ev.target.closest("[data-delete]");
    if (make) await App.run(make, async function () { await api("POST", "/api/connections/" + make.getAttribute("data-default") + "/default", {}); await refresh(); App.toast("Default database updated."); });
    if (del) {
      var id = del.getAttribute("data-delete");
      App.modal({ title: "Delete database connection?", html: '<p>This removes the saved credentials. Past chat history remains, but rerunning queries tied to this connection will no longer work.</p>', foot: [
        { label: "Cancel", cls: "plain", value: false },
        { label: "Delete connection", cls: "danger-fill", value: true, onClick: function () { api("DELETE", "/api/connections/" + id).then(async function () { await refresh(); App.toast("Connection deleted."); }).catch(function (e) { App.toast(e.message, "error"); }); } }
      ] });
    }
  });
  try { await refresh(); } catch (e) { App.toast(e.message, "error"); }
});
