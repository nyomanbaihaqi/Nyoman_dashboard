/* ──────────────────────────────────────────────────────────────
   Workspace OS — icon registry

   Inline SVG, lucide-style: 24×24 grid, 2px stroke, currentColor.
   Icon names are stored in the data (and in spreadsheet cells), so
   they're plain strings. An unknown name renders nothing rather than
   throwing, because that string can come from a sheet someone edited.
   ────────────────────────────────────────────────────────────── */

(function (WOS) {
  "use strict";

  /** Path/shape markup for each icon, drawn on a 24×24 viewBox. */
  var PATHS = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    "file-pen":
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h5"/><path d="M14 2v5h5"/><path d="M21.4 13.6a2 2 0 0 0-2.8 0l-5.1 5.1V22h3.3l5.1-5.1a2 2 0 0 0 0-2.8Z"/>',
    "chart-line": '<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="m7 15 4-4 3 3 5-6"/>',
    boxes:
      '<path d="M12 3 4 7v10l8 4 8-4V7Z"/><path d="m4 7 8 4 8-4"/><path d="M12 11v10"/>',
    crown: '<path d="M3 6l4 5 5-7 5 7 4-5v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
    "shield-user":
      '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><circle cx="12" cy="10" r="2.5"/><path d="M8.5 16a4 4 0 0 1 7 0"/>',
    crosshair:
      '<circle cx="12" cy="12" r="9"/><path d="M12 3v4"/><path d="M12 17v4"/><path d="M3 12h4"/><path d="M17 12h4"/>',
    bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4"/><circle cx="9" cy="14" r="1.2"/><circle cx="15" cy="14" r="1.2"/><path d="M2 13v3"/><path d="M22 13v3"/>',
    lightbulb:
      '<path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a6 6 0 0 0-4 10.5c.8.8 1.2 1.6 1.3 2.5h5.4c.1-.9.5-1.7 1.3-2.5A6 6 0 0 0 12 2Z"/>',
    "message-square": '<path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2Z"/>',
    briefcase:
      '<rect x="2" y="7" width="20" height="14" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/><path d="M2 13h20"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    bell: '<path d="M18 8a6 6 0 1 0-12 0c0 6-3 7-3 7h18s-3-1-3-7"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
    layers:
      '<path d="m12 2 9 5-9 5-9-5Z"/><path d="m3 12 9 5 9-5"/><path d="m3 17 9 5 9-5"/>',
    rocket:
      '<path d="M5 13c-1.5 1.5-2 5-2 5s3.5-.5 5-2"/><path d="M14 5c3 0 6 3 6 3-1 4-4 7-8 8l-3-3c1-4 4-7 8-8Z"/><circle cx="15" cy="9" r="1.5"/>',
    target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevron-right": '<path d="m9 6 6 6-6 6"/>',
    "chevron-left": '<path d="m15 6-6 6 6 6"/>',
    plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
    x: '<path d="m6 6 12 12"/><path d="m18 6-12 12"/>',
    check: '<path d="m5 12 5 5L20 7"/>',
    star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2-5.5-2.9-5.5 2.9 1-6.2L3 9.6l6.2-.9Z"/>',
    share:
      '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4"/><path d="m15.4 6.5-6.8 4"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 9 5-5 5 5"/><path d="M12 4v12"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m7 11 5 5 5-5"/><path d="M12 16V4"/>',
    mic: '<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v4"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/>',
    settings:
      '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a1.7 1.7 0 0 0-1.6-1H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 3 9a1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 9 3.5V3a2 2 0 1 1 4 0v.1A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 9h.1a2 2 0 1 1 0 4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
    ellipsis: '<circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>',
    warning: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
    sparkles:
      '<path d="m12 3 1.9 4.6L18.5 9.5l-4.6 1.9L12 16l-1.9-4.6L5.5 9.5l4.6-1.9Z"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9Z"/>',
    paperclip: '<path d="M21 11.5 12.5 20a5 5 0 0 1-7-7l8.5-8.5a3.5 3.5 0 0 1 5 5L10.5 18a2 2 0 0 1-3-3l8-8"/>',
    languages:
      '<path d="M2 5h10"/><path d="M7 3v2"/><path d="M10 5c0 4-3 7-7 8"/><path d="M5 9c0 2 2 4 6 5"/><path d="m13 21 4-10 4 10"/><path d="M14.5 17h5"/>',
    play: '<path d="M6 4l14 8-14 8Z"/>',
    calendar:
      '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M8 3v4"/><path d="M16 3v4"/>',
    filter: '<path d="M3 5h18l-7 8v6l-4 2v-8Z"/>',
    "arrow-left": '<path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>',
    refresh: '<path d="M21 12a9 9 0 1 1-3-6.7"/><path d="M21 4v5h-5"/>',

    /* Editor toolbar. Drawn with a 2px stroke like the rest, so the letter
       forms are built from paths rather than <text> — a text node would pick
       up the page font and stop matching the other icons. */
    bold: '<path d="M7 5h6.5a3.5 3.5 0 0 1 0 7H7Z"/><path d="M7 12h7.5a3.5 3.5 0 0 1 0 7H7Z"/>',
    italic: '<path d="M17 4h-6"/><path d="M13 20H7"/><path d="m14 4-4 16"/>',
    strikethrough:
      '<path d="M4 12h16"/><path d="M17 7a4 4 0 0 0-4-3h-1a3.5 3.5 0 0 0-1.5 6.6"/><path d="M8 17a4 4 0 0 0 4 3h1a3.5 3.5 0 0 0 2.2-6.2"/>',
    heading: '<path d="M6 4v16"/><path d="M18 4v16"/><path d="M6 12h12"/>',
    list: '<path d="M9 6h11"/><path d="M9 12h11"/><path d="M9 18h11"/><circle cx="4.5" cy="6" r="1.2"/><circle cx="4.5" cy="12" r="1.2"/><circle cx="4.5" cy="18" r="1.2"/>',
    "list-ordered":
      '<path d="M10 6h10"/><path d="M10 12h10"/><path d="M10 18h10"/><path d="M4 4.5 5.5 4v4"/><path d="M4 10.5h2.5L4 14h2.5"/><path d="M4 16h2.5v1.5H5v1h1.5V20H4"/>',
    "list-checks":
      '<path d="M11 6h9"/><path d="M11 12h9"/><path d="M11 18h9"/><path d="m3 6 1.5 1.5L7.5 4.5"/><path d="m3 17 1.5 1.5L7.5 15.5"/>',
    quote:
      '<path d="M9 7H5a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v1a2 2 0 0 1-2 2H4"/><path d="M20 7h-4a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2v1a2 2 0 0 1-2 2h-1"/>',
    code: '<path d="m8 6-6 6 6 6"/><path d="m16 6 6 6-6 6"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
    table:
      '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18"/><path d="M3 15h18"/><path d="M9 10v10"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    undo: '<path d="M3 12a9 9 0 1 1 3 6.7"/><path d="M3 4v5h5"/>',
  };

  /**
   * Build an <svg> string for `name`.
   *
   * @param {string} name  registry key
   * @param {number} [size=16]
   * @param {object} [opts] { color, className, label }
   *   Icons are decorative by default (aria-hidden); pass `label` when the
   *   icon is the only content of a control.
   * @returns {string} SVG markup, or "" for an unknown name.
   */
  function icon(name, size, opts) {
    var body = PATHS[name];
    if (!body) return "";

    size = size || 16;
    opts = opts || {};

    var attrs = [
      'xmlns="http://www.w3.org/2000/svg"',
      'width="' + size + '"',
      'height="' + size + '"',
      'viewBox="0 0 24 24"',
      'fill="none"',
      'stroke="currentColor"',
      'stroke-width="2"',
      'stroke-linecap="round"',
      'stroke-linejoin="round"',
      "style=\"flex:none" + (opts.color ? ";color:" + opts.color : "") + '"',
    ];

    if (opts.className) attrs.push('class="' + opts.className + '"');
    if (opts.label) {
      attrs.push('role="img"', 'aria-label="' + WOS.esc(opts.label) + '"');
    } else {
      attrs.push('aria-hidden="true"', 'focusable="false"');
    }

    return "<svg " + attrs.join(" ") + ">" + body + "</svg>";
  }

  icon.has = function (name) {
    return Object.prototype.hasOwnProperty.call(PATHS, name);
  };

  WOS.icon = icon;
})(window.WOS);
