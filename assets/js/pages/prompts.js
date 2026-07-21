/* ──────────────────────────────────────────────────────────────
   Prompt Library — reusable prompts for the AI features. A real
   CRUD collection (unlike Meeting Intelligence's demo flow), since
   saving and copying prompts needs no AI backend to be useful.
   ────────────────────────────────────────────────────────────── */

(function (WOS) {
  "use strict";

  var esc = WOS.esc;
  var icon = WOS.icon;
  var ui = WOS.ui;
  var fmt = WOS.fmt;
  var t = function () {
    return WOS.i18n.t.apply(null, arguments);
  };

  var page;
  var data;

  function render() {
    var list = data.prompts.slice().sort(WOS.by("createdAt", "desc"));

    page.innerHTML =
      '<div class="page__head">' +
      '<div><h1 class="page__title">' + esc(t("prompts.title")) + "</h1>" +
      '<p class="page__subtitle">' + esc(t("prompts.subtitle")) + "</p></div>" +
      '<button type="button" class="btn btn--primary btn--sm" data-new-prompt>' + icon("lightbulb", 14, { color: "#fff" }) + esc(t("action.createNew")) + "</button></div>" +
      (list.length
        ? '<div class="grid grid--md-2" style="margin-top:20px">' + list.map(card).join("") + "</div>"
        : '<div class="card" style="margin-top:20px">' + ui.empty(t("prompts.empty"), null, null, "lightbulb") + "</div>");
  }

  function card(p) {
    return (
      '<div class="card">' +
      '<div class="spread" style="align-items:flex-start">' +
      '<span class="row__title" style="font-size:14.5px">' + esc(p.title) + "</span>" +
      (p.category ? ui.tag(p.category) : "") + "</div>" +
      '<p class="text-sm" style="margin-top:8px;color:var(--text-body);line-height:1.6;white-space:pre-wrap">' + esc(p.body) + "</p>" +
      '<div class="cluster" style="margin-top:14px">' +
      '<button type="button" class="btn btn--tinted btn--sm" data-copy-prompt="' + esc(p.id) + '">' + icon("file-pen", 13) + esc(t("action.copy")) + "</button>" +
      '<button type="button" class="btn btn--outline btn--sm" data-edit-prompt="' + esc(p.id) + '">' + esc(t("action.edit")) + "</button>" +
      '<button type="button" class="btn btn--ghost btn--sm" data-delete-prompt="' + esc(p.id) + '">' + esc(t("action.delete")) + "</button>" +
      "</div></div>"
    );
  }

  function openPromptModal(prompt) {
    var isEdit = !!prompt;
    var body =
      '<form class="stack">' +
      '<div class="field"><label class="field__label">' + esc(t("prompts.title")) + '</label>' +
      '<input class="input" name="title" required value="' + esc(prompt ? prompt.title : "") + '"></div>' +
      '<div class="field"><label class="field__label">' + esc(t("projects.category")) + '</label>' +
      '<input class="input" name="category" value="' + esc(prompt ? prompt.category : "") + '"></div>' +
      '<div class="field"><label class="field__label">Prompt</label>' +
      '<textarea class="textarea" name="body" rows="6" required>' + esc(prompt ? prompt.body : "") + "</textarea></div>" +
      '<div class="modal__actions">' +
      '<button type="button" class="btn btn--ghost" data-close-modal>' + esc(t("action.cancel")) + "</button>" +
      '<button type="submit" class="btn btn--primary">' + esc(t("action.save")) + "</button></div></form>";

    ui.modal({
      title: isEdit ? t("action.edit") : t("prompts.title"),
      body: body,
      onSubmit: function (form) {
        var formData = new FormData(form);
        var title = String(formData.get("title") || "").trim();
        var promptBody = String(formData.get("body") || "").trim();
        if (!title || !promptBody) return;

        var patch = { title: title, category: formData.get("category") || "", body: promptBody };
        var promise = isEdit
          ? WOS.db.update("prompts", prompt.id, patch)
          : WOS.db.create("prompts", Object.assign({ createdAt: new Date().toISOString() }, patch));

        promise.then(function () {
          ui.closeModal();
          return refresh();
        });
      },
    });
  }

  function bind() {
    WOS.on(page, "click", "[data-new-prompt]", function () {
      openPromptModal(null);
    });

    WOS.on(page, "click", "[data-edit-prompt]", function (event, target) {
      var p = data.prompts.filter(function (row) {
        return row.id === target.dataset.editPrompt;
      })[0];
      if (p) openPromptModal(p);
    });

    WOS.on(page, "click", "[data-delete-prompt]", function (event, target) {
      WOS.db.remove("prompts", target.dataset.deletePrompt).then(refresh);
    });

    WOS.on(page, "click", "[data-copy-prompt]", function (event, target) {
      var p = data.prompts.filter(function (row) {
        return row.id === target.dataset.copyPrompt;
      })[0];
      if (!p) return;
      var done = function () {
        ui.toast(t("action.copy"));
      };
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(p.body).then(done, done);
      } else {
        done();
      }
    });
  }

  function refresh() {
    return WOS.db.list("prompts").then(function (rows) {
      data.prompts = rows;
      render();
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "prompts", title: t("prompts.title") })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(3, 100);
      return WOS.db.list("prompts");
    })
    .then(function (rows) {
      data = { prompts: rows };
      render();
      bind();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
