/* ──────────────────────────────────────────────────────────────
   Notes & Meetings hub — Home / Meetings / Notes / Daily / Ideas.
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
  var state = { view: "home", meetingsFilter: "all", ideasFilter: "all" };

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
      { id: "all", key: "notifications.filter.all" },
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

  /* ── Daily ─────────────────────────────────────────────────── */

  function dailyView() {
    var dailies = data.notes.filter(function (n) {
      return n.kind === "daily";
    }).sort(WOS.by("createdAt", "desc"));

    var groups = WOS.groupBy(dailies, function (n) {
      return fmt.dayGroup(n.createdAt);
    });

    var main = Array.from(groups.keys())
      .map(function (label) {
        return (
          '<p class="eyebrow" style="margin-top:16px">' + esc(label) + "</p>" +
          groups
            .get(label)
            .map(function (n) {
              return (
                '<a class="card card-lift" href="note.html?id=' + esc(n.id) + '" style="display:flex;gap:12px;margin-top:10px;padding-left:14px;position:relative;overflow:hidden">' +
                '<span style="position:absolute;left:0;top:0;height:100%;width:4px;background:var(--antar-purple)"></span>' +
                '<span><span class="text-label faint" style="display:block">' + esc(fmt.time(n.createdAt)) + "</span>" +
                '<span style="display:block;font-size:14px;font-weight:600;color:var(--text-strong);margin-top:2px">' + esc(WOS.nameOr(n.title, t("common.untitled"))) + "</span>" +
                '<span class="text-sm muted" style="display:block;margin-top:3px;line-height:1.5">' + esc(n.content) + "</span></span></a>"
              );
            })
            .join("")
        );
      })
      .join("");

    return (
      '<div class="grid grid--lg-2" style="grid-template-columns:1fr 260px;align-items:start">' +
      '<div>' + (main || '<div class="card">' + ui.empty(t("state.empty")) + "</div>") + "</div>" +
      '<div class="card" style="height:fit-content">' +
      '<h2 class="card__title">' + esc(fmt.monthYear(new Date())) + "</h2>" +
      '<div class="mini-cal" style="margin-top:10px">' + miniCalDays(dailies) + "</div></div></div>"
    );
  }

  function miniCalDays(dailies) {
    var now = new Date();
    var daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    var hasNote = {};
    dailies.forEach(function (n) {
      var d = new Date(n.createdAt);
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) hasNote[d.getDate()] = true;
    });
    var html = "";
    for (var i = 1; i <= daysInMonth; i++) {
      var isToday = i === now.getDate();
      html += '<span class="mini-cal__day' + (isToday ? " is-today" : "") + '"' +
        (hasNote[i] && !isToday ? ' style="background:var(--antar-purple-light);color:var(--antar-purple);font-weight:700"' : "") + ">" + i + "</span>";
    }
    return html;
  }

  /* ── Ideas ─────────────────────────────────────────────────── */

  function ideasView() {
    var filter = state.ideasFilter;
    var list = data.ideas.filter(function (i) {
      return filter === "all" || i.status === filter;
    }).sort(WOS.by("createdAt", "desc"));

    var chips = [
      { id: "all", label: t("projects.filter.all") },
      { id: "draft", label: t("ideas.status.draft") },
      { id: "validated", label: t("ideas.status.validated") },
      { id: "archived", label: t("ideas.status.archived") },
    ];

    var head =
      '<div class="page__head">' +
      '<h2 class="page__title" style="font-size:19px">' + esc(t("ideas.title")) + "</h2>" +
      '<div class="cluster">' +
      '<div class="chips">' +
      chips
        .map(function (chip) {
          return (
            '<button type="button" class="chip' + (filter === chip.id ? " is-active" : "") +
            '" data-ideas-filter="' + chip.id + '">' + esc(chip.label) + "</button>"
          );
        })
        .join("") +
      "</div>" +
      '<button type="button" class="btn btn--primary btn--sm" data-new-idea>' + icon("lightbulb", 14, { color: "#fff" }) + esc(t("ideas.newIdea")) + "</button>" +
      "</div></div>";

    if (!list.length) return head + '<div class="card" style="margin-top:18px">' + ui.empty(t("state.empty"), null, null, "lightbulb") + "</div>";

    return (
      head +
      '<div class="masonry" style="margin-top:18px">' +
      list
        .map(function (i) {
          return (
            '<div class="card">' + ui.badge(t("ideas.status." + i.status), ui.IDEA_TONE[i.status]) +
            '<p style="font-size:14.5px;font-weight:700;color:var(--text-strong);margin-top:10px">' + esc(WOS.nameOr(i.title, t("common.untitled"))) + "</p>" +
            '<p class="text-label muted" style="margin-top:6px;line-height:1.6">' + esc(i.text) + "</p></div>"
          );
        })
        .join("") +
      "</div>"
    );
  }

  /* ── Render ────────────────────────────────────────────────── */

  var VIEWS = ["home", "meetings", "notes", "daily", "ideas"];

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
    else if (state.view === "daily") body.innerHTML = dailyView();
    else body.innerHTML = ideasView();
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
    WOS.on(page, "click", "[data-ideas-filter]", function (event, target) {
      state.ideasFilter = target.dataset.ideasFilter;
      render();
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

    WOS.on(page, "click", "[data-new-idea]", openIdeaModal);
  }

  function openIdeaModal() {
    var body =
      '<form class="stack">' +
      '<div class="field"><label class="field__label">' + esc(t("ideas.title")) + '</label>' +
      '<input class="input" name="title" required></div>' +
      '<div class="field"><label class="field__label">' + esc(t("action.edit")) + '</label>' +
      '<textarea class="textarea" name="text" rows="3"></textarea></div>' +
      '<div class="field"><label class="field__label">' + esc(t("tasks.col.status")) + '</label>' +
      '<select class="select" name="status">' +
      ["draft", "validated", "archived"].map(function (s) {
        return '<option value="' + s + '">' + esc(t("ideas.status." + s)) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="modal__actions">' +
      '<button type="button" class="btn btn--ghost" data-close-modal>' + esc(t("action.cancel")) + "</button>" +
      '<button type="submit" class="btn btn--primary">' + esc(t("action.save")) + "</button></div></form>";

    ui.modal({
      title: t("ideas.newIdea"),
      body: body,
      onSubmit: function (form) {
        var formData = new FormData(form);
        var title = String(formData.get("title") || "").trim();
        if (!title) return;
        WOS.db
          .create("ideas", {
            title: title,
            text: formData.get("text") || "",
            status: formData.get("status"),
            authorId: WOS.config.currentUserId,
            createdAt: new Date().toISOString(),
          })
          .then(function () {
            ui.closeModal();
            return refresh();
          });
      },
    });
  }

  function refresh() {
    return WOS.db.loadAll(["notes", "ideas"]).then(function (loaded) {
      data.notes = loaded.notes;
      data.ideas = loaded.ideas;
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
      return WOS.db.loadAll(["notes", "meetings", "ideas", "members", "projects"]);
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
