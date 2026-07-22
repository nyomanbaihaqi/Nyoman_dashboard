/* ──────────────────────────────────────────────────────────────
   Note detail — read as rendered markdown, edit as raw markdown.
   ?new=1 opens straight into edit mode for a blank note.
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
  var note;
  var noteId = WOS.param("id");
  var isNew = WOS.param("new") === "1";
  var state = { editing: isNew };

  var ICONS = ["🗒️", "💡", "📘", "📈", "📊", "🎥", "🤝", "💬", "📌", "🚀"];

  function render() {
    if (!note && !isNew) {
      page.innerHTML = '<div class="card">' + ui.empty(t("notes.notFound"), null, '<a class="btn btn--outline" href="notes.html">' + esc(t("action.back")) + "</a>", "layers") + "</div>";
      return;
    }

    page.innerHTML = state.editing ? editorMarkup() : readerMarkup();
    bindDynamic();
  }

  function readerMarkup() {
    var author = data.memberById.get(note.authorId);
    var project = data.projectById.get(note.projectId);
    var stats = fmt.readingStats(note.content);

    return (
      '<div style="display:flex;gap:24px;flex-wrap:wrap">' +
      '<div class="doc" style="flex:1;min-width:280px">' +
      '<div class="cluster text-label faint">' + esc(t("notes.saved")) +
      '<span class="unread-dot" style="background:var(--emerald-500)"></span></div>' +
      '<div style="font-size:34px;margin-top:8px">' + esc(note.icon) + "</div>" +
      '<h1 class="doc__title" style="margin-top:6px">' + esc(note.title) + "</h1>" +
      '<div class="doc__props">' +
      '<span><span class="doc__prop-label">' + esc(t("notes.created")) + '</span> <span class="doc__prop-value">' + esc(fmt.fullDate(note.createdAt)) + "</span></span>" +
      '<span><span class="doc__prop-label">' + esc(t("notes.lastEdited")) + '</span> <span class="doc__prop-value">' + esc(fmt.relative(note.updatedAt)) + "</span></span>" +
      (project ? '<span><span class="doc__prop-label">' + esc(t("notes.linkedProject")) + '</span> <span class="doc__prop-value">' + esc(project.name) + "</span></span>" : "") +
      "</div>" +
      '<div class="cluster" style="margin-top:12px">' + ui.tags(note.tags) + "</div>" +
      '<div class="prose" style="margin-top:14px">' + (note.content ? ui.markdown(note.content) : '<p class="muted">' + esc(t("state.empty")) + "</p>") + "</div>" +
      "</div>" +
      '<div class="stack" style="width:260px;flex:none">' + infoRail(author, stats, project) + "</div>" +
      "</div>" +
      actionBar()
    );
  }

  function infoRail(author, stats, project) {
    var rows = [
      [t("notes.createdBy"), author ? author.name : "—"],
      [t("notes.created"), fmt.fullDate(note.createdAt)],
      [t("notes.lastEdited"), fmt.relative(note.updatedAt)],
      [t("notes.wordCount"), stats.words],
      [t("notes.readingTime"), t("notes.minutes", { n: stats.minutes })],
      [t("notes.linkedProject"), project ? project.name : "—"],
    ];
    return (
      '<div class="card"><h2 class="card__title" style="font-size:13px">' + esc(t("notes.documentInfo")) + "</h2>" +
      rows
        .map(function (row) {
          return '<div class="spread" style="padding:8px 0;border-top:1px solid var(--border-subtle)"><span class="text-label muted">' +
            esc(row[0]) + '</span><span class="text-label fw-semibold strong">' + esc(String(row[1])) + "</span></div>";
        })
        .join("") +
      "</div>"
    );
  }

  function actionBar() {
    if (state.editing) return "";
    return (
      '<div class="action-bar" style="position:sticky;bottom:0">' +
      barBtn("edit", "file-pen", "action.edit") +
      barBtn("pin", "star", note.pinned ? "notes.unpin" : "notes.pin") +
      barBtn("archive", "shield-user", "notes.archive") +
      barBtn("duplicate", "boxes", "notes.duplicate") +
      barBtn("summarize", "bot", "search.action.askAi") +
      barBtn("delete", "trash", "action.delete") +
      "</div>"
    );
  }

  function barBtn(action, iconName, key) {
    return (
      '<button type="button" class="action-bar__btn" data-note-action="' + action + '">' +
      icon(iconName, 13, { color: "var(--antar-purple)" }) + esc(t(key)) + "</button>"
    );
  }

  function editorMarkup() {
    var n = note || { icon: "🗒️", title: "", content: "", tags: [], projectId: null };
    return (
      '<div class="doc">' +
      '<div class="cluster" style="gap:8px;flex-wrap:wrap">' +
      ICONS.map(function (i) {
        return '<button type="button" class="icon-btn' + (i === n.icon ? " is-active" : "") +
          '" data-pick-icon="' + i + '" style="font-size:16px' + (i === n.icon ? ";border-color:var(--antar-purple)" : "") + '">' + i + "</button>";
      }).join("") + "</div>" +
      '<input class="input" data-field="icon" value="' + esc(n.icon) + '" hidden>' +
      '<input class="input" data-field="title" placeholder="' + esc(t("notes.untitled")) + '" value="' + esc(n.title) +
      '" style="margin-top:12px;font-size:22px;font-weight:800;border:none;padding:4px 0;box-shadow:none">' +
      '<input class="input" data-field="tags" placeholder="' + esc(t("tasks.col.tags")) + '" value="' + esc((n.tags || []).join(", ")) +
      '" style="margin-top:10px">' +
      '<div style="margin-top:12px">' +
      '<textarea class="textarea" data-field="content" style="font-family:var(--font-mono);font-size:13px">' +
      esc(n.content) + "</textarea></div>" +
      '<p class="text-label muted" style="margin-top:8px">' + esc(t("editor.hint")) + "</p>" +
      '<div class="modal__actions" style="justify-content:flex-start">' +
      '<button type="button" class="btn btn--primary" data-save-note>' + esc(t("action.save")) + "</button>" +
      (isNew ? '<a class="btn btn--ghost" href="notes.html">' + esc(t("action.cancel")) + "</a>" : '<button type="button" class="btn btn--ghost" data-cancel-edit>' + esc(t("action.cancel")) + "</button>") +
      "</div></div>"
    );
  }

  function bindDynamic() {
    // The editor decorates a fresh textarea, so it is re-attached each time
    // render() swaps the markup rather than bound once like the delegated
    // handlers below.
    var content = WOS.$("[data-field='content']", page);
    if (content && WOS.editor) WOS.editor.attach(content);

    WOS.$$("[data-pick-icon]", page).forEach(function (btn) {
      btn.addEventListener("click", function () {
        WOS.$("[data-field='icon']", page).value = btn.dataset.pickIcon;
        WOS.$$("[data-pick-icon]", page).forEach(function (b) {
          b.classList.toggle("is-active", b === btn);
        });
      });
    });
  }

  function bind() {
    WOS.on(page, "click", "[data-note-action]", function (event, target) {
      var action = target.dataset.noteAction;
      if (action === "edit") {
        state.editing = true;
        render();
      } else if (action === "pin") {
        WOS.db.update("notes", note.id, { pinned: !note.pinned }).then(refresh);
      } else if (action === "archive") {
        WOS.db.update("notes", note.id, { archived: !note.archived }).then(function () {
          ui.toast(t("notes.archive"));
          return refresh();
        });
      } else if (action === "duplicate") {
        WOS.db
          .create("notes", Object.assign({}, note, {
            id: undefined,
            title: note.title + " (copy)",
            pinned: false,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }))
          .then(function (created) {
            window.location.href = "note.html?id=" + created.id;
          });
      } else if (action === "summarize") {
        ui.toast(t("mi.aiPending"));
      } else if (action === "delete") {
        WOS.db.remove("notes", note.id).then(function () {
          window.location.href = "notes.html";
        });
      }
    });

    // Ticking a box in the reader edits the markdown behind it. The optimistic
    // repaint keeps the click feeling instant; a failed save reloads the note
    // so the screen never shows a tick the spreadsheet doesn't have.
    WOS.on(page, "click", "[data-check-index]", function (event, target) {
      if (state.editing || !note) return;
      var next = ui.toggleCheckbox(note.content, Number(target.dataset.checkIndex));
      if (next === note.content) return;

      note.content = next;
      render();

      WOS.db
        .update("notes", note.id, { content: next, updatedAt: new Date().toISOString() })
        .catch(function (error) {
          console.error("[wos] saving the checklist failed", error);
          ui.toast(t("notes.saveFailed"), "error");
          return refresh();
        });
    });

    WOS.on(page, "click", "[data-cancel-edit]", function () {
      state.editing = false;
      render();
    });

    WOS.on(page, "click", "[data-save-note]", function () {
      var title = WOS.$("[data-field='title']", page).value.trim() || t("notes.untitled");
      var iconVal = WOS.$("[data-field='icon']", page).value || "🗒️";
      var tags = WOS.$("[data-field='tags']", page).value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
      var content = WOS.$("[data-field='content']", page).value;

      var patch = { title: title, icon: iconVal, tags: tags, content: content, updatedAt: new Date().toISOString() };

      var promise = note
        ? WOS.db.update("notes", note.id, patch)
        : WOS.db.create("notes", Object.assign({
            kind: "note", projectId: null, authorId: WOS.config.currentUserId,
            pinned: false, archived: false, createdAt: new Date().toISOString(),
          }, patch));

      promise.then(function (saved) {
        isNew = false;
        window.location.href = "note.html?id=" + saved.id;
      });
    });
  }

  function refresh() {
    return WOS.db.get("notes", note.id).then(function (found) {
      note = found;
      state.editing = false;
      render();
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  (isNew ? Promise.resolve(null) : WOS.db.get("notes", noteId))
    .then(function (found) {
      note = found;
      return WOS.shell.mount({
        active: "notes",
        crumbs: [{ label: t("notes.title"), href: "notes.html" }, { label: isNew ? t("action.createNote") : note ? note.title : t("notes.notFound") }],
      });
    })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(4, 90);
      return WOS.db.loadAll(["notes", "members", "projects"]);
    })
    .then(function (loaded) {
      data = loaded;
      data.memberById = WOS.indexById(loaded.members);
      data.projectById = WOS.indexById(loaded.projects);
      render();
      bind();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
