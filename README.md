# You vs You

Personal workout tracker. Two programs, guided timed routines, cardio and macro
logging, and server-saved progress that survives a URL change or a new phone.

**Stack:** static HTML/CSS/JS in `public/`, two Netlify Functions backed by
Netlify Blobs, plus a service worker for offline use. No framework, no build step.

## Quick start

1. Push to GitHub, import the repo in Netlify.
2. Set the environment variable `YVY_PASSCODE` in Netlify site settings.
3. Redeploy, open the site, enter the passcode.
4. On your phone: Share → Add to Home Screen.

Without step 2 the save endpoint returns 500 and nothing persists.

**Publish directory is `public`. Functions live in `netlify/functions`, outside
it.** Functions inside the publish directory can fail to register, which is what
broke syncing in v2.

**When you change any app file, bump `CACHE` at the top of `public/sw.js`** or
installed phones keep serving the old version.

## Not syncing?

Open the app → Settings → Sync diagnostics → Run the check. It prints the literal
server response and names the broken link in the chain.

## Full documentation

See **[MANUAL.md](MANUAL.md)**.
