/* ──────────────────────────────────────────────────────────────
   Workspace OS — Google Calendar

   One API for the calendar, two sources behind it, mirroring how
   WOS.db handles collections:

     "sheets"  the `events` collection (seeded sample data)
     "google"  the real Google Calendar, via the same Apps Script
               endpoint the spreadsheet already goes through

   Screens call WOS.gcal.* and never learn which is active, so the
   calendar page works the same either way.

   Google is authoritative when it's on: nothing is copied into the
   spreadsheet, so there is never a second, drifting schedule.
   ────────────────────────────────────────────────────────────── */

(function (WOS) {
  "use strict";

  var calendarsCache = null;
  var rangeCache = {}; // "calId|from|to" → events

  function useGoogle() {
    return WOS.config.calendarSource === "google" && WOS.config.backend === "api";
  }

  /** Same transport as the data layer — the secret stays server-side. */
  function rpc(op, payload) {
    var body = Object.assign({ op: op }, payload || {});

    return fetch(WOS.config.apiEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (payload) {
        if (!payload.ok) throw new Error(payload.error || "unknown error");
        return payload.data;
      });
  }

  function selectedIds() {
    return WOS.config.calendarIds || [];
  }

  function cacheKey(from, to) {
    return selectedIds().join(",") + "|" + from + "|" + to;
  }

  /* ── Public API ────────────────────────────────────────────── */

  /** Calendars this account can see. Empty on the sheets source. */
  function calendars() {
    if (!useGoogle()) return Promise.resolve([]);
    if (calendarsCache) return Promise.resolve(calendarsCache);

    return rpc("calendarList").then(function (rows) {
      calendarsCache = rows || [];
      return calendarsCache;
    });
  }

  /**
   * Events overlapping [from, to). Both are Date objects.
   *
   * The sheets source ignores the range and hands back everything, which is
   * what the seeded data expects; the calendar page filters by day anyway.
   */
  function range(from, to) {
    if (!useGoogle()) {
      return WOS.db.list("events").then(function (rows) {
        return rows.map(normaliseSheetEvent);
      });
    }

    var key = cacheKey(from.toISOString(), to.toISOString());
    if (rangeCache[key]) return Promise.resolve(rangeCache[key]);

    return rpc("calendarRange", {
      calendarIds: selectedIds(),
      startAt: from.toISOString(),
      endAt: to.toISOString(),
    }).then(function (rows) {
      rangeCache[key] = rows || [];
      return rangeCache[key];
    });
  }

  /** Sheet rows predate the Google fields; fill them in so callers see one shape. */
  function normaliseSheetEvent(row) {
    return Object.assign(
      {
        allDay: false,
        recurring: false,
        guests: [],
        organizer: "",
        canEdit: true,
        calendarId: "",
      },
      row,
    );
  }

  function create(data) {
    dropRangeCache();
    if (!useGoogle()) return WOS.db.create("events", data);
    return rpc("calendarCreate", { calendarId: data.calendarId || "", data: data });
  }

  function update(id, data) {
    dropRangeCache();
    if (!useGoogle()) return WOS.db.update("events", id, data);
    return rpc("calendarUpdate", { calendarId: data.calendarId || "", id: id, data: data });
  }

  function remove(id, calendarId) {
    dropRangeCache();
    if (!useGoogle()) return WOS.db.remove("events", id);
    return rpc("calendarDelete", { calendarId: calendarId || "", id: id });
  }

  /** Any write invalidates every window, since an event can be moved anywhere. */
  function dropRangeCache() {
    rangeCache = {};
  }

  WOS.gcal = {
    isGoogle: useGoogle,
    calendars: calendars,
    range: range,
    create: create,
    update: update,
    remove: remove,
    refresh: dropRangeCache,
  };
})(window.WOS);
