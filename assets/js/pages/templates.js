/* ──────────────────────────────────────────────────────────────
   Templates — the standard messages this role sends over and over.

   Replaces the old Prompt Library, which stored prompts for an AI
   that isn't wired up. The repeated writing here is real and
   happens weekly: meeting invitations and the MoM skeleton.
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
  var state = { openId: "" };

  function render() {
    var list = data.templates;

    page.innerHTML =
      '<div class="page__head">' +
      '<div><h1 class="page__title">' + esc(t("templates.title")) + "</h1>" +
      '<p class="page__subtitle">' + esc(t("templates.subtitle")) + "</p></div>" +
      '<button type="button" class="btn btn--primary btn--sm" data-new-template>' +
      icon("plus", 14, { color: "#fff" }) + esc(t("action.createNew")) + "</button></div>" +
      (list.length
        ? '<div class="stack" style="margin-top:20px">' + list.map(card).join("") + "</div>"
        : '<div class="card" style="margin-top:20px">' + ui.empty(t("templates.empty"), null, null, "lightbulb") + "</div>");
  }

  function card(tpl) {
    var open = state.openId === tpl.id;
    return (
      '<div class="card">' +
      '<div class="spread" style="align-items:flex-start;gap:12px;flex-wrap:wrap">' +
      '<span style="min-width:0"><span class="row__title" style="display:block;font-size:15px">' + esc(tpl.name) + "</span>" +
      '<span class="row__meta" style="display:block;margin-top:2px">' + esc(tpl.subject) + "</span></span>" +
      '<span class="cluster">' + ui.badge(t("templates.kind." + tpl.kind), tpl.kind === "mom" ? "info" : "brand") +
      '<button type="button" class="btn btn--tinted btn--sm" data-copy-template="' + esc(tpl.id) + '">' +
      icon("message-square", 13) + esc(t("templates.copy")) + "</button>" +
      '<button type="button" class="btn btn--outline btn--sm" data-toggle-template="' + esc(tpl.id) + '">' +
      esc(open ? t("action.close") : t("action.open")) + "</button></span></div>" +
      (open
        ? '<pre style="margin-top:14px;white-space:pre-wrap;word-break:break-word;font-family:var(--font-mono);' +
          'font-size:12.5px;line-height:1.7;color:var(--text-body);background:var(--slate-50);' +
          'border:1px solid var(--border-subtle);border-radius:10px;padding:16px">' + esc(tpl.body) + "</pre>"
        : "") +
      "</div>"
    );
  }

  /** Subject and body together — what actually gets pasted into a message. */
  function fullText(tpl) {
    return tpl.subject ? tpl.subject + "\n\n" + tpl.body : tpl.body;
  }

  function bind() {
    WOS.on(page, "click", "[data-toggle-template]", function (event, target) {
      var id = target.dataset.toggleTemplate;
      state.openId = state.openId === id ? "" : id;
      render();
    });

    WOS.on(page, "click", "[data-copy-template]", function (event, target) {
      var tpl = data.templates.filter(function (row) {
        return row.id === target.dataset.copyTemplate;
      })[0];
      if (tpl) ui.copyText(fullText(tpl), "templates.copied");
    });

    WOS.on(page, "click", "[data-new-template]", function () {
      var body =
        '<form class="stack">' +
        '<div class="field"><label class="field__label">' + esc(t("templates.title")) + '</label>' +
        '<input class="input" name="name" required></div>' +
        '<div class="field"><label class="field__label">' + esc(t("templates.subject")) + '</label>' +
        '<input class="input" name="subject"></div>' +
        '<div class="field"><label class="field__label">' + esc(t("templates.body")) + '</label>' +
        '<textarea class="textarea" name="body" rows="8" required></textarea></div>' +
        '<div class="modal__actions">' +
        '<button type="button" class="btn btn--ghost" data-close-modal>' + esc(t("action.cancel")) + "</button>" +
        '<button type="submit" class="btn btn--primary">' + esc(t("action.save")) + "</button></div></form>";

      ui.modal({
        title: t("action.createNew"),
        body: body,
        onSubmit: function (form) {
          var formData = new FormData(form);
          var name = String(formData.get("name") || "").trim();
          var text = String(formData.get("body") || "").trim();
          if (!name || !text) return;

          WOS.db
            .create("templates", {
              name: name,
              kind: "invite",
              subject: formData.get("subject") || "",
              body: text,
            })
            .then(function () {
              ui.closeModal();
              return WOS.db.list("templates");
            })
            .then(function (rows) {
              data.templates = rows;
              render();
            });
        },
      });
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "templates", title: t("templates.title") })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(3, 100);
      return WOS.db.list("templates");
    })
    .then(function (rows) {
      data = { templates: rows };
      render();
      bind();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
