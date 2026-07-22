/**
 * Vercel serverless function — the /api/analyze proxy.
 *
 * Turns a meeting recording into the handbook's five-point MoM: Fact,
 * Assumption, Proposal, Decision, Action.
 *
 * Why the upload is a three-step dance instead of one POST:
 * a Vercel function body caps out around 4.5 MB, and a two-hour recording is
 * 30-60 MB. So the audio never passes through here. Instead this function asks
 * Google for a resumable upload URL, hands that URL to the browser, and the
 * browser PUTs the bytes straight to Google. The upload URL carries its own
 * short-lived token, so GEMINI_API_KEY stays server-side the whole time — the
 * same reason /api/sheets exists.
 *
 *   start   → { uploadUrl, mimeType }   browser uploads to uploadUrl itself
 *   state   → { state }                 poll until Google finishes processing
 *   analyze → { report }                run the model over the uploaded file
 *
 * `analyze` also accepts { transcript } instead of a file, which is the path
 * used when someone pastes a Meet/Zoom transcript rather than an audio file.
 *
 * Set GEMINI_API_KEY in the Vercel project's environment variables, then
 * redeploy — environment variables do not apply to already-running deployments.
 */

var API = "https://generativelanguage.googleapis.com";

/* Fast, long-context, and cheap enough to run over a two-hour recording. */
var MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

/**
 * The shape the app stores. Asking for JSON directly — rather than prose we
 * then parse — is what makes the result safe to write into a spreadsheet row.
 */
var SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string" },
    language: { type: "string" },
    summary: { type: "string" },
    fact: { type: "array", items: { type: "string" } },
    assumption: { type: "array", items: { type: "string" } },
    proposal: { type: "array", items: { type: "string" } },
    decisions: {
      type: "array",
      items: {
        type: "object",
        properties: { time: { type: "string" }, text: { type: "string" } },
        required: ["text"],
      },
    },
    actionItems: {
      type: "array",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          owner: { type: "string" },
          priority: { type: "string", enum: ["low", "medium", "high"] },
          dueHint: { type: "string" },
        },
        required: ["text"],
      },
    },
    openQuestions: { type: "array", items: { type: "string" } },
    keywords: { type: "array", items: { type: "string" } },
    confidence: { type: "integer" },
  },
  required: ["title", "fact", "assumption", "proposal", "decisions", "actionItems"],
};

var INSTRUCTIONS = [
  "You are taking minutes for an executive assistant at Antarestar.",
  "Produce the five-point MoM used in the company handbook, in this order:",
  "",
  "1. FACT — only what is verifiably stated. Numbers, dates, names, states of the world.",
  "2. ASSUMPTION — what people are still guessing or treating as true without evidence.",
  "3. PROPOSAL — options that were put on the table but NOT settled.",
  "4. DECISION — what was actually settled. Include the timestamp it was settled at.",
  "5. ACTION — who does what, and by when.",
  "",
  "Rules that matter more than completeness:",
  "- Never move an item up the chain. A proposal nobody agreed to is NOT a decision.",
  "  Wrongly promoting a proposal to a decision is the single worst failure here,",
  "  because the minutes get pasted into WhatsApp and acted on.",
  "- If something is unclear or contested, put it in openQuestions rather than guessing.",
  "- Leave an array empty when nothing belongs in it. An empty section is information;",
  "  an invented one is damage.",
  "- Use the language actually spoken in the meeting. If it is Indonesian, write Indonesian.",
  "- For actionItems.owner, write the person's name exactly as spoken. Leave it empty",
  "  if no one was named — do not assign work to whoever spoke last.",
  "- decisions[].time is the timestamp within the recording, as HH:MM:SS.",
  "- confidence is 0-100: how much of the audio was clear enough to rely on.",
].join("\n");

/* ── HTTP helpers ──────────────────────────────────────────────── */

function fail(res, status, error, extra) {
  res.status(status).json(Object.assign({ ok: false, error: error }, extra || {}));
}

/** Read an upstream response as text first, so an HTML error page is reportable. */
async function readJson(upstream) {
  var raw = await upstream.text();
  try {
    return { ok: true, data: JSON.parse(raw) };
  } catch (err) {
    return { ok: false, raw: raw };
  }
}

/** Pull Google's own error message out, rather than reporting a bare status. */
function upstreamMessage(parsed, upstream) {
  if (parsed.ok && parsed.data && parsed.data.error) {
    return parsed.data.error.message || JSON.stringify(parsed.data.error);
  }
  if (!parsed.ok) return "Non-JSON response (HTTP " + upstream.status + "): " + parsed.raw.slice(0, 200);
  return "HTTP " + upstream.status;
}

/* ── Operations ────────────────────────────────────────────────── */

/**
 * Open a resumable upload session and return the URL the browser uploads to.
 * That URL is single-use and expires, which is why it's safe to expose.
 */
