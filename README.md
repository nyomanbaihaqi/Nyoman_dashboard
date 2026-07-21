# Workspace OS

Personal assistant, project manager, and AI engineering workspace — built to the
`design_handoff_workspace_os` spec.

## Running it

No build step, no dependencies. Either:

- Open `index.html` directly in a browser, or
- Serve the folder so relative paths and the local storage origin behave like
  production: `npx serve .`

The app boots on seeded sample data in `localStorage` — nothing to configure.
Copy `.env.example` to `.env.local` (used by Vercel, not by the static files
themselves) when you're ready to point it at Google Sheets.

## Architecture

**Static HTML + vanilla JS + CSS**, deployed as-is on Vercel. Every page is its
own `.html` file that loads the same shared script chain and mounts a
page-specific module:

```
index.html              Home
tasks.html               kanban.html          projects.html
project.html?id=         calendar.html        inbox.html
notifications.html       approvals.html       notes.html
note.html?id=            meeting.html?id=     meeting-intelligence.html
knowledge.html           automations.html     timeline.html
milestones.html          issues.html          prompts.html
settings.html            help.html

assets/css/tokens.css    design tokens, copied verbatim from the handoff
assets/css/app.css       every component used across all pages
assets/js/
  config.js  util.js  icons.js  i18n.js  format.js   ← shared foundation
  seed.js    store.js  ui.js     shell.js             ← data + shell
  pages/*.js                                          ← one module per page

apps-script/Code.gs      Google Sheets backend
api/sheets.js            Vercel proxy that keeps the Sheets secret server-side
vercel.json              cleanUrls: false — see note below
```

Load order matters and is the same on every page: `config → util → icons →
i18n → format → seed → store → ui → shell → pages/<page>.js`. Each script
attaches to the shared `window.WOS` namespace; nothing is bundled.

A page's own script owns two things: rendering (`render()`, called once on
load and again whenever state changes) and event wiring (`bind()`, called
**exactly once**, right after the first `render()`). `bind()` uses
event delegation (`WOS.on(page, event, selector, handler)`) on the page's
persistent container, so it doesn't need to run again when `render()` replaces
the container's contents — re-calling `bind()` on every render would stack a
new listener set each time and fire creates/updates multiple times per click.
`home.js` is the reference for this pattern.

### Data layer

One API, two backends, picked by `assets/js/config.js`:

```
WOS.db.list / get / create / update / remove / loadAll
  "local"  localStorage, seeded from seed.js               (default)
  "api"    POST /api/sheets → Vercel function → Apps Script  (backend: "api")
```

No page learns which backend is active. Switching is the one-line
`backend: "local" | "api"` change in `config.js`.

### Google Sheets backend

`apps-script/Code.gs` is the backend — deploy it as a Web App bound to your
spreadsheet and it owns the data. One tab per collection, row 1 is the header,
arrays and objects are JSON-encoded per cell. Setup steps are in the file's
header comment.

Writes take a script lock, so two concurrent requests can't race on append.
Strings starting with `=` are escaped, so user text is never evaluated as a
spreadsheet formula.

Because static HTML has no server to hold a secret, `api/sheets.js` sits in
between: the frontend calls same-origin `/api/sheets` with no credentials,
the Vercel function attaches `SHEETS_SECRET` (from the project's environment
variables, never sent to the browser) and forwards to `SHEETS_ENDPOINT`. Set
both in the Vercel project settings before switching `config.js` to `"api"`.

#### Switching it on

1. In the Apps Script editor: **Project Settings → Script Properties**, add
   `SECRET` with a long random string.
2. **Deploy → New deployment → Web app**, with **Execute as: Me** and
   **Who has access: Anyone**. That last one matters — with anything
   stricter, Google answers the proxy with a sign-in page instead of JSON,
   and the endpoint would be unusable. The `SECRET` is what actually guards
   it, and it never leaves the server.
