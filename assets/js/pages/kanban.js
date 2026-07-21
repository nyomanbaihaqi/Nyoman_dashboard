/* ──────────────────────────────────────────────────────────────
   Kanban Board — single-project (or all-projects) drag-and-drop
   board. Project comes from ?project=<id> in the URL, so a link
   from Projects or the sidebar always lands on the right board.
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
  var state = { projectId: WOS.param("project") || "" };

  function currentProject() {
    return state.projectId ? data.projectById.get(state.projectId) : null;
  }

  function scopedTasks() {
    if (!state.projectId) return data.tasks;
    return data.tasks.filter(function (task) {
      return task.projectId === state.projectId;
    });
  }

  function render() {
    var project = currentProject();

    page.innerHTML =
      '<div style="flex:none;padding:16px 20px 0;display:flex;align-items:center;gap:12px;flex-wrap:wrap">' +
      '<select class="select" style="max-width:240px" data-project-switch>' +
      '<option value="">' + esc(t("kanban.allProjects")) + "</option>" +
      data.projects
        .map(function (p) {
          return '<option value="' + esc(p.id) + '"' + (p.id === state.projectId ? " selected" : "") + ">" + esc(p.name) + "</option>";
        })
        .join("") +
      "</select>" +
      '<span class="grow"></span>' +
      '<button type="button" class="btn btn--primary btn--sm" data-add-card>' + icon("file-pen", 14, { color: "#fff" }) +
      esc(t("action.addCard")) + "</button>" +
      "</div>" +
      '<div data-board-mount style="flex:1;min-height:0;display:flex;flex-direction:column"></div>';

    var mount = WOS.$("[data-board-mount]", page);
    ui.kanbanBoard(mount, {
      tasks: scopedTasks(),
      memberById: data.memberById,
      projectById: state.projectId ? null : data.projectById,
      onMove: function (taskId, status) {
        WOS.db.update("tasks", taskId, { status: status, updatedAt: new Date().toISOString() }).then(function () {
          ui.toast(t("kanban.moved", { status: t("status." + status) }));
          return refresh();
        });
      },
      onCardClick: openEditModal,
      onAddClick: function (status) {
        openTaskModal(null, { status: status, projectId: state.projectId, lockProject: !!state.projectId });
      },
    });
  }

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

  function bind() {
    WOS.on(page, "change", "[data-project-switch]", function (event, target) {
      state.projectId = target.value;
      var url = new URL(window.location.href);
      if (state.projectId) url.searchParams.set("project", state.projectId);
      else url.searchParams.delete("project");
      window.history.replaceState(null, "", url);
      render();
    });

    WOS.on(page, "click", "[data-add-card]", function () {
      openTaskModal(null, { status: "todo", projectId: state.projectId, lockProject: !!state.projectId });
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
    .mount({ active: "kanban", title: t("kanban.title"), fill: true })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(3, 200);
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
