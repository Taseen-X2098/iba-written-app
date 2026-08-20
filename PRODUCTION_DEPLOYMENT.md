# Production Deployment and Configuration Runbook

Last validated: 2026-08-18

This runbook describes how to reproduce the production infrastructure for the
IBA Written application. It intentionally contains placeholders instead of real
credentials. Never commit production secrets to this repository.

## 1. Production architecture

The application uses:

- Supabase for authentication and the durable PostgreSQL database.
- Railway for two services from the same repository and branch:
  - `web`: the Next.js application and public API.
  - `grading-worker`: the private background grading service.
- Upstash Redis for drafts, caches, and locks.
- Z.ai GLM-OCR for handwriting extraction and OpenAI for AI grading.
- Firebase Cloud Messaging (FCM) for optional browser push notifications.
- Google Forms for the current plan, test-slot, and mentorship purchase requests.

bKash API checkout is future work and is not part of the current production
deployment.

The Railway services must be in the same Railway project and environment so
that private networking works.

## 2. Pre-deployment source control checks

Railway deploys commits from GitHub. It cannot see uncommitted changes or local
commits that have not been pushed.

This repository currently uses `master` as its production branch. Confirm the
branch before configuring Railway:

```powershell
git branch --show-current
git status -sb
git log --oneline origin/master..master
```

Before a release:

1. Commit the intended application changes.
2. Confirm no secret files are staged.
3. Push the production branch:

   ```powershell
   git push origin master
   ```

4. Confirm both Railway services are connected to the same repository and the
   `master` branch.

Do not commit `.env.local`, Firebase service-account JSON, Supabase service-role
keys, OpenAI keys, Redis tokens, or webhook secrets.

## 3. Create the production Supabase project

Use a separate Supabase project for production. Do not share production data or
credentials with local development or staging.

Choose a Supabase region close to the Railway service region. After creating
the project, record:

- Project reference.
- Project URL.
- Client-safe publishable/anon key.
- Server-only secret/service-role key.
- Database password, stored securely for migration and recovery operations.

The server-only key bypasses Row Level Security. It must never be placed in a
`NEXT_PUBLIC_` variable or exposed to browser code.

### 3.1 Apply database migrations

All SQL files in `supabase/migrations` must be applied in numeric order, from
`001_schema.sql` through `020_structured_learner_profiles.sql`. The migrations create
the schema, RLS policies, triggers, RPCs, grading queues, and production question
bank.

Use the Supabase CLI so the production migration history remains synchronized:

```powershell
npx supabase init
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push --dry-run
npx supabase db push
npx supabase migration list
```

Review the dry run before applying it. Do not use `db reset --linked` against
production, and do not use `--include-seed` on a production database.

After migrations, verify that these representative objects exist:

- Tables: `profiles`, `questions`, `exams`, `notifications`, `exam_attempts`,
  `grading_jobs`, `grading_job_items`, `student_profile_summaries`,
  `student_skill_state`, and `student_learning_events`.
- Functions: `public.is_admin()` and
  `public.record_student_learning_profile_update(...)`.
- Trigger: `on_auth_user_created`.
- RLS enabled on application tables.

### 3.2 Configure Supabase authentication URLs

In Supabase, open **Authentication → URL Configuration**.

Set:

```text
Site URL: https://YOUR_FINAL_WEB_DOMAIN
```

Add these exact redirect URLs:

```text
https://YOUR_FINAL_WEB_DOMAIN/auth/callback
https://YOUR_FINAL_WEB_DOMAIN/auth/callback?next=/reset-password
```

For a separate development Supabase project, local redirects may be added there:

```text
http://localhost:3000/**
```

Do not use broad production wildcards when exact callback URLs are available.

Keep Email/Password authentication enabled. The application expects signup
email confirmation and password-recovery email flows.

### 3.3 Configure production SMTP and email templates

The default Supabase mail service is not appropriate for production delivery.
Configure a custom SMTP provider under Supabase Authentication settings.

For Brevo, enter the SMTP host, port, login, SMTP key, verified sender address,
and sender name in Supabase. A local `BREVO_SMTP_KEY` or Railway variable has no
effect because the application does not send authentication email directly.

### 3.3.1 Account-update emails through the Brevo API

Plan activation and test-slot emails are sent directly by the application using
Brevo's Transactional Email API. Add these variables to the **web** service
(and to `.env.local` for local development):

