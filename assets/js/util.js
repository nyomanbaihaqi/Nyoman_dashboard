/* ──────────────────────────────────────────────────────────────
   Workspace OS — DOM and string helpers

   Loaded immediately after config.js; everything else depends on it.
   ────────────────────────────────────────────────────────────── */

(function (WOS) {
  "use strict";

  /**
   * Escape text for interpolation into an HTML string.
   *
   * All rendering here builds HTML strings, and much of the content is
   * user-authored (note titles, comments, task names) or comes from a
   * spreadsheet anyone on the team can edit. Every interpolated value must go
   * through this, or a title containing "<img onerror=...>" becomes script
   * execution.
   */
  function esc(value) {
    if (value === null || value === undefined) return "";
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  /** Escape for use inside a double-quoted HTML attribute. */
  function escAttr(value) {
    return esc(value);
  }

  /** querySelector, scoped to `root` (default: document). */
  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  /** querySelectorAll as a real array. */
  function $$(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  /**
   * Create an element.
   * @param {string} tag
   * @param {object} [props] className / attrs / dataset / text / html / on
   * @param {Array} [children]
   */
  function el(tag, props, children) {
    var node = document.createElement(tag);
    props = props || {};

    if (props.className) node.className = props.className;
    if (props.text !== undefined) node.textContent = props.text;
    if (props.html !== undefined) node.innerHTML = props.html;

    if (props.attrs) {
      Object.keys(props.attrs).forEach(function (key) {
        var value = props.attrs[key];
        if (value !== null && value !== undefined && value !== false) {
          node.setAttribute(key, value === true ? "" : value);
        }
      });
    }

    if (props.dataset) {
      Object.keys(props.dataset).forEach(function (key) {
        node.dataset[key] = props.dataset[key];
      });
    }

    if (props.on) {
      Object.keys(props.on).forEach(function (event) {
        node.addEventListener(event, props.on[event]);
      });
    }

    (children || []).forEach(function (child) {
      if (child === null || child === undefined || child === false) return;
      node.appendChild(typeof child === "string" ? document.createTextNode(child) : child);
    });

    return node;
  }

  /**
   * Delegated event listener.
   * Handlers receive (event, matchedElement) so rows rendered later still work
   * without rebinding.
   */
  function on(root, event, selector, handler) {
    root.addEventListener(event, function (e) {
      var target = e.target.closest(selector);
      if (target && root.contains(target)) handler(e, target);
    });
  }

  /** Read a query-string parameter from the current URL. */
  function param(name) {
    return new URLSearchParams(window.location.search).get(name);
  }

  /** Stable id with a short prefix, matching the Apps Script format. */
  function newId(prefix) {
    return (
      (prefix || "x") + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
    );
  }

  /** Group an array into a Map keyed by `fn(item)`. */
  function groupBy(list, fn) {
    var map = new Map();
    list.forEach(function (item) {
      var key = fn(item);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(item);
    });
    return map;
  }

  /** Index an array by id for O(1) lookups. */
  function indexById(list) {
    var map = new Map();
    (list || []).forEach(function (item) {
      map.set(item.id, item);
    });
    return map;
  }

  /** Sort helper: returns a comparator on `key`, ascending by default. */
  function by(key, direction) {
    var sign = direction === "desc" ? -1 : 1;
    return function (a, b) {
      var x = a[key];
      var y = b[key];
      if (x === y) return 0;
      if (x === null || x === undefined) return 1;
      if (y === null || y === undefined) return -1;
      return x > y ? sign : -sign;
    };
  }

  /** Deep clone via structuredClone, falling back to JSON for old browsers. */
  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  /** Debounce, for search inputs and autosave. */
  function debounce(fn, wait) {
    var timer = null;
    return function () {
      var args = arguments;
      var self = this;
      clearTimeout(timer);
      timer = setTimeout(function () {
        fn.apply(self, args);
      }, wait || 200);
    };
  }

  WOS.esc = esc;
  WOS.escAttr = escAttr;
  WOS.$ = $;
  WOS.$$ = $$;
  WOS.el = el;
  WOS.on = on;
  WOS.param = param;
  WOS.newId = newId;
  WOS.groupBy = groupBy;
  WOS.indexById = indexById;
  WOS.by = by;
  WOS.clone = clone;
  WOS.debounce = debounce;
})(window.WOS);
