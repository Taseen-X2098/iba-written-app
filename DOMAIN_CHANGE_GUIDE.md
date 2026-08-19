# Domain Change Guide

Last reviewed: 20 August 2026

This guide covers every domain-related place currently used by the IBA Written
application, including Railway, Supabase Auth, the Supabase push webhook,
Firebase Cloud Messaging, and the future bKash callback.

Use it when replacing a temporary address such as a Railway or Netlify domain
with a permanent custom domain.

## 1. Decide the final addresses first

Choose one canonical public origin. Examples:

```text
Canonical origin: https://ibawritten.com
Canonical host:   ibawritten.com
Optional alias:   https://www.ibawritten.com
```

Rules:

- Use `https://` in production.
- Do not include a path.
- Store `NEXT_PUBLIC_SITE_URL` without a trailing slash. The application adds
  paths such as `/auth/callback` itself.
- Decide whether the root domain or `www` version is canonical. If both should
  work, attach both to Railway and redirect one to the other.
- Only the Railway `web` service receives a public domain. The grading worker
  must remain private.

Throughout this guide, replace these placeholders:

```text
NEW_ORIGIN=https://ibawritten.com
NEW_HOST=ibawritten.com
OLD_ORIGIN=https://old-address.example
```

## 2. Complete change inventory

| Location | What must change | Required? |
| --- | --- | --- |
| Domain registrar or DNS provider | Railway-provided CNAME/ALIAS and TXT verification records | Yes |
| Railway `web` service networking | Add the custom domain and wait for SSL | Yes |
| Railway `web` variables | `NEXT_PUBLIC_SITE_URL=https://NEW_HOST` | Yes |
| Railway deployment | Redeploy `web` after changing the public variable | Yes |
| Supabase Auth URL Configuration | Site URL and the two application redirect URLs | Yes |
| Supabase Database Webhook | Change the push webhook to the new origin | Yes when push is enabled |
| Application source fallbacks | Replace the old Netlify fallback in three files | Strongly recommended |
| Firebase/browser notifications | Users register a new token on the new HTTPS origin | Yes when push is enabled |
| bKash provider and callback creation | Use/allowlist the new callback origin | Only before bKash API goes live |
| Brevo/Supabase email templates | Replace literal old links; authenticate a new sender domain if used | Conditional |
| Playwright or external monitoring | Change its base URL to the new origin | Conditional |
| SEO/search/analytics consoles | Add and verify the new property/domain | Conditional/future |

## 3. Prepare the application source

### 3.1 Replace the old fallback domain

`NEXT_PUBLIC_SITE_URL` is the production source of truth, but three client
pages currently fall back to `https://iba-written.netlify.app` if that
variable is missing:

1. `app/(auth)/signup/page.tsx`
2. `app/(auth)/forgot-password/page.tsx`
3. `app/(main)/settings/page.tsx`

Search before and after the change:

```powershell
rg -n "iba-written\.netlify\.app|NEXT_PUBLIC_SITE_URL" app lib components
```

Replace the old fallback with the canonical origin, or preferably centralize
site-URL resolution in one shared helper during a later code cleanup. Do not
rely on the fallback in production: Railway must still define
`NEXT_PUBLIC_SITE_URL`.

The affected flows are:

- signup email confirmation: `NEW_ORIGIN/auth/callback`
- forgotten-password reset: `NEW_ORIGIN/auth/callback?next=/reset-password`
- password change from Settings: the same reset callback

### 3.2 Domain-independent application paths

These are already relative and normally require no edit:

- `app/auth/callback/route.ts`
- `app/api/bkash/callback/route.ts` response redirects
- `public/manifest.json` and its `start_url`
- `public/firebase-messaging-sw.js` notification click target
- application navigation, images, API calls, and health-check paths

`next.config.ts` contains `allowedDevOrigins` for local development. Do not add
the production domain there; it is not a production origin allowlist.

### 3.3 Future bKash callback

The preliminary bKash create route is:

```text
app/api/bkash/create/route.ts
```

Its production callback must be:

```text
NEW_ORIGIN/api/bkash/callback
```

