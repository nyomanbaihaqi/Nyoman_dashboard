/* ──────────────────────────────────────────────────────────────
   Workspace OS — application shell

   Injects the navigation rail, mobile drawer, top bar, bottom tab
   bar, and command palette into every page, so the 18 HTML files
   only contain their own content.

   A page calls:
     WOS.shell.mount({ active, title, crumbs, actions })
   and receives the <main> element to render into.
   ────────────────────────────────────────────────────────────── */

(function (WOS) {
  "use strict";

  var esc = WOS.esc;
  var icon = WOS.icon;
  var t = function () {
    return WOS.i18n.t.apply(null, arguments);
  };

  /* ── Navigation model ──────────────────────────────────────── */

  var TOP_LINKS = [
    { href: "index.html", key: "nav.home", icon: "grid", id: "home" },
    { href: "brief.html", key: "brief.title", icon: "message-square", id: "brief" },
  ];

  /* Grouped in the order the role handbook prioritises them: the PA keeps the
     CEO's day intact, the PM keeps execution moving, the AI Engineer improves
     the system. Nav order follows that, not feature count. */
  var GROUPS = [
    {
      key: "nav.group.personalAssistant",
      items: [
        // First in the group: the handbook's first duty is keeping the CEO's
        // day unblocked, and this is the screen that does it.
        { href: "ceo.html", key: "ceo.title", icon: "crown", id: "ceo", badge: "approvals" },
        { href: "calendar.html", key: "nav.calendar", icon: "clock", id: "calendar" },
        { href: "tasks.html", key: "nav.myTasks", icon: "file-pen", id: "tasks", badge: "tasks" },
        { href: "notes.html", key: "nav.notes", icon: "layers", id: "notes" },
        { href: "templates.html", key: "templates.title", icon: "lightbulb", id: "templates" },
        // Reminders and Decisions both folded into CEO Assistant: nothing ever
        // created a notification, and Decisions showed the same approvals from
        // the requester's end. The pending count moved onto CEO Assistant with
        // them, so the badge still sits next to where the work is done.
      ],
    },
    {
      key: "nav.group.projectManager",
      items: [
        { href: "weekly.html", key: "weekly.title", icon: "chart-line", id: "weekly" },
        { href: "projects.html", key: "nav.projects", icon: "briefcase", id: "projects" },
        { href: "timeline.html", key: "nav.timeline", icon: "chart-line", id: "timeline" },
        { href: "issues.html", key: "nav.issues", icon: "crosshair", id: "issues" },
      ],
    },
    // The AI Engineer group is gone: Prompt Library held prompts for an AI
    // that isn't wired up, Documents duplicated Notes, and Automations was a
    // control panel for a scheduler that doesn't exist. Templates moved to
    // Personal Assistant, where the person sending the invitations sits.
  ];

  var BOTTOM_LINKS = [
    { href: "settings.html", key: "nav.settings", icon: "settings", id: "settings" },
    { href: "help.html", key: "nav.help", icon: "message-square", id: "help" },
  ];

  /** Four primary destinations on the phone tab bar; "More" opens the drawer. */
  var TABS = [
    { href: "index.html", key: "nav.home", icon: "grid", id: "home" },
    { href: "brief.html", key: "brief.title", icon: "message-square", id: "brief" },
    { href: "calendar.html", key: "nav.calendar", icon: "clock", id: "calendar" },
    { href: "tasks.html", key: "nav.myTasks", icon: "file-pen", id: "tasks", badge: "tasks" },
  ];

  var state = { user: null, counts: { tasks: 0, approvals: 0 }, active: "", searchIndex: null };

  /* ── Markup ────────────────────────────────────────────────── */

  function navLink(item, size) {
    var count = item.badge ? state.counts[item.badge] : 0;
    return (
      '<a class="nav-link' + (size === "lg" ? " nav-link--lg" : "") +
      (state.active === item.id ? " is-active" : "") + '" href="' + item.href + '"' +
      (state.active === item.id ? ' aria-current="page"' : "") + ">" +
      '<span class="nav-link__icon">' + icon(item.icon, size === "lg" ? 17 : 16) + "</span>" +
      '<span class="nav-link__label">' + esc(t(item.key)) + "</span>" +
      (count > 0 ? '<span class="nav-link__count">' + count + "</span>" : "") +
      "</a>"
    );
  }

  function sidebarMarkup(extraClass) {
    var user = state.user;

    var html =
      '<aside class="sidebar ' + (extraClass || "") + '">' +
      '<div class="sidebar__brand">' +
      '<span class="sidebar__logo">' + icon("rocket", 18) + "</span>" +
      "<div style=\"min-width:0\">" +
      '<div class="sidebar__name truncate">Workspace OS</div>' +
      '<div class="sidebar__workspace truncate">' + esc(t("nav.workspace")) + "</div>" +
      "</div></div>" +
      '<nav class="sidebar__nav scroll-y" aria-label="' + esc(t("nav.menu")) + '">';

    TOP_LINKS.forEach(function (item) {
      html += navLink(item, "lg");
    });

    GROUPS.forEach(function (group) {
      html += '<div class="sidebar__group-label">' + esc(t(group.key)) + "</div>";
      group.items.forEach(function (item) {
        html += navLink(item);
      });
    });

    html += "</nav>" + '<div class="sidebar__footer">';
    BOTTOM_LINKS.forEach(function (item) {
      html += navLink(item);
    });
    html += "</div>";

    html +=
      '<a class="sidebar__user" href="settings.html">' +
      '<span class="cluster cluster--nowrap" style="min-width:0">' +
      WOS.ui.avatar(user, 34) +
      '<span style="min-width:0">' +
      '<span class="sidebar__user-name truncate" style="display:block">' + esc(user ? user.name : "") + "</span>" +
      '<span class="sidebar__user-role truncate" style="display:block">' + esc(user ? user.title : "") + "</span>" +
      "</span></span>" +
      icon("chevron-down", 13, { color: "var(--slate-500)" }) +
      "</a></aside>";

    return html;
  }

  function topbarMarkup(options) {
    var user = state.user;

    var lead = "";
    if (options.crumbs && options.crumbs.length) {
      lead = '<nav class="crumbs" aria-label="Breadcrumb">';
      options.crumbs.forEach(function (crumb, index) {
        var last = index === options.crumbs.length - 1;
        if (index > 0) lead += '<span class="crumbs__sep">' + icon("chevron-right", 12) + "</span>";
        if (crumb.href && !last) {
          lead += '<a class="crumbs__item" href="' + esc(crumb.href) + '">' + esc(crumb.label) + "</a>";
        } else {
          lead +=
            '<span class="crumbs__item' + (last ? " crumbs__item--current" : "") + '">' +
            esc(crumb.label) + "</span>";
        }
      });
      lead += "</nav>";
    } else if (options.title) {
      lead = '<h1 class="topbar__title">' + esc(options.title) + "</h1>";
    }

    return (
      '<header class="topbar">' +
      '<button type="button" class="topbar__menu" data-open-drawer aria-label="' + esc(t("nav.menu")) + '">' +
      icon("ellipsis", 20) + "</button>" +
      lead +
      '<button type="button" class="topbar__search" data-open-search>' +
      icon("search", 15, { color: "var(--slate-400)" }) +
      '<span class="topbar__search-text">' + esc(t("search.placeholder")) + "</span>" +
      '<span class="kbd">⌘K</span></button>' +
      '<span class="topbar__spacer"></span>' +
      '<span class="topbar__actions">' + (options.actions || "") + "</span>" +
      '<button type="button" class="icon-btn topbar__search-icon-only" data-open-search aria-label="' +
      esc(t("action.search")) + '">' + icon("search", 16) + "</button>" +
      // The bell went with Reminders. It was also counting unread Inbox threads
      // while linking to Notifications — two different things — so the number it
      // showed never matched the page it opened.
      '<a class="topbar__profile" href="settings.html">' +
      WOS.ui.avatar(user, 32) +
      '<span class="topbar__profile-text">' +
      '<span class="topbar__profile-name">' + esc(user ? user.name : "") + "</span>" +
      '<span class="topbar__profile-role">' + esc(user ? user.title : "") + "</span>" +
      "</span></a></header>"
    );
  }

  function bottomNavMarkup() {
    var html = '<nav class="bottom-nav" aria-label="' + esc(t("nav.menu")) + '">';

    TABS.forEach(function (item) {
      var count = item.badge ? state.counts[item.badge] : 0;
      html +=
        '<a class="bottom-nav__item' + (state.active === item.id ? " is-active" : "") +
        '" href="' + item.href + '"' + (state.active === item.id ? ' aria-current="page"' : "") + ">" +
        '<span class="bottom-nav__icon">' + icon(item.icon, 20) +
        (count > 0 ? '<span class="dot-badge">' + (count > 99 ? "99+" : count) + "</span>" : "") +
        "</span>" +
        '<span class="bottom-nav__label">' + esc(t(item.key)) + "</span></a>";
    });

    html +=
      '<button type="button" class="bottom-nav__item" data-open-drawer>' +
      '<span class="bottom-nav__icon">' + icon("ellipsis", 20) + "</span>" +
      '<span class="bottom-nav__label">' + esc(t("nav.more")) + "</span></button></nav>";

    return html;
  }

  /* ── Drawer ────────────────────────────────────────────────── */

  var lastFocused = null;

  function openDrawer() {
    lastFocused = document.activeElement;
    document.body.classList.add("drawer-open");
    var panel = document.querySelector(".drawer");
    if (panel) panel.focus();
    document.addEventListener("keydown", drawerKeyHandler);
  }

  function closeDrawer() {
    document.body.classList.remove("drawer-open");
    document.removeEventListener("keydown", drawerKeyHandler);
    if (lastFocused) lastFocused.focus();
  }

  function drawerKeyHandler(event) {
    if (event.key === "Escape") closeDrawer();
  }

  /* ── Command palette ───────────────────────────────────────── */

  var QUICK_ACTIONS = [
    { key: "search.action.newTask", icon: "file-pen", shortcut: "N T", href: "tasks.html?new=1" },
    { key: "search.action.newProject", icon: "briefcase", shortcut: "N P", href: "projects.html?new=1" },
    { key: "search.action.scheduleMeeting", icon: "clock", shortcut: "N M", href: "calendar.html?new=1" },
    { key: "search.action.askAi", icon: "bot", shortcut: "⌘J", href: "meeting-intelligence.html" },
  ];

  /** Build the searchable index once, lazily, on first palette open. */
  function buildIndex() {
    if (state.searchIndex) return Promise.resolve(state.searchIndex);

    return WOS.db
      .loadAll(["tasks", "projects", "notes", "meetings", "events"])
      .then(function (data) {
        var entries = [];

        data.tasks.forEach(function (row) {
          entries.push({ id: "task:" + row.id, title: row.title, href: "tasks.html?task=" + row.id, icon: "file-pen", type: "search.type.task", at: row.updatedAt });
        });
        data.projects.forEach(function (row) {
          entries.push({ id: "project:" + row.id, title: row.name, href: "project.html?id=" + row.id, icon: "briefcase", type: "search.type.project", at: row.createdAt });
        });
        data.notes.forEach(function (row) {
          entries.push({ id: "note:" + row.id, title: row.title, href: "note.html?id=" + row.id, icon: "layers", type: "search.type.note", at: row.updatedAt });
        });
        data.meetings.forEach(function (row) {
          entries.push({ id: "meeting:" + row.id, title: row.title, href: "meeting.html?id=" + row.id, icon: "message-square", type: "search.type.meeting", at: row.startAt });
        });
        data.events.forEach(function (row) {
          entries.push({ id: "event:" + row.id, title: row.title, href: "calendar.html?event=" + row.id, icon: "clock", type: "search.type.event", at: row.startAt });
        });

        state.searchIndex = entries;
        return entries;
      });
  }

  var palette = { open: false, cursor: 0, rows: [] };

  function openSearch() {
    if (palette.open) return;
    palette.open = true;

    var backdrop = document.createElement("div");
    backdrop.className = "palette-backdrop";
    backdrop.innerHTML =
      '<div class="palette" role="dialog" aria-modal="true" aria-label="' + esc(t("action.search")) + '">' +
      '<div class="palette__input-row">' + icon("search", 18) +
      '<input class="palette__input" type="text" autocomplete="off" placeholder="' +
      esc(t("search.commandPlaceholder")) + '" aria-label="' + esc(t("search.commandPlaceholder")) + '">' +
      '<button type="button" class="kbd" data-close-search>esc</button></div>' +
      '<div class="palette__body" data-palette-body></div>' +
      '<div class="palette__footer"><span>' + esc(t("search.hint.navigate")) + "</span><span>" +
      esc(t("search.hint.select")) + "</span><span>" + esc(t("search.hint.toggle")) + "</span></div></div>";

    document.body.appendChild(backdrop);
    document.body.style.overflow = "hidden";

    var input = backdrop.querySelector(".palette__input");
    var body = backdrop.querySelector("[data-palette-body]");

    backdrop.addEventListener("mousedown", function (event) {
      if (event.target === backdrop) closeSearch();
    });
    backdrop.querySelector("[data-close-search]").addEventListener("click", closeSearch);

    buildIndex().then(function () {
      renderPalette(body, "");
    });

    input.addEventListener("input", function () {
      palette.cursor = 0;
      renderPalette(body, input.value);
    });

    input.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        event.preventDefault();
        closeSearch();
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        palette.cursor = Math.min(palette.cursor + 1, palette.rows.length - 1);
        renderPalette(body, input.value);
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        palette.cursor = Math.max(palette.cursor - 1, 0);
        renderPalette(body, input.value);
      } else if (event.key === "Enter") {
        event.preventDefault();
        var row = palette.rows[palette.cursor];
        if (row) window.location.href = row.href;
      }
    });

    WOS.on(body, "click", "[data-href]", function (event, target) {
      window.location.href = target.dataset.href;
    });

    input.focus();
  }

  function closeSearch() {
    var backdrop = document.querySelector(".palette-backdrop");
    if (backdrop) backdrop.remove();
    document.body.style.overflow = "";
    palette.open = false;
    palette.cursor = 0;
  }

  function renderPalette(body, query) {
    var q = query.trim().toLowerCase();
    var showActions = q === "";
    var entries = state.searchIndex || [];

    var results;
    if (showActions) {
      results = entries
        .slice()
        .sort(function (a, b) {
          return String(b.at || "").localeCompare(String(a.at || ""));
        })
        .slice(0, 5);
    } else {
      results = entries
        .map(function (entry) {
          var pos = String(entry.title || "").toLowerCase().indexOf(q);
          return { entry: entry, score: pos };
        })
        .filter(function (item) {
          return item.score >= 0;
        })
        .sort(function (a, b) {
          return a.score - b.score || a.entry.title.localeCompare(b.entry.title);
        })
        .slice(0, 20)
        .map(function (item) {
          return item.entry;
        });
    }

    palette.rows = (showActions ? QUICK_ACTIONS : []).concat(results);

    var html = "";
    var index = 0;

    if (showActions) {
      html += '<p class="palette__section">' + esc(t("search.quickActions")) + "</p>";
      QUICK_ACTIONS.forEach(function (action) {
        html +=
          '<button type="button" class="palette__item' + (index === palette.cursor ? " is-active" : "") +
          '" data-href="' + action.href + '">' +
          icon(action.icon, 16, { color: "var(--antar-purple)" }) +
          '<span class="palette__item-label">' + esc(t(action.key)) + "</span>" +
          '<span class="palette__item-type">' + esc(action.shortcut) + "</span></button>";
        index++;
      });
    }

    if (results.length) {
      html +=
        '<p class="palette__section">' +
        esc(showActions ? t("search.recent") : t("search.results")) + "</p>";
      results.forEach(function (entry) {
        html +=
          '<button type="button" class="palette__item' + (index === palette.cursor ? " is-active" : "") +
          '" data-href="' + esc(entry.href) + '">' +
          icon(entry.icon, 16, { color: "var(--slate-400)" }) +
          '<span class="palette__item-label">' + esc(entry.title) + "</span>" +
          '<span class="palette__item-type">' + esc(t(entry.type)) + "</span></button>";
        index++;
      });
    } else if (!showActions) {
      html +=
        '<p style="padding:40px 18px;text-align:center;color:var(--slate-500)">' +
        esc(t("search.noResults", { query: query.trim() })) + "</p>";
    }

    body.innerHTML = html;

    var active = body.querySelector(".palette__item.is-active");
    if (active) active.scrollIntoView({ block: "nearest" });
  }

  /* ── Mount ─────────────────────────────────────────────────── */

  /**
   * Render the shell and return the <main> element for page content.
   *
   * @param {object} options
   *   active  — nav id to highlight
   *   title   — page name for the top bar
   *   crumbs  — [{label, href}] instead of a title
   *   actions — HTML for page-specific top-bar buttons
   *   fill    — true for pages that manage their own scrolling
   * @returns {Promise<HTMLElement>}
   */
  function mount(options) {
    options = options || {};
    state.active = options.active || "";

    WOS.i18n.init();

    return Promise.all([WOS.db.currentUser(), WOS.db.navCounts()]).then(function (results) {
      state.user = results[0];
      state.counts = results[1];

      var root = document.getElementById("app") || document.body;

      root.innerHTML =
        '<div class="app">' +
        sidebarMarkup("sidebar--rail") +
        '<div class="app__main">' +
        topbarMarkup(options) +
        '<main class="page' + (options.fill ? " page--fill" : "") + '" id="page"></main>' +
        "</div></div>" +
        '<div class="drawer-backdrop" data-close-drawer></div>' +
        '<div class="drawer" tabindex="-1" role="dialog" aria-modal="true" aria-label="' +
        esc(t("nav.menu")) + '">' +
        '<button type="button" class="drawer__close" data-close-drawer aria-label="' +
        esc(t("action.close")) + '">' + icon("x", 18) + "</button>" +
        sidebarMarkup() +
        "</div>" +
        bottomNavMarkup();

      WOS.$$("[data-open-drawer]").forEach(function (button) {
        button.addEventListener("click", openDrawer);
      });
      WOS.$$("[data-close-drawer]").forEach(function (button) {
        button.addEventListener("click", closeDrawer);
      });
      WOS.$$("[data-open-search]").forEach(function (button) {
        button.addEventListener("click", openSearch);
      });

      // Tapping a link inside the drawer should close it behind you.
      WOS.$$(".drawer .nav-link, .drawer .sidebar__user").forEach(function (link) {
        link.addEventListener("click", closeDrawer);
      });

      document.addEventListener("keydown", function (event) {
        if (event.key.toLowerCase() === "k" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          if (palette.open) closeSearch();
          else openSearch();
        }
      });

      return document.getElementById("page");
    });
  }

  /** Re-read badge counts and update the rail without a full reload. */
  function refreshCounts() {
    return WOS.db.navCounts().then(function (counts) {
      state.counts = counts;

      WOS.$$("[data-badge-target]").forEach(function (node) {
        node.remove();
      });

      // Simplest correct approach: re-render the two nav surfaces in place.
      var rail = document.querySelector(".sidebar--rail");
      if (rail) rail.outerHTML = sidebarMarkup("sidebar--rail");

      var nav = document.querySelector(".bottom-nav");
      if (nav) nav.outerHTML = bottomNavMarkup();

      WOS.$$("[data-open-drawer]").forEach(function (button) {
        button.addEventListener("click", openDrawer);
      });
    });
  }

  /**
   * Standard failure state.
   *
   * This sits on the boot chain of every page, so it catches whatever went
   * wrong — a Sheets outage, but equally a bug thrown while rendering. It used
   * to blame the connection for all of them, which sent debugging in the wrong
   * direction for anything that wasn't actually a network problem. Now the
   * message matches the failure, and the underlying message is always shown so
   * a screenshot is enough to diagnose from.
   */
  function renderError(container, error) {
    console.error("[wos]", error);

    var message = (error && error.message) || String(error || "");
    // A rejected fetch surfaces as "HTTP 502" or "Failed to fetch"; a render
    // bug surfaces as a TypeError. Only the former is worth retrying.
    var isNetwork = /HTTP \d|Failed to fetch|NetworkError|unauthorized|reach/i.test(message);

    container.innerHTML =
      '<div class="empty"><span class="empty__icon" style="background:var(--rose-50);color:var(--rose-600)">' +
      icon("warning", 34) + "</span>" +
      '<p class="empty__title">' + esc(t("state.error")) + "</p>" +
      '<p class="empty__text">' + esc(t(isNetwork ? "state.errorDetail" : "state.errorApp")) + "</p>" +
      (message
        ? '<p class="text-label faint mono" style="margin-top:10px;max-width:420px;word-break:break-word">' +
          esc(message) + "</p>"
        : "") +
      (isNetwork
        ? '<div style="margin-top:20px"><button type="button" class="btn btn--outline" onclick="window.location.reload()">' +
          esc(t("action.retry")) + "</button></div>"
        : "") +
      "</div>";
  }

  WOS.shell = {
    mount: mount,
    refreshCounts: refreshCounts,
    renderError: renderError,
    openSearch: openSearch,
    user: function () {
      return state.user;
    },
  };
})(window.WOS);
