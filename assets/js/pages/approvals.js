/* ──────────────────────────────────────────────────────────────
   Approvals — requests waiting on (or already decided by) me,
   grouped by state.
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

  var GROUPS = [
    { state: "pending", key: "approvals.pending", tone: "warning" },
    { state: "approved", key: "approvals.approved", tone: "success" },
    { state: "declined", key: "approvals.declined", tone: "danger" },
  ];

  function card(approval) {
    var requester = data.memberById.get(approval.requesterId);
    var division = data.divisionById.get(approval.divisionId);
    var options = approval.options || [];
    var pending = approval.state === "pending";

    return (
      '<div class="card">' +
      '<div class="spread" style="align-items:flex-start;gap:12px">' +
      '<span style="min-width:0"><span class="row__title" style="display:block;font-size:14.5px">' + esc(approval.title) + "</span>" +
      '<span class="row__meta" style="display:block;margin-top:2px">' +
      esc(t("approvals.requestedBy", { name: requester ? requester.name : "—" })) +
      (division ? " · " + esc(division.name) : "") + " · " + esc(fmt.relative(approval.requestedAt)) +
      "</span></span>" +
      // A decision without a number is still a decision, so the slot shows the
      // kind instead of a fabricated amount.
      (approval.amount
        ? '<span class="mono fw-bold strong" style="font-size:15px;flex:none">' + esc(fmt.currency(approval.amount, approval.currency)) + "</span>"
        : ui.badge(t("decisions.kind.decision"), "brand")) +
      "</div>" +
      (approval.description ? '<p class="text-sm" style="margin-top:10px;color:var(--text-body);line-height:1.6">' + esc(approval.description) + "</p>" : "") +
      (approval.context
        ? '<div style="margin-top:12px;padding:12px 14px;background:var(--slate-50);border-radius:10px">' +
          '<p class="eyebrow">' + esc(t("decisions.context")) + "</p>" +
          '<p class="text-sm" style="margin-top:4px;color:var(--text-body);line-height:1.6">' + esc(approval.context) + "</p></div>"
        : "") +
      (options.length
        ? '<div style="margin-top:12px"><p class="eyebrow">' + esc(t("decisions.options")) + "</p>" +
          '<div class="stack stack--sm" style="margin-top:8px">' +
          options
            .map(function (opt, i) {
              return pending
                ? '<button type="button" class="btn-dashed" style="justify-content:flex-start;text-align:left" ' +
                    'data-pick-option="' + esc(approval.id) + '" data-option-index="' + i + '">' +
                    icon("check", 13) + esc(opt) + "</button>"
                : '<div class="text-sm" style="color:var(--text-body);padding:6px 0">• ' + esc(opt) + "</div>";
            })
            .join("") +
          "</div></div>"
        : "") +
      '<div class="cluster" style="margin-top:14px">' +
      (pending
        ? '<button type="button" class="btn btn--primary btn--sm" data-approve="' + esc(approval.id) + '">' + esc(t("action.approve")) + "</button>" +
          '<button type="button" class="btn btn--outline btn--sm" data-decline="' + esc(approval.id) + '">' + esc(t("action.decline")) + "</button>"
        : ui.badge(t("approvals." + approval.state), approval.state === "approved" ? "success" : "danger") +
          '<span class="text-label faint">' + esc(fmt.relative(approval.decidedAt)) + "</span>") +
      "</div>" +
      (!pending && approval.decisionNote
        ? '<p class="text-sm muted" style="margin-top:10px;padding-top:10px;border-top:1px solid var(--border-subtle)">' +
          esc(t("decisions.note")) + ": " + esc(approval.decisionNote) + "</p>"
        : "") +
      "</div>"
    );
  }

  function render() {
    var byState = WOS.groupBy(data.approvals, function (a) {
      return a.state;
    });

    var html = GROUPS.map(function (g) {
      var list = byState.get(g.state) || [];
      if (!list.length) return "";
      return (
        '<h2 class="section-title" style="margin-top:22px">' + esc(t(g.key)) + " (" + list.length + ")</h2>" +
        '<div class="stack">' + list.map(card).join("") + "</div>"
      );
    }).join("");

    page.innerHTML =
      '<div><h1 class="page__title">' + esc(t("decisions.title")) + "</h1>" +
      '<p class="page__subtitle">' + esc(t("decisions.subtitle")) + "</p></div>" +
      (html || '<div class="card" style="margin-top:18px">' + ui.empty(t("approvals.empty"), null, null, "shield-user") + "</div>");
  }

  function decide(id, nextState, note) {
    return WOS.db
      .update("approvals", id, {
        state: nextState,
        decidedAt: new Date().toISOString(),
        decisionNote: note || "",
      })
      .then(function () {
        ui.toast(t("approvals." + nextState));
        return WOS.shell.refreshCounts();
      })
      .then(refresh);
  }

  function bind() {
    WOS.on(page, "click", "[data-approve], [data-decline]", function (event, target) {
      var id = target.dataset.approve || target.dataset.decline;
      var nextState = target.dataset.approve ? "approved" : "declined";
      decide(id, nextState, "");
    });

    // Picking an option is itself the decision — record which one was chosen
    // so the note answers "what did we settle on", not just "yes".
    WOS.on(page, "click", "[data-pick-option]", function (event, target) {
      var id = target.dataset.pickOption;
      var approval = data.approvals.filter(function (row) {
        return row.id === id;
      })[0];
      if (!approval) return;
      var chosen = (approval.options || [])[Number(target.dataset.optionIndex)];
      if (!chosen) return;
      decide(id, "approved", chosen);
    });
  }

  function refresh() {
    return WOS.db.list("approvals").then(function (rows) {
      data.approvals = rows;
      render();
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "approvals", title: t("decisions.title") })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(3, 120);
      return WOS.db.loadAll(["approvals", "members", "divisions"]);
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
