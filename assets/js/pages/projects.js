/* ──────────────────────────────────────────────────────────────
   Projects — status-filtered grid of project cards.
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
  var statusFilter = "all";

  var STATUSES = ["on_track", "at_risk", "on_hold", "completed"];

  function filtered() {
    if (statusFilter === "all") return data.projects;
    return data.projects.filter(function (p) {
      return p.status === statusFilter;
    });
  }

  function card(project) {
    var members = (project.memberIds || [])
      .map(function (id) {
        return data.memberById.get(id);
      })
      .filter(Boolean);
    var owner = data.memberById.get(project.ownerId);

    return (
      '<a class="card card-lift" href="project.html?id=' + esc(project.id) +
      '" style="display:block;position:relative;overflow:hidden;padding-left:26px">' +
      '<span style="position:absolute;left:0;top:0;height:100%;width:5px;background:' +
      ui.PROGRESS_GRADIENT[project.status] + '"></span>' +
      '<div class="spread" style="align-items:flex-start">' +
      '<div class="cluster" style="gap:12px">' +
      ui.iconTile(project.icon, project.iconBg, project.iconColor) +
      '<span><span class="row__title" style="display:block;font-size:15px">' + esc(project.name) + "</span>" +
      '<span class="row__meta" style="display:block">' + esc(project.category) + "</span></span></div>" +
      ui.badge(t("projects.status." + project.status), ui.PROJECT_TONE[project.status]) +
      "</div>" +
      '<div class="spread" style="margin-top:16px;font-size:12px;color:var(--slate-500)">' +
      "<span>" + esc(t("projects.progress")) + "</span><span class=\"fw-bold strong\">" + project.progress + "%</span></div>" +
      '<div style="margin-top:6px">' + ui.progress(project.progress, ui.PROGRESS_GRADIENT[project.status]) + "</div>" +
      '<div class="spread" style="margin-top:18px;padding-top:16px;border-top:1px solid var(--border-subtle)">' +
      ui.avatarStack(members, 26, 4) +
      '<span style="text-align:right;font-size:11px;color:var(--slate-500)">' +
      "<span style=\"display:block\">" + esc(t("projects.owner", { name: owner ? owner.name : "—" })) + "</span>" +
      "<span style=\"display:block\">" + esc(t("projects.due", { date: fmt.dayMonth(project.dueAt) })) + "</span></span></div>" +
      "</a>"
    );
  }

  function render() {
    var list = filtered();
    var counts = {};
    STATUSES.forEach(function (s) {
      counts[s] = data.projects.filter(function (p) {
        return p.status === s;
      }).length;
    });

    var chips = [{ id: "all", label: t("projects.filter.all") + " (" + data.projects.length + ")" }].concat(
      STATUSES.map(function (s) {
        return { id: s, label: t("projects.status." + s) + " (" + counts[s] + ")" };
      }),
    );

    page.innerHTML =
      '<div class="page__head">' +
      '<h1 class="page__title">' + esc(t("projects.title")) + "</h1>" +
      '<button type="button" class="btn btn--primary btn--sm" data-new-project>' + icon("briefcase", 14, { color: "#fff" }) +
      esc(t("action.newProject")) + "</button></div>" +
      '<div class="chips scroll-x" style="margin-top:16px">' +
      chips
        .map(function (chip) {
          return (
            '<button type="button" class="chip' + (statusFilter === chip.id ? " is-active" : "") +
            '" data-status-chip="' + chip.id + '">' + esc(chip.label) + "</button>"
          );
        })
        .join("") +
      "</div>" +
      (list.length
        ? '<div class="grid grid--md-2" style="margin-top:22px">' + list.map(card).join("") + "</div>"
        : '<div class="card" style="margin-top:22px">' + ui.empty(t("state.empty"), null, null, "briefcase") + "</div>");
  }

  function bind() {
    WOS.on(page, "click", "[data-status-chip]", function (event, target) {
      statusFilter = target.dataset.statusChip;
      render();
    });

    WOS.on(page, "click", "[data-new-project]", openNewProjectModal);
  }

  function openNewProjectModal() {
    var body =
      '<form class="stack">' +
      '<div class="field"><label class="field__label">' + esc(t("projects.name")) + '</label>' +
      '<input class="input" name="name" required></div>' +
      '<div class="field"><label class="field__label">' + esc(t("projects.category")) + '</label>' +
      '<input class="input" name="category"></div>' +
      '<div class="grid grid--2">' +
      '<div class="field"><label class="field__label">' + esc(t("tasks.col.status")) + '</label>' +
      '<select class="select" name="status">' +
      STATUSES.map(function (s) {
        return '<option value="' + s + '">' + esc(t("projects.status." + s)) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="field"><label class="field__label">' + esc(t("projects.due")).replace(" {date}", "") + '</label>' +
      '<input class="input" type="date" name="dueDate"></div></div>' +
      '<div class="field"><label class="field__label">' + esc(t("projects.owner", { name: "" }).replace(/:\s*$/, "")) + "</label>" +
      '<select class="select" name="ownerId">' +
      data.members.map(function (m) {
        return '<option value="' + esc(m.id) + '"' + (m.id === WOS.config.currentUserId ? " selected" : "") + ">" + esc(m.name) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="modal__actions">' +
      '<button type="button" class="btn btn--ghost" data-close-modal>' + esc(t("action.cancel")) + "</button>" +
      '<button type="submit" class="btn btn--primary">' + esc(t("action.save")) + "</button>" +
      "</div></form>";

    ui.modal({
      title: t("projects.newProject"),
      body: body,
      onSubmit: function (form) {
        var formData = new FormData(form);
        var name = String(formData.get("name") || "").trim();
        if (!name) return;

        WOS.db
          .create("projects", {
            name: name,
            category: formData.get("category") || "",
            status: formData.get("status"),
            progress: 0,
            ownerId: formData.get("ownerId"),
            memberIds: [formData.get("ownerId")],
            dueAt: formData.get("dueDate") ? new Date(formData.get("dueDate") + "T17:00:00").toISOString() : null,
            icon: "briefcase",
            iconBg: "var(--antar-purple-light)",
            iconColor: "var(--antar-purple)",
            createdAt: new Date().toISOString(),
          })
          .then(function () {
            ui.closeModal();
            return refresh();
          });
      },
    });
  }

  function refresh() {
    return WOS.db.list("projects").then(function (rows) {
      data.projects = rows;
      render();
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "projects", title: t("projects.title") })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(4, 220);
      return WOS.db.loadAll(["projects", "members"]);
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
