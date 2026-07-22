/* ──────────────────────────────────────────────────────────────
   Workspace OS — AI minutes

   Drives /api/analyze: upload a recording, wait for Google to
   finish processing it, then get back the handbook's five-point
   MoM.

   The audio is PUT straight from the browser to Google, not through
   /api/analyze — a two-hour recording is far past what a serverless
   function will accept as a request body. The server only ever hands
   over a short-lived upload URL, so the API key stays server-side.
   ────────────────────────────────────────────────────────────── */

(function (WOS) {
  "use strict";

  var ENDPOINT = "/api/analyze";

  /** POST a control message to our own function (never the audio itself). */
  function call(body) {
    return fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(function (response) {
        return response.text().then(function (raw) {
          var payload;
          try {
            payload = JSON.parse(raw);
          } catch (err) {
            // A static host that hasn't deployed the function answers with
            // HTML. Saying so beats a SyntaxError about "<".
            throw new Error(
              response.status === 404
                ? "/api/analyze isn't deployed. Upload api/analyze.js and redeploy."
                : "The server didn't return JSON (HTTP " + response.status + ")."
            );
          }
          if (!response.ok || !payload.ok) {
            throw new Error(payload.error || "HTTP " + response.status);
          }
          return payload;
        });
      });
  }

  /**
   * PUT the file to Google's resumable URL with progress.
   *
   * XMLHttpRequest rather than fetch: fetch still can't report upload
   * progress, and a silent progress bar on a 60 MB upload reads as a hang.
   */
  function put(uploadUrl, file, onProgress) {
    return new Promise(function (resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open("PUT", uploadUrl, true);
      xhr.setRequestHeader("X-Goog-Upload-Command", "upload, finalize");
      xhr.setRequestHeader("X-Goog-Upload-Offset", "0");

      xhr.upload.onprogress = function (event) {
        if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
      };

      xhr.onload = function () {
        var payload;
        try {
          payload = JSON.parse(xhr.responseText);
        } catch (err) {
          reject(new Error("Google's upload returned an unreadable response (HTTP " + xhr.status + ")."));
          return;
        }
        if (xhr.status < 200 || xhr.status >= 300) {
          reject(new Error((payload.error && payload.error.message) || "Upload failed (HTTP " + xhr.status + ")."));
          return;
        }
        resolve(payload.file || payload);
      };

      xhr.onerror = function () {
        reject(new Error("The upload was blocked before it finished. Check the network connection."));
      };
      xhr.onabort = function () {
        reject(new Error("Upload cancelled."));
      };

      xhr.send(file);
    });
  }

  /** Poll until Google reports the file ACTIVE, or give up with a real reason. */
  function waitUntilReady(name, onTick) {
    var started = Date.now();
    var LIMIT_MS = 10 * 60 * 1000;

    return new Promise(function (resolve, reject) {
      (function poll() {
        call({ op: "state", name: name })
          .then(function (payload) {
            if (payload.state === "ACTIVE") return resolve(payload.uri);
            if (payload.state === "FAILED") {
              return reject(new Error("Google couldn't process that recording. Try re-exporting it as MP3 or M4A."));
            }
            if (Date.now() - started > LIMIT_MS) {
              return reject(new Error("The recording is still processing after 10 minutes. Try a shorter file."));
            }
            if (onTick) onTick();
            setTimeout(poll, 3000);
          })
          .catch(reject);
      })();
    });
  }

  /**
   * Recording → minutes.
   *
   * @param {File} file
   * @param {object} [opts] { context, onStage(stage, ratio) }
   *   stages: "uploading" → "processing" → "reading"
   */
  function fromRecording(file, opts) {
    opts = opts || {};
    var stage = opts.onStage || function () {};
    var mimeType = file.type || guessType(file.name);

    stage("uploading", 0);

    return call({ op: "start", size: file.size, mimeType: mimeType, name: file.name })
      .then(function (session) {
        return put(session.uploadUrl, file, function (ratio) {
          stage("uploading", ratio);
        });
      })
      .then(function (uploaded) {
        stage("processing", 0);
        // A file that's already ACTIVE skips the poll entirely.
        if (uploaded.state === "ACTIVE" && uploaded.uri) return uploaded.uri;
        return waitUntilReady(uploaded.name, function () {
          stage("processing", 0);
        });
      })
      .then(function (uri) {
        stage("reading", 0);
        return call({ op: "analyze", fileUri: uri, mimeType: mimeType, context: opts.context });
      })
      .then(function (payload) {
        return payload.report;
      });
  }

  /** Transcript → minutes, for meetings that were captured as text. */
  function fromTranscript(text, opts) {
    opts = opts || {};
    if (opts.onStage) opts.onStage("reading", 0);
    return call({ op: "analyze", transcript: text, context: opts.context }).then(function (payload) {
      return payload.report;
    });
  }

  /**
   * Browsers leave File.type empty for some containers, and the API rejects a
   * blank type — so fall back to the extension rather than failing the upload.
   */
  function guessType(name) {
    var ext = String(name || "").split(".").pop().toLowerCase();
    var map = {
      mp3: "audio/mpeg", m4a: "audio/mp4", aac: "audio/aac", wav: "audio/wav",
      ogg: "audio/ogg", opus: "audio/ogg", flac: "audio/flac", webm: "video/webm",
      mp4: "video/mp4", mov: "video/quicktime", mkv: "video/x-matroska",
    };
    return map[ext] || "audio/mpeg";
  }

  WOS.ai = {
    fromRecording: fromRecording,
    fromTranscript: fromTranscript,
    guessType: guessType,
  };
})(window.WOS);