```dotenv
# Brevo Dashboard → SMTP & API → API Keys. Use an API key, never an SMTP key.
BREVO_API_KEY=xkeysib-your-transactional-api-key

# This address must first be verified under Brevo → Senders, Domains & Dedicated IPs.
BREVO_SENDER_EMAIL=hello@YOUR_FINAL_WEB_DOMAIN
BREVO_SENDER_NAME=IBA Written
```

`NEXT_PUBLIC_SITE_URL` must also be set to the final HTTPS website URL; it is
used for the email buttons. The application sends a styled HTML email itself,
so no Brevo template ID is required. If you prefer to keep a visual copy in
the Brevo dashboard, create Transactional templates from
`email-templates/brevo-plan-activated.html` and
`email-templates/brevo-slots-added.html`.

When the Brevo variables are absent, plan and slot updates still succeed, but
the server logs that the notification was skipped. A Brevo delivery failure is
also logged and never reverses a successful payment or admin action.

Copy the HTML from `email-templates/` into the corresponding Supabase email
templates:

- Confirm signup: `email-templates/confirm-signup.html`
- Reset password: `email-templates/reset-password.html`
- Change email: `email-templates/change-email.html`
- Invite user: `email-templates/invite-user.html`
- Magic link: `email-templates/magic-link.html`
- Reauthentication: `email-templates/reauthentication.html`

Send real test emails to a non-team address before launch.

### 3.4 Create the first administrator

1. Sign up through the deployed application.
2. Confirm the administrator email.
3. Run this in the Supabase SQL Editor, replacing the email:

   ```sql
   update public.profiles p
   set is_admin = true
   from auth.users u
   where p.id = u.id
     and u.email = 'ADMIN_EMAIL@example.com';
   ```

4. Sign out and back in, then verify `/admin` access.

### 3.5 Understand the notification pipeline

There is no trigger that creates a notification when a row is inserted into
`profiles`. The existing automatic flow is:

```text
auth.users INSERT
  -> creates the corresponding profiles row

exam becomes published
  -> inserts notifications for eligible active subscribers

exam results become published
  -> inserts notifications for participating users

notifications INSERT
  -> Supabase Database Webhook calls the Railway web service
  -> web service reads that user's profiles.fcm_tokens
  -> Firebase sends the push notification
```

The `profiles` table is used during a manual notification test only to obtain a
valid `user_id` and to find the user's FCM device tokens.

## 4. Create Upstash Redis

Create a production Upstash Redis database and record its REST URL and REST
token:

```dotenv
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
```

Both Railway services need these variables. Redis is required in production;
without it, the application falls back to an in-memory development store that
is not shared or durable.

Use a separate Upstash database for staging.

## 5. Configure OpenAI

Create a server-side OpenAI API key with an appropriate project budget and
limits. Both Railway services need:

```dotenv
OPENAI_API_KEY=
OPENAI_VECTOR_IBA_WRITTEN=
USE_MOCK_GRADER=false
```

The web service also needs:

```dotenv
Z_AI_MOCK=false
Z_AI_API_KEY=
```

Z.ai authenticates this endpoint with one bearer API key; it does not require a
separate API ID. Keep `Z_AI_API_KEY` on the web service only.

## 6. Configure Firebase Cloud Messaging

This section is required only when browser push notifications are enabled.

In Firebase:

1. Create or select the production Firebase project.
2. Enable Cloud Messaging.
3. Create a Web Push certificate and copy its public VAPID key.
4. Create a Firebase Admin service-account private key.
5. Keep the downloaded service-account JSON out of Git.

Configure the Railway `web` service with:

```dotenv
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

The private key must remain server-only. When entered as one line, preserve the
literal `\n` sequences; the application converts them to newlines at runtime.

Confirm that the client configuration in `lib/firebase.ts`, the service worker
in `public/firebase-messaging-sw.js`, the VAPID key, and the Admin credentials
all refer to the same Firebase project.

## 7. Secure and create the Supabase push webhook

The webhook route at `app/api/webhooks/push/route.ts` rejects requests unless
the `x-supabase-signature` header matches `SUPABASE_WEBHOOK_SECRET`. Missing
configuration returns `503`; an absent or incorrect header returns `401`.

### 7.1 Generate and deploy the shared secret

Generate a 32-byte random secret locally:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Add the result only to the Railway `web` service:

```dotenv
SUPABASE_WEBHOOK_SECRET=GENERATED_64_CHARACTER_VALUE
```

Seal the Railway variable and redeploy `web` before enabling the webhook.

### 7.2 Confirm unauthorized requests are blocked

Run this without the secret header:

```powershell
Invoke-WebRequest `
  -Method POST `
  -Uri "https://YOUR_FINAL_WEB_DOMAIN/api/webhooks/push" `
  -ContentType "application/json" `
  -Body '{"type":"INSERT","table":"notifications","record":{}}' `
  -SkipHttpErrorCheck
```

