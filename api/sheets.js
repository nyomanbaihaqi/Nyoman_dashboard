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
      error: "Sheets backend isn't configured. Set SHEETS_ENDPOINT and SHEETS_SECRET in the Vercel project's environment variables.",
    });
    return;
  }

  var body = Object.assign({}, req.body, { secret: secret });

  try {
    var upstream = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    var payload = await upstream.json();
    res.status(200).json(payload);
  } catch (err) {
    res.status(502).json({ ok: false, error: "Could not reach the Sheets backend." });
  }
};
