---
name: bkash-pra-payments
description: Integrate bKash payment acceptance for a Personal Retail Account (PRA) — bKash's account type for small businesses, online retailers, and f-commerce sellers who don't have a trade license. Use this skill whenever the user wants to accept bKash payments through a PRA, mentions "bKash PRA", "Personal Retail Account", "bKash payment gateway", "bKash checkout", "bKash tokenized checkout", or wants to collect customer payments in Bangladesh via bKash without a formal Merchant account. Covers all three acceptance methods — QR/USSD (no code), Payment Link via bKash Business Dashboard (no code), and full REST API integration (Checkout URL Based / Tokenized Checkout, for websites and apps) — including Grant/Refresh Token, Create/Execute Payment, Query Payment, Search Transaction, Refund, and recurring-payment Agreements. Trigger this even if the user only says "add bKash to my website/app" or "let my PRA accept online payments," since PRA has integration constraints that differ from a full bKash Merchant account.
---

# bKash Payments for a Personal Retail Account (PRA)

## What a PRA is

A **Personal Retail Account (PRA)** is bKash's lightweight account tier for micro/small
businesses, online retailers, and f-commerce (Facebook-shop) sellers who don't have a
trade license. It's opened with just a NID and a fresh mobile number — no trade license,
TIN, or bank account required. Two sub-states exist:

| PRA type | Requirement | Per-transaction limit |
|---|---|---|
| Offline PRA | No address verification | ~999 BDT |
| Online PRA | Address verified in the onboarding portal | ~2,000 BDT (some sources report higher tiers after upgrades) |

A PRA can hold a higher standing balance and daily send/cash-in ceiling than a personal
wallet, and can receive from other PRAs and from bKash Merchant accounts (Merchant Plus,
Merchant Plus Lite A/B, Medium, Small, Micro). **Always verify current limits and fees
with the person's live bKash PRA dashboard or bKash support (16247) before quoting numbers
to them** — bKash revises these periodically and this table can go stale.

## Reality check before you build anything

bKash's own PRA page states a customer can pay a PRA holder three ways: scanning the PRA's
QR, typing the PRA number over USSD, or **via the bKash Payment Gateway**. That third
option is why PRA holders come to this skill. But be upfront with the person about a real
constraint: **most third-party integrations and much of bKash's own merchant-onboarding
material assume a full Merchant account** (trade license, TIN, business bank account) when
issuing the API credentials (`app_key` / `app_secret` / `username` / `password`) used by
the REST API described below. Some integrators explicitly say personal/PRA accounts aren't
accepted for API credentials; bKash's own consumer page says PRAs *can* use the gateway.

Don't paper over this contradiction. Give the person the honest path:

1. **Try the no-code routes first** (below) — they are unambiguously available to PRA
   holders today and need no approval beyond opening the PRA itself.
2. **For full API/website integration**, have them apply through the Merchant
   Integration Portal (`https://pgw-integration.bkash.com/sign-up`) and ask explicitly
   whether their PRA qualifies for API (`app_key`/`app_secret`) credentials, or whether
   they'll be asked to upgrade to a paid Merchant tier first. bKash's requirements shift
   over time and by business type, and only bKash can give a binding answer for a
   specific account.

Once credentials exist (whoever ends up issuing them), every API detail below applies
identically — bKash's Payment Gateway does not have a different API shape for PRA vs.
Merchant callers.

## Three ways a PRA can accept payment

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. IN PERSON / INSTANT — no code, no approval beyond the PRA itself │
│    • Customer scans the PRA's QR code in the bKash app              │
│    • Customer dials *247# → option 2 (Merchant Payment) → PRA number│
│    Best for: market stalls, counter sales, delivery-on-doorstep     │
├─────────────────────────────────────────────────────────────────────┤
│ 2. REMOTE, NO WEBSITE — no code                                     │
│    • Sign up at https://business.bkash.com/ (bKash Business         │
│      Dashboard) with the PRA number + an email address              │
│    • Generate a "Payment Link" (open amount) or "Fixed Payment      │
│      Link" (preset amount); share it over Messenger/WhatsApp/SMS    │
│    • Dashboard also supports full or partial refunds                │
│    Best for: f-commerce / social-media sellers, invoicing           │
├─────────────────────────────────────────────────────────────────────┤
│ 3. WEBSITE / APP — full REST API integration                        │
│    • Requires app_key + app_secret + username + password from       │
│      bKash's Merchant Integration Portal                             │
│    • Grant Token → Create Payment → redirect → Execute Payment →     │
│      (Query Payment if needed) → Search / Refund as follow-ups      │
│    Best for: e-commerce sites, SaaS billing, checkout flows          │
│    → See references/api-reference.md for full field-level detail    │
└─────────────────────────────────────────────────────────────────────┘
```

Ask the person which tier fits before writing code — if they just want to take payments
from Facebook buyers, route 2 needs zero engineering. Only reach for route 3 when they
actually have a website/app checkout to wire up.

## Route 3 in depth: full API integration

### Credentials & environments

bKash shares four values during onboarding: **App Key** (`app_key` / header `X-APP-Key`),
**App Secret** (`app_secret`), **Username**, **Password**. Never hard-code these or ship
them to the browser — every business API call must originate from your backend.

| Environment | Base URL |
|---|---|
| Sandbox | `https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized` |
| Production | `https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized` |

`v1.2.0-beta` is bKash's long-standing, currently-recommended API version as of this
writing — but **confirm the version and hostnames from the person's own Merchant
Integration Portal / onboarding email**, since bKash occasionally revises paths and a
stale version pinned in old sample code is a common source of integration failures.

TLS 1.2+ is required. Set a client-side timeout of ~30 seconds on every call.

### Core one-time payment flow

```
Merchant backend                  bKash                      Customer browser
       │                            │                              │
       │──Grant Token (app_key,────▶│                              │
       │  app_secret, user, pass)   │                              │
       │◀───id_token, refresh_token─│                              │
       │                            │                              │
       │──Create Payment (amount,──▶│                              │
       │  mode 0011, callbackURL)   │                              │
       │◀───paymentID, bkashURL─────│                              │
       │                            │                              │
       │───────────────────────────redirect to bkashURL────────────▶│
       │                            │◀──PIN/OTP entry, approval────│
       │◀──────callback (paymentID, status=success/fail/cancel)─────│
       │                            │                              │
       │──Execute Payment(paymentID)▶│    (only if status=success) │
       │◀───trxID, statusCode 0000──│                              │
       │                            │                              │
       │──(only if Execute had NO──▶│                              │
       │   response) Query Payment  │                              │
       │◀───────────────────────────│                              │
