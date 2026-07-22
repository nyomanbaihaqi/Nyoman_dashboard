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

  /* ── MoM: the five-point chain ──────────────────────────────
     Fact → Assumption → Proposal → Decision → Action, read top to
     bottom. The order is the argument: what is true, what we are
     still guessing, what was put forward, what was settled, what
     happens next. Rendering them as one numbered chain rather than
     five unrelated cards is what makes that legible.
     ────────────────────────────────────────────────────────── */

  var MOM_STEPS = [
    { key: "fact", tone: "var(--sky-600)", tint: "#f0f9ff" },
    { key: "assumption", tone: "var(--amber-600)", tint: "#fffbeb" },
    { key: "proposal", tone: "var(--antar-purple)", tint: "var(--antar-purple-light)" },
    { key: "decision", tone: "var(--emerald-600)", tint: "#ecfdf5" },
  ];

  function momSection() {
    var html =
      '<div class="spread" style="margin-bottom:10px">' +
      '<h2 class="section-title" style="margin:0">' + esc(t("mom.title")) + "</h2>" +
      '<button type="button" class="btn btn--outline btn--sm" data-copy-mom>' +
      icon("message-square", 13) + esc(t("mom.copy")) + "</button></div>" +
      '<div class="card"><div class="stack">';

    MOM_STEPS.forEach(function (step, index) {
      // `decision` holds {time,text} objects; the other three are plain strings.
      var items =
        step.key === "decision"
          ? (meeting.decisions || []).map(function (d) {
              return d.text;
            })
          : meeting[step.key] || [];

      html +=
        '<div style="display:flex;gap:14px">' +
        '<div style="display:flex;flex-direction:column;align-items:center;flex:none">' +
        '<span style="width:26px;height:26px;border-radius:50%;flex:none;display:flex;align-items:center;' +
        "justify-content:center;font-size:11px;font-weight:700;background:" + step.tint + ";color:" + step.tone + '">' +
        (index + 1) + "</span>" +
        (index < MOM_STEPS.length - 1 ? '<span style="width:1.5px;flex:1;margin-top:4px;background:var(--border-subtle)"></span>' : "") +
        "</div>" +
        '<div style="flex:1;min-width:0;padding-bottom:' + (index < MOM_STEPS.length - 1 ? "18px" : "0") + '">' +
        '<p class="eyebrow" style="color:' + step.tone + '">' + esc(t("mom." + step.key)) + "</p>" +
        '<p class="text-label faint" style="margin-top:1px">' + esc(t("mom." + step.key + ".hint")) + "</p>" +
        (items.length
          ? '<ul style="margin-top:8px;display:flex;flex-direction:column;gap:6px">' +
            items
              .map(function (text) {
                return (
                  '<li style="display:flex;gap:8px;font-size:13.5px;line-height:1.55;color:var(--text-body)">' +
                  '<span style="color:' + step.tone + ';flex:none">•</span><span>' + esc(text) + "</span></li>"
                );
              })
              .join("") +
            "</ul>"
          : '<p class="text-sm muted" style="margin-top:8px">' + esc(t("mom.empty")) + "</p>") +
        "</div></div>";
    });

    return html + "</div></div>";
  }

  /** MoM as plain text, in the handbook's layout, ready to paste into WA. */
  function momText() {
    var participants = (meeting.participantIds || []).map(function (id) {
      var m = data.memberById.get(id);
      return m ? m.name : "—";
    });

    var lines = [];
    lines.push("*MEETING NOTES*");
    lines.push("Topik: " + meeting.title);
    lines.push("Tanggal/Waktu: " + fmt.fullDate(meeting.startAt) + ", " + fmt.time(meeting.startAt));
    lines.push("Peserta: " + (participants.join(", ") || "—"));
    if (meeting.objective) lines.push("Tujuan: " + meeting.objective);
    lines.push("");

    MOM_STEPS.forEach(function (step) {
      var items =
        step.key === "decision"
          ? (meeting.decisions || []).map(function (d) {
              return d.text;
            })
          : meeting[step.key] || [];
      lines.push("*" + t("mom." + step.key).toUpperCase() + ":*");
      if (!items.length) lines.push("-");
      items.forEach(function (text) {
        lines.push("- " + text);
      });
      lines.push("");
    });

    lines.push("*ACTION ITEMS:*");
    if (!(meeting.actionItems || []).length) {
      lines.push("-");
    } else {
      meeting.actionItems.forEach(function (a) {
        var owner = data.memberById.get(a.ownerId);
        lines.push(
          "- [" + (a.done ? "x" : " ") + "] " + a.text +
            " — " + (owner ? owner.name : a.ownerHint || "—") +
            " — " + (a.dueAt ? fmt.dayMonth(a.dueAt) : a.dueHint || "tanpa tenggat"),
        );
      });
    }

    return lines.join("\n");
  }

  /* ── Meeting SOP ───────────────────────────────────────────── */

  function sopSection() {
    var sop = meeting.sop || {};
    var steps = WOS.MEETING_SOP;
    var done = steps.filter(function (id) {
      return sop[id];
    }).length;

    return (
      '<div class="spread" style="margin-bottom:10px">' +
      '<h2 class="section-title" style="margin:0">' + esc(t("meetings.sop")) + "</h2>" +
      '<span class="text-label ' + (done === steps.length ? "" : "muted") + '" style="' +
      (done === steps.length ? "color:var(--emerald-600);font-weight:700" : "") + '">' +
      esc(t("meetings.sopProgress", { done: done, total: steps.length })) + "</span></div>" +
      '<div class="card"><div style="margin-bottom:12px">' + ui.progress(Math.round((done / steps.length) * 100), "var(--emerald-500)") + "</div>" +
      steps
        .map(function (id) {
          return (
            '<div class="row" style="padding:9px 0">' +
            ui.checkbox(!!sop[id], t("meetings.sop." + id), { "sop-toggle": id }) +
            '<span class="text-sm" style="color:' + (sop[id] ? "var(--slate-400);text-decoration:line-through" : "var(--text-body)") + '">' +
            esc(t("meetings.sop." + id)) + "</span></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  function prepSection() {
    var needed = meeting.decisionsNeeded || [];
    var preReads = meeting.preReads || [];
    if (!meeting.objective && !needed.length && !preReads.length) return "";

    return (
      '<div class="card">' +
      (meeting.objective
        ? '<p class="eyebrow">' + esc(t("meetings.objective")) + "</p>" +
          '<p class="text-sm" style="margin-top:6px;color:var(--text-body);line-height:1.6">' + esc(meeting.objective) + "</p>"
        : "") +
      (needed.length
        ? '<p class="eyebrow" style="margin-top:16px">' + esc(t("meetings.decisionsNeeded")) + "</p>" +
          '<ul style="margin-top:6px;display:flex;flex-direction:column;gap:5px">' +
          needed
            .map(function (q) {
              return (
                '<li style="display:flex;gap:8px;font-size:13.5px;color:var(--text-body)">' +
                icon("target", 13, { color: "var(--amber-600)" }) + "<span>" + esc(q) + "</span></li>"
              );
            })
            .join("") +
          "</ul>"
        : "") +
      '<p class="eyebrow" style="margin-top:16px">' + esc(t("meetings.preRead")) + "</p>" +
      (preReads.length
        ? preReads
            .map(function (p) {
              return (
                '<a class="row" href="' + esc(p.url || "#") + '">' + icon("paperclip", 14, { color: "var(--slate-400)" }) +
                '<span class="text-sm grow truncate" style="color:var(--text-body)">' + esc(p.name) + "</span></a>"
              );
            })
            .join("")
        : '<p class="text-sm muted" style="margin-top:6px">' + esc(t("meetings.noPreRead")) + "</p>") +
      "</div>"
    );
  }

  function mainColumn() {
    var html = prepSection() + sopSection() + momSection();

    if (meeting.summary) {
      html += sectionTitle(t("meetings.executiveSummary")) +
        '<div class="card"><p class="text-sm" style="line-height:1.75;color:var(--text-body)">' + esc(meeting.summary) + "</p></div>";
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
              // An AI-extracted item can name someone who isn't a member yet.
              // Showing the name it heard beats a blank avatar that loses it.
              (owner
                ? ui.avatar(owner, 24)
                : a.ownerHint
                  ? '<span class="text-label muted" style="max-width:90px" title="' + esc(a.ownerHint) + '">' + esc(a.ownerHint) + "</span>"
                  : ui.avatar(owner, 24)) +
              ui.priorityBadge(a.priority) +
              '<span class="text-label muted" style="width:60px;text-align:right">' +
              esc(a.dueAt ? fmt.dayMonth(a.dueAt) : a.dueHint || "—") + "</span>" +
              (a.convertedTaskId
                ? '<span class="badge badge--success">' + esc(t("meetings.converted")) + "</span>"
                : '<button type="button" class="btn btn--tinted btn--sm" data-convert-action="' + esc(a.id) + '">' + esc(t("action.convert")) + "</button>") +
              "</div>"
            );
          })
          .join("") +
        "</div>";
    }

    // Decisions are no longer a section of their own — they are step 4 of the
    // MoM chain above, where they sit next to the reasoning that produced them.

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
    WOS.on(page, "click", "[data-share], [data-export], [data-transcript-search], [data-ai-chip], [data-ask-meeting]", function () {
      ui.toast(t("mi.aiPending"));
    });

    WOS.on(page, "click", "[data-copy-mom]", function () {
      ui.copyText(momText(), "mom.copied");
    });

    WOS.on(page, "click", "[data-transcript-copy]", function () {
      var text = meeting.transcript
        .map(function (line) {
          return line.time + " " + line.speakerName + ": " + line.text;
        })
        .join("\n");
      ui.copyText(text, "action.copy");
    });

    WOS.on(page, "click", "[data-sop-toggle]", function (event, target) {
      var step = target.dataset.sopToggle;
      var next = Object.assign({}, meeting.sop || {});
      next[step] = !next[step];
      WOS.db.update("meetings", meeting.id, { sop: next }).then(refresh);
    });

    WOS.on(page, "click", "[data-convert-action]", function (event, target) {
      var itemId = target.dataset.convertAction;
      var item = meeting.actionItems.filter(function (a) {
        return a.id === itemId;
      })[0];
      if (!item || item.convertedTaskId) return;

      var owner = data.memberById.get(item.ownerId);

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
          // Route to the owner's division, falling back to the meeting's, so
          // the weekly per-division follow-up can find it.
          divisionId: (owner && owner.divisionId) || meeting.divisionId || "",
          ownerConfirmed: false,
          deadlineAgreed: false,
          blocker: "",
          escalated: false,
          sourceMeetingId: meeting.id,
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
