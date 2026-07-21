/* ──────────────────────────────────────────────────────────────
   Milestones — every milestone across every project, grouped by
   project and sorted by start date. Timeline shows one project's
   Gantt at a time; this is the flat cross-project view.
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
    if (!data.milestones.length) {
      page.innerHTML = '<h1 class="page__title">' + esc(t("milestones.title")) + "</h1>" +
        '<div class="card" style="margin-top:18px">' + ui.empty(t("milestones.empty"), null, null, "target") + "</div>";
      return;
    }

    var groups = WOS.groupBy(data.milestones, function (m) {
      return m.projectId;
    });

    page.innerHTML =
      '<h1 class="page__title">' + esc(t("milestones.title")) + "</h1>" +
      Array.from(groups.keys())
        .map(function (projectId) {
          var project = data.projectById.get(projectId);
          var list = groups.get(projectId).slice().sort(WOS.by("startAt"));
          return (
            '<div class="spread" style="margin-top:22px">' +
            '<h2 class="section-title" style="margin:0">' + esc(project ? project.name : "—") + "</h2>" +
            '<a class="text-sm fw-semibold" href="timeline.html?project=' + esc(projectId) + '">' + esc(t("nav.timeline")) + "</a></div>" +
            '<div class="card" style="margin-top:10px">' +
            list
              .map(function (m) {
                var owner = data.memberById.get(m.ownerId);
                return (
                  '<div class="row" style="align-items:flex-start">' +
                  (m.isMilestone ? icon("target", 16, { color: "var(--antar-purple)" }) : ui.avatar(owner, 26)) +
                  '<span class="grow"><span class="row__title" style="display:block">' + esc(m.name) + "</span>" +
                  '<span class="row__meta" style="display:block">' + esc(fmt.dayMonth(m.startAt)) + " – " + esc(fmt.dayMonth(m.endAt)) +
                  " · " + esc(owner ? owner.name : "—") + "</span>" +
                  '<span style="display:block;margin-top:6px;max-width:280px">' + ui.progress(m.progress, ui.PROGRESS_GRADIENT[m.status]) + "</span></span>" +
                  '<span class="text-xs fw-bold" style="color:' + (m.status === "at_risk" ? "var(--rose-500)" : "var(--emerald-600)") + '">' + m.progress + "%</span></div>"
                );
              })
              .join("") +
            "</div>"
          );
        })
        .join("");
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "milestones", title: t("milestones.title") })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(3, 120);
      return WOS.db.loadAll(["milestones", "projects", "members"]);
    })
    .then(function (loaded) {
      data = loaded;
      data.projectById = WOS.indexById(loaded.projects);
      data.memberById = WOS.indexById(loaded.members);
      render();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
