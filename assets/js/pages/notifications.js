/* ──────────────────────────────────────────────────────────────
   Notifications — grouped by day, filterable by kind.
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
  var state = { filter: "all" };

  var FILTERS = [
    { id: "all", key: "notifications.filter.all" },
    { id: "mention", key: "notifications.filter.mentions" },
    { id: "approval", key: "notifications.filter.approvals" },
    { id: "task", key: "notifications.filter.tasks" },
    { id: "meeting", key: "notifications.filter.meetings" },
  ];

  var KIND_STYLE = {
    approval: { icon: "shield-user", bg: "#f5f3ff", color: "#7c3aed" },
    mention: { icon: "message-square", bg: "#f0f9ff", color: "#0284c7" },
    workflow: { icon: "rocket", bg: "#fff1f2", color: "#e11d48" },
    task: { icon: "file-pen", bg: "#fffbeb", color: "#d97706" },
    meeting: { icon: "clock", bg: "#f0f9ff", color: "#0284c7" },
  };

  function filtered() {
    var list = data.notifications.slice().sort(WOS.by("createdAt", "desc"));
    if (state.filter === "all") return list;
    return list.filter(function (n) {
      return n.kind === state.filter;
    });
  }

  function render() {
    var list = filtered();
    var groups = WOS.groupBy(list, function (n) {
      return fmt.dayGroup(n.createdAt);
    });

    page.innerHTML =
      '<div class="page__head">' +
      '<h1 class="page__title">' + esc(t("notifications.title")) + "</h1>" +
      '<button type="button" class="tap text-sm fw-semibold" data-mark-all>' + esc(t("action.markAllRead")) + "</button></div>" +
      '<div class="chips scroll-x" style="margin-top:16px">' +
      FILTERS.map(function (f) {
        return (
          '<button type="button" class="chip' + (state.filter === f.id ? " is-active" : "") +
          '" data-notif-filter="' + f.id + '">' + esc(t(f.key)) + "</button>"
        );
      }).join("") +
      "</div>" +
      (list.length
        ? Array.from(groups.keys())
            .map(function (label) {
              return (
                '<p class="eyebrow" style="margin-top:20px">' + esc(label) + "</p>" +
                '<div class="card card--flush" style="margin-top:10px">' +
                groups
                  .get(label)
                  .map(function (n) {
                    var style = KIND_STYLE[n.kind] || KIND_STYLE.task;
                    return (
                      '<a class="row" href="' + esc(n.href) + '" style="padding:14px 18px;align-items:flex-start' +
                      (!n.read ? ";background:#faf9ff" : "") + '" data-notif-row="' + esc(n.id) + '">' +
                      ui.iconTile(style.icon, style.bg, style.color) +
                      '<span class="grow"><span class="text-sm" style="color:var(--text-body)"><b class="strong">' +
                      esc(n.actorName) + "</b> " + esc(n.text) + "</span>" +
                      '<span class="text-label faint" style="display:block;margin-top:3px">' + esc(fmt.relative(n.createdAt)) + "</span></span>" +
                      (!n.read ? '<span class="unread-dot" style="margin-top:6px"></span>' : "") +
                      "</a>"
                    );
                  })
                  .join("") +
                "</div>"
              );
            })
            .join("")
        : '<div class="card" style="margin-top:20px">' + ui.empty(t("notifications.empty"), null, null, "bell") + "</div>");
  }

  function bind() {
    WOS.on(page, "click", "[data-notif-filter]", function (event, target) {
      state.filter = target.dataset.notifFilter;
      render();
    });

    WOS.on(page, "click", "[data-notif-row]", function (event, target) {
      var id = target.dataset.notifRow;
      var n = data.notifications.filter(function (row) {
        return row.id === id;
      })[0];
      if (n && !n.read) {
        WOS.db.update("notifications", id, { read: true });
      }
    });

    WOS.on(page, "click", "[data-mark-all]", function (event) {
      event.preventDefault();
      Promise.all(
        data.notifications
          .filter(function (n) {
            return !n.read;
          })
          .map(function (n) {
            return WOS.db.update("notifications", n.id, { read: true });
          }),
      ).then(function () {
        return WOS.db.list("notifications");
      }).then(function (rows) {
        data.notifications = rows;
        render();
      });
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "notifications", title: t("notifications.title") })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(4, 80);
      return WOS.db.list("notifications");
    })
    .then(function (rows) {
      data = { notifications: rows };
      render();
      bind();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
