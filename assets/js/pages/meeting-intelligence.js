/* ──────────────────────────────────────────────────────────────
   Meeting Intelligence — upload → processing funnel. There's no
   real transcription backend, so "processing" is a timed demo that
   lands on an already-structured meeting (Meeting Detail is where
   the real highlights/actions/transcript UI lives — no need to
   duplicate it here).
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
  var state = { view: "upload", stepIndex: 0 };
  var timer = null;

  var STEPS = ["mi.step.uploading", "mi.step.transcribing", "mi.step.understanding", "mi.step.extracting", "mi.step.actions", "mi.step.summary"];
  var DEMO_MEETING_ID = "mt_roadmap";

  function uploadView() {
    var processed = data.meetings
      .filter(function (m) {
        return m.status === "recorded" || m.status === "processed";
      })
      .sort(WOS.by("startAt", "desc"));

    return (
      '<div style="max-width:680px;margin:0 auto">' +
      '<div style="text-align:center;margin-bottom:24px">' +
      '<h1 class="page__title" style="font-size:24px">' + esc(t("mi.upload.title")) + "</h1>" +
      '<p class="page__subtitle">' + esc(t("mi.upload.subtitle")) + "</p></div>" +
      '<div class="dropzone" data-dropzone>' +
      '<div class="empty__icon" style="margin:0 auto 18px;width:64px;height:64px;border-radius:18px">' + icon("file-pen", 26, { color: "#7c3aed" }) + "</div>" +
      '<p style="font-size:17px;font-weight:700;color:var(--text-strong)">' + esc(t("mi.upload.drop")) + "</p>" +
      '<p class="text-label muted" style="margin-top:6px">' + esc(t("mi.upload.browse")) + "</p>" +
      '<div class="cluster" style="justify-content:center;margin-top:16px">' +
      ["MP3", "MP4", "M4A", "Zoom", "Google Meet", "Teams"].map(ui.tag).join("") +
      "</div></div>" +
      '<div class="cluster" style="justify-content:center;margin-top:18px">' +
      '<button type="button" class="btn btn--primary" data-start-processing>' + icon("rocket", 15, { color: "#fff" }) + esc(t("mi.upload.record")) + "</button>" +
      '<button type="button" class="btn btn--outline" data-start-processing>' + icon("boxes", 15) + esc(t("mi.upload.importDrive")) + "</button>" +
      '<button type="button" class="btn btn--outline" data-start-processing>' + icon("chart-line", 15) + esc(t("mi.upload.importZoom")) + "</button>" +
      '<button type="button" class="btn btn--outline" data-start-processing>' + icon("message-square", 15) + esc(t("mi.upload.importMeet")) + "</button>" +
      "</div>" +
      '<p class="text-label muted" style="text-align:center;margin-top:16px">' + esc(t("mi.aiPending")) + "</p>" +
      "</div>" +
      (processed.length
        ? '<h2 class="section-title" style="margin-top:32px">' + esc(t("mi.recent")) + "</h2>" +
          '<div class="grid grid--md-2">' +
          processed
            .map(function (m) {
              return (
                '<a class="card card-lift" href="meeting.html?id=' + esc(m.id) + '" style="display:block">' +
                '<div class="spread"><span class="row__title">' + esc(m.title) + "</span>" +
                ui.badge(t("meetings.status." + m.status), ui.MEETING_TONE[m.status]) + "</div>" +
                '<p class="text-label muted" style="margin-top:6px">' + esc(fmt.dayMonth(m.startAt)) + " · " + esc(fmt.duration(m.durationMin)) + "</p></a>"
              );
            })
            .join("") +
          "</div>"
        : "")
    );
  }

  function processingView() {
    return (
      '<div style="max-width:480px;margin:60px auto 0;text-align:center">' +
      '<div class="empty__icon" style="margin:0 auto 20px;width:72px;height:72px;border-radius:20px;background:linear-gradient(135deg,#8b5cf6,#6648ff);box-shadow:0 10px 30px rgba(102,72,255,.35)">' +
      icon("bot", 30, { color: "#fff", className: "spin" }) + "</div>" +
      '<h1 class="page__title" style="font-size:20px">' + esc(t("mi.processing.title")) + "</h1>" +
      '<p class="text-sm muted" style="margin-top:6px">Product_Roadmap_Sync_Q3.mp4 · 42 min</p>' +
      '<div class="card" style="margin-top:24px;text-align:left">' +
      STEPS.map(function (key, i) {
        var cls = i < state.stepIndex ? "step--done" : i === state.stepIndex ? "step--active" : "step--pending";
        var marker = i < state.stepIndex ? icon("check", 11, { color: "#fff" }) : "";
        return (
          '<div class="step ' + cls + '"><span class="step__marker">' + marker + "</span>" +
          '<span class="step__label">' + esc(t(key)) + "</span></div>"
        );
      }).join("") +
      '<div class="progress" style="margin-top:12px">' +
      '<div class="progress__fill" style="width:' + Math.round(((state.stepIndex + 1) / STEPS.length) * 100) +
      '%;background:linear-gradient(to right,#8b5cf6,#6648ff)"></div></div></div>' +
      '<button type="button" class="btn btn--ghost btn--sm" style="margin-top:16px" data-skip>Skip to result (demo)</button>' +
      "</div>"
    );
  }

  function render() {
    page.innerHTML = state.view === "upload" ? uploadView() : processingView();
  }

  function startProcessing() {
    clearTimeout(timer);
    state.view = "processing";
    state.stepIndex = 0;
    render();
    advance();
  }

  function advance() {
    timer = setTimeout(function () {
      state.stepIndex++;
      if (state.stepIndex >= STEPS.length) {
        window.location.href = "meeting.html?id=" + DEMO_MEETING_ID;
        return;
      }
      render();
      advance();
    }, 700);
  }

  function bind() {
    WOS.on(page, "click", "[data-start-processing], [data-dropzone]", function () {
      startProcessing();
    });
    WOS.on(page, "click", "[data-skip]", function () {
      clearTimeout(timer);
      window.location.href = "meeting.html?id=" + DEMO_MEETING_ID;
    });
  }

  /* ── Boot ──────────────────────────────────────────────────── */

  WOS.shell
    .mount({ active: "mi", title: t("mi.title") })
    .then(function (main) {
      page = main;
      page.innerHTML = WOS.ui.skeletonRows(3, 100);
      return WOS.db.list("meetings");
    })
    .then(function (rows) {
      data = { meetings: rows };
      render();
      bind();
    })
    .catch(function (error) {
      WOS.shell.renderError(page || document.getElementById("page") || document.body, error);
    });
})(window.WOS);
