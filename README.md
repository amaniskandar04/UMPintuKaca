# UM Reviews

An anonymous course, programme, and club review app for Universiti Malaya students, delivered as a Telegram Mini App with a Telegram bot.

Students verify once with their `@siswa.um.edu.my` Google account, then rate courses by course code and degree programmes across categories such as job opportunities, facilities, difficulty, teaching quality, and workload. Reviews are published under a random animal alias.

This repository is an MVP scaffold. The API, database schema, moderation flow, admin queue, and Mini App are implemented and verified locally. Google OAuth and Telegram deployment require your own credentials.

UM Reviews is an independent student project. It is not affiliated with or endorsed by Universiti Malaya. Reviews are student opinions, not official information.

## What is included

- Telegram Mini App built with React, Vite, TypeScript, and Tailwind.
- Cloudflare Worker API built with Hono and grammY.
- Cloudflare D1 schema, migrations, and seed data.
- Telegram `initData` validation and short-lived JWT sessions.
- Google OAuth verification restricted to `@siswa.um.edu.my`.
- Anonymous per-target aliases generated with HMAC.
- Course, degree programme, club, and campus place reviews with configurable dimensions.
- Course review text gated behind two written course reviews in a rolling 60-day window; ratings stay public. The first-run flow asks for those two reviews directly.
- Fuzzy, typo-tolerant search with acronym and alias matching, plus advanced filters such as `code:`, `faculty:`, `category:`, and `-exclusion`.
- Materialised rating aggregates for cheap reads on the D1 free tier.
- Helpful votes, private points, ten levels, and public badges with an opt-out.
- Automatic moderation flags for profanity, spam, links, PII, named individuals, threats, and harsh language.
- User reports, auto-hide threshold, admin queue, approve/hide/remove actions, bans, and an audit log.
- Development login so the app runs without Telegram or Google credentials.
- Seed catalog for 2,849 Semester 1 2026/2027 modules and 2,700 Semester 2 2025/2026 modules (4,636 unique codes), 268 degree, diploma, and foundation programmes, 172 student organisations, and 113 curated campus places.

## Architecture

```
Telegram client
  ├─ bot webhook ──────────────> Cloudflare Worker (Hono + grammY)
  └─ Mini App (Pages) ─fetch──> Cloudflare Worker
                                    ├─ /api/auth      Telegram + Google OAuth
                                    ├─ /api/courses   catalogue and stats
                                    ├─ /api/reviews   create/edit/report
                                    ├─ /api/admin     moderation queue
                                    ├─ /telegram/*    bot webhook
                                    └─ D1 (SQLite)
```

- The Mini App is static and hosted on Cloudflare Pages.
- The Worker handles the API, the Telegram webhook, and the Google OAuth callback.
- D1 stores users, identities, reviews, scores, stats, reports, bans, audit entries, votes, rewards, badges, clubs, and campus places.
- Google OAuth is the primary verification path. Email OTP is intentionally not implemented, so no email-sending service or sender domain is required.
- A scheduled Worker job cleans expired OAuth states, old rate-limit rows, and unverified accounts.

## Quick start (local)

Requirements: Node.js 20 or newer, npm.

```powershell
npm install
npm run db:migrate
npm run db:seed
npm run db:seed:courses:s2
npm run db:seed:programs
npm run db:seed:clubs
npm run db:seed:places
npm run db:seed:demo
```

Start the API in one terminal:

```powershell
npm run dev:api
```

Start the Mini App in another terminal:

```powershell
npm run dev:web
```

Open `http://localhost:5173` and choose **Continue as dev admin**. The dev account is marked verified and has admin access, so you can test reviews and the moderation queue without Telegram or Google.

The local API runs at `http://localhost:8787`. The Vite dev server proxies `/api` to it.

`npm run dev:api` automatically creates `apps/api/.dev.vars` on first run through the `predev:api` script. You can also run `node scripts/gen-dev-vars.mjs` manually. The file contains generated local secrets and is gitignored. Telegram and Google features require real values in that file.

