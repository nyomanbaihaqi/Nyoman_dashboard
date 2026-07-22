/* ──────────────────────────────────────────────────────────────
   Settings — Profile / Workspace / Preferences / Appearance /
   Notifications, sharing one subnav.
   ────────────────────────────────────────────────────────────── */

(function (WOS) {
  "use strict";

  var esc = WOS.esc;
  var icon = WOS.icon;
  var ui = WOS.ui;
  var t = function () {
    return WOS.i18n.t.apply(null, arguments);
  };

  var page;
  var data;
  var state = { tab: "profile" };

  var TABS = ["profile", "workspace", "preferences", "appearance"];
  /* ── Tabs ──────────────────────────────────────────────────── */

  function profileTab() {
    var user = data.currentUser;
    return (
      '<div class="card">' +
      '<div class="cluster cluster--nowrap">' +
      ui.avatar(user, 72) +
      '<span class="grow"><span style="font-size:18px;font-weight:800;color:var(--text-strong);display:block">' + esc(user.name) + "</span>" +
      '<span class="text-sm muted">' + esc(user.title) + "</span></span>" +
      '<button type="button" class="btn btn--outline btn--sm" data-change-photo>' + esc(t("action.changePhoto")) + "</button></div>" +
      '<form data-profile-form class="grid grid--sm-2" style="margin-top:22px">' +
      field(t("settings.fullName"), "name", user.name) +
      field(t("settings.email"), "email", user.email) +
      field(t("settings.role"), "title", user.title) +
      field(t("settings.timezone"), "timezone", user.timezone) +
      '<div class="modal__actions" style="grid-column:1/-1;justify-content:flex-start">' +
      '<button type="submit" class="btn btn--primary btn--sm">' + esc(t("action.save")) + "</button></div>" +
      "</form></div>"
    );
  }

  function field(label, name, value) {
    return (
      '<div class="field"><label class="field__label">' + esc(label) + '</label>' +
      '<input class="input" name="' + esc(name) + '" value="' + esc(value || "") + '"></div>'
    );
  }

  function workspaceTab() {
    return (
      '<div class="card">' +
      '<div class="field"><label class="field__label">' + esc(t("settings.workspaceName")) + '</label>' +
      '<input class="input" value="My Workspace" disabled></div>' +
      '<h2 class="section-title" style="margin-top:20px">' + esc(t("settings.members")) + " (" + data.members.length + ")</h2>" +
      data.members
        .map(function (m) {
          return (
            '<div class="row"><span class="grow" style="display:flex;align-items:center;gap:10px">' +
            ui.avatar(m, 30) + '<span><span class="text-sm fw-semibold strong" style="display:block">' + esc(m.name) + "</span>" +
            '<span class="text-label muted">' + esc(m.email) + "</span></span></span>" +
            '<span class="text-label muted">' + esc(WOS.titleCase(m.role)) + "</span></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function preferencesTab() {
    return (
      '<div class="card">' +
      '<h2 class="card__title">' + esc(t("settings.language")) + "</h2>" +
      '<p class="text-label muted" style="margin-top:4px">' + esc(t("settings.languageHint")) + "</p>" +
      '<div class="chips" style="margin-top:12px">' +
      WOS.i18n.available
        .map(function (loc) {
          return (
            '<button type="button" class="chip' + (WOS.i18n.locale() === loc.code ? " is-active" : "") +
            '" data-set-locale="' + loc.code + '">' + esc(loc.name) + "</button>"
          );
        })
        .join("") +
      "</div></div>" +
      '<div class="card" style="margin-top:20px">' +
      '<h2 class="card__title">' + esc(t("settings.dataBackend")) + "</h2>" +
      '<p class="text-sm" style="margin-top:10px;color:var(--text-body)">' +
      esc(WOS.config.backend === "api" ? t("settings.backend.api") : t("settings.backend.local")) + "</p>" +
      '<p class="text-label muted" style="margin-top:6px">' + esc(t("settings.backendHint")) + "</p>" +
      '<div style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-subtle)">' +
      '<button type="button" class="btn btn--outline btn--sm" data-seed-remote>' + esc(t("settings.seedSheets")) + "</button>" +
      '<p class="text-label muted" style="margin-top:8px">' + esc(t("settings.seedSheetsHint")) + "</p></div></div>" +
      '<div class="card" style="margin-top:20px">' +
      '<h2 class="card__title">' + esc(t("settings.resetData")) + "</h2>" +
      '<div style="margin-top:12px"><button type="button" class="btn btn--danger btn--sm" data-reset-data>' + esc(t("settings.resetData")) + "</button></div></div>"
    );
  }

  function appearanceTab() {
    var themes = [
      { id: "light", key: "settings.theme.light", preview: "#fff" },
      { id: "dark", key: "settings.theme.dark", preview: "#0f172a" },
      { id: "system", key: "settings.theme.system", preview: "linear-gradient(90deg,#fff 50%,#0f172a 50%)" },
    ];
    return (
      '<div class="card">' +
      '<h2 class="card__title">' + esc(t("settings.appearance")) + "</h2>" +
      '<p class="text-label muted" style="margin-top:4px">' + esc(t("settings.themeHint")) + "</p>" +
      '<div class="cluster" style="margin-top:14px">' +
      themes
        .map(function (theme, i) {
          return (
            '<button type="button" class="tap" data-theme-pick="' + theme.id + '" style="width:120px;border:none;background:none;text-align:center">' +
            '<span style="display:block;height:70px;border-radius:12px;border:2px solid ' + (i === 0 ? "var(--antar-purple)" : "var(--border-default)") +
            ";background:" + theme.preview + '"></span>' +
            '<span class="text-label fw-semibold strong" style="display:block;margin-top:8px">' + esc(t(theme.key)) + "</span></button>"
          );
        })
        .join("") +
      "</div></div>"
    );
  }

  /* ── Render ────────────────────────────────────────────────── */

  function render() {
    page.innerHTML =
      '<h1 class="page__title">' + esc(t("settings.title")) + "</h1>" +
      '<div class="grid" style="margin-top:20px;grid-template-columns:200px 1fr;max-width:960px;align-items:start">' +
      '<nav class="stack stack--sm" style="gap:2px">' +
      TABS.map(function (id) {
        return (
          '<button type="button" class="subnav__item' + (state.tab === id ? " is-active" : "") +
          '" style="text-align:left" data-settings-tab="' + id + '">' + esc(t("settings.nav." + id)) + "</button>"
        );
      }).join("") +
      "</nav>" +
      '<div class="stack" data-tab-body></div></div>';

    var body = WOS.$("[data-tab-body]", page);
    if (state.tab === "profile") body.innerHTML = profileTab();
    else if (state.tab === "workspace") body.innerHTML = workspaceTab();
    else if (state.tab === "preferences") body.innerHTML = preferencesTab();
    else body.innerHTML = appearanceTab();
  }

  function bind() {
    WOS.on(page, "click", "[data-settings-tab]", function (event, target) {
      state.tab = target.dataset.settingsTab;
      render();
    });

    WOS.on(page, "submit", "[data-profile-form]", function (event, form) {
      event.preventDefault();
      var formData = new FormData(form);
      WOS.db
        .update("members", data.currentUser.id, {
          name: formData.get("name") || data.currentUser.name,
          email: formData.get("email") || data.currentUser.email,
          title: formData.get("title") || data.currentUser.title,
          timezone: formData.get("timezone") || data.currentUser.timezone,
        })
        .then(function (saved) {
          data.currentUser = saved;
          ui.toast(t("settings.saved"));
          return WOS.shell.refreshCounts();
        })
        .then(render);
    });

    WOS.on(page, "click", "[data-change-photo]", function () {
      ui.toast(t("mi.aiPending"));
    });

    WOS.on(page, "click", "[data-set-locale]", function (event, target) {
      WOS.i18n.setLocale(target.dataset.setLocale);
    });

    WOS.on(page, "click", "[data-seed-remote]", function (event, target) {
      target.disabled = true;
      ui.toast(t("settings.seedSheetsRunning"));

      WOS.db
        .seedRemote()
        .then(function (result) {
          ui.toast(t(result.seeded ? "settings.seedSheetsDone" : "settings.seedSheetsSkipped"));
        })
        .catch(function (error) {
          console.error("[wos] seeding Sheets failed", error);
          // Show what actually came back. "Couldn't reach Google Sheets" is
          // wrong for the common case where the request arrived fine and Apps
          // Script rejected it — e.g. an editor still running an older Code.gs.
          var detail = error && error.message ? error.message : "";
          ui.toast(detail ? t("settings.seedSheetsFailed") + " (" + detail + ")" : t("settings.seedSheetsFailed"), "error");
        })
        .then(function () {
          target.disabled = false;
        });
    });

    WOS.on(page, "click", "[data-reset-data]", function () {
      if (!window.confirm(t("settings.resetConfirm"))) return;
      WOS.db.resetLocal();
      ui.toast(t("settings.resetDone"));
      window.location.reload();
    });

    WOS.on(page, "click", "[data-theme-pick]", function (event, target) {
      if (target.dataset.themePick !== "light") {
        ui.toast(t("settings.themeHint"));
      }
    });

  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "settings", title: t("settings.title") })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(3, 140);
      return WOS.db.loadAll(["members"]);
    })
    .then(function (loaded) {
      data = loaded;
      return WOS.db.currentUser();
    })
    .then(function (user) {
      data.currentUser = user;
      render();
      bind();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
