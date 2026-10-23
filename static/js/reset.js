"use strict";
App.start(function (out) {
  var esc = App.esc, token = new URLSearchParams(location.search).get("token") || "";
  if (!token) {
    App.html(out, '<div class="form-side center-screen"><div class="auth-card"><a class="brand brand-link" href="/login">' + esc(App.meta.app_name) + '</a><h1>Link not valid</h1><p class="sub">This reset link is invalid or has expired.</p><a class="btn" href="/forgot">Request a new link</a></div></div>');
    return;
  }
  App.html(out, '<div class="form-side center-screen"><div class="auth-card"><a class="brand brand-link" href="/login">' + esc(App.meta.app_name) + '</a><h1>Choose a new password</h1><p class="sub">Use at least 8 characters.</p><div class="banner" id="banner" hidden></div>' +
    '<form id="resetForm" novalidate>' + App.pwField("password", "New password", "new-password") + App.pwField("confirm", "Confirm new password", "new-password") + '<button type="submit" class="btn submit">Update password</button></form></div></div>');
  App.pwToggles(out);
  var form = App.$("#resetForm", out), banner = App.$("#banner", out);
  form.addEventListener("input", function (ev) { App.fieldErr(form, ev.target.name, ""); });
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var f = form.elements, errs = {};
    if (f.password.value.length < 8) errs.password = "Use at least 8 characters.";
    if (f.confirm.value !== f.password.value) errs.confirm = "The passwords don't match.";
    if (!App.showErrors(form, errs, ["password", "confirm"])) return;
    var btn = form.querySelector(".submit"); btn.disabled = true;
    App.api("POST", "/api/auth/reset", { token: token, new_password: f.password.value })
      .then(function () { location.href = "/login?reset=1"; })
      .catch(function (e) { App.banner(banner, "error", "Couldn't update your password", e.message); btn.disabled = false; });
  });
});