The current route prefers the browser-supplied `Origin` header when building
the callback. Before enabling real payments, change it to build callbacks only
from the trusted configured site origin. Do not let a request header choose a
payment callback domain.

Also update or allowlist the new callback in the bKash merchant/integration
portal if bKash requires an approved callback URL. Complete sandbox/UAT again
after the change. The current production guide treats these routes as future
work, so no bKash dashboard change is required while API checkout is disabled.

## 4. Add the domain in Railway

### 4.1 Attach it only to `web`

In the Railway production environment:

1. Open the `web` service.
2. Open **Settings**.
3. Find **Networking → Public Networking**.
4. Select **+ Custom Domain**.
5. Enter `NEW_HOST`.
6. Select the web application's HTTP port if Railway asks for a target port.
7. Leave the existing Railway-generated domain active during the cutover.

Do not generate or attach a public domain to `grading-worker`.

### 4.2 Create the DNS records Railway displays

Copy the records exactly from Railway into the DNS provider:

- For a subdomain such as `www.ibawritten.com`, create the displayed `CNAME`.
- For an apex/root domain such as `ibawritten.com`, use CNAME flattening,
  `ALIAS`, or `ANAME` support as instructed by the DNS provider.
- Create Railway's displayed ownership-verification `TXT` record as well.
- Do not invent an `A` record: Railway does not provide a permanent static IP
  for custom-domain routing.

The CNAME/ALIAS and TXT records are both required. A hostname may resolve but
still return Railway `404` responses while the TXT verification is missing.
DNS propagation can take time.

If the domain is purchased through Railway and still uses Railway-managed
nameservers, attach it from the Railway domain/service interface and manage its
DNS there. If its nameservers are delegated to Cloudflare or another provider,
create the Railway-displayed records at that external provider instead.

If both root and `www` should work, add both hostnames as Railway custom
domains. Railway attachment alone does not establish which one is canonical;
configure a redirect at the DNS/proxy layer or in the application so only one
origin is presented to users and search engines.

Wait until Railway shows the custom domain as verified and its TLS certificate
as active before changing auth emails to point to it.

