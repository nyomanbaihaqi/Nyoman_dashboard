/**
 * Vercel serverless function — the /api/clickup proxy.
 *
 * ClickUp is the office's system of record for tasks, so the app reads and
 * writes it directly rather than keeping a copy in the spreadsheet. One store,
 * one truth — the same reasoning as the Google Calendar integration.
 *
 * This exists for one reason: a ClickUp personal token grants full access to
 * the whole workspace, and the frontend is static files anyone can read. The
 * token lives only in CLICKUP_TOKEN on the server and never reaches a browser.
 * ClickUp also sends no CORS headers, so a direct call from the page would be
 * blocked regardless.
 *
 * Ops: meta | list | create | update | remove
 *
 * Set CLICKUP_TOKEN in the Vercel project's environment variables, then
 * redeploy — env vars do not apply to a deployment that is already running.
 */

var API = "https://api.clickup.com/api/v2";

function fail(res, status, error, extra) {
  res.status(status).json(Object.assign({ ok: false, error: error }, extra || {}));
}

/**
 * Call ClickUp and return parsed JSON.
 *
 * Reads as text first: ClickUp answers with an HTML error page for some
 * failures, and parsing that as JSON throws a SyntaxError that says nothing
 * about the actual problem.
 */
async function call(token, path, options) {
  options = options || {};

  var upstream = await fetch(API + path, {
    method: options.method || "GET",
    headers: {
      Authorization: token,
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  var raw = await upstream.text();
  var data = null;
  if (raw) {
    try {
      data = JSON.parse(raw);
    } catch (err) {
      return { ok: false, status: upstream.status, message: "ClickUp returned a non-JSON response: " + raw.slice(0, 200) };
    }
  }

  if (!upstream.ok) {
    // ClickUp's own message names the real cause — a bad list id, a revoked
    // token, a missing scope — so pass it through rather than a bare status.
    var message = (data && (data.err || data.error)) || "HTTP " + upstream.status;
    if (upstream.status === 401) {
      message = "ClickUp rejected the token. Check CLICKUP_TOKEN in Vercel, then redeploy. (" + message + ")";
    }
    return { ok: false, status: upstream.status, message: message };
  }

  return { ok: true, data: data };
}

/* ── Operations ────────────────────────────────────────────────── */

/**
 * The list's own statuses, and the workspace's people.
 *
 * Both are needed before anything can be written back: a ClickUp list defines
 * its own status names, so writing the literal string "done" fails on a list
 * whose closing status is called "Complete".
 */
async function meta(token, body, res) {
  var listId = String(body.listId || "");
  if (!/^\d+$/.test(listId)) return fail(res, 400, "A numeric ClickUp list id is required.");

  var list = await call(token, "/list/" + listId);
  if (!list.ok) return fail(res, 502, list.message);

  var teamId = list.data && list.data.space && list.data.space.id ? null : null;
  var members = [];

  // Members come from the team the list belongs to. Failing to read them is
  // not fatal — tasks still render, just without avatars.
  var teams = await call(token, "/team");
  if (teams.ok && teams.data && teams.data.teams) {
    teams.data.teams.forEach(function (team) {
      (team.members || []).forEach(function (entry) {
        var user = entry.user || entry;
        if (!user || !user.id) return;
        members.push({
          id: String(user.id),
          name: user.username || user.email || String(user.id),
          email: user.email || "",
          color: user.color || "",
          initials: user.initials || "",
        });
      });
    });
  }

  res.status(200).json({
    ok: true,
    list: { id: String(list.data.id), name: list.data.name || "" },
    statuses: (list.data.statuses || []).map(function (s) {
      return { status: s.status, type: s.type, color: s.color, orderindex: s.orderindex };
    }),
    members: members,
  });
}

async function listTasks(token, body, res) {
  var listId = String(body.listId || "");
  if (!/^\d+$/.test(listId)) return fail(res, 400, "A numeric ClickUp list id is required.");

  // include_closed, or finished work disappears and the board looks empty.
  // subtasks=true so a checklist item doesn't silently go missing.
  var tasks = [];
  var page = 0;

  while (page < 10) {
    var result = await call(
      token,
      "/list/" + listId + "/task?include_closed=true&subtasks=true&page=" + page
    );
    if (!result.ok) return fail(res, 502, result.message);

    var batch = (result.data && result.data.tasks) || [];
    tasks = tasks.concat(batch);

    // ClickUp pages at 100 and has no total count; a short page is the end.
    if (batch.length < 100) break;
    page++;
  }

  res.status(200).json({ ok: true, tasks: tasks });
}

async function createTask(token, body, res) {
  var listId = String(body.listId || "");
  if (!/^\d+$/.test(listId)) return fail(res, 400, "A numeric ClickUp list id is required.");
  if (!body.task || !body.task.name) return fail(res, 400, "A task name is required.");

  var result = await call(token, "/list/" + listId + "/task", { method: "POST", body: body.task });
  if (!result.ok) return fail(res, 502, result.message);

  res.status(200).json({ ok: true, task: result.data });
}

async function updateTask(token, body, res) {
  var id = String(body.taskId || "");
  if (!id) return fail(res, 400, "A task id is required.");

  var result = await call(token, "/task/" + encodeURIComponent(id), { method: "PUT", body: body.task || {} });
  if (!result.ok) return fail(res, 502, result.message);

  res.status(200).json({ ok: true, task: result.data });
}

async function removeTask(token, body, res) {
  var id = String(body.taskId || "");
  if (!id) return fail(res, 400, "A task id is required.");

  var result = await call(token, "/task/" + encodeURIComponent(id), { method: "DELETE" });
  if (!result.ok) return fail(res, 502, result.message);

  res.status(200).json({ ok: true });
}

/* ── Entry point ───────────────────────────────────────────────── */

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "method not allowed");

  var token = process.env.CLICKUP_TOKEN;
  if (!token) {
    return fail(
      res,
      500,
      "ClickUp isn't configured yet. Add CLICKUP_TOKEN to the Vercel project's environment variables, then redeploy — env vars don't apply to a deployment that's already running."
    );
  }

  var body = req.body || {};
  var op = String(body.op || "");

  try {
    if (op === "meta") return await meta(token, body, res);
    if (op === "list") return await listTasks(token, body, res);
    if (op === "create") return await createTask(token, body, res);
    if (op === "update") return await updateTask(token, body, res);
    if (op === "remove") return await removeTask(token, body, res);
    return fail(res, 400, "Unknown op: " + (op || "(none)"));
  } catch (err) {
    return fail(res, 502, "Couldn't reach ClickUp.", {
      detail: String(err && err.message ? err.message : err),
    });
  }
};
