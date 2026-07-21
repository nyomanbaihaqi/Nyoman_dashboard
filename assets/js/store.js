/* ──────────────────────────────────────────────────────────────
   Workspace OS — data layer

   One API for every screen, two backends behind it:

     "local"  localStorage, seeded from seed.js
     "api"    POST /api/sheets → Apps Script → Google Sheet

   Screens only ever call WOS.db.* and never learn which is active, so
   switching backends is a one-line change in config.js.
   ────────────────────────────────────────────────────────────── */

(function (WOS) {
  "use strict";

  var cache = {}; // collection name → array, populated on first read
  var listeners = [];

  /* ── localStorage backend ──────────────────────────────────── */

  function storageKey(collection) {
    return WOS.config.storagePrefix + collection;
  }

  function localRead(collection) {
    try {
      var raw = localStorage.getItem(storageKey(collection));
      if (raw) return JSON.parse(raw);
    } catch (err) {
      // Corrupt or unreadable (private mode) — fall back to the seed rather
      // than leaving the screen empty.
      console.warn("[wos] could not read " + collection + " from localStorage", err);
    }
    var seeded = WOS.seed()[collection] || [];
    localWrite(collection, seeded);
    return seeded;
  }

  function localWrite(collection, rows) {
    try {
      localStorage.setItem(storageKey(collection), JSON.stringify(rows));
    } catch (err) {
      // Quota exceeded or storage disabled. The in-memory cache still holds
      // the change for this session, so surface it rather than failing silently.
      console.warn("[wos] could not persist " + collection, err);
      WOS.ui && WOS.ui.toast(WOS.i18n.t("state.error"), "error");
    }
  }

  /* ── API backend ───────────────────────────────────────────── */

  function rpc(collection, op, payload) {
    var body = Object.assign({ collection: collection, op: op }, payload || {});

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

  var useApi = function () {
    return WOS.config.backend === "api";
  };

  /* ── Public API ────────────────────────────────────────────── */

  /**
   * Load a collection, from cache when already fetched.
   * @returns {Promise<Array>}
   */
  function list(collection) {
    if (cache[collection]) return Promise.resolve(cache[collection]);

    if (!useApi()) {
      cache[collection] = localRead(collection);
      return Promise.resolve(cache[collection]);
    }

    return rpc(collection, "list").then(function (rows) {
      cache[collection] = rows || [];
      return cache[collection];
    });
  }

  /** Load several collections at once. Resolves to an object keyed by name. */
  function loadAll(names) {
    return Promise.all(names.map(list)).then(function (results) {
      var out = {};
      names.forEach(function (name, index) {
        out[name] = results[index];
      });
      return out;
    });
  }

  function get(collection, id) {
    return list(collection).then(function (rows) {
      return (
        rows.filter(function (row) {
          return row.id === id;
        })[0] || null
      );
    });
  }

  function create(collection, data) {
    var row = Object.assign({}, data);
    if (!row.id) row.id = WOS.newId(collection.slice(0, 2));

    if (!useApi()) {
      return list(collection).then(function (rows) {
        rows.push(row);
        localWrite(collection, rows);
        emit(collection);
        return row;
      });
    }

    return rpc(collection, "create", { data: row }).then(function (saved) {
      if (cache[collection]) cache[collection].push(saved);
      emit(collection);
      return saved;
    });
  }

  function update(collection, id, patch) {
    return list(collection).then(function (rows) {
      var index = rows.findIndex(function (row) {
        return row.id === id;
      });
      if (index === -1) return null;

      // Apply locally first so the UI can re-render immediately; the API call
      // below reconciles. `id` is never patched.
      var merged = Object.assign({}, rows[index], patch);
      merged.id = id;
      rows[index] = merged;

      if (!useApi()) {
        localWrite(collection, rows);
        emit(collection);
        return merged;
      }

      emit(collection);
      return rpc(collection, "update", { id: id, data: patch }).then(function (saved) {
        if (saved) rows[index] = saved;
        return saved || merged;
      });
    });
  }

  function remove(collection, id) {
    return list(collection).then(function (rows) {
      var index = rows.findIndex(function (row) {
        return row.id === id;
      });
      if (index === -1) return false;
      rows.splice(index, 1);

      if (!useApi()) {
        localWrite(collection, rows);
        emit(collection);
        return true;
      }

      emit(collection);
      return rpc(collection, "remove", { id: id }).then(function () {
        return true;
      });
    });
  }

  /** Wipe local data and reseed. Only meaningful for the local backend. */
  function resetLocal() {
    WOS.COLLECTIONS.forEach(function (name) {
      try {
        localStorage.removeItem(storageKey(name));
      } catch (err) {
        /* nothing to clear */
      }
      delete cache[name];
    });
  }

  /**
   * Copy the sample data into the Sheets backend, one bulk write per
   * collection.
   *
   * Deliberately talks to the API regardless of the active backend, so it can
   * be run while still on "local" — that's the useful order: fill the
   * spreadsheet first, confirm it looks right, then switch config.js over.
   *
   * Refuses to run if `members` already has rows, so a stray second click
   * can't duplicate every record in the workspace.
   *
   * @returns {Promise<{seeded: boolean, counts?: object}>}
   */
  function seedRemote() {
    return rpc("members", "list").then(function (existing) {
      if (existing && existing.length) return { seeded: false };

      var data = WOS.seed();
      var names = WOS.COLLECTIONS.filter(function (name) {
        return (data[name] || []).length;
      });

      // Sequential, not parallel: each write takes the Apps Script lock, so
      // firing 17 at once just makes them queue behind each other anyway —
      // and a failure part-way is easier to reason about in order.
      var counts = {};
      return names
        .reduce(function (chain, name) {
          return chain.then(function () {
            return rpc(name, "createMany", { rows: data[name] }).then(function () {
              counts[name] = data[name].length;
            });
          });
        }, Promise.resolve())
        .then(function () {
          return { seeded: true, counts: counts };
        });
    });
  }

  /* ── Change notification ───────────────────────────────────── */

  function emit(collection) {
    listeners.forEach(function (fn) {
      try {
        fn(collection);
      } catch (err) {
        console.error("[wos] change listener failed", err);
      }
    });
  }

  function onChange(fn) {
    listeners.push(fn);
    return function off() {
      listeners = listeners.filter(function (other) {
        return other !== fn;
      });
    };
  }

  /* ── Derived helpers used across screens ───────────────────── */

  /** The signed-in member. Falls back to the owner, then the first row. */
  function currentUser() {
    return list("members").then(function (rows) {
      var byId = rows.filter(function (m) {
        return m.id === WOS.config.currentUserId;
      })[0];
      var owner = rows.filter(function (m) {
        return m.role === "owner";
      })[0];
      return byId || owner || rows[0] || null;
    });
  }

  /** Badge counts for the sidebar and tab bar. */
  function navCounts() {
    return loadAll(["tasks", "threads", "approvals", "members"]).then(function (data) {
      var me = WOS.config.currentUserId;
      return {
        tasks: data.tasks.filter(function (t) {
          return t.assigneeId === me && t.status !== "done";
        }).length,
        inbox: data.threads.filter(function (t) {
          return !t.read;
        }).length,
        approvals: data.approvals.filter(function (a) {
          return a.state === "pending" && a.approverId === me;
        }).length,
      };
    });
  }

  WOS.db = {
    list: list,
    loadAll: loadAll,
    get: get,
    create: create,
    update: update,
    remove: remove,
    resetLocal: resetLocal,
    seedRemote: seedRemote,
    onChange: onChange,
    currentUser: currentUser,
    navCounts: navCounts,
  };
})(window.WOS);
