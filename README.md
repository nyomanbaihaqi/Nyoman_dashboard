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
brief.html               ceo.html             weekly.html
scrum.html               notes.html           templates.html
tasks.html               kanban.html          projects.html
project.html?id=         calendar.html
notes.html               templates.html
note.html?id=            meeting.html?id=     meeting-intelligence.html
timeline.html            milestones.html
issues.html              settings.html        help.html

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

### Google Calendar

The calendar reads and writes the real Google Calendar of the account that
owns the Apps Script deployment. There is no second OAuth flow: the script
already runs as that account, so `CalendarApp` is available to it directly,
and the `SECRET` guarding the endpoint stays the only credential involved.

Turning it on:

1. Paste the current `Code.gs` into the Apps Script editor and **Deploy →
   Manage deployments → edit → Deploy**.
2. Run any calendar function once from the editor (`calendarList` is
   harmless). Google will prompt to authorise the **Calendar** scope, which
   the previous deployment never needed — the endpoint returns
   `unauthorized`-style errors until this is granted.
3. Set `calendarSource: "google"` in `assets/js/config.js`.

Google is the source of truth while this is on. Nothing is mirrored into the
spreadsheet, so the two can't drift; the `events` collection is only used
when `calendarSource` is `"sheets"`.

Two app concepts have no native Google field and are stored as event tags:
`wosLabel` (the colour vocabulary) and `wosMeetingId` (the link from a
calendar entry to its minutes). Labels are also written to Google's own event
colour, so an event still looks right inside Google Calendar. Editing the
colour there changes the label here.

Events are fetched per visible window rather than all at once, so moving to
another week is a request. Writes go straight to Google and invalidate the
cached windows.

**Not covered:** creating Google Meet links, which needs the Advanced
Calendar Service rather than `CalendarApp`, and editing a whole recurring
series — saving a repeating event changes that occurrence only, which the
edit dialog says.

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
calendar, split view, forms, modals, command palette, …) used across all 20
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

### AI Recap — recording → five-point MoM

Notes & Meetings → **AI Recap** takes a meeting recording (or a pasted
transcript) and returns the handbook's five points — Fact, Assumption,
Proposal, Decision, Action — which you review and then save as a `meetings`
record. It deliberately writes into the existing Meeting page rather than
somewhere new, so the minutes land where the Copy-to-WhatsApp flow already
lives.

**Setup.** Get a key from <https://aistudio.google.com/apikey>, then in the
Vercel project: Settings → Environment Variables → add `GEMINI_API_KEY` →
**Redeploy**. Environment variables do not apply to a deployment that is
already running, so skipping the redeploy leaves the feature reporting that
it isn't configured. Optionally set `GEMINI_MODEL` to override the default
(`gemini-2.0-flash`).

**Why the upload is a three-step dance.** A Vercel function body caps out
around 4.5 MB and a two-hour recording is 30-60 MB, so the audio never passes
through the site. `api/analyze.js` asks Google for a resumable upload URL and
hands only that URL to the browser, which PUTs the bytes straight to Google.
The upload URL carries its own short-lived token, so `GEMINI_API_KEY` stays
server-side — the same reason `/api/sheets` exists.

The model is asked for JSON against a fixed schema and told, in as many words,
never to promote a proposal into a decision: these minutes get pasted into
WhatsApp and acted on, so an invented decision is the expensive failure.
Action-item owners are matched against the `members` list by name; an
unmatched name is stored as a hint and left **unassigned** rather than guessed,
because a wrongly assigned task is worse than an unassigned one.

### Still demo-only

The AI Chat panels and the various "Ask AI" buttons walk through the intended
UX with sample output — there's no model behind them. Each shows
`mi.aiPending` ("AI processing isn't connected yet…") so it reads as a demo,
not a broken feature. Converting a meeting action item into a real task,
though, is fully functional — it writes to the `tasks` collection like any
other create.

## CEO Assistant