## Seed data

`npm run db:seed` inserts:

- Course, programme, and club rating dimensions.
- Three bootstrap degree programmes: BCS, BIT, BSE.
- 2,849 UM module codes for Semester 1, 2026/2027 (scraped from UM TimeEdit, `2026/S1`).

`npm run db:seed:courses:s2` adds 2,700 UM module codes for Semester 2, 2025/2026 from UM TimeEdit (`2025/S2`). Combined, the two semesters cover 4,636 unique codes; 913 modules run in both. The seed only adds codes not already in the catalogue.

Both course lists are **event-verified**: a module is included when UM TimeEdit holds actual timetable reservations for it inside that semester's date window, not merely when its `Year + Period` metadata mentions the semester. The metadata field is empty for roughly 78% of the catalogue, and relying on it undercounted Semester 2 2025/2026 by 8x (306 codes instead of 2,700). Datasets are `data/um_s1_2026_2027_subjects_events.json` and `data/um_s2_2025_2026_subjects_events.json`, summaries in `data/um_subjects_2026_events_summary.json`.

To refresh them, log into TimeEdit and run:

```powershell
npm run sdk:scrape
node scripts/build-course-seed.mjs --subjects=data/um_s1_2026_2027_subjects_events.json --out=data/um_s1_2026_2027_courses_seed.sql --seed=apps/api/seed/seed.sql --label="26/27, Semester 1"
node scripts/build-course-seed.mjs --subjects=data/um_s2_2025_2026_subjects_events.json --out=data/um_s2_2025_2026_courses_seed.sql --seed=apps/api/seed/courses_s2.seed.sql --label="25/26, Semester 2"
```

`sdk:scrape` opens a real Chrome window and waits for the UM SSO login, then harvests `ri.json` reservations for both semester windows. Progress is checkpointed in `data/.sdk-events-state.json`, so an interrupted run resumes instead of restarting. `build-course-seed.mjs` writes 200-row batched INSERTs and splices the courses block into the existing seed file, leaving the dimensions and programmes blocks intact.

The course catalogue is bundled with the Worker as a generated module (`apps/api/src/data/courses.generated.json`, built by `scripts/build-course-seed.mjs --index-only`). Search ranks that in-memory list, then fetches review aggregates only for the ~50 matched courses in a single D1 query. Regenerate the index whenever the catalogue changes, or search will drift from the database.

Each course carries pre-normalised search text, computed once when the module loads, so ranking never re-normalises names per query. `getFaculties()` and `getDimensions()` are cached per isolate for ten minutes because both were previously re-read on every app open; the faculty list also canonicalises casing and abbreviations at query time, since reseeding rewrites those values from dumps that disagree.

**Deploying code-only changes:** `npm run deploy` only ships code. It applies pending migrations, then seeds the catalogue **only if the `courses` table is empty** (or when you pass `--seed`), so a normal deploy costs zero D1 writes. When the seed data itself changes, run `npm run deploy:seed`:

```powershell
npm run deploy        # code only; seeds only on a brand-new database
npm run deploy:seed   # code plus all five seed files
```

Without the script, the equivalent direct commands are:

```powershell
npx wrangler deploy -c apps/api/wrangler.production.toml
npx wrangler pages deploy apps/web/dist --project-name um-reviews --branch main
```
 `getFaculties()` still lists faculties from the `targets` table.



### Automated subject extraction

