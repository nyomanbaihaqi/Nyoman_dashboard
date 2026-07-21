/* ──────────────────────────────────────────────────────────────
   Calendar — Week / Month / Agenda over the events collection,
   with a Meeting Detail rail and Color Labels legend.
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
  var state = { view: "week", anchor: new Date(), selectedId: WOS.param("event") || "" };

  var HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  var LABELS = ["deep_work", "meetings", "personal", "urgent", "travel"];

  function startOfWeek(date) {
    var d = new Date(date);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d;
  }

  function addDays(date, n) {
    var d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function sameDay(a, b) {
    return fmt.dayDelta(a, b) === 0;
  }

  function selectedEvent() {
    return data.events.filter(function (e) {
      return e.id === state.selectedId;
    })[0];
  }

  /* ── Week view ─────────────────────────────────────────────── */

  function weekView() {
    var monday = startOfWeek(state.anchor);
    var days = [];
    for (var i = 0; i < 7; i++) days.push(addDays(monday, i));

    var head = days
      .map(function (d) {
        var isToday = sameDay(d, new Date());
        return (
          '<div class="calendar__day-name' + (isToday ? " is-today" : "") + '">' +
          d.toLocaleDateString(undefined, { weekday: "short" }) + " " + d.getDate() + "</div>"
        );
      })
      .join("");

    var rows = HOURS.map(function (hour) {
      var cells = days
        .map(function (d) {
          var dayEvents = data.events.filter(function (e) {
            var start = new Date(e.startAt);
            return sameDay(start, d) && start.getHours() === hour;
          });
          return (
            '<div class="calendar__cell">' +
            dayEvents
              .map(function (e) {
                return (
                  '<button type="button" class="calendar__event tap" data-select-event="' + esc(e.id) +
                  '" style="background:' + ui.EVENT_TINT[e.label] + ";border-left-color:" + ui.EVENT_COLOR[e.label] +
                  '"><span class="calendar__event-title">' + esc(e.title) + "</span>" +
                  '<span class="calendar__event-meta">' + esc(fmt.duration(Math.round((new Date(e.endAt) - new Date(e.startAt)) / 60000))) +
                  "</span></button>"
                );
              })
              .join("") +
            "</div>"
          );
        })
        .join("");
      return '<div class="calendar__row"><div class="calendar__hour">' + String(hour).padStart(2, "0") + ":00</div>" + cells + "</div>";
    }).join("");

    return (
      '<div class="scroll-x"><div class="calendar"><div class="calendar__head"><div></div>' + head + "</div>" + rows + "</div></div>"
    );
  }

  /* ── Month view ────────────────────────────────────────────── */

  function monthView() {
    var first = new Date(state.anchor.getFullYear(), state.anchor.getMonth(), 1);
    var gridStart = startOfWeek(first);
    var cells = [];
    for (var i = 0; i < 42; i++) cells.push(addDays(gridStart, i));

    var head = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
      .map(function (d) {
        return '<div class="calendar__day-name">' + d + "</div>";
      })
      .join("");

    var body = cells
      .map(function (d) {
        var inMonth = d.getMonth() === state.anchor.getMonth();
        var isToday = sameDay(d, new Date());
        var dayEvents = data.events.filter(function (e) {
          return sameDay(new Date(e.startAt), d);
        });
        return (
          '<div style="border-right:1px solid var(--border-subtle);border-bottom:1px solid var(--border-subtle);min-height:92px;padding:6px;' +
          (inMonth ? "" : "background:var(--slate-50)") + '">' +
          '<span class="text-xs' + (isToday ? " fw-bold" : "") + '" style="color:' +
          (isToday ? "var(--antar-purple)" : inMonth ? "var(--text-strong)" : "var(--slate-400)") + '">' + d.getDate() + "</span>" +
          '<div class="stack stack--sm" style="margin-top:4px;gap:3px">' +
          dayEvents
            .slice(0, 2)
            .map(function (e) {
              return (
                '<button type="button" class="tap truncate" data-select-event="' + esc(e.id) +
                '" style="display:block;width:100%;text-align:left;border:none;border-radius:5px;padding:2px 5px;font-size:10.5px;font-weight:600;background:' +
                ui.EVENT_TINT[e.label] + ";color:" + ui.EVENT_COLOR[e.label] + '">' + esc(e.title) + "</button>"
              );
            })
            .join("") +
          (dayEvents.length > 2
            ? '<span class="text-label muted">+' + (dayEvents.length - 2) + "</span>"
            : "") +
          "</div></div>"
        );
      })
      .join("");

    return (
      '<div class="card card--flush"><div style="display:grid;grid-template-columns:repeat(7,1fr)">' + head + "</div>" +
      '<div style="display:grid;grid-template-columns:repeat(7,1fr)">' + body + "</div></div>"
    );
  }

  /* ── Agenda view ───────────────────────────────────────────── */

  function agendaView() {
    var sorted = data.events.slice().sort(WOS.by("startAt"));
    var groups = WOS.groupBy(sorted, function (e) {
      return fmt.dateInputValue(e.startAt);
    });
    var days = Array.from(groups.keys()).sort();

    if (!days.length) return '<div class="card">' + ui.empty(t("calendar.noEventsToday"), null, null, "clock") + "</div>";

    return days
      .map(function (day) {
        return (
          '<div class="card" style="margin-top:14px">' +
          '<div class="card__header"><h2 class="card__title">' + esc(fmt.fullDate(day)) + "</h2></div>" +
          groups
            .get(day)
            .map(function (e) {
              return (
                '<button type="button" class="row" data-select-event="' + esc(e.id) +
                '" style="width:100%;text-align:left;border:none;background:none;gap:10px">' +
                '<span class="mono text-label muted" style="width:44px;flex:none">' + esc(fmt.time(e.startAt)) + "</span>" +
                '<span style="width:7px;height:7px;border-radius:50%;flex:none;background:' + ui.EVENT_COLOR[e.label] + '"></span>' +
                '<span class="grow"><span class="row__title" style="display:block">' + esc(e.title) + "</span>" +
                '<span class="row__meta" style="display:block">' + esc(e.location) + "</span></span></button>"
              );
            })
            .join("") +
          "</div>"
        );
      })
      .join("");
  }

  /* ── Rail ──────────────────────────────────────────────────── */

  function detailCard() {
    var event = selectedEvent();
    if (!event) {
      return (
        '<div class="card"><h2 class="card__title">' + esc(t("calendar.meetingDetail")) + "</h2>" +
        '<p class="muted text-sm" style="margin-top:12px">' + esc(t("calendar.noEvent")) + "</p></div>"
      );
    }

    var attendees = (event.attendeeIds || [])
      .map(function (id) {
        return data.memberById.get(id);
      })
      .filter(Boolean);

    return (
      '<div class="card"><h2 class="card__title">' + esc(t("calendar.meetingDetail")) + "</h2>" +
      '<p style="margin-top:12px;font-size:15px;font-weight:700;color:var(--text-strong)">' + esc(event.title) + "</p>" +
      '<p class="text-sm muted" style="margin-top:4px">' + esc(fmt.timeRange(event.startAt, event.endAt)) + " · " + esc(event.location) + "</p>" +
      '<div style="margin-top:12px">' + ui.avatarStack(attendees, 28, 5) + "</div>" +
      (event.description
        ? '<p class="text-sm" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-subtle);color:var(--text-body);line-height:1.5">' +
          esc(event.description) + "</p>"
        : "") +
      '<div class="cluster" style="margin-top:14px">' +
      (event.meetingId
        ? '<a class="btn btn--primary btn--sm" href="meeting.html?id=' + esc(event.meetingId) + '">' + esc(t("action.join")) + "</a>"
        : '<button type="button" class="btn btn--primary btn--sm" data-edit-event="' + esc(event.id) + '">' + esc(t("action.join")) + "</button>") +
      '<button type="button" class="btn btn--outline btn--sm" data-edit-event="' + esc(event.id) + '">' + esc(t("action.edit")) + "</button>" +
      "</div></div>"
    );
  }

  function labelsCard() {
    return (
      '<div class="card"><h2 class="card__title">' + esc(t("calendar.colorLabels")) + "</h2>" +
      '<div style="margin-top:10px">' +
      LABELS.map(function (label) {
        return (
          '<div class="cluster" style="padding:6px 0">' +
          '<span style="width:10px;height:10px;border-radius:50%;flex:none;background:' + ui.EVENT_COLOR[label] + '"></span>' +
          '<span class="text-sm" style="color:var(--text-body)">' + esc(t("calendar.label." + label)) + "</span></div>"
        );
      }).join("") +
      "</div></div>"
    );
  }

  /* ── Header ────────────────────────────────────────────────── */

  function periodLabel() {
    if (state.view === "month") return fmt.monthYear(state.anchor);
    var monday = startOfWeek(state.anchor);
    var sunday = addDays(monday, 6);
    return fmt.dayMonth(monday) + " – " + fmt.dayMonth(sunday);
  }

  function render() {
    var viewTabs = [
      { id: "week", key: "calendar.week" },
      { id: "month", key: "calendar.month" },
      { id: "agenda", key: "calendar.agenda" },
    ];

    page.innerHTML =
      '<div class="page__head">' +
      '<div class="cluster">' +
      '<h1 class="page__title" style="font-size:19px">' + esc(periodLabel()) + "</h1>" +
      '<div class="cluster" style="gap:4px">' +
      '<button type="button" class="icon-btn" data-nav="-1">' + icon("chevron-left", 14) + "</button>" +
      '<button type="button" class="icon-btn" data-nav="1">' + icon("chevron-right", 14) + "</button></div>" +
      '<button type="button" class="tap text-sm fw-semibold" data-today>' + esc(t("action.today")) + "</button></div>" +
      '<div class="tabs tabs--flush">' +
      viewTabs
        .map(function (tab) {
          return (
            '<button type="button" class="tab' + (state.view === tab.id ? " is-active" : "") +
            '" data-view-tab="' + tab.id + '">' + esc(t(tab.key)) + "</button>"
          );
        })
        .join("") +
      "</div></div>" +
      '<div class="grid grid--lg-2 grid--rail-main" style="margin-top:20px;align-items:start">' +
      '<div data-view-body></div>' +
      '<div class="stack">' + detailCard() + labelsCard() + "</div>" +
      "</div>";

    var body = WOS.$("[data-view-body]", page);
    if (state.view === "week") body.innerHTML = weekView();
    else if (state.view === "month") body.innerHTML = monthView();
    else body.innerHTML = agendaView();
  }

  function bind() {
    WOS.on(page, "click", "[data-view-tab]", function (event, target) {
      state.view = target.dataset.viewTab;
      render();
    });

    WOS.on(page, "click", "[data-nav]", function (event, target) {
      var dir = Number(target.dataset.nav);
      if (state.view === "month") {
        state.anchor = new Date(state.anchor.getFullYear(), state.anchor.getMonth() + dir, 1);
      } else {
        state.anchor = addDays(state.anchor, dir * 7);
      }
      render();
    });

    WOS.on(page, "click", "[data-today]", function () {
      state.anchor = new Date();
      render();
    });

    WOS.on(page, "click", "[data-select-event]", function (event, target) {
      state.selectedId = target.dataset.selectEvent;
      render();
    });

    WOS.on(page, "click", "[data-edit-event]", function (event, target) {
      openEventModal(selectedEvent());
    });
  }

  /* ── New / edit event modal ───────────────────────────────── */

  function openEventModal(event) {
    var isEdit = !!event;
    var body =
      '<form class="stack">' +
      '<div class="field"><label class="field__label">' + esc(t("calendar.eventTitle")) + '</label>' +
      '<input class="input" name="title" required value="' + esc(event ? event.title : "") + '"></div>' +
      '<div class="grid grid--2">' +
      '<div class="field"><label class="field__label">' + esc(t("calendar.start")) + '</label>' +
      '<input class="input" type="datetime-local" name="start" required value="' + (event ? WOS.fmt.toLocalISO(new Date(event.startAt)).slice(0, 16) : "") + '"></div>' +
      '<div class="field"><label class="field__label">' + esc(t("calendar.end")) + '</label>' +
      '<input class="input" type="datetime-local" name="end" required value="' + (event ? WOS.fmt.toLocalISO(new Date(event.endAt)).slice(0, 16) : "") + '"></div></div>' +
      '<div class="field"><label class="field__label">' + esc(t("calendar.location")) + '</label>' +
      '<input class="input" name="location" value="' + esc(event ? event.location : "") + '"></div>' +
      '<div class="field"><label class="field__label">' + esc(t("calendar.label")) + '</label>' +
      '<select class="select" name="label">' +
      LABELS.map(function (l) {
        return '<option value="' + l + '"' + (event && event.label === l ? " selected" : "") + ">" + esc(t("calendar.label." + l)) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="modal__actions">' +
      (isEdit ? '<button type="button" class="btn btn--danger" data-delete-event style="margin-right:auto">' + esc(t("action.delete")) + "</button>" : "") +
      '<button type="button" class="btn btn--ghost" data-close-modal>' + esc(t("action.cancel")) + "</button>" +
      '<button type="submit" class="btn btn--primary">' + esc(t("action.save")) + "</button>" +
      "</div></form>";

    var dialog = ui.modal({ title: isEdit ? t("action.edit") : t("calendar.newEvent"), body: body, onSubmit: onSubmit });

    if (isEdit) {
      WOS.$("[data-delete-event]", dialog).addEventListener("click", function () {
        WOS.db.remove("events", event.id).then(function () {
          state.selectedId = "";
          ui.closeModal();
          return refresh();
        });
      });
    }

    function onSubmit(form) {
      var formData = new FormData(form);
      var title = String(formData.get("title") || "").trim();
      if (!title) return;
      var patch = {
        title: title,
        startAt: new Date(formData.get("start")).toISOString(),
        endAt: new Date(formData.get("end")).toISOString(),
        location: formData.get("location") || "",
        label: formData.get("label"),
        attendeeIds: event ? event.attendeeIds : [WOS.config.currentUserId],
        description: event ? event.description : "",
        meetingId: event ? event.meetingId : null,
      };
      var promise = isEdit ? WOS.db.update("events", event.id, patch) : WOS.db.create("events", patch);
      promise.then(function (saved) {
        state.selectedId = saved.id;
        ui.closeModal();
        return refresh();
      });
    }
  }

  function refresh() {
    return WOS.db.list("events").then(function (rows) {
      data.events = rows;
      render();
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "calendar", title: t("calendar.title"), actions: '<button type="button" class="btn btn--primary btn--sm" data-new-event>' + WOS.icon("clock", 14, { color: "#fff" }) + esc(t("calendar.newEvent")) + "</button>" })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(4, 90);
      return WOS.db.loadAll(["events", "members"]);
    })
    .then(function (loaded) {
      data = loaded;
      data.memberById = WOS.indexById(loaded.members);
      if (state.selectedId) {
        var found = data.events.filter(function (e) {
          return e.id === state.selectedId;
        })[0];
        if (found) state.anchor = new Date(found.startAt);
      }
      render();
      bind();
      WOS.$("[data-new-event]").addEventListener("click", function () {
        openEventModal(null);
      });
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