Official reference: [Railway — Working with Domains](https://docs.railway.com/networking/domains/working-with-domains)

### 4.3 Update the Railway variable and redeploy

Open **web → Variables** in the production environment and set:

```dotenv
NEXT_PUBLIC_SITE_URL=https://NEW_HOST
```

Then redeploy the `web` service. `NEXT_PUBLIC_` values used in client code are
embedded during `next build`; merely editing the variable without producing a
new deployment can leave the old value in browser JavaScript.

Do not change these for a public-domain migration:

```dotenv
GRADING_WORKER_URL=http://${{grading-worker.RAILWAY_PRIVATE_DOMAIN}}:8080
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
OPENAI_API_KEY=...
OPENAI_VECTOR_IBA_WRITTEN=...
Z_AI_API_KEY=...
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

The worker URL is Railway private networking and is unrelated to the public
website domain. It changes only if the worker service itself is renamed.

## 5. Update Supabase

Do this after the new HTTPS origin works, but before sending new confirmation
or reset emails.

### 5.1 Authentication URL Configuration

In the Supabase production project, open:

**Authentication → URL Configuration**

Set the Site URL to:

```text
NEW_ORIGIN
```

Add these exact production Redirect URLs:

```text
NEW_ORIGIN/auth/callback
NEW_ORIGIN/auth/callback?next=/reset-password
```

Add the new URLs before removing the old ones. Exact production URLs are
safer than a broad wildcard. Localhost redirects belong only in the development
project or development entries.

Official reference: [Supabase — Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)

### 5.2 Auth email templates

Review **Authentication → Email Templates**.

- Replace any literal occurrence of the old domain.
- If templates use `{{ .SiteURL }}`, the new Supabase Site URL supplies it.
- The app passes explicit redirect destinations, so custom templates should
  preserve the redirect target as recommended by Supabase rather than forcing
  a hard-coded hostname.
- Send a real signup-confirmation email and a real password-reset email after
  the change; previewing a template is not enough.

Existing emails may still contain the old redirect. Keep the old domain
working temporarily if those links must remain usable.

### 5.3 Database Webhook for push notifications

If push notifications are enabled, open:

**Integrations → Database Webhooks**

Edit the webhook that calls the application and set its URL to:

```text
NEW_ORIGIN/api/webhooks/push
```

Do not change `SUPABASE_WEBHOOK_SECRET`; the domain move does not require secret
rotation. Confirm the webhook still sends the expected
`x-supabase-signature` header and receives a `2xx` response.

### 5.4 What not to change in Supabase

The public app domain is not the Supabase project API domain. Do not change
`NEXT_PUBLIC_SUPABASE_URL`, keys, database connection details, RLS policies, or
migrations merely because the website hostname changed.

If a Supabase custom API domain is purchased separately in the future, treat
that as a different migration and test all Supabase clients independently.

## 6. Firebase Cloud Messaging

This app uses Firebase for messaging, not Firebase Hosting or Firebase Auth.
The following project values identify the Firebase project and normally stay
unchanged during a website-domain move:

- Firebase `projectId`, `authDomain`, sender ID, and app ID in
  `lib/firebase.ts`
- the matching values in `public/firebase-messaging-sw.js`
- `NEXT_PUBLIC_FIREBASE_VAPID_KEY`
- Firebase Admin service-account credentials

FCM web messaging requires HTTPS and a service worker. Browser notification
permission, the service worker, and the push subscription belong to the web
origin. Therefore, permission granted on the old hostname does not transfer to
the new hostname.

After cutover:

1. Sign in on the new domain.
2. Enable notifications there.
3. Confirm a new FCM token is stored in `profiles.fcm_tokens`.
4. Insert or send a test notification and verify foreground and background
   delivery.
5. Expect old-domain tokens to remain temporarily; the push route already
   removes tokens reported invalid by Firebase.

No Firebase console authorized-domain change is required for the FCM-only
implementation currently in this repository. If Firebase Auth, App Check,
Firebase Hosting, or Google Analytics is added later, review that product's
domain/origin configuration separately.

Official references:

- [Firebase — Get started with FCM for Web](https://firebase.google.com/docs/cloud-messaging/web/get-started)
- [Firebase — Receive messages in Web apps](https://firebase.google.com/docs/cloud-messaging/web/receive-messages)

## 7. Email sender and DNS records

Changing the website hostname does not automatically change the email sender.
If the new domain will also be used for addresses such as
`support@ibawritten.com` or `no-reply@ibawritten.com`:

1. Add the domain in Brevo or the selected SMTP provider.
2. Add the exact SPF and DKIM records the provider supplies.
3. Add an appropriate DMARC policy after verifying delivery.
4. Change the sender address/name in Supabase SMTP settings.
5. Replace literal old-domain links in email templates.
6. Test delivery to multiple providers and check spam placement.

Do not replace Railway's CNAME/TXT records with mail records. Web, verification,
MX, SPF, DKIM, and DMARC records serve different purposes and must coexist.

## 8. Local development, tests, and monitoring

### Local `.env.local`

Keep local development on `http://localhost:3000` unless deliberately testing
the deployed site. Production values belong in Railway, not in committed env
files.

If `.env.local` is used to reproduce production auth redirects, set:

```dotenv
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Never commit `.env.local`.

### Playwright

`playwright.config.ts` accepts `PLAYWRIGHT_BASE_URL`. For tests against the
deployed application, set it to `NEW_ORIGIN`. Local tests can continue using
the default `http://127.0.0.1:3000`.

### External services

Update any external service that was configured outside this repository, for
example:

- uptime monitoring and synthetic tests
- bookmarks and admin documentation
- Google Search Console or Bing Webmaster Tools
- analytics data-stream URLs and referral exclusions
- OAuth consent-screen homepage, privacy-policy, or JavaScript origins if an
  OAuth provider is introduced
- CDN, WAF, or Cloudflare redirect rules
- API allowlists maintained by payment or integration providers

The current repository has no sitemap, robots file, absolute canonical URL, or
`metadataBase`. When public SEO becomes important, add them using the canonical
origin and remember to update them in any later domain migration.

## 9. Recommended cutover order

Use this order to avoid broken confirmation emails:

1. Buy the domain and choose the canonical hostname.
2. Add the domain to Railway `web`.
3. Add Railway's exact DNS and TXT records.
4. Wait for Railway verification and HTTPS certificate issuance.
5. Verify the new origin serves the application and `/api/health`.
6. Replace old source-code fallbacks and deploy that commit.
7. Set Railway `web` variable `NEXT_PUBLIC_SITE_URL=NEW_ORIGIN` and redeploy.
8. Add the new Supabase Auth redirect URLs.
9. Change the Supabase Site URL.
10. Send real signup and password-reset emails and follow both links.
11. Update the Supabase push webhook and test delivery.
12. Re-register and test browser notifications on the new origin.
13. Update bKash only if API checkout is being enabled.
14. Update monitoring, SEO, analytics, email branding, and documentation.
15. Redirect the old public hostname to the new canonical origin where
    possible, preserving paths and query strings.
16. Remove old auth redirect entries and the old domain only after the chosen
    transition period.

## 10. Verification checklist

### DNS and Railway

- [ ] `NEW_HOST` resolves to the Railway target.
- [ ] Railway shows the domain as verified.
- [ ] HTTPS certificate is valid with no browser warning.
- [ ] `NEW_ORIGIN/api/health` returns a successful response.
- [ ] The Railway-generated domain still works during the transition.
- [ ] `grading-worker` still has no public domain.
- [ ] Worker grading still uses `RAILWAY_PRIVATE_DOMAIN` successfully.

Useful Windows checks:

```powershell
Resolve-DnsName NEW_HOST
curl.exe -I NEW_ORIGIN
curl.exe NEW_ORIGIN/api/health
```

### Authentication

- [ ] New signup email returns to `NEW_ORIGIN/auth/callback`.
- [ ] Email verification creates a valid session.
- [ ] Forgot-password email returns through the reset callback.
- [ ] Password reset completes successfully.
- [ ] Existing users can sign in on the new hostname.
- [ ] No email or browser redirect points to localhost or the old domain.

Users may need to sign in again because browser cookies and storage are scoped
to the hostname. That is expected and does not mean the Supabase account was
lost.

### Application features

- [ ] Question bank and standalone grading work.
- [ ] Weekly exams and practice grading work.
- [ ] OCR works and still enforces slot eligibility.
- [ ] Admin routes work.
- [ ] Push webhook receives a `2xx` response.
- [ ] Browser notifications work in foreground and background.
- [ ] PWA/service worker loads from the new origin.
- [ ] Payment-request form links still work.
- [ ] bKash callback works only if the API integration is enabled.

### Final search

Run this before declaring the migration complete:

```powershell
rg -n -i --hidden --glob '!node_modules/**' --glob '!.git/**' --glob '!.next/**' `
  'iba-written\.netlify\.app|OLD_HOST|YOUR_FINAL_WEB_DOMAIN|YOUR_DOMAIN'
```

Review matches in documentation as well as code. Placeholder examples can stay
only when they are clearly labelled; runtime configuration must not retain the
old production hostname.

## 11. Rollback plan

Do not delete the old domain at the start of the migration.

If the new domain fails:

1. Restore Railway `NEXT_PUBLIC_SITE_URL` to the old working origin.
2. Redeploy `web` because the variable is public/build-time.
3. Restore the Supabase Site URL while leaving both old and new redirect URLs
   temporarily allowed.
4. Restore the old push-webhook URL.
5. Diagnose DNS/TXT/TLS without exposing the grading worker publicly.

Once the new domain has been stable through signup, reset, grading, webhook,
and notification tests, remove old redirects and domains deliberately rather
than all at once.

## 12. Final configuration record

Fill this in during the real migration and keep it with deployment records:

```text
Canonical origin:
Optional alias:
Railway web custom domain verified at:
DNS provider:
Railway NEXT_PUBLIC_SITE_URL updated at:
Web redeployment ID:
Supabase Site URL updated at:
Supabase redirect URLs verified at:
Push webhook updated/tested at:
Firebase notification tested at:
Old-domain redirect removal date:
Person completing checks:
```

For the wider production setup, also consult `PRODUCTION_DEPLOYMENT.md`.