Expected result: `401 Unauthorized`.

### 7.3 Create the Database Webhook in Supabase

The current dashboard location is:

**Integrations → Database Webhooks → Webhooks → Create a new hook**

The direct URL is:

```text
https://supabase.com/dashboard/project/YOUR_PROJECT_REF/database/hooks
```

If prompted, enable Database Webhooks. Create this hook:

```text
Name: push-notifications
Schema/Table: public.notifications
Event: INSERT only
Type: HTTP Request
Method: POST
URL: https://YOUR_FINAL_WEB_DOMAIN/api/webhooks/push
Timeout: 5000 ms
```

Add these HTTP headers:

```text
Content-Type: application/json
x-supabase-signature: THE_EXACT_SAME_GENERATED_SECRET
```

Do not add quotes, `Bearer`, or whitespace around the secret.

### 7.4 Test the notification webhook

Copy an existing UUID from `public.profiles.id`, then run:

```sql
insert into public.notifications (
  user_id,
  type,
  title,
  message
)
values (
  'REPLACE_WITH_A_REAL_PROFILE_UUID',
  'inactivity_reminder',
  'Webhook test',
  'The push-notification webhook is working.'
);
```

Verify the webhook received a `2xx` response and inspect Railway web logs. A
successful webhook may still send no device notification if that profile has no
valid FCM token.

## 8. Configure the current Google Forms payment flow

The current release does not use the bKash API. Create the three Google Forms,
make each form accessible to the intended customers, and add their complete
`https://docs.google.com/forms/...` URLs to the Railway `web` service:

```dotenv
PLAN_PAYMENT_FORM_URL=
SLOTS_PAYMENT_FORM_URL=
MENTORSHIP_FORM_URL=

BREVO_API_KEY=
BREVO_SENDER_EMAIL=
BREVO_SENDER_NAME=IBA Written
```

`PAYMENT_FORM_URL` is not read by the current application; use
`PLAN_PAYMENT_FORM_URL`.

After redeploying `web`, verify that the Subscribe, Buy Now, and Apply for
Mentorship buttons open the intended forms. Keep payment verification and account
activation manual until an API payment flow is intentionally implemented.

### Future bKash integration (not enabled)

The repository contains preliminary bKash routes, but they are not part of the
current production payment path. Do not configure bKash credentials or treat
`/api/bkash/*` as a live payment integration yet. Before enabling it later,
complete provider onboarding, sandbox testing, callback verification,
reconciliation, and a dedicated security review.

## 9. Create the Railway services

Create one Railway project with a `production` environment. Add the same GitHub
repository twice.

### 9.1 Web service

1. Create a service from the GitHub repository.
2. Rename it `web`.
3. Set the source branch to `master`.
4. Leave Root Directory blank or `/`.
5. Under Config as Code/Railway Config File, enter:

   ```text
   /railway.web.json
   ```

The checked-in configuration runs `npm run build`, starts with `npm run start`,
and health-checks `/api/health`.

### 9.2 Grading worker service

1. Add the same GitHub repository again in the same Railway project and
   environment.
2. Rename the service exactly `grading-worker`.
3. Set the source branch to `master`.
4. Leave Root Directory blank or `/`.
5. Under Config as Code/Railway Config File, enter:

   ```text
   /railway.worker.json
   ```

6. Do not generate a public domain or TCP proxy for this service.
7. Set:

   ```dotenv
   PORT=8080
   GRADING_CONCURRENCY=4
   ```

The worker exposes `/health` privately and accepts authenticated `POST /wake`
requests from the web service.

### 9.3 Connect web to the worker privately

Add this to the Railway `web` service:

```dotenv
GRADING_WORKER_URL=http://${{grading-worker.RAILWAY_PRIVATE_DOMAIN}}:8080
```

Use `http`, not `https`; the request remains inside Railway's private network.
Both services must be in the same Railway project and environment.

Generate a separate long random worker secret:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Set the exact same value on both services:

