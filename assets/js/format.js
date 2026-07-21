/* ──────────────────────────────────────────────────────────────
   Workspace OS — date, number, and text formatting

   Everything runs through Intl with the active locale, so switching
   the UI language also switches date and number rendering.
   ────────────────────────────────────────────────────────────── */

(function (WOS) {
  "use strict";

  var INTL_LOCALE = { en: "en-GB", id: "id-ID" };

  function localeTag() {
    return INTL_LOCALE[WOS.i18n ? WOS.i18n.locale() : "en"] || "en-GB";
  }

  function toDate(value) {
    return value instanceof Date ? value : new Date(value);
  }

  /** "17 May" */
  function dayMonth(value) {
    return new Intl.DateTimeFormat(localeTag(), { day: "numeric", month: "short" }).format(
      toDate(value),
    );
  }

  /** "17 May 2024" */
  function fullDate(value) {
    return new Intl.DateTimeFormat(localeTag(), {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(toDate(value));
  }

  /** "May 2024" */
  function monthYear(value) {
    return new Intl.DateTimeFormat(localeTag(), { month: "long", year: "numeric" }).format(
      toDate(value),
    );
  }

  /** "15:00" — 24-hour, as in the design. */
  function time(value) {
    return new Intl.DateTimeFormat(localeTag(), {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(toDate(value));
  }

  /** "15:00 – 16:00" */
  function timeRange(start, end) {
    return time(start) + " – " + time(end);
  }

  /** "1h", "45m", "1h 30m" */
  function duration(minutes) {
    if (!minutes && minutes !== 0) return "—";
    if (minutes < 60) return minutes + "m";
    var hours = Math.floor(minutes / 60);
    var rest = minutes % 60;
    return rest === 0 ? hours + "h" : hours + "h " + rest + "m";
  }

  /** Whole days between two dates, ignoring the time of day. */
  function dayDelta(from, to) {
    var a = new Date(from.getFullYear(), from.getMonth(), from.getDate());
    var b = new Date(to.getFullYear(), to.getMonth(), to.getDate());
    return Math.round((b - a) / 86400000);
  }

  function isToday(value) {
    if (!value) return false;
    return dayDelta(new Date(), toDate(value)) === 0;
  }

  function isPast(value) {
    if (!value) return false;
    return toDate(value).getTime() < Date.now();
  }

  function isThisWeek(value) {
    if (!value) return false;
    var delta = dayDelta(new Date(), toDate(value));
    return delta >= 0 && delta < 7;
  }

  /**
   * Due-date label for task lists: a clock time for today, a word for the days
   * either side, then a date.
   */
  function due(value) {
    if (!value) return "—";
    var t = WOS.i18n.t;
    var delta = dayDelta(new Date(), toDate(value));
    if (delta === 0) return time(value);
    if (delta === 1) return t("time.tomorrow");
    if (delta === -1) return t("time.yesterday");
    return dayMonth(value);
  }

  /** Relative timestamp for activity feeds: "3 hours ago". */
  function relative(value) {
    if (!value) return "—";
    var t = WOS.i18n.t;
    var minutes = Math.max(0, Math.floor((Date.now() - toDate(value).getTime()) / 60000));
    if (minutes < 1) return t("time.justNow");
    if (minutes < 60) return t("time.minutesAgo", { n: minutes });
    var hours = Math.floor(minutes / 60);
    if (hours < 24) return t("time.hoursAgo", { n: hours });
    var days = Math.floor(hours / 24);
    if (days === 1) return t("time.yesterday");
    return t("time.daysAgo", { n: days });
  }

  /** Date-group heading used by Daily Notes and Notifications. */
  function dayGroup(value) {
    var t = WOS.i18n.t;
    var delta = dayDelta(new Date(), toDate(value));
    if (delta === 0) return t("time.today");
    if (delta === -1) return t("time.yesterday");
    if (delta > -7) return t("time.lastWeek");
    return fullDate(value);
  }

  /** "240 KB", "2.1 MB" */
  function bytes(size) {
    if (!size && size !== 0) return "—";
    if (size < 1024) return size + " B";
    var kb = size / 1024;
    if (kb < 1024) return Math.round(kb) + " KB";
    return (kb / 1024).toFixed(1) + " MB";
  }

  function currency(amount, code) {
    if (amount === null || amount === undefined) return "—";
    return new Intl.NumberFormat(localeTag(), {
      style: "currency",
      currency: code || WOS.config.currency,
      maximumFractionDigits: 0,
    }).format(amount);
  }

  /** Word count and rough reading time for the document info panel. */
  function readingStats(text) {
    var words = String(text || "").trim().split(/\s+/).filter(Boolean).length;
    return { words: words, minutes: Math.max(1, Math.round(words / 200)) };
  }

  /** ISO datetime for a Date, preserving local time rather than shifting to UTC. */
  function toLocalISO(date) {
    var offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, -1);
  }

  /** "YYYY-MM-DD" for date inputs. */
  function dateInputValue(value) {
    if (!value) return "";
    var d = toDate(value);
    return (
      d.getFullYear() +
      "-" +
      String(d.getMonth() + 1).padStart(2, "0") +
      "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  WOS.fmt = {
    dayMonth: dayMonth,
    fullDate: fullDate,
    monthYear: monthYear,
    time: time,
    timeRange: timeRange,
    duration: duration,
    dayDelta: dayDelta,
    isToday: isToday,
    isPast: isPast,
    isThisWeek: isThisWeek,
    due: due,
    relative: relative,
    dayGroup: dayGroup,
    bytes: bytes,
    currency: currency,
    readingStats: readingStats,
    toLocalISO: toLocalISO,
    dateInputValue: dateInputValue,
  };
})(window.WOS);
