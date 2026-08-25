# You vs You (v2) · Instructions Manual

Written for someone with zero context. If you are picking this up cold, months
from now or as a new person, everything you need is here.

---

## 1. What this is

A personal workout tracking web app. It loads a real 7-month training program and
turns logging workouts into a game against your past self. Every exercise shows
the number you hit last time, and the job is to beat it.

It is built for one user. There are no accounts, no sign-up, no other people.
One passcode unlocks one log.

**The big change from v1:** progress now saves to a server, not just to the phone.
In v1 everything lived in the browser's localStorage, which is tied to the exact
web address. Renaming the Netlify site changed the address, the browser treated it
as a brand new website, and every logged session and personal record was gone.
v2 stores the data server-side, so the address can change and the log follows.

---

## 2. The core idea: it is about the work

When you log a set, the app scores it as **work**.

- **Weighted lifts:** work = weight x reps. Beating an exercise means doing more
  total work on any single set than the best set of your last session, whether
  that comes from more weight, more reps, or both.
- **Reps-only lifts** (banded pull aparts, push ups, planks, ab rollouts, and
  anything else with no weight to load): work = reps. Simple as that.

Three outcomes per set:

| Colour | Meaning |
|---|---|
| Green ▲ | Beat it. More work than last time. |
| Blue = | Held the line. Exactly matched. |
| Grey · | Logged, under last time. Still saved, no penalty, bar does not move. |

Two tiers of winning:

- **Beat last time** = green. The week-to-week win.
- **Beat your all-time best** = gold **New Peak**. The boss fight. Triggers a
  celebration banner and gets listed on the session summary.

### Where the first targets came from

The original training log recorded weight but often not reps. For those
weight-only history entries, the app assumes the weight was done for the minimum
of the target rep range. Target 8-12 with a log entry of "40" is treated as
40 x 8, tagged **from old log**. It is a conservative floor and easy to beat.
Once you log real numbers, that seed is never used for that exercise again.

Reps-only exercises ignore the old log entirely, because the old numbers were
weight-based and mean nothing in a rep contest. Those start clean at zero.

---

## 3. The screens

### Home

- **Date and streak.** Streak counts consecutive days you showed up: any workout,
  travel circuit, or logged active rest keeps it alive. Tap the flame for the
  activity calendar.
- **Sync badge** (top right, next to the streak). Shows Saved, Saving, Offline,
  or Local only. Tap it for the data menu (section 5).
- **Program / Travel switch.**
- **7-Month Program bar.** Seven segments, percent complete, sessions left.
  **Tap it to change where you are in the program** (month, week, day).
- **This Week scoreboard.** Ring of sessions, water, and on-track days.
- **Today's Session card** with Day 1-4 pills. Below it, log an active rest day.
- **Daily Check-In.** Water yes/no, ate on track yes/close/no.
- **Bodyweight strip.** Log + to add today's weight, tap the strip for the graph.
- **View workout log** opens history.

### Session

- **Sticky top bar** shows session progress percent, the time you started
  ("Started 9:04 AM"), and a live running clock.
- Each exercise shows its group letter (A1, B1), target rep range, and the
  **Work to beat** or **Reps to beat**.
- **All-time peak** appears as the gold boss-fight line.
- **Form cue** button. Tap it for a one-liner: which muscle to focus on for
  mind-muscle connection, plus a single technique cue. Hidden by default so it is
  there when you want it and out of the way when you do not.
- **lbs / reps toggle** (top right of each exercise card). Flips that exercise
  between weight-and-reps and reps-only. The choice sticks for that exercise
  everywhere, forever, until you flip it back.
- Type weight and reps per set. Sets score live as you type. **+ Add set** for
  extra sets.
- **Finish session** at the bottom opens the summary.

### Session summary

Appears when you finish. Shows:

