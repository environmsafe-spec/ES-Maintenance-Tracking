# Setting up Claude Code for this app — from your Android phone

Goal: be able to ask Claude Code (in the **Code tab** of your Claude app) to make changes to your generator app, from your phone, with no laptop.

There is a **one-time setup** (about 15–20 minutes). After that, making changes is easy.

---

## The big picture (how it will work)

1. Your app's files live in a **GitHub repository** (a free cloud folder for code).
2. In the Claude app → **Code tab**, you connect that repository.
3. You message Claude Code in plain language ("add a column for…", "fix…"). It changes the files and saves them to GitHub.
4. The change goes live on your website (either automatically, if you connect GitHub to Netlify, or by the drag-and-drop you already know).

---

## STEP 1 — Create the GitHub repository (one time)

1. On your phone browser, go to **github.com** and sign in.
2. Tap **+** (top right) → **New repository**.
3. Name it: `environmsafe-generators`
4. Set it to **Private** (your choice).
5. Tap **Create repository**.

## STEP 2 — Put the app files into the repository (one time)

The easiest phone method: upload the files GitHub-side.

1. In your new empty repo, tap **"uploading an existing file"** (or **Add file → Upload files**).
2. Upload **all** the files from the package I gave you:
   - `generator-readings.html`  ← the app itself (most important)
   - `CLAUDE.md`                ← the project memory Claude Code reads first
   - `firestore-rules.txt`
   - all the `test_*.js` files and `simulate_firestore.js`
   - `firebase_mock_init.js`
3. Tap **Commit changes**.

Now your whole project is in GitHub.

## STEP 3 — Connect the repo in the Claude app (one time)

1. Open the **Claude app** on your phone → **Code tab**.
2. Start a new Code session and **connect GitHub** when prompted (authorize access to the `environmsafe-generators` repo).
3. Once connected, Claude Code can read `CLAUDE.md` and understand the whole project.

## STEP 4 — First message to Claude Code

Send it this, so it orients itself before changing anything:

> "Read CLAUDE.md, then give me a short summary of what this app does and how you'd make changes. Don't change anything yet."

If the summary matches what you expect, you're set.

---

## Making a change later (the easy part)

Just message Claude Code, for example:
> "In the Faults tab, add a field for the technician's phone number. Keep it bilingual and run the tests."

It will edit `generator-readings.html`, run the test suites, and commit to GitHub.

## Getting a change live on your website

Pick ONE of these (set up once):

**Option A — Automatic (recommended, do it once):**
Connect your Netlify site to the GitHub repo so every change auto-deploys.
- Netlify → your site `environmsafe-generators-daily` → **Site configuration → Build & deploy → Link repository** → choose `environmsafe-generators`.
- Set the publish file so `generator-readings.html` is served as the home page (ask Claude Code to add a tiny `netlify.toml` or rename the file to `index.html` in the repo).
- After this, every change Claude Code commits goes live in ~1 minute, automatically.

**Option B — Manual (what you do now):**
Download `generator-readings.html` from GitHub, drag-drop it on the Netlify Deploys page, tap "Rename and deploy".

---

## Important reminders (tell Claude Code these — they're also in CLAUDE.md)

- **Keep it ONE HTML file.** No build system. The deploy is drag-and-drop of a single file.
- **New Firestore collection → update `firestore-rules.txt` and publish it** in the Firebase console, or saving fails with "Could not save".
- **Everything bilingual** (Arabic default + English), and **mobile-first** (fits a phone screen).
- **Run the tests after every change** — all must show "0 failed".

---

## Honest expectations

- Claude Code runs in the cloud when used this way; it does NOT run by itself. It only acts when you message it, and you approve what it does.
- It changes the *code* well. Getting changes *live* still needs the deploy step (Option A makes that automatic).
- Publishing Firebase rules is still a manual console step (a few taps), for safety.

That's it. One-time setup, then you drive it from your phone like a chat.
