import { getStore } from "@netlify/blobs";

/*
  You vs You - state endpoint.

  GET  /api/state   -> returns the saved state (or null if nothing saved yet)
  PUT  /api/state   -> overwrites the saved state, and writes a dated backup copy

  Both require the header  x-yvy-pass  to match the YVY_PASSCODE environment
  variable set in the Netlify dashboard. That is the only thing standing between
  your log and the open internet, so use something you would not guess.

  Every failure returns JSON with a named error, never a bare 500, so the app's
  diagnostics screen can say which link in the chain broke.
*/

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-yvy-pass",
      "access-control-allow-methods": "GET, PUT, POST, OPTIONS"
    }
  });

const msg = (err) => String((err && err.message) || err).slice(0, 300);

/* Opening the store can itself throw when Blobs is not wired up for the site.
   Called outside a try/catch that would be an unhandled exception and Netlify
   answers with its own 500 page, which tells you nothing. */
function openStore() {
  try {
    return { store: getStore("youvsyou"), error: null };
  } catch (err) {
    return { store: null, error: msg(err) };
  }
}

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });

  const expected = process.env.YVY_PASSCODE;
  if (!expected) {
    return json({
      error: "server_not_configured",
      detail: "YVY_PASSCODE is not set. Add it in Netlify under Site configuration, Environment variables, then trigger a new deploy so the function picks it up."
    }, 500);
  }
  if (req.headers.get("x-yvy-pass") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const { store, error: storeError } = openStore();
  if (!store) {
    return json({ error: "blobs_unavailable", detail: storeError }, 500);
  }

  if (req.method === "GET") {
    try {
      const state = await store.get("state", { type: "json" });
      return json({ ok: true, state: state || null });
    } catch (err) {
      return json({ error: "read_failed", detail: msg(err) }, 500);
    }
  }

  if (req.method === "PUT" || req.method === "POST") {
    let body;
    try {
      body = await req.json();
    } catch {
      return json({ error: "bad_json" }, 400);
    }
    if (!body || typeof body !== "object") return json({ error: "bad_body" }, 400);

    try {
      const savedAt = new Date().toISOString();
      body.savedAt = savedAt;
      await store.setJSON("state", body);
      // Rolling daily backup. One snapshot per calendar day, so a bad write
      // never costs you more than the current day. A failed backup must never
      // fail the real save, so it is caught separately.
      try {
        await store.setJSON("backup-" + savedAt.slice(0, 10), body);
      } catch (backupErr) {
        return json({ ok: true, savedAt, backupWarning: msg(backupErr) });
      }
      return json({ ok: true, savedAt });
    } catch (err) {
      return json({ error: "write_failed", detail: msg(err) }, 500);
    }
  }

  return json({ error: "method_not_allowed" }, 405);
};

export const config = { path: "/api/state" };