```dotenv
GRADING_WORKER_SECRET=
```

Do not reuse the push-webhook secret.

## 10. Railway variable reference

### 10.1 Required on `web`

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
NEXT_PUBLIC_SITE_URL=https://YOUR_FINAL_WEB_DOMAIN

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

OPENAI_API_KEY=
OPENAI_VECTOR_IBA_WRITTEN=
USE_MOCK_GRADER=false
Z_AI_MOCK=false
Z_AI_API_KEY=

GRADING_WORKER_URL=http://${{grading-worker.RAILWAY_PRIVATE_DOMAIN}}:8080
GRADING_WORKER_SECRET=

PLAN_PAYMENT_FORM_URL=
SLOTS_PAYMENT_FORM_URL=
MENTORSHIP_FORM_URL=
```

Add Firebase, webhook, and social-link variables only when those features are
enabled.

Optional web variables:

```dotenv
SUPABASE_WEBHOOK_SECRET=

# Required to send plan-activation and test-slot emails through Brevo.
BREVO_API_KEY=
BREVO_SENDER_EMAIL=
BREVO_SENDER_NAME=IBA Written

NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_CLIENT_EMAIL=
NEXT_PUBLIC_FIREBASE_VAPID_KEY=
FIREBASE_PRIVATE_KEY=

NEXT_PUBLIC_FB_PAGE_LINK=
NEXT_PUBLIC_FB_GROUP_LINK=
```

### 10.2 Required on `grading-worker`

```dotenv
PORT=8080
GRADING_CONCURRENCY=4

NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=

OPENAI_API_KEY=
OPENAI_VECTOR_IBA_WRITTEN=
USE_MOCK_GRADER=false

GRADING_WORKER_SECRET=
```

Railway supplies `RAILWAY_REPLICA_ID` automatically. Do not configure
`USE_MOCK_RAILWAY=true` in production; it is only used by the local development
launcher.

Use Railway shared/reference variables for values needed by both services, and
seal sensitive variables after entry.

## 11. Configure the public web domain

Only the `web` service receives a public domain.

In Railway, open **web → Settings → Networking → Public Networking** and either:

- Generate a Railway domain; or
- Add a custom domain and create both the CNAME and TXT records Railway shows.

After the final domain is verified:

1. Set `NEXT_PUBLIC_SITE_URL=https://YOUR_FINAL_WEB_DOMAIN` on `web`.
2. Redeploy `web` because `NEXT_PUBLIC_` values are embedded during the build.
3. Update Supabase Site URL and redirect URLs.
4. Update the Supabase push-webhook URL.

## 12. Deployment order

Use this order for a new environment or production release:

1. Create Supabase, Upstash, OpenAI, and optional Firebase resources, plus the
   three Google Forms used for current payment requests.
2. Apply Supabase migrations.
3. Configure Supabase Auth URLs, SMTP, and email templates.
4. Push the release commit to `origin/master`.
5. Configure and deploy `grading-worker`.
6. Verify its Railway deployment and `/health` health check.
7. Configure and deploy `web`.
8. Verify `https://YOUR_FINAL_WEB_DOMAIN/api/health` returns `{ "ok": true }`.
9. Configure the final Supabase callback URLs.
10. Deploy the webhook secret, verify unauthorized requests return `401`, then
    enable the Supabase Database Webhook.
11. Promote the first administrator.
12. Complete production acceptance tests.

Database migrations must complete before application code that depends on them
is rolled out. Do not run migrations independently from both Railway services,
because simultaneous migration jobs can race.

## 13. Production acceptance checklist

Run locally before releasing:

```powershell
npm run check
```

Run `supabase/tests/exam_reliability.sql` only against a disposable or staging
database. It deliberately creates test identities and records inside a rollback
transaction.

Verify all of the following:

