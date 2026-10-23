"use strict";
App.start(function (out) {
  var esc = App.esc, api = App.api, EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  var params = new URLSearchParams(location.search);
  var next = params.get("next") || "";
  var dest = /^\/[A-Za-z0-9_\-/?=&.%]*$/.test(next) && next.indexOf("//") !== 0 && !/^\/(login|signup|forgot|reset)/.test(next) ? next : "/chat";
  var tab = location.pathname === "/signup" ? "signup" : "login";

  var intro = '<aside class="intro"><a class="brand" href="/about">' + esc(App.meta.app_name) + '</a><div><h2>Ask in plain English. Read the SQL.</h2><div class="demo">' +
    '<p class="demo-q">Which customers spent the most this year?</p><pre class="demo-sql">' +
    '<span class="k">SELECT</span> c.name, <span class="k">SUM</span>(o.amount) <span class="k">AS</span> total_spent\n<span class="k">FROM</span> customers c\n<span class="k">JOIN</span> orders o <span class="k">ON</span> o.customer_id = c.id\n' +
    '<span class="k">WHERE</span> o.status = <span class="s">\'paid\'</span>\n<span class="k">GROUP BY</span> c.name\n<span class="k">ORDER BY</span> total_spent <span class="k">DESC</span>\n<span class="k">LIMIT</span> <span class="n">5</span>;</pre></div></div>' +
    '<div class="foot">Every answer shows the query behind it, so you can check it.</div></aside>';

  App.html(out, '<div class="authx">' + intro + '<section class="form-side"><div class="auth-card"><div class="banner" id="banner" hidden></div>' +
    '<div class="tabs" role="tablist"><button type="button" role="tab" class="tab" data-tab="login">' + esc(App.t("logIn")) + '</button><button type="button" role="tab" class="tab" data-tab="signup">' + esc(App.t("signUp")) + "</button></div>" +
    '<div id="authBody"></div><div class="auth-links"><a href="/pricing">' + esc(App.t("pricing")) + '</a><a href="/about">' + esc(App.t("aboutHelp")) + '</a><button type="button" class="link" data-open="language">' + esc(App.langName()) + "</button></div></div></section></div>");
  var banner = App.$("#banner", out);
  if (params.get("reset")) App.banner(banner, "ok", "Password updated", "Log in with your new password.");
  if (params.get("deleted")) App.banner(banner, "ok", "Account deleted", "Your account and data have been removed.");

  function show(which, push) {
    tab = which;
    if (push) history.pushState(null, "", which === "signup" ? "/signup" : "/login" + (next ? "?next=" + encodeURIComponent(next) : ""));
    document.title = (which === "signup" ? "Sign up" : "Log in") + " · " + App.meta.app_name;
    App.banner(banner);
    App.$$(".tab", out).forEach(function (b) { var on = b.getAttribute("data-tab") === which; b.classList.toggle("on", on); b.setAttribute("aria-selected", on ? "true" : "false"); });
    var body = App.$("#authBody", out);
    if (which === "login") {
      App.html(body, '<h1>Welcome back</h1><p class="sub">Log in to ask questions about your data.</p><form id="loginForm" novalidate>' +
        App.field("username", "Email or username", "text", "username", " autofocus") + App.pwField("password", "Password", "current-password") +
        '<div class="auth-links links-tight"><span></span><a href="/forgot">Forgot your password?</a></div><button type="submit" class="btn submit">' + esc(App.t("logIn")) + "</button></form>");
      bindLogin(App.$("#loginForm", out));
    } else {
      App.html(body, '<h1>Create your account</h1><p class="sub">It takes less than a minute.</p><form id="signupForm" novalidate>' +
        App.field("username", "Username", "text", "username", " autofocus") + '<p class="hint hint-up">3 to 30 letters, numbers or underscores.</p>' +
        App.field("email", "Email", "email", "email", ' inputmode="email"') + App.pwField("password", "Password", "new-password", "At least 8 characters.") + App.pwField("confirm", "Confirm password", "new-password") +
        '<div><label class="check"><input type="checkbox" name="consent" id="f-consent" aria-describedby="e-consent"><span>I agree to the <a href="/about#privacy" target="_blank" rel="noopener">privacy note</a> and understand that my questions are stored and processed to generate SQL.</span></label>' +
        '<p class="field-error" id="e-consent" data-err="consent"></p></div><button type="submit" class="btn submit">Create account</button></form>');
      bindSignup(App.$("#signupForm", out));
    }
    App.pwToggles(out);
  }

  function bindLogin(form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault(); App.banner(banner);
      var u = form.elements.username.value.trim(), pw = form.elements.password.value, errs = {};
      if (!u) errs.username = "Enter your email or username.";
      if (!pw) errs.password = "Enter your password.";
      if (!App.showErrors(form, errs, ["username", "password"])) return;
      var btn = form.querySelector(".submit"); btn.disabled = true;
      api("POST", "/api/auth/login", { username: u, password: pw }).then(function () { location.href = dest; })
        .catch(function (e) { App.banner(banner, "error", "Couldn't log you in", e.message); btn.disabled = false; });
    });
    form.addEventListener("input", function (ev) { App.fieldErr(form, ev.target.name, ""); App.banner(banner); });
  }
  function bindSignup(form) {
    form.addEventListener("submit", function (ev) {
      ev.preventDefault(); App.banner(banner);
      var f = form.elements, errs = {};
      if (!/^[A-Za-z0-9_]{3,30}$/.test(f.username.value.trim())) errs.username = "Use 3 to 30 letters, numbers or underscores.";
      if (!EMAIL.test(f.email.value.trim())) errs.email = "Enter an email address like name@example.com.";
      if (f.password.value.length < 8) errs.password = "Use at least 8 characters.";
      if (f.confirm.value !== f.password.value) errs.confirm = "The passwords don't match.";
      if (!f.consent.checked) errs.consent = "Please accept to create an account.";
      if (!App.showErrors(form, errs, ["username", "email", "password", "confirm", "consent"])) return;
      var btn = form.querySelector(".submit"); btn.disabled = true;
      api("POST", "/api/auth/signup", { username: f.username.value.trim(), email: f.email.value.trim(), password: f.password.value, consent: true })
        .then(function () { location.href = "/chat"; })
        .catch(function (e) { App.banner(banner, "error", "Couldn't create your account", e.message); btn.disabled = false; });
    });
    form.addEventListener("input", function (ev) { App.fieldErr(form, ev.target.name, ""); });
  }
  App.$$(".tab", out).forEach(function (b) { b.addEventListener("click", function () { show(b.getAttribute("data-tab"), true); }); });
  window.addEventListener("popstate", function () { show(location.pathname === "/signup" ? "signup" : "login", false); });
  show(tab, false);
});