`ceo.html` holds the two things the assistant carries into the CEO's day.

**CEO Approvals** is a day-at-a-time list of what needs a yes or no, decided in
the room with one tap and a note. It reads and writes the same `approvals`
collection as the Decisions page rather than keeping a private copy — Decisions
is the same data seen from the requester's end, and two stores would drift the
moment one screen saw more use.

Two behaviours carry the design. Anything still undecided from an earlier day
is pulled forward under "still waiting", because a request that isn't asked
about twice is a decision that never happens. And anything *decided* on a given
day stays on that day whatever day it was raised — otherwise settling a
carried-over item makes it vanish, and it drops out of the day's copied report.

**Today's Changes** is one improvement Antarestar is trying per day: a
tasklist, and then what actually came of it. Finishing every step prompts for
the result rather than letting the entry sit closed-but-unexplained, and the
outcome can be recorded as "didn't work" — a log where everything succeeded is
a log nobody was honest in.

New data: `changes`, plus a `raiseOn` column on `approvals` (which day to put
it in front of the CEO — a different fact from when it was requested). Run
`migrateSheets()` in the Apps Script editor once to add the tab and the column.

## ClickUp tasks

The office runs its task list in ClickUp, so ClickUp is the source of truth:
the app reads and writes it directly and mirrors nothing into the spreadsheet.
Switch with `taskSource` in `assets/js/config.js` (`"clickup"` or `"sheets"`),
and set `clickupListId` to the number after `/li/` in the list's URL.

**Setup.** In ClickUp: avatar → Settings → Apps → generate a personal API token.
In Vercel: Settings → Environment Variables → add `CLICKUP_TOKEN` → **Redeploy**.
Environment variables do not apply to a deployment that is already running.

The token is never in the repo and never reaches the browser. A ClickUp personal
token grants full access to the whole workspace, and this frontend is static
files anyone can read — so `api/clickup.js` holds it server-side, the same
arrangement as `SHEETS_SECRET` and `GEMINI_API_KEY`. ClickUp also sends no CORS
headers, so a direct call from the page would be blocked anyway.

### Where the switch lives

In `store.js`, inside the four functions every page already calls — not in the
Tasks screen. Tasks are also read by Home, Kanban, the daily brief and the
weekly review; routing per-page would have left those showing spreadsheet rows
while Tasks showed ClickUp, which is worse than not integrating at all.

### What the translation has to reconcile

- **Statuses.** ClickUp lists define their own, so writing the literal string
  `"done"` fails on a list whose closing status is called "Complete". The list's
  statuses are fetched first and sorted into the app's four by ClickUp's `type`
  (reliable for open/closed) plus the name (to separate review from in-progress).
  Writes resolve back to the list's real wording.
- **Priority** is 1–4 there and three words here, and arrives as an object on
  most responses but a bare number on some — reading only `.priority` off it
  makes every task in those replies read as medium.
- **Dates** are epoch milliseconds as strings, and need `due_date_time` set or
  ClickUp files everything at midnight UTC, which reads as the previous day in
  Jakarta.
- **Identity.** A ClickUp assignee is not a row in the members sheet. People are
  matched by email so a task assigned to you in ClickUp is recognised as yours
  here; without it every personal view — "assigned to me", the sidebar count,
  Today's Focus, the brief's priorities — is empty while all the tasks are still
  on screen, which is what makes it easy to miss. Unmatched ClickUp people are
  merged into `members` as `cu_<id>` so their avatars resolve everywhere.

### Failure behaviour

Writes are optimistic and roll back: a rejected update restores the previous
value and a rejected delete puts the row back, because a delete that failed
upstream must not look like it worked. The sidebar's task count catches its own
errors — the shell awaits it before rendering, so letting it reject would leave
every page with no navigation during a ClickUp outage.

## Daily Scrum

