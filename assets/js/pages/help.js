/* ──────────────────────────────────────────────────────────────
   Help & Support — static reference content. No i18n dictionary
   entries exist for this page yet, so it renders in English only.
   ────────────────────────────────────────────────────────────── */

(function (WOS) {
  "use strict";

  var esc = WOS.esc;
  var icon = WOS.icon;

  var FAQS = [
    {
      q: "How is my data stored?",
      a: "By default everything lives in this browser's localStorage, seeded with sample data. Switching to the Google Sheets backend is a one-line change in assets/js/config.js — see the README.",
    },
    {
      q: "Where are the AI features?",
      a: "Meeting Intelligence, AI Chat, and the Ask AI buttons walk through the intended flow with sample output. Wiring up a real model is the next step — those spots are marked wherever you see them.",
    },
    {
      q: "How do I switch language?",
      a: "Settings → Preferences → Language. The choice is saved to this browser and applies across the whole workspace, including dates and numbers.",
    },
    {
      q: "How do I get back to a clean demo state?",
      a: "Settings → Preferences → Reset sample data. This discards any local edits and restores the seeded content.",
    },
  ];

  var SHORTCUTS = [
    ["⌘K / Ctrl+K", "Open the command palette"],
    ["↑ / ↓", "Navigate palette results"],
    ["↵", "Open the selected result"],
    ["Esc", "Close palette, modal, or drawer"],
  ];

  function render(page) {
    page.innerHTML =
      '<h1 class="page__title">Help & Support</h1>' +
      '<p class="page__subtitle">Quick answers, shortcuts, and where to look next.</p>' +
      '<div class="grid grid--lg-2" style="margin-top:20px;align-items:start">' +
      '<div class="card">' +
      '<h2 class="card__title">Frequently asked</h2>' +
      FAQS.map(function (item) {
        return (
          '<div style="padding:14px 0;border-top:1px solid var(--border-subtle)">' +
          '<p class="text-sm fw-bold strong">' + esc(item.q) + "</p>" +
          '<p class="text-sm muted" style="margin-top:6px;line-height:1.6">' + esc(item.a) + "</p></div>"
        );
      }).join("") +
      "</div>" +
      '<div class="stack">' +
      '<div class="card">' +
      '<h2 class="card__title">Keyboard shortcuts</h2>' +
      SHORTCUTS.map(function (row) {
        return (
          '<div class="spread" style="padding:8px 0;border-top:1px solid var(--border-subtle)">' +
          '<span class="kbd">' + esc(row[0]) + "</span>" +
          '<span class="text-sm muted">' + esc(row[1]) + "</span></div>"
        );
      }).join("") +
      "</div>" +
      '<div class="card">' +
      '<h2 class="card__title">Workspace areas</h2>' +
      '<div class="row">' + icon("file-pen", 15, { color: "var(--antar-purple)" }) +
      '<span class="text-sm" style="color:var(--text-body)">Personal Assistant — tasks, calendar, notes, approvals</span></div>' +
      '<div class="row">' + icon("briefcase", 15, { color: "var(--antar-purple)" }) +
      '<span class="text-sm" style="color:var(--text-body)">Project Manager — projects, kanban, timeline</span></div>' +
      '<div class="row">' + icon("rocket", 15, { color: "var(--antar-purple)" }) +
      '<span class="text-sm" style="color:var(--text-body)">AI Engineer — automations, prompts, meeting intelligence</span></div>' +
      "</div></div></div>";
  }

  WOS.shell
    .mount({ active: "help", title: "Help & Support" })
    .then(function (main) {
      render(main);
    })
    .catch(function (error) {
      WOS.shell.renderError(document.getElementById("page") || document.body, error);
    });
})(window.WOS);
