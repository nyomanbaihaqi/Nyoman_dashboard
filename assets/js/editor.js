/* ──────────────────────────────────────────────────────────────
   Workspace OS — markdown editor

   Wraps a plain <textarea> in a formatting toolbar, keyboard
   shortcuts, and list continuation, so writing minutes feels like a
   document editor without becoming one.

   Deliberately NOT contenteditable. A note is stored as markdown text
   in a single spreadsheet cell; a WYSIWYG surface would mean
   converting HTML back to markdown on every save, and a lossy
   conversion silently damages meeting minutes nobody re-reads until
   they matter. Here what is typed is exactly what is stored.

   Every mutation goes through document.execCommand("insertText"),
   which keeps the browser's native undo stack intact — assigning to
   textarea.value would wipe it, and losing Ctrl+Z in a note editor is
   worse than having no toolbar at all.
   ────────────────────────────────────────────────────────────── */

(function (WOS) {
  "use strict";

  var icon = WOS.icon;
  var t = function () {
    return WOS.i18n.t.apply(null, arguments);
  };

  /* ── Text plumbing ─────────────────────────────────────────── */

  /**
   * Replace [start, end) with `text`, preserving undo history.
   * Leaves the caret selecting [selStart, selEnd] when given.
   */
  function splice(ta, start, end, text, selStart, selEnd) {
    ta.focus();
    ta.setSelectionRange(start, end);

    var inserted = false;
    try {
      // Firefox returns false rather than throwing; both are handled.
      inserted = document.execCommand("insertText", false, text);
    } catch (err) {
      inserted = false;
    }

    if (!inserted) {
      // No undo integration available, but correctness first.
      ta.value = ta.value.slice(0, start) + text + ta.value.slice(end);
    }

    ta.setSelectionRange(
      selStart === undefined ? start + text.length : selStart,
      selEnd === undefined ? (selStart === undefined ? start + text.length : selStart) : selEnd
    );
    ta.dispatchEvent(new Event("input", { bubbles: true }));
  }

  /** Character offsets of the lines touched by the current selection. */
  function lineSpan(ta) {
    var value = ta.value;
    var start = value.lastIndexOf("\n", ta.selectionStart - 1) + 1;
    var end = value.indexOf("\n", ta.selectionEnd);
    return { start: start, end: end === -1 ? value.length : end };
  }

  /* ── Inline marks (bold, italic, code, strike) ─────────────── */

  /**
   * Toggle a symmetric wrapper around the selection.
   * With nothing selected, inserts the pair and puts the caret inside, so
   * pressing Ctrl+B then typing behaves the way it does in Docs.
   */
  function wrap(ta, mark, placeholder) {
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    var value = ta.value;
    var selected = value.slice(start, end);
    var len = mark.length;

    // Already wrapped — unwrap instead, so the button is a real toggle.
    if (selected.length >= len * 2 && selected.slice(0, len) === mark && selected.slice(-len) === mark) {
      splice(ta, start, end, selected.slice(len, -len), start, end - len * 2);
      return;
    }
    if (value.slice(start - len, start) === mark && value.slice(end, end + len) === mark) {
      splice(ta, start - len, end + len, selected, start - len, end - len);
      return;
    }

    var body = selected || placeholder || "";
    splice(ta, start, end, mark + body + mark, start + len, start + len + body.length);
  }

  /* ── Block marks (headings, lists, quotes) ─────────────────── */

  /**
   * Apply a line prefix to every line in the selection, or strip it if all of
   * them already carry it. Blank lines are skipped so a list doesn't sprout
   * empty bullets from the gaps between paragraphs.
   *
   * Two patterns, because "strip" and "toggle" are different questions.
   * `detect` matches every prefix in the family so switching bullets →
   * numbers replaces the old marker instead of stacking on it; `same` matches
   * only this style, and is what decides whether the button means "apply" or
   * "remove". Using `detect` for both is what makes a list-type switch silently
   * delete the list.
   *
   * @param {RegExp} detect any prefix this command should overwrite.
   * @param {RegExp} same this style specifically.
   * @param {function|string} build the prefix, given the item's position.
   */
  function blockPrefix(ta, detect, same, build) {
    var span = lineSpan(ta);
    var block = ta.value.slice(span.start, span.end);
    var lines = block.split("\n");
    var meaningful = lines.filter(function (line) {
      return line.trim();
    });
    var allMarked =
      meaningful.length > 0 &&
      meaningful.every(function (line) {
        return same.test(line.replace(/^\s*/, ""));
      });

    var position = 0;
    var next = lines
      .map(function (line) {
        if (!line.trim()) return line;
        var indent = (line.match(/^\s*/) || [""])[0];
        var bare = line.slice(indent.length).replace(detect, "");
        position++;
        return allMarked ? indent + bare : indent + (typeof build === "function" ? build(position) : build) + bare;
      })
      .join("\n");

    splice(ta, span.start, span.end, next, span.start, span.start + next.length);
  }

  /* ── Enter: keep the list going ────────────────────────────── */

  /** Prefix families, most specific first — a checklist is also a bullet. */
  var CONTINUE = [
    { test: /^(\s*)([-*])\s\[[ xX]\]\s(.*)$/, next: function (m) { return m[1] + m[2] + " [ ] "; } },
    { test: /^(\s*)([-*])\s(.*)$/, next: function (m) { return m[1] + m[2] + " "; } },
    { test: /^(\s*)(\d+)([.)])\s(.*)$/, next: function (m) { return m[1] + (parseInt(m[2], 10) + 1) + m[3] + " "; } },
    { test: /^(\s*)>\s?(.*)$/, next: function (m) { return m[1] + "> "; } },
  ];

  /**
   * @returns {boolean} true when the Enter was handled here.
   */
  function continueList(ta) {
    if (ta.selectionStart !== ta.selectionEnd) return false;

    var caret = ta.selectionStart;
    var lineStart = ta.value.lastIndexOf("\n", caret - 1) + 1;
    var line = ta.value.slice(lineStart, caret);

    for (var i = 0; i < CONTINUE.length; i++) {
      var match = line.match(CONTINUE[i].test);
      if (!match) continue;

      var body = match[match.length - 1];
      if (!body.trim()) {
        // Enter on an empty item ends the list rather than adding another —
        // the only way out that doesn't require reaching for the mouse.
        splice(ta, lineStart, caret, "");
        return true;
      }

      splice(ta, caret, caret, "\n" + CONTINUE[i].next(match));
      return true;
    }
    return false;
  }

  /** Indent or outdent the selected list lines by two spaces. */
  function shiftIndent(ta, out) {
    var span = lineSpan(ta);
    var next = ta.value
      .slice(span.start, span.end)
      .split("\n")
      .map(function (line) {
        if (out) return line.replace(/^ {1,2}/, "");
        return line.trim() ? "  " + line : line;
      })
      .join("\n");
    splice(ta, span.start, span.end, next, span.start, span.start + next.length);
  }

  /** True when the caret sits on a list or quote line. */
  function onListLine(ta) {
    var lineStart = ta.value.lastIndexOf("\n", ta.selectionStart - 1) + 1;
    var lineEnd = ta.value.indexOf("\n", ta.selectionStart);
    var line = ta.value.slice(lineStart, lineEnd === -1 ? ta.value.length : lineEnd);
    return /^\s*([-*]\s|\d+[.)]\s|>)/.test(line);
  }

  /* ── Toolbar ───────────────────────────────────────────────── */

  var TOOLS = [
    { id: "bold", icon: "bold", key: "editor.bold", shortcut: "Ctrl+B" },
    { id: "italic", icon: "italic", key: "editor.italic", shortcut: "Ctrl+I" },
    { id: "strike", icon: "strikethrough", key: "editor.strike" },
    { id: "code", icon: "code", key: "editor.code" },
    { sep: true },
    { id: "heading", icon: "heading", key: "editor.heading" },
    { id: "quote", icon: "quote", key: "editor.quote" },
    { sep: true },
    { id: "bullet", icon: "list", key: "editor.bullet", shortcut: "Ctrl+Shift+8" },
    { id: "ordered", icon: "list-ordered", key: "editor.ordered", shortcut: "Ctrl+Shift+7" },
    { id: "checklist", icon: "list-checks", key: "editor.checklist", shortcut: "Ctrl+Shift+9" },
    { sep: true },
    { id: "link", icon: "link", key: "editor.link", shortcut: "Ctrl+K" },
    { id: "table", icon: "table", key: "editor.table" },
  ];

  /** Any list marker — what the three list buttons overwrite. */
  var ANY_LIST = /^([-*]\s(\[[ xX]\]\s)?|\d+[.)]\s)/;

  function run(ta, id) {
    if (id === "bold") wrap(ta, "**", t("editor.boldText"));
    else if (id === "italic") wrap(ta, "*", t("editor.italicText"));
    else if (id === "strike") wrap(ta, "~~", t("editor.strikeText"));
    else if (id === "code") wrap(ta, "`", "code");
    else if (id === "heading") blockPrefix(ta, /^#{1,3}\s/, /^#{1,3}\s/, "## ");
    else if (id === "quote") blockPrefix(ta, /^>\s?/, /^>\s?/, "> ");
    else if (id === "bullet") blockPrefix(ta, ANY_LIST, /^[-*]\s(?!\[[ xX]\]\s)/, "- ");
    else if (id === "ordered") {
      blockPrefix(ta, ANY_LIST, /^\d+[.)]\s/, function (n) {
        return n + ". ";
      });
    } else if (id === "checklist") blockPrefix(ta, ANY_LIST, /^[-*]\s\[[ xX]\]\s/, "- [ ] ");
    else if (id === "link") {
      var start = ta.selectionStart;
      var end = ta.selectionEnd;
      var label = ta.value.slice(start, end) || t("editor.linkText");
      var text = "[" + label + "](https://)";
      // Caret lands inside the parentheses, ready for the URL.
      splice(ta, start, end, text, start + label.length + 3, start + text.length - 1);
    } else if (id === "table") {
      var span = lineSpan(ta);
      var lead = span.start === ta.selectionStart && ta.value.slice(span.start, span.end).trim() === "" ? "" : "\n\n";
      var table =
        lead +
        "| " + t("editor.tableCol") + " 1 | " + t("editor.tableCol") + " 2 |\n" +
        "| --- | --- |\n|  |  |\n|  |  |\n";
      splice(ta, ta.selectionEnd, ta.selectionEnd, table);
    }
  }

  function toolbarMarkup() {
    return (
      '<div class="editor__bar" role="toolbar" aria-label="' + WOS.esc(t("editor.toolbar")) + '">' +
      TOOLS.map(function (tool) {
        if (tool.sep) return '<span class="editor__sep" aria-hidden="true"></span>';
        var label = t(tool.key) + (tool.shortcut ? " (" + tool.shortcut + ")" : "");
        return (
          '<button type="button" class="editor__btn" data-editor-tool="' + tool.id +
          '" title="' + WOS.esc(label) + '" aria-label="' + WOS.esc(label) + '">' +
          icon(tool.icon, 15) + "</button>"
        );
      }).join("") +
      '<span class="grow"></span>' +
      '<button type="button" class="editor__btn editor__btn--wide" data-editor-preview>' +
      icon("eye", 14) + "<span>" + WOS.esc(t("editor.preview")) + "</span></button>" +
      "</div>"
    );
  }

  /* ── Wiring ────────────────────────────────────────────────── */

  /**
   * Attach the toolbar and key handling to an existing textarea.
   *
   * @param {HTMLTextAreaElement} textarea
   * @returns {{root: HTMLElement, textarea: HTMLTextAreaElement}}
   */
  function attach(textarea) {
    var root = document.createElement("div");
    root.className = "editor";
    textarea.parentNode.insertBefore(root, textarea);

    root.insertAdjacentHTML("beforeend", toolbarMarkup());

    var body = document.createElement("div");
    body.className = "editor__body";
    root.appendChild(body);
    body.appendChild(textarea);
    textarea.classList.add("editor__input");

    var preview = document.createElement("div");
    preview.className = "editor__preview prose";
    preview.hidden = true;
    body.appendChild(preview);

    var showing = false;

    function paint() {
      if (showing) preview.innerHTML = WOS.ui.markdown(textarea.value);
    }

    // mousedown, not click: the default would blur the textarea and drop the
    // selection the command is about to act on.
    root.addEventListener("mousedown", function (event) {
      var button = event.target.closest("[data-editor-tool]");
      if (!button || !root.contains(button)) return;
      event.preventDefault();
      run(textarea, button.dataset.editorTool);
      paint();
    });

    root.addEventListener("click", function (event) {
      var button = event.target.closest("[data-editor-preview]");
      if (!button || !root.contains(button)) return;
      showing = !showing;
      preview.hidden = !showing;
      body.classList.toggle("editor__body--split", showing);
      button.classList.toggle("is-active", showing);
      button.setAttribute("aria-pressed", showing ? "true" : "false");
      paint();
    });

    textarea.addEventListener("input", WOS.debounce(paint, 120));

    textarea.addEventListener("keydown", function (event) {
      var mod = event.metaKey || event.ctrlKey;

      if (event.key === "Enter" && !event.shiftKey && !mod) {
        if (continueList(textarea)) {
          event.preventDefault();
          paint();
        }
        return;
      }

      if (event.key === "Tab" && !mod) {
        // Only swallow Tab on list lines. Everywhere else it still moves focus,
        // so the editor never becomes a keyboard trap.
        if (!onListLine(textarea)) return;
        event.preventDefault();
        shiftIndent(textarea, event.shiftKey);
        paint();
        return;
      }

      if (!mod) return;

      var id = null;
      if (event.shiftKey) {
        if (event.code === "Digit8") id = "bullet";
        else if (event.code === "Digit7") id = "ordered";
        else if (event.code === "Digit9") id = "checklist";
      } else {
        var letter = event.key.toLowerCase();
        if (letter === "b") id = "bold";
        else if (letter === "i") id = "italic";
        else if (letter === "k") id = "link";
      }

      if (id) {
        event.preventDefault();
        run(textarea, id);
        paint();
      }
    });

    return { root: root, textarea: textarea };
  }

  WOS.editor = { attach: attach, toggleAt: run };
})(window.WOS);
