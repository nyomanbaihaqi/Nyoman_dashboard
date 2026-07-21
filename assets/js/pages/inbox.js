/* ──────────────────────────────────────────────────────────────
   Inbox — split thread list / detail, with inline approve/decline
   for threads carrying an approval.
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
  var state = { filter: "all", selectedId: "" };

  var FILTERS = [
    { id: "all", key: "inbox.filter.all" },
    { id: "approval", key: "inbox.filter.approvals" },
    { id: "mention", key: "inbox.filter.mentions" },
    { id: "task", key: "inbox.filter.tasks" },
  ];

  function filteredThreads() {
    var list = data.threads.slice().sort(WOS.by("receivedAt", "desc"));
    if (state.filter === "all") return list;
    return list.filter(function (th) {
      return th.kind === state.filter;
    });
  }

  function selectedThread() {
    return data.threads.filter(function (th) {
      return th.id === state.selectedId;
    })[0];
  }

  function threadRow(th) {
    return (
      '<button type="button" class="thread' + (th.id === state.selectedId ? " is-selected" : "") + (!th.read ? " is-unread" : "") +
      '" data-select-thread="' + esc(th.id) + '">' +
      '<div class="spread"><span class="thread__from">' + esc(th.fromName) + "</span>" +
      '<span class="thread__time">' + esc(fmt.relative(th.receivedAt)) + "</span></div>" +
      '<div class="thread__subject">' + esc(th.subject) + "</div>" +
      '<div class="thread__preview">' + esc(th.preview) + "</div>" +
      "</button>"
    );
  }

  function detailView() {
    var th = selectedThread();
    if (!th) {
      return '<div class="split__detail">' + ui.empty(t("inbox.selectThread"), null, null, "message-square") + "</div>";
    }

    var sender = data.memberById.get(th.fromId);
    var approval = th.approvalId ? data.approvalById.get(th.approvalId) : null;

    return (
      '<div class="split__detail">' +
      '<h1 class="page__title" style="font-size:20px">' + esc(th.subject) + "</h1>" +
      '<div class="cluster" style="margin-top:14px">' +
      ui.avatar(sender, 32) +
      '<span><span class="text-sm fw-bold strong" style="display:block">' + esc(th.fromName) + "</span>" +
      '<span class="text-label muted" style="display:block">' + esc(t("inbox.to")) + " · " + esc(fmt.fullDate(th.receivedAt)) + ", " + esc(fmt.time(th.receivedAt)) + "</span></span></div>" +
      '<p class="text-sm" style="margin-top:18px;line-height:1.7;color:var(--text-body)">' + esc(th.body) + "</p>" +
      (th.attachments && th.attachments.length
        ? th.attachments
            .map(function (att) {
              return (
                '<div class="card" style="margin-top:16px"><div class="cluster">' +
                icon("file-pen", 18, { color: "var(--slate-400)" }) +
                '<span><span class="text-sm fw-semibold strong" style="display:block">' + esc(att.name) + "</span>" +
                '<span class="text-label muted">' + esc(fmt.bytes(att.size)) + "</span></span></div></div>"
              );
            })
            .join("")
        : "") +
      '<div class="cluster" style="margin-top:22px">' +
      (approval && approval.state === "pending"
        ? '<button type="button" class="btn btn--primary" data-approve="' + esc(approval.id) + '">' + esc(t("action.approve")) + "</button>" +
          '<button type="button" class="btn btn--outline" data-decline="' + esc(approval.id) + '">' + esc(t("action.decline")) + "</button>"
        : approval
          ? ui.badge(t("approvals." + approval.state), approval.state === "approved" ? "success" : "danger")
          : "") +
      '<button type="button" class="btn btn--ghost" data-reply>' + esc(t("action.reply")) + "</button>" +
      "</div></div>"
    );
  }

  function render() {
    var list = filteredThreads();

    page.innerHTML =
      '<div class="split__list">' +
      '<div class="cluster" style="padding:14px 16px">' +
      FILTERS.map(function (f) {
        return (
          '<button type="button" class="chip' + (state.filter === f.id ? " is-active" : "") +
          '" data-inbox-filter="' + f.id + '">' + esc(t(f.key)) + "</button>"
        );
      }).join("") +
      "</div>" +
      (list.length ? list.map(threadRow).join("") : '<div style="padding:20px">' + ui.emptyInline(t("inbox.empty"), "message-square") + "</div>") +
      "</div>" +
      detailView();
  }

  function bind() {
    WOS.on(page, "click", "[data-inbox-filter]", function (event, target) {
      state.filter = target.dataset.inboxFilter;
      render();
    });

    WOS.on(page, "click", "[data-select-thread]", function (event, target) {
      var id = target.dataset.selectThread;
      state.selectedId = id;
      var th = selectedThread();
      if (th && !th.read) {
        WOS.db.update("threads", id, { read: true }).then(function () {
          return WOS.shell.refreshCounts();
        }).then(function () {
          return WOS.db.list("threads");
        }).then(function (rows) {
          data.threads = rows;
          render();
        });
      } else {
        render();
      }
    });

    WOS.on(page, "click", "[data-approve], [data-decline]", function (event, target) {
      var approvalId = target.dataset.approve || target.dataset.decline;
      var nextState = target.dataset.approve ? "approved" : "declined";
      WOS.db
        .update("approvals", approvalId, { state: nextState, decidedAt: new Date().toISOString() })
        .then(function () {
          ui.toast(t("approvals.done", { title: "", state: t("approvals." + nextState) }).trim());
          return WOS.db.list("approvals");
        })
        .then(function (rows) {
          data.approvals = rows;
          data.approvalById = WOS.indexById(rows);
          return WOS.shell.refreshCounts();
        })
        .then(render);
    });

    WOS.on(page, "click", "[data-reply]", function () {
      ui.toast(t("mi.aiPending"));
    });
  }

  function refresh() {
    return WOS.db.loadAll(["threads", "approvals"]).then(function (loaded) {
      data.threads = loaded.threads;
      data.approvals = loaded.approvals;
      data.approvalById = WOS.indexById(loaded.approvals);
      render();
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "inbox", title: t("inbox.title"), fill: true })
    .then(function (main) {
      page = main;
      // .page--fill sets flex-direction:column; .split needs a row, and its
      // own rule doesn't declare flex-direction, so cascade order alone
      // would leave column in effect. An inline override wins outright.
      page.className += " split";
      page.style.flexDirection = "row";
      page.innerHTML = WOS.ui.skeletonRows(4, 90);
      return WOS.db.loadAll(["threads", "members", "approvals"]);
    })
    .then(function (loaded) {
      data = loaded;
      data.memberById = WOS.indexById(loaded.members);
      data.approvalById = WOS.indexById(loaded.approvals);
      var sorted = data.threads.slice().sort(WOS.by("receivedAt", "desc"));
      if (sorted.length) state.selectedId = sorted[0].id;
      render();
      bind();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
