/* ──────────────────────────────────────────────────────────────
   My Tasks — list / board / calendar / timeline over the full
   tasks collection.

   The four view tabs share one filter state (priority, assignee,
   due-this-week) and one task-edit modal, so switching tabs never
   loses what you were looking at.
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
  var state = {
    view: "list",
    filters: { priorityHigh: false, mine: false, dueWeek: false },
    groupByProject: false,
  };

  /* ── Filtering ─────────────────────────────────────────────── */

  function filteredTasks() {
    var me = WOS.config.currentUserId;
    return data.tasks.filter(function (task) {
      if (state.filters.priorityHigh && task.priority !== "high") return false;
      if (state.filters.mine && task.assigneeId !== me) return false;
      if (state.filters.dueWeek && !fmt.isThisWeek(task.dueAt)) return false;
      return true;
    });
  }

  function anyFilterActive() {
    return state.filters.priorityHigh || state.filters.mine || state.filters.dueWeek;
  }

  /* ── Shared row markup ─────────────────────────────────────── */

  function tableRow(task) {
    var member = data.memberById.get(task.assigneeId);
    return (
      '<div class="table__row" style="grid-template-columns:28px 3fr 110px 110px 1.4fr 110px 110px" data-task-row="' +
      esc(task.id) + '">' +
      ui.checkbox(task.status === "done", task.title, { "task-toggle": task.id }) +
      '<button type="button" class="text-sm fw-semibold truncate tap" data-task-open="' + esc(task.id) +
      '" style="text-align:left;border:none;background:none;color:var(--text-strong)">' + esc(task.title) + "</button>" +
      ui.priorityBadge(task.priority) +
      '<span class="text-sm" style="color:' + (fmt.isPast(task.dueAt) && task.status !== "done" ? "var(--rose-500)" : "var(--slate-500)") + '">' +
      esc(fmt.due(task.dueAt)) + "</span>" +
      '<div class="cluster" style="gap:6px">' + ui.tags(task.tags) + "</div>" +
      ui.avatar(member, 26) +
      ui.statusBadge(task.status) +
      "</div>"
    );
  }

  function cardRow(task) {
    var member = data.memberById.get(task.assigneeId);
    var project = data.projectById.get(task.projectId);
    return (
      '<div class="card" data-task-row="' + esc(task.id) + '" style="padding:14px">' +
      '<div class="cluster cluster--nowrap" style="align-items:flex-start">' +
      ui.checkbox(task.status === "done", task.title, { "task-toggle": task.id }) +
      '<span class="grow" style="min-width:0">' +
      '<button type="button" class="text-sm fw-semibold tap" data-task-open="' + esc(task.id) +
      '" style="text-align:left;border:none;background:none;color:var(--text-strong);display:block;width:100%">' +
      esc(task.title) + "</button>" +
      '<span class="row__meta" style="display:block;margin-top:2px">' +
      esc(project ? project.name : t("tasks.filter.all")) + " · " + esc(fmt.due(task.dueAt)) + "</span>" +
      "</span>" + ui.avatar(member, 28) + "</div>" +
      '<div class="spread" style="margin-top:10px">' +
      '<div class="cluster" style="gap:6px">' + ui.priorityBadge(task.priority) + ui.tags(task.tags) + "</div>" +
      ui.statusBadge(task.status) + "</div></div>"
    );
  }

  function sectionsFor(tasks) {
    if (!state.groupByProject) return [{ label: null, tasks: tasks }];
    var groups = WOS.groupBy(tasks, function (task) {
      return task.projectId || "_none";
    });
    var sections = [];
    groups.forEach(function (list, key) {
      var project = key === "_none" ? null : data.projectById.get(key);
      sections.push({ label: project ? project.name : t("projects.filter.all"), tasks: list });
    });
    return sections.sort(function (a, b) {
      return String(a.label).localeCompare(String(b.label));
    });
  }

  /* ── List view ─────────────────────────────────────────────── */

  function listView() {
    var tasks = filteredTasks().slice().sort(WOS.by("order"));

    if (!tasks.length) {
      return '<div class="card">' + ui.empty(t("tasks.empty"), null, null, "file-pen") + "</div>";
    }

    return sectionsFor(tasks)
      .map(function (section) {
        return (
          (section.label ? '<h3 class="section-title" style="margin-top:20px">' + esc(section.label) + "</h3>" : "") +
          '<div class="card card--flush">' +
          '<div class="table">' +
          '<div class="table__head" style="grid-template-columns:28px 3fr 110px 110px 1.4fr 110px 110px">' +
          "<span></span><span>" + esc(t("tasks.col.task")) + "</span><span>" + esc(t("tasks.col.priority")) +
          "</span><span>" + esc(t("tasks.col.due")) + "</span><span>" + esc(t("tasks.col.tags")) + "</span><span>" +
          esc(t("tasks.col.assignee")) + "</span><span>" + esc(t("tasks.col.status")) + "</span></div>" +
          section.tasks.map(tableRow).join("") +
          "</div>" +
          '<div class="card-list" style="padding:12px">' + section.tasks.map(cardRow).join("") + "</div>" +
          "</div>"
        );
      })
      .join("");
  }

  /* ── Board view ────────────────────────────────────────────── */

  function boardView(container) {
    container.innerHTML = '<div data-board-mount></div>';
    var mount = WOS.$("[data-board-mount]", container);
    ui.kanbanBoard(mount, {
      tasks: filteredTasks(),
      memberById: data.memberById,
      projectById: data.projectById,
      onMove: function (taskId, status) {
        WOS.db.update("tasks", taskId, { status: status, updatedAt: new Date().toISOString() }).then(function () {
          ui.toast(t("kanban.moved", { status: t("status." + status) }));
          return refresh();
        });
      },
      onCardClick: openEditModal,
      onAddClick: function (status) {
        openTaskModal(null, { status: status });
      },
    });
  }

  /* ── Calendar view (agenda grouped by exact due date) ────────── */

  function calendarView() {
    var tasks = filteredTasks().filter(function (task) {
      return task.dueAt;
    });
    var undated = filteredTasks().filter(function (task) {
      return !task.dueAt;
    });

    var groups = WOS.groupBy(tasks, function (task) {
      return fmt.dateInputValue(task.dueAt);
    });
    var days = Array.from(groups.keys()).sort();

    var html = days
      .map(function (day) {
        var list = groups.get(day).slice().sort(WOS.by("dueAt"));
        return (
          '<div class="card" style="margin-top:14px">' +
          '<div class="card__header"><h2 class="card__title">' + esc(fmt.fullDate(day)) + "</h2></div>" +
          list
            .map(function (task) {
              return (
                '<div class="row" data-task-row="' + esc(task.id) + '">' +
                '<span class="mono text-label muted" style="width:44px;flex:none">' + esc(fmt.time(task.dueAt)) + "</span>" +
                ui.checkbox(task.status === "done", task.title, { "task-toggle": task.id }) +
                '<button type="button" class="grow truncate text-sm fw-semibold tap" data-task-open="' + esc(task.id) +
                '" style="text-align:left;border:none;background:none;color:var(--text-strong)">' + esc(task.title) + "</button>" +
                ui.priorityBadge(task.priority) + "</div>"
              );
            })
            .join("") +
          "</div>"
        );
      })
      .join("");

    if (undated.length) {
      html +=
        '<div class="card" style="margin-top:14px"><div class="card__header"><h2 class="card__title">' +
        esc(t("tasks.col.due")) + " — —</h2></div>" +
        undated
          .map(function (task) {
            return (
              '<div class="row" data-task-row="' + esc(task.id) + '">' +
              ui.checkbox(task.status === "done", task.title, { "task-toggle": task.id }) +
              '<button type="button" class="grow truncate text-sm fw-semibold tap" data-task-open="' + esc(task.id) +
              '" style="text-align:left;border:none;background:none;color:var(--text-strong)">' + esc(task.title) + "</button>" +
              ui.priorityBadge(task.priority) + "</div>"
            );
          })
          .join("") +
        "</div>";
    }

    return html || '<div class="card" style="margin-top:14px">' + ui.empty(t("tasks.empty"), null, null, "clock") + "</div>";
  }

  /* ── Timeline view (relative buckets) ─────────────────────────── */

  function timelineView() {
    var tasks = filteredTasks();
    var buckets = [
      { key: "overdue", label: t("home.overdue"), test: function (tk) { return tk.dueAt && fmt.isPast(tk.dueAt) && tk.status !== "done"; } },
      { key: "today", label: t("time.today"), test: function (tk) { return fmt.isToday(tk.dueAt); } },
      { key: "week", label: t("time.thisWeek"), test: function (tk) { return tk.dueAt && !fmt.isToday(tk.dueAt) && !fmt.isPast(tk.dueAt) && fmt.isThisWeek(tk.dueAt); } },
      { key: "later", label: t("home.upcoming"), test: function (tk) { return tk.dueAt && !fmt.isThisWeek(tk.dueAt) && !fmt.isPast(tk.dueAt); } },
      { key: "none", label: t("tasks.col.due") + " —", test: function (tk) { return !tk.dueAt; } },
    ];

    var used = {};
    var html = buckets
      .map(function (bucket) {
        var list = tasks.filter(function (task) {
          if (used[task.id]) return false;
          var match = bucket.test(task);
          if (match) used[task.id] = true;
          return match;
        });
        if (!list.length) return "";
        return (
          '<div style="margin-top:18px">' +
          '<h3 class="section-title">' + esc(bucket.label) + " (" + list.length + ")</h3>" +
          '<div class="stack stack--sm">' +
          list
            .map(function (task) {
              var project = data.projectById.get(task.projectId);
              return (
                '<div class="card" style="padding:12px 14px" data-task-row="' + esc(task.id) + '">' +
                '<div class="cluster cluster--nowrap">' +
                ui.checkbox(task.status === "done", task.title, { "task-toggle": task.id }) +
                '<button type="button" class="grow truncate text-sm fw-semibold tap" data-task-open="' + esc(task.id) +
                '" style="text-align:left;border:none;background:none;color:var(--text-strong)">' + esc(task.title) + "</button>" +
                ui.priorityBadge(task.priority) + ui.statusBadge(task.status) + "</div>" +
                (project ? '<p class="text-label muted" style="margin-top:6px;margin-left:32px">' + esc(project.name) + "</p>" : "") +
                "</div>"
              );
            })
            .join("") +
          "</div></div>"
        );
      })
      .join("");

    return html || '<div class="card" style="margin-top:14px">' + ui.empty(t("tasks.empty"), null, null, "chart-line") + "</div>";
  }

  /* ── Task create/edit modal ───────────────────────────────── */

  function openTaskModal(task, defaults) {
    ui.taskModal({
      task: task,
      members: data.members,
      projects: data.projects,
      defaults: defaults || {},
      onSaved: refresh,
    });
  }

  function openEditModal(taskId) {
    var task = data.tasks.filter(function (task) {
      return task.id === taskId;
    })[0];
    if (task) openTaskModal(task);
  }

  /* ── Render ────────────────────────────────────────────────── */

  function render() {
    var tasks = filteredTasks();
    var viewTabs = [
      { id: "list", key: "tasks.view.list" },
      { id: "board", key: "tasks.view.board" },
      { id: "calendar", key: "tasks.view.calendar" },
      { id: "timeline", key: "tasks.view.timeline" },
    ];

    var chips = [
      { id: "all", key: "tasks.filter.all", active: !anyFilterActive() },
      { id: "priorityHigh", key: "tasks.filter.highPriority", active: state.filters.priorityHigh },
      { id: "mine", key: "tasks.filter.mine", active: state.filters.mine },
      { id: "dueWeek", key: "tasks.filter.thisWeek", active: state.filters.dueWeek },
    ];

    page.innerHTML =
      '<div class="page__head">' +
      '<h1 class="page__title">' + esc(t("tasks.title")) + "</h1>" +
      '<div class="cluster">' +
      '<button type="button" class="btn btn--outline btn--sm" data-toggle-group>' + icon("layers", 14) +
      esc(t("action.groupBy")) + "</button></div></div>" +
      '<div class="tabs scroll-x" style="margin-top:20px">' +
      viewTabs
        .map(function (tab) {
          return (
            '<button type="button" class="tab' + (state.view === tab.id ? " is-active" : "") +
            '" data-view-tab="' + tab.id + '">' + esc(t(tab.key)) + "</button>"
          );
        })
        .join("") +
      "</div>" +
      '<div class="chips scroll-x" style="margin-top:16px">' +
      chips
        .map(function (chip) {
          return (
            '<button type="button" class="chip' + (chip.active ? " is-active" : "") +
            '" data-filter-chip="' + chip.id + '">' + esc(t(chip.key)) + "</button>"
          );
        })
        .join("") +
      "</div>" +
      '<div data-view-body style="margin-top:2px"></div>' +
      '<button type="button" class="fab" data-add-task aria-label="' + esc(t("action.addTask")) + '">' +
      icon("file-pen", 20, { color: "#fff" }) + "</button>";

    var body = WOS.$("[data-view-body]", page);
    if (state.view === "list") {
      body.innerHTML = listView();
    } else if (state.view === "board") {
      boardView(body);
    } else if (state.view === "calendar") {
      body.innerHTML = calendarView();
    } else {
      body.innerHTML = timelineView();
    }
  }

  function bind() {
    WOS.on(page, "click", "[data-view-tab]", function (event, target) {
      state.view = target.dataset.viewTab;
      render();
    });

    WOS.on(page, "click", "[data-filter-chip]", function (event, target) {
      var id = target.dataset.filterChip;
      if (id === "all") {
        state.filters = { priorityHigh: false, mine: false, dueWeek: false };
      } else {
        state.filters[id] = !state.filters[id];
      }
      render();
    });

    WOS.on(page, "click", "[data-toggle-group]", function () {
      state.groupByProject = !state.groupByProject;
      ui.toast(state.groupByProject ? t("projects.title") : t("tasks.filter.all"));
      render();
    });

    WOS.on(page, "click", "[data-add-task]", function () {
      openTaskModal(null, {});
    });

    WOS.on(page, "click", "[data-task-open]", function (event, target) {
      openEditModal(target.dataset.taskOpen);
    });

    WOS.on(page, "click", "[data-task-toggle]", function (event, target) {
      var id = target.dataset.taskToggle;
      var task = data.tasks.filter(function (t) {
        return t.id === id;
      })[0];
      if (!task) return;
      var nextStatus = task.status === "done" ? "todo" : "done";
      WOS.db.update("tasks", id, { status: nextStatus, updatedAt: new Date().toISOString() }).then(function () {
        return refresh();
      });
    });
  }

  function refresh() {
    return WOS.db.list("tasks").then(function (rows) {
      data.tasks = rows;
      return WOS.shell.refreshCounts();
    }).then(function () {
      render();
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "tasks", title: t("tasks.title") })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(5, 90);
      return WOS.db.loadAll(["tasks", "members", "projects"]);
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
