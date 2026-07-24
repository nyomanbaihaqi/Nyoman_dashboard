/* ──────────────────────────────────────────────────────────────
   Daily Scrum — the morning report each division files.

   One entry per division per morning: a photo of the board, a short
   note, and the time it was filed. Deliberately close to a note, but
   fixed in shape — every scrum is the same four things — so the whole
   office reports the same way and the day reads at a glance.

   The photo goes to Drive (via the store), because a base64 image is
   far past what a spreadsheet cell holds; the row keeps only the link.
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
  // Largest edge a photo is scaled to before upload. A board photo stays
  // readable at 1280px, and the file drops from megabytes to ~200 KB — small
  // enough to pass through the serverless function without hitting its limit.
  var MAX_EDGE = 1280;

  /* ── Data ──────────────────────────────────────────────────── */

  function todayScrums() {
    return byDay();
  }

  function byDay() {
    var list = (data.scrums || []).slice().sort(WOS.by("createdAt", "desc"));
    return WOS.groupBy(list, function (scrum) {
      return fmt.isToday(scrum.createdAt) ? t("action.today") : fmt.fullDate(scrum.createdAt);
    });
  }

  function divisionName(id) {
    var division = data.divisionById.get(id);
    return division ? division.name : "";
  }

  function authorName(id) {
    var member = data.memberById.get(id);
    return member ? member.name : "";
  }

  /* ── Render ────────────────────────────────────────────────── */

  function scrumCard(scrum) {
    var division = data.divisionById.get(scrum.divisionId);
    var author = data.memberById.get(scrum.authorId);

    return (
      '<div class="card" style="padding:0;overflow:hidden">' +
      (scrum.photoUrl
        ? '<a href="' + esc(scrum.photoUrl) + '" target="_blank" rel="noopener noreferrer">' +
          '<img src="' + esc(scrum.photoUrl) + '" alt="" loading="lazy" ' +
          'style="display:block;width:100%;max-height:280px;object-fit:cover;background:var(--slate-100)"></a>'
        : "") +
      '<div style="padding:16px">' +
      '<div class="spread" style="align-items:flex-start;gap:10px">' +
      '<div style="min-width:0">' +
      '<p style="font-size:15px;font-weight:700;color:var(--text-strong)">' +
      esc(WOS.nameOr(scrum.title, t("common.untitled"))) + "</p>" +
      '<p class="text-label faint" style="margin-top:3px">' +
      esc(fmt.time(scrum.createdAt)) +
      (division ? " · " + esc(division.name) : "") +
      (author ? " · " + esc(author.name) : "") + "</p></div>" +
      '<div class="cluster" style="flex:none">' +
      '<button type="button" class="btn btn--ghost btn--sm" data-scrum-edit="' + esc(scrum.id) + '">' +
      esc(t("action.edit")) + "</button></div></div>" +
      (scrum.notes
        ? '<p class="text-sm" style="margin-top:10px;color:var(--text-body);line-height:1.6;white-space:pre-wrap">' +
          esc(scrum.notes) + "</p>"
        : '<p class="text-sm muted" style="margin-top:10px">' + esc(t("scrum.noNote")) + "</p>") +
      "</div></div>"
    );
  }

  function render() {
    var groups = byDay();

    var html =
      '<div class="page__head">' +
      '<div><h1 class="page__title">' + esc(t("scrum.title")) + "</h1>" +
      '<p class="page__subtitle">' + esc(t("scrum.subtitle")) + "</p></div>" +
      '<button type="button" class="btn btn--primary btn--sm" data-scrum-new>' +
      icon("plus", 14, { color: "#fff" }) + esc(t("scrum.new")) + "</button></div>";

    if (!groups.size) {
      html += '<div class="card" style="margin-top:18px">' +
        ui.empty(t("scrum.empty"), t("scrum.emptyHint"), null, "message-square") + "</div>";
      page.innerHTML = html;
      return;
    }

    Array.from(groups.keys()).forEach(function (label) {
      html += '<p class="eyebrow" style="margin-top:20px">' + esc(label) + "</p>" +
        '<div class="grid grid--sm-2" style="margin-top:10px;align-items:start">' +
        groups.get(label).map(scrumCard).join("") + "</div>";
    });

    page.innerHTML = html;
  }

  /* ── Photo ─────────────────────────────────────────────────── */

  /**
   * Read a File, downscale it, and hand back a JPEG data URL.
   *
   * Done in the browser so a 5 MB phone photo never leaves as 5 MB: the
   * serverless function has a request-size limit, and a full-resolution board
   * photo is wasted bytes for something that's read at card size.
   */
  function readAndShrink(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\//.test(file.type)) {
        reject(new Error(t("scrum.notImage")));
        return;
      }

      var reader = new FileReader();
      reader.onerror = function () {
        reject(new Error(t("scrum.readFailed")));
      };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () {
          reject(new Error(t("scrum.readFailed")));
        };
        img.onload = function () {
          var scale = Math.min(1, MAX_EDGE / Math.max(img.width, img.height));
          var canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", 0.82));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ── Modal ─────────────────────────────────────────────────── */

  function divisionOptions(selected) {
    return (data.divisions || [])
      .map(function (division) {
        return '<option value="' + esc(division.id) + '"' +
          (division.id === selected ? " selected" : "") + ">" + esc(division.name) + "</option>";
      })
      .join("");
  }

  function openModal(scrum) {
    var editing = !!scrum;
    // Pre-fill the title the way the format asks — "Daily Scrum <Division>" —
    // so filing one is choosing a division and attaching a photo, nothing more.
    var current = scrum || { title: "", notes: "", divisionId: "", photoUrl: "" };
    var pendingPhoto = current.photoUrl || "";

    ui.modal({
      title: editing ? t("scrum.edit") : t("scrum.new"),
      body:
        '<form class="stack" data-scrum-form>' +
        '<div class="field"><label class="field__label">' + esc(t("scrum.photo")) + "</label>" +
        '<label class="dropzone" data-scrum-drop style="display:block;cursor:pointer;padding:0;overflow:hidden;min-height:150px">' +
        '<input type="file" accept="image/*" data-scrum-file hidden>' +
        '<span data-scrum-preview style="display:' + (pendingPhoto ? "block" : "none") + '">' +
        (pendingPhoto ? '<img src="' + esc(pendingPhoto) + '" alt="" style="display:block;width:100%;max-height:220px;object-fit:cover">' : "") +
        "</span>" +
        '<span data-scrum-placeholder style="display:' + (pendingPhoto ? "none" : "flex") +
        ';flex-direction:column;align-items:center;justify-content:center;min-height:150px;gap:8px">' +
        icon("mic", 22, { color: "var(--antar-purple)" }) +
        '<span class="text-sm fw-semibold strong">' + esc(t("scrum.photoDrop")) + "</span>" +
        '<span class="text-label muted">' + esc(t("scrum.photoHint")) + "</span></span>" +
        "</label></div>" +

        '<div class="field"><label class="field__label">' + esc(t("scrum.division")) + "</label>" +
        '<select class="select" name="divisionId" data-scrum-division required>' +
        '<option value="">' + esc(t("scrum.pickDivision")) + "</option>" +
        divisionOptions(current.divisionId) + "</select></div>" +

        '<div class="field"><label class="field__label">' + esc(t("scrum.titleLabel")) + "</label>" +
        '<input class="input" name="title" data-scrum-title value="' + esc(current.title) +
        '" placeholder="' + esc(t("scrum.titlePlaceholder")) + '"></div>' +

        '<div class="field"><label class="field__label">' + esc(t("scrum.notes")) + "</label>" +
        '<textarea class="textarea" name="notes" rows="4" placeholder="' + esc(t("scrum.notesPlaceholder")) + '">' +
        esc(current.notes) + "</textarea></div>" +

        '<p class="text-label muted" data-scrum-status></p>' +

        '<div class="modal__actions">' +
        (editing
          ? '<button type="button" class="btn btn--danger" data-scrum-delete="' + esc(scrum.id) + '">' + esc(t("action.delete")) + "</button>"
          : "") +
        '<button type="button" class="btn btn--ghost" data-close-modal>' + esc(t("action.cancel")) + "</button>" +
        '<button type="submit" class="btn btn--primary" data-scrum-save>' + esc(t("action.save")) + "</button>" +
        "</div></form>",
    });

    wireModal(scrum, pendingPhoto);
  }

  /**
   * The modal renders outside `page`, so its controls are wired directly here
   * rather than through the page's delegated handlers.
   */
  function wireModal(scrum, initialPhoto) {
    var form = WOS.$("[data-scrum-form]");
    if (!form) return;

    // Not yet uploaded — held as a data URL until save, so a photo picked and
    // then cancelled never touches Drive.
    var photoData = null;
    var existingUrl = initialPhoto;

    var fileInput = WOS.$("[data-scrum-file]", form);
    var preview = WOS.$("[data-scrum-preview]", form);
    var placeholder = WOS.$("[data-scrum-placeholder]", form);
    var status = WOS.$("[data-scrum-status]", form);
    var divisionSelect = WOS.$("[data-scrum-division]", form);
    var titleInput = WOS.$("[data-scrum-title]", form);

    // Choosing a division fills the title, unless the person has typed their own.
    divisionSelect.addEventListener("change", function () {
      var name = divisionName(divisionSelect.value);
      if (name && (!titleInput.value.trim() || /^Daily Scrum/i.test(titleInput.value))) {
        titleInput.value = t("scrum.titlePrefix") + " " + name;
      }
    });

    fileInput.addEventListener("change", function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      status.textContent = t("scrum.shrinking");
      readAndShrink(file)
        .then(function (dataUrl) {
          photoData = dataUrl;
          preview.innerHTML = '<img src="' + dataUrl + '" alt="" style="display:block;width:100%;max-height:220px;object-fit:cover">';
          preview.style.display = "block";
          placeholder.style.display = "none";
          status.textContent = "";
        })
        .catch(function (error) {
          status.textContent = error.message;
        });
    });

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      var divisionId = divisionSelect.value;
      if (!divisionId) {
        status.textContent = t("scrum.pickDivision");
        return;
      }

      var title = titleInput.value.trim() || (t("scrum.titlePrefix") + " " + divisionName(divisionId));
      var notes = WOS.$('[name="notes"]', form).value;
      var saveBtn = WOS.$("[data-scrum-save]", form);
      saveBtn.disabled = true;

      // Upload only a freshly chosen photo; an unchanged edit keeps its link.
      var photoStep = photoData
        ? (status.textContent = t("scrum.uploading"), WOS.db.uploadPhoto(photoData, title))
        : Promise.resolve(existingUrl || "");

      photoStep
        .then(function (photoUrl) {
          var payload = {
            title: title,
            notes: notes,
            divisionId: divisionId,
            photoUrl: photoUrl,
            updatedAt: new Date().toISOString(),
          };

          if (scrum) return WOS.db.update("scrums", scrum.id, payload);
          return WOS.db.create("scrums", Object.assign({
            authorId: WOS.config.currentUserId,
            createdAt: new Date().toISOString(),
          }, payload));
        })
        .then(function () {
          ui.closeModal();
          return refresh();
        })
        .catch(function (error) {
          console.error("[wos] saving the scrum failed", error);
          saveBtn.disabled = false;
          status.textContent = t("scrum.saveFailed") + " (" + ((error && error.message) || error) + ")";
        });
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  function scrumById(id) {
    return (data.scrums || []).filter(function (scrum) {
      return scrum.id === id;
    })[0];
  }

  function bind() {
    WOS.on(page, "click", "[data-scrum-new]", function () {
      // A scrum belongs to a division, and if none exist the dropdown is empty
      // with no hint why. Say where they're set up instead of opening a form
      // that can't be submitted.
      if (!(data.divisions || []).length) {
        ui.toast(t("scrum.noDivisions"), "error");
        return;
      }
      openModal(null);
    });

    WOS.on(page, "click", "[data-scrum-edit]", function (event, target) {
      var scrum = scrumById(target.dataset.scrumEdit);
      if (scrum) openModal(scrum);
    });

    // The delete button lives inside the modal.
    document.addEventListener("click", function (event) {
      var target = event.target.closest && event.target.closest("[data-scrum-delete]");
      if (!target) return;
      if (!window.confirm(t("scrum.deleteConfirm"))) return;
      WOS.db.remove("scrums", target.dataset.scrumDelete).then(function () {
        ui.closeModal();
        return refresh();
      });
    });
  }

  function refresh() {
    return WOS.db.loadAll(["scrums", "members", "divisions"]).then(function (loaded) {
      data.scrums = loaded.scrums;
      data.members = loaded.members;
      data.divisions = loaded.divisions;
      data.memberById = WOS.indexById(loaded.members);
      data.divisionById = WOS.indexById(loaded.divisions);
      render();
    });
  }

  WOS.shell
    .mount({ active: "scrum", title: t("scrum.title") })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(3, 160);
      return WOS.db.loadAll(["scrums", "members", "divisions"]);
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