async function start(key, body, res) {
  var size = Number(body.size);
  var mimeType = String(body.mimeType || "");

  if (!size || size < 1) return fail(res, 400, "A file size is required to open an upload.");
  if (!/^(audio|video)\//.test(mimeType)) {
    return fail(res, 400, "Only audio or video recordings can be analysed. Got: " + (mimeType || "no type"));
  }

  var upstream = await fetch(API + "/upload/v1beta/files?key=" + encodeURIComponent(key), {
    method: "POST",
    headers: {
      "X-Goog-Upload-Protocol": "resumable",
      "X-Goog-Upload-Command": "start",
      "X-Goog-Upload-Header-Content-Length": String(size),
      "X-Goog-Upload-Header-Content-Type": mimeType,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ file: { display_name: String(body.name || "recording") } }),
  });

  var uploadUrl = upstream.headers.get("x-goog-upload-url");
  if (!uploadUrl) {
    var parsed = await readJson(upstream);
    return fail(res, 502, "Google didn't return an upload URL. " + upstreamMessage(parsed, upstream));
  }

  res.status(200).json({ ok: true, uploadUrl: uploadUrl, mimeType: mimeType });
}

/**
 * Report whether Google has finished processing the upload. Audio isn't
 * queryable the instant the bytes land — asking the model too early fails with
 * a confusing "file not ACTIVE", so the client polls this first.
 */
async function state(key, body, res) {
  var name = String(body.name || "");
  if (!/^files\/[\w-]+$/.test(name)) return fail(res, 400, "Expected a file name like files/abc123.");

  var upstream = await fetch(API + "/v1beta/" + name + "?key=" + encodeURIComponent(key));
  var parsed = await readJson(upstream);

  if (!upstream.ok || !parsed.ok) {
    return fail(res, 502, "Couldn't read the upload's status. " + upstreamMessage(parsed, upstream));
  }

  res.status(200).json({ ok: true, state: parsed.data.state, uri: parsed.data.uri });
}

/** Run the model and return the structured minutes. */
async function analyze(key, body, res) {
  var parts = [];

  if (body.fileUri) {
    parts.push({ fileData: { mimeType: String(body.mimeType || "audio/mpeg"), fileUri: String(body.fileUri) } });
    parts.push({ text: "Take minutes from this recording." });
  } else if (body.transcript && String(body.transcript).trim()) {
    parts.push({ text: "Take minutes from this transcript.\n\n" + String(body.transcript).slice(0, 900000) });
  } else {
    return fail(res, 400, "Nothing to analyse — send either a fileUri or a transcript.");
  }

  if (body.context) parts.push({ text: "Context supplied by the assistant: " + String(body.context).slice(0, 2000) });

  var upstream = await fetch(
    API + "/v1beta/models/" + encodeURIComponent(MODEL) + ":generateContent?key=" + encodeURIComponent(key),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: INSTRUCTIONS }] },
        contents: [{ role: "user", parts: parts }],
        generationConfig: {
          // Minutes are a record, not a creative task.
          temperature: 0.2,
          responseMimeType: "application/json",
          responseSchema: SCHEMA,
        },
      }),
    }
  );

  var parsed = await readJson(upstream);
  if (!upstream.ok || !parsed.ok) {
    return fail(res, 502, "The model call failed. " + upstreamMessage(parsed, upstream));
  }

  var candidate = (parsed.data.candidates || [])[0];
  var text = candidate && candidate.content && (candidate.content.parts || [])[0]
    ? candidate.content.parts[0].text
    : "";

  if (!text) {
    // A blocked or truncated answer has no parts. Say which, rather than
    // reporting an empty report as if the meeting had nothing in it.
    var reason = (candidate && candidate.finishReason) || (parsed.data.promptFeedback || {}).blockReason || "unknown";
    return fail(res, 502, "The model returned nothing (reason: " + reason + ").");
  }

  var report;
  try {
    report = JSON.parse(text);
  } catch (err) {
    return fail(res, 502, "The model's answer wasn't valid JSON.", { preview: text.slice(0, 200) });
  }

  res.status(200).json({ ok: true, report: report, model: MODEL });
}

/* ── Entry point ───────────────────────────────────────────────── */

module.exports = async function handler(req, res) {
  if (req.method !== "POST") return fail(res, 405, "method not allowed");

  var key = process.env.GEMINI_API_KEY;
  if (!key) {
    return fail(
      res,
      500,
      "AI isn't configured yet. Add GEMINI_API_KEY to the Vercel project's environment variables, then redeploy — env vars don't apply to a deployment that's already running."
    );
  }

  var body = req.body || {};
  var op = String(body.op || "");

  try {
    if (op === "start") return await start(key, body, res);
    if (op === "state") return await state(key, body, res);
    if (op === "analyze") return await analyze(key, body, res);
    return fail(res, 400, "Unknown op: " + (op || "(none)"));
  } catch (err) {
    return fail(res, 502, "Couldn't reach Google's API.", {
      detail: String(err && err.message ? err.message : err),
    });
  }
};
