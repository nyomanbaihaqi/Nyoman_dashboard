/* ──────────────────────────────────────────────────────────────
   Weekly Review — the PM's weekly ritual, in the order the
   handbook runs it:

     1. progress per division      (weekly division review)
     2. decisions the CEO owes     (approval needed CEO)
     3. what stopped moving        (cek task yang tidak bergerak)

   Ends in a copyable execution report, because the output of this
   ritual is a message someone sends, not a screen someone reads.
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

  /** A task nobody has touched in a week has quietly stalled. */
  var STUCK_DAYS = 7;

  function isStuck(task) {
    if (task.status === "done") return false;
    if (!task.updatedAt) return false;
    // dayDelta counts forward, so the older date goes first — the other way
    // round returns a negative and nothing ever reads as stalled.
    return fmt.dayDelta(new Date(task.updatedAt), new Date()) >= STUCK_DAYS;
  }

  function isOverdue(task) {
    return task.status !== "done" && task.dueAt && fmt.isPast(task.dueAt);
  }

  function doneThisWeek(task) {
    return task.status === "done" && task.updatedAt && fmt.isThisWeek(task.updatedAt);
  }

  function divisionName(id) {
    var d = data.divisionById.get(id);
    return d ? d.name : t("division.none");
  }

  function memberName(id) {
    var m = data.memberById.get(id);
    return m ? m.name : "—";
  }

  /* ── Per-division rollup ───────────────────────────────────── */

  function divisionRows() {
    // "" is a real bucket, not a missing value: work that belongs to nobody's
    // division is exactly what tends to go unowned, so it gets a row too.
    var ids = data.divisions.map(function (d) {
      return d.id;
    });
    var hasOrphans = data.tasks.some(function (task) {
      return !task.divisionId;
    });
    if (hasOrphans) ids.push("");

    return ids
      .map(function (id) {
        var tasks = data.tasks.filter(function (task) {
          return (task.divisionId || "") === id;
        });
        var open = tasks.filter(function (task) {
          return task.status !== "done";
        });
        return {
          id: id,
          name: divisionName(id),
          lead: data.divisionById.get(id) ? memberName(data.divisionById.get(id).leadId) : "—",
          open: open.length,
          done: tasks.filter(doneThisWeek).length,
          overdue: tasks.filter(isOverdue).length,
          stuck: tasks.filter(isStuck).length,
          blocked: open.filter(function (task) {
            return task.blocker;
          }),
          escalated: open.filter(function (task) {
            return task.escalated;
          }),
        };
      })
      .filter(function (row) {
        return row.open || row.done;
      });
  }

  function divisionCard(row) {
    // Name the worst thing that is actually true, in order of how loudly it
    // needs answering. Collapsing these into one "danger" label would tell the
    // reader something is wrong while pointing at the wrong thing.
    var health = "success";
    var healthLabel = t("projects.healthy");
    if (row.escalated.length) {
      health = "danger";
      healthLabel = t("weekly.escalated");
    } else if (row.overdue) {
      health = "danger";
      healthLabel = t("weekly.overdue");
    } else if (row.blocked.length) {
      health = "warning";
      healthLabel = t("weekly.blocked");
    } else if (row.stuck) {
      health = "warning";
      healthLabel = t("weekly.stuck");
    }

    return (
      '<div class="card">' +
      '<div class="spread" style="align-items:flex-start;gap:10px">' +
      '<span><span class="row__title" style="display:block;font-size:15px">' + esc(row.name) + "</span>" +
      '<span class="row__meta" style="display:block">' + esc(t("division.lead", { name: row.lead })) + "</span></span>" +
      ui.badge(healthLabel, health) + "</div>" +
      '<div class="cluster" style="gap:20px;margin-top:14px;flex-wrap:wrap">' +
      metric(row.open, t("status.in_progress")) +
      metric(row.done, t("weekly.done")) +
      metric(row.overdue, t("weekly.overdue"), row.overdue ? "var(--rose-500)" : null) +
      metric(row.stuck, t("weekly.stuck"), row.stuck ? "var(--amber-600)" : null) +
      "</div>" +
      (row.blocked.length
        ? '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-subtle)">' +
          '<p class="eyebrow">' + esc(t("weekly.blocked")) + "</p>" +
          row.blocked
            .map(function (task) {
              return (
                '<div class="row" style="align-items:flex-start;padding:8px 0">' +
                icon("crosshair", 13, { color: "#e11d48" }) +
                '<span class="grow"><span class="text-sm" style="display:block;color:var(--text-body)">' + esc(task.title) + "</span>" +
                '<span class="text-label muted" style="display:block">' + esc(task.blocker) + "</span></span>" +
                (task.escalated ? ui.badge(t("weekly.escalated"), "danger") : "") +
                "</div>"
              );
            })
            .join("") +
          "</div>"
        : "") +
      "</div>"
    );
  }

  function metric(value, label, color) {
    return (
      '<span><span class="stat-value" style="font-size:17px;display:block' + (color ? ";color:" + color : "") + '">' +
      value + "</span>" +
      '<span class="text-label muted">' + esc(label) + "</span></span>"
    );
  }

  /* ── Report text ───────────────────────────────────────────── */

  function reportText() {
    var rows = divisionRows();
    var pending = data.approvals.filter(function (a) {
      return a.state === "pending";
    });
    var stuck = data.tasks.filter(isStuck);
    var lines = [];

    lines.push("*Weekly Execution Report*");
    lines.push(fmt.fullDate(new Date()));
    lines.push("");

    lines.push("*" + t("weekly.byDivision") + "*");
    rows.forEach(function (row) {
      lines.push(
        "- " + row.name + ": " + row.open + " jalan, " + row.done + " selesai" +
          (row.overdue ? ", " + row.overdue + " lewat tenggat" : "") +
          (row.stuck ? ", " + row.stuck + " mandek" : ""),
      );
      row.blocked.forEach(function (task) {
        lines.push("  • blocker: " + task.title + " — " + task.blocker);
      });
    });
    lines.push("");

    lines.push("*" + t("weekly.needsDecision") + "*");
    if (!pending.length) {
      lines.push("- " + t("brief.nothingPending"));
    } else {
      pending.forEach(function (a) {
        lines.push("- " + a.title + (a.amount ? " (" + fmt.currency(a.amount, a.currency) + ")" : "") + " — " + memberName(a.requesterId));
      });
    }
    lines.push("");

    lines.push("*" + t("weekly.stuck") + "*");
    if (!stuck.length) {
      lines.push("- " + t("weekly.allClear"));
    } else {
      stuck.forEach(function (task) {
        lines.push("- " + task.title + " — " + memberName(task.assigneeId) + " (" + fmt.relative(task.updatedAt) + ")");
      });
    }

    return lines.join("\n");
  }

  /* ── Render ────────────────────────────────────────────────── */

  function render() {
    var rows = divisionRows();
    var pending = data.approvals.filter(function (a) {
      return a.state === "pending";
    });
    var stuck = data.tasks.filter(isStuck).sort(WOS.by("updatedAt"));

    page.innerHTML =
      '<div class="page__head">' +
      '<div><h1 class="page__title">' + esc(t("weekly.title")) + "</h1>" +
      '<p class="page__subtitle">' + esc(t("weekly.subtitle")) + "</p></div>" +
      '<button type="button" class="btn btn--primary btn--sm" data-copy-report>' +
      icon("message-square", 14, { color: "#fff" }) + esc(t("weekly.copyReport")) + "</button></div>" +

      '<h2 class="section-title" style="margin-top:24px">' + esc(t("weekly.byDivision")) + "</h2>" +
      (rows.length
        ? '<div class="grid grid--md-2">' + rows.map(divisionCard).join("") + "</div>"
        : '<div class="card">' + ui.empty(t("state.empty"), null, null, "briefcase") + "</div>") +

      '<h2 class="section-title" style="margin-top:26px">' + esc(t("weekly.needsDecision")) +
      (pending.length ? " (" + pending.length + ")" : "") + "</h2>" +
      (pending.length
        ? '<div class="card card--flush">' +
          pending
            .map(function (a) {
              return (
                '<a class="row" href="approvals.html" style="padding:13px 18px">' +
                ui.iconTile("shield-user", "var(--antar-purple-light)", "var(--antar-purple)", "sm") +
                '<span class="grow"><span class="row__title" style="display:block">' + esc(a.title) + "</span>" +
                '<span class="row__meta" style="display:block">' + esc(t("approvals.requestedBy", { name: memberName(a.requesterId) })) +
                " · " + esc(fmt.relative(a.requestedAt)) + "</span></span>" +
                (a.amount
                  ? '<span class="mono text-sm fw-bold strong">' + esc(fmt.currency(a.amount, a.currency)) + "</span>"
                  : ui.badge(t("decisions.kind.decision"), "brand")) +
                "</a>"
              );
            })
            .join("") +
          "</div>"
        : '<div class="card">' + ui.empty(t("brief.nothingPending"), null, null, "shield-user") + "</div>") +

      '<div class="spread" style="margin-top:26px;margin-bottom:10px">' +
      '<h2 class="section-title" style="margin:0">' + esc(t("weekly.stuck")) +
      (stuck.length ? " (" + stuck.length + ")" : "") + "</h2>" +
      '<span class="text-label faint">' + esc(t("weekly.stuckHint")) + "</span></div>" +
      (stuck.length
        ? '<div class="card card--flush">' +
          stuck
            .map(function (task) {
              return (
                '<div class="row" style="padding:13px 18px">' +
                ui.avatar(data.memberById.get(task.assigneeId), 26) +
                '<span class="grow"><span class="row__title" style="display:block">' + esc(task.title) + "</span>" +
                '<span class="row__meta" style="display:block">' + esc(divisionName(task.divisionId)) +
                " · " + esc(t("notes.lastEdited")) + " " + esc(fmt.relative(task.updatedAt)) + "</span></span>" +
                (task.escalated ? ui.badge(t("weekly.escalated"), "danger") : "") +
                (isOverdue(task) ? ui.badge(t("weekly.overdue"), "warning") : "") +
                ui.priorityBadge(task.priority) +
                "</div>"
              );
            })
            .join("") +
          "</div>"
        : '<div class="card">' + ui.empty(t("weekly.allClear"), null, null, "target") + "</div>");
  }

  function bind() {
    WOS.on(page, "click", "[data-copy-report]", function () {
      ui.copyText(reportText(), "weekly.reportCopied");
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "weekly", title: t("weekly.title") })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(4, 120);
      return WOS.db.loadAll(["tasks", "divisions", "members", "approvals"]);
    })
    .then(function (loaded) {
      data = loaded;
      data.memberById = WOS.indexById(loaded.members);
      data.divisionById = WOS.indexById(loaded.divisions);
      render();
      bind();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
