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
    return (
      '<div class="card">' +
      '<div class="spread" style="align-items:flex-start">' +
      '<span><span class="row__title" style="display:block;font-size:14.5px">' + esc(approval.title) + "</span>" +
      '<span class="row__meta" style="display:block;margin-top:2px">' +
      esc(t("approvals.requestedBy", { name: requester ? requester.name : "—" })) + " · " + esc(fmt.relative(approval.requestedAt)) +
      "</span></span>" +
      '<span class="mono fw-bold strong" style="font-size:15px">' + esc(fmt.currency(approval.amount, approval.currency)) + "</span>" +
      "</div>" +
      (approval.description ? '<p class="text-sm" style="margin-top:10px;color:var(--text-body);line-height:1.6">' + esc(approval.description) + "</p>" : "") +
      '<div class="cluster" style="margin-top:14px">' +
      (approval.state === "pending"
        ? '<button type="button" class="btn btn--primary btn--sm" data-approve="' + esc(approval.id) + '">' + esc(t("action.approve")) + "</button>" +
          '<button type="button" class="btn btn--outline btn--sm" data-decline="' + esc(approval.id) + '">' + esc(t("action.decline")) + "</button>"
        : ui.badge(t("approvals." + approval.state), approval.state === "approved" ? "success" : "danger") +
          '<span class="text-label faint">' + esc(fmt.relative(approval.decidedAt)) + "</span>") +
      "</div></div>"
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
      '<h1 class="page__title">' + esc(t("approvals.title")) + "</h1>" +
      (html || '<div class="card" style="margin-top:18px">' + ui.empty(t("approvals.empty"), null, null, "shield-user") + "</div>");
  }

  function bind() {
    WOS.on(page, "click", "[data-approve], [data-decline]", function (event, target) {
      var id = target.dataset.approve || target.dataset.decline;
      var nextState = target.dataset.approve ? "approved" : "declined";
      WOS.db
        .update("approvals", id, { state: nextState, decidedAt: new Date().toISOString() })
        .then(function () {
          ui.toast(t("approvals." + nextState));
          return WOS.shell.refreshCounts();
        })
        .then(refresh);
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
    .mount({ active: "approvals", title: t("approvals.title") })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(3, 120);
      return WOS.db.loadAll(["approvals", "members"]);
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