`npm run extract:subjects` reads a full TimeEdit catalogue dump and writes the subjects for Semester 1, 2026/2027 (`2026/S1`, shown as **26/27, Semester 1**) and Semester 2, 2025/2026 (`2025/S2`, shown as **25/26, Semester 2**) in one pass. Together these cover February 2026 through February 2027. It writes `data/um_subjects_2026.json` and `data/um_subjects_2026.csv` (combined, with `semesters` and `periods` columns), per-semester files `data/um_s1_2026_2027_subjects_timeedit.json/.csv` and `data/um_s2_2025_2026_subjects_timeedit.json/.csv`, per-semester SQL seeds, and `data/um_subjects_2026_summary.json`. Change the targets with `--periods=2026/S1,2025/S2` or point at another dump with `--raw=<file>`. By default it uses `data/timeedit_catalog_raw.json`, then `data/timeedit_s1_2026_2027_raw.json`, then an SDK `course_events_with_details.json` export.

`npm run fetch:catalog` is a Node port of `main.js` from [damnitjoshua/um-timetable-sdk](https://github.com/damnitjoshua/um-timetable-sdk), using the same `objects.html` enumeration and `objects/{id}/o.json` details. The SDK itself is a browser-console scraper and needs a logged-in UM TimeEdit session; unauthenticated requests return HTTP 412. Supply the browser cookie with `--cookie="..."`, a `.timeedit-cookie` file (gitignored), or the `TIMEEDIT_COOKIE` environment variable, then run `npm run refresh:subjects` to fetch and extract back to back. The committed raw dump means `extract:subjects` works without credentials.

`npm run db:seed:programs` replaces the bootstrap programmes with 268 programmes from the official UM catalogue: 5 foundation, 15 diploma, 80 undergraduate, and 168 postgraduate programmes. The 80 undergraduate programmes include the Faculty of Law's external `Bachelor of Jurisprudence (External)`, which is not listed on the Study@UM faculty pages. The generated dataset is `data/um_programs.json`, the CSV is `data/um_programs.csv`, and the source audit is `data/um_programs_report.json`. Rerun `npm run mine:programs` to refresh it.

`npm run db:seed:demo` adds four sample reviews and their rating aggregates. The course catalogue is sourced from UM TimeEdit for 2026/2027 Semester 1 and 2025/2026 Semester 2; the programme catalogue is sourced from the UM study website.

`npm run db:seed:clubs` seeds 172 student organisations. The primary source is the Suara Siswa UM Clubs & Societies Information Hub spreadsheet, covering faculty societies, social and religious groups, development, entrepreneurship, sports, state associations, residential colleges, activism, campus politics, national politics, and faculty student unions. Legacy entries are retained only when they have a verified Instagram or LinkedIn organisation page; the allowlist is `data/clubs/extras.json`, 33 such entries are included, and 20 were dropped. Instagram and LinkedIn handles are stored in `metadata_json`. The generated dataset is `data/um_clubs.json`, with coverage and dropped-entry details in `data/um_clubs_report.json`.

`npm run db:seed:places` seeds 113 curated UM campus places. Coverage includes faculty and academy libraries, all faculties and PASUM, residential colleges, museums, selected faculty cafes and food outlets, convenience stores, health services, sports facilities, faith spaces, transport and student services. The dataset is `data/um_places.json`; the source list is `data/campus/curated.mjs`. Edit the curated list and rerun `npm run mine:campus` to regenerate the JSON, CSV, report, and SQL seed.

## Telegram setup

1. Create a bot with [@BotFather](https://t.me/BotFather) using `/newbot`.
2. Put the token in `apps/api/.dev.vars` as `TELEGRAM_BOT_TOKEN`.
3. Set `TELEGRAM_WEBHOOK_SECRET` to a random value. `gen-dev-vars.mjs` generates one.
4. Deploy the Worker or expose it through a tunnel. Telegram webhooks must be HTTPS.
5. Register the webhook:

```powershell
node scripts/set-webhook.mjs https://your-worker.workers.dev/telegram/webhook
```

6. Set `WEB_APP_URL` to the HTTPS URL of the Mini App.
7. Set `BOT_USERNAME` to your bot username without `@`.
8. In BotFather, configure the menu button or use the bot's existing **Open UM Reviews** button. The bot sends a `web_app` button when `WEB_APP_URL` starts with `https://`.

The bot commands are `/start`, `/app`, `/help`, `/myreviews`, `/rewards`, `/privacy`, `/guidelines`, `/report`, and `/deleteaccount`.

Telegram Mini Apps require HTTPS. For local bot testing, use a tunnel such as Cloudflare Tunnel or ngrok and point `WEB_APP_URL` at the tunnel URL.

## Google OAuth setup

SiswaMail is Google Workspace, so verification uses Google OAuth rather than a password form.

1. Create a Google Cloud project.
2. Configure the OAuth consent screen:
   - User type: External.
   - Scopes: `openid`, `email`, `profile` only. Do not request Gmail, Drive, or offline access.
   - Publish the app. Basic identity scopes do not require the sensitive-scope verification process.
3. Create an OAuth client of type **Web application**.
4. Add an authorised redirect URI:
   - Local: `http://localhost:8787/api/auth/google/callback`
   - Production: `https://your-worker.workers.dev/api/auth/google/callback`
5. Set these values in `apps/api/.dev.vars` or as Worker secrets:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
   - `GOOGLE_REDIRECT_URI`
   - `ALLOWED_EMAIL_DOMAINS=siswa.um.edu.my`
   - `BOT_USERNAME` and `WEB_APP_URL` so the callback can return users to Telegram.

The callback validates the Google ID token issuer, audience, `email_verified`, and either the `hd` claim or the email domain. It stores only Google's opaque `sub` and an HMAC of the email for duplicate detection. The email address is not stored.

To test the full Google flow locally, log in with the dev account, open **Verify**, and use **Dev: reset verification to test Google sign-in**. The dev account starts verified, so this button clears the dev verification and shows the SiswaMail button.

### Important OAuth caveats

- **UM may block unapproved third-party apps.** Test with a real `@siswa.um.edu.my` account before building further. If you receive `admin_policy_enforced` or `access_not_configured`, UM's Workspace administrator must allowlist the OAuth client. Ask UM IT before launch. Email OTP is not included in this build; it would be the fallback if OAuth cannot be approved.
- **Google OAuth is blocked in many embedded webviews.** The app opens the OAuth URL in the external browser or Telegram's in-app browser. The callback redirects to `https://t.me/<bot>?startapp=verified` to return to the app. Test this round trip on both iOS and Android.
- **Google may reject `workers.dev` or `pages.dev` as an authorised domain.** If the consent screen refuses the domain, use a cheap custom domain for the Worker and Mini App. This is the only likely non-zero cost.
- **Never collect SiswaMail passwords.** The app must not ask users to type their university password. Use the Google consent screen only.

## Environment variables

API (`apps/api/.dev.vars` locally, Worker secrets in production):

| Variable | Purpose |
| --- | --- |
| `ENVIRONMENT` | `development` or `production`. Production disables dev login and dev verification. |
| `DEV_AUTH_BYPASS` | `true` enables the local dev login. Must be `false` in production. |
| `TELEGRAM_BOT_TOKEN` | BotFather token. |
| `TELEGRAM_WEBHOOK_SECRET` | Shared secret checked on the Telegram webhook. |
| `JWT_SECRET` | Signs short-lived session tokens. At least 16 characters. |
| `GOOGLE_CLIENT_ID` | Google OAuth web client ID. |
| `GOOGLE_CLIENT_SECRET` | Google OAuth web client secret. |
| `GOOGLE_REDIRECT_URI` | Must exactly match the Google console redirect URI. |
| `BOT_USERNAME` | Bot username without `@`. Used for the OAuth return deep link. |
| `WEB_APP_URL` | HTTPS Mini App URL, used for bot buttons and OAuth fallback. |
| `WEB_ORIGIN` | Comma-separated allowed CORS origins, e.g. the Pages URL. |
| `EMAIL_HMAC_PEPPER` | Secret pepper for the email HMAC. |
| `ALIAS_PEPPER` | Secret pepper for anonymous aliases. |
| `OAUTH_ENC_KEY` | Encrypts the short-lived PKCE verifier in D1. |
| `ADMIN_TELEGRAM_IDS` | Comma-separated Telegram numeric IDs granted the admin role at login. |
| `ALLOWED_EMAIL_DOMAINS` | Comma-separated allowed domains. Defaults to `siswa.um.edu.my`. |
| `AUTO_HIDE_REPORT_THRESHOLD` | Distinct reports before a published review is auto-hidden. Default `3`. |

Web (`apps/web/.env` or build environment):

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Worker API base URL. Leave empty in local development to use the Vite proxy. |

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev:api` | Start the Worker locally on port 8787. |
| `npm run dev:web` | Start the Vite Mini App on port 5173. |
| `npm run typecheck` | Build shared types, then typecheck API and web. |
| `npm run build` | Build the shared package and production Mini App. |
| `npm run db:migrate` | Apply D1 migrations locally. |
| `npm run db:seed` | Seed dimensions, bootstrap programmes, and Semester 1 courses locally. |
| `npm run db:seed:courses:s2` | Add Semester 2 2025/2026 courses locally. |
| `npm run db:seed:programs` | Replace bootstrap programmes with the full UM programme catalogue locally. |
| `npm run db:seed:clubs` | Seed the club and society catalogue locally. |
| `npm run db:seed:places` | Seed the curated campus places catalogue locally. |
| `npm run mine:programs` | Rebuild the programme dataset from official `study.um.edu.my` pages. |
| `npm run mine:courses:s2` | Rebuild the Semester 2 2025/2026 course dataset from the saved TimeEdit catalogue. |
| `npm run extract:subjects` | Extract 2026/S1 and 2025/S2 subjects from a saved TimeEdit catalogue dump. |
| `npm run fetch:catalog` | Fetch a fresh TimeEdit catalogue dump (needs a logged-in `TIMEEDIT_COOKIE`). |
| `npm run refresh:subjects` | Fetch a fresh catalogue, then extract the subject datasets. |
| `npm run mine:clubs` | Rebuild the club dataset from the Suara Siswa UM sheet and retained extras. |
| `npm run mine:campus` | Rebuild the curated campus places dataset from `data/campus/curated.mjs`. |
| `npm run db:seed:demo` | Add sample reviews locally. |
| `npm run webhook:set -- <url>` | Register the Telegram webhook. |

Remote database commands are available inside `apps/api`:

```powershell
npm run db:migrate:remote -w @um-reviews/api
npm run db:seed:remote -w @um-reviews/api
npm run db:seed:courses:s2:remote -w @um-reviews/api
npm run db:seed:programs:remote -w @um-reviews/api
npm run db:seed:clubs:remote -w @um-reviews/api
npm run db:seed:places:remote -w @um-reviews/api
```

## One-command deployment

`scripts/deploy.mjs` automates the Cloudflare side of the deployment. It will:

- Find your Cloudflare account and `workers.dev` subdomain.
- Create or reuse the D1 database and Pages project.
- Patch the D1 database ID in `wrangler.toml`.
- Generate production secrets if `deploy.env` does not have them.
- Deploy the Worker, upload secrets, apply migrations, and seed the catalogue the first time (later deploys skip seeding unless you run `npm run deploy:seed`).
- Build and deploy the Mini App with the correct API URL.
- Set the Telegram webhook, menu button, commands, and descriptions.
- Print the Google OAuth redirect URI you need to add.

Prerequisites:

1. A Cloudflare account and an API token with these permissions:
   - Account Settings: Read
   - Workers Scripts: Edit
   - D1: Edit
   - Cloudflare Pages: Edit
2. A Telegram bot created with `@BotFather`.
3. A Google OAuth **Web application** client with scopes `openid`, `email`, and `profile`.
4. Your numeric Telegram ID from `@userinfobot`.

Fill `deploy.env` (already created and gitignored). The only required values are:

```env
CLOUDFLARE_API_TOKEN=...
CLOUDFLARE_ACCOUNT_ID=...
TELEGRAM_BOT_TOKEN=...
TELEGRAM_BOT_USERNAME=...
TELEGRAM_ADMIN_IDS=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

Optional values default to:

```env
CLOUDFLARE_WORKER_NAME=um-reviews-api
CLOUDFLARE_PAGES_PROJECT=um-reviews
D1_DATABASE_NAME=um_reviews
D1_LOCATION=apac
ALLOWED_EMAIL_DOMAINS=siswa.um.edu.my
AUTO_HIDE_REPORT_THRESHOLD=3
```

Then:

```powershell
npm run deploy:dry
npm run deploy
```

`deploy:dry` validates the file without touching Cloudflare. `npm run deploy` performs the real deployment and writes `deploy.outputs.json` with the final URLs.

After it finishes:

1. Add the printed redirect URI to the Google OAuth client:
   ```text
   https://<worker>.workers.dev/api/auth/google/callback
   ```
2. Open Telegram, send `/start` to your bot, open the Mini App, and verify with your SiswaMail account.
3. If Google sign-in is blocked by UM, you will see `admin_policy_enforced` or `access_not_configured`. UM IT must allowlist the OAuth client before launch.

The script does not create the Telegram bot or the Google OAuth client because those require your accounts. Everything after that is automated.

## Manual deployment (fallback)

1. Create the D1 database:

```powershell
npx wrangler d1 create um_reviews
```

2. Put the returned `database_id` into `apps/api/wrangler.toml`.
3. Set the production variables in `[vars]` and add secrets:

```powershell
cd apps/api
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put JWT_SECRET
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put OAUTH_ENC_KEY
npx wrangler secret put EMAIL_HMAC_PEPPER
npx wrangler secret put ALIAS_PEPPER
```

4. Apply migrations and seed the remote database:

```powershell
npx wrangler d1 migrations apply um_reviews --remote
npx wrangler d1 execute um_reviews --remote --file=seed/seed.sql
npx wrangler d1 execute um_reviews --remote --file=seed/courses_s2.seed.sql
npx wrangler d1 execute um_reviews --remote --file=seed/programs.seed.sql
```

5. Deploy the Worker:

```powershell
npx wrangler deploy
```

6. Build and deploy the Mini App to Pages:

```powershell
cd ../web
$env:VITE_API_BASE_URL = "https://your-worker.workers.dev"
npm run build
npx wrangler pages deploy dist --project-name um-reviews
```

7. Update the Worker variables:
   - `ENVIRONMENT=production`
   - `DEV_AUTH_BYPASS=false`
   - `WEB_ORIGIN=https://your-pages-project.pages.dev`
   - `WEB_APP_URL=https://your-pages-project.pages.dev`
   - `BOT_USERNAME=your_bot_username`
   - `GOOGLE_REDIRECT_URI=https://your-worker.workers.dev/api/auth/google/callback`
   - `ADMIN_TELEGRAM_IDS=<your numeric Telegram ID>`

8. Update the Google OAuth client redirect URI and authorised origins to the production URLs.
9. Register the webhook and set the bot menu button to the Mini App URL.

## Free-tier and cost notes

The stack is designed to fit Cloudflare's free tier:

| Resource | Free allowance | Notes |
| --- | --- | --- |
| Workers | 100,000 requests/day, 10 ms CPU | The API is small; the first paid step is about $5/month. |
| D1 | 5M rows read/day, 100k rows written/day, 5GB | Stats are materialised; indexes are kept minimal. |
| Pages | Static requests unlimited | The Mini App is static. |
| Google OAuth | Free for basic identity scopes | No email-sending service. |
| Telegram Bot API | Free | No per-message cost. |
| Domain | Optional | Only needed if Google rejects `workers.dev`/`pages.dev`. |

The main free-tier risks are D1 write limits during a launch spike and Workers request limits under heavy traffic. If the app grows, Cloudflare Workers Paid is about $5/month and removes the request cap. Google-OAuth-only verification avoids the 100–300 emails/day limits of free transactional email providers.

## Anonymity model

- Public responses never include Telegram IDs, Google identifiers, email HMACs, or user IDs.
- Each review gets a deterministic alias scoped to `user + target`, so the same student keeps a stable alias within one course but cannot be correlated across courses.
- The database stores `telegram_id` for bot identity and Google's opaque `sub` plus an email HMAC for verification and duplicate detection.
- No plaintext email, name, phone number, student ID, or Telegram username is stored.
- The operator and a database compromise can technically link a review to an account. The app discloses this limitation and restricts admin access. Stronger unlinkability would require blind credentials or a separate identity service, which is not part of this MVP.
- Account deletion removes the user's reviews, clears the identity row, invalidates sessions, and tombstones the user row so content cannot be re-linked.
- Points are private. Users may show their level and badges on reviews; the setting can be turned off in the rewards page. Helpful votes do not expose who voted.

## Review access

Written course reviews are earned, not free. A student can read the text of course reviews only once they have posted **two written course reviews within the last 60 days**. The window rolls continuously rather than following the calendar, so a review stops counting 60 days after it was written.

A review only qualifies if it carries a written note of at least 20 characters. Two star-only taps do not unlock reading — otherwise the gate could be cleared in seconds without contributing anything. The `/onboarding` screen turns this requirement into the first-run flow: it asks for two courses and links straight to the review form.

The rules live in `getCourseReviewAccess()` in `apps/api/src/db/queries.ts` (`COURSE_REVIEW_ACCESS_REQUIRED`, `COURSE_REVIEW_ACCESS_WINDOW_DAYS`, `COURSE_REVIEW_ACCESS_MIN_BODY`) and are exposed at `GET /api/reviews/access` so the home screen and onboarding can show progress.

What stays open:

- Average ratings, per-category scores, and review counts are visible to everyone, locked or not.
- Writing a review is never blocked — students review courses whether or not they can read other reviews.
- Programme, club, and campus reviews are not gated.

What counts toward the two: published and pending course reviews written by the viewer. Deleted, hidden, and removed reviews do not count, so losing one re-locks the account immediately. Admins bypass the gate.

The rule lives in `getCourseReviewAccess()` in `apps/api/src/db/queries.ts`, which returns a `reviewAccess` object on every course detail response. Enforcement is server-side — a locked response carries an empty `reviews` array, so the text cannot be read by calling the API directly. The expiry timestamp (`unlocksAt`) tells the client when the oldest counted review ages out.

## Moderation

On submission, the API normalises text and flags:

- Profanity (English and Malay).
- Spam, links, advertising, repeated characters, and all-caps text.
- Email addresses, phone numbers, IC-like numbers, and long digit strings.
- Named individuals such as `Dr Smith` or `lecturer Smith`.
- Threatening language.
- Harsh or potentially defamatory language.
- Very short low-effort text.

Reviews with serious flags are stored as `pending` and shown only to their author. Clean reviews are published immediately. Only profanity, spam, links, possible personal information, named individuals, and threats hold a review. Harsh or negative language is flagged for the admin queue but publishes straight away, so legitimate criticism is never hidden. Reports create a moderation queue entry, and enough distinct reports auto-hide a published review until an admin acts. Admins can approve, hide, remove, ban the author, and resolve reports. All admin actions are written to `audit_log`.

## Rewards

Verified students can mark published reviews as helpful. Helpful votes are anonymous, limited to one per user per review, and cannot be cast on your own review.

Points are private and based only on published contributions:

| Contribution | Points |
| --- | ---: |
| Rating-only review | 1 |
| Written review, body at least 20 characters | 10 |
| Review body over 200 characters | 20 total |
| Helpful vote received | 2 |
| Course question asked | 2 |
| Course question answered | 5 |

Answers earn more than questions because answering is the contribution that actually helps people. Q&A points are recomputed from published rows, so deleting an answer removes its points.

Points map to ten levels from 0 to 800. Level 10 equals 40 long reviews, though helpful votes can accelerate progress. Hidden and deleted reviews lose their points.

Badges cover review milestones, course/club coverage, helpful votes, categories, target-first reviews, and levels. Users can choose up to three badges to display on reviews, and can show or hide their level and badges entirely. There is no public leaderboard; admins have an internal leaderboard and can adjust points with an audit entry.

The app supports dark, light, ocean, cutesy, and gold-premium themes. Dark and light are always available; ocean unlocks at level 3, cutesy at level 6, and gold premium at level 10. The unlock levels live in `REWARD_THEME_LEVELS` in the shared package, so the API and the picker cannot disagree, and a stored theme is clamped to the user's level on read.

## Database overview

- `users`: Telegram identity, role, status, session version.
- `identities`: Google `sub` and email HMAC.
- `oauth_states`: one-time OAuth state and encrypted PKCE verifier.
- `programs`, `courses`: catalogue.
- `entities`, `targets`: generic review targets (clubs and campus facilities/services).
- `dimensions`: configurable rating categories per target type.
- `reviews`, `review_scores`: content and ratings.
- `review_votes`: anonymous helpful votes.
- `user_rewards`, `user_badges`, `badges`, `reward_adjustments`: points, levels, badges, and admin adjustments.
- `review_stats`: materialised aggregates.
- `reports`: user reports.
- `bans`: posting restrictions.
- `audit_log`: moderation actions.
- `rate_limits`: fixed-window counters.
- `user_activity`: one row per user per day (Malaysia time) for the admin dashboard. The first app open of the day writes one row; later opens are a primary-key lookup. Pruned after 90 days by the nightly job.

## Known limitations and next steps

- Google OAuth and Telegram deployment have not been exercised in this environment because they require external credentials. Run the OAuth spike before launch.
- The programme catalogue covers 268 programmes from official UM study and faculty pages, grouped into foundation, diploma, undergraduate, and postgraduate levels, including the Faculty of Law's external Bachelor of Jurisprudence. UM changes programme offerings and names periodically; rerun `npm run mine:programs` and review `data/um_programs_report.json` each intake.
- The course catalogue is scraped from UM TimeEdit for Semester 1 2026/2027 and Semester 2 2025/2026 and is event-verified (2,849 and 2,700 codes). Refresh it by logging into TimeEdit, running `npm run sdk:scrape` for the current windows, then `node scripts/build-course-seed.mjs` for each semester. TimeEdit purges old periods eventually, so a semester should be captured before its data ages out.
- The club catalogue covers 172 student organisations from the Suara Siswa UM spreadsheet plus 33 legacy entries with verified social pages. UM does not publish the authoritative Registrar of Student Bodies register, so coverage is not provably exhaustive. The sheet is a recent community-maintained list; review it each semester and rerun `npm run mine:clubs`.
- The campus catalogue is intentionally curated to 113 UM places. Edit `data/campus/curated.mjs` and rerun `npm run mine:campus` after verifying any changes; opening hours, vendors, and outlets change without notice.
- Verification proves UM affiliation, not that a student actually took a specific course. Reviews are self-reported.
- No image uploads, replies, direct messages, or lecturer reviews by design.
- No automated test suite yet. Typechecking and the production web build pass, and the core API flows were exercised locally with the dev login.
- Possible next steps: official catalogue import, English/Malay localisation, saved courses, admin analytics, appeal workflow, and a stronger blind-credential anonymity design.

## Disclaimer

This project is not affiliated with Universiti Malaya. It does not process or store SiswaMail passwords. Users should never enter their university password into this bot or any third-party app.
