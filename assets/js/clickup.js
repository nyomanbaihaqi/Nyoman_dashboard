/* ──────────────────────────────────────────────────────────────
   Workspace OS — ClickUp tasks

   ClickUp is where the office actually runs its task list, so it is
   the source of truth: this reads and writes it directly and mirrors
   nothing into the spreadsheet. There is only ever one task list.

   Everything here is translation. The two systems disagree about
   almost every field — statuses are per-list strings in ClickUp and a
   fixed set here, priority is 1-4 there and three words here, dates
   are epoch milliseconds as strings — and this file is where those
   disagreements are settled, so no page has to know.
   ────────────────────────────────────────────────────────────── */

(function (WOS) {
  "use strict";

  var ENDPOINT = "/api/clickup";

  /** Filled by meta(); needed before anything can be written back. */
  var statuses = null;
  var members = null;
  var metaPromise = null;

  function listId() {
    return String(WOS.config.clickupListId || "");
  }

  function call(body) {
    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(Object.assign({ listId: listId() }, body)),
    }).then(function (response) {
      return response.text().then(function (raw) {
        var payload;
        try {
          payload = JSON.parse(raw);
        } catch (err) {
          throw new Error(
            response.status === 404
              ? "/api/clickup isn't deployed. Upload api/clickup.js and redeploy."
              : "The server didn't return JSON (HTTP " + response.status + ")."
          );
        }
        if (!response.ok || !payload.ok) throw new Error(payload.error || "HTTP " + response.status);
        return payload;
      });
    });
  }

  /* ── Status mapping ────────────────────────────────────────── */

  /**
   * Sort a ClickUp status into one of the app's four.
   *
   * `type` is the reliable signal — ClickUp guarantees "done"/"closed" for
   * finished work whatever the list calls it. The name is only consulted to
   * separate in-progress from in-review, which ClickUp models as one type.
   */
  function bucketOf(status) {
    var type = String(status.type || "").toLowerCase();
    var name = String(status.status || "").toLowerCase();

    if (type === "done" || type === "closed") return "done";
    if (/review|qa|check/.test(name)) return "in_review";
    if (/progress|doing|active|ongoing|wip/.test(name)) return "in_progress";
    if (type === "open") return "todo";
    return "todo";
  }

  /** App status → the exact status string this list uses. */
  function clickupStatusFor(appStatus) {
    if (!statuses || !statuses.length) return null;

    var match = statuses.filter(function (s) {
      return bucketOf(s) === appStatus;
    })[0];

    // A list with no "in review" column still has to accept the write, so fall
    // back to the closest thing rather than sending a status that doesn't exist.
    if (!match && appStatus === "in_review") {
      match = statuses.filter(function (s) {
        return bucketOf(s) === "in_progress";
      })[0];
    }
    if (!match) match = statuses[0];
    return match ? match.status : null;
  }

  /* ── Field mapping ─────────────────────────────────────────── */

  /**
   * ClickUp: 1 urgent, 2 high, 3 normal, 4 low.
   *
   * The field is usually an object, but comes back as a bare number or string
   * on some responses. Reading only `.priority` off it makes every task in
   * those replies read as medium — wrong quietly, which is the bad kind.
   */
  function priorityIn(task) {
    var field = task.priority;
    var value =
      field && typeof field === "object" ? field.priority || field.id : field;
    var name = String(value == null ? "" : value).toLowerCase();
    if (name === "urgent" || name === "high" || name === "1" || name === "2") return "high";
    if (name === "low" || name === "4") return "low";
    return "medium";
  }

  function priorityOut(priority) {
    if (priority === "high") return 2;
    if (priority === "low") return 4;
    return 3;
  }

  /** ClickUp sends epoch milliseconds, as a string. */
  function dateIn(value) {
    if (value === null || value === undefined || value === "") return null;
    var ms = Number(value);
    if (!ms || isNaN(ms)) return null;
    return new Date(ms).toISOString();
  }

  function dateOut(value) {
    if (!value) return null;
    var ms = new Date(value).getTime();
    return isNaN(ms) ? null : ms;
  }

  /**
   * email → the app's member id, for people who exist in both systems.
   *
   * Without this a ClickUp task is assigned to "cu_48291" while the app thinks
   * you are "m_alex", so every personal view — My Tasks' "assigned to me", the
   * sidebar count, Today's Focus, the brief's top priorities — comes back
   * empty. The tasks are all on screen, which is exactly what makes it easy to
   * miss.
   */
  var aliasByEmail = {};

  function identify(appMembers) {
    (appMembers || []).forEach(function (member) {
      if (member && member.email) aliasByEmail[String(member.email).toLowerCase()] = member.id;
    });
  }

  /** ClickUp user id → the id the app uses for that person. */
  function memberId(user) {
    if (!user || !user.id) return null;
    var email = String(user.email || "").toLowerCase();
    return aliasByEmail[email] || "cu_" + user.id;
  }

  /** A ClickUp task in the shape every page here already reads. */
  function toTask(raw) {
    var assignee = (raw.assignees || [])[0];

    return {
      id: String(raw.id),
      title: raw.name || "",
      description: raw.description || raw.text_content || "",
      priority: priorityIn(raw),
      status: bucketOf(raw.status || {}),
      dueAt: dateIn(raw.due_date),
      assigneeId: memberId(assignee),
      projectId: null,
      tags: (raw.tags || []).map(function (tag) {
        return tag.name;
      }),
      order: Number(raw.orderindex) || 0,
      createdAt: dateIn(raw.date_created),
      updatedAt: dateIn(raw.date_updated),
      divisionId: "",
      ownerConfirmed: false,
      deadlineAgreed: false,
      blocker: "",
      escalated: false,
      sourceMeetingId: "",
      // Kept so the row can be opened where the team actually works on it.
      clickupUrl: raw.url || "",
      // The status as this list words it, for display without re-deriving.
      clickupStatus: (raw.status && raw.status.status) || "",
    };
  }

  /**
   * App fields → a ClickUp payload, only for the keys actually being changed.
   *
   * Sending every field on every update would overwrite work done in ClickUp
   * itself between our read and our write.
   */
  function toPayload(patch) {
    var body = {};

    if ("title" in patch) body.name = patch.title;
    if ("description" in patch) body.description = patch.description;
    if ("priority" in patch) body.priority = priorityOut(patch.priority);

    if ("status" in patch) {
      var status = clickupStatusFor(patch.status);
      if (status) body.status = status;
    }

    if ("dueAt" in patch) {
      body.due_date = dateOut(patch.dueAt);
      // Without this ClickUp files everything at midnight UTC, which reads as
      // the previous day in Jakarta.
      body.due_date_time = true;
    }

    if ("assigneeId" in patch) {
      var id = String(patch.assigneeId || "");
      var numeric = id.indexOf("cu_") === 0 ? Number(id.slice(3)) : null;
      // ClickUp replaces assignees with {add, rem}; clearing needs the old one
      // removed, which the caller can't know, so only assignment is supported.
      if (numeric) body.assignees = { add: [numeric] };
    }

    return body;
  }

  /* ── Public API ────────────────────────────────────────────── */

  /** Statuses and people, fetched once per page load. */
  function loadMeta() {
    if (metaPromise) return metaPromise;

    metaPromise = call({ op: "meta" }).then(function (payload) {
      statuses = payload.statuses || [];
      members = (payload.members || []).map(function (user) {
        return {
          id: "cu_" + user.id,
          name: user.name,
          email: user.email,
          title: "",
          initials: user.initials || String(user.name || "?").charAt(0).toUpperCase(),
          avatarColor: user.color || "var(--slate-400)",
          photoUrl: "",
          role: "member",
          divisionId: "",
          timezone: "",
        };
      });
      return payload;
    });

    return metaPromise;
  }

  /** Every task on the configured list. */
  function list() {
    return loadMeta()
      .then(function () {
        return call({ op: "list" });
      })
      .then(function (payload) {
        return (payload.tasks || []).map(toTask);
      });
  }

  function create(data) {
    return loadMeta()
      .then(function () {
        var body = toPayload(data);
        body.name = data.title || "Untitled";
        return call({ op: "create", task: body });
      })
      .then(function (payload) {
        return toTask(payload.task);
      });
  }

  function update(id, patch) {
    return loadMeta()
      .then(function () {
        return call({ op: "update", taskId: id, task: toPayload(patch) });
      })
      .then(function (payload) {
        return toTask(payload.task);
      });
  }

  function remove(id) {
    return call({ op: "remove", taskId: id });
  }

  /** Workspace people, in the app's member shape. Empty until loadMeta runs. */
  function people() {
    return members || [];
  }

  /**
   * True when tasks should come from ClickUp rather than the spreadsheet.
   *
   * Requires the api backend: ClickUp is only reachable through /api/clickup,
   * which exists on Vercel and not in local mode. Without this check, opening
   * the app locally would route tasks to a proxy that isn't there and every
   * task view would fail — so local mode falls back to the seeded task list.
   */
  function isActive() {
    return WOS.config.backend === "api" && WOS.config.taskSource === "clickup" && !!listId();
  }

  WOS.clickup = {
    isActive: isActive,
    identify: identify,
    loadMeta: loadMeta,
    list: list,
    create: create,
    update: update,
    remove: remove,
    people: people,
    toTask: toTask,
    toPayload: toPayload,
    bucketOf: bucketOf,
  };
})(window.WOS);
