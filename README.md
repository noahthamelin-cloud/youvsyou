# You vs You

Personal workout tracker. A 7-month training program turned into a game against
your past self. Progress saves server-side, so the log survives a URL change,
a new phone, or a cleared browser.

**Stack:** static HTML/CSS/JS, one Netlify Function backed by Netlify Blobs,
plus a service worker for offline use. No framework, no build step.

## Quick start

1. Push to GitHub, import the repo in Netlify.
2. Set the environment variable `YVY_PASSCODE` in Netlify site settings.
3. Redeploy, open the site, enter the passcode.
4. On your phone: Share → Add to Home Screen.

Without step 2 the save endpoint returns a 500 and nothing persists to the server.

**When you change any app file, bump `CACHE` at the top of `sw.js`** or installed
phones may keep serving the old version.

## Full documentation

See **[MANUAL.md](MANUAL.md)** for how the app works, how saving works, how to
edit form cues, how to deploy and update, and what was intentionally left out.
