/* ──────────────────────────────────────────────────────────────
   Home — greeting, KPI tiles, focus list, task list, project
   overview, agenda, recent notes, quick actions.

   On mobile the cards reflow into one column in a deliberately
   different order from the desktop two-column split: the agenda sits
   directly under Today's Focus, because "what's next" is the reason
   you open this on a phone.
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

  function greetingKey() {
    var hour = new Date().getHours();
    if (hour < 12) return "home.greeting.morning";
    if (hour < 18) return "home.greeting.afternoon";
    return "home.greeting.evening";
  }

  /* ── Derived views over the raw collections ────────────────── */

  function myOpenTasks() {
    var me = WOS.config.currentUserId;
    return data.tasks.filter(function (task) {
      return task.assigneeId === me && task.status !== "done";
    });
  }

  function todaysEvents() {
    return data.events
      .filter(function (event) {
        return fmt.isToday(event.startAt);
      })
      .sort(function (a, b) {
        return a.startAt.localeCompare(b.startAt);
      });
  }

  /* ── Sections ──────────────────────────────────────────────── */

  function statTile(config) {
    return (
      '<a class="card card-lift" href="' + config.href + '" style="display:block">' +
      ui.iconTile(config.icon, config.bg, config.color) +
      '<p style="margin-top:12px;font-size:12.5px;color:var(--slate-500)">' + esc(config.label) + "</p>" +
      '<p class="stat-value" style="margin-top:2px">' + config.value + "</p>" +
      '<p style="margin-top:4px;font-size:11.5px;color:' + (config.subColor || "var(--slate-500)") + '">' +
      esc(config.sub) + "</p></a>"
    );
  }

  function statsRow() {
    var open = myOpenTasks();
    var events = todaysEvents();
    var me = WOS.config.currentUserId;

    var dueToday = open.filter(function (task) {
      return fmt.isToday(task.dueAt);
    }).length;

    var overdue = open.filter(function (task) {
      return task.dueAt && fmt.isPast(task.dueAt);
    }).length;

    var next = events.filter(function (event) {
      return new Date(event.startAt).getTime() > Date.now();
    })[0];

    var minutesToNext = next
      ? Math.max(0, Math.round((new Date(next.startAt).getTime() - Date.now()) / 60000))
      : null;

    var activeProjects = data.projects.filter(function (project) {
      return project.status !== "completed";
    });

    var pendingApprovals = data.approvals.filter(function (approval) {
      return approval.state === "pending" && approval.approverId === me;
    });

    return (
      '<div class="grid grid--2 grid--sm-3 grid--xl-5" style="margin-top:20px">' +
      statTile({
        icon: "file-pen", bg: "var(--antar-purple-light)", color: "var(--antar-purple)",
        label: t("home.stat.myTasks"), value: open.length,
        sub: t("home.stat.dueToday", { n: dueToday }), href: "tasks.html",
      }) +
      statTile({
        icon: "clock", bg: "#fff7ed", color: "#ea580c",
        label: t("home.stat.meetingsToday"), value: events.length,
        sub: minutesToNext === null ? t("home.stat.noneToday") : t("home.stat.nextIn", { n: minutesToNext }),
        href: "calendar.html",
      }) +
      statTile({
        icon: "briefcase", bg: "#ecfdf5", color: "#059669",
        label: t("home.stat.activeProjects"), value: activeProjects.length,
        sub: t("home.stat.updates", {
          n: activeProjects.filter(function (p) {
            return p.status === "at_risk";
          }).length,
        }),
        href: "projects.html",
      }) +
      statTile({
        icon: "target", bg: "#f0f9ff", color: "#0284c7",
        label: t("home.stat.deadlines"), value: dueToday + overdue,
        sub: t("home.stat.thisWeek"), href: "timeline.html",
      }) +
      statTile({
        icon: "shield-user", bg: "#fff1f2", color: "#e11d48",
        label: t("home.stat.approvals"), value: pendingApprovals.length,
        sub: t("home.stat.pending"), subColor: "#e11d48", href: "ceo.html",
      }) +
      "</div>"
    );
  }

  function focusCard() {
    var weight = { high: 0, medium: 1, low: 2 };

    var items = myOpenTasks()
      .slice()
      .sort(function (a, b) {
        return (
          weight[a.priority] - weight[b.priority] ||
          String(a.dueAt || "9999").localeCompare(String(b.dueAt || "9999"))
        );
      })
      .slice(0, 3);

    var rows = items
      .map(function (task) {
        var project = data.projectById.get(task.projectId);
        return (
          '<div class="cluster cluster--nowrap" style="padding:12px 8px;gap:14px">' +
          ui.iconTile(
            project ? project.icon : "target",
            project ? project.iconBg : "#fff1f2",
            project ? project.iconColor : "#e11d48",
          ) +
          '<span class="grow">' +
          '<span class="row__title" style="display:block;font-size:13.5px">' + esc(task.title) + "</span>" +
          '<span class="row__meta" style="display:block">' + esc(project ? project.name : "—") + "</span>" +
          "</span>" +
          ui.priorityBadge(task.priority) +
          "</div>"
        );
      })
      .join("");

    return (
      '<section class="card" style="order:1">' +
      '<div class="card__header"><h2 class="card__title">' + esc(t("home.todaysFocus")) + "</h2></div>" +
      (rows || '<p class="muted" style="padding:20px 0;text-align:center">' + esc(t("state.empty")) + "</p>") +
      '<a class="btn-dashed" style="margin-top:6px" href="tasks.html?new=1">' + esc(t("action.addFocus")) + "</a>" +
      "</section>"
    );
  }

  function taskListCard(activeTab) {
    var open = myOpenTasks();

    var overdue = open.filter(function (task) {
      return task.dueAt && fmt.isPast(task.dueAt);
    });

    var list =
      activeTab === "overdue"
        ? overdue
        : activeTab === "upcoming"
          ? open.filter(function (task) {
              return task.dueAt && !fmt.isPast(task.dueAt);
            })
          : open;

    var rows = list
      .slice()
      .sort(function (a, b) {
        return String(a.dueAt || "9999").localeCompare(String(b.dueAt || "9999"));
      })
      .slice(0, 5)
      .map(function (task) {
        return (
          '<div class="row" data-task-row="' + esc(task.id) + '">' +
          ui.checkbox(false, task.title, { "task-toggle": task.id }) +
          '<span class="grow truncate task-title" style="font-size:13.5px">' + esc(task.title) + "</span>" +
          ui.priorityBadge(task.priority) +
          '<span class="text-xs muted" style="width:56px;text-align:right;flex:none">' +
          esc(fmt.due(task.dueAt)) + "</span></div>"
        );
      })
      .join("");

    var tabs = [
      { id: "mine", label: t("home.stat.myTasks") },
      { id: "upcoming", label: t("home.upcoming") },
      { id: "overdue", label: t("home.overdue") + " (" + overdue.length + ")" },
    ]
      .map(function (tab) {
        return (
          '<button type="button" class="tab' + (tab.id === activeTab ? " is-active" : "") +
          '" data-home-tab="' + tab.id + '">' + esc(tab.label) + "</button>"
        );
      })
      .join("");

    return (
      '<section class="card" style="order:3" data-task-card>' +
      '<div class="spread" style="margin-bottom:14px;align-items:flex-end">' +
      '<div class="tabs tabs--flush scroll-x" style="gap:20px">' + tabs + "</div>" +
      '<a class="tap text-sm fw-semibold" style="flex:none" href="tasks.html">' + esc(t("action.viewAll")) + "</a>" +
      "</div>" +
      '<div data-task-rows>' +
      (rows || '<p class="muted" style="padding:24px 0;text-align:center">' + esc(t("tasks.empty")) + "</p>") +
      "</div>" +
      '<a class="btn-dashed" style="margin-top:12px" href="tasks.html?new=1">' + esc(t("action.addTask")) + "</a>" +
      "</section>"
    );
  }

  function activeProjectsCard() {
    var rows = data.projects
      .filter(function (project) {
        return project.status !== "completed";
      })
      .slice(0, 4)
      .map(function (project) {
        return (
          '<a class="row" href="project.html?id=' + esc(project.id) + '">' +
          ui.iconTile(project.icon, project.iconBg, project.iconColor, "sm") +
          '<span class="grow">' +
          '<span class="spread"><span class="row__title">' + esc(project.name) + "</span>" +
          '<span class="mono text-xs muted">' + project.progress + "%</span></span>" +
          '<span style="display:block;margin-top:6px">' +
          ui.progress(project.progress, ui.PROGRESS_GRADIENT[project.status]) +
          "</span></span></a>"
        );
      })
      .join("");

    return (
      '<section class="card" style="order:4">' +
      '<div class="card__header"><h2 class="card__title">' + esc(t("home.activeProjects")) + "</h2>" +
      '<a class="tap text-sm fw-semibold" href="projects.html">' + esc(t("action.viewAll")) + "</a></div>" +
      rows +
      "</section>"
    );
  }

  function overviewCard() {
    var order = ["on_track", "at_risk", "on_hold", "completed"];
    var total = data.projects.length || 1;

    var counts = order.map(function (status) {
      return {
        status: status,
        n: data.projects.filter(function (project) {
          return project.status === status;
        }).length,
      };
    });

    // Build one conic-gradient arc per status, in order.
    var cursor = 0;
    var stops = counts
      .filter(function (entry) {
        return entry.n > 0;
      })
      .map(function (entry) {
        var start = (cursor / total) * 100;
        cursor += entry.n;
        var end = (cursor / total) * 100;
        return ui.PROJECT_COLOR[entry.status] + " " + start + "% " + end + "%";
      });

    var overall = data.projects.length
      ? Math.round(
          data.projects.reduce(function (sum, project) {
            return sum + project.progress;
          }, 0) / data.projects.length,
        )
      : 0;

    var legend = counts
      .map(function (entry) {
        return (
          '<div class="cluster cluster--nowrap">' +
          '<span style="width:8px;height:8px;border-radius:50%;flex:none;background:' +
          ui.PROJECT_COLOR[entry.status] + '"></span>' +
          '<span class="grow truncate text-xs" style="color:var(--slate-600)">' +
          esc(t("projects.status." + entry.status)) + "</span>" +
          '<span class="mono text-xs fw-bold strong">' + entry.n + "</span></div>"
        );
      })
      .join("");

    return (
      '<section class="card" style="order:5">' +
      '<div class="card__header"><h2 class="card__title">' + esc(t("home.projectsOverview")) + "</h2>" +
      '<a class="tap text-sm fw-semibold" href="projects.html">' + esc(t("action.viewAll")) + "</a></div>" +
      '<div class="cluster cluster--nowrap" style="gap:18px">' +
      '<div class="donut" style="background:conic-gradient(' + stops.join(",") + ')" role="img" aria-label="' +
      esc(data.projects.length + " " + t("home.totalProjects")) + '">' +
      '<div class="donut__hole"><span class="stat-value">' + data.projects.length + "</span>" +
      '<span style="font-size:10px;color:var(--slate-500)">' + esc(t("home.totalProjects")) + "</span></div></div>" +
      '<div class="grow stack stack--sm">' + legend + "</div></div>" +
      '<div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border-subtle)">' +
      '<div class="spread text-xs muted"><span>' + esc(t("home.overallProgress")) + "</span>" +
      '<span class="mono fw-bold strong">' + overall + "%</span></div>" +
      '<div style="margin-top:6px">' + ui.progress(overall) + "</div></div></section>"
    );
  }

  function recentlyUpdatedCard() {
    var cards = data.notes
      .slice()
      .sort(function (a, b) {
        return b.updatedAt.localeCompare(a.updatedAt);
      })
      .slice(0, 4)
      .map(function (note) {
        var author = data.memberById.get(note.authorId);
        return (
          '<a class="card-lift" href="note.html?id=' + esc(note.id) +
          '" style="border:1px solid var(--border-subtle);border-radius:12px;padding:14px;display:block">' +
          '<span style="font-size:20px">' + esc(note.icon) + "</span>" +
          '<p class="clamp-2" style="margin-top:8px;font-size:13px;font-weight:600;color:var(--text-strong)">' +
          esc(note.title) + "</p>" +
          '<p style="margin-top:4px;font-size:11.5px;color:var(--slate-500)">' + esc(fmt.relative(note.updatedAt)) + "</p>" +
          '<p class="truncate" style="margin-top:6px;font-size:11px;color:var(--slate-400)">' +
          esc(t("home.updatedBy", { name: author ? author.name : "—" })) + "</p></a>"
        );
      })
      .join("");

    return (
      '<section class="card" style="order:8">' +
      '<div class="card__header"><h2 class="card__title">' + esc(t("home.recentlyUpdated")) + "</h2></div>" +
      '<div class="grid grid--2 grid--xl-4">' + cards + "</div></section>"
    );
  }

  function agendaCard() {
    var events = todaysEvents();

    var rows = events
      .map(function (event) {
        return (
          '<a class="row" style="gap:10px;align-items:flex-start" href="calendar.html?event=' + esc(event.id) + '">' +
          '<span class="mono text-label muted" style="width:40px;flex:none;padding-top:1px">' +
          esc(fmt.time(event.startAt)) + "</span>" +
          '<span style="width:7px;height:7px;border-radius:50%;flex:none;margin-top:6px;background:' +
          ui.EVENT_COLOR[event.label] + '"></span>' +
          '<span class="grow"><span class="row__title" style="display:block">' + esc(event.title) + "</span>" +
          '<span class="row__meta" style="display:block">' + esc(event.location) + "</span></span></a>"
        );
      })
      .join("");

    return (
      '<section class="card card--tight" style="order:2">' +
      '<div class="card__header"><h2 class="card__title" style="font-size:14px">' +
      esc(t("home.upcomingSchedule")) + "</h2>" +
      '<a class="tap text-xs fw-semibold" href="calendar.html">' + esc(t("action.viewCalendar")) + "</a></div>" +
      (rows || '<p class="muted text-sm" style="padding:20px 0;text-align:center">' +
        esc(t("calendar.noEventsToday")) + "</p>") +
      "</section>"
    );
  }

  function recentNotesCard() {
    var rows = data.notes
      .filter(function (note) {
        return note.kind !== "daily";
      })
      .sort(function (a, b) {
        return b.updatedAt.localeCompare(a.updatedAt);
      })
      .slice(0, 3)
      .map(function (note) {
        return (
          '<a class="row" style="gap:10px" href="note.html?id=' + esc(note.id) + '">' +
          '<span class="icon-tile icon-tile--sm" style="background:var(--slate-50);font-size:14px">' +
          esc(note.icon) + "</span>" +
          '<span class="grow"><span class="row__title" style="display:block;font-size:12.5px">' +
          esc(note.title) + "</span>" +
          '<span class="row__meta" style="display:block">' + esc(fmt.relative(note.updatedAt)) + "</span></span></a>"
        );
      })
      .join("");

    return (
      '<section class="card card--tight" style="order:6">' +
      '<div class="card__header"><h2 class="card__title" style="font-size:14px">' +
      esc(t("home.recentNotes")) + "</h2>" +
      '<a class="tap text-xs fw-semibold" href="notes.html">' + esc(t("action.viewAll")) + "</a></div>" +
      rows + "</section>"
    );
  }

  function quickActionsCard() {
    var actions = [
      { key: "search.action.newTask", icon: "file-pen", href: "tasks.html?new=1" },
      { key: "action.newProject", icon: "briefcase", href: "projects.html?new=1" },
      { key: "search.action.scheduleMeeting", icon: "clock", href: "calendar.html?new=1" },
      { key: "action.createNote", icon: "layers", href: "notes.html?new=1" },
    ]
      .map(function (action) {
        return (
          '<a class="row" style="padding:10px 4px" href="' + action.href + '">' +
          '<span class="icon-tile icon-tile--sm" style="background:var(--antar-purple-light)">' +
          icon(action.icon, 14, { color: "var(--antar-purple)" }) + "</span>" +
          '<span class="grow truncate text-sm fw-semibold strong">' + esc(t(action.key)) + "</span>" +
          icon("chevron-right", 13, { color: "var(--slate-400)" }) + "</a>"
        );
      })
      .join("");

    return (
      '<section class="card card--tight" style="order:7">' +
      '<div class="card__header"><h2 class="card__title" style="font-size:14px">' +
      esc(t("home.quickActions")) + "</h2></div>" + actions + "</section>"
    );
  }

  /* ── Render ────────────────────────────────────────────────── */

  var currentTab = "mine";

  function render() {
    var user = WOS.shell.user();
    var firstName = user ? String(user.name || "").split(" ")[0] : "";

    page.innerHTML =
      '<h1 class="page__title" style="font-size:22px">' +
      esc(t(greetingKey())) + ", " + esc(firstName) + " 👋</h1>" +
      '<p class="page__subtitle">' + esc(t("home.subtitle")) + "</p>" +
      statsRow() +
      /* One flex column on mobile; the two `contents` wrappers below become
         real columns at lg, restoring the design's 2fr/1fr split. The layout
         lives entirely in CSS — an inline display here would outrank the
         media query and pin the page to one column on desktop. */
      '<div class="home-body">' +
      '<div class="home-col home-col--main">' +
      focusCard() + taskListCard(currentTab) + activeProjectsCard() + overviewCard() + recentlyUpdatedCard() +
      "</div>" +
      '<div class="home-col home-col--rail">' +
      agendaCard() + recentNotesCard() + quickActionsCard() +
      "</div></div>";
  }

  function bind() {
    WOS.on(page, "click", "[data-home-tab]", function (event, target) {
      currentTab = target.dataset.homeTab;
      render();
    });

    WOS.on(page, "click", "[data-task-toggle]", function (event, target) {
      var id = target.dataset.taskToggle;
      var row = target.closest("[data-task-row]");

      // Flip immediately so the tick lands on the same frame as the tap, then
      // let the row fall out of the list once the write resolves.
      target.setAttribute("aria-checked", "true");
      target.querySelector(".check__box").innerHTML = icon("check", 12);
      if (row) row.classList.add("is-done");

      WOS.db
        .update("tasks", id, { status: "done", updatedAt: new Date().toISOString() })
        .then(function () {
          return WOS.shell.refreshCounts();
        })
        .then(render)
        .catch(function (error) {
          console.error(error);
          ui.toast(t("state.error"), "error");
          render();
        });
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "home", title: "Workspace OS" })
    .then(function (main) {
      page = main;
      page.innerHTML = ui.skeletonRows(4, 90);
      // Home only shows today's schedule, so it asks the calendar for today
      // rather than the whole `events` collection — same source the Calendar
      // page reads, so the two can't disagree.
      var dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      var dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      return Promise.all([
        WOS.db.loadAll(["members", "tasks", "projects", "notes", "approvals"], ["tasks"]),
        // Today's schedule is one card among many here, so an unreachable
        // calendar shouldn't cost the user their tasks, projects and
        // approvals as well.
        WOS.gcal.range(dayStart, dayEnd).catch(function (error) {
          console.warn("[wos] calendar unavailable for home", error);
          return [];
        }),
      ]);
    })
    .then(function (results) {
      data = results[0];
      data.events = results[1];
      data.memberById = WOS.indexById(data.members);
      data.projectById = WOS.indexById(data.projects);
      render();
      bind();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