3. Run `setupSheets()` once from the editor to create the tabs and headers.
4. In the Vercel project: **Settings → Environment Variables**, add
   `SHEETS_ENDPOINT` (the deployment's `/exec` URL) and `SHEETS_SECRET`
   (matching step 1). Redeploy so the function picks them up.
5. Open **Settings → Preferences → Copy sample data to Google Sheets**. This
   is a one-time bulk write of `seed.js` into the empty spreadsheet, so the
   workspace isn't blank after switching. It refuses to run if `members`
   already has rows, so it can't duplicate an existing workspace. Skip it if
   you'd rather start from an empty sheet — but note a workspace with no
   members has no assignees to pick in task modals.
6. Change `backend: "local"` to `backend: "api"` in `assets/js/config.js`,
   then commit and push.

Steps 1–5 all work while still on `"local"`, which is the point: fill and
verify the spreadsheet first, and only flip the switch once it looks right.

> **`apps-script/Code.gs` does not deploy from git.** It's version-controlled
> here for review and history, but the copy that actually runs lives in
> Google's editor. After changing it, paste the new contents into the Apps
> Script editor and **Deploy → Manage deployments → edit → Deploy** again, or
> the endpoint keeps running the old code. The symptom is an app-level error
> like `unknown op: …` coming back with HTTP 200 — the request arrived and
> authenticated fine, the running script just didn't recognise it.

### `vercel.json` / `cleanUrls`

Every link in this app is an explicit `page.html` (with a `?query` where
needed). `cleanUrls` defaults to stripping `.html` and redirecting — and that
redirect drops the query string, which would silently break every `?id=`,
`?project=`, and `?event=` link. `vercel.json` sets `"cleanUrls": false` so
Vercel serves the exact path requested, no redirect involved.

### Design system

Tokens in `assets/css/tokens.css` are copied verbatim from the handoff's
`design-tokens/` — they're the contract with design, so don't hand-tune them.
`assets/css/app.css` holds every component (cards, badges, kanban, gantt,
calendar, split view, forms, modals, command palette, …) used across all 21
pages.

Icon names ("file-pen", "chart-line") are stored in the data model and mapped
to inline SVGs in `assets/js/icons.js`. Add new icons there rather than
inlining SVG at a call site, so an icon name stays a valid stored value.

### Responsive

The design handoff was desktop-only; the mobile layer is additive and never
changes desktop rendering.

- Sidebar is a fixed 256px rail at `lg`, and a slide-in drawer below it.
- A 5-slot bottom tab bar appears under `md`; "More" opens the same drawer, so
  nothing in the sidebar is unreachable on a phone.
- Wide tables become stacked cards rather than horizontal scroll.
- Pages reserve `--bottom-nav-height` so content clears the tab bar, including
  the iOS home-indicator inset.
- Inline text links carry `.tap`, which grows the hit area to 44px on coarse
  pointers without shifting the layout.
- Inputs are 16px on mobile, which is what stops iOS zooming on focus.

Verified at 320px, 375px, and desktop with no horizontal overflow.

### i18n

English and Indonesian, toggled in Settings → Preferences. English is the
source of truth and matches the handoff copy exactly — don't reword `en`
values without a design change. The choice is stored in `localStorage`.

`assets/js/i18n.js` holds both dictionaries; `t(key, vars)` falls back to
English, then to the raw key, so a missing string never renders blank.

## AI features

Meeting Intelligence's upload → processing flow, the AI Chat panels, and the
various "Ask AI" buttons all walk through the intended UX with sample output
— there's no model wired up behind them yet. Each one shows
`mi.aiPending` ("AI processing isn't connected yet…") so it reads as a demo,
not a broken feature. Converting a meeting action item into a real task,
though, is fully functional — it writes to the `tasks` collection like any
other create.

## Status

Built and verified end-to-end, including create/update/delete flows and
console-clean navigation across every page: all 21 pages listed above, the
full data layer (both adapters), the app shell (sidebar, mobile drawer, bottom
nav, top bar, ⌘K command palette), and the Apps Script backend.

## Auth

Not wired up yet. `assets/js/config.js#currentUserId` resolves to the
workspace owner. When Google OAuth lands, that's the value to replace with a
real session lookup — everything downstream just reads `WOS.config.currentUserId`.
