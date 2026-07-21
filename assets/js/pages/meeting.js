/* ──────────────────────────────────────────────────────────────
   Meeting Detail — AI-structured meeting notes: summary,
   highlights, lowlights, action items (convertible to tasks),
   decisions, open questions, transcript, and an AI chat stub.
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
  var meeting;
  var meetingId = WOS.param("id");

  function render() {
    if (!meeting) {
      page.innerHTML = '<div class="card">' + ui.empty(t("meetings.notFound"), null, '<a class="btn btn--outline" href="notes.html">' + esc(t("action.back")) + "</a>", "message-square") + "</div>";
      return;
    }

    var participants = (meeting.participantIds || []).map(function (id) {
      return data.memberById.get(id);
    }).filter(Boolean);
    var project = data.projectById.get(meeting.projectId);
    var owner = data.memberById.get(meeting.ownerId);

    page.innerHTML =
      '<div class="spread" style="align-items:flex-start;flex-wrap:wrap;gap:16px">' +
      '<div><h1 class="page__title" style="font-size:19px">' + esc(meeting.title) + "</h1>" +
      '<div class="cluster" style="margin-top:8px">' +
      '<span class="text-sm muted">' + esc(fmt.fullDate(meeting.startAt)) + "</span>" +
      '<span class="text-sm muted">·</span>' +
      '<span class="text-sm muted">' + esc(fmt.duration(meeting.durationMin)) + "</span>" +
      '<span class="text-sm muted">·</span>' + ui.avatarStack(participants, 22, 5) +
      (project ? ui.badge(project.name, "info") : "") +
      ui.badge(t("meetings.status." + meeting.status), ui.MEETING_TONE[meeting.status]) +
      "</div></div>" +
      '<div class="cluster">' +
      '<button type="button" class="btn btn--outline btn--sm" data-share>' + esc(t("action.share")) + "</button>" +
      '<button type="button" class="btn btn--primary btn--sm" data-export>' + esc(t("action.export")) + "</button>" +
      "</div></div>" +
      '<div style="display:flex;gap:24px;margin-top:20px;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:320px">' + mainColumn() + "</div>" +
      '<div style="width:260px;flex:none">' + infoRail(participants, owner) + "</div>" +
      "</div>";
  }

  function sectionTitle(label) {
    return '<h2 class="section-title" style="margin-top:20px">' + esc(label) + "</h2>";
  }

  function mainColumn() {
    if (!meeting.summary && !meeting.highlights.length) {
      return '<div class="card">' + ui.empty(t("meetings.noSummary"), null, null, "bot") + "</div>";
    }

    var html = '<h2 class="section-title">' + esc(t("meetings.executiveSummary")) + "</h2>" +
      '<div class="card"><p class="text-sm" style="line-height:1.75;color:var(--text-body)">' + esc(meeting.summary) + "</p></div>";

    if (meeting.highlights.length) {
      html += sectionTitle(t("meetings.highlights")) +
        '<div class="grid grid--md-2">' +
        meeting.highlights
          .map(function (h) {
            var style = ui.HIGHLIGHT_STYLE[h.kind];
            return (
              '<div class="highlight"><span class="highlight__stripe" style="background:' + style.stripe + '"></span>' +
              '<div class="highlight__kind" style="color:' + style.color + '">' + esc(t("meetings.highlight." + h.kind)) + "</div>" +
              '<p class="highlight__text">' + esc(h.text) + "</p></div>"
            );
          })
          .join("") +
        "</div>";
    }

    if (meeting.lowlights.length) {
      html += sectionTitle(t("meetings.lowlights")) +
        '<div class="card card--flush"><div style="padding:0 20px">' +
        meeting.lowlights
          .map(function (l) {
            return '<div class="row" style="align-items:flex-start">' + icon("crosshair", 13, { color: "#e11d48" }) +
              '<span class="text-sm" style="color:var(--text-body)">' + esc(l) + "</span></div>";
          })
          .join("") +
        "</div></div>";
    }

    if (meeting.actionItems.length) {
      html += sectionTitle(t("meetings.actionItems")) +
        '<div class="card card--flush">' +
        meeting.actionItems
          .map(function (a) {
            var owner = data.memberById.get(a.ownerId);
            return (
              '<div class="row" style="padding:12px 18px">' +
              ui.checkbox(a.done, a.text, { "action-toggle": a.id }) +
              '<span class="grow text-sm" style="color:var(--text-body)' + (a.done ? ";text-decoration:line-through;color:var(--slate-400)" : "") + '">' + esc(a.text) + "</span>" +
              ui.avatar(owner, 24) + ui.priorityBadge(a.priority) +
              '<span class="text-label muted" style="width:44px;text-align:right">' + esc(fmt.dayMonth(a.dueAt)) + "</span>" +
              (a.convertedTaskId
                ? '<span class="badge badge--success">' + esc(t("meetings.converted")) + "</span>"
                : '<button type="button" class="btn btn--tinted btn--sm" data-convert-action="' + esc(a.id) + '">' + esc(t("action.convert")) + "</button>") +
              "</div>"
            );
          })
          .join("") +
        "</div>";
    }

    if (meeting.decisions.length) {
      html += sectionTitle(t("meetings.decisions")) +
        '<div class="card">' +
        meeting.decisions
          .map(function (d, i) {
            var isLast = i === meeting.decisions.length - 1;
            return (
              '<div class="timeline-list__item">' +
              '<div class="timeline-list__rail"><span class="timeline-list__dot"></span>' +
              (isLast ? "" : '<span class="timeline-list__line"></span>') + "</div>" +
              '<div><p class="text-label faint">' + esc(d.time) + '</p><p class="text-sm" style="margin-top:2px;color:var(--text-body)">' + esc(d.text) + "</p></div></div>"
            );
          })
          .join("") +
        "</div>";
    }

    if (meeting.openQuestions.length) {
      html += sectionTitle(t("meetings.openQuestions")) +
        '<div class="card card--flush"><div style="padding:0 20px">' +
        meeting.openQuestions
          .map(function (q) {
            return '<div class="row" style="align-items:flex-start">' + icon("target", 13, { color: "var(--amber-600)" }) +
              '<span class="text-sm" style="color:var(--text-body)">' + esc(q) + "</span></div>";
          })
          .join("") +
        "</div></div>";
    }

    if (meeting.transcript.length) {
      html +=
        '<div class="spread" style="margin:20px 0 8px"><h2 class="section-title" style="margin:0">' + esc(t("meetings.transcript")) + "</h2>" +
        '<div class="cluster"><button type="button" class="btn btn--outline btn--sm" data-transcript-search>' + icon("search", 13) + esc(t("action.search")) +
        '</button><button type="button" class="btn btn--outline btn--sm" data-transcript-copy>' + icon("file-pen", 13) + esc(t("action.copy")) + "</button></div></div>" +
        '<div class="card">' +
        meeting.transcript
          .map(function (line) {
            var speaker = data.memberById.get(line.speakerId);
            return (
              '<div class="row" style="align-items:flex-start">' + ui.avatar(speaker, 28) +
              '<span class="grow"><span class="cluster" style="gap:8px"><span class="text-sm fw-bold strong">' + esc(line.speakerName) + "</span>" +
              '<span class="text-label faint">' + esc(line.time) + "</span></span>" +
              '<p class="text-sm" style="margin-top:3px;color:var(--text-body);line-height:1.6">' + esc(line.text) + "</p></span></div>"
            );
          })
          .join("") +
        "</div>";
    }

    html +=
      sectionTitle(t("meetings.aiChat")) +
      '<div class="card">' +
      '<div class="cluster" style="margin-bottom:12px">' +
      ["Summarize", "Generate Email", "Generate Follow Up", "Generate Tasks"]
        .map(function (label) {
          return '<button type="button" class="chip" data-ai-chip>' + esc(label) + "</button>";
        })
        .join("") +
      "</div>" +
      '<button type="button" class="cluster cluster--nowrap tap" data-ask-meeting style="width:100%;text-align:left;background:var(--slate-50);border:1px solid var(--border-default);border-radius:12px;padding:0 14px;height:42px">' +
      icon("bot", 15, { color: "var(--antar-purple)" }) +
      '<span class="text-sm muted">' + esc(t("meetings.askAnything")) + "</span></button></div>";

    return html;
  }

  function infoRail(participants, owner) {
    var rows = [
      [t("meetings.info.duration"), fmt.duration(meeting.durationMin)],
      [t("meetings.info.participants"), participants.length],
      [t("meetings.info.recording"), meeting.status === "no_recording" ? "—" : t("meetings.info.available")],
      [t("meetings.info.language"), meeting.language || "—"],
      [t("meetings.info.sentiment"), meeting.sentiment || "—"],
      [t("meetings.info.aiConfidence"), meeting.aiConfidence ? meeting.aiConfidence + "%" : "—"],
    ];

    return (
      '<div class="card"><h2 class="card__title" style="font-size:13px">' + esc(t("meetings.meetingInfo")) + "</h2>" +
      rows
        .map(function (row) {
          return '<div class="spread" style="padding:8px 0;border-top:1px solid var(--border-subtle)"><span class="text-label muted">' +
            esc(row[0]) + '</span><span class="text-label fw-semibold strong">' + esc(String(row[1])) + "</span></div>";
        })
        .join("") +
      "</div>" +
      (meeting.keywords.length
        ? '<div class="card" style="margin-top:20px"><h2 class="card__title" style="font-size:13px">' + esc(t("meetings.keywords")) + "</h2>" +
          '<div class="cluster" style="gap:6px;margin-top:10px">' + ui.tags(meeting.keywords) + "</div></div>"
        : "")
    );
  }

  function bind() {
    WOS.on(page, "click", "[data-share], [data-export], [data-transcript-search], [data-transcript-copy], [data-ai-chip], [data-ask-meeting]", function () {
      ui.toast(t("mi.aiPending"));
    });

    WOS.on(page, "click", "[data-convert-action]", function (event, target) {
      var itemId = target.dataset.convertAction;
      var item = meeting.actionItems.filter(function (a) {
        return a.id === itemId;
      })[0];
      if (!item || item.convertedTaskId) return;

      WOS.db
        .create("tasks", {
          title: item.text,
          description: "",
          priority: item.priority,
          status: "todo",
          dueAt: item.dueAt,
          assigneeId: item.ownerId,
          projectId: meeting.projectId,
          tags: [],
          order: Date.now(),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .then(function (task) {
          var nextItems = meeting.actionItems.map(function (a) {
            return a.id === itemId ? Object.assign({}, a, { convertedTaskId: task.id }) : a;
          });
          return WOS.db.update("meetings", meeting.id, { actionItems: nextItems });
        })
        .then(function () {
          ui.toast(t("meetings.converted"));
          return refresh();
        });
    });

    WOS.on(page, "click", "[data-action-toggle]", function (event, target) {
      var itemId = target.dataset.actionToggle;
      var nextItems = meeting.actionItems.map(function (a) {
        return a.id === itemId ? Object.assign({}, a, { done: !a.done }) : a;
      });
      WOS.db.update("meetings", meeting.id, { actionItems: nextItems }).then(refresh);
    });
  }

  function refresh() {
    return WOS.db.get("meetings", meeting.id).then(function (found) {
      meeting = found;
      render();
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.db
    .get("meetings", meetingId)
    .then(function (found) {
      meeting = found;
      return WOS.shell.mount({
        active: "notes",
        crumbs: [{ label: t("notes.title"), href: "notes.html" }, { label: meeting ? meeting.title : t("meetings.notFound") }],
      });
    })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(5, 100);
      return WOS.db.loadAll(["members", "projects"]);
    })
    .then(function (loaded) {
      data = loaded;
      data.memberById = WOS.indexById(loaded.members);
      data.projectById = WOS.indexById(loaded.projects);
      render();
      bind();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
