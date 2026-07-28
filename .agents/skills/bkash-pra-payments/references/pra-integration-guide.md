# PRA Onboarding & No-Code Payment Routes

Background detail supporting `SKILL.md`. Read this when the person needs help opening or
using the PRA itself, not just wiring up the API.

## What qualifies someone for a PRA (vs. a full Merchant account)

bKash created the Personal Retail Account specifically for small businesses, online
retailers, and f-commerce (Facebook-shop) sellers who **don't have a trade license**.
Requirements to open one:

- A valid, unused mobile number registered against the applicant's own NID (no bKash
  account may already exist on that number)
- The applicant's NID
- Self-registration via `https://account.bkash.com/`, or the bKash Merchant app
- No visit to bKash Customer Care required
- The same NID that opened a personal bKash account can also open a separate PRA on a
  different number

To confirm which numbers are already registered under an NID, bKash offers a self-service
check: dial `*16001#` and share the last 4 digits of the NID to receive an SMS listing
registered numbers — useful during onboarding-portal document submission.

## Offline vs. Online PRA

| State | How it's reached | Per-transaction limit (verify current figure with bKash) |
|---|---|---|
| Offline PRA | Default state right after opening | ~999 BDT |
| Online PRA | After address verification in the onboarding portal | ~2,000 BDT (some bKash materials describe higher tiers, e.g. up to 10,000 BDT, after further verification/upgrades) |

Treat any specific BDT figure here as indicative, not authoritative — bKash revises PRA
limits and fee schedules periodically. Direct the person to their live PRA dashboard, the
bKash app, or bKash support (16247 / livechat.bkash.com) for the number that applies to
their account today.

## What a PRA can already do, out of the box

- Receive payment via: QR code scan, bKash Payment Gateway, or USSD (manual PRA number
  entry) — per bKash's own PRA page
- Receive transfers from other PRAs and from bKash Merchant accounts (Merchant Plus,
  Merchant Plus Lite A & B, Medium, Small, Micro)
- Send money to any bKash customer (Send Money feature, charges/limits apply)
- Cash out via any bKash agent or BRAC Bank / Q-Cash ATM booths
- Use the bKash Merchant app (downloadable from Google Play) for day-to-day payment
  acceptance, dynamic QR generation, and transaction history
- Link a bank account for transfers out (availability has varied by rollout phase —
  confirm current availability in-app)

## No-code route: bKash Business Dashboard + Payment Link

This is the fastest way for a PRA holder to accept **online** payments without any
engineering work, and is explicitly open to PRA holders (not just Merchant accounts).

1. Sign up at `https://business.bkash.com/` using the PRA's mobile number and an active
   email address.
2. From the dashboard, generate either:
   - An **open Payment Link** — customer enters the amount they're paying, or
   - A **Fixed Payment Link** — a preset amount baked into the link, faster checkout
3. Share the link via Messenger, WhatsApp, SMS, or email — no website needed.
4. The dashboard also shows balances and transaction history, and supports **full or
   partial refunds** directly from the UI (e.g. refunding one item from a multi-item
   order without cancelling the whole transaction).

Recommend this route whenever the person's business is primarily social-media/f-commerce
based, or when they want payment collection working today rather than after a website
integration project.

## Route to full API credentials (website/app integration)

If the person genuinely needs programmatic integration (a checkout button on their own
site, a mobile app, subscription billing, etc.), the path bKash documents is:

1. Complete sign-up at the Merchant Integration Portal:
   `https://pgw-integration.bkash.com/sign-up`
2. **Explicitly ask** during that process whether a Personal Retail Account is eligible
   for API credentials (`app_key`/`app_secret`/`username`/`password`), or whether bKash
   will require upgrading to a paid Merchant tier (trade license, TIN, business bank
   account) first. Policy here is the part most likely to have changed since this guide
   was written — don't assume either answer.
3. Once approved, bKash's own documented milestones are:

| Milestone | What happens |
|---|---|
| Integration Initiation | Person gets Developer Portal access, Merchant Integration Portal access, demo link, and sandbox credentials |
| Sandbox readiness | Person builds against sandbox; shares user journey / solution doc if bKash asks for one |
| Sandbox validation | Person validates Create/Execute Payment responses inside the Merchant Integration Portal |
| Production info collection | Person is issued live (production) credentials in the Merchant Integration Portal |
| Production readiness | Person confirms their system works against production credentials |
| UAT & Go-Live | bKash checks backend security (technical UAT) and the end-to-end user journey (business UAT) with production credentials before the person opens the payment system to all customers |

4. A refund test is typically part of UAT — be ready to demonstrate a successful Refund
   call using the same token model as the rest of the integration.

## Fees

bKash states that dynamic PGW charges may apply "based on the understanding between the
merchant and bKash" — i.e. there isn't one universal published rate for API/PGW usage by
a PRA. Point the person to their bKash relationship contact or 16247 for their specific
fee schedule rather than guessing a percentage.
