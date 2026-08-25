import { getStore } from "@netlify/blobs";

/*
  You vs You - state endpoint.

  GET  /api/state   -> returns the saved state (or null if nothing saved yet)
  PUT  /api/state   -> overwrites the saved state, and writes a dated backup copy

  Both require the header  x-yvy-pass  to match the YVY_PASSCODE environment
  variable set in the Netlify dashboard. That is the only thing standing between
  your log and the open internet, so use something you would not guess.
*/

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, x-yvy-pass",
      "access-control-allow-methods": "GET, PUT, OPTIONS"
    }
  });

export default async (req) => {
  if (req.method === "OPTIONS") return json({ ok: true });

  const expected = process.env.YVY_PASSCODE;
  if (!expected) {
    return json({ error: "server_not_configured", detail: "YVY_PASSCODE is not set in Netlify environment variables." }, 500);
  }
  if (req.headers.get("x-yvy-pass") !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const store = getStore("youvsyou");

  if (req.method === "GET") {
    try {
      const state = await store.get("state", { type: "json" });
      return json({ ok: true, state: state || null });
    } catch (err) {
      return json({ error: "read_failed", detail: String(err) }, 500);
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
      // never costs you more than the current day.
      await store.setJSON("backup-" + savedAt.slice(0, 10), body);
      return json({ ok: true, savedAt });
    } catch (err) {
      return json({ error: "write_failed", detail: String(err) }, 500);
    }
  }

  return json({ error: "method_not_allowed" }, 405);
};

export const config = { path: "/api/state" };
