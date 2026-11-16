import { getStore } from "@netlify/blobs";

/*
  You vs You - health check.

  GET /api/health  (no passcode needed)

  Deliberately unauthenticated, because its whole job is to answer
  "why isn't this syncing" before you can prove who you are. It never
  returns the passcode or any workout data, only whether each piece of
  the chain is working:

    passcodeSet - is YVY_PASSCODE present in the environment
    blobsOk     - can the function actually read the blob store

  If this route returns HTML instead of JSON, the function was never
  deployed and that is the whole problem.
*/

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*"
    }
  });

export default async () => {
  const out = {
    ok: true,
    service: "youvsyou",
    time: new Date().toISOString(),
    node: typeof process !== "undefined" && process.version ? process.version : "unknown",
    passcodeSet: !!process.env.YVY_PASSCODE,
    blobsOk: false,
    blobsError: null,
    hasSavedState: false
  };

  try {
    const store = getStore("youvsyou");
    const existing = await store.get("state", { type: "json" });
    out.blobsOk = true;
    out.hasSavedState = !!existing;
    if (existing && existing.savedAt) out.savedAt = existing.savedAt;
  } catch (err) {
    out.blobsOk = false;
    out.blobsError = String((err && err.message) || err).slice(0, 300);
  }

  return json(out);
};

export const config = { path: "/api/health" };