- Total work for the session
- Elapsed time, plus start and finish times
- Number of new peaks, listed with the old number they beat
- Sets logged, lifts completed, targets beaten
- **Rate the pump** 1 to 10

Nothing is committed until you tap **Lock it in**. That marks the session done,
saves the pump rating, keeps your streak alive, and advances the program to the
next day. **Back to the session** returns to edit before committing.

### Travel circuits

Two bodyweight circuits for when there is no gym. Rep movements get a checkbox,
timed holds get a countdown timer that buzzes and auto-checks when it finishes.
Per-side holds run left, then right. Finishing a circuit keeps the streak alive.

### History

Every session, newest first, with the date, start time, duration, total work,
pump rating, and every set logged.

### Calendar

Month grid with a coloured dot per active day: green for gym, orange for travel,
blue for active rest. Arrows to change month, plus a count of gym sessions.

### Bodyweight graph

Line chart of every weight entry, current weight, total change since the first
entry, and a full list of entries. Seeded with 210 lb on June 20, 2026.

---

## 4. How saving works

Three layers, in this order:

1. **The phone.** Every keystroke saves to browser localStorage immediately. Even
   with no signal, nothing you type is lost.
2. **The server.** About a second after you stop typing, the app pushes the whole
   state to a Netlify Function, which writes it to Netlify Blobs. This is the
   copy that survives a URL change, a cleared browser, or a new phone.
3. **Daily backup.** Every server write also saves a dated snapshot
   (`backup-2026-08-04`). A bad write can never cost more than the current day.

**Opening the app on a second phone:** enter the same passcode. The app compares
timestamps and loads whichever copy is newer. Both phones then stay in step.

**Conflict rule:** last write wins. If you log on two phones at once without
either syncing, the later save overwrites. In practice this never comes up with
one person and one gym session at a time.

**If the server is unreachable,** the badge shows Offline and the app keeps
working entirely from the phone. It retries the push next time you save or next
time you bring the app back to the foreground.

**Backgrounding the app** flushes any pending write straight away, so closing
the app the second after you finish a set does not leave that set unsent.

### Opening it with no signal

The app installs a service worker that caches itself: the page, the styles, the
fonts, the program data and the code. Once you have opened it on a phone at
least once, it opens again with no signal at all, at the gym or on a plane.
Everything you log while offline saves to the phone and pushes up the moment you
have a connection again.

The fonts are embedded in the app as base64 rather than loaded from Google, so
text renders correctly offline and on iOS.

---

## 5. The data menu

Tap the sync badge at the top right of the home screen.

- **Push this device to the server.** Makes this phone the source of truth.
- **Pull the server copy down.** Overwrites this phone with the server copy.
- **Download a backup file.** A JSON file with everything in it. Do this before
  anything risky.
- **Restore from a backup file.** Loads a downloaded JSON back in and pushes it
  to the server. Asks for confirmation first, and tells you how many sessions and
  bodyweight entries it found.
- **Change passcode.** Forgets the passcode on this device and shows the unlock
  screen again.

---

## 6. Deploying it

The app is a static site plus one serverless function. It runs on Netlify,
deployed from GitHub.

### First time

1. Push this folder to a GitHub repository.
2. In Netlify: **Add new site → Import an existing project** and pick the repo.
3. Build settings: leave the build command **empty**, publish directory `.`,
   functions directory `netlify/functions`. `netlify.toml` already sets all of
   this, so the defaults it offers should be correct.
4. Deploy.
5. **This step is required or nothing will save.** Go to
   **Site configuration → Environment variables** and add:

   | Key | Value |
   |---|---|
   | `YVY_PASSCODE` | a passcode only you know |

6. Redeploy once so the function picks up the variable
   (**Deploys → Trigger deploy → Deploy site**).
7. Open the site, enter the passcode, and you are in.

### Updating it later

Push to the GitHub branch. Netlify rebuilds automatically. Your data is in Blobs,
not in the code, so deploys never touch it.

