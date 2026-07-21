/**
 * Workspace OS — Google Sheets backend.
 *
 * Deploy this as an Apps Script Web App bound to the spreadsheet that holds the
 * data. It exposes a single JSON endpoint that the Next.js Sheets adapter
 * (src/lib/repo/sheets.ts) calls for every read and write.
 *
 * Setup
 * ─────
 * 1. Create a Google Sheet. Extensions → Apps Script, paste this file.
 * 2. Script Properties → add `SECRET` with a long random string.
 * 3. Deploy → New deployment → Web app.
 *      Execute as:  Me
 *      Who has access:  Anyone
 *    "Anyone" is required for the server-to-server call; the SECRET is what
 *    actually guards the endpoint, so treat it like a password.
 * 4. Copy the /exec URL into SHEETS_ENDPOINT and the secret into SHEETS_SECRET
 *    in the Next.js app, then set DATA_BACKEND=sheets.
 * 5. Run `setupSheets` once from the editor to create the tabs and headers.
 *
 * Storage model
 * ─────────────
 * One tab per collection. Row 1 holds column names matching the TypeScript
 * field names. Scalars are written as-is; arrays and objects are JSON-encoded
 * into a single cell and parsed back on read, so the shape the app sees always
 * matches src/lib/types.ts.
 */

/** Collections and their columns. Must stay in sync with src/lib/types.ts. */
var SCHEMA = {
  members: ['id', 'name', 'email', 'title', 'initials', 'avatarColor', 'photoUrl', 'role', 'timezone'],
  tasks: [
    'id', 'title', 'description', 'priority', 'status', 'dueAt', 'assigneeId',
    'projectId', 'tags', 'order', 'createdAt', 'updatedAt',
  ],
  projects: [
    'id', 'name', 'category', 'description', 'status', 'progress', 'ownerId',
    'memberIds', 'dueAt', 'icon', 'iconBg', 'iconColor', 'createdAt',
  ],
  milestones: ['id', 'projectId', 'name', 'ownerId', 'startAt', 'endAt', 'isMilestone', 'progress', 'status'],
  events: ['id', 'title', 'description', 'startAt', 'endAt', 'location', 'label', 'attendeeIds', 'meetingId'],
  notes: [
    'id', 'title', 'icon', 'kind', 'content', 'tags', 'projectId', 'authorId',
    'pinned', 'archived', 'createdAt', 'updatedAt',
  ],
  meetings: [
    'id', 'title', 'startAt', 'durationMin', 'participantIds', 'projectId', 'status',
    'tags', 'ownerId', 'summary', 'highlights', 'lowlights', 'decisions',
    'openQuestions', 'actionItems', 'transcript', 'keywords', 'language',
    'sentiment', 'aiConfidence',
  ],
  ideas: ['id', 'title', 'text', 'status', 'authorId', 'createdAt'],
  threads: [
    'id', 'fromId', 'fromName', 'subject', 'preview', 'body', 'kind', 'read',
    'receivedAt', 'attachments', 'approvalId',
  ],
  approvals: [
    'id', 'title', 'description', 'amount', 'currency', 'requesterId',
    'approverId', 'state', 'requestedAt', 'decidedAt',
  ],
  notifications: ['id', 'actorId', 'actorName', 'text', 'kind', 'read', 'createdAt', 'href'],
  workflows: ['id', 'name', 'trigger', 'enabled', 'state', 'executions', 'lastRunAt', 'icon', 'iconBg', 'iconColor'],
  workflowRuns: ['id', 'workflowId', 'workflowName', 'result', 'ranAt', 'message'],
  folders: ['id', 'name', 'icon', 'iconBg', 'iconColor'],
  files: ['id', 'folderId', 'title', 'noteId', 'icon', 'favorite', 'updatedAt', 'updatedById'],
  comments: ['id', 'targetType', 'targetId', 'authorId', 'text', 'createdAt'],
  prompts: ['id', 'title', 'category', 'body', 'createdAt'],
};

/** Fields holding arrays or objects; JSON-encoded in their cell. */
var JSON_FIELDS = {
  tags: true, memberIds: true, attendeeIds: true, participantIds: true,
  highlights: true, lowlights: true, decisions: true, openQuestions: true,
  actionItems: true, transcript: true, keywords: true, attachments: true,
};

/** Fields stored as booleans. */
var BOOL_FIELDS = { pinned: true, archived: true, read: true, enabled: true, favorite: true, isMilestone: true };

