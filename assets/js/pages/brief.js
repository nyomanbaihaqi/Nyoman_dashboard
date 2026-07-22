/* ──────────────────────────────────────────────────────────────
   Briefs — the PA's two daily deliverables.

   The distinction that matters: Home is a dashboard you look at,
   this page produces an *artefact you send*. Both briefs render as
   plain text ready to paste into WhatsApp, because that is where
   they actually land.

     Daily Command Brief   sent each morning
     Pre-meeting brief     sent 30 minutes before each meeting
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
  var calendarFailed = false;
  var state = { tab: "daily" };

  /* ── Data slices ───────────────────────────────────────────── */

  function todaysEvents() {
    return data.events
      .filter(function (e) {
        return fmt.isToday(e.startAt);
      })
      .sort(WOS.by("startAt"));
  }

  /** Meetings still ahead of us today — what a T−30 brief can still apply to. */
  function upcomingEvents() {
    var now = new Date();
    return todaysEvents().filter(function (e) {
      return new Date(e.startAt) > now;
    });
  }

  function todaysPriorities() {
    var me = WOS.config.currentUserId;
    return data.tasks
      .filter(function (task) {
        if (task.status === "done") return false;
        if (task.assigneeId !== me) return false;
        return fmt.isToday(task.dueAt) || (task.dueAt && fmt.isPast(task.dueAt));
      })
      .sort(function (a, b) {
        var rank = { high: 0, medium: 1, low: 2 };
        return rank[a.priority] - rank[b.priority];
      })
      .slice(0, 5);
  }

  function pendingDecisions() {
    return data.approvals.filter(function (a) {
      return a.state === "pending";
    });
  }

  function memberName(id) {
    var m = data.memberById.get(id);
    return m ? m.name : "—";
  }

  /* ── Text generators — the actual deliverable ──────────────── */

  function dailyBriefText() {
    var user = WOS.shell.user();
    var events = todaysEvents();
    var priorities = todaysPriorities();
    var decisions = pendingDecisions();
    var lines = [];

    lines.push("*Daily Command Brief*");
    lines.push(fmt.fullDate(new Date()));
    lines.push("");

    lines.push("*" + t("brief.agenda") + "*");
    if (calendarFailed) {
      // Never let a brief claim an empty day when the calendar simply wasn't
      // reachable. "No meetings" and "couldn't check" are opposite instructions
      // to whoever reads this.
      lines.push("- ⚠️ " + t("calendar.unavailable"));
    } else if (!events.length) {
      lines.push("- " + t("brief.noMeetings"));
    } else {
      events.forEach(function (e) {
        var attendees = (e.attendeeIds || [])
          .filter(function (id) {
            return id !== WOS.config.currentUserId;
          })
          .map(memberName);
        lines.push(
          "- " + fmt.time(e.startAt) + "–" + fmt.time(e.endAt) + " " + e.title +
            (e.location ? " (" + e.location + ")" : "") +
            (attendees.length ? "\n  " + t("brief.attendees") + ": " + attendees.join(", ") : ""),
        );
      });
    }
    lines.push("");

    lines.push("*" + t("brief.priorities") + "*");
    if (!priorities.length) {
      lines.push("- " + t("state.empty"));
    } else {
      priorities.forEach(function (task) {
        var late = task.dueAt && fmt.isPast(task.dueAt) ? " [" + t("home.overdue").toUpperCase() + "]" : "";
        lines.push("- " + task.title + " (" + t("priority." + task.priority) + ")" + late);
      });
    }
    lines.push("");

    lines.push("*" + t("brief.needsApproval") + "*");
    if (!decisions.length) {
      lines.push("- " + t("brief.nothingPending"));
    } else {
      decisions.forEach(function (d) {
        var amount = d.amount ? " — " + fmt.currency(d.amount, d.currency) : "";
        lines.push("- " + d.title + amount + " (" + memberName(d.requesterId) + ")");
      });
    }

    return lines.join("\n");
  }

  function preMeetingBriefText(event) {
    var meeting = event.meetingId ? data.meetingById.get(event.meetingId) : null;
    var attendees = (event.attendeeIds || []).map(memberName);
    var lines = [];

    lines.push("*Meeting Brief — T−30*");
    lines.push("");
    lines.push("*" + event.title + "*");
    lines.push(fmt.time(event.startAt) + "–" + fmt.time(event.endAt) + (event.location ? " · " + event.location : ""));
    lines.push("");

    if (meeting && meeting.objective) {
      lines.push("*" + t("meetings.objective") + "*");
      lines.push(meeting.objective);
      lines.push("");
    }

    if (event.description) {
      lines.push("*" + t("meetings.executiveSummary") + "*");
      lines.push(event.description);
      lines.push("");
    }

    lines.push("*" + t("meetings.info.participants") + "*");
    lines.push(attendees.length ? attendees.join(", ") : "—");
    lines.push("");

    lines.push("*" + t("meetings.decisionsNeeded") + "*");
    var needed = (meeting && meeting.decisionsNeeded) || [];
    if (!needed.length) {
      lines.push("—");
    } else {
      needed.forEach(function (q) {
        lines.push("- " + q);
      });
    }

    var preReads = (meeting && meeting.preReads) || [];
    if (preReads.length) {
      lines.push("");
      lines.push("*" + t("meetings.preRead") + "*");
      preReads.forEach(function (p) {
        lines.push("- " + p.name);
      });
    }

    return lines.join("\n");
  }

  /* ── Render ────────────────────────────────────────────────── */

  function preview(text) {
    return (
      '<pre style="margin:0;white-space:pre-wrap;word-break:break-word;font-family:var(--font-mono);' +
      'font-size:12.5px;line-height:1.7;color:var(--text-body);background:var(--slate-50);' +
      'border:1px solid var(--border-subtle);border-radius:10px;padding:16px">' + esc(text) + "</pre>"
    );
  }

  function dailyView() {
    var text = dailyBriefText();
    var events = todaysEvents();
    var priorities = todaysPriorities();
    var decisions = pendingDecisions();

    return (
      '<div class="spread" style="align-items:flex-start;flex-wrap:wrap;gap:12px">' +
      '<div><h2 class="card__title" style="font-size:17px">' + esc(t("brief.daily")) + "</h2>" +
      '<p class="text-label muted" style="margin-top:2px">' + esc(t("brief.dailySubtitle")) + "</p></div>" +
      '<button type="button" class="btn btn--primary btn--sm" data-copy-daily>' +
      icon("message-square", 14, { color: "#fff" }) + esc(t("brief.copy")) + "</button></div>" +
      (calendarFailed ? calendarWarning() : "") +
      '<div class="grid grid--sm-3" style="margin-top:16px">' +
      statTile(calendarFailed ? "—" : events.length, t("home.stat.meetingsToday"), "clock") +
      statTile(priorities.length, t("brief.priorities"), "file-pen") +
      statTile(decisions.length, t("brief.needsApproval"), "shield-user") +
      "</div>" +
      '<div style="margin-top:16px">' + preview(text) + "</div>"
    );
  }

  function calendarWarning() {
    return (
      '<div style="margin-top:14px;padding:12px 14px;background:var(--amber-50);border-radius:10px;' +
      'display:flex;gap:10px;align-items:flex-start">' +
      icon("warning", 15, { color: "var(--amber-600)" }) +
      '<span class="text-sm" style="color:var(--amber-600);line-height:1.5">' + esc(t("calendar.unavailable")) + "</span></div>"
    );
  }

  function statTile(value, label, iconName) {
    return (
      '<div class="card" style="padding:14px 16px">' +
      '<div class="cluster" style="gap:10px">' + ui.iconTile(iconName, "var(--antar-purple-light)", "var(--antar-purple)", "sm") +
      '<span><span class="stat-value" style="font-size:19px;display:block">' + value + "</span>" +
      '<span class="text-label muted">' + esc(label) + "</span></span></div></div>"
    );
  }

  function preMeetingView() {
    var events = upcomingEvents();

    if (calendarFailed) {
      return (
        '<div><h2 class="card__title" style="font-size:17px">' + esc(t("brief.preMeeting")) + "</h2>" +
        '<p class="text-label muted" style="margin-top:2px">' + esc(t("brief.preMeetingSubtitle")) + "</p></div>" +
        calendarWarning()
      );
    }

    if (!events.length) {
      return (
        '<div class="spread"><div><h2 class="card__title" style="font-size:17px">' + esc(t("brief.preMeeting")) + "</h2>" +
        '<p class="text-label muted" style="margin-top:2px">' + esc(t("brief.preMeetingSubtitle")) + "</p></div></div>" +
        '<div class="card" style="margin-top:16px">' + ui.empty(t("brief.noMeetingsSoon"), null, null, "clock") + "</div>"
      );
    }

    return (
      '<div><h2 class="card__title" style="font-size:17px">' + esc(t("brief.preMeeting")) + "</h2>" +
      '<p class="text-label muted" style="margin-top:2px">' + esc(t("brief.preMeetingSubtitle")) + "</p></div>" +
      '<div class="stack" style="margin-top:16px">' +
      events
        .map(function (e) {
          var minutesAway = Math.round((new Date(e.startAt) - new Date()) / 60000);
          return (
            '<div class="card">' +
            '<div class="spread" style="align-items:flex-start;flex-wrap:wrap;gap:10px">' +
            '<span><span class="row__title" style="display:block;font-size:15px">' + esc(e.title) + "</span>" +
            '<span class="row__meta" style="display:block">' + esc(fmt.timeRange(e.startAt, e.endAt)) +
            (e.location ? " · " + esc(e.location) : "") + " · " + esc(t("home.stat.nextIn", { n: minutesAway })) + "</span></span>" +
            '<button type="button" class="btn btn--outline btn--sm" data-copy-pre="' + esc(e.id) + '">' +
            icon("message-square", 13) + esc(t("brief.copy")) + "</button></div>" +
            '<div style="margin-top:12px">' + preview(preMeetingBriefText(e)) + "</div></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function render() {
    var tabs = [
      { id: "daily", key: "brief.daily" },
      { id: "pre", key: "brief.preMeeting" },
    ];

    page.innerHTML =
      '<div class="page__head">' +
      '<h1 class="page__title">' + esc(t("brief.title")) + "</h1>" +
      '<span class="text-label faint">' + esc(t("brief.generatedAt", { time: fmt.time(new Date()) })) + "</span></div>" +
      '<div class="chips scroll-x" style="margin-top:16px">' +
      tabs
        .map(function (tab) {
          return (
            '<button type="button" class="chip' + (state.tab === tab.id ? " is-active" : "") +
            '" data-brief-tab="' + tab.id + '">' + esc(t(tab.key)) + "</button>"
          );
        })
        .join("") +
      "</div>" +
      '<div data-brief-body style="margin-top:20px"></div>';

    var body = WOS.$("[data-brief-body]", page);
    body.innerHTML = state.tab === "daily" ? dailyView() : preMeetingView();
  }

  function bind() {
    WOS.on(page, "click", "[data-brief-tab]", function (event, target) {
      state.tab = target.dataset.briefTab;
      render();
    });

    WOS.on(page, "click", "[data-copy-daily]", function () {
      ui.copyText(dailyBriefText(), "brief.copied");
    });

    WOS.on(page, "click", "[data-copy-pre]", function (event, target) {
      var e = data.events.filter(function (row) {
        return row.id === target.dataset.copyPre;
      })[0];
      if (e) ui.copyText(preMeetingBriefText(e), "brief.copied");
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "brief", title: t("brief.title") })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(3, 110);
      // Today's window only — the brief never looks past midnight, and asking
      // Google for more would just be slower.
      var dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      var dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      return Promise.all([
        WOS.db.loadAll(["tasks", "approvals", "members", "meetings"]),
        // The agenda is one of three sections. If the calendar is unreachable,
        // the priorities and pending decisions are still worth having, so this
        // degrades to an empty schedule with a warning rather than taking the
        // whole page down.
        WOS.gcal.range(dayStart, dayEnd).catch(function (error) {
          console.warn("[wos] calendar unavailable for the brief", error);
          calendarFailed = true;
          return [];
        }),
      ]);
    })
    .then(function (results) {
      data = results[0];
      data.events = results[1];
      data.memberById = WOS.indexById(data.members);
      data.meetingById = WOS.indexById(data.meetings);
      render();
      bind();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
