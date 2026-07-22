/* ──────────────────────────────────────────────────────────────
   Calendar — Week / Month / Agenda, backed by Google Calendar when
   config.calendarSource is "google", otherwise the seeded events.

   The shape of the page is unchanged; what changed is where the
   events come from. Google is queried per visible window rather than
   all at once, so moving to another week is a fetch — that is the
   trade for the calendar being real rather than a copy.
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
  var data = { events: [], members: [], calendars: [] };
  var conflicts = new Map(); // event id → events it overlaps
  var loading = false;
  var state = { view: "week", anchor: new Date(), selectedId: WOS.param("event") || "" };

  var HOURS = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19];
  var LABELS = ["deep_work", "meetings", "personal", "urgent", "travel"];

  /** RSVP states Google reports, mapped to how they should read. */
  var RSVP_TONE = { YES: "success", NO: "danger", MAYBE: "warning", INVITED: "neutral", OWNER: "brand" };

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

  /**
   * The window currently on screen. Google is asked for exactly this, so it
   * has to cover everything the view can draw — the month grid spills into
   * the weeks either side of the month itself.
   */
  function visibleRange() {
    if (state.view === "month") {
      var first = new Date(state.anchor.getFullYear(), state.anchor.getMonth(), 1);
      var gridStart = startOfWeek(first);
      return { from: gridStart, to: addDays(gridStart, 42) };
    }
    if (state.view === "agenda") {
      var weekStart = startOfWeek(state.anchor);
      return { from: weekStart, to: addDays(weekStart, 28) };
    }
    var monday = startOfWeek(state.anchor);
    return { from: monday, to: addDays(monday, 7) };
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

    // All-day events don't belong in an hour row; Google returns plenty of
    // them and dropping them into 00:00 would be a lie about when they are.
    var allDayRow = allDayStrip(days);

    var rows = HOURS.map(function (hour) {
      var cells = days
        .map(function (d) {
          var dayEvents = data.events.filter(function (e) {
            if (e.allDay) return false;
            var start = new Date(e.startAt);
            return sameDay(start, d) && start.getHours() === hour;
          });
          return '<div class="calendar__cell">' + dayEvents.map(eventChip).join("") + "</div>";
        })
        .join("");
      return '<div class="calendar__row"><div class="calendar__hour">' + String(hour).padStart(2, "0") + ":00</div>" + cells + "</div>";
    }).join("");

    return (
      '<div class="scroll-x"><div class="calendar"><div class="calendar__head"><div></div>' + head + "</div>" +
      allDayRow + rows + "</div></div>"
    );
  }

  function allDayStrip(days) {
    var any = data.events.some(function (e) {
      return e.allDay;
    });
    if (!any) return "";

    var cells = days
      .map(function (d) {
        var dayEvents = data.events.filter(function (e) {
          return e.allDay && sameDay(new Date(e.startAt), d);
        });
        return '<div class="calendar__cell">' + dayEvents.map(eventChip).join("") + "</div>";
      })
      .join("");

    return (
      '<div class="calendar__row" style="min-height:0">' +
      '<div class="calendar__hour">' + esc(t("calendar.allDay")) + "</div>" + cells + "</div>"
    );
  }

  function eventChip(e) {
    var clash = conflicts.get(e.id);
    return (
      '<button type="button" class="calendar__event tap" data-select-event="' + esc(e.id) +
      '" style="background:' + ui.EVENT_TINT[e.label] + ";border-left-color:" + ui.EVENT_COLOR[e.label] +
      (clash ? ";outline:1.5px solid var(--rose-500);outline-offset:-1.5px" : "") +
      '"><span class="calendar__event-title">' +
      (clash ? icon("warning", 11, { color: "var(--rose-500)" }) + " " : "") +
      (e.recurring ? icon("refresh", 10, { color: "var(--slate-400)" }) + " " : "") +
      esc(e.title) + "</span>" +
      '<span class="calendar__event-meta">' +
      (e.allDay ? esc(t("calendar.allDay")) : esc(fmt.duration(Math.round((new Date(e.endAt) - new Date(e.startAt)) / 60000)))) +
      "</span></button>"
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
          (dayEvents.length > 2 ? '<span class="text-label muted">+' + (dayEvents.length - 2) + "</span>" : "") +
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
                '<span class="mono text-label muted" style="width:44px;flex:none">' +
                (e.allDay ? esc(t("calendar.allDay")) : esc(fmt.time(e.startAt))) + "</span>" +
                '<span style="width:7px;height:7px;border-radius:50%;flex:none;background:' + ui.EVENT_COLOR[e.label] + '"></span>' +
                '<span class="grow"><span class="row__title" style="display:block">' + esc(e.title) + "</span>" +
                '<span class="row__meta" style="display:block">' + esc(e.location || "—") + "</span></span>" +
                (conflicts.get(e.id) ? icon("warning", 13, { color: "var(--rose-500)" }) : "") +
                "</button>"
              );
            })
            .join("") +
          "</div>"
        );
      })
      .join("");
  }

  /* ── Detail rail ───────────────────────────────────────────── */

  function detailCard() {
    var event = selectedEvent();
    if (!event) {
      return (
        '<div class="card"><h2 class="card__title">' + esc(t("calendar.meetingDetail")) + "</h2>" +
        '<p class="muted text-sm" style="margin-top:12px">' + esc(t("calendar.noEvent")) + "</p></div>"
      );
    }

    var clash = conflicts.get(event.id);
    var guests = event.guests || [];

    return (
      '<div class="card"><h2 class="card__title">' + esc(t("calendar.meetingDetail")) + "</h2>" +
      '<p style="margin-top:12px;font-size:15px;font-weight:700;color:var(--text-strong)">' + esc(event.title) + "</p>" +
      '<p class="text-sm muted" style="margin-top:4px">' +
      (event.allDay ? esc(t("calendar.allDay")) : esc(fmt.timeRange(event.startAt, event.endAt))) +
      (event.location ? " · " + esc(event.location) : "") + "</p>" +
      '<div class="cluster" style="margin-top:8px;gap:6px">' +
      (event.recurring ? ui.badge(t("calendar.recurring"), "info") : "") +
      (event.calendarId && data.calendars.length > 1 ? ui.tag(calendarName(event.calendarId)) : "") +
      "</div>" +
      // Guarding the CEO's calendar against double-booking is an explicit line
      // in the PA job description, so a clash is stated outright rather than
      // left for someone to notice.
      (clash
        ? '<div style="margin-top:12px;padding:10px 12px;background:var(--rose-50);border-radius:10px;' +
          'display:flex;gap:8px;align-items:flex-start">' +
          icon("warning", 14, { color: "var(--rose-600)" }) +
          '<span class="text-sm" style="color:var(--rose-600);line-height:1.5">' +
          clash
            .map(function (other) {
              return esc(t("calendar.conflict", { title: other.title })) + " (" + esc(fmt.timeRange(other.startAt, other.endAt)) + ")";
            })
            .join("<br>") +
          "</span></div>"
        : "") +
      (guests.length
        ? '<div style="margin-top:14px"><p class="eyebrow">' + esc(t("calendar.guests")) + " (" + guests.length + ")</p>" +
          guests
            .map(function (g) {
              var member = memberByEmail(g.email);
              return (
                '<div class="row" style="padding:7px 0">' +
                (member ? ui.avatar(member, 24) : ui.avatar({ initials: (g.name || g.email).charAt(0).toUpperCase(), avatarColor: "var(--slate-400)", name: g.name }, 24)) +
                '<span class="grow truncate text-sm" style="color:var(--text-body)">' + esc(g.name || g.email) + "</span>" +
                ui.badge(t("calendar.rsvp." + g.status), RSVP_TONE[g.status] || "neutral") +
                "</div>"
              );
            })
            .join("") +
          "</div>"
        : "") +
      (event.description
        ? '<p class="text-sm" style="margin-top:14px;padding-top:14px;border-top:1px solid var(--border-subtle);color:var(--text-body);line-height:1.5">' +
          esc(event.description) + "</p>"
        : "") +
      '<div class="cluster" style="margin-top:14px">' +
      (event.meetingId
        ? '<a class="btn btn--primary btn--sm" href="meeting.html?id=' + esc(event.meetingId) + '">' + esc(t("calendar.openMinutes")) + "</a>"
        : "") +
      (event.canEdit === false
        ? '<span class="text-label muted">' + esc(t("calendar.readOnly")) + "</span>"
        : '<button type="button" class="btn btn--outline btn--sm" data-edit-event>' + esc(t("action.edit")) + "</button>") +
      "</div></div>"
    );
  }

  function memberByEmail(email) {
    if (!email) return null;
    var lower = email.toLowerCase();
    return data.members.filter(function (m) {
      return (m.email || "").toLowerCase() === lower;
    })[0];
  }

  function calendarName(id) {
    var cal = data.calendars.filter(function (c) {
      return c.id === id;
    })[0];
    return cal ? cal.name : id;
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

  /** Only worth showing when the account actually has more than one calendar. */
  function calendarPickerCard() {
    if (!WOS.gcal.isGoogle() || data.calendars.length < 2) return "";
    var chosen = WOS.config.calendarIds || [];

    return (
      '<div class="card"><h2 class="card__title">' + esc(t("calendar.calendars")) + "</h2>" +
      '<div style="margin-top:8px">' +
      data.calendars
        .map(function (cal) {
          var on = chosen.length ? chosen.indexOf(cal.id) !== -1 : cal.isDefault;
          return (
            '<div class="row" style="padding:7px 0">' +
            ui.checkbox(on, cal.name, { "cal-toggle": cal.id }) +
            '<span class="grow truncate text-sm" style="color:var(--text-body)">' + esc(cal.name) + "</span>" +
            (cal.canEdit ? "" : ui.badge(t("calendar.readOnly"), "neutral")) +
            "</div>"
          );
        })
        .join("") +
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
      '<button type="button" class="tap text-sm fw-semibold" data-today>' + esc(t("action.today")) + "</button>" +
      (loading ? icon("refresh", 14, { color: "var(--slate-400)", className: "spin" }) : "") +
      (WOS.gcal.isGoogle() ? '<span class="text-label faint">' + esc(t("calendar.googleSynced")) + "</span>" : "") +
      "</div>" +
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
      '<div class="stack">' + detailCard() + calendarPickerCard() + labelsCard() + "</div>" +
      "</div>";

    var body = WOS.$("[data-view-body]", page);
    if (state.view === "week") body.innerHTML = weekView();
    else if (state.view === "month") body.innerHTML = monthView();
    else body.innerHTML = agendaView();
  }

  function bind() {
    WOS.on(page, "click", "[data-view-tab]", function (event, target) {
      state.view = target.dataset.viewTab;
      load();
    });

    WOS.on(page, "click", "[data-nav]", function (event, target) {
      var dir = Number(target.dataset.nav);
      if (state.view === "month") {
        state.anchor = new Date(state.anchor.getFullYear(), state.anchor.getMonth() + dir, 1);
      } else {
        state.anchor = addDays(state.anchor, dir * 7);
      }
      load();
    });

    WOS.on(page, "click", "[data-today]", function () {
      state.anchor = new Date();
      load();
    });

    WOS.on(page, "click", "[data-select-event]", function (event, target) {
      state.selectedId = target.dataset.selectEvent;
      render();
    });

    WOS.on(page, "click", "[data-edit-event]", function () {
      openEventModal(selectedEvent());
    });

    WOS.on(page, "click", "[data-cal-toggle]", function (event, target) {
      var id = target.dataset.calToggle;
      var chosen = (WOS.config.calendarIds || []).slice();
      // An empty list means "the default calendar"; the moment the user picks
      // anything, it becomes an explicit list so the default isn't implied.
      if (!chosen.length) {
        chosen = data.calendars
          .filter(function (c) {
            return c.isDefault;
          })
          .map(function (c) {
            return c.id;
          });
      }
      var at = chosen.indexOf(id);
      if (at === -1) chosen.push(id);
      else chosen.splice(at, 1);

      WOS.config.calendarIds = chosen;
      savePickedCalendars(chosen);
      load();
    });
  }

  /** Calendar choice is per-browser, like the language preference. */
  function savePickedCalendars(ids) {
    try {
      localStorage.setItem(WOS.config.storagePrefix + "calendarIds", JSON.stringify(ids));
    } catch (err) {
      /* preference simply won't persist */
    }
  }

  function loadPickedCalendars() {
    try {
      var raw = localStorage.getItem(WOS.config.storagePrefix + "calendarIds");
      if (raw) WOS.config.calendarIds = JSON.parse(raw) || [];
    } catch (err) {
      /* fall back to the default calendar */
    }
  }

  /* ── New / edit event modal ───────────────────────────────── */

  function openEventModal(event) {
    var isEdit = !!event;
    var editable = data.calendars.filter(function (c) {
      return c.canEdit;
    });
    var guestEmails = ((event && event.guests) || [])
      .map(function (g) {
        return g.email;
      })
      .join(", ");

    var body =
      '<form class="stack">' +
      '<div class="field"><label class="field__label">' + esc(t("calendar.eventTitle")) + '</label>' +
      '<input class="input" name="title" required value="' + esc(event ? event.title : "") + '"></div>' +
      '<label class="cluster" style="gap:8px"><input type="checkbox" name="allDay"' + (event && event.allDay ? " checked" : "") + ">" +
      '<span class="text-sm">' + esc(t("calendar.allDay")) + "</span></label>" +
      '<div class="grid grid--2">' +
      '<div class="field"><label class="field__label">' + esc(t("calendar.start")) + '</label>' +
      '<input class="input" type="datetime-local" name="start" required value="' +
      (event ? WOS.fmt.toLocalISO(new Date(event.startAt)).slice(0, 16) : "") + '"></div>' +
      '<div class="field"><label class="field__label">' + esc(t("calendar.end")) + '</label>' +
      '<input class="input" type="datetime-local" name="end" required value="' +
      (event ? WOS.fmt.toLocalISO(new Date(event.endAt)).slice(0, 16) : "") + '"></div></div>' +
      '<div class="field"><label class="field__label">' + esc(t("calendar.location")) + '</label>' +
      '<input class="input" name="location" value="' + esc(event ? event.location : "") + '"></div>' +
      '<div class="field"><label class="field__label">' + esc(t("calendar.guests")) + '</label>' +
      '<input class="input" name="guests" placeholder="nama@email.com, lain@email.com" value="' + esc(guestEmails) + '">' +
      '<span class="text-label muted" style="display:block;margin-top:4px">' + esc(t("calendar.guestsHint")) + "</span></div>" +
      '<div class="field"><label class="field__label">' + esc(t("action.edit")) + '</label>' +
      '<textarea class="textarea" name="description" rows="3">' + esc(event ? event.description : "") + "</textarea></div>" +
      '<div class="grid grid--2">' +
      '<div class="field"><label class="field__label">' + esc(t("calendar.label")) + '</label>' +
      '<select class="select" name="label">' +
      LABELS.map(function (l) {
        return '<option value="' + l + '"' + (event && event.label === l ? " selected" : "") + ">" + esc(t("calendar.label." + l)) + "</option>";
      }).join("") + "</select></div>" +
      (editable.length > 1
        ? '<div class="field"><label class="field__label">' + esc(t("calendar.calendars")) + '</label>' +
          '<select class="select" name="calendarId"' + (isEdit ? " disabled" : "") + ">" +
          editable
            .map(function (c) {
              var chosen = event ? event.calendarId === c.id : c.isDefault;
              return '<option value="' + esc(c.id) + '"' + (chosen ? " selected" : "") + ">" + esc(c.name) + "</option>";
            })
            .join("") + "</select></div>"
        : "") +
      "</div>" +
      (event && event.recurring
        ? '<p class="text-label muted">' + esc(t("calendar.recurringWarning")) + "</p>"
        : "") +
      '<div class="modal__actions">' +
      (isEdit ? '<button type="button" class="btn btn--danger" data-delete-event style="margin-right:auto">' + esc(t("action.delete")) + "</button>" : "") +
      '<button type="button" class="btn btn--ghost" data-close-modal>' + esc(t("action.cancel")) + "</button>" +
      '<button type="submit" class="btn btn--primary">' + esc(t("action.save")) + "</button>" +
      "</div></form>";

    var dialog = ui.modal({ title: isEdit ? t("action.edit") : t("calendar.newEvent"), body: body, onSubmit: onSubmit });

    if (isEdit) {
      WOS.$("[data-delete-event]", dialog).addEventListener("click", function () {
        WOS.gcal.remove(event.id, event.calendarId).then(function () {
          state.selectedId = "";
          ui.closeModal();
          ui.toast(t("calendar.deleted"));
          return load();
        });
      });
    }

    function onSubmit(form) {
      var formData = new FormData(form);
      var title = String(formData.get("title") || "").trim();
      if (!title) return;

      var guests = String(formData.get("guests") || "")
        .split(",")
        .map(function (s) {
          return s.trim();
        })
        .filter(Boolean);

      var patch = {
        title: title,
        startAt: new Date(formData.get("start")).toISOString(),
        endAt: new Date(formData.get("end")).toISOString(),
        allDay: formData.get("allDay") === "on",
        location: formData.get("location") || "",
        description: formData.get("description") || "",
        label: formData.get("label"),
        guests: guests,
        calendarId: formData.get("calendarId") || (event && event.calendarId) || "",
        meetingId: event ? event.meetingId : null,
        attendeeIds: event ? event.attendeeIds : [],
      };

      var promise = isEdit ? WOS.gcal.update(event.id, patch) : WOS.gcal.create(patch);
      promise
        .then(function (saved) {
          if (saved && saved.id) state.selectedId = saved.id;
          ui.closeModal();
          ui.toast(t(isEdit ? "state.saved" : "calendar.created"));
          return load();
        })
        .catch(function (error) {
          console.error("[wos] calendar write failed", error);
          ui.toast(t("state.error") + " — " + (error && error.message ? error.message : ""), "error");
        });
    }
  }

  /* ── Load ──────────────────────────────────────────────────── */

  function load() {
    var window_ = visibleRange();
    loading = true;
    render();

    return WOS.gcal
      .range(window_.from, window_.to)
      .then(function (rows) {
        data.events = rows;
        conflicts = ui.findConflicts(rows);
        loading = false;
        render();
      })
      .catch(function (error) {
        loading = false;
        console.error("[wos] calendar read failed", error);
        WOS.shell.renderError(page, error);
      });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  loadPickedCalendars();

  WOS.shell
    .mount({
      active: "calendar",
      title: t("calendar.title"),
      actions:
        '<button type="button" class="btn btn--primary btn--sm" data-new-event>' +
        WOS.icon("clock", 14, { color: "#fff" }) + esc(t("calendar.newEvent")) + "</button>",
    })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(4, 90);
      return Promise.all([WOS.db.list("members"), WOS.gcal.calendars()]);
    })
    .then(function (results) {
      data.members = results[0];
      data.calendars = results[1];
      data.memberById = WOS.indexById(results[0]);

      // A deep link to one event should open on the week that contains it.
      if (state.selectedId) {
        return WOS.gcal.range(addDays(new Date(), -90), addDays(new Date(), 180)).then(function (rows) {
          var found = rows.filter(function (e) {
            return e.id === state.selectedId;
          })[0];
          if (found) state.anchor = new Date(found.startAt);
        });
      }
    })
    .then(function () {
      bind();
      WOS.$("[data-new-event]").addEventListener("click", function () {
        openEventModal(null);
      });
      return load();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