/** Fields stored as numbers. */
var NUMBER_FIELDS = { order: true, progress: true, durationMin: true, aiConfidence: true, executions: true, amount: true, size: true };

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    var expected = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!expected || body.secret !== expected) {
      return respond({ ok: false, error: 'unauthorized' });
    }

    var columns = SCHEMA[body.collection];
    if (!columns) return respond({ ok: false, error: 'unknown collection: ' + body.collection });

    // Serialise concurrent writes; two requests appending at once would
    // otherwise race on getLastRow and overwrite each other.
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var sheet = getSheet(body.collection, columns);
      var result = dispatch(body, sheet, columns);
      return respond({ ok: true, data: result });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function dispatch(body, sheet, columns) {
  switch (body.op) {
    case 'list':
      return listRows(sheet, columns, body.filter);
    case 'get':
      return getRow(sheet, columns, body.id);
    case 'create':
      return createRow(sheet, columns, body.data, body.collection);
    case 'update':
      return updateRow(sheet, columns, body.id, body.data);
    case 'remove':
      return removeRow(sheet, columns, body.id);
    default:
      throw new Error('unknown op: ' + body.op);
  }
}

function respond(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(
    ContentService.MimeType.JSON
  );
}

/** Fetch a tab, creating it with headers if this is the first write. */
function getSheet(name, columns) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(columns);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function readAll(sheet, columns) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];
  var values = sheet.getRange(2, 1, lastRow - 1, columns.length).getValues();

  var rows = [];
  for (var i = 0; i < values.length; i++) {
    // A blank id means the row was cleared; skip rather than emit a ghost.
    if (values[i][0] === '' || values[i][0] === null) continue;
    rows.push({ row: i + 2, data: decodeRow(values[i], columns) });
  }
  return rows;
}

function decodeRow(values, columns) {
  var out = {};
  for (var i = 0; i < columns.length; i++) {
    var key = columns[i];
    var raw = values[i];

    if (JSON_FIELDS[key]) {
      out[key] = raw === '' || raw === null ? [] : safeParse(raw, []);
    } else if (BOOL_FIELDS[key]) {
      out[key] = raw === true || raw === 'TRUE' || raw === 'true';
    } else if (NUMBER_FIELDS[key]) {
      out[key] = raw === '' || raw === null ? null : Number(raw);
    } else if (raw instanceof Date) {
      // Sheets coerces ISO strings into Dates; hand back ISO to the app.
      out[key] = raw.toISOString();
    } else {
      // Empty cells are null, not "" — the app's types use `| null`.
      out[key] = raw === '' ? null : raw;
    }
  }
  return out;
}

function encodeRow(data, columns) {
  var values = [];
  for (var i = 0; i < columns.length; i++) {
    var key = columns[i];
    var value = data[key];

    if (value === undefined || value === null) {
      values.push('');
    } else if (JSON_FIELDS[key] || typeof value === 'object') {
      values.push(JSON.stringify(value));
    } else if (typeof value === 'string') {
      // A leading "=" or "+" would be evaluated as a formula; prefix with a
      // single quote so user text is always stored literally.
      values.push(/^[=+\-@]/.test(value) ? "'" + value : value);
    } else {
      values.push(value);
    }
  }
  return values;
}

function safeParse(raw, fallback) {
  try {
    return JSON.parse(raw);
  } catch (err) {
    return fallback;
  }
}

function listRows(sheet, columns, filter) {
  var rows = readAll(sheet, columns).map(function (entry) {
    return entry.data;
  });
  if (!filter) return rows;

  var keys = Object.keys(filter);
  if (keys.length === 0) return rows;

  return rows.filter(function (row) {
    for (var i = 0; i < keys.length; i++) {
      if (row[keys[i]] !== filter[keys[i]]) return false;
    }
    return true;
  });
}

function findRow(sheet, columns, id) {
  var rows = readAll(sheet, columns);
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].data.id === id) return rows[i];
  }
  return null;
}

function getRow(sheet, columns, id) {
  var found = findRow(sheet, columns, id);
  return found ? found.data : null;
}

function createRow(sheet, columns, data, collection) {
  var record = {};
  for (var key in data) record[key] = data[key];
  record.id = data.id || newId(collection);

  sheet.appendRow(encodeRow(record, columns));
  return record;
}

function updateRow(sheet, columns, id, patch) {
  var found = findRow(sheet, columns, id);
  if (!found) return null;

  var merged = found.data;
  for (var key in patch) {
    if (key !== 'id') merged[key] = patch[key];
  }

  sheet.getRange(found.row, 1, 1, columns.length).setValues([encodeRow(merged, columns)]);
  return merged;
}

function removeRow(sheet, columns, id) {
  var found = findRow(sheet, columns, id);
  if (!found) return false;
  sheet.deleteRow(found.row);
  return true;
}

/** Short, sortable, collision-resistant id. */
function newId(collection) {
  var prefix = collection.slice(0, 2);
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/**
 * Create every tab with its header row. Safe to re-run: existing tabs are left
 * alone, so this won't clobber data when the schema gains a collection.
 */
function setupSheets() {
  for (var name in SCHEMA) {
    getSheet(name, SCHEMA[name]);
  }
  SpreadsheetApp.getActiveSpreadsheet().toast('Workspace OS tabs ready.');
}
