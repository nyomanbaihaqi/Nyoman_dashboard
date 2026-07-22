/* ──────────────────────────────────────────────────────────────
   Workspace OS — runtime configuration

   Loaded before everything else. Every other script reads from
   window.WOS, which this file creates.
   ────────────────────────────────────────────────────────────── */

window.WOS = window.WOS || {};

WOS.config = {
  /**
   * Where data comes from.
   *
   *   "local"  — browser-only. Seed data in localStorage. No setup, works
   *              offline, and every edit persists per browser. This is the
   *              default so the site is usable the moment it's opened.
   *   "api"    — the /api/sheets proxy on Vercel, which forwards to the Apps
   *              Script Web App. The Apps Script secret stays server-side.
   *
   * Switch by setting this to "api" after deploying (see README).
   */
  backend: "api",

  /** Endpoint for backend "api". Same-origin, so no CORS setup needed. */
  apiEndpoint: "/api/sheets",

  /** localStorage key prefix, so several deployments can share a browser. */
  storagePrefix: "wos.",

  /** Default UI language: "en" or "id". Overridden by the user's saved choice. */
  defaultLocale: "en",

  /** Currency for approval amounts. */
  currency: "USD",

  /**
   * Where the calendar reads and writes.
   *
   *   "sheets" — the `events` collection, like every other screen.
   *   "google" — the real Google Calendar, through the same Apps Script
   *              endpoint. Requires backend "api", and the script has to be
   *              re-authorised once for the Calendar scope (see README).
   *
   * Google is the source of truth when this is on: creating an event here
   * creates it there, and an event moved in Google shows up here. Nothing is
   * mirrored into the spreadsheet, so there is only ever one schedule.
   */
  calendarSource: "google",

  /**
   * Which calendars to read. Empty means the account's default calendar
   * only — the usual case. Add ids from Settings once more than one matters.
   */
  calendarIds: [],

  /**
   * Which member the app renders as, until Google sign-in is wired up.
   * Falls back to the workspace owner when this id isn't found.
   */
  currentUserId: "m_alex",
};

/**
 * Collections, one per sheet tab. Order matters only for setup.
 *
 * `ideas`, `notifications`, `threads`, and `folders` went with the screens that
 * read them. Every loadAll batches this list, so a collection nothing reads is
 * a request paid for on each navigation and never looked at. The sheet tabs and
 * their rows are left alone — this only stops the app fetching them.
 */
WOS.COLLECTIONS = [
  "members",
  "divisions",
  "tasks",
  "projects",
  "milestones",
  "events",
  "notes",
  "meetings",
  "approvals",
  "changes",
  "files",
  "comments",
  "templates",
];

/**
 * The six-step per-meeting ritual from the PA job description. Stored as ids
 * so a meeting's progress survives a change of wording or language.
 */
WOS.MEETING_SOP = ["room", "materials", "reportWa", "photos", "recording", "archive"];