**One extra step when you change any app file:** bump the `CACHE` version string
at the top of `sw.js` (for example `yvy-v2.1.0` to `yvy-v2.1.1`). The service
worker uses that string to decide when to throw away the old cached copy. Skip
it and phones that already have the app installed may keep serving the previous
version. `netlify.toml` already tells Netlify never to cache `sw.js` or
`index.html`, which is the other half of making a deploy land.

### Installing it on your phone

Open the site in Safari or Chrome, then **Share → Add to Home Screen**. It gets
the You vs You icon and opens full screen with no browser chrome, like a real
app. This is also what makes the offline cache most reliable.

### Changing the site name or domain

Safe now. The data lives on the server keyed to the passcode, not to the URL.
Worth doing a **Download a backup file** first anyway, out of habit.

---

## 7. The files

| File | What it is |
|---|---|
| `index.html` | The page shell. Loads the other three scripts. |
| `styles.css` | All styling. The dark scoreboard look. |
| `program-data.js` | The 7-month program plus the parsed history from the original spreadsheet. Machine generated, do not hand-edit. |
| `exercise-meta.js` | Form cues and target muscles, and the default reps-only list. **Safe to edit by hand.** |
| `app.js` | All the app logic. |
| `fonts.css` | Barlow Condensed and Inter embedded as base64. No network call. |
| `sw.js` | Service worker. Caches the app so it opens offline. Bump `CACHE` on every deploy. |
| `manifest.json` | Home screen name, colours, icons, standalone mode. |
| `icon.svg`, `icon-180.png`, `icon-192.png`, `icon-512.png` | App icons. |
| `netlify/functions/state.js` | The save endpoint. Reads and writes Netlify Blobs, checks the passcode. |
| `netlify.toml` | Netlify build config. |
| `package.json` | One dependency, `@netlify/blobs`, used by the function. |
| `MANUAL.md` | This file. |

### Editing form cues

Open `exercise-meta.js`. Each line is:

```js
"Bench Press": ["Chest", "Shoulder blades pinned down and back. Bar to the lower chest, elbows around 45 degrees."],
```

First value is the muscle to focus on, second is the cue. The name must match the
program data exactly. Anything missing just shows no cue button, nothing breaks.

### Changing which exercises are reps-only

Two ways. Permanently for a new install, edit `REP_ONLY_DEFAULTS` at the bottom of
`exercise-meta.js`. For your own log, just tap the **lbs / reps** toggle on the
exercise card in the app, which overrides the default and saves with your data.

---

## 8. What was deliberately left out

- **The AI 3D character**, both the goal-weight avatar and the form-demo
  animation. Real versions of this need a rigged, animated 3D asset library. That
  is a separate product with its own build, not a feature of this app. Parked, not
  rejected.
- **Strength percentile vs the average male.** Doable later using published
  strength standards scaled to bodyweight, but it can only ever be an estimate,
  never a real bell curve, because that dataset does not exist cleanly. Worth
  doing only if it is labelled honestly as a rough tier, not a percentile.
- **Multi-user support.** This is a one-person app on purpose.

---

## 9. Known limits

- Last-write-wins sync. Two phones logging simultaneously without syncing will
  lose one side's edits.
- The passcode is the entire security model. It is checked server-side and the
  data is not public, but treat it like a password.
- The old spreadsheet seed targets for weight-only entries are estimates. They are
  marked **from old log** in the app and disappear the first time you log real
  numbers for that exercise.
- Timed circuit holds pause if the phone locks mid-timer.
- A session left open is treated as abandoned after six hours, or if you come
  back on a different day. Reopening it restarts the clock from zero rather than
  reporting a twenty six hour workout. Sets already logged are kept.
- The streak shown on screen is recalculated live. If your last active day was
  not today or yesterday it displays zero, even though the old number is still
  stored underneath.

---

A build is not finished until it is documented. This is that documentation.
