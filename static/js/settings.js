"use strict";
App.start(function (out) {
  var esc = App.esc, api = App.api, u = App.user, s = App.me.settings;
  function opt(v, l, cur) { return '<option value="' + esc(v) + '"' + (String(v) === String(cur) ? " selected" : "") + ">" + esc(l) + "</option>"; }
  App.html(out, '<div class="page"><h1>Settings</h1><p class="lead">Your preferences and account.</p><div class="stack page-narrow">' +
    '<div class="card"><h2>Account</h2><div class="pref-row"><span class="muted">Username</span><strong>' + esc(u.username) + '</strong></div><div class="pref-row"><span class="muted">Email</span><strong>' + esc(u.email) + '</strong></div><div class="pref-row"><span class="muted">Plan</span><span class="pill' + (u.plan === "free" ? "" : " pro") + '">' + esc(App.cap(u.plan)) + "</span></div></div>" +
    '<div class="card"><h2>Preferences</h2>' +
      '<div class="pref-row"><label for="sChart">Default chart type</label><select id="sChart" class="w-field">' + App.CHART_OPTS.map(function (o) { return opt(o[0], o[1], s.default_chart_type); }).join("") + "</select></div>" +
      '<div class="pref-row"><label for="sTheme">Theme</label><select id="sTheme" class="w-field">' + opt("light", "Light", s.theme) + opt("dark", "Dark", s.theme) + "</select></div>" +
      '<div class="pref-row"><label for="sRows">Rows shown at a time</label><select id="sRows" class="w-field">' + [10, 25, 50, 100, 200].map(function (n) { return opt(n, n + " rows", s.rows_per_page); }).join("") + "</select></div>" +
      '<div class="pref-row"><label for="sLang">Language</label><select id="sLang" class="w-field">' + App.LANGS.map(function (l) { return opt(l.code, l.name, App.lang); }).join("") + "</select></div>" +
      '<p class="muted">Changes are saved as soon as you pick them. A chart shows only when the answer has a label column and a number column.</p></div>' +
    '<div class="card"><h2>Change password</h2><form class="form" id="pwForm" novalidate>' + App.pwField("current", "Current password", "current-password", "", "p") + App.pwField("next", "New password", "new-password", "At least 8 characters.", "p") + App.pwField("confirm", "Confirm new password", "new-password", "", "p") +
      '<div><button type="submit" class="btn">Update password</button></div></form></div>' +
    '<div class="card danger-zone"><h2>Delete account</h2><p>This permanently deletes your account, questions, saved queries and usage history. Payment records are kept in anonymised form for accounting. It can\'t be undone.</p><button type="button" class="btn danger" id="delAcct">Delete my account</button></div></div></div>');
  App.pwToggles(out);
  function save(patch, msg, el) { App.run(el, async function () { await App.saveSettings(patch); if (patch.theme) App.setTheme(patch.theme); App.toast(msg); }); }
  App.$("#sChart", out).addEventListener("change", function (e) { save({ default_chart_type: e.target.value }, "Default chart saved.", e.target); });
  App.$("#sTheme", out).addEventListener("change", function (e) { save({ theme: e.target.value }, "Theme saved.", e.target); });
  App.$("#sRows", out).addEventListener("change", function (e) { save({ rows_per_page: Number(e.target.value) }, "Saved.", e.target); });
  App.$("#sLang", out).addEventListener("change", function (e) { App.setLangCode(e.target.value); App.toast("Language saved."); location.reload(); });

  var wf = App.$("#pwForm", out);
  wf.addEventListener("input", function (ev) { App.fieldErr(wf, ev.target.name, ""); });
  wf.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var f = wf.elements, errs = {};
    if (!f.current.value) errs.current = "Enter your current password.";
    if (f.next.value.length < 8) errs.next = "Use at least 8 characters.";
    if (f.confirm.value !== f.next.value) errs.confirm = "The passwords don't match.";
    if (!App.showErrors(wf, errs, ["current", "next", "confirm"])) return;
    api("POST", "/api/auth/change-password", { old_password: f.current.value, new_password: f.next.value })
      .then(function () { wf.reset(); App.toast("Password updated."); })
      .catch(function (e) { App.fieldErr(wf, "current", e.message); });
  });
  App.$("#delAcct", out).addEventListener("click", function () {
    App.modal({ title: "Delete your account", html: '<p>This permanently deletes your account and everything in it. Enter your password to confirm.</p><div class="fld"><label for="delPw">Password</label><input id="delPw" type="password" autocomplete="current-password"></div><p class="err-text" id="delErr" role="alert"></p>',
      foot: [{ label: "Cancel", cls: "plain", value: false }, { label: "Delete account", cls: "danger-fill", value: true, onClick: function () {
        api("POST", "/api/auth/delete-account", { password: App.$("#delPw").value }).then(function () { location.href = "/login?deleted=1"; })
          .catch(function (e) { App.$("#delErr").textContent = e.message; });
        return false;
      } }] });
  });
});
