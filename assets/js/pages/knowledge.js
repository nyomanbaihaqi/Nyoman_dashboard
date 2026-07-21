/* ──────────────────────────────────────────────────────────────
   Knowledge — folders, recent files, templates. Files link back to
   their source note; folders and templates are browsing aids over
   the same notes collection.
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

  var TEMPLATES = [
    { key: "knowledge.template.meetingNotes", icon: "message-square" },
    { key: "knowledge.template.projectBrief", icon: "briefcase" },
    { key: "knowledge.template.weeklyReport", icon: "chart-line" },
    { key: "knowledge.template.sop", icon: "file-pen" },
  ];

  function render() {
    var recent = data.files.slice().sort(WOS.by("updatedAt", "desc")).slice(0, 8);

    page.innerHTML =
      '<div class="page__head">' +
      '<div><h1 class="page__title">' + esc(t("knowledge.title")) + "</h1>" +
      '<p class="page__subtitle">' + esc(t("knowledge.subtitle")) + "</p></div>" +
      '<button type="button" class="btn btn--primary btn--sm" data-new-document>' + icon("file-pen", 14, { color: "#fff" }) + esc(t("action.newDocument")) + "</button></div>" +
      '<h2 class="section-title" style="margin-top:22px">' + esc(t("knowledge.folders")) + "</h2>" +
      '<div class="grid grid--sm-2 grid--lg-4">' +
      data.folders
        .map(function (f) {
          var count = data.files.filter(function (file) {
            return file.folderId === f.id;
          }).length;
          return (
            '<div class="card card-lift" style="display:flex;align-items:center;gap:12px">' +
            ui.iconTile(f.icon, f.iconBg, f.iconColor) +
            '<span><span class="row__title" style="display:block">' + esc(f.name) + "</span>" +
            '<span class="row__meta" style="display:block">' + esc(t("knowledge.items", { n: count })) + "</span></span></div>"
          );
        })
        .join("") +
      "</div>" +
      '<div class="grid grid--lg-2" style="margin-top:22px">' +
      '<div class="card"><div class="spread"><h2 class="card__title">' + esc(t("knowledge.recentFiles")) + '</h2>' +
      '<a class="text-sm fw-semibold" href="notes.html">' + esc(t("action.viewAll")) + "</a></div>" +
      (recent.length
        ? recent
            .map(function (f) {
              return (
                '<a class="row" href="note.html?id=' + esc(f.noteId) + '">' + icon(f.icon, 16, { color: "var(--slate-400)" }) +
                '<span class="grow"><span class="row__title" style="display:block">' + esc(f.title) + "</span>" +
                '<span class="row__meta" style="display:block">' + esc(t("knowledge.updatedBy", { time: fmt.relative(f.updatedAt), name: memberName(f.updatedById) })) + "</span></span>" +
                (f.favorite ? icon("crown", 14, { color: "var(--amber-500)" }) : "") + "</a>"
              );
            })
            .join("")
        : '<p class="muted text-sm" style="padding:12px 0">' + esc(t("state.empty")) + "</p>") +
      "</div>" +
      '<div class="card"><h2 class="card__title">' + esc(t("knowledge.templates")) + "</h2>" +
      TEMPLATES
        .map(function (tpl) {
          return '<div class="row">' + icon(tpl.icon, 15, { color: "var(--antar-purple)" }) +
            '<span class="text-sm" style="color:var(--text-body)">' + esc(t(tpl.key)) + "</span></div>";
        })
        .join("") +
      "</div></div>";
  }

  function memberName(id) {
    var m = data.memberById.get(id);
    return m ? m.name : "—";
  }

  function bind() {
    WOS.on(page, "click", "[data-new-document]", function () {
      window.location.href = "note.html?new=1";
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "knowledge", title: t("knowledge.title") })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(4, 100);
      return WOS.db.loadAll(["folders", "files", "members"]);
    })
    .then(function (loaded) {
      data = loaded;
      data.memberById = WOS.indexById(loaded.members);
      render();
      bind();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
