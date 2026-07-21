/* ──────────────────────────────────────────────────────────────
   Automations — workflow list with an enable/pause toggle, plus
   recent execution logs. Nothing actually runs these workflows
   (there's no scheduler here); the toggle and log just reflect state.
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

  var STATE_TONE = { active: "success", paused: "neutral", failed: "danger" };

  function render() {
    var logs = data.workflowRuns.slice().sort(WOS.by("ranAt", "desc")).slice(0, 8);

    page.innerHTML =
      '<div class="page__head">' +
      '<div><h1 class="page__title">' + esc(t("automations.title")) + "</h1>" +
      '<p class="page__subtitle">' + esc(t("automations.subtitle")) + "</p></div>" +
      '<button type="button" class="btn btn--primary btn--sm" data-new-workflow>' + icon("rocket", 14, { color: "#fff" }) + esc(t("action.newWorkflow")) + "</button></div>" +
      '<div class="stack" style="margin-top:20px">' +
      data.workflows.map(workflowRow).join("") +
      "</div>" +
      '<div class="card" style="margin-top:24px">' +
      '<h2 class="card__title">' + esc(t("automations.recentLogs")) + "</h2>" +
      (logs.length
        ? logs
            .map(function (log) {
              return (
                '<div class="row"><span style="width:8px;height:8px;border-radius:50%;flex:none;background:' +
                (log.result === "success" ? "#10b981" : "#e11d48") + '"></span>' +
                '<span class="grow text-sm" style="color:var(--text-body)">' + esc(log.workflowName) + "</span>" +
                '<span class="text-label muted" style="width:70px">' + esc(t("automations.result." + log.result)) + "</span>" +
                '<span class="text-label faint" style="width:90px;text-align:right">' + esc(fmt.relative(log.ranAt)) + "</span></div>"
              );
            })
            .join("")
        : '<p class="muted text-sm" style="padding:12px 0">' + esc(t("state.empty")) + "</p>") +
      "</div>";
  }

  function workflowRow(w) {
    return (
      '<div class="card"><div class="cluster cluster--nowrap" style="gap:18px">' +
      ui.iconTile(w.icon, w.iconBg, w.iconColor, "lg") +
      '<span class="grow" style="min-width:0"><span class="row__title" style="display:block;font-size:14px">' + esc(w.name) + "</span>" +
      '<span class="row__meta" style="display:block;margin-top:2px">' +
      esc(t("automations.trigger", { trigger: w.trigger, time: w.lastRunAt ? fmt.relative(w.lastRunAt) : "—" })) + "</span></span>" +
      '<span style="text-align:right;flex:none"><span class="text-label muted" style="display:block">' + esc(t("automations.executions")) + "</span>" +
      '<span class="text-sm fw-bold strong" style="display:block">' + w.executions + "</span></span>" +
      ui.badge(t("automations.state." + w.state), STATE_TONE[w.state]) +
      ui.toggle(w.enabled, w.name, { "workflow-toggle": w.id }) +
      "</div></div>"
    );
  }

  function bind() {
    WOS.on(page, "click", "[data-workflow-toggle]", function (event, target) {
      var id = target.dataset.workflowToggle;
      var workflow = data.workflows.filter(function (w) {
        return w.id === id;
      })[0];
      if (!workflow) return;
      var nextEnabled = !workflow.enabled;
      WOS.db
        .update("workflows", id, { enabled: nextEnabled, state: nextEnabled ? "active" : "paused" })
        .then(function () {
          ui.toast(t(nextEnabled ? "automations.enabled" : "automations.disabled", { name: workflow.name }));
          return refresh();
        });
    });

    WOS.on(page, "click", "[data-new-workflow]", function () {
      var body =
        '<form class="stack">' +
        '<div class="field"><label class="field__label">' + esc(t("automations.title")) + '</label>' +
        '<input class="input" name="name" required></div>' +
        '<div class="field"><label class="field__label">Trigger</label>' +
        '<input class="input" name="trigger" placeholder="Every day 08:00"></div>' +
        '<div class="modal__actions">' +
        '<button type="button" class="btn btn--ghost" data-close-modal>' + esc(t("action.cancel")) + "</button>" +
        '<button type="submit" class="btn btn--primary">' + esc(t("action.save")) + "</button></div></form>";

      ui.modal({
        title: t("action.newWorkflow"),
        body: body,
        onSubmit: function (form) {
          var formData = new FormData(form);
          var name = String(formData.get("name") || "").trim();
          if (!name) return;
          WOS.db
            .create("workflows", {
              name: name,
              trigger: formData.get("trigger") || "Manual",
              enabled: false,
              state: "paused",
              executions: 0,
              lastRunAt: null,
              icon: "rocket",
              iconBg: "var(--antar-purple-light)",
              iconColor: "var(--antar-purple)",
            })
            .then(function () {
              ui.closeModal();
              return refresh();
            });
        },
      });
    });
  }

  function refresh() {
    return WOS.db.list("workflows").then(function (rows) {
      data.workflows = rows;
      render();
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "automations", title: t("automations.title") })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(4, 90);
      return WOS.db.loadAll(["workflows", "workflowRuns"]);
    })
    .then(function (loaded) {
      data = loaded;
      render();
      bind();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
