/* ──────────────────────────────────────────────────────────────
   Notes & Meetings hub — Home / Meetings / Notes / AI Recap.
   Meeting Detail and Note Detail are separate pages (meeting.html,
   note.html) so they're deep-linkable from search and elsewhere.
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
  var state = { view: "home", meetingsFilter: "all" };
  var recap = { busy: false, stage: "uploading", ratio: 0, report: null, error: "" };

  function nonDaily(list) {
    return list.filter(function (n) {
      return n.kind !== "daily";
    });
  }

  /* ── Home ──────────────────────────────────────────────────── */

  function greetingKey() {
    var hour = new Date().getHours();
    if (hour < 12) return "home.greeting.morning";
    if (hour < 18) return "home.greeting.afternoon";
    return "home.greeting.evening";
  }

  function homeView() {
    var user = WOS.shell.user();
    var latest = nonDaily(data.notes).slice().sort(WOS.by("updatedAt", "desc"))[0];
    var recentMeetings = data.meetings.slice().sort(WOS.by("startAt", "desc")).slice(0, 3);
    var pinned = data.notes.filter(function (n) {
      return n.pinned && !n.archived;
    }).slice(0, 5);
    var todayMeeting = data.meetings.filter(function (m) {
      return fmt.isToday(m.startAt);
    })[0];
    var recentNotes = nonDaily(data.notes).slice().sort(WOS.by("updatedAt", "desc")).slice(0, 4);
    var suggestions = ["notes.suggestion.followUp", "notes.suggestion.checkpoint", "notes.suggestion.summarize"];

    return (
      '<h1 class="page__title">' + esc(t(greetingKey())) + ", " + esc(user ? String(user.name || "").split(" ")[0] : "") + "</h1>" +
      '<p class="page__subtitle">' + esc(t("notes.subtitle")) + "</p>" +
      '<div class="grid grid--lg-2" style="margin-top:22px;grid-template-columns:1.3fr 1fr">' +
      '<div class="card" style="background:linear-gradient(120deg,#f5f3ff,#fdf4ff)">' +
      '<p class="eyebrow" style="color:var(--antar-purple)">' + esc(t("notes.continueWriting")) + "</p>" +
      (latest
        ? '<p style="font-size:17px;font-weight:800;color:var(--text-strong);margin-top:8px">' + esc(WOS.nameOr(latest.title, t("common.untitled"))) + "</p>" +
          '<p class="text-sm" style="margin-top:6px;color:var(--text-body);line-height:1.6" class="clamp-2">' +
          // Sheets hands back null for an empty cell, so a note saved without
          // a body arrives as content: null rather than "".
          esc(String(latest.content || "").replace(/[#*>`|\-\[\]]/g, "").slice(0, 160)) + "…</p>" +
          '<a class="btn btn--primary btn--sm" style="margin-top:14px" href="note.html?id=' + esc(latest.id) + '">' +
          esc(t("notes.continueWriting")) + "</a>"
        : '<p class="text-sm muted" style="margin-top:8px">' + esc(t("state.empty")) + "</p>") +
      "</div>" +
      '<div class="card">' +
      '<p class="eyebrow">' + esc(t("notes.quickCapture")) + "</p>" +
      '<textarea class="textarea" data-quick-capture placeholder="' + esc(t("notes.quickCapturePlaceholder")) +
      '" style="margin-top:10px;min-height:64px"></textarea>' +
      '<div class="cluster" style="margin-top:10px">' +
      '<button type="button" class="btn btn--secondary btn--sm" data-save-capture>' + esc(t("action.saveNote")) + "</button>" +
      '<button type="button" class="btn btn--ghost btn--sm" data-voice-capture>' + icon("mic", 14) + esc(t("notes.voiceCapture")) + "</button>" +
      "</div></div></div>" +
      '<div class="grid grid--lg-3" style="margin-top:18px">' +
      '<div class="card"><div class="spread"><h2 class="card__title">' + esc(t("notes.recentMeetings")) + '</h2>' +
      '<a class="text-xs fw-semibold" href="#" data-goto-view="meetings">' + esc(t("action.viewAll")) + "</a></div>" +
      (recentMeetings.length
        ? recentMeetings
            .map(function (m) {
              return (
                '<a class="row" href="meeting.html?id=' + esc(m.id) + '">' +
                ui.iconTile("message-square", "#f0f9ff", "#0284c7", "sm") +
                '<span><span class="row__title" style="display:block;font-size:12.5px">' + esc(WOS.nameOr(m.title, t("common.untitled"))) + "</span>" +
                '<span class="row__meta" style="display:block">' + esc(fmt.isToday(m.startAt) ? t("time.today") : fmt.dayMonth(m.startAt)) +
                ", " + esc(fmt.time(m.startAt)) + "</span></span></a>"
              );
            })
            .join("")
        : '<p class="text-sm muted" style="padding:10px 0">' + esc(t("state.empty")) + "</p>") +
      "</div>" +
      '<div class="card"><div class="spread"><h2 class="card__title">' + esc(t("notes.pinnedNotes")) + '</h2>' +
      '<a class="text-xs fw-semibold" href="#" data-goto-view="notes">' + esc(t("action.viewAll")) + "</a></div>" +
      (pinned.length
        ? pinned
            .map(function (n) {
              return (
                '<a class="row" href="note.html?id=' + esc(n.id) + '">' + icon("crown", 13, { color: "var(--amber-500)" }) +
                '<span class="text-sm truncate" style="color:var(--text-body)">' + esc(WOS.nameOr(n.title, t("common.untitled"))) + "</span></a>"
              );
            })
            .join("")
        : '<p class="text-sm muted" style="padding:10px 0">' + esc(t("state.empty")) + "</p>") +
      "</div>" +
      '<div class="card"><h2 class="card__title">' + esc(t("notes.meetingToday")) + "</h2>" +
      (todayMeeting
        ? '<p style="font-size:13.5px;font-weight:700;color:var(--text-strong);margin-top:10px">' + esc(WOS.nameOr(todayMeeting.title, t("common.untitled"))) + "</p>" +
          '<p class="text-label muted" style="margin-top:3px">' + esc(fmt.time(todayMeeting.startAt)) + " · " +
          esc(fmt.duration(todayMeeting.durationMin)) + "</p>" +
          '<a class="btn btn--outline btn--sm" style="margin-top:12px" href="meeting.html?id=' + esc(todayMeeting.id) + '">' +
          esc(t("action.viewAgenda")) + "</a>"
        : '<p class="text-sm muted" style="padding:10px 0">' + esc(t("calendar.noEventsToday")) + "</p>") +
      "</div></div>" +
      '<div class="grid grid--lg-2" style="margin-top:18px">' +
      '<div class="card"><h2 class="card__title">' + esc(t("home.recentNotes")) + "</h2>" +
      (recentNotes.length
        ? recentNotes
            .map(function (n) {
              return (
                '<a class="row" href="note.html?id=' + esc(n.id) + '">' +
                '<span class="icon-tile icon-tile--sm" style="background:var(--slate-50);font-size:14px">' + esc(n.icon) + "</span>" +
                '<span class="grow"><span class="row__title" style="display:block;font-size:12.5px">' + esc(WOS.nameOr(n.title, t("common.untitled"))) + "</span>" +
                '<span class="row__meta" style="display:block">' + esc(fmt.relative(n.updatedAt)) + "</span></span></a>"
              );
            })
            .join("")
        : '<p class="text-sm muted" style="padding:10px 0">' + esc(t("state.empty")) + "</p>") +
      "</div>" +
      '<div class="card"><h2 class="card__title">' + esc(t("notes.suggestedNotes")) + "</h2>" +
      suggestions
        .map(function (key) {
          return (
            '<button type="button" class="row tap" data-suggestion style="width:100%;text-align:left;border:none;background:none">' +
            '<span class="grow text-sm" style="color:var(--text-body)">' + esc(t(key)) + "</span>" +
            icon("chevron-right", 13, { color: "var(--slate-400)" }) + "</button>"
          );
        })
        .join("") +
      "</div></div>"
    );
  }

  /* ── Meetings ──────────────────────────────────────────────── */

  function meetingsView() {
    var filter = state.meetingsFilter;
    var list = data.meetings.filter(function (m) {
      if (filter === "week") return fmt.isThisWeek(m.startAt);
      if (filter === "recorded") return m.status === "recorded" || m.status === "processed";
      return true;
    }).sort(WOS.by("startAt", "desc"));

    var chips = [
      { id: "all", key: "projects.filter.all" },
      { id: "week", key: "meetings.filter.thisWeek" },
      { id: "recorded", key: "meetings.filter.recorded" },
    ];

    var head =
      '<div class="page__head">' +
      '<h2 class="page__title" style="font-size:19px">' + esc(t("meetings.title")) + "</h2>" +
      '<div class="chips">' +
      chips
        .map(function (chip) {
          return (
            '<button type="button" class="chip' + (filter === chip.id ? " is-active" : "") +
            '" data-meetings-filter="' + chip.id + '">' + esc(t(chip.key)) + "</button>"
          );
        })
        .join("") +
      "</div></div>";

    if (!list.length) return head + '<div class="card" style="margin-top:18px">' + ui.empty(t("state.empty"), null, null, "message-square") + "</div>";

    var rows = list
      .map(function (m) {
        var participants = (m.participantIds || []).map(function (id) {
          return data.memberById.get(id);
        }).filter(Boolean);
        var project = data.projectById.get(m.projectId);
        return (
          '<a class="table__row" href="meeting.html?id=' + esc(m.id) +
          '" style="grid-template-columns:2.2fr 1fr 0.8fr 1.2fr 1fr 0.9fr;text-decoration:none">' +
          '<span><span class="row__title" style="display:block">' + esc(WOS.nameOr(m.title, t("common.untitled"))) + "</span>" +
          '<span class="cluster" style="gap:4px;margin-top:4px">' + ui.tags(m.tags) + "</span></span>" +
          '<span class="text-sm muted">' + esc(fmt.dayMonth(m.startAt)) + "</span>" +
          '<span class="text-sm muted">' + esc(fmt.duration(m.durationMin)) + "</span>" +
          '<span>' + ui.avatarStack(participants, 24, 4) + "</span>" +
          '<span class="text-sm truncate" style="color:var(--text-body)">' + esc(project ? project.name : "—") + "</span>" +
          ui.badge(t("meetings.status." + m.status), ui.MEETING_TONE[m.status]) +
          "</a>"
        );
      })
      .join("");

    var cards = list
      .map(function (m) {
        var project = data.projectById.get(m.projectId);
        return (
          '<a class="card" href="meeting.html?id=' + esc(m.id) + '" style="display:block">' +
          '<div class="spread"><span class="row__title">' + esc(WOS.nameOr(m.title, t("common.untitled"))) + "</span>" +
          ui.badge(t("meetings.status." + m.status), ui.MEETING_TONE[m.status]) + "</div>" +
          '<p class="text-label muted" style="margin-top:6px">' + esc(fmt.dayMonth(m.startAt)) + " · " + esc(fmt.duration(m.durationMin)) +
          " · " + esc(project ? project.name : "—") + "</p></a>"
        );
      })
      .join("");

    return (
      head +
      '<div class="card card--flush" style="margin-top:18px"><div class="table">' +
      '<div class="table__head" style="grid-template-columns:2.2fr 1fr 0.8fr 1.2fr 1fr 0.9fr">' +
      "<span>" + esc(t("meetings.col.meeting")) + "</span><span>" + esc(t("meetings.col.date")) + "</span><span>" +
      esc(t("meetings.col.duration")) + "</span><span>" + esc(t("meetings.col.participants")) + "</span><span>" +
      esc(t("meetings.col.project")) + "</span><span>" + esc(t("tasks.col.status")) + "</span></div>" +
      rows + "</div>" +
      '<div class="card-list" style="padding:12px">' + cards + "</div></div>"
    );
  }

  /* ── Notes ─────────────────────────────────────────────────── */

  function notesListView() {
    var list = nonDaily(data.notes).slice().sort(WOS.by("updatedAt", "desc"));
    if (!list.length) {
      return (
        '<div class="card">' +
        ui.empty(
          t("notes.empty.title"),
          t("notes.empty.subtitle"),
          '<button type="button" class="btn btn--primary" data-create-note>' + esc(t("action.createNote")) + "</button>",
          "lightbulb",
        ) +
        "</div>"
      );
    }

    return (
      '<div class="grid grid--md-2 grid--lg-3">' +
      list
        .map(function (n) {
          var author = data.memberById.get(n.authorId);
          return (
            '<a class="card card-lift" href="note.html?id=' + esc(n.id) + '" style="display:block">' +
            '<div class="spread"><span style="font-size:22px">' + esc(n.icon) + "</span>" +
            (n.pinned ? icon("crown", 14, { color: "var(--amber-500)" }) : "") + "</div>" +
            '<p class="clamp-2" style="margin-top:10px;font-size:13.5px;font-weight:700;color:var(--text-strong)">' + esc(WOS.nameOr(n.title, t("common.untitled"))) + "</p>" +
            '<div class="cluster" style="gap:4px;margin-top:8px">' + ui.tags(n.tags) + "</div>" +
            '<p class="text-label muted" style="margin-top:10px">' + esc(fmt.relative(n.updatedAt)) + " · " + esc(author ? author.name : "—") + "</p>" +
            "</a>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  /* ── AI Recap ───────────────────────────────────────────────
     Drop in a recording, get back the handbook's five-point MoM.

     The result is held here until it's saved, and saving writes a
     `meetings` record — so the minutes land on the Meeting page that
     already knows how to display and WhatsApp them, rather than in a
     second place that does the same job slightly differently.
     ────────────────────────────────────────────────────────── */

  var COMPONENTS = [
    { key: "fact", field: "fact", tone: "var(--sky-600)", tint: "#f0f9ff" },
    { key: "assumption", field: "assumption", tone: "var(--amber-600)", tint: "#fffbeb" },
    { key: "proposal", field: "proposal", tone: "var(--antar-purple)", tint: "var(--antar-purple-light)" },
    { key: "decision", field: "decisions", tone: "var(--emerald-600)", tint: "#ecfdf5" },
    { key: "action", field: "actionItems", tone: "var(--rose-600, #e11d48)", tint: "#fff1f2" },
  ];

  /** Every component holds a list; these two hold objects, not strings. */
  function componentLines(report, field) {
    var items = report[field] || [];
    return items.map(function (item) {
      if (field === "decisions") return { text: item.text, meta: item.time || "" };
      if (field === "actionItems") {
        var meta = [item.owner, item.dueHint, item.priority].filter(Boolean).join(" · ");
        return { text: item.text, meta: meta };
      }
      return { text: item, meta: "" };
    });
  }

  function recapView() {
    if (recap.report) return recapResult();

    if (recap.busy) {
      return (
        '<div class="card" style="text-align:center;padding:38px 20px">' +
        '<div class="spin" style="margin:0 auto;width:26px;height:26px;border:3px solid var(--border-subtle);border-top-color:var(--antar-purple);border-radius:50%"></div>' +
        '<p style="margin-top:16px;font-size:15px;font-weight:700;color:var(--text-strong)">' +
        esc(t("recap.stage." + recap.stage)) + "</p>" +
        (recap.stage === "uploading"
          ? '<div class="recap__bar" style="margin-top:14px"><span style="width:' +
            Math.round(recap.ratio * 100) + '%"></span></div>' +
            '<p class="text-label muted" style="margin-top:8px">' + Math.round(recap.ratio * 100) + "%</p>"
          : '<p class="text-label muted" style="margin-top:8px">' + esc(t("recap.stageHint." + recap.stage)) + "</p>") +
        "</div>"
      );
    }

    return (
      '<div class="page__head"><h2 class="page__title" style="font-size:19px">' + esc(t("recap.title")) + "</h2></div>" +
      '<p class="text-sm muted" style="margin-top:2px;max-width:620px;line-height:1.6">' + esc(t("recap.intro")) + "</p>" +
      (recap.error
        ? '<div class="card" style="margin-top:16px;border-color:var(--rose-300,#fda4af);background:#fff1f2">' +
          '<p class="text-sm fw-semibold" style="color:#9f1239">' + esc(t("recap.failed")) + "</p>" +
          '<p class="text-label" style="margin-top:6px;font-family:var(--font-mono);color:#9f1239;line-height:1.6">' +
          esc(recap.error) + "</p></div>"
        : "") +
      '<label class="dropzone" data-recap-drop style="margin-top:16px;display:block;cursor:pointer">' +
      '<input type="file" accept="audio/*,video/*" data-recap-file hidden>' +
      icon("mic", 26, { color: "var(--antar-purple)" }) +
      '<span style="display:block;margin-top:10px;font-size:15px;font-weight:700;color:var(--text-strong)">' +
      esc(t("recap.drop")) + "</span>" +
      '<span class="text-label muted" style="display:block;margin-top:4px">' + esc(t("recap.dropHint")) + "</span>" +
      "</label>" +
      '<div class="card" style="margin-top:16px">' +
      '<h3 class="card__title" style="font-size:13px">' + esc(t("recap.pasteTitle")) + "</h3>" +
      '<p class="text-label muted" style="margin-top:4px">' + esc(t("recap.pasteHint")) + "</p>" +
      '<textarea class="textarea" data-recap-transcript rows="5" style="margin-top:10px" placeholder="' +
      esc(t("recap.pastePlaceholder")) + '"></textarea>' +
      '<div style="margin-top:10px"><button type="button" class="btn btn--outline btn--sm" data-recap-analyze>' +
      icon("sparkles", 13) + esc(t("recap.analyze")) + "</button></div></div>"
    );
  }

  function recapResult() {
    var report = recap.report;
    return (
      '<div class="page__head"><h2 class="page__title" style="font-size:19px">' +
      esc(WOS.nameOr(report.title, t("common.untitled"))) + "</h2>" +
      '<div class="cluster">' +
      '<button type="button" class="btn btn--ghost btn--sm" data-recap-reset>' + esc(t("recap.startOver")) + "</button>" +
      '<button type="button" class="btn btn--outline btn--sm" data-recap-copy>' + icon("message-square", 13) + esc(t("mom.copy")) + "</button>" +
      '<button type="button" class="btn btn--primary btn--sm" data-recap-save>' + esc(t("recap.save")) + "</button>" +
      "</div></div>" +
      (report.confidence !== undefined
        ? '<p class="text-label muted" style="margin-top:2px">' +
          esc(t("recap.confidence", { n: report.confidence })) + (report.language ? " · " + esc(report.language) : "") + "</p>"
        : "") +
      '<div class="card" style="margin-top:14px"><div class="stack">' +
      COMPONENTS.map(function (step, index) {
        var lines = componentLines(report, step.field);
        return (
          '<div style="display:flex;gap:14px">' +
          '<div style="display:flex;flex-direction:column;align-items:center;flex:none">' +
          '<span style="width:26px;height:26px;border-radius:50%;flex:none;display:flex;align-items:center;' +
          "justify-content:center;font-size:11px;font-weight:700;background:" + step.tint + ";color:" + step.tone + '">' +
          (index + 1) + "</span>" +
          (index < COMPONENTS.length - 1 ? '<span style="width:1.5px;flex:1;margin-top:4px;background:var(--border-subtle)"></span>' : "") +
          "</div>" +
          '<div style="flex:1;min-width:0;padding-bottom:' + (index < COMPONENTS.length - 1 ? "18px" : "0") + '">' +
          '<p class="eyebrow" style="color:' + step.tone + '">' + esc(t("mom." + step.key)) + "</p>" +
          '<p class="text-label faint" style="margin-top:1px">' + esc(t("mom." + step.key + ".hint")) + "</p>" +
          (lines.length
            ? '<ul style="margin-top:8px;display:flex;flex-direction:column;gap:6px">' +
              lines
                .map(function (line) {
                  return (
                    '<li style="display:flex;gap:8px;font-size:13.5px;line-height:1.55;color:var(--text-body)">' +
                    '<span style="color:' + step.tone + ';flex:none">•</span><span>' + esc(line.text) +
                    (line.meta ? ' <span class="text-label faint">(' + esc(line.meta) + ")</span>" : "") +
                    "</span></li>"
                  );
                })
                .join("") +
              "</ul>"
            : '<p class="text-sm muted" style="margin-top:8px">' + esc(t("mom.empty")) + "</p>") +
          "</div></div>"
        );
      }).join("") +
      "</div></div>" +
      ((report.openQuestions || []).length
        ? '<div class="card" style="margin-top:14px"><h3 class="card__title" style="font-size:13px">' +
          esc(t("recap.openQuestions")) + "</h3><ul style=\"margin-top:8px\">" +
          report.openQuestions
            .map(function (q) {
              return '<li style="font-size:13.5px;line-height:1.6;color:var(--text-body);padding:3px 0">• ' + esc(q) + "</li>";
            })
            .join("") + "</ul></div>"
        : "")
    );
  }

  /** The five points as WhatsApp-ready text, matching the Meeting page. */
  function recapText() {
    var report = recap.report;
    var lines = ["*MEETING NOTES*", "Topik: " + (report.title || "—"), ""];
    if (report.summary) lines.push(report.summary, "");

    COMPONENTS.forEach(function (step) {
      lines.push("*" + t("mom." + step.key).toUpperCase() + ":*");
      var items = componentLines(report, step.field);
      if (!items.length) lines.push("-");
      items.forEach(function (line) {
        lines.push("- " + line.text + (line.meta ? " (" + line.meta + ")" : ""));
      });
      lines.push("");
    });
    return lines.join("\n");
  }

  /** Match a spoken name to a member, so action items get a real owner. */
  function memberIdByName(name) {
    if (!name) return null;
    var needle = String(name).trim().toLowerCase();
    if (!needle) return null;
    var hit = (data.members || []).filter(function (m) {
      var full = String(m.name || "").toLowerCase();
      return full === needle || full.split(" ")[0] === needle || full.indexOf(needle) === 0;
    })[0];
    return hit ? hit.id : null;
  }

  /** Write the report into the `meetings` shape the Meeting page reads. */
  function saveRecap() {
    var report = recap.report;
    var now = new Date();

    return WOS.db.create("meetings", {
      title: WOS.nameOr(report.title, t("common.untitled")),
      startAt: now.toISOString(),
      durationMin: 60,
      participantIds: [],
      projectId: null,
      status: "processed",
      tags: report.keywords || [],
      ownerId: WOS.config.currentUserId,
      divisionId: "",
      objective: report.summary || "",
      decisionsNeeded: [],
      preReads: [],
      sop: [],
      summary: report.summary || "",
      fact: report.fact || [],
      assumption: report.assumption || [],
      proposal: report.proposal || [],
      decisions: report.decisions || [],
      openQuestions: report.openQuestions || [],
      actionItems: (report.actionItems || []).map(function (item, index) {
        return {
          id: "ai_" + Date.now().toString(36) + index,
          text: item.text,
          // An unmatched name is left unassigned on purpose: a wrong owner is
          // worse than none, because nobody double-checks an assigned task.
          ownerId: memberIdByName(item.owner),
          ownerHint: item.owner || "",
          priority: item.priority || "medium",
          dueAt: null,
          dueHint: item.dueHint || "",
          done: false,
          convertedTaskId: null,
        };
      }),
      transcript: [],
      keywords: report.keywords || [],
      language: report.language || "",
      sentiment: "",
      aiConfidence: report.confidence === undefined ? null : report.confidence,
    });
  }

  function runRecap(promise) {
    recap.busy = true;
    recap.error = "";
    recap.stage = "uploading";
    recap.ratio = 0;
    render();

    promise
      .then(function (report) {
        recap.busy = false;
        recap.report = report;
        render();
      })
      .catch(function (error) {
        console.error("[wos] the recap failed", error);
        recap.busy = false;
        recap.error = (error && error.message) || String(error);
        render();
      });
  }

  function stageTracker() {
    return function (stage, ratio) {
      recap.stage = stage;
      recap.ratio = ratio || 0;
      // Only the upload has a real percentage; repainting on every progress
      // event during the other stages would just flicker.
      if (stage === "uploading") paintProgress();
      else render();
    };
  }

  /** Update the bar in place — a full render would drop the spinner's animation. */
  function paintProgress() {
    var bar = WOS.$(".recap__bar span", page);
    if (!bar) {
      render();
      return;
    }
    bar.style.width = Math.round(recap.ratio * 100) + "%";
    var label = bar.parentNode.nextElementSibling;
    if (label) label.textContent = Math.round(recap.ratio * 100) + "%";
  }



  /* ── Render ────────────────────────────────────────────────── */

  var VIEWS = ["home", "meetings", "notes", "recap"];

  function render() {
    page.innerHTML =
      '<div class="chips scroll-x">' +
      VIEWS.map(function (v) {
        return (
          '<button type="button" class="chip' + (state.view === v ? " is-active" : "") +
          '" data-view="' + v + '">' + esc(t("notes.view." + v)) + "</button>"
        );
      }).join("") +
      "</div>" +
      '<div data-view-body style="margin-top:18px"></div>';

    var body = WOS.$("[data-view-body]", page);
    if (state.view === "home") body.innerHTML = homeView();
    else if (state.view === "meetings") body.innerHTML = meetingsView();
    else if (state.view === "notes") body.innerHTML = notesListView();
    else body.innerHTML = recapView();
  }

  function bind() {
    WOS.on(page, "click", "[data-view]", function (event, target) {
      state.view = target.dataset.view;
      render();
    });
    WOS.on(page, "click", "[data-goto-view]", function (event, target) {
      event.preventDefault();
      state.view = target.dataset.gotoView;
      render();
    });
    WOS.on(page, "click", "[data-meetings-filter]", function (event, target) {
      state.meetingsFilter = target.dataset.meetingsFilter;
      render();
    });
    WOS.on(page, "change", "[data-recap-file]", function (event, input) {
      var file = input.files && input.files[0];
      if (!file) return;
      runRecap(WOS.ai.fromRecording(file, { onStage: stageTracker() }));
    });

    // Dropping a file onto the label, as well as picking one through it.
    WOS.on(page, "dragover", "[data-recap-drop]", function (event, drop) {
      event.preventDefault();
      drop.classList.add("is-over");
    });
    WOS.on(page, "dragleave", "[data-recap-drop]", function (event, drop) {
      drop.classList.remove("is-over");
    });
    WOS.on(page, "drop", "[data-recap-drop]", function (event, drop) {
      event.preventDefault();
      drop.classList.remove("is-over");
      var file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
      if (file) runRecap(WOS.ai.fromRecording(file, { onStage: stageTracker() }));
    });

    WOS.on(page, "click", "[data-recap-analyze]", function () {
      var box = WOS.$("[data-recap-transcript]", page);
      var text = box ? box.value.trim() : "";
      if (!text) {
        ui.toast(t("recap.pasteEmpty"), "error");
        return;
      }
      recap.stage = "reading";
      runRecap(WOS.ai.fromTranscript(text, { onStage: stageTracker() }));
    });

    WOS.on(page, "click", "[data-recap-reset]", function () {
      recap.report = null;
      recap.error = "";
      render();
    });

    WOS.on(page, "click", "[data-recap-copy]", function () {
      ui.copyText(recapText());
      ui.toast(t("mom.copied"));
    });

    WOS.on(page, "click", "[data-recap-save]", function (event, button) {
      button.disabled = true;
      saveRecap()
        .then(function (saved) {
          window.location.href = "meeting.html?id=" + saved.id;
        })
        .catch(function (error) {
          console.error("[wos] saving the recap failed", error);
          button.disabled = false;
          ui.toast(t("recap.saveFailed") + " (" + ((error && error.message) || error) + ")", "error");
        });
    });
    WOS.on(page, "click", "[data-suggestion]", function () {
      ui.toast(t("mi.aiPending"));
    });
    WOS.on(page, "click", "[data-voice-capture]", function () {
      ui.toast(t("mi.aiPending"));
    });

    WOS.on(page, "click", "[data-save-capture]", function () {
      var textarea = WOS.$("[data-quick-capture]", page);
      var text = textarea.value.trim();
      if (!text) return;
      var title = text.split("\n")[0].slice(0, 60) || t("notes.untitled");
      WOS.db
        .create("notes", {
          title: title,
          icon: "🗒️",
          kind: "note",
          content: text,
          tags: [],
          projectId: null,
          authorId: WOS.config.currentUserId,
          pinned: false,
          archived: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .then(function () {
          ui.toast(t("state.saved"));
          return refresh();
        });
    });

    WOS.on(page, "click", "[data-create-note]", function () {
      window.location.href = "note.html?new=1";
    });

  }

  function refresh() {
    return WOS.db.loadAll(["notes"]).then(function (loaded) {
      data.notes = loaded.notes;
      render();
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({
      active: "notes",
      title: t("notes.title"),
      actions:
        '<button type="button" class="btn btn--outline btn--sm" data-ask-ai>' + WOS.icon("bot", 14) + esc(t("action.askAi")) + "</button>" +
        '<button type="button" class="btn btn--primary btn--sm" data-create-note>' + WOS.icon("file-pen", 14, { color: "#fff" }) + esc(t("action.createNew")) + "</button>",
    })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(4, 90);
      return WOS.db.loadAll(["notes", "meetings", "members", "projects"]);
    })
    .then(function (loaded) {
      data = loaded;
      data.memberById = WOS.indexById(loaded.members);
      data.projectById = WOS.indexById(loaded.projects);
      render();
      bind();
      WOS.$$("[data-create-note]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          window.location.href = "note.html?new=1";
        });
      });
      WOS.$("[data-ask-ai]").addEventListener("click", function () {
        ui.toast(t("mi.aiPending"));
      });
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
