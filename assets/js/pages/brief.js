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

  /* ── Today's meetings, for the end-of-day report ────────────── */

  function hasStarted(when) {
    return new Date(when) <= new Date();
  }

  /**
   * Meetings that have actually run today. A meeting still ahead of us has
   * nothing to report yet, and listing it would pad the report with items the
   * reader can't act on.
   */
  function meetingsSoFar() {
    return (data.meetings || [])
      .filter(function (m) {
        return fmt.isToday(m.startAt) && hasStarted(m.startAt);
      })
      .sort(WOS.by("startAt"));
  }

  /** Loose key for pairing a calendar entry with its minutes. */
  function titleKey(title) {
    return String(title || "").toLowerCase().replace(/[^a-z0-9]+/g, "");
  }

  /**
   * Calendar entries that already happened today but have no minutes against
   * them.
   *
   * This is the part that makes the report trustworthy: without it, a meeting
   * nobody wrote up simply doesn't appear, and the report reads as a complete
   * account of the day when it isn't. Matching is deliberately loose — same
   * title, or starting within 45 minutes — because a meeting wrongly listed as
   * unwritten costs a glance, while one silently dropped costs the record.
   */
  function meetingsWithoutMinutes() {
    var written = meetingsSoFar();

    return (data.events || []).filter(function (e) {
      if (!hasStarted(e.startAt) || e.allDay) return false;
      return !written.some(function (m) {
        if (titleKey(m.title) && titleKey(m.title) === titleKey(e.title)) return true;
        return Math.abs(new Date(m.startAt) - new Date(e.startAt)) < 45 * 60000;
      });
    });
  }

  /** Everything a meeting recorded, flattened for counting and rendering. */
  function meetingDecisions(meeting) {
    return (meeting.decisions || []).map(function (d) {
      return typeof d === "string" ? d : d.text;
    }).filter(Boolean);
  }

  function meetingActions(meeting) {
    return (meeting.actionItems || []).map(function (a) {
      var owner = a.ownerId ? memberName(a.ownerId) : a.ownerHint || "";
      var due = a.dueAt ? fmt.dayMonth(a.dueAt) : a.dueHint || "";
      return { text: a.text, owner: owner, due: due, done: a.done };
    }).filter(function (a) {
      return a.text;
    });
  }

  /** True when a meeting ran but nothing was written into it. */
  function isBlank(meeting) {
    return (
      !meeting.summary &&
      !meetingDecisions(meeting).length &&
      !meetingActions(meeting).length &&
      !(meeting.fact || []).length
    );
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

  /**
   * The day's meetings as one WhatsApp message.
   *
   * Written to be read by someone who wasn't in any of them, so each block
   * leads with what was settled rather than a transcript.
   */
  function dailyReportText() {
    var meetings = meetingsSoFar();
    var missing = meetingsWithoutMinutes();
    var lines = [];

    lines.push("*" + t("brief.report").toUpperCase() + "*");
    lines.push(fmt.fullDate(new Date()));
    lines.push("");

    if (!meetings.length && !missing.length) {
      lines.push(t("brief.noMeetingsYet"));
      return lines.join("\n");
    }

    meetings.forEach(function (meeting, index) {
      var attendees = (meeting.participantIds || []).map(memberName).filter(function (name) {
        return name !== "—";
      });

      lines.push("*" + (index + 1) + ". " + meeting.title + "*");
      lines.push(
        fmt.time(meeting.startAt) +
          (meeting.durationMin ? "–" + fmt.time(new Date(new Date(meeting.startAt).getTime() + meeting.durationMin * 60000)) : "") +
          (attendees.length ? " · " + attendees.join(", ") : "")
      );

      if (isBlank(meeting)) {
        // Say it plainly. A heading with nothing under it reads as "nothing
        // happened", which is a different claim from "nobody wrote it up".
        lines.push("_" + t("brief.notWrittenUp") + "_");
        lines.push("");
        return;
      }

      if (meeting.summary) lines.push(meeting.summary);

      var decisions = meetingDecisions(meeting);
      if (decisions.length) {
        lines.push("");
        lines.push(t("mom.decision") + ":");
        decisions.forEach(function (text) {
          lines.push("- " + text);
        });
      }

      var actions = meetingActions(meeting);
      if (actions.length) {
        lines.push("");
        lines.push(t("mom.action") + ":");
        actions.forEach(function (action) {
          lines.push(
            "- [" + (action.done ? "x" : " ") + "] " + action.text +
              (action.owner ? " — " + action.owner : "") +
              (action.due ? " — " + action.due : "")
          );
        });
      }

      lines.push("");
    });

    if (missing.length) {
      lines.push("*" + t("brief.noMinutesYet") + "*");
      missing.forEach(function (e) {
        lines.push("- " + fmt.time(e.startAt) + " " + e.title);
      });
    }

    return lines.join("\n").trim();
  }

  /* ── Today's notes, for blasting ────────────────────────────── */

  /**
   * Notes written or updated today, newest first.
   *
   * Keyed off updatedAt, not createdAt: a note started yesterday and finished
   * in this morning's meeting is today's material, and that's the one most
   * worth sending out.
   */
  function todaysNotes() {
    return (data.notes || [])
      .filter(function (note) {
        if (note.archived) return false;
        return fmt.isToday(note.updatedAt) || fmt.isToday(note.createdAt);
      })
      .sort(WOS.by("updatedAt", "desc"));
  }

  /**
   * Flatten a note's markdown to plain text for WhatsApp.
   *
   * WhatsApp renders none of it, so anything left in leaks as literal syntax —
   * `##`, table pipes, code fences. Handled line by line: table separator rows
   * are dropped, table cells become "·"-joined, and fences and rules disappear,
   * so a note pasted into chat reads as sentences rather than source.
   */
  function plainNote(content) {
    var inFence = false;

    var lines = String(content || "").split("\n").map(function (line) {
      var trimmed = line.trim();

      if (trimmed.indexOf("```") === 0) {
        inFence = !inFence;
        return null;
      }
      if (inFence) return line;

      if (/^-{3,}$/.test(trimmed) || /^\|?[\s:|-]+\|?$/.test(trimmed) && /-/.test(trimmed) && /\|/.test(trimmed)) {
        return null; // horizontal rule, or a table's --- separator row
      }

      // Table row → cells joined with a middot.
      if (/^\|.*\|/.test(trimmed)) {
        line = trimmed.replace(/^\||\|$/g, "").split("|").map(function (cell) {
          return cell.trim();
        }).join(" · ");
      }

      return line
        .replace(/^#{1,6}\s+/, "")
        .replace(/^>\s*\[![^\]]*\]\s*/i, "")
        .replace(/^>\s?/, "")
        .replace(/^\s*[-*]\s+\[[ xX]\]\s+/, "- ")
        .replace(/^\s*[-*]\s+/, "- ")
        .replace(/\*\*([^*]+)\*\*/g, "$1")
        .replace(/~~([^~]+)~~/g, "$1")
        .replace(/`([^`]+)`/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    });

    return lines
      .filter(function (line) {
        return line !== null;
      })
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /** Today's notes as one WhatsApp message. */
  function dailyNotesText() {
    var notes = todaysNotes();
    var lines = ["*" + t("brief.notes").toUpperCase() + "*", fmt.fullDate(new Date()), ""];

    if (!notes.length) {
      lines.push(t("brief.noNotesToday"));
      return lines.join("\n");
    }

    notes.forEach(function (note, index) {
      lines.push("*" + (index + 1) + ". " + WOS.nameOr(note.title, t("common.untitled")) + "*");
      var body = plainNote(note.content);
      if (body) lines.push(body);
      lines.push("");
    });

    return lines.join("\n").trim();
  }

  function dailyNotesView() {
    var notes = todaysNotes();

    var head =
      '<div class="spread" style="align-items:flex-start;flex-wrap:wrap;gap:12px">' +
      '<div><h2 class="card__title" style="font-size:17px">' + esc(t("brief.notes")) + "</h2>" +
      '<p class="text-label muted" style="margin-top:2px">' + esc(t("brief.notesSubtitle")) + "</p></div>" +
      (notes.length
        ? '<button type="button" class="btn btn--primary btn--sm" data-copy-notes>' +
          icon("message-square", 14, { color: "#fff" }) + esc(t("brief.copy")) + "</button>"
        : "") +
      "</div>";

    if (!notes.length) {
      return head + '<div class="card" style="margin-top:16px">' +
        ui.empty(t("brief.noNotesToday"), t("brief.noNotesTodayHint"), null, "layers") + "</div>";
    }

    return (
      head +
      '<div class="stack" style="margin-top:16px">' +
      notes
        .map(function (note) {
          return (
            '<div class="card"><div class="spread" style="align-items:flex-start;gap:10px">' +
            '<span><span class="row__title" style="display:block;font-size:15px">' +
            esc(WOS.nameOr(note.title, t("common.untitled"))) + "</span>" +
            '<span class="row__meta" style="display:block">' + esc(fmt.relative(note.updatedAt)) + "</span></span>" +
            '<a class="btn btn--outline btn--sm" href="note.html?id=' + esc(note.id) + '">' + esc(t("action.open")) + "</a></div>" +
            (note.content
              ? '<div class="prose" style="margin-top:10px">' + ui.markdown(note.content) + "</div>"
              : '<p class="text-sm muted" style="margin-top:10px">' + esc(t("state.empty")) + "</p>") +
            "</div>"
          );
        })
        .join("") +
      "</div>" +
      '<div style="margin-top:16px">' + preview(dailyNotesText()) + "</div>"
    );
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

  function reportView() {
    var meetings = meetingsSoFar();
    var missing = meetingsWithoutMinutes();
    var blank = meetings.filter(isBlank).length;

    var decisions = meetings.reduce(function (total, m) {
      return total + meetingDecisions(m).length;
    }, 0);
    var actions = meetings.reduce(function (total, m) {
      return total + meetingActions(m).length;
    }, 0);

    var head =
      '<div class="spread" style="align-items:flex-start;flex-wrap:wrap;gap:12px">' +
      '<div><h2 class="card__title" style="font-size:17px">' + esc(t("brief.report")) + "</h2>" +
      '<p class="text-label muted" style="margin-top:2px">' + esc(t("brief.reportSubtitle")) + "</p></div>" +
      (meetings.length
        ? '<button type="button" class="btn btn--primary btn--sm" data-copy-report>' +
          icon("message-square", 14, { color: "#fff" }) + esc(t("brief.copy")) + "</button>"
        : "") +
      "</div>";

    if (!meetings.length && !missing.length) {
      return head + '<div class="card" style="margin-top:16px">' +
        ui.empty(t("brief.noMeetingsYet"), t("brief.noMeetingsYetHint"), null, "clock") + "</div>";
    }

    // Gaps first: an unwritten meeting is the one thing here you can still fix
    // before the report goes out.
    var gaps = "";
    if (missing.length || blank) {
      gaps =
        '<div style="margin-top:14px;padding:12px 14px;background:var(--amber-50);border-radius:10px;' +
        'display:flex;gap:10px;align-items:flex-start">' +
        icon("warning", 15, { color: "var(--amber-600)" }) +
        '<div><span class="text-sm fw-semibold" style="color:var(--amber-600);display:block">' +
        esc(t("brief.gapsTitle", { n: missing.length + blank })) + "</span>" +
        '<span class="text-label" style="color:var(--amber-600);line-height:1.6">' +
        esc(
          missing
            .map(function (e) {
              return fmt.time(e.startAt) + " " + e.title;
            })
            .concat(
              meetings.filter(isBlank).map(function (m) {
                return fmt.time(m.startAt) + " " + m.title;
              })
            )
            .join(" · ")
        ) + "</span></div></div>";
    }

    return (
      head +
      gaps +
      '<div class="grid grid--sm-3" style="margin-top:16px">' +
      statTile(meetings.length, t("brief.meetingsHeld"), "message-square") +
      statTile(decisions, t("mom.decision"), "shield-user") +
      statTile(actions, t("mom.action"), "file-pen") +
      "</div>" +
      '<div class="stack" style="margin-top:16px">' +
      meetings
        .map(function (m) {
          return (
            '<div class="card"><div class="spread" style="align-items:flex-start;gap:10px">' +
            '<span><span class="row__title" style="display:block;font-size:15px">' + esc(m.title) + "</span>" +
            '<span class="row__meta" style="display:block">' + esc(fmt.time(m.startAt)) +
            (m.durationMin ? " · " + m.durationMin + "m" : "") + "</span></span>" +
            '<a class="btn btn--outline btn--sm" href="meeting.html?id=' + esc(m.id) + '">' +
            esc(t("action.open")) + "</a></div>" +
            (isBlank(m)
              ? '<p class="text-sm" style="margin-top:10px;color:var(--amber-600)">' + esc(t("brief.notWrittenUp")) + "</p>"
              : '<div style="margin-top:10px">' +
                ui.markdown(
                  (m.summary ? m.summary + "\n\n" : "") +
                    (meetingDecisions(m).length
                      ? "**" + t("mom.decision") + "**\n" +
                        meetingDecisions(m).map(function (d) { return "- " + d; }).join("\n") + "\n\n"
                      : "") +
                    (meetingActions(m).length
                      ? "**" + t("mom.action") + "**\n" +
                        meetingActions(m).map(function (a) {
                          return "- [" + (a.done ? "x" : " ") + "] " + a.text +
                            (a.owner ? " — " + a.owner : "") + (a.due ? " — " + a.due : "");
                        }).join("\n")
                      : "")
                ) + "</div>") +
            "</div>"
          );
        })
        .join("") +
      "</div>" +
      '<div style="margin-top:16px">' + preview(dailyReportText()) + "</div>"
    );
  }

  function render() {
    var tabs = [
      { id: "daily", key: "brief.daily" },
      { id: "report", key: "brief.report" },
      { id: "notes", key: "brief.notes" },
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
    body.innerHTML =
      state.tab === "daily" ? dailyView()
        : state.tab === "report" ? reportView()
        : state.tab === "notes" ? dailyNotesView()
        : preMeetingView();
  }

  function bind() {
    WOS.on(page, "click", "[data-brief-tab]", function (event, target) {
      state.tab = target.dataset.briefTab;
      render();
    });

    WOS.on(page, "click", "[data-copy-daily]", function () {
      ui.copyText(dailyBriefText(), "brief.copied");
    });

    WOS.on(page, "click", "[data-copy-report]", function () {
      ui.copyText(dailyReportText(), "brief.copied");
    });

    WOS.on(page, "click", "[data-copy-notes]", function () {
      ui.copyText(dailyNotesText(), "brief.copied");
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
        WOS.db.loadAll(["tasks", "approvals", "members", "meetings", "notes"], ["tasks"]),
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
