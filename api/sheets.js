/**
 * Vercel serverless function — the /api/sheets proxy.
 *
 * The frontend is plain static HTML with no build step, so it can't hold a
 * secret. This function is the thin server-side hop: it takes the client's
 * {collection, op, id?, data?, filter?} body, attaches SHEETS_SECRET (never
 * sent to the browser), and forwards it to the Apps Script Web App at
 * SHEETS_ENDPOINT. The Apps Script response is passed straight back.
 *
 * Only reached when assets/js/config.js has `backend: "api"`. Set
 * SHEETS_ENDPOINT and SHEETS_SECRET in the Vercel project's environment
 * variables — see apps-script/Code.gs for what deploys behind that endpoint.
 */
module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ ok: false, error: "method not allowed" });
    return;
  }

  var endpoint = process.env.SHEETS_ENDPOINT;
  var secret = process.env.SHEETS_SECRET;

  if (!endpoint || !secret) {
    res.status(500).json({
      ok: false,
      error:
        "Sheets backend isn't configured. Set SHEETS_ENDPOINT and SHEETS_SECRET in the Vercel project's environment variables, then redeploy.",
    });
    return;
  }

  var body = Object.assign({}, req.body, { secret: secret });

  var upstream;
  try {
    upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "follow", // Apps Script /exec always 302s to googleusercontent.com
    });
  } catch (err) {
    res.status(502).json({
      ok: false,
      error: "Couldn't reach SHEETS_ENDPOINT. Check the URL is the deployment's /exec address.",
      detail: String(err && err.message ? err.message : err),
    });
    return;
  }

  // Read as text first. Apps Script answers with HTML — a Google sign-in page —
  // when the Web App's "Who has access" isn't set to "Anyone", and parsing that
  // as JSON would throw a SyntaxError that says nothing about the real cause.
  var raw = await upstream.text();

  var payload;
  try {
    payload = JSON.parse(raw);
  } catch (err) {
    var looksLikeLogin = /<html|accounts\.google\.com|sign in/i.test(raw);
    res.status(502).json({
      ok: false,
      error: looksLikeLogin
        ? 'Apps Script returned a sign-in page instead of JSON. In the Apps Script editor: Deploy → Manage deployments → edit → set "Who has access" to "Anyone", then redeploy and update SHEETS_ENDPOINT to the new /exec URL.'
        : "Apps Script returned a non-JSON response.",
      upstreamStatus: upstream.status,
      preview: raw.slice(0, 200),
    });
    return;
  }

  res.status(200).json(payload);
};
