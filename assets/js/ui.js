/* ──────────────────────────────────────────────────────────────
   Workspace OS — shared render helpers

   Small functions returning HTML strings, plus toast and modal.
   Every interpolated value goes through WOS.esc: note titles, task
   names and comments are user-authored, and with the Sheets backend
   anyone on the team can put anything in a cell.
   ────────────────────────────────────────────────────────────── */

(function (WOS) {
  "use strict";

  var esc = WOS.esc;
  var t = function () {
    return WOS.i18n.t.apply(null, arguments);
  };

  /* ── Lookup tables shared by several screens ───────────────── */

  var PRIORITY_TONE = { high: "danger", medium: "warning", low: "success" };
  var STATUS_TONE = { todo: "neutral", in_progress: "info", in_review: "warning", done: "success" };
  var PROJECT_TONE = { on_track: "success", at_risk: "warning", on_hold: "neutral", completed: "info" };
  var MEETING_TONE = {
    scheduled: "info", recorded: "success", processing: "warning",
    processed: "info", no_recording: "neutral",
  };
  var IDEA_TONE = { draft: "neutral", validated: "success", archived: "neutral" };

  var PROJECT_COLOR = {
    on_track: "#10b981", at_risk: "#f43f5e", on_hold: "#f59e0b", completed: "#cbd5e1",
  };

  var PROGRESS_GRADIENT = {
    on_track: "linear-gradient(to right,#34d399,#059669)",
    at_risk: "linear-gradient(to right,#fbbf24,#d97706)",
    on_hold: "linear-gradient(to right,#cbd5e1,#94a3b8)",
    completed: "linear-gradient(to right,#93c5fd,#2563eb)",
  };

  var EVENT_COLOR = {
    deep_work: "#8b5cf6", meetings: "#0ea5e9", personal: "#10b981",
    urgent: "#f43f5e", travel: "#f59e0b",
  };

  var EVENT_TINT = {
    deep_work: "#f5f3ff", meetings: "#f0f9ff", personal: "#ecfdf5",
    urgent: "#fff1f2", travel: "#fffbeb",
  };

  var HIGHLIGHT_STYLE = {
    decision: { color: "#059669", stripe: "linear-gradient(to bottom,#34d399,#059669)", icon: "crown" },
    discussion: { color: "#0284c7", stripe: "linear-gradient(to bottom,#38bdf8,#0284c7)", icon: "message-square" },
    opportunity: { color: "#7c3aed", stripe: "linear-gradient(to bottom,#a78bfa,#7c3aed)", icon: "target" },
    risk: { color: "#e11d48", stripe: "linear-gradient(to bottom,#fb7185,#e11d48)", icon: "crosshair" },
  };

  var KANBAN_COLUMNS = [
    { status: "todo", dot: "var(--slate-400)" },
    { status: "in_progress", dot: "#0ea5e9" },
    { status: "in_review", dot: "#f59e0b" },
    { status: "done", dot: "#10b981" },
  ];

  /* ── Primitives ────────────────────────────────────────────── */

  function badge(label, tone) {
    return '<span class="badge badge--' + (tone || "neutral") + '">' + esc(label) + "</span>";
  }

  function priorityBadge(priority) {
    return badge(t("priority." + priority), PRIORITY_TONE[priority]);
  }

  function statusBadge(status) {
    return badge(t("status." + status), STATUS_TONE[status]);
  }

  function tag(label) {
    return '<span class="tag">' + esc(label) + "</span>";
  }

  function tags(list) {
    return (list || []).map(tag).join("");
  }

  /**
   * Coloured-initials avatar, or the member's photo when they have one.
   * `member` may be undefined — a task can reference someone since removed.
   */
  function avatar(member, size, ring) {
    size = size || 32;
    var cls = "avatar" + (ring ? " avatar--ring" : "");
    var style = "width:" + size + "px;height:" + size + "px;font-size:" + Math.max(9, Math.round(size * 0.4)) + "px";

    if (!member) {
      return (
        '<span class="' + cls + '" style="' + style + ';background:var(--slate-300)" title="—">?</span>'
      );
    }

    if (member.photoUrl) {
      return (
        '<img class="' + cls + '" style="' + style + '" src="' + esc(member.photoUrl) +
        '" alt="' + esc(member.name) + '">'
      );
    }

    return (
      '<span class="' + cls + '" style="' + style + ";background:" + esc(member.avatarColor) +
      '" title="' + esc(member.name) + '">' + esc(member.initials) + "</span>"
    );
  }

  /** Overlapping avatar row, with a "+N" chip past `max`. */
  function avatarStack(memberList, size, max) {
    size = size || 26;
    max = max || 4;
    var shown = (memberList || []).slice(0, max);
    var overflow = (memberList || []).length - shown.length;

    var html = '<span class="avatar-stack">';
    shown.forEach(function (member) {
      html += avatar(member, size, true);
    });
    if (overflow > 0) {
      html +=
        '<span class="avatar avatar--ring avatar-stack__more" style="width:' + size + "px;height:" +
        size + "px;font-size:" + Math.max(9, Math.round(size * 0.36)) + 'px">+' + overflow + "</span>";
    }
    return html + "</span>";
  }

  function iconTile(icon, bg, color, variant) {
    var cls = "icon-tile" + (variant ? " icon-tile--" + variant : "");
    var size = variant === "sm" ? 14 : variant === "lg" ? 19 : 17;
    return (
      '<span class="' + cls + '" style="background:' + esc(bg) + '">' +
      WOS.icon(icon, size, { color: color }) +
      "</span>"
    );
  }

  function progress(value, color) {
    var pct = Math.max(0, Math.min(100, Number(value) || 0));
    return (
      '<div class="progress" role="progressbar" aria-valuenow="' + pct +
      '" aria-valuemin="0" aria-valuemax="100">' +
      '<div class="progress__fill" style="width:' + pct + "%;background:" +
      esc(color || "var(--antar-purple)") + '"></div></div>'
    );
  }

  /** Completion checkbox with a 44px hit area around an 18px box. */
  function checkbox(checked, label, dataAttrs) {
    var attrs = "";
    Object.keys(dataAttrs || {}).forEach(function (key) {
      attrs += " data-" + key + '="' + esc(dataAttrs[key]) + '"';
    });
    return (
      '<button type="button" class="check" role="checkbox" aria-checked="' + (checked ? "true" : "false") +
      '" aria-label="' + esc(label) + '"' + attrs + ">" +
      '<span class="check__box">' + (checked ? WOS.icon("check", 12) : "") + "</span></button>"
    );
  }

  function toggle(on, label, dataAttrs) {
    var attrs = "";
    Object.keys(dataAttrs || {}).forEach(function (key) {
      attrs += " data-" + key + '="' + esc(dataAttrs[key]) + '"';
    });
    return (
      '<button type="button" class="toggle' + (on ? " is-on" : "") + '" role="switch" aria-checked="' +
      (on ? "true" : "false") + '" aria-label="' + esc(label) + '"' + attrs +
      '><span class="toggle__knob"></span></button>'
    );
  }

  function empty(title, text, actionHtml, icon) {
    return (
      '<div class="empty"><span class="empty__icon">' + WOS.icon(icon || "lightbulb", 34) + "</span>" +
      '<p class="empty__title">' + esc(title) + "</p>" +
      (text ? '<p class="empty__text">' + esc(text) + "</p>" : "") +
      (actionHtml ? '<div style="margin-top:20px">' + actionHtml + "</div>" : "") +
      "</div>"
    );
  }

  function emptyInline(title, icon) {
    return (
      '<div class="empty empty--inline"><span class="empty__icon">' + WOS.icon(icon || "layers", 24) +
      '</span><p class="empty__title">' + esc(title) + "</p></div>"
    );
  }

  /** Full-card placeholder shown while the first fetch is in flight. */
  function skeletonRows(count, height) {
    var html = '<div class="stack stack--sm">';
    for (var i = 0; i < (count || 3); i++) {
      html += '<div class="skeleton" style="height:' + (height || 56) + 'px"></div>';
    }
    return html + "</div>";
  }

  /* ── Toast ─────────────────────────────────────────────────── */

  function toastHost() {
    var host = document.querySelector(".toast-host");
    if (!host) {
      host = document.createElement("div");
      host.className = "toast-host";
      host.setAttribute("role", "status");
      host.setAttribute("aria-live", "polite");
      document.body.appendChild(host);
    }
    return host;
  }

  function toast(message, variant) {
    var node = document.createElement("div");
    node.className = "toast" + (variant === "error" ? " toast--error" : "");
    node.textContent = message;
    toastHost().appendChild(node);
    setTimeout(function () {
      node.remove();
    }, 2600);
  }

  /* ── Modal ─────────────────────────────────────────────────── */

  /**
   * Open a modal. `bodyHtml` is inserted as-is, so callers must escape any
   * interpolated content themselves.
   *
   * Returns the dialog element; call `WOS.ui.closeModal()` to dismiss.
   * `onSubmit` receives the form element when the modal contains a <form>.
   */
  function modal(options) {
    closeModal();

    var backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";

    backdrop.innerHTML =
      '<div class="modal" role="dialog" aria-modal="true" aria-label="' + esc(options.title) + '">' +
      '<h2 class="modal__title">' + esc(options.title) + "</h2>" +
      options.body +
      "</div>";

    backdrop.addEventListener("mousedown", function (event) {
      // Only dismiss on a click that starts on the backdrop itself, so a drag
      // that ends outside the dialog doesn't close it.
      if (event.target === backdrop) closeModal();
    });

    document.body.appendChild(backdrop);
    document.body.style.overflow = "hidden";

    function onKey(event) {
      if (event.key === "Escape") closeModal();
    }
    document.addEventListener("keydown", onKey);
    backdrop._onKey = onKey;

    var focusTarget = backdrop.querySelector("input,textarea,select,button");
    if (focusTarget) focusTarget.focus();

    var form = backdrop.querySelector("form");
    if (form && options.onSubmit) {
      form.addEventListener("submit", function (event) {
        event.preventDefault();
        options.onSubmit(form);
      });
    }

    WOS.$$("[data-close-modal]", backdrop).forEach(function (button) {
      button.addEventListener("click", closeModal);
    });

    return backdrop;
  }

  function closeModal() {
    var existing = document.querySelector(".modal-backdrop");
    if (!existing) return;
    if (existing._onKey) document.removeEventListener("keydown", existing._onKey);
    existing.remove();
    document.body.style.overflow = "";
  }

  /* ── Kanban board ──────────────────────────────────────────── */

  /**
   * A ticket code like "HA-41", derived from the project name's initials and
   * the numeric tail of the task id. Tasks with no project (or no digits in
   * their id) render no code, which is correct — only project-scoped work
   * items read as tickets in the design.
   */
  function taskCode(task, project) {
    if (!project) return "";
    var num = (String(task.id).match(/(\d+)$/) || [])[1];
    if (!num) return "";
    var initials = project.name
      .split(/\s+/)
      .map(function (word) {
        return word[0];
      })
      .join("")
      .toUpperCase()
      .slice(0, 3);
    return initials + "-" + num;
  }

  /**
   * Render a full drag-and-drop kanban board into `container` and wire its
   * events. Re-render on every data change by calling this again — it fully
   * replaces `container.innerHTML`, so there's no separate teardown step.
   *
   * @param {HTMLElement} container
   * @param {object} params
   *   tasks        — flat array, grouped internally by status
   *   memberById   — Map for the assignee avatar
   *   projectById  — Map, only needed to show ticket codes (omit for a
   *                  single-project board where codes would be redundant)
   *   onMove(taskId, status) — called on drop
   *   onCardClick(taskId)    — optional, called on card click
   *   onAddClick(status)     — optional; omit to hide the "+ Add card" row
   */
  function kanbanBoard(container, params) {
    var tasks = params.tasks || [];
    var memberById = params.memberById || new Map();
    var projectById = params.projectById || null;
    var grouped = WOS.groupBy(tasks, function (task) {
      return task.status;
    });

    var html = '<div class="kanban">';

    KANBAN_COLUMNS.forEach(function (col) {
      var list = (grouped.get(col.status) || []).slice().sort(WOS.by("order"));
      html +=
        '<div class="kanban__col">' +
        '<div class="kanban__col-head"><span class="kanban__dot" style="background:' + col.dot + '"></span>' +
        '<span class="kanban__col-title">' + esc(t("status." + col.status)) + "</span>" +
        '<span class="kanban__count">' + list.length + "</span></div>" +
        '<div class="kanban__cards" data-kanban-drop="' + col.status + '">' +
        list
          .map(function (task) {
            var project = projectById ? projectById.get(task.projectId) : null;
            var member = memberById.get(task.assigneeId);
            var code = taskCode(task, project);
            return (
              '<div class="kanban-card" draggable="true" data-kanban-card data-task-id="' + esc(task.id) + '">' +
              '<div class="kanban-card__top">' + priorityBadge(task.priority) +
              (code ? '<span class="kanban-card__id">' + esc(code) + "</span>" : "") + "</div>" +
              '<div class="kanban-card__title">' + esc(task.title) + "</div>" +
              '<div class="kanban-card__foot"><div class="cluster" style="gap:6px">' + tags(task.tags) + "</div>" +
              avatar(member, 22) + "</div></div>"
            );
          })
          .join("") +
        "</div>" +
        (params.onAddClick
          ? '<button type="button" class="btn-dashed" style="margin-top:12px" data-kanban-add="' + col.status + '">' +
            esc(t("action.addCard")) + "</button>"
          : "") +
        "</div>";
    });

    html += "</div>";
    container.innerHTML = html;

    WOS.$$("[data-kanban-card]", container).forEach(function (card) {
      card.addEventListener("dragstart", function (event) {
        card.classList.add("is-dragging");
        event.dataTransfer.setData("text/plain", card.dataset.taskId);
        event.dataTransfer.effectAllowed = "move";
      });
      card.addEventListener("dragend", function () {
        card.classList.remove("is-dragging");
      });
      if (params.onCardClick) {
        card.addEventListener("click", function () {
          params.onCardClick(card.dataset.taskId);
        });
      }
    });

    WOS.$$("[data-kanban-drop]", container).forEach(function (zone) {
      zone.addEventListener("dragover", function (event) {
        event.preventDefault();
        zone.classList.add("is-drop-target");
      });
      zone.addEventListener("dragleave", function () {
        zone.classList.remove("is-drop-target");
      });
      zone.addEventListener("drop", function (event) {
        event.preventDefault();
        zone.classList.remove("is-drop-target");
        var taskId = event.dataTransfer.getData("text/plain");
        if (taskId && params.onMove) params.onMove(taskId, zone.dataset.kanbanDrop);
      });
    });

    if (params.onAddClick) {
      WOS.$$("[data-kanban-add]", container).forEach(function (button) {
        button.addEventListener("click", function () {
          params.onAddClick(button.dataset.kanbanAdd);
        });
      });
    }
  }

  /* ── Task create/edit modal ───────────────────────────────── */

  /**
   * Shared by Tasks, Kanban, and Project Detail, so a task edited from any
   * of the three looks and behaves identically.
   *
   * @param {object} params
   *   task     — existing task to edit, or omit to create
   *   members  — full member list, for the assignee select
   *   projects — full project list, for the project select
   *   defaults — { status, projectId } to preset on a new task
   *   onSaved()  — called after create/update/delete resolves
   */
  function taskModal(params) {
    var task = params.task || null;
    var isEdit = !!task;
    var members = params.members || [];
    var projects = params.projects || [];
    var defaults = params.defaults || {};

    var body =
      '<form class="stack">' +
      '<div class="field"><label class="field__label">' + esc(t("tasks.newTitle")) + '</label>' +
      '<input class="input" name="title" required value="' + esc(task ? task.title : "") + '"></div>' +
      '<div class="field"><label class="field__label">' + esc(t("action.edit")) + '</label>' +
      '<textarea class="textarea" name="description" rows="3">' + esc(task ? task.description : "") + "</textarea></div>" +
      '<div class="grid grid--2">' +
      '<div class="field"><label class="field__label">' + esc(t("tasks.col.priority")) + '</label>' +
      '<select class="select" name="priority">' +
      ["high", "medium", "low"].map(function (p) {
        var selected = task ? task.priority === p : p === "medium";
        return '<option value="' + p + '"' + (selected ? " selected" : "") + ">" + esc(t("priority." + p)) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="field"><label class="field__label">' + esc(t("tasks.col.status")) + '</label>' +
      '<select class="select" name="status">' +
      ["todo", "in_progress", "in_review", "done"].map(function (s) {
        var selected = task ? task.status === s : (defaults.status || "todo") === s;
        return '<option value="' + s + '"' + (selected ? " selected" : "") + ">" + esc(t("status." + s)) + "</option>";
      }).join("") + "</select></div></div>" +
      '<div class="grid grid--2">' +
      '<div class="field"><label class="field__label">' + esc(t("tasks.col.due")) + '</label>' +
      '<input class="input" type="date" name="dueDate" value="' + esc(task ? WOS.fmt.dateInputValue(task.dueAt) : "") + '"></div>' +
      '<div class="field"><label class="field__label">' + esc(t("tasks.col.assignee")) + '</label>' +
      '<select class="select" name="assigneeId">' +
      members.map(function (m) {
        var selected = task ? task.assigneeId === m.id : m.id === WOS.config.currentUserId;
        return '<option value="' + esc(m.id) + '"' + (selected ? " selected" : "") + ">" + esc(m.name) + "</option>";
      }).join("") + "</select></div></div>" +
      '<div class="field"><label class="field__label">' + esc(t("projects.title")) + '</label>' +
      '<select class="select" name="projectId"' + (defaults.lockProject ? " disabled" : "") + '><option value="">—</option>' +
      projects.map(function (p) {
        var selected = task ? task.projectId === p.id : defaults.projectId === p.id;
        return '<option value="' + esc(p.id) + '"' + (selected ? " selected" : "") + ">" + esc(p.name) + "</option>";
      }).join("") + "</select></div>" +
      '<div class="field"><label class="field__label">' + esc(t("tasks.col.tags")) + '</label>' +
      '<input class="input" name="tags" placeholder="Dashboard, Ops" value="' + esc(task ? (task.tags || []).join(", ") : "") + '"></div>' +
      '<div class="modal__actions">' +
      (isEdit ? '<button type="button" class="btn btn--danger" data-delete-task style="margin-right:auto">' + esc(t("action.delete")) + "</button>" : "") +
      '<button type="button" class="btn btn--ghost" data-close-modal>' + esc(t("action.cancel")) + "</button>" +
      '<button type="submit" class="btn btn--primary">' + esc(t("action.save")) + "</button>" +
      "</div></form>";

    var dialog = modal({ title: isEdit ? t("action.edit") : t("tasks.newTask"), body: body, onSubmit: onSubmit });

    if (isEdit) {
      WOS.$("[data-delete-task]", dialog).addEventListener("click", function () {
        WOS.db.remove("tasks", task.id).then(function () {
          closeModal();
          toast(t("tasks.deleted"));
          if (params.onSaved) params.onSaved();
        });
      });
    }

    function onSubmit(form) {
      var formData = new FormData(form);
      var title = String(formData.get("title") || "").trim();
      if (!title) return;

      var patch = {
        title: title,
        description: formData.get("description") || "",
        priority: formData.get("priority"),
        status: formData.get("status"),
        dueAt: formData.get("dueDate") ? new Date(formData.get("dueDate") + "T09:00:00").toISOString() : null,
        assigneeId: formData.get("assigneeId"),
        projectId: defaults.lockProject ? defaults.projectId : formData.get("projectId") || null,
        tags: String(formData.get("tags") || "").split(",").map(function (s) { return s.trim(); }).filter(Boolean),
        updatedAt: new Date().toISOString(),
      };

      var promise = isEdit
        ? WOS.db.update("tasks", task.id, patch)
        : WOS.db.create("tasks", Object.assign({ createdAt: new Date().toISOString(), order: Date.now() }, patch));

      promise.then(function () {
        closeModal();
        if (params.onSaved) params.onSaved();
      });
    }
  }

  /* ── Minimal markdown renderer ─────────────────────────────── */

  /**
   * Render the subset of markdown the note content uses: headings,
   * paragraphs, checklists, tables, blockquotes, callouts, code fences and
   * rules.
   *
   * Everything is escaped before any markup is added, so note bodies can't
   * inject HTML. This is deliberately not a general markdown implementation.
   */
  function markdown(source) {
    var lines = String(source || "").split("\n");
    var html = "";
    var index = 0;

    function inline(text) {
      // Escape first, then re-introduce the few inline marks we support.
      return esc(text)
        .replace(/`([^`]+)`/g, "<code>$1</code>")
        .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>");
    }

    while (index < lines.length) {
      var line = lines[index];

      if (!line.trim()) {
        index++;
        continue;
      }

      // Fenced code block
      if (line.trim().indexOf("```") === 0) {
        var code = [];
        index++;
        while (index < lines.length && lines[index].trim().indexOf("```") !== 0) {
          code.push(lines[index]);
          index++;
        }
        index++;
        html += "<pre><code>" + esc(code.join("\n")) + "</code></pre>";
        continue;
      }

      // Callout — "> [!callout] text"
      if (/^>\s*\[!callout\]/i.test(line)) {
        html += '<div class="callout">💡 ' + inline(line.replace(/^>\s*\[!callout\]\s*/i, "")) + "</div>";
        index++;
        continue;
      }

      // Blockquote
      if (line.indexOf(">") === 0) {
        var quote = [];
        while (index < lines.length && lines[index].indexOf(">") === 0) {
          quote.push(lines[index].replace(/^>\s?/, ""));
          index++;
        }
        html += "<blockquote>" + inline(quote.join(" ")) + "</blockquote>";
        continue;
      }

      // Horizontal rule
      if (/^---+$/.test(line.trim())) {
        html += "<hr>";
        index++;
        continue;
      }

      // Headings
      var heading = line.match(/^(#{2,3})\s+(.*)$/);
      if (heading) {
        var level = heading[1].length;
        html += "<h" + level + ">" + inline(heading[2]) + "</h" + level + ">";
        index++;
        continue;
      }

      // Table — a header row followed by a separator row
      if (line.indexOf("|") === 0 && index + 1 < lines.length && /^\|[\s\-|:]+\|$/.test(lines[index + 1])) {
        var headers = splitRow(line);
        index += 2;
        var body = "";
        while (index < lines.length && lines[index].indexOf("|") === 0) {
          body +=
            "<tr>" +
            splitRow(lines[index])
              .map(function (cell) {
                return "<td>" + inline(cell) + "</td>";
              })
              .join("") +
            "</tr>";
          index++;
        }
        html +=
          "<table><thead><tr>" +
          headers
            .map(function (cell) {
              return "<th>" + inline(cell) + "</th>";
            })
            .join("") +
          "</tr></thead><tbody>" + body + "</tbody></table>";
        continue;
      }

      // Checklist / bullet list
      if (/^[-*]\s/.test(line)) {
        var items = "";
        while (index < lines.length && /^[-*]\s/.test(lines[index])) {
          var item = lines[index].replace(/^[-*]\s/, "");
          var check = item.match(/^\[([ xX])\]\s*(.*)$/);
          if (check) {
            var done = check[1].toLowerCase() === "x";
            items +=
              '<li class="cluster" style="padding:6px 0;align-items:flex-start">' +
              '<span class="check__box" style="margin-top:2px' +
              (done ? ";background:var(--emerald-500);border-color:var(--emerald-500)" : "") + '">' +
              (done ? WOS.icon("check", 12) : "") + "</span>" +
              '<span style="flex:1' + (done ? ";text-decoration:line-through;color:var(--slate-400)" : "") + '">' +
              inline(check[2]) + "</span></li>";
          } else {
            items += '<li style="padding:4px 0 4px 18px;position:relative">• ' + inline(item) + "</li>";
          }
          index++;
        }
        html += '<ul class="checklist">' + items + "</ul>";
        continue;
      }

      // Paragraph — consume until a blank line
      var para = [];
      while (index < lines.length && lines[index].trim() && !/^([-*>#|]|```)/.test(lines[index])) {
        para.push(lines[index]);
        index++;
      }
      if (para.length) html += "<p>" + inline(para.join(" ")) + "</p>";
      else index++;
    }

    return html;
  }

  function splitRow(line) {
    return line
      .replace(/^\||\|$/g, "")
      .split("|")
      .map(function (cell) {
        return cell.trim();
      });
  }

  WOS.ui = {
    badge: badge,
    priorityBadge: priorityBadge,
    statusBadge: statusBadge,
    tag: tag,
    tags: tags,
    avatar: avatar,
    avatarStack: avatarStack,
    iconTile: iconTile,
    progress: progress,
    checkbox: checkbox,
    toggle: toggle,
    empty: empty,
    emptyInline: emptyInline,
    skeletonRows: skeletonRows,
    toast: toast,
    modal: modal,
    closeModal: closeModal,
    markdown: markdown,
    kanbanBoard: kanbanBoard,
    taskCode: taskCode,
    taskModal: taskModal,

    PRIORITY_TONE: PRIORITY_TONE,
    STATUS_TONE: STATUS_TONE,
    PROJECT_TONE: PROJECT_TONE,
    MEETING_TONE: MEETING_TONE,
    IDEA_TONE: IDEA_TONE,
    PROJECT_COLOR: PROJECT_COLOR,
    PROGRESS_GRADIENT: PROGRESS_GRADIENT,
    EVENT_COLOR: EVENT_COLOR,
    EVENT_TINT: EVENT_TINT,
    HIGHLIGHT_STYLE: HIGHLIGHT_STYLE,
    KANBAN_COLUMNS: KANBAN_COLUMNS,
  };
})(window.WOS);
