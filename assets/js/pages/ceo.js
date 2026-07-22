/* ──────────────────────────────────────────────────────────────
   CEO Assistant — the two things the PA carries into the CEO's day.

   Approvals: what needs a yes or no today, decided in the room.
   Changes:   the one improvement Antarestar is trying today, and
              what actually came of it.

   Approvals read and write the existing `approvals` collection
   rather than a private copy — the Decisions page is the same data
   seen from the other end (who asked, what's outstanding), and two
   stores would drift the moment one screen was used more than the
   other.
   ────────────────────────────────────────────────────────────── */

(function (WOS) {
  "use strict";

  var esc = WOS.esc;
  var icon = WOS.icon;
  var ui = WOS.ui;
  var fmt = WOS.fmt;
  var t = function () {
    return WOS.i18n.t.apply(null, arguments);
  };

  var page;
  var data;
  var state = { tab: "approvals", day: startOfDay(new Date()) };

  /* ── Dates ─────────────────────────────────────────────────── */

  function startOfDay(value) {
    var d = new Date(value);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function sameDay(a, b) {
    return startOfDay(a).getTime() === startOfDay(b).getTime();
  }

  /** yyyy-mm-dd in local time, for <input type="date">. */
  function dateValue(date) {
    var d = startOfDay(date);
    return (
      d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0")
    );
  }

  function shiftDay(days) {
    var next = new Date(state.day);
    next.setDate(next.getDate() + days);
    state.day = startOfDay(next);
  }

  function dayLabel(date) {
    if (sameDay(date, new Date())) return t("action.today");
    return fmt.fullDate(date);
  }

  /* ── Approvals ─────────────────────────────────────────────── */

  /** The day an approval belongs on: raiseOn if set, else when it was asked. */
  function raiseDate(approval) {
    return startOfDay(approval.raiseOn || approval.requestedAt);
  }

  /**
   * What to put in front of the CEO on `state.day`.
   *
   * `carried` is the part that matters: anything still undecided from an
   * earlier day. Showing only items dated today would quietly drop a request
   * that wasn't reached yesterday, and a decision nobody is asked for twice is
   * a decision that never happens.
   */
  function bucketForDay() {
    var today = [];
    var carried = [];

    (data.approvals || []).forEach(function (approval) {
      var when = raiseDate(approval);

      // Anything settled on this day belongs to this day, whichever day it was
      // raised on. Without this, approving a carried-over item makes it vanish
      // — and it drops out of the day's copied list, which is the report of
      // what was actually decided.
      if (approval.decidedAt && sameDay(approval.decidedAt, state.day)) {
        today.push(approval);
        return;
      }

      if (sameDay(when, state.day)) {
        today.push(approval);
      } else if (approval.state === "pending" && when < state.day) {
        carried.push(approval);
      }
    });

    var byTime = function (a, b) {
      return new Date(a.requestedAt) - new Date(b.requestedAt);
    };
    return { today: today.sort(byTime), carried: carried.sort(byTime) };
  }

  function decisionBadge(approval) {
    if (approval.state === "approved") return ui.badge(t("ceo.approved"), "success");
    if (approval.state === "declined") return ui.badge(t("ceo.declined"), "danger");
    return ui.badge(t("ceo.undecided"), "neutral");
  }

  function approvalRow(approval, isCarried) {
    var requester = data.memberById.get(approval.requesterId);
    var division = data.divisionById ? data.divisionById.get(approval.divisionId) : null;
    var decided = approval.state !== "pending";
    var options = approval.options || [];

    return (
      '<div class="card" style="margin-top:10px' +
      (isCarried ? ";border-left:3px solid var(--amber-600)" : "") + '">' +
      '<div class="spread" style="align-items:flex-start;gap:12px">' +
      '<div style="flex:1;min-width:0">' +
      (isCarried
        ? '<p class="text-label" style="color:var(--amber-600);font-weight:700">' +
          esc(t("ceo.carriedFrom", { date: fmt.dayMonth(raiseDate(approval)) })) + "</p>"
        : "") +
      '<p style="font-size:14.5px;font-weight:700;color:var(--text-strong)">' +
      esc(WOS.nameOr(approval.title, t("common.untitled"))) + "</p>" +
      (approval.description
        ? '<p class="text-sm muted" style="margin-top:5px;line-height:1.55">' + esc(approval.description) + "</p>"
        : "") +
      '<p class="text-label faint" style="margin-top:7px">' +
      esc(requester ? requester.name : t("ceo.noRequester")) +
      (division ? " · " + esc(division.name) : "") +
      (approval.amount ? " · " + esc(fmt.currency(approval.amount, approval.currency)) : "") +
      "</p>" +
      // The background someone wrote down so the CEO doesn't have to ask for
      // it. Without this the row is a title and a yes/no button, which is how
      // decisions get made on less than the requester actually provided.
      (approval.context
        ? '<div style="margin-top:10px;padding:10px 12px;background:var(--slate-50);border-radius:9px">' +
          '<p class="eyebrow">' + esc(t("decisions.context")) + "</p>" +
          '<p class="text-sm" style="margin-top:3px;color:var(--text-body);line-height:1.55">' +
          esc(approval.context) + "</p></div>"
        : "") +
      // Picking an option IS the decision, so the chosen wording is stored as
      // the note — "what did we settle on", not just "yes".
      (options.length
        ? '<div style="margin-top:10px"><p class="eyebrow">' + esc(t("decisions.options")) + "</p>" +
          '<div class="stack stack--sm" style="margin-top:6px">' +
          options
            .map(function (opt, i) {
              return decided
                ? '<div class="text-sm" style="color:var(--text-body);padding:4px 0">• ' + esc(opt) + "</div>"
                : '<button type="button" class="btn-dashed" style="justify-content:flex-start;text-align:left" ' +
                  'data-pick-option="' + esc(approval.id) + '" data-option-index="' + i + '">' +
                  icon("check", 13) + esc(opt) + "</button>";
            })
            .join("") +
          "</div></div>"
        : "") +
      (decided && approval.decisionNote
        ? '<p class="text-label" style="margin-top:7px;color:var(--text-body)">' +
          esc(t("ceo.note")) + ": " + esc(approval.decisionNote) + "</p>"
        : "") +
      "</div>" +
      '<div style="flex:none;text-align:right">' + decisionBadge(approval) +
      (decided
        ? '<div style="margin-top:8px"><button type="button" class="btn btn--ghost btn--sm" data-ceo-reopen="' +
          esc(approval.id) + '">' + esc(t("ceo.reopen")) + "</button></div>"
        : '<div class="cluster" style="margin-top:8px;justify-content:flex-end">' +
          '<button type="button" class="btn btn--outline btn--sm" data-ceo-decide="declined" data-id="' +
          esc(approval.id) + '">' + esc(t("ceo.no")) + "</button>" +
          '<button type="button" class="btn btn--primary btn--sm" data-ceo-decide="approved" data-id="' +
          esc(approval.id) + '">' + esc(t("ceo.yes")) + "</button></div>") +
      "</div></div></div>"
    );
  }

  function approvalsTab() {
    var bucket = bucketForDay();
    var all = bucket.carried.concat(bucket.today);
    var open = all.filter(function (a) {
      return a.state === "pending";
    }).length;

    var html =
      '<div class="spread" style="flex-wrap:wrap;gap:10px">' +
      '<div class="cluster">' +
      '<button type="button" class="btn btn--outline btn--sm" data-ceo-day="-1" aria-label="' + esc(t("ceo.prevDay")) + '">' +
      icon("chevron-left", 14) + "</button>" +
      '<span style="font-size:15px;font-weight:700;color:var(--text-strong);min-width:150px;text-align:center">' +
      esc(dayLabel(state.day)) + "</span>" +
      '<button type="button" class="btn btn--outline btn--sm" data-ceo-day="1" aria-label="' + esc(t("ceo.nextDay")) + '">' +
      icon("chevron-right", 14) + "</button>" +
      (sameDay(state.day, new Date())
        ? ""
        : '<button type="button" class="btn btn--ghost btn--sm" data-ceo-today>' + esc(t("action.today")) + "</button>") +
      "</div>" +
      '<div class="cluster">' +
      '<button type="button" class="btn btn--outline btn--sm" data-ceo-copy>' +
      icon("message-square", 13) + esc(t("ceo.copyList")) + "</button>" +
      '<button type="button" class="btn btn--primary btn--sm" data-ceo-new>' +
      icon("plus", 14, { color: "#fff" }) + esc(t("ceo.addApproval")) + "</button>" +
      "</div></div>" +
      '<p class="text-label muted" style="margin-top:8px">' +
      esc(open ? t("ceo.openCount", { n: open }) : t("ceo.allDecided")) + "</p>";

    if (!all.length) {
      return html + '<div class="card" style="margin-top:16px">' +
        ui.empty(t("ceo.noApprovals"), t("ceo.noApprovalsHint"), null, "shield-user") + "</div>";
    }

    if (bucket.carried.length) {
      html += '<p class="eyebrow" style="margin-top:18px;color:var(--amber-600)">' +
        esc(t("ceo.stillOpen")) + "</p>" +
        bucket.carried.map(function (a) {
          return approvalRow(a, true);
        }).join("");
    }

    if (bucket.today.length) {
      html += '<p class="eyebrow" style="margin-top:18px">' + esc(t("ceo.forThisDay")) + "</p>" +
        bucket.today.map(function (a) {
          return approvalRow(a, false);
        }).join("");
    }

    return html;
  }

  /** The day's list as WhatsApp text, since that's how it gets reported. */
  function approvalsText() {
    var bucket = bucketForDay();
    var all = bucket.carried.concat(bucket.today);
    var lines = ["*APPROVAL CEO — " + fmt.fullDate(state.day) + "*", ""];

    if (!all.length) {
      lines.push("-");
      return lines.join("\n");
    }

    all.forEach(function (approval, index) {
      var mark = approval.state === "approved" ? "✅" : approval.state === "declined" ? "❌" : "⬜";
      lines.push(mark + " " + (index + 1) + ". " + approval.title);
      if (approval.amount) lines.push("   " + fmt.currency(approval.amount, approval.currency));
      if (approval.decisionNote) lines.push("   " + t("ceo.note") + ": " + approval.decisionNote);
    });

    return lines.join("\n");
  }

  function openApprovalModal() {
    ui.modal({
      title: t("ceo.addApproval"),
      body:
        '<form class="stack">' +
        '<div class="field"><label class="field__label">' + esc(t("ceo.date")) + "</label>" +
        '<input class="input" type="date" name="raiseOn" value="' + dateValue(state.day) + '" required></div>' +
        '<div class="field"><label class="field__label">' + esc(t("ceo.subject")) + "</label>" +
        '<input class="input" name="title" required autofocus></div>' +
        '<div class="field"><label class="field__label">' + esc(t("ceo.detail")) + "</label>" +
        '<textarea class="textarea" name="description" rows="3"></textarea></div>' +
        '<div class="field"><label class="field__label">' + esc(t("ceo.amount")) + "</label>" +
        '<input class="input" name="amount" type="number" step="any" min="0" placeholder="' + esc(t("ceo.amountHint")) + '"></div>' +
        '<div class="modal__actions">' +
        '<button type="button" class="btn btn--ghost" data-close-modal>' + esc(t("action.cancel")) + "</button>" +
        '<button type="submit" class="btn btn--primary">' + esc(t("action.save")) + "</button></div></form>",
      onSubmit: function (form) {
        var formData = new FormData(form);
        var title = String(formData.get("title") || "").trim();
        if (!title) return;

        var raiseOn = String(formData.get("raiseOn") || "");
        var amount = String(formData.get("amount") || "").trim();

        WOS.db
          .create("approvals", {
            title: title,
            kind: "decision",
            description: formData.get("description") || "",
            context: "",
            options: [],
            // An empty number input is "", which would store as 0 and render
            // as a real amount of nothing. Keep it null.
            amount: amount === "" ? null : Number(amount),
            currency: amount === "" ? "" : WOS.config.currency,
            requesterId: WOS.config.currentUserId,
            approverId: "",
            divisionId: "",
            state: "pending",
            requestedAt: new Date().toISOString(),
            // Midday, so a timezone shift can't move it onto the day before.
            raiseOn: raiseOn ? new Date(raiseOn + "T12:00:00").toISOString() : new Date().toISOString(),
            decidedAt: null,
            decisionNote: "",
          })
          .then(function () {
            ui.closeModal();
            if (raiseOn) state.day = startOfDay(new Date(raiseOn + "T12:00:00"));
            return refresh();
          });
      },
    });
  }

  /**
   * Record the CEO's answer, with an optional note.
   *
   * The note is optional and the buttons say the verdict, so this can be
   * confirmed in one tap while still in the room — a required field here would
   * mean typing during the conversation, which is when the note gets skipped.
   */
  function decide(id, verdict) {
    var approval = (data.approvals || []).filter(function (row) {
      return row.id === id;
    })[0];
    if (!approval) return;

    ui.modal({
      title: verdict === "approved" ? t("ceo.yes") : t("ceo.no"),
      body:
        '<form class="stack">' +
        '<p class="text-sm" style="color:var(--text-body);line-height:1.55">' +
        esc(WOS.nameOr(approval.title, t("common.untitled"))) + "</p>" +
        '<div class="field"><label class="field__label">' + esc(t("ceo.noteOptional")) + "</label>" +
        '<textarea class="textarea" name="note" rows="3" autofocus></textarea></div>' +
        '<div class="modal__actions">' +
        '<button type="button" class="btn btn--ghost" data-close-modal>' + esc(t("action.cancel")) + "</button>" +
        '<button type="submit" class="btn btn--' + (verdict === "approved" ? "primary" : "danger") + '">' +
        esc(verdict === "approved" ? t("ceo.approved") : t("ceo.declined")) + "</button></div></form>",
      onSubmit: function (form) {
        WOS.db
          .update("approvals", id, {
            state: verdict,
            decidedAt: new Date().toISOString(),
            decisionNote: String(new FormData(form).get("note") || "").trim(),
          })
          .then(function () {
            ui.closeModal();
            return refresh();
          })
          .catch(function (error) {
            console.error("[wos] recording the decision failed", error);
            ui.toast(t("ceo.decideFailed"), "error");
          });
      },
    });
  }

  /* ── Changes ───────────────────────────────────────────────── */

  var CHANGE_STATUS = ["planned", "running", "done", "dropped"];

  var STATUS_TONE = {
    planned: "neutral",
    running: "info",
    done: "success",
    dropped: "danger",
  };

  var IMPACT_TONE = { positive: "success", neutral: "neutral", negative: "danger" };

  function changeProgress(change) {
    var tasks = change.tasks || [];
    if (!tasks.length) return 0;
    var done = tasks.filter(function (task) {
      return task.done;
    }).length;
    return Math.round((done / tasks.length) * 100);
  }

  function changeCard(change) {
    var tasks = change.tasks || [];
    var pct = changeProgress(change);
    var owner = data.memberById.get(change.ownerId);
    var allDone = tasks.length > 0 && pct === 100;
    var needsReport = allDone && !change.result;

    return (
      '<div class="card" style="margin-top:12px">' +
      '<div class="spread" style="align-items:flex-start;gap:12px">' +
      '<div style="flex:1;min-width:0">' +
      '<p style="font-size:15px;font-weight:700;color:var(--text-strong)">' +
      esc(WOS.nameOr(change.title, t("common.untitled"))) + "</p>" +
      (change.description
        ? '<p class="text-sm muted" style="margin-top:5px;line-height:1.55">' + esc(change.description) + "</p>"
        : "") +
      "</div>" +
      '<div class="cluster" style="flex:none">' +
      ui.badge(t("ceo.status." + change.status), STATUS_TONE[change.status] || "neutral") +
      '<button type="button" class="btn btn--ghost btn--sm" data-change-edit="' + esc(change.id) + '">' +
      esc(t("action.edit")) + "</button></div></div>" +

      (tasks.length
        ? '<div style="margin-top:12px">' +
          '<div class="spread"><span class="text-label muted">' + esc(t("ceo.tasklist")) + "</span>" +
          '<span class="text-label fw-semibold strong">' + pct + "%</span></div>" +
          '<div style="margin-top:6px">' + ui.progress(pct) + "</div>" +
          tasks
            .map(function (task) {
              return (
                '<div class="cluster" style="padding:7px 0;align-items:flex-start">' +
                ui.checkbox(task.done, task.text, { "change-task": change.id, "task-id": task.id }) +
                '<span class="grow text-sm" style="color:var(--text-body)' +
                (task.done ? ";text-decoration:line-through;color:var(--slate-400)" : "") + '">' +
                esc(task.text) + "</span></div>"
              );
            })
            .join("") +
          "</div>"
        : '<p class="text-sm muted" style="margin-top:10px">' + esc(t("ceo.noTasks")) + "</p>") +

      '<div class="cluster" style="margin-top:8px">' +
      '<input class="input" data-new-task-for="' + esc(change.id) + '" placeholder="' +
      esc(t("ceo.addTask")) + '" style="flex:1">' +
      '<button type="button" class="btn btn--outline btn--sm" data-add-task="' + esc(change.id) + '">' +
      icon("plus", 13) + "</button></div>" +

      // The result is the whole point of the log, so an untold one is called
      // out rather than left as a blank space nobody notices.
      '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--border-subtle)">' +
      '<div class="spread"><span class="text-label muted">' + esc(t("ceo.result")) + "</span>" +
      (change.impact ? ui.badge(t("ceo.impact." + change.impact), IMPACT_TONE[change.impact]) : "") +
      "</div>" +
      (change.result
        ? '<p class="text-sm" style="margin-top:6px;line-height:1.6;color:var(--text-body)">' + esc(change.result) + "</p>" +
          (change.reportedAt
            ? '<p class="text-label faint" style="margin-top:5px">' + esc(fmt.fullDate(change.reportedAt)) + "</p>"
            : "")
        : '<p class="text-sm" style="margin-top:6px;color:' + (needsReport ? "var(--amber-600)" : "var(--slate-400)") + '">' +
          esc(needsReport ? t("ceo.resultDue") : t("ceo.resultPending")) + "</p>") +
      '<div style="margin-top:8px"><button type="button" class="btn btn--' +
      (needsReport ? "primary" : "outline") + ' btn--sm" data-change-report="' + esc(change.id) + '">' +
      esc(change.result ? t("ceo.editResult") : t("ceo.writeResult")) + "</button></div></div>" +

      '<p class="text-label faint" style="margin-top:10px">' +
      esc(fmt.fullDate(change.date)) + (owner ? " · " + esc(owner.name) : "") + "</p>" +
      "</div>"
    );
  }

  function changesTab() {
    var list = (data.changes || []).slice().sort(function (a, b) {
      return new Date(b.date) - new Date(a.date);
    });

    var html =
      '<div class="spread" style="flex-wrap:wrap;gap:10px">' +
      '<div><h2 class="page__title" style="font-size:19px">' + esc(t("ceo.changesTitle")) + "</h2>" +
      '<p class="text-sm muted" style="margin-top:3px;max-width:560px;line-height:1.55">' +
      esc(t("ceo.changesIntro")) + "</p></div>" +
      '<button type="button" class="btn btn--primary btn--sm" data-change-new>' +
      icon("plus", 14, { color: "#fff" }) + esc(t("ceo.addChange")) + "</button></div>";

    if (!list.length) {
      return html + '<div class="card" style="margin-top:16px">' +
        ui.empty(t("ceo.noChanges"), t("ceo.noChangesHint"), null, "sparkles") + "</div>";
    }

    var groups = WOS.groupBy(list, function (change) {
      return sameDay(change.date, new Date()) ? t("action.today") : fmt.fullDate(change.date);
    });

    Array.from(groups.keys()).forEach(function (label) {
      html += '<p class="eyebrow" style="margin-top:20px">' + esc(label) + "</p>" +
        groups.get(label).map(changeCard).join("");
    });

    return html;
  }

  function openChangeModal(change) {
    ui.modal({
      title: change ? t("ceo.editChange") : t("ceo.addChange"),
      body:
        '<form class="stack">' +
        '<div class="field"><label class="field__label">' + esc(t("ceo.changeTitle")) + "</label>" +
        '<input class="input" name="title" required value="' + esc(change ? change.title : "") + '"></div>' +
        '<div class="field"><label class="field__label">' + esc(t("ceo.why")) + "</label>" +
        '<textarea class="textarea" name="description" rows="3">' + esc(change ? change.description : "") + "</textarea></div>" +
        '<div class="field"><label class="field__label">' + esc(t("ceo.date")) + "</label>" +
        '<input class="input" type="date" name="date" required value="' +
        dateValue(change ? change.date : new Date()) + '"></div>' +
        '<div class="field"><label class="field__label">' + esc(t("tasks.col.status")) + "</label>" +
        '<select class="select" name="status">' +
        CHANGE_STATUS.map(function (id) {
          var selected = change && change.status === id ? " selected" : "";
          return '<option value="' + id + '"' + selected + ">" + esc(t("ceo.status." + id)) + "</option>";
        }).join("") + "</select></div>" +
        '<div class="modal__actions">' +
        (change
          ? '<button type="button" class="btn btn--danger" data-change-delete="' + esc(change.id) + '">' +
            esc(t("action.delete")) + "</button>"
          : "") +
        '<button type="button" class="btn btn--ghost" data-close-modal>' + esc(t("action.cancel")) + "</button>" +
        '<button type="submit" class="btn btn--primary">' + esc(t("action.save")) + "</button></div></form>",
      onSubmit: function (form) {
        var formData = new FormData(form);
        var title = String(formData.get("title") || "").trim();
        if (!title) return;

        var dateStr = String(formData.get("date") || "");
        var patch = {
          title: title,
          description: formData.get("description") || "",
          date: dateStr ? new Date(dateStr + "T12:00:00").toISOString() : new Date().toISOString(),
          status: formData.get("status") || "planned",
          updatedAt: new Date().toISOString(),
        };

        var saving = change
          ? WOS.db.update("changes", change.id, patch)
          : WOS.db.create("changes", Object.assign({
              ownerId: WOS.config.currentUserId,
              divisionId: "",
              tasks: [],
              result: "",
              impact: "",
              reportedAt: null,
              createdAt: new Date().toISOString(),
            }, patch));

        saving.then(function () {
          ui.closeModal();
          return refresh();
        });
      },
    });
  }

  function openResultModal(change) {
    var impacts = ["positive", "neutral", "negative"];
    ui.modal({
      title: t("ceo.writeResult"),
      body:
        '<form class="stack">' +
        '<p class="text-sm muted" style="line-height:1.55">' + esc(t("ceo.resultHint")) + "</p>" +
        '<div class="field"><label class="field__label">' + esc(t("ceo.result")) + "</label>" +
        '<textarea class="textarea" name="result" rows="5" required>' + esc(change.result || "") + "</textarea></div>" +
        '<div class="field"><label class="field__label">' + esc(t("ceo.impactLabel")) + "</label>" +
        '<select class="select" name="impact">' +
        impacts.map(function (id) {
          var selected = change.impact === id ? " selected" : "";
          return '<option value="' + id + '"' + selected + ">" + esc(t("ceo.impact." + id)) + "</option>";
        }).join("") + "</select></div>" +
        '<div class="modal__actions">' +
        '<button type="button" class="btn btn--ghost" data-close-modal>' + esc(t("action.cancel")) + "</button>" +
        '<button type="submit" class="btn btn--primary">' + esc(t("action.save")) + "</button></div></form>",
      onSubmit: function (form) {
        var formData = new FormData(form);
        var result = String(formData.get("result") || "").trim();
        if (!result) return;

        WOS.db
          .update("changes", change.id, {
            result: result,
            impact: formData.get("impact") || "neutral",
            reportedAt: new Date().toISOString(),
            // Writing the result is what closes a change out; leaving it
            // "running" afterwards is the state nobody goes back to fix.
            status: change.status === "dropped" ? "dropped" : "done",
            updatedAt: new Date().toISOString(),
          })
          .then(function () {
            ui.closeModal();
            return refresh();
          });
      },
    });
  }

  function changeById(id) {
    return (data.changes || []).filter(function (change) {
      return change.id === id;
    })[0];
  }

  /**
   * Update the tasklist optimistically, then persist.
   *
   * Waiting for the round-trip before repainting drops clicks: ticking four
   * steps in a row means each save re-renders and replaces the very node the
   * next click is aimed at. Painting first from local state keeps the list
   * responsive; a failed write reloads so the screen can't keep a tick the
   * spreadsheet rejected.
   */
  function saveTasks(change, tasks) {
    change.tasks = tasks;
    render();

    return WOS.db
      .update("changes", change.id, { tasks: tasks, updatedAt: new Date().toISOString() })
      .catch(function (error) {
        console.error("[wos] saving the tasklist failed", error);
        ui.toast(t("ceo.taskFailed"), "error");
        return refresh();
      });
  }

  /* ── Render ────────────────────────────────────────────────── */

  var TABS = ["approvals", "changes"];

  function render() {
    // Half-typed step text lives only in the DOM, and ticking a checkbox
    // repaints the whole page — so carry it across, or the sentence someone
    // was mid-way through typing disappears when they tick something.
    var typed = {};
    WOS.$$("[data-new-task-for]", page).forEach(function (input) {
      if (input.value) typed[input.dataset.newTaskFor] = input.value;
    });

    page.innerHTML =
      '<div class="chips">' +
      TABS.map(function (id) {
        return (
          '<button type="button" class="chip' + (state.tab === id ? " is-active" : "") +
          '" data-ceo-tab="' + id + '">' + esc(t("ceo.tab." + id)) + "</button>"
        );
      }).join("") +
      "</div>" +
      '<div data-ceo-body style="margin-top:18px"></div>';

    WOS.$("[data-ceo-body]", page).innerHTML =
      state.tab === "approvals" ? approvalsTab() : changesTab();

    Object.keys(typed).forEach(function (id) {
      var input = WOS.$('[data-new-task-for="' + id + '"]', page);
      if (input) input.value = typed[id];
    });
  }

  function bind() {
    WOS.on(page, "click", "[data-ceo-tab]", function (event, target) {
      state.tab = target.dataset.ceoTab;
      render();
    });

    WOS.on(page, "click", "[data-ceo-day]", function (event, target) {
      shiftDay(Number(target.dataset.ceoDay));
      render();
    });

    WOS.on(page, "click", "[data-ceo-today]", function () {
      state.day = startOfDay(new Date());
      render();
    });

    WOS.on(page, "click", "[data-ceo-new]", openApprovalModal);

    WOS.on(page, "click", "[data-ceo-copy]", function () {
      ui.copyText(approvalsText());
      ui.toast(t("ceo.listCopied"));
    });

    WOS.on(page, "click", "[data-ceo-decide]", function (event, target) {
      decide(target.dataset.id, target.dataset.ceoDecide);
    });

    // Choosing between named options settles it in one click, with the option
    // itself as the note — no modal, because the wording is already the answer.
    WOS.on(page, "click", "[data-pick-option]", function (event, target) {
      var id = target.dataset.pickOption;
      var approval = (data.approvals || []).filter(function (row) {
        return row.id === id;
      })[0];
      if (!approval) return;

      var chosen = (approval.options || [])[Number(target.dataset.optionIndex)];
      if (!chosen) return;

      WOS.db
        .update("approvals", id, {
          state: "approved",
          decidedAt: new Date().toISOString(),
          decisionNote: chosen,
        })
        .then(refresh)
        .catch(function (error) {
          console.error("[wos] recording the chosen option failed", error);
          ui.toast(t("ceo.decideFailed"), "error");
        });
    });

    WOS.on(page, "click", "[data-ceo-reopen]", function (event, target) {
      WOS.db
        .update("approvals", target.dataset.ceoReopen, {
          state: "pending",
          decidedAt: null,
          decisionNote: "",
        })
        .then(refresh);
    });

    WOS.on(page, "click", "[data-change-new]", function () {
      openChangeModal(null);
    });

    WOS.on(page, "click", "[data-change-edit]", function (event, target) {
      var change = changeById(target.dataset.changeEdit);
      if (change) openChangeModal(change);
    });

    WOS.on(page, "click", "[data-change-report]", function (event, target) {
      var change = changeById(target.dataset.changeReport);
      if (change) openResultModal(change);
    });

    WOS.on(page, "click", "[data-change-task]", function (event, target) {
      var change = changeById(target.dataset.changeTask);
      if (!change) return;
      var taskId = target.dataset.taskId;
      var tasks = (change.tasks || []).map(function (task) {
        return task.id === taskId ? Object.assign({}, task, { done: !task.done }) : task;
      });
      saveTasks(change, tasks);
    });

    WOS.on(page, "click", "[data-add-task]", function (event, target) {
      var change = changeById(target.dataset.addTask);
      if (!change) return;
      var input = WOS.$('[data-new-task-for="' + change.id + '"]', page);
      var text = input ? input.value.trim() : "";
      if (!text) return;
      saveTasks(change, (change.tasks || []).concat([{ id: WOS.newId("ct"), text: text, done: false }]));
    });

    // Enter in the task box adds it, rather than doing nothing.
    WOS.on(page, "keydown", "[data-new-task-for]", function (event, input) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      var change = changeById(input.dataset.newTaskFor);
      var text = input.value.trim();
      if (!change || !text) return;
      saveTasks(change, (change.tasks || []).concat([{ id: WOS.newId("ct"), text: text, done: false }]));
    });

    // The delete button lives inside the modal, which renders outside `page`.
    document.addEventListener("click", function (event) {
      var target = event.target.closest && event.target.closest("[data-change-delete]");
      if (!target) return;
      if (!window.confirm(t("ceo.deleteConfirm"))) return;
      WOS.db.remove("changes", target.dataset.changeDelete).then(function () {
        ui.closeModal();
        return refresh();
      });
    });
  }

  function refresh() {
    return WOS.db.loadAll(["approvals", "changes", "members", "divisions"]).then(function (loaded) {
      data.approvals = loaded.approvals;
      data.changes = loaded.changes;
      data.members = loaded.members;
      data.memberById = WOS.indexById(loaded.members);
      data.divisionById = WOS.indexById(loaded.divisions);
      render();
      return WOS.shell.refreshCounts();
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "ceo", title: t("ceo.title") })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(3, 120);
      return WOS.db.loadAll(["approvals", "changes", "members", "divisions"]);
    })
    .then(function (loaded) {
      data = loaded;
      data.memberById = WOS.indexById(loaded.members);
      data.divisionById = WOS.indexById(loaded.divisions);
      render();
      bind();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