`scrum.html` is the morning report each division files: a photo, a note, and
the time it was filed. Fixed in shape on purpose — every scrum is the same four
things — so the whole office reports the same way and the day reads at a glance.
Choosing a division fills the title ("Daily Scrum <Division>"), so filing one is
picking a division and attaching a photo.

**Photos.** A base64 image is far past a spreadsheet cell's ~50k-char limit, so
the photo goes to Drive and the row keeps only the link. The browser downscales
to 1280px and re-encodes as JPEG before upload — a 5 MB phone photo leaves as
~200 KB, which also keeps it under the serverless function's request-size limit.
`api/clickup.js`-style, the work happens in Apps Script: a new `uploadPhoto` op
saves the file to a "Workspace OS — Scrum Photos" folder shared
anyone-with-link, and returns a `drive.google.com/uc?...` URL that renders in an
`<img>`.

**Setup.** Paste the updated `Code.gs` into the Apps Script editor and run any
function once to trigger the new Drive authorisation prompt (the script now
touches DriveApp, a scope it didn't need before), then redeploy. In local mode
there is no Drive, so the downscaled data URL is stored directly.

## Brief: Daily Notes Meeting

A fourth brief tab. It collects the notes written or updated today (from the
`notes` collection) and produces one WhatsApp-ready message. Keyed off
`updatedAt` as well as `createdAt`, so a note finished in this morning's meeting
counts as today's. The markdown is flattened to plain text — WhatsApp renders
none of it, so headings, code fences, callouts and rules are stripped and table
rows become "·"-joined lines rather than leaking pipe syntax.

## Notes & Meetings

The **Meetings** tab was removed from the hub. The `meetings` collection stays —
AI Recap writes to it and the Daily Report Meeting brief reads it — and Home
still shows recent meetings linking to their detail pages; only the list tab and
its dead "View all" link are gone.

## Removed features

Screens deleted once it was clear they could not do the job they implied:

- **Prompt Library, Documents, Automations** — prompts for an AI that wasn't
  wired up, a duplicate of Notes, and a control panel for a scheduler that
  doesn't exist.
- **Daily Notes, Ideas** — unused in practice.
- **Reminders** (`notifications.html`) — nothing in the app ever *created* a
  notification, so the page could only ever display its seed rows and would be
  permanently empty against real data. What it did show (approvals waiting) is
  what CEO Assistant and Decisions already cover. The header bell went with it:
  it was counting unread Inbox threads while linking to Notifications, so its
  number never matched the page it opened. Settings' Notifications tab went too
  — a preferences panel for a screen that no longer exists is just a lie with
  toggles.

- **Inbox** (`inbox.html`) — the same story, one step further along: `threads`
  were never created, and no screen had linked to the page since the navigation
  was reorganised, so it was already unreachable.
- **Decisions** (`approvals.html`) — the same `approvals` rows CEO Assistant
  works through, listed from the requester's end instead of the day's. Before
  deleting it, the three things it showed and CEO Assistant didn't were moved
  across: the `context` paragraph, the clickable `options`, and the division.
  Otherwise the reasoning behind a decision would have become unreachable while
  the yes/no button stayed. The pending-approvals badge moved onto CEO Assistant
  so the count still sits where the work is done, and Home and Weekly Review now
  link there.

Their spreadsheet tabs are untouched; only the app stopped reading them.
`WOS.COLLECTIONS` is down from 16 to 13 — `ideas`, `notifications`, `threads`,
and `folders` (a leftover of the deleted Knowledge page, read by nothing) no
longer ride along in every `loadAll`.

## Status

Built and verified end-to-end, including create/update/delete flows and
console-clean navigation across every page: all 20 pages listed above, the
full data layer (both adapters), the app shell (sidebar, mobile drawer, bottom
nav, top bar, ⌘K command palette), and the Apps Script backend.

## Auth

Not wired up yet. `assets/js/config.js#currentUserId` resolves to the
workspace owner. When Google OAuth lands, that's the value to replace with a
real session lookup — everything downstream just reads `WOS.config.currentUserId`.
