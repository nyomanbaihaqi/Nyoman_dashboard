/* ──────────────────────────────────────────────────────────────
   Issues & Risks — a derived dashboard, not its own collection:
   at-risk projects, overdue tasks, and failing automations, pulled
   live from the projects/tasks/workflows collections.
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

  function section(titleKey, iconName, rows) {
    if (!rows.length) return "";
    return (
      '<h2 class="section-title" style="margin-top:22px">' + esc(t(titleKey)) + " (" + rows.length + ")</h2>" +
      '<div class="card card--flush"><div class="stack stack--sm" style="padding:6px 20px">' +
      rows.join("") +
      "</div></div>"
    );
  }

  function render() {
    var atRiskProjects = data.projects.filter(function (p) {
      return p.status === "at_risk";
    });
    var overdueTasks = data.tasks.filter(function (task) {
      return task.dueAt && fmt.isPast(task.dueAt) && task.status !== "done";
    });
    // Blocked work is a risk the team reported out loud, so it belongs here
    // alongside the two the app infers. It replaces the failing-automations
    // section, which watched a scheduler that never existed.
    var blockedTasks = data.tasks.filter(function (task) {
      return task.status !== "done" && task.blocker;
    });

    var atRiskHtml = atRiskProjects.map(function (p) {
      return (
        '<a class="row" href="project.html?id=' + esc(p.id) + '">' + ui.iconTile(p.icon, p.iconBg, p.iconColor, "sm") +
        '<span class="grow"><span class="row__title" style="display:block">' + esc(p.name) + "</span>" +
        '<span class="row__meta" style="display:block">' + p.progress + "% · " + esc(t("projects.due", { date: fmt.dayMonth(p.dueAt) })) + "</span></span>" +
        icon("chevron-right", 13, { color: "var(--slate-400)" }) + "</a>"
      );
    });

    var overdueHtml = overdueTasks.map(function (task) {
      var assignee = data.memberById.get(task.assigneeId);
      return (
        '<a class="row" href="tasks.html">' + ui.avatar(assignee, 26) +
        '<span class="grow"><span class="row__title" style="display:block">' + esc(task.title) + "</span>" +
        '<span class="row__meta" style="display:block;color:var(--rose-500)">' + esc(t("home.overdue")) + " · " + esc(fmt.due(task.dueAt)) + "</span></span>" +
        ui.priorityBadge(task.priority) + "</a>"
      );
    });

    var blockedHtml = blockedTasks.map(function (task) {
      var assignee = data.memberById.get(task.assigneeId);
      var division = data.divisionById.get(task.divisionId);
      return (
        '<a class="row" href="weekly.html" style="align-items:flex-start">' + ui.avatar(assignee, 26) +
        '<span class="grow"><span class="row__title" style="display:block">' + esc(task.title) + "</span>" +
        '<span class="row__meta" style="display:block">' + esc(task.blocker) +
        (division ? " · " + esc(division.name) : "") + "</span></span>" +
        (task.escalated ? ui.badge(t("weekly.escalated"), "danger") : ui.priorityBadge(task.priority)) + "</a>"
      );
    });

    var body =
      section("issues.atRisk", "briefcase", atRiskHtml) +
      section("weekly.blocked", "crosshair", blockedHtml) +
      section("issues.overdue", "file-pen", overdueHtml);

    page.innerHTML =
      '<h1 class="page__title">' + esc(t("issues.title")) + "</h1>" +
      '<p class="page__subtitle">' + esc(t("issues.subtitle")) + "</p>" +
      (body || '<div class="card" style="margin-top:20px">' + ui.empty(t("issues.empty"), null, null, "crosshair") + "</div>");
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "issues", title: t("issues.title") })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(3, 100);
      return WOS.db.loadAll(["projects", "tasks", "members", "divisions"]);
    })
    .then(function (loaded) {
      data = loaded;
      data.memberById = WOS.indexById(loaded.members);
      data.divisionById = WOS.indexById(loaded.divisions);
      render();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
