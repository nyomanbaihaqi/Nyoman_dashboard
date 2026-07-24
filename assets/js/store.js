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

  /* ── Session cache (API backend only) ──────────────────────────
     Every Apps Script call costs ~1.9s before it reads a single row —
     the redirect hop and script startup — plus ~0.26s per collection.
     A cold page load is worse still, because the shell fetches the
     signed-in member and the badge counts before the page fetches its
     own data: three sequential round trips, measured at 8.9s.

     So reads are served stale-while-revalidate. A cached copy renders
     immediately no matter its age, and anything past FRESH_MS is
     refreshed in the background for the next navigation. Only a
     collection with no cache at all blocks on the network. The cost is
     paid once per session instead of on a repeating timer, and edits
     from elsewhere land one navigation later rather than never.

     localStorage is deliberately not used: a stale copy of the
     workspace shouldn't outlive the tab.
     ────────────────────────────────────────────────────────────── */

  var FRESH_MS = 30000;
  var revalidating = {}; // collection → true while a background refresh is out

  function sessionKey(collection) {
    return WOS.config.storagePrefix + "cache." + collection;
  }

  /** @returns {{rows: Array, fresh: boolean}|null} */
  function sessionRead(collection) {
    try {
      var raw = sessionStorage.getItem(sessionKey(collection));
      if (!raw) return null;
      var entry = JSON.parse(raw);
      if (!entry || typeof entry.at !== "number" || !entry.rows) return null;
      return { rows: entry.rows, fresh: Date.now() - entry.at <= FRESH_MS };
    } catch (err) {
      return null; // unreadable or disabled — just miss the cache
    }
  }

  /**
   * Refresh collections in the background and notify listeners if anything
   * actually changed, so a page sitting open picks up edits without a manual
   * reload. Failures are swallowed: the cached copy is already on screen and
   * a background refresh is not something to interrupt the user over.
   */
  function revalidate(names) {
    var due = names.filter(function (name) {
      return !revalidating[name];
    });
    if (!due.length) return;

    due.forEach(function (name) {
      revalidating[name] = true;
    });

    rpc(null, "listMany", { collections: due })
      .then(function (fetched) {
        due.forEach(function (name) {
          var rows = (fetched && fetched[name]) || [];
          var changed = JSON.stringify(rows) !== JSON.stringify(cache[name]);
          cache[name] = rows;
          sessionWrite(name, rows);
          if (changed) emit(name);
        });
      })
      .catch(function (error) {
        console.warn("[wos] background refresh failed", error);
      })
      .then(function () {
        due.forEach(function (name) {
          delete revalidating[name];
        });
      });
  }

  function sessionWrite(collection, rows) {
    try {
      sessionStorage.setItem(sessionKey(collection), JSON.stringify({ at: Date.now(), rows: rows }));
    } catch (err) {
      // Quota or private mode. The cache is an optimisation, never the
      // source of truth, so a failure here is not worth surfacing.
    }
  }

  /** Push the in-memory copy back to the session cache after a write. */
  function sessionSync(collection) {
    if (useApi() && cache[collection]) sessionWrite(collection, cache[collection]);
  }

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

  /* ── ClickUp ───────────────────────────────────────────────── */

  /**
   * True when this collection lives in ClickUp instead of the spreadsheet.
   *
   * The switch sits here, in the four functions every page already calls,
   * rather than in the Tasks screen. Tasks are also read by Home, Kanban, the
   * daily brief and the weekly review — routing per-page would have left those
   * showing spreadsheet rows while Tasks showed ClickUp, which is worse than
   * not integrating at all.
   */
  function viaClickUp(collection) {
    return collection === "tasks" && WOS.clickup && WOS.clickup.isActive();
  }

  /**
   * ClickUp's people, merged into `members` so avatars resolve everywhere.
   *
   * A ClickUp assignee is not a row in the members sheet, so without this
   * every task would render the "?" avatar on every screen.
   */
  function withClickUpPeople(rows) {
    if (!WOS.clickup || !WOS.clickup.isActive()) return rows;

    var extra = WOS.clickup.people();
    if (!extra.length) return rows;

    var known = {};
    (rows || []).forEach(function (member) {
      known[member.id] = true;
      if (member.email) known[String(member.email).toLowerCase()] = true;
    });

    return (rows || []).concat(
      extra.filter(function (person) {
        return !known[person.id] && !(person.email && known[String(person.email).toLowerCase()]);
      })
    );
  }

  /* ── Public API ────────────────────────────────────────────── */

  /**
   * Load a collection, from cache when already fetched.
   * @returns {Promise<Array>}
   */
  function list(collection) {
    if (cache[collection]) return Promise.resolve(cache[collection]);

    if (viaClickUp(collection)) {
      // Members first, so a ClickUp assignee who is also in the members sheet
      // resolves to the app's id for that person. `members` never routes back
      // through ClickUp, so this can't recurse.
      return list("members")
        .catch(function () {
          return [];
        })
        .then(function (members) {
          WOS.clickup.identify(members);
          return WOS.clickup.list();
        })
        .then(function (rows) {
          cache[collection] = rows;
          // Deliberately not written to sessionStorage: ClickUp is edited by
          // the whole office, and serving a cached list after a reload would
          // show someone else's work as it was minutes ago.
          return rows;
        });
    }

    if (!useApi()) {
      cache[collection] = localRead(collection);
      return Promise.resolve(cache[collection]);
    }

    var cached = sessionRead(collection);
    if (cached) {
      cache[collection] = cached.rows;
      if (!cached.fresh) revalidate([collection]);
      return Promise.resolve(cached.rows);
    }

    return rpc(collection, "list").then(function (rows) {
      cache[collection] = rows || [];
      sessionWrite(collection, cache[collection]);
      return cache[collection];
    });
  }

  /**
   * Load several collections at once. Resolves to an object keyed by name.
   *
   * On the API backend this is one request, not one per collection: Apps
   * Script holds a script lock for the duration of every call, so issuing six
   * at once just queues them — a page needing six collections spent about
   * five seconds waiting. Anything already cached is left out of the request.
   *
   * @param {string[]} [optional] collections that degrade to [] on failure
   *   instead of rejecting the whole load. A page where tasks are one widget
   *   among many (Home, the briefs) marks them optional, so a ClickUp outage
   *   or a not-yet-set token leaves that page working with an empty task list
   *   rather than a full error screen. The pages that ARE the task list
   *   (My Tasks, Kanban) leave it required, so they still surface the reason.
   */
  function loadAll(names, optional) {
    optional = optional || [];
    var isOptional = function (name) {
      return optional.indexOf(name) !== -1;
    };

    // Tasks come from a different system on a different request, so they are
    // pulled out of the batch and re-joined at the end. They run in parallel
    // with the spreadsheet read rather than after it — a page asking for both
    // shouldn't pay for them one after the other.
    var fromClickUp = names.filter(viaClickUp);
    if (fromClickUp.length) {
      var rest = names.filter(function (name) {
        return !viaClickUp(name);
      });

      return Promise.all([
        rest.length ? loadAll(rest, optional) : Promise.resolve({}),
        Promise.all(fromClickUp.map(function (name) {
          if (!isOptional(name)) return list(name);
          return list(name).catch(function (error) {
            console.warn("[wos] " + name + " unavailable, continuing without it", error);
            return [];
          });
        })),
      ]).then(function (results) {
        var merged = Object.assign({}, results[0]);
        fromClickUp.forEach(function (name, index) {
          merged[name] = results[1][index];
        });
        // Members must be widened after ClickUp's people are known, which only
        // happens once its metadata has loaded — hence here, not in list().
        if (merged.members) merged.members = withClickUpPeople(merged.members);
        return merged;
      });
    }

    if (!useApi()) {
      return Promise.all(names.map(list)).then(function (results) {
        return zip(names, results);
      });
    }

    var missing = [];
    var stale = [];
    names.forEach(function (name) {
      if (cache[name]) return;
      var cached = sessionRead(name);
      if (cached) {
        cache[name] = cached.rows;
        if (!cached.fresh) stale.push(name);
        return;
      }
      missing.push(name);
    });

    if (!missing.length) {
      // Everything is on hand — render now, refresh anything aging behind it.
      if (stale.length) revalidate(stale);
      return Promise.resolve(
        zip(
          names,
          names.map(function (name) {
            return cache[name];
          }),
        ),
      );
    }

    if (stale.length) revalidate(stale);

    return rpc(null, "listMany", { collections: missing })
      .catch(function (error) {
        // An Apps Script deployment still running an older Code.gs answers
        // "unknown op: listMany". Fall back to one request per collection so
        // the app degrades to slower rather than broken — a mismatch between
        // what's pushed to Vercel and what's pasted into the editor is easy
        // to hit, and shouldn't take the whole workspace down.
        console.warn("[wos] listMany unavailable, falling back to per-collection reads", error);
        return Promise.all(missing.map(function (name) {
          return rpc(name, "list");
        })).then(function (results) {
          return zip(missing, results);
        });
      })
      .then(function (fetched) {
        missing.forEach(function (name) {
          cache[name] = (fetched && fetched[name]) || [];
          sessionWrite(name, cache[name]);
        });
        return zip(
          names,
          names.map(function (name) {
            return cache[name];
          }),
        );
      });
  }

  function zip(names, values) {
    var out = {};
    names.forEach(function (name, index) {
      out[name] = values[index];
    });
    return out;
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
    if (viaClickUp(collection)) {
      return WOS.clickup.create(data).then(function (saved) {
        if (cache[collection]) cache[collection].push(saved);
        emit(collection);
        return saved;
      });
    }

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
      sessionSync(collection);
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

      if (viaClickUp(collection)) {
        emit(collection);
        return WOS.clickup
          .update(id, patch)
          .then(function (saved) {
            if (saved) rows[index] = saved;
            emit(collection);
            return saved || merged;
          })
          .catch(function (error) {
            // Put the row back the way ClickUp still has it, or the screen keeps
            // showing a change the office never received.
            rows[index] = Object.assign({}, rows[index], { id: id });
            delete cache[collection];
            emit(collection);
            throw error;
          });
      }

      if (!useApi()) {
        localWrite(collection, rows);
        emit(collection);
        return merged;
      }

      sessionSync(collection);
      emit(collection);
      return rpc(collection, "update", { id: id, data: patch }).then(function (saved) {
        if (saved) rows[index] = saved;
        sessionSync(collection);
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
      var removed = rows[index];
      rows.splice(index, 1);

      if (viaClickUp(collection)) {
        emit(collection);
        return WOS.clickup
          .remove(id)
          .then(function () {
            return true;
          })
          .catch(function (error) {
            // A delete that failed upstream must not look like it worked —
            // this is the one action nobody double-checks.
            rows.splice(index, 0, removed);
            emit(collection);
            throw error;
          });
      }

      if (!useApi()) {
        localWrite(collection, rows);
        emit(collection);
        return true;
      }

      sessionSync(collection);
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
    dropSessionCache();
  }

  /** Forget every cached read, so the next one goes to the source. */
  function dropSessionCache() {
    WOS.COLLECTIONS.forEach(function (name) {
      try {
        sessionStorage.removeItem(sessionKey(name));
      } catch (err) {
        /* nothing to clear */
      }
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
          // Reads taken before this point cached an empty spreadsheet; drop
          // them so the seeded rows are what the next page load sees.
          dropSessionCache();
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

  /**
   * Badge counts for the sidebar and tab bar.
   *
   * `threads` dropped out with the bell that displayed it — this runs on every
   * page load, so a collection no badge reads is a request on every navigation
   * for a number nobody sees.
   */
  function navCounts() {
    var me = WOS.config.currentUserId;

    // Each side is allowed to fail on its own. The shell awaits this before it
    // renders, so a rejection here takes down the sidebar on every page — and
    // once tasks come from ClickUp, that would mean a ClickUp outage leaving
    // the whole app with no navigation. A badge is decoration; it must never
    // be able to do that.
    var tasks = list("tasks").catch(function (error) {
      console.warn("[wos] task count unavailable", error);
      return [];
    });
    var rest = loadAll(["approvals", "members"]).catch(function (error) {
      console.warn("[wos] approval count unavailable", error);
      return { approvals: [] };
    });

    return Promise.all([tasks, rest]).then(function (results) {
      return {
        tasks: results[0].filter(function (t) {
          return t.assigneeId === me && t.status !== "done";
        }).length,
        approvals: (results[1].approvals || []).filter(function (a) {
          return a.state === "pending" && a.approverId === me;
        }).length,
      };
    });
  }

  /**
   * Store an image and return a link to it.
   *
   * On the API backend the photo goes to Drive via Apps Script — a base64
   * image is far past a spreadsheet cell's ~50k-char limit, so the row can only
   * ever hold the link. In local mode there is no Drive, so the (already
   * downscaled) data URL is kept as-is: it renders fine and persists in
   * localStorage, which is all local mode ever promised.
   *
   * @param {string} dataUrl  a `data:image/...;base64,...` string
   * @returns {Promise<string>} a URL usable in an <img src>
   */
  function uploadPhoto(dataUrl, name) {
    if (!useApi()) return Promise.resolve(dataUrl);

    return rpc(null, "uploadPhoto", { dataUrl: dataUrl, name: name || "scrum" }).then(function (result) {
      if (!result || !result.url) throw new Error("Upload returned no link.");
      return result.url;
    });
  }

  WOS.db = {
    list: list,
    loadAll: loadAll,
    get: get,
    create: create,
    update: update,
    remove: remove,
    uploadPhoto: uploadPhoto,
    resetLocal: resetLocal,
    seedRemote: seedRemote,
    onChange: onChange,
    currentUser: currentUser,
    navCounts: navCounts,
  };
})(window.WOS);
