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
  members: ['id', 'name', 'email', 'title', 'initials', 'avatarColor', 'photoUrl', 'role', 'divisionId', 'timezone'],
  divisions: ['id', 'name', 'leadId', 'color'],
  tasks: [
    'id', 'title', 'description', 'priority', 'status', 'dueAt', 'assigneeId',
    'projectId', 'tags', 'order', 'createdAt', 'updatedAt',
    'divisionId', 'ownerConfirmed', 'deadlineAgreed', 'blocker', 'escalated', 'sourceMeetingId',
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
    'tags', 'ownerId', 'divisionId', 'objective', 'decisionsNeeded', 'preReads', 'sop',
    'summary', 'fact', 'assumption', 'proposal', 'decisions',
    'openQuestions', 'actionItems', 'transcript', 'keywords', 'language',
    'sentiment', 'aiConfidence',
  ],
  ideas: ['id', 'title', 'text', 'status', 'authorId', 'createdAt'],
  threads: [
    'id', 'fromId', 'fromName', 'subject', 'preview', 'body', 'kind', 'read',
    'receivedAt', 'attachments', 'approvalId',
  ],
  approvals: [
    'id', 'title', 'kind', 'description', 'context', 'options', 'amount', 'currency',
    'requesterId', 'approverId', 'divisionId', 'state', 'requestedAt', 'decidedAt', 'decisionNote',
    // Which day this is meant to be put in front of the CEO. Separate from
    // requestedAt, because "raised on Tuesday" and "asked for last Thursday"
    // are different facts and the CEO Assistant list is built on the first.
    'raiseOn',
  ],

  /**
   * One daily improvement Antarestar is trying. A tasklist, the day it runs,
   * and — the part that makes the log worth keeping — what actually came of it.
   */
  changes: [
    'id', 'title', 'description', 'date', 'ownerId', 'divisionId', 'status',
    'tasks', 'result', 'impact', 'reportedAt', 'createdAt', 'updatedAt',
  ],
  notifications: ['id', 'actorId', 'actorName', 'text', 'kind', 'read', 'createdAt', 'href'],
  folders: ['id', 'name', 'icon', 'iconBg', 'iconColor'],
  files: ['id', 'folderId', 'title', 'noteId', 'icon', 'favorite', 'updatedAt', 'updatedById'],
  comments: ['id', 'targetType', 'targetId', 'authorId', 'text', 'createdAt'],
  templates: ['id', 'name', 'kind', 'subject', 'body'],
};

/** Fields holding arrays or objects; JSON-encoded in their cell. */
var JSON_FIELDS = {
  tags: true, memberIds: true, attendeeIds: true, participantIds: true,
  decisions: true, openQuestions: true,
  actionItems: true, transcript: true, keywords: true, attachments: true,
  fact: true, assumption: true, proposal: true, decisionsNeeded: true,
  preReads: true, sop: true, options: true,
  tasks: true,
};

/**
 * JSON fields that hold an object rather than a list. They decode to {} when
 * the cell is blank; defaulting them to [] would make `sop.room` read from an
 * array, which is silently wrong rather than loudly wrong.
 */
var OBJECT_FIELDS = { sop: true };

/** Fields stored as booleans. */
var BOOL_FIELDS = {
  pinned: true, archived: true, read: true, enabled: true, favorite: true, isMilestone: true,
  ownerConfirmed: true, deadlineAgreed: true, escalated: true,
};