```

Full request/response bodies, headers, and every field for Grant Token, Refresh Token,
Create Payment, Execute Payment, Query Payment, Search Transaction, Refund, Refund
Status, and the recurring-payment Agreement endpoints are in
**`references/api-reference.md`** — read it before writing integration code. Working
reference clients are in **`scripts/bkash_client.js`** (Node.js) and
**`scripts/bkash_client.py`** (Python); adapt, don't reinvent.

### Rules bKash asks integrators to follow (from their own integration checklist)

These are easy to get subtly wrong and cause silent payment-reconciliation bugs:

1. Re-use one `id_token` for up to an hour rather than granting a fresh token per request.
2. Refresh the token proactively (e.g. in a scheduler around the 50–55 minute mark) using
   Refresh Token, not Grant Token, to avoid unnecessary re-auth.
3. Call **Execute Payment only** when the callback status is `success`. On `failure` or
   `cancel`, show the user a failed/cancelled message — don't call Execute.
4. Call **Query Payment only** as a fallback when Execute Payment itself returned no
   response (timeout/network error) — never as a routine part of the happy path.
5. `statusCode: "0000"` on the Execute response means success; any other code is a
   failure — always surface `statusMessage`, don't assume a fixed generic error text.
6. Store `paymentID` and `trxID` from every completed Execute response — both are
   required to issue a Refund later.
7. Refund uses the same `id_token` model as everything else — no separate credential.

### Sandbox testing

bKash's sandbox uses fixed test wallets (same PIN/OTP for all):

- Regular success wallets: `01770618575`, `01929918378`, `01770618576`, `01877722345`,
  `01619777282`, `01619777283`
- Forced-failure wallets: `01823074817` (insufficient balance), `01823074818` (debit block)
- PIN: `12121` — OTP: `123456`

Full sandbox demo: `https://merchantdemo.sandbox.bka.sh/`

### Error handling

bKash returns a `statusCode` + `statusMessage` on every call. See
`references/api-reference.md` for the documented error-code table (e.g. `2001` invalid
app key, `2006` invalid amount, `2044` invalid payer reference, `2056` payment already
completed). Always branch on `statusCode`, never on HTTP status alone — bKash can return
HTTP 200 with a failure `statusCode`.

## Security checklist before shipping

- [ ] `app_secret`/`password` only ever touch server-side code, env vars, or a secrets
      manager — never client JS, mobile app bundles, or logs.
- [ ] `callbackURL` is validated server-side (don't trust an attacker-supplied redirect).
- [ ] Payment status is confirmed via Execute/Query API response, never trusted purely
      from a client-side redirect query string.
- [ ] Idempotency: guard against a customer refreshing the callback page and triggering
      Execute Payment twice for the same `paymentID`.
- [ ] Refund amounts/reasons are logged before calling the Refund API — refunds are
      generally irreversible.
- [ ] Sandbox credentials are swapped for production ones (and the base URL changed from
      `sandbox.bka.sh` to `pay.bka.sh`) only after UAT sign-off, per bKash's own
      milestone process (see `references/pra-integration-guide.md`).

## Reference files

- **`references/api-reference.md`** — field-by-field request/response tables, sample
  JSON, endpoint paths, and the error-code table for every API call (Token, Agreement,
  Payment, Supporting APIs).
- **`references/pra-integration-guide.md`** — PRA-specific onboarding: opening
  requirements, the Business Dashboard/Payment Link no-code route, and the Merchant
  Integration Portal milestones for getting API credentials.
- **`scripts/bkash_client.js`** / **`scripts/bkash_client.py`** — ready-to-adapt
  reference clients implementing the full token + payment lifecycle.

## Provenance / how this was verified

bKash's interactive developer portal (`developer.bka.sh`) blocks automated scraping via
robots.txt, so this skill was compiled from bKash's own official PDFs and GitHub org
(`developer.pay.bka.sh` S3 assets, `github.com/bKash-developer`), bKash's own consumer PRA
and Business Dashboard pages, and cross-checked against dozens of independent open-source
bKash integration libraries (Node, PHP/Laravel, TypeScript) that all agree on the same
field names, endpoints, and sample payloads. Payment APIs and PRA terms change over time —
**re-verify field names, URLs, and PRA eligibility against the person's actual Merchant
Integration Portal onboarding documents before going to production**, and treat anything
here that conflicts with what bKash tells the person directly as outdated.
