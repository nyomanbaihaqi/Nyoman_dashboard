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
   * Which member the app renders as, until Google sign-in is wired up.
   * Falls back to the workspace owner when this id isn't found.
   */
  currentUserId: "m_alex",
};

/** Collections, one per sheet tab. Order matters only for setup. */
WOS.COLLECTIONS = [
  "members",
  "tasks",
  "projects",
  "milestones",
  "events",
  "notes",
  "meetings",
  "ideas",
  "threads",
  "approvals",
  "notifications",
  "workflows",
  "workflowRuns",
  "folders",
  "files",
  "comments",
  "prompts",
];