/** Fields stored as numbers. */
var NUMBER_FIELDS = { order: true, progress: true, durationMin: true, aiConfidence: true, executions: true, amount: true, size: true };

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    var expected = PropertiesService.getScriptProperties().getProperty('SECRET');
    if (!expected || body.secret !== expected) {
      return respond({ ok: false, error: 'unauthorized' });
    }

    // Reads several collections in one request. The script lock serialises
    // every call, so six "parallel" list requests from one page load actually
    // queue behind each other — a page needing six collections waited about
    // five seconds. Fetching them in a single call makes that one round trip.
    if (body.op === 'listMany') {
      var manyLock = LockService.getScriptLock();
      manyLock.waitLock(20000);
      try {
        return respond({ ok: true, data: listMany(body.collections) });
      } finally {
        manyLock.releaseLock();
      }
    }

    // Calendar ops talk to CalendarApp, not to a sheet, so they branch out
    // before the collection lookup. No script lock either: Google Calendar
    // handles its own concurrency, and holding the lock here would make
    // calendar reads queue behind unrelated spreadsheet writes.
    if (body.op.indexOf('calendar') === 0) {
      return respond({ ok: true, data: dispatchCalendar(body) });
    }

    var columns = SCHEMA[body.collection];
    if (!columns) return respond({ ok: false, error: 'unknown collection: ' + body.collection });

    // Serialise concurrent writes; two requests appending at once would
    // otherwise race on getLastRow and overwrite each other.
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var sheet = getSheet(body.collection, columns);
      var result = dispatch(body, sheet, headerOf(sheet, columns));
      return respond({ ok: true, data: result });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return respond({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/* ════════════════════════════════════════════════════════════════
   Google Calendar

   The web app is static and can't hold a Google credential, so the
   calendar is reached the same way the spreadsheet is: through this
   script, which already runs as the account that owns both. That
   avoids a second OAuth flow in the browser entirely — the SECRET
   guarding this endpoint is the only credential involved.

   Events are translated into the same shape the app already used for
   its own `events` collection, so the screens didn't have to learn a
   second format. Two app concepts have no native Google field and are
   stored as event tags: `label` (the colour vocabulary in the UI) and
   `meetingId` (the link from a calendar entry to its minutes).
   ════════════════════════════════════════════════════════════════ */

/** App label → Google colour. Both directions so a change made in
    Google Calendar still reads correctly here, and vice versa. */
var LABEL_TO_COLOR = {
  deep_work: CalendarApp.EventColor.MAUVE,
  meetings: CalendarApp.EventColor.BLUE,
  personal: CalendarApp.EventColor.GREEN,
  urgent: CalendarApp.EventColor.RED,
  travel: CalendarApp.EventColor.ORANGE,
};

function colorToLabel(color) {
  for (var label in LABEL_TO_COLOR) {
    if (String(LABEL_TO_COLOR[label]) === String(color)) return label;
  }
  return 'meetings';
}

function dispatchCalendar(body) {
  switch (body.op) {
    case 'calendarList':
      return calendarList();
    case 'calendarRange':
      return calendarRange(body.calendarIds, body.startAt, body.endAt);
    case 'calendarCreate':
      return calendarCreate(body.calendarId, body.data);
    case 'calendarUpdate':
      return calendarUpdate(body.calendarId, body.id, body.data);
    case 'calendarDelete':
      return calendarDelete(body.calendarId, body.id);
    default:
      throw new Error('unknown calendar op: ' + body.op);
  }
}

/** Every calendar this account can see, so the UI can offer a choice. */
function calendarList() {
  var all = CalendarApp.getAllCalendars();
  var defaultId = CalendarApp.getDefaultCalendar().getId();

  return all.map(function (cal) {
    return {
      id: cal.getId(),
      name: cal.getName(),
      color: cal.getColor(),
      isDefault: cal.getId() === defaultId,
      canEdit: cal.isOwnedByMe(),
      selected: cal.isSelected(),
    };
  });
}

function resolveCalendar(calendarId) {
  if (!calendarId) return CalendarApp.getDefaultCalendar();
  var cal = CalendarApp.getCalendarById(calendarId);
  if (!cal) throw new Error('calendar not found: ' + calendarId);
  return cal;
}

/**
 * Events between two instants across the given calendars.
 *
 * Recurring series are returned as their individual occurrences, which is
 * what a week view needs — the app renders instances, not rules.
 */
function calendarRange(calendarIds, startAt, endAt) {
  var start = new Date(startAt);
  var end = new Date(endAt);
  var ids = calendarIds && calendarIds.length ? calendarIds : [CalendarApp.getDefaultCalendar().getId()];

  var out = [];
  for (var i = 0; i < ids.length; i++) {
    var cal;
    try {
      cal = resolveCalendar(ids[i]);
    } catch (err) {
      continue; // a calendar that was unshared shouldn't blank the whole week
    }

    var events = cal.getEvents(start, end);
    for (var j = 0; j < events.length; j++) {
      out.push(mapEvent(events[j], cal));
    }
  }
  return out;
}

function mapEvent(event, cal) {
  var guests = event.getGuestList().map(function (guest) {
    return {
      email: guest.getEmail(),
      name: guest.getName() || guest.getEmail(),
      status: String(guest.getGuestStatus()), // INVITED / YES / NO / MAYBE / OWNER
    };
  });

  var allDay = event.isAllDayEvent();

  return {
    id: event.getId(),
    calendarId: cal.getId(),
    title: event.getTitle(),
    description: event.getDescription() || '',
    location: event.getLocation() || '',
    startAt: event.getStartTime().toISOString(),
    endAt: event.getEndTime().toISOString(),
    allDay: allDay,
    recurring: event.isRecurringEvent(),
    // Tags carry the two things Google has no field for.
    label: event.getTag('wosLabel') || colorToLabel(event.getColor()),
    meetingId: event.getTag('wosMeetingId') || null,
    guests: guests,
    organizer: safeCreator(event),
    canEdit: cal.isOwnedByMe(),
    // Attendee ids stay empty: guests are Google identities, and the app's
    // members are spreadsheet rows. The UI matches them up by email.
    attendeeIds: [],
  };
}

/** Some event types throw on getCreators(); an organiser is never worth failing over. */
function safeCreator(event) {
  try {
    var creators = event.getCreators();
    return creators && creators.length ? creators[0] : '';
  } catch (err) {
    return '';
  }
}

function calendarCreate(calendarId, data) {
  var cal = resolveCalendar(calendarId);
  var options = {
    description: data.description || '',
    location: data.location || '',
  };
  if (data.guests && data.guests.length) {
    options.guests = data.guests.join(',');
    options.sendInvites = data.sendInvites !== false;
  }

  var event = data.allDay
    ? cal.createAllDayEvent(data.title, new Date(data.startAt), options)
    : cal.createEvent(data.title, new Date(data.startAt), new Date(data.endAt), options);

  applyMeta(event, data);
  return mapEvent(event, cal);
}

function calendarUpdate(calendarId, id, data) {
  var cal = resolveCalendar(calendarId);
  var event = cal.getEventById(id);
  if (!event) throw new Error('event not found: ' + id);

  if (data.title !== undefined) event.setTitle(data.title);
  if (data.description !== undefined) event.setDescription(data.description);
  if (data.location !== undefined) event.setLocation(data.location);

  if (data.startAt && data.endAt) {
    if (data.allDay) event.setAllDayDate(new Date(data.startAt));
    else event.setTime(new Date(data.startAt), new Date(data.endAt));
  }

  // Guests are reconciled rather than replaced: removing and re-adding
  // everyone would fire a fresh invitation at people who never changed.
  if (data.guests) {
    var wanted = {};
    data.guests.forEach(function (email) {
      wanted[email.toLowerCase()] = true;
    });

    var existing = {};
    event.getGuestList().forEach(function (guest) {
      var email = guest.getEmail().toLowerCase();
      existing[email] = true;
      if (!wanted[email]) event.removeGuest(guest.getEmail());
    });

    data.guests.forEach(function (email) {
      if (!existing[email.toLowerCase()]) event.addGuest(email);
    });
  }

  applyMeta(event, data);
  return mapEvent(event, cal);
}

/** Label and meeting link, written to both the tag and Google's own colour. */
function applyMeta(event, data) {
  if (data.label) {
    event.setTag('wosLabel', data.label);
    var color = LABEL_TO_COLOR[data.label];
    if (color) event.setColor(color);
  }
  if (data.meetingId !== undefined) {
    event.setTag('wosMeetingId', data.meetingId || '');
  }
}

function calendarDelete(calendarId, id) {
  var cal = resolveCalendar(calendarId);
  var event = cal.getEventById(id);
  if (!event) return false;
  event.deleteEvent();
  return true;
}

function dispatch(body, sheet, columns) {
  switch (body.op) {
    case 'list':
      return listRows(sheet, columns, body.filter);
    case 'get':
      return getRow(sheet, columns, body.id);
    case 'create':
      return createRow(sheet, columns, body.data, body.collection);
    case 'createMany':
      return createRows(sheet, columns, body.rows, body.collection);
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

/**
 * The column names actually written in row 1, which is what every read and
 * write is keyed on.
 *
 * Deliberately not SCHEMA order: a spreadsheet created before a schema change
 * has its own order, and migrateSheets() appends new columns at the end rather
 * than rewriting existing ones. Mapping by position instead would shift every
 * value one place the moment a field is inserted in the middle of SCHEMA —
 * timezone would start being read as divisionId. Falls back to SCHEMA for a
 * tab that has no header yet.
 */
function headerOf(sheet, columns) {
  var width = Math.max(sheet.getLastColumn(), 1);
  var header = sheet.getRange(1, 1, 1, width).getValues()[0].filter(function (name) {
    return name !== '' && name !== null;
  });
  return header.length ? header : columns;
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
      var empty = OBJECT_FIELDS[key] ? {} : [];
      out[key] = raw === '' || raw === null ? empty : safeParse(raw, empty);
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

/**
 * Read several collections at once, keyed by name. Unknown names are skipped
 * rather than failing the batch — one stale collection name in a page's
 * request shouldn't blank out the other five.
 */
function listMany(names) {
  var out = {};
  if (!names) return out;

  for (var i = 0; i < names.length; i++) {
    var name = names[i];
    var columns = SCHEMA[name];
    if (!columns) continue;
    var sheet = getSheet(name, columns);
    out[name] = listRows(sheet, headerOf(sheet, columns), null);
  }
  return out;
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

/**
 * Append many rows in one call. Seeding a fresh spreadsheet means ~80 rows
 * across 17 collections; one appendRow per row would be ~80 round trips, each
 * taking the script lock. One setValues per collection is a couple of seconds
 * total instead of minutes.
 */
function createRows(sheet, columns, rows, collection) {
  if (!rows || !rows.length) return [];

  var records = [];
  var values = [];
  for (var i = 0; i < rows.length; i++) {
    var record = {};
    for (var key in rows[i]) record[key] = rows[i][key];
    record.id = rows[i].id || newId(collection);
    records.push(record);
    values.push(encodeRow(record, columns));
  }

  sheet.getRange(sheet.getLastRow() + 1, 1, values.length, columns.length).setValues(values);
  return records;
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

/**
 * Bring existing tabs up to the current SCHEMA by appending any columns they
 * are missing.
 *
 * setupSheets() only creates tabs that don't exist yet, so a spreadsheet
 * populated before a schema change keeps its old header row: the new fields
 * read back as undefined and get dropped on the next write, quietly. This adds
 * the missing headers in place and leaves every existing cell untouched.
 *
 * Run it from the editor after pasting a new Code.gs. Safe to re-run.
 */
function migrateSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var added = [];

  for (var name in SCHEMA) {
    var wanted = SCHEMA[name];
    var sheet = ss.getSheetByName(name);

    if (!sheet) {
      getSheet(name, wanted);
      added.push(name + ' (new tab)');
      continue;
    }

    var width = Math.max(sheet.getLastColumn(), 1);
    var header = sheet.getRange(1, 1, 1, width).getValues()[0];

    var missing = wanted.filter(function (column) {
      return header.indexOf(column) === -1;
    });
    if (!missing.length) continue;

    sheet.getRange(1, header.length + 1, 1, missing.length).setValues([missing]);
    added.push(name + ': +' + missing.join(', '));
  }

  var message = added.length ? added.join('\n') : 'Every tab already matches the schema.';
  ss.toast(added.length ? 'Migrated ' + added.length + ' tab(s). See the log.' : message);
  Logger.log(message);
}
