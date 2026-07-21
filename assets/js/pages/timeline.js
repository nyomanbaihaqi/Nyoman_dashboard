/* ──────────────────────────────────────────────────────────────
   Timeline — per-project Gantt over the milestones collection.
   Project comes from ?project=<id>, same convention as Kanban.
   ────────────────────────────────────────────────────────────── */

(function (WOS) {
  "use strict";

  var esc = WOS.esc;
  var ui = WOS.ui;
  var fmt = WOS.fmt;
  var t = function () {
    return WOS.i18n.t.apply(null, arguments);
  };

  var page;
  var data;
  var state = { projectId: "" };

  var COLS = 8;
  var DAY = 86400000;

  function projectsWithMilestones() {
    var ids = {};
    data.milestones.forEach(function (m) {
      ids[m.projectId] = true;
    });
    return data.projects.filter(function (p) {
      return ids[p.id];
    });
  }

  function currentMilestones() {
    return data.milestones
      .filter(function (m) {
        return m.projectId === state.projectId;
      })
      .sort(WOS.by("startAt"));
  }

  function render() {
    var project = data.projectById.get(state.projectId);
    var rows = currentMilestones();
    var available = projectsWithMilestones();

    page.innerHTML =
      '<div style="flex:none;padding:16px 20px 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
      '<select class="select" style="max-width:240px" data-project-switch>' +
      available
        .map(function (p) {
          return '<option value="' + esc(p.id) + '"' + (p.id === state.projectId ? " selected" : "") + ">" + esc(p.name) + "</option>";
        })
        .join("") +
      "</select>" +
      '<span class="grow"></span>' +
      '<span class="text-sm muted">' + esc(t("timeline.zoom")) + "</span>" +
      '<span class="text-sm fw-bold" style="color:var(--antar-purple)">' + esc(t("timeline.weeks")) + "</span>" +
      "</div>" +
      '<div class="scroll-x" style="padding:16px 20px">' +
      (rows.length ? ganttMarkup(rows) : '<div class="card">' + ui.empty(t("milestones.empty"), null, null, "target") + "</div>") +
      "</div>" +
      (rows.length
        ? '<div class="legend" style="padding:0 20px 20px">' +
          '<div class="legend__item"><span class="legend__swatch" style="background:linear-gradient(to right,#34d399,#059669)"></span>' + esc(t("timeline.legend.onTrack")) + "</div>" +
          '<div class="legend__item"><span class="legend__swatch" style="background:linear-gradient(to right,#fbbf24,#d97706)"></span>' + esc(t("timeline.legend.atRisk")) + "</div>" +
          '<div class="legend__item"><span class="legend__swatch" style="transform:rotate(45deg);background:var(--antar-purple)"></span>' + esc(t("timeline.legend.milestone")) + "</div></div>"
        : "");
  }

  function ganttMarkup(rows) {
    var rangeStart = Math.min.apply(null, rows.map(function (m) { return new Date(m.startAt).getTime(); }));
    var rangeEnd = Math.max.apply(null, rows.map(function (m) { return new Date(m.endAt).getTime(); }));
    var totalDays = Math.max(1, Math.round((rangeEnd - rangeStart) / DAY));

    function colFor(ms) {
      var offsetDays = (ms - rangeStart) / DAY;
      var col = 2 + Math.floor((offsetDays / totalDays) * COLS);
      return Math.max(2, Math.min(2 + COLS, col));
    }

    var headCols = "";
    for (var i = 0; i < COLS; i++) {
      var colStart = new Date(rangeStart + (totalDays / COLS) * i * DAY);
      headCols += "<div>" + esc(fmt.dayMonth(colStart)) + "</div>";
    }

    var bodyRows = rows
      .map(function (m) {
        var owner = data.memberById.get(m.ownerId);
        var startCol = colFor(new Date(m.startAt).getTime());
        var endCol = Math.max(startCol + 1, colFor(new Date(m.endAt).getTime()));
        var track;
        if (m.isMilestone) {
          var mColor = m.status === "at_risk" ? "#e11d48" : "var(--antar-purple)";
          track = '<div class="gantt__milestone" style="background:' + mColor + '"></div>';
        } else {
          track = '<div class="gantt__bar"><div class="gantt__bar-fill" style="width:' + m.progress + "%;background:" +
            ui.PROGRESS_GRADIENT[m.status] + '"></div></div>';
        }
        return (
          '<div class="gantt__row">' +
          '<div class="gantt__label"><div class="gantt__name">' + esc(m.name) + '</div><div class="gantt__owner">' + esc(owner ? owner.name : "—") + "</div></div>" +
          '<div class="gantt__track" style="grid-column:' + startCol + " / " + endCol + '">' + track + "</div></div>"
        );
      })
      .join("");

    return '<div class="gantt"><div class="gantt__head"><div></div>' + headCols + "</div>" + bodyRows + "</div>";
  }

  function bind() {
    WOS.on(page, "change", "[data-project-switch]", function (event, target) {
      state.projectId = target.value;
      var url = new URL(window.location.href);
      url.searchParams.set("project", state.projectId);
      window.history.replaceState(null, "", url);
      render();
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "timeline", title: t("timeline.title"), fill: true })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(3, 200);
      return WOS.db.loadAll(["milestones", "projects", "members"]);
    })
    .then(function (loaded) {
      data = loaded;
      data.projectById = WOS.indexById(loaded.projects);
      data.memberById = WOS.indexById(loaded.members);

      var requested = WOS.param("project");
      var available = projectsWithMilestones();
      var hasRequested = available.some(function (p) {
        return p.id === requested;
      });
      state.projectId = hasRequested ? requested : available.length ? available[0].id : "";

      render();
      bind();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
