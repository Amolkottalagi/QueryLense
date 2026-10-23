"use strict";
App.start(function (out) {
  var esc = App.esc, EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  App.html(out, '<div class="form-side center-screen"><div class="auth-card"><a class="brand brand-link" href="/login">' + esc(App.meta.app_name) + "</a>" +
    '<h1>Reset your password</h1><p class="sub">Enter your email and we\'ll send you a link to choose a new password.</p><div class="banner" id="banner" hidden></div>' +
    '<form id="forgotForm" novalidate>' + App.field("email", "Email", "email", "email", ' inputmode="email" autofocus') + '<button type="submit" class="btn submit">Send reset link</button></form>' +
    '<div id="sent"></div><div class="auth-links"><a href="/login">Back to log in</a><span></span></div></div></div>');
  var form = App.$("#forgotForm", out), sent = App.$("#sent", out), banner = App.$("#banner", out);
  form.addEventListener("input", function (ev) { App.fieldErr(form, ev.target.name, ""); });
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    var email = form.elements.email.value.trim(), errs = {};
    if (!EMAIL.test(email)) errs.email = email ? "Enter an email address like name@example.com." : "Enter your email address.";
    if (!App.showErrors(form, errs, ["email"])) return;
    var btn = form.querySelector(".submit"); btn.disabled = true;
    App.api("POST", "/api/auth/forgot", { email: email }).then(function (r) {
      App.banner(banner, "ok", "Check your email", "If an account exists for " + email + ", a reset link has been sent. It works for 30 minutes.");
      sent.innerHTML = r.dev_reset_link ? '<p class="demo-note">Development mode: no email is sent. <a href="' + App.attr(r.dev_reset_link) + '">Open the reset link</a>.</p>' : "";
    }).catch(function (e) { App.banner(banner, "error", "Couldn't send the link", e.message); }).then(function () { btn.disabled = false; });
  });
});