- [ ] `npm run check` passes on the release commit.
- [ ] All Supabase migrations are applied.
- [ ] RLS is enabled and the service-role key is server-only.
- [ ] Signup creates a profile automatically.
- [ ] Signup confirmation returns through `/auth/callback`.
- [ ] Password reset returns through `/auth/callback?next=/reset-password`.
- [ ] Custom SMTP delivers to a real external address.
- [ ] Administrator authorization works.
- [ ] Web `/api/health` passes.
- [ ] Worker `/health` passes in Railway.
- [ ] One OCR request succeeds with mocks disabled.
- [ ] One grading job is queued, woken, processed, and completed.
- [ ] Redis-backed drafts survive a web-service restart.
- [ ] An unauthorized push-webhook call returns `401`.
- [ ] A real `notifications` insert produces a successful webhook delivery.
- [ ] FCM push reaches a registered browser, if push is enabled.
- [ ] Subscribe opens `PLAN_PAYMENT_FORM_URL`.
- [ ] Buy Now opens `SLOTS_PAYMENT_FORM_URL`.
- [ ] Apply for Mentorship opens `MENTORSHIP_FORM_URL`.
- [ ] Supabase backups/PITR and Railway spending alerts are configured.

## 14. Troubleshooting

### Railway says “There is no active deployment for this service”

This is a status, not the underlying error. It means the service has never
completed a successful deployment.

Check:

1. **Settings → Source** points to the correct repository.
2. Branch is `master`, not `main`.
3. Root Directory is blank or `/`.
4. Config file is `/railway.worker.json` or `/railway.web.json` as appropriate.
5. The commit exists on GitHub; `git status -sb` must not show the branch ahead.
6. The deployment's Build Logs contain the actual failure.
7. Required variables exist in the same Railway environment.
8. The worker has `PORT=8080` and no public domain is required.

Auto-deployment happens after a new commit is pushed to the branch connected to
that service. Local commits and uncommitted changes do not trigger Railway.

### Worker health check fails after a successful build

Open the Deploy Logs, not only the Network status. If the logs show
`Cannot find module 'server-only'`, the standalone worker has imported a Next.js-
only module and exited before binding `PORT`. Worker dependency paths must use
`lib/supabase/admin.ts` and `lib/api/api-error.ts`; do not import
`lib/supabase/server.ts` or `lib/api/errors.ts` from worker-shared code. After
pushing the corrected commit, redeploy and confirm `/health` returns HTTP 200.

### Worker is healthy but jobs remain queued

Check:

- `GRADING_WORKER_URL` uses the private Railway domain and port `8080`.
- `GRADING_WORKER_SECRET` is identical on both services.
- Both services are in the same Railway project and environment.
- `OPENAI_API_KEY`, Supabase variables, and Upstash variables exist on the worker.
- Web logs do not show “Failed to wake grading worker”.
- Worker logs show it claimed and processed grading items.

### Supabase webhook returns 401

The `x-supabase-signature` header does not exactly match the Railway
`SUPABASE_WEBHOOK_SECRET`. Remove quotes, `Bearer`, trailing spaces, and newline
characters, then redeploy the web service.

### Supabase webhook returns 503

`SUPABASE_WEBHOOK_SECRET` is missing from the Railway `web` service or the service
has not been redeployed since adding it.

### Webhook succeeds but no push appears

Check that:

- The target profile has at least one value in `profiles.fcm_tokens`.
- Notification permission is granted in the browser.
- The VAPID key and Firebase configuration refer to the same Firebase project.
- The Firebase Admin private key is correctly escaped.
- Railway logs do not show an FCM send failure.

### Auth redirects to localhost or an old Netlify address

Set the final production value in both places:

- Railway `web`: `NEXT_PUBLIC_SITE_URL`.
- Supabase Authentication: Site URL and Redirect URLs.

Redeploy `web` after changing `NEXT_PUBLIC_SITE_URL`.

### Real OCR or grading fails immediately

Confirm:

```dotenv
USE_MOCK_GRADER=false
Z_AI_MOCK=false
Z_AI_API_KEY=VALID_Z_AI_KEY
OPENAI_API_KEY=VALID_PRODUCTION_KEY
OPENAI_VECTOR_IBA_WRITTEN=vs_VALID_RUBRIC_STORE_ID
```

Verify the Z.ai account has API quota and the OpenAI project has billing, quota,
and access to the configured grading model and rubric vector store.

## 15. Secret rotation and operational rules

- Keep separate secrets for worker wake authentication and push-webhook
  authentication.
- Rotate a secret in all consumers before removing the old value when possible.
- Never print credentials or complete private keys in application logs.
- Seal Railway secrets.
- Use separate production, staging, and development Supabase/Upstash resources.
- Restrict Supabase and Railway dashboard access and require MFA.
- Review service logs, database webhook history, API usage, and budgets after each
  release.
- When bKash API work starts later, reconfirm PRA/API eligibility, limits, fees,
  and endpoint versions with bKash before enabling it.
