/* ──────────────────────────────────────────────────────────────
   Project Detail — header stats + Overview / Kanban / Timeline /
   Files / Meeting Notes / Discussion / Activity / Settings tabs.
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
  var projectId = WOS.param("id");
  var project;
  var state = { tab: "overview" };

  var TABS = [
    "overview", "kanban", "timeline", "files", "meetingNotes", "discussion", "activity", "settings",
  ];

  function projectTasks() {
    return data.tasks.filter(function (task) {
      return task.projectId === projectId;
    });
  }

  function projectFiles() {
    var noteIds = data.notes
      .filter(function (note) {
        return note.projectId === projectId;
      })
      .map(function (note) {
        return note.id;
      });
    return data.files.filter(function (file) {
      return noteIds.indexOf(file.noteId) !== -1;
    });
  }

  function projectMeetings() {
    return data.meetings
      .filter(function (m) {
        return m.projectId === projectId;
      })
      .sort(WOS.by("startAt", "desc"));
  }

  function projectComments() {
    return data.comments
      .filter(function (c) {
        return c.targetType === "project" && c.targetId === projectId;
      })
      .sort(WOS.by("createdAt", "desc"));
  }

  function projectMilestones() {
    return data.milestones
      .filter(function (m) {
        return m.projectId === projectId;
      })
      .sort(WOS.by("startAt"));
  }

  /* ── Header ────────────────────────────────────────────────── */

  function headerCard() {
    var tasks = projectTasks();
    var done = tasks.filter(function (task) {
      return task.status === "done";
    }).length;
    var owner = data.memberById.get(project.ownerId);

    return (
      '<div class="card" style="position:relative;overflow:hidden;padding-left:26px">' +
      '<span style="position:absolute;left:0;top:0;height:100%;width:5px;background:' +
      ui.PROGRESS_GRADIENT[project.status] + '"></span>' +
      '<div class="spread" style="align-items:flex-start">' +
      '<div class="cluster" style="gap:16px">' +
      ui.iconTile(project.icon, project.iconBg, project.iconColor, "lg") +
      "<span><span style=\"font-size:19px;font-weight:800;color:var(--text-strong);display:block\">" + esc(project.name) + "</span>" +
      '<span class="row__meta" style="display:block;margin-top:2px">' +
      esc(project.category) + " · " + esc(t("projects.owner", { name: owner ? owner.name : "—" })) +
      " · " + esc(t("projects.due", { date: fmt.dayMonth(project.dueAt) })) + "</span></span></div>" +
      ui.badge(t("projects.status." + project.status), ui.PROJECT_TONE[project.status]) +
      "</div>" +
      '<div class="cluster" style="gap:36px;margin-top:20px;flex-wrap:wrap">' +
      statChip(t("projects.progress"), project.progress + "%") +
      statChip(t("projects.members"), (project.memberIds || []).length) +
      statChip(t("projects.tasks"), done + " / " + tasks.length) +
      statChip(t("projects.health"), project.status === "at_risk" ? t("projects.status.at_risk") : t("projects.healthy"), project.status === "at_risk" ? "var(--rose-500)" : "#059669") +
      "</div>" +
      '<div style="margin-top:18px">' + ui.progress(project.progress, ui.PROGRESS_GRADIENT[project.status]) + "</div>" +
      "</div>"
    );
  }

  function statChip(label, value, color) {
    return (
      '<div><div class="text-label muted">' + esc(label) + "</div>" +
      '<div style="font-size:16px;font-weight:800;color:' + (color || "var(--text-strong)") + '">' + esc(String(value)) + "</div></div>"
    );
  }

  /* ── Overview tab ──────────────────────────────────────────── */

  function overviewTab() {
    var comments = projectComments().slice(0, 5);
    return (
      '<div class="grid grid--lg-2">' +
      '<div class="card">' +
      '<h2 class="card__title">' + esc(t("projects.overview")) + "</h2>" +
      '<p style="margin-top:14px;font-size:13px;line-height:1.6;color:var(--text-body)">' + esc(project.description) + "</p>" +
      '<h3 class="section-title" style="margin-top:18px">' + esc(t("projects.recentDiscussion")) + "</h3>" +
      (comments.length
        ? comments
            .map(function (c) {
              var author = data.memberById.get(c.authorId);
              return (
                '<div class="row">' + ui.avatar(author, 26) +
                '<span><span class="text-sm" style="color:var(--text-body)"><b>' + esc(author ? author.name : "—") +
                "</b> " + esc(c.text) + "</span>" +
                '<span class="text-label faint" style="display:block">' + esc(fmt.relative(c.createdAt)) + "</span></span></div>"
              );
            })
            .join("")
        : '<p class="muted text-sm" style="padding:12px 0">' + esc(t("state.empty")) + "</p>") +
      "</div>" +
      '<div class="stack">' +
      '<div class="card"><h2 class="card__title">' + esc(t("projects.files")) + "</h2>" +
      (projectFiles().length
        ? projectFiles()
            .slice(0, 4)
            .map(function (f) {
              return (
                '<div class="row"><span class="grow" style="display:flex;align-items:center;gap:10px">' +
                icon("file-pen", 14, { color: "var(--slate-400)" }) +
                '<span class="text-sm truncate" style="color:var(--text-body)">' + esc(f.title) + "</span></span>" +
                '<span class="text-label faint">' + esc(fmt.relative(f.updatedAt)) + "</span></div>"
              );
            })
            .join("")
        : '<p class="muted text-sm" style="padding:8px 0">' + esc(t("state.empty")) + "</p>") +
      "</div>" +
      '<div class="card"><h2 class="card__title">' + esc(t("projects.members")) + "</h2>" +
      (project.memberIds || [])
        .map(function (id) {
          var m = data.memberById.get(id);
          if (!m) return "";
          return (
            '<div class="row"><span class="grow" style="display:flex;align-items:center;gap:10px">' +
            ui.avatar(m, 26) + '<span class="text-sm" style="color:var(--text-body)">' + esc(m.name) + "</span></span>" +
            '<span class="text-label faint">' + esc(WOS.titleCase(m.role)) + "</span></div>"
          );
        })
        .join("") +
      "</div></div></div>"
    );
  }

  /* ── Kanban tab ────────────────────────────────────────────── */

  function kanbanTab(container) {
    container.innerHTML = '<div data-board-mount style="height:520px;display:flex;flex-direction:column"></div>';
    ui.kanbanBoard(WOS.$("[data-board-mount]", container), {
      tasks: projectTasks(),
      memberById: data.memberById,
      onMove: function (taskId, status) {
        WOS.db.update("tasks", taskId, { status: status, updatedAt: new Date().toISOString() }).then(refresh);
      },
      onCardClick: function (taskId) {
        var task = data.tasks.filter(function (t) {
          return t.id === taskId;
        })[0];
        ui.taskModal({ task: task, members: data.members, projects: data.projects, onSaved: refresh });
      },
      onAddClick: function (status) {
        ui.taskModal({
          members: data.members,
          projects: data.projects,
          defaults: { status: status, projectId: projectId, lockProject: true },
          onSaved: refresh,
        });
      },
    });
  }

  /* ── Timeline tab (milestones) ─────────────────────────────── */

  function timelineTab() {
    var list = projectMilestones();
    if (!list.length) return '<div class="card">' + ui.empty(t("milestones.empty"), null, null, "target") + "</div>";

    return (
      '<div class="card">' +
      list
        .map(function (m) {
          var owner = data.memberById.get(m.ownerId);
          return (
            '<div class="row" style="align-items:flex-start">' +
            (m.isMilestone ? icon("target", 16, { color: "var(--antar-purple)" }) : ui.avatar(owner, 26)) +
            '<span class="grow"><span class="row__title" style="display:block">' + esc(m.name) + "</span>" +
            '<span class="row__meta" style="display:block">' + esc(fmt.dayMonth(m.startAt)) + " – " + esc(fmt.dayMonth(m.endAt)) + "</span>" +
            '<span style="display:block;margin-top:6px;max-width:280px">' + ui.progress(m.progress, ui.PROGRESS_GRADIENT[m.status]) + "</span></span>" +
            '<span class="text-xs fw-bold" style="color:' + (m.status === "at_risk" ? "var(--rose-500)" : "var(--emerald-600)") + '">' +
            m.progress + "%</span></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  /* ── Files tab ─────────────────────────────────────────────── */

  function filesTab() {
    var list = projectFiles();
    if (!list.length) return '<div class="card">' + ui.empty(t("state.empty"), null, null, "file-pen") + "</div>";
    return (
      '<div class="card card--flush"><div class="stack stack--sm" style="padding:8px 16px">' +
      list
        .map(function (f) {
          return (
            '<a class="row" href="note.html?id=' + esc(f.noteId) + '">' +
            icon(f.icon || "file-pen", 16, { color: "var(--slate-400)" }) +
            '<span class="grow truncate text-sm" style="color:var(--text-body)">' + esc(f.title) + "</span>" +
            '<span class="text-label faint">' + esc(fmt.relative(f.updatedAt)) + "</span></a>"
          );
        })
        .join("") +
      "</div></div>"
    );
  }

  /* ── Meeting Notes tab ─────────────────────────────────────── */

  function meetingNotesTab() {
    var list = projectMeetings();
    if (!list.length) return '<div class="card">' + ui.empty(t("state.empty"), null, null, "message-square") + "</div>";
    return (
      '<div class="grid grid--md-2">' +
      list
        .map(function (m) {
          return (
            '<a class="card card-lift" href="meeting.html?id=' + esc(m.id) + '" style="display:block">' +
            '<div class="spread"><span class="row__title">' + esc(m.title) + "</span>" +
            ui.badge(t("meetings.status." + m.status), ui.MEETING_TONE[m.status]) + "</div>" +
            '<p class="text-label muted" style="margin-top:6px">' + esc(fmt.dayMonth(m.startAt)) + " · " + esc(fmt.duration(m.durationMin)) + "</p>" +
            "</a>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  /* ── Discussion tab ────────────────────────────────────────── */

  function discussionTab() {
    var list = projectComments();
    return (
      '<div class="card">' +
      '<form data-comment-form class="cluster cluster--nowrap" style="gap:10px">' +
      ui.avatar(WOS.shell.user(), 30) +
      '<input class="input grow" name="text" placeholder="' + esc(t("action.reply")) + '..." required>' +
      '<button type="submit" class="btn btn--primary btn--sm">' + esc(t("action.save")) + "</button></form>" +
      '<div style="margin-top:16px">' +
      (list.length
        ? list
            .map(function (c) {
              var author = data.memberById.get(c.authorId);
              return (
                '<div class="row" style="align-items:flex-start">' + ui.avatar(author, 28) +
                '<span><span class="text-sm" style="color:var(--text-body)"><b>' + esc(author ? author.name : "—") +
                "</b> " + esc(c.text) + "</span>" +
                '<span class="text-label faint" style="display:block">' + esc(fmt.relative(c.createdAt)) + "</span></span></div>"
              );
            })
            .join("")
        : '<p class="muted text-sm" style="padding:12px 0">' + esc(t("state.empty")) + "</p>") +
      "</div></div>"
    );
  }

  /* ── Activity tab ──────────────────────────────────────────── */

  function activityTab() {
    var events = [];
    projectComments().forEach(function (c) {
      var author = data.memberById.get(c.authorId);
      events.push({ at: c.createdAt, text: (author ? author.name : "—") + " commented: “" + c.text + "”" });
    });
    projectTasks().forEach(function (task) {
      events.push({ at: task.updatedAt, text: t(task.status === "done" ? "status.done" : "status." + task.status) + " — " + task.title });
    });
    events.sort(function (a, b) {
      return String(b.at || "").localeCompare(String(a.at || ""));
    });

    if (!events.length) return '<div class="card">' + ui.empty(t("state.empty"), null, null, "chart-line") + "</div>";

    return (
      '<div class="card">' +
      events
        .slice(0, 20)
        .map(function (e) {
          return (
            '<div class="timeline-list__item">' +
            '<div class="timeline-list__rail"><span class="timeline-list__dot"></span><span class="timeline-list__line"></span></div>' +
            '<div><p class="text-sm" style="color:var(--text-body)">' + esc(e.text) + "</p>" +
            '<p class="text-label faint">' + esc(fmt.relative(e.at)) + "</p></div></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  /* ── Settings tab ──────────────────────────────────────────── */

  function settingsTab() {
    return (
      '<div class="card" style="max-width:520px">' +
      '<form data-settings-form class="stack">' +
      '<div class="field"><label class="field__label">' + esc(t("projects.name")) + '</label>' +
      '<input class="input" name="name" value="' + esc(project.name) + '" required></div>' +
      '<div class="field"><label class="field__label">' + esc(t("projects.category")) + '</label>' +
      '<input class="input" name="category" value="' + esc(project.category) + '"></div>' +
      '<div class="grid grid--2">' +
      '<div class="field"><label class="field__label">' + esc(t("tasks.col.status")) + '</label>' +
      '<select class="select" name="status">' +
      ["on_track", "at_risk", "on_hold", "completed"]
        .map(function (s) {
          return '<option value="' + s + '"' + (project.status === s ? " selected" : "") + ">" + esc(t("projects.status." + s)) + "</option>";
        })
        .join("") + "</select></div>" +
      '<div class="field"><label class="field__label">' + esc(t("projects.progress")) + '</label>' +
      '<input class="input" type="number" min="0" max="100" name="progress" value="' + project.progress + '"></div></div>' +
      '<div class="field"><label class="field__label">' + esc(t("projects.due")).replace(" {date}", "") + '</label>' +
      '<input class="input" type="date" name="dueDate" value="' + esc(fmt.dateInputValue(project.dueAt)) + '"></div>' +
      '<div class="modal__actions" style="justify-content:space-between">' +
      '<button type="button" class="btn btn--danger" data-delete-project>' + esc(t("action.delete")) + "</button>" +
      '<button type="submit" class="btn btn--primary">' + esc(t("action.save")) + "</button>" +
      "</div></form></div>"
    );
  }

  /* ── Render ────────────────────────────────────────────────── */

  function render() {
    if (!project) {
      page.innerHTML = '<div class="card">' + ui.empty(t("projects.notFound"), null, '<a class="btn btn--outline" href="projects.html">' + esc(t("action.back")) + "</a>", "briefcase") + "</div>";
      return;
    }

    page.innerHTML =
      headerCard() +
      '<div class="tabs scroll-x" style="margin-top:22px">' +
      TABS.map(function (id) {
        return (
          '<button type="button" class="tab' + (state.tab === id ? " is-active" : "") +
          '" data-tab="' + id + '">' + esc(t("projects.tab." + id)) + "</button>"
        );
      }).join("") +
      "</div>" +
      '<div data-tab-body style="margin-top:20px"></div>';

    var body = WOS.$("[data-tab-body]", page);
    if (state.tab === "overview") body.innerHTML = overviewTab();
    else if (state.tab === "kanban") kanbanTab(body);
    else if (state.tab === "timeline") body.innerHTML = timelineTab();
    else if (state.tab === "files") body.innerHTML = filesTab();
    else if (state.tab === "meetingNotes") body.innerHTML = meetingNotesTab();
    else if (state.tab === "discussion") body.innerHTML = discussionTab();
    else if (state.tab === "activity") body.innerHTML = activityTab();
    else body.innerHTML = settingsTab();
  }

  /**
   * Bound once at boot. Every handler here is delegated on the persistent
   * `page` node, so it keeps working no matter how many times a tab switch
   * replaces `page.innerHTML` underneath it — re-binding on every render
   * would stack duplicate listeners and fire creates/updates multiple times
   * per click.
   */
  function bind() {
    WOS.on(page, "click", "[data-tab]", function (event, target) {
      state.tab = target.dataset.tab;
      render();
    });

    WOS.on(page, "submit", "[data-comment-form]", function (event, form) {
      event.preventDefault();
      var text = String(new FormData(form).get("text") || "").trim();
      if (!text) return;
      WOS.db
        .create("comments", {
          targetType: "project",
          targetId: projectId,
          authorId: WOS.config.currentUserId,
          text: text,
          createdAt: new Date().toISOString(),
        })
        .then(refresh);
    });

    WOS.on(page, "submit", "[data-settings-form]", function (event, form) {
      event.preventDefault();
      var formData = new FormData(form);
      WOS.db
        .update("projects", projectId, {
          name: String(formData.get("name") || "").trim() || project.name,
          category: formData.get("category") || "",
          status: formData.get("status"),
          progress: Math.max(0, Math.min(100, Number(formData.get("progress")) || 0)),
          dueAt: formData.get("dueDate") ? new Date(formData.get("dueDate") + "T17:00:00").toISOString() : null,
        })
        .then(function () {
          ui.toast(t("state.saved"));
          return refresh();
        });
    });

    WOS.on(page, "click", "[data-delete-project]", function () {
      WOS.db.remove("projects", projectId).then(function () {
        window.location.href = "projects.html";
      });
    });
  }

  function refresh() {
    return WOS.db
      .loadAll(["projects", "tasks", "comments"])
      .then(function (loaded) {
        data.projects = loaded.projects;
        data.tasks = loaded.tasks;
        data.comments = loaded.comments;
        project = data.projects.filter(function (p) {
          return p.id === projectId;
        })[0];
        return WOS.shell.refreshCounts();
      })
      .then(render);
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.db
    .get("projects", projectId)
    .then(function (found) {
      project = found;
      return WOS.shell.mount({
        active: "projects",
        crumbs: [{ label: t("projects.title"), href: "projects.html" }, { label: project ? project.name : t("projects.notFound") }],
      });
    })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(4, 120);
      return WOS.db.loadAll(["projects", "tasks", "members", "milestones", "notes", "meetings", "files", "comments"]);
    })
    .then(function (loaded) {
      data = loaded;
      data.memberById = WOS.indexById(loaded.members);
      project = data.projects.filter(function (p) {
        return p.id === projectId;
      })[0];
      render();
      bind();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
