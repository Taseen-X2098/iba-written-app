# bKash Payment Gateway API Reference

Covers the REST API used for route 3 in `SKILL.md` (website/app integration). This is
bKash's "Checkout (URL Based)" / "Tokenized Checkout" product family, API version
`v1.2.0-beta`. All business API calls (everything except Grant/Refresh Token) require
these two headers:

```
Authorization: <id_token from Grant/Refresh Token>
X-APP-Key: <app_key shared during onboarding>
Content-Type: application/json
Accept: application/json
```

Base URLs:

| Environment | Base URL |
|---|---|
| Sandbox | `https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized` |
| Production | `https://tokenized.pay.bka.sh/v1.2.0-beta/tokenized` |

> Confirm these hostnames and the version segment against the person's own Merchant
> Integration Portal onboarding documents — bKash has revised paths before, and this
> table reflects the version consistently documented across bKash's own sample code and
> independent integrations as of mid-2026.

## Table of contents

1. [Grant Token](#1-grant-token)
2. [Refresh Token](#2-refresh-token)
3. [Create Payment (one-time / regular sale)](#3-create-payment-one-time--regular-sale)
4. [Execute Payment](#4-execute-payment)
5. [Query Payment](#5-query-payment)
6. [Search Transaction](#6-search-transaction)
7. [Refund](#7-refund)
8. [Refund Status](#8-refund-status)
9. [Recurring payments: Create/Execute/Cancel Agreement](#9-recurring-payments-agreement-flow)
10. [Error codes](#10-error-codes)
11. [Sandbox test data](#11-sandbox-test-data)

---

## 1. Grant Token

Gets the `id_token` used as the `Authorization` header on every other call.

**Endpoint:** `POST {base_URL}/checkout/token/grant`

**Headers:** `username`, `password` (shared during onboarding), `Content-Type: application/json`

**Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `app_key` | string | Yes | Shared during onboarding |
| `app_secret` | string | Yes | Shared during onboarding |

**Sample request:**

```bash
curl --request POST \
  --url https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout/token/grant \
  --header 'Content-Type: application/json' \
  --header 'password: <password>' \
  --header 'username: <username>' \
  --data '{"app_key":"<app_key>","app_secret":"<app_secret>"}'
```

**Response fields:**

| Field | Description |
|---|---|
| `token_type` | Always `"Bearer"` |
| `id_token` | Use as `Authorization` header for all business API calls |
| `expires_in` | Token lifetime in seconds (currently `3600`, i.e. 1 hour) |
| `refresh_token` | Use with Refresh Token to get a new `id_token` without re-sending username/password |

```json
{
  "token_type": "Bearer",
  "id_token": "eyJraWQiOi...",
  "expires_in": 3600,
  "refresh_token": "eyJjdHkiOi..."
}
```

**Implementation guidance:** Cache `id_token` + its expiry. Re-use it for all requests
within the hour rather than granting a new token per request. Refresh proactively (e.g.
around the 50–55 minute mark).

---

## 2. Refresh Token

**Endpoint:** `POST {base_URL}/checkout/token/refresh`

**Headers:** `username`, `password`, `Content-Type: application/json`

**Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `app_key` | string | Yes | Same as onboarding |
| `app_secret` | string | Yes | Same as onboarding |
| `refresh_token` | string | Yes | From the previous Grant/Refresh Token response |

**Sample request:**

```bash
curl --request POST \
  --url https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized/checkout/token/refresh \
  --header 'Content-Type: application/json' \
  --header 'password: <password>' \
  --header 'username: <username>' \
  --data '{"app_key":"<app_key>","app_secret":"<app_secret>","refresh_token":"<refresh_token>"}'
```

**Response:** Same shape as Grant Token (`token_type`, `id_token`, `expires_in`,
`refresh_token`). The `refresh_token` itself is valid ~28 days; once it expires, call
Grant Token again from scratch.

---

## 3. Create Payment (one-time / regular sale)

First call of a standard, non-recurring checkout — no prior Agreement needed. This is
the "mode 0011" flow used by the large majority of website integrations, including
one-time PRA-style payments.

**Endpoint:** `POST {base_URL}/checkout/create`

**Headers:** `Authorization: <id_token>`, `X-APP-Key: <app_key>`, `Content-Type: application/json`, `Accept: application/json`

**Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `mode` | string | Yes | `"0011"` for a regular one-time Checkout (URL Based) payment |
| `payerReference` | string | Yes | Customer reference — phone number or your own user ID |
| `callbackURL` | string | Yes | Your endpoint bKash redirects the customer back to after PIN entry |
| `amount` | string | Yes | Payment amount, e.g. `"500"` or `"250.75"` — max 2 decimal places |
| `currency` | string | Yes | `"BDT"` (only supported currency) |
| `intent` | string | Yes | `"sale"` |
| `merchantInvoiceNumber` | string | Yes | Your own unique invoice/order reference |
| `merchantAssociationInfo` | string | No | Optional, max 255 chars — used by payment aggregators |

**Sample request:**

```json
{
  "mode": "0011",
  "payerReference": "01723888888",
  "callbackURL": "https://yourdomain.com/bkash/callback",
  "amount": "500",
  "currency": "BDT",
  "intent": "sale",
  "merchantInvoiceNumber": "INV-0124"
}
```

**Response fields:**

| Field | Description |
|---|---|
| `statusCode` | `"0000"` = success |
| `statusMessage` | Human-readable status |
| `paymentID` | System-generated ID (prefixed `TR0011...` for this mode). Reused in Execute/Query. |
| `bkashURL` | Redirect the customer here for PIN verification. Null on failure. |
| `paymentCreateTime` | Format: `yyyy-MM-dd'T'HH:mm:ss 'GMT'Z` |
| `callbackURL`, `successCallbackURL`, `failureCallbackURL`, `cancelledCallbackURL` | bKash appends `paymentID` and `status=success/failure/cancel` when redirecting back |
| `amount`, `currency`, `intent`, `merchantInvoiceNumber` | Echoed back |

```json
{
  "statusCode": "0000",
  "statusMessage": "Successful",
  "paymentID": "TR0011WQ1674418613025",
  "bkashURL": "https://sandbox.payment.bkash.com/redirect/tokenized/?paymentID=TR0011WQ1674418613025&hash=...",
  "callbackURL": "https://yourdomain.com/bkash/callback",
  "successCallbackURL": "https://yourdomain.com/bkash/callback?paymentID=TR0011WQ1674418613025&status=success",
  "failureCallbackURL": "https://yourdomain.com/bkash/callback?paymentID=TR0011WQ1674418613025&status=failure",
  "cancelledCallbackURL": "https://yourdomain.com/bkash/callback?paymentID=TR0011WQ1674418613025&status=cancel",
  "amount": "500",
  "currency": "BDT",
  "intent": "sale",
  "merchantInvoiceNumber": "INV-0124"
}
```

Redirect the customer's browser to `bkashURL`. They log in and enter their PIN there;
bKash then redirects to one of the callback URLs.

---

## 4. Execute Payment

Call this **only** when the callback query string shows `status=success`. This is the
step that actually finalizes/debits the payment.

**Endpoint:** `POST {base_URL}/checkout/execute`

**Headers:** `Authorization`, `X-APP-Key`, `Content-Type: application/json`

**Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `paymentID` | string | Yes | From Create Payment response / callback query string |

```json
{ "paymentID": "TR0011WQ1674418613025" }
```

**Response fields:**

| Field | Description |
|---|---|
| `statusCode` | `"0000"` = success |
| `statusMessage` | Human-readable status — always check this, don't assume generic text |
| `paymentID` | Same payment ID |
| `payerReference` | Echoed from Create Payment |
| `customerMsisdn` | Paying customer's bKash wallet number |
| `trxID` | **The actual transaction ID** — store this for Search/Refund |
| `amount`, `currency`, `intent`, `merchantInvoiceNumber` | Echoed back |
| `transactionStatus` | `"Completed"` for a finished sale |
| `paymentExecuteTime` | Format: `yyyy-MM-dd'T'HH:mm:ss 'GMT'Z` |

```json
{
  "statusCode": "0000",
  "statusMessage": "Successful",
  "paymentID": "TR0011f0CE1zl16944532XXXX",
  "payerReference": "01712345678",
  "customerMsisdn": "01712345678",
  "trxID": "AIB10DO2ON",
  "amount": "100",
  "transactionStatus": "Completed",
  "paymentExecuteTime": "2026-06-11T23:31:24:581 GMT+0600",
  "currency": "BDT",
  "intent": "sale",
  "merchantInvoiceNumber": "INV-0124"
}
```

**If Execute Payment returns no response at all** (timeout, network failure — not a
failure `statusCode`, an actual missing response), fall back to Query Payment. Do not
call Execute Payment a second time blindly; check Query Payment's `transactionStatus`
first to avoid a double-charge attempt.

---

## 5. Query Payment

Fallback-only check of a payment's current state (see rule above — not part of the
routine happy path).

**Endpoint:** `POST {base_URL}/checkout/payment/status`

**Headers:** `Authorization`, `X-APP-Key`, `Content-Type: application/json`

**Body:**

| Field | Type | Required |
|---|---|---|
| `paymentID` | string | Yes |

```json
{ "paymentID": "TR0011f0CE1zl16944532XXXX" }
```

**Response** includes everything Execute Payment returns, plus:

| Field | Description |
|---|---|
| `mode` | e.g. `"0011"` |
| `paymentCreateTime` | When Create Payment was called |
| `verificationStatus` | e.g. `"Complete"` |
| `merchantInvoice` | Same as `merchantInvoiceNumber` |

```json
{
  "paymentID": "TR0011f0CE1zl16944532XXXX",
  "mode": "0011",
  "paymentCreateTime": "2026-06-11T23:26:49:676 GMT+0600",
  "paymentExecuteTime": "2026-06-11T23:31:24:581 GMT+0600",
  "amount": "100",
  "currency": "BDT",
  "intent": "sale",
  "merchantInvoice": "INV-0124",
  "trxID": "AIB10DO2ON",
  "transactionStatus": "Completed",
  "verificationStatus": "Complete",
  "statusCode": "0000",
  "statusMessage": "Successful",
  "payerReference": "01712345678"
}
```

---

## 6. Search Transaction

Look up a completed transaction by its `trxID` — useful for reconciliation and customer
support disputes.

**Endpoint:** `POST {base_URL}/checkout/payment/search` (some onboarding docs expose this
as a GET with `trxID` as a path/query param — follow whatever the person's onboarding
material specifies; the payload shape below is the documented POST body form)

**Headers:** `Authorization`, `X-APP-Key`, `Content-Type: application/json`

**Body:**

| Field | Type | Required |
|---|---|---|
| `trxID` | string | Yes |

```json
{ "trxID": "AIB10DO2ON" }
```

**Response fields:**

| Field | Description |
|---|---|
| `trxID` | Same transaction ID |
| `amount`, `currency` | Amount and currency of the transaction |
| `initiationTime`, `completedTime` | Format: `yyyy-MM-dd'T'HH:mm:ss 'GMT'Z` |
| `transactionType` | e.g. `"bKash Tokenized Checkout via API"` |
| `customerMsisdn` | Paying customer's wallet number |
| `transactionStatus` | `"Completed"` for a successful transaction |
| `organizationShortCode` | Your merchant/PRA short code |
| `statusCode`, `statusMessage` | Call outcome |

```json
{
  "trxID": "AAN60A8IOQ",
  "initiationTime": "2026-06-11T12:06:05:000 GMT+0600",
  "completedTime": "2026-06-11T12:06:05:000 GMT+0600",
  "transactionType": "bKash Tokenized Checkout via API",
  "customerMsisdn": "01877722345",
  "transactionStatus": "Completed",
  "amount": "20",
  "currency": "BDT",
  "organizationShortCode": "50022",
  "statusCode": "0000",
  "statusMessage": "Successful"
}
```

---

## 7. Refund

Full or partial refund of a completed transaction. Refunds are generally irreversible —
confirm amount/reason with the person before calling this.

**Endpoint:** `POST {base_URL}/checkout/payment/refund`

**Headers:** `Authorization`, `X-APP-Key`, `Content-Type: application/json`

**Body:**

| Field | Type | Required | Description |
|---|---|---|---|
| `paymentID` | string | Yes | Original `paymentID` |
| `trxID` | string | Yes | Original `trxID` from Execute Payment |
| `amount` | string | Yes | Refund amount — max 2 decimal places. Can be less than the original (partial refund) |
| `sku` | string | Yes | Product/line-item identifier |
| `reason` | string | Yes | Free-text refund reason |

```json
{
  "paymentID": "TR0011f0CE1zl16944532XXXX",
  "trxID": "AIB10DO2ON",
  "amount": "25.69",
  "sku": "SKU-256519",
  "reason": "Customer requested partial refund for damaged item"
}
```

**Response fields:**

| Field | Description |
|---|---|
| `statusCode`, `statusMessage` | Call outcome |
| `originalTrxID` | The transaction being refunded |
| `refundTrxID` | New transaction ID for the refund itself |
| `transactionStatus` | `"Completed"` when the refund succeeds |
| `amount`, `currency` | Refunded amount |
| `charge` | Any fee bKash applies to the refund (often `"0.00"`) |
| `completedTime` | Format: `yyyy-MM-dd'T'HH:mm:ss 'GMT'Z` |

```json
{
  "statusCode": "0000",
  "statusMessage": "Successful",
  "originalTrxID": "AIB10DO2ON",
  "refundTrxID": "AIB10DO3PZ",
  "transactionStatus": "Completed",
  "amount": "25.69",
  "currency": "BDT",
  "charge": "0.00",
  "completedTime": "2026-06-11T15:53:29:120 GMT+0600"
}
```

---

## 8. Refund Status

Check the status of a previously requested refund.

**Endpoint:** `POST {base_URL}/checkout/payment/refund/status` (some onboarding docs use
a differently-versioned path such as `/v2/tokenized-checkout/refund/payment/status` —
this has genuinely varied across bKash doc revisions; use whatever path is in the
person's own onboarding material if it differs from the above)

**Headers:** `Authorization`, `X-APP-Key`, `Content-Type: application/json`

**Body:**

| Field | Type | Required |
|---|---|---|
| `paymentID` | string | Yes |
| `trxID` | string | Yes |

**Response:** Same shape as the Refund response above (`statusCode`, `originalTrxID`,
`refundTrxID`, `transactionStatus`, `amount`, `currency`, `charge`, `completedTime`).

---

## 9. Recurring payments: Agreement flow

For subscriptions/repeat billing (e.g. EMI, insurance premiums), bKash uses a one-time
"Agreement" (customer consent to be charged again without re-entering full credentials),
followed by ordinary Create/Execute Payment calls that reference the `agreementID`
instead of running the customer through full checkout each time.

### 9a. Create Agreement

**Endpoint:** `POST {base_URL}/checkout/create` with `"mode": "0000"` (agreement mode)

**Body:**

| Field | Required | Description |
|---|---|---|
| `payerReference` | Yes | Customer reference (phone/user ID) |
| `callbackURL` | Yes | Redirect target after consent |

```json
{
  "payerReference": "01932461580",
  "callbackURL": "https://yourdomain.com/bkash/agreement-callback"
}
```

**Response:** `statusCode`, `statusMessage`, `paymentID` (prefixed `AG...`),
`payerReference`, `bkashURL` (redirect here for wallet/OTP/PIN consent),
`agreementCreateTime`, `agreementStatus` (`"Initiated"`), plus the same
`callbackURL`/`successCallbackURL`/`failureCallbackURL`/`cancelledCallbackURL` quartet as
Create Payment.

### 9b. Execute Agreement

Call only after the customer is redirected back with `status=success`.

**Endpoint:** `POST {base_URL}/checkout/execute`

**Body:** `{ "paymentID": "<AG... ID from Create Agreement>" }`

**Response:** `statusCode`, `statusMessage`, `paymentID`, `payerReference`,
**`agreementID`** (store this — it's the long-lived reference for future payments),
`agreementExecuteTime`, `agreementStatus` (`"Completed"`).

### 9c. Create Payment against an existing Agreement

Same `/checkout/create` endpoint, but with `"mode": "0011"` and an `agreementID` instead
of asking the customer to check out from scratch:

```json
{
  "mode": "0011",
  "agreementID": "TokenizedMerchant0136HXV1X1546251271233",
  "amount": "50",
  "currency": "BDT",
  "intent": "sale",
  "merchantInvoiceNumber": "mINV00002",
  "callbackURL": "https://yourdomain.com/bkash/callback"
}
```

The customer only needs to enter their PIN (no full re-login) since the Agreement already
identifies their wallet. Execute Payment afterward works exactly as in section 4.

### 9d. Cancel Agreement

**Endpoint:** `POST {base_URL}/checkout/agreement/cancel` (per onboarding docs — confirm
exact path with bKash, as this endpoint name has appeared under slightly different paths
across doc revisions)

**Body:** `{ "agreementID": "<agreementID>" }`

**Response:** `statusCode`, `statusMessage`, `paymentID`, `agreementID`,
`agreementVoidTime`, `payerReference`, `agreementStatus` (`"Cancelled"`).

---

## 10. Error codes

| Code | Meaning |
|---|---|
| 2001 | Invalid App Key |
| 2002 | Invalid Payment ID |
| 2003 | Process Failed |
| 2006 | Invalid amount |
| 2007 | Invalid currency |
| 2008 | Invalid intent |
| 2025 | Invalid Request Body |
| 2033 | Transaction Not Found |
| 2044 | Invalid Payer Reference |
| 2045 | Invalid Merchant Callback URL |
| 2046 | Agreement already exists between payer and merchant |
| 2047 | Invalid Agreement ID |
| 2049 | Agreement is in incomplete state |
| 2050 | Agreement has already been cancelled |
| 2051 | Agreement execution pre-requisite hasn't been met |
| 2052 | Invalid Agreement State |
| 2053 | Invalid Payment State |
| 2054 | Payment execution pre-requisite hasn't been met |
| 2055 | This action can only be performed by the agreement/payment initiator party |
| 2056 | The payment has already been completed |
| 2057 | Not a bKash Wallet |

This table reflects bKash's own published error-code list at the time of research. Newer
codes may exist — always branch primarily on `statusCode == "0000"` for success and
surface `statusMessage` verbatim for anything else rather than hard-coding a full
enum of failure text.

---

## 11. Sandbox test data

Sandbox demo UI: `https://merchantdemo.sandbox.bka.sh/`

| Purpose | Wallet number |
|---|---|
| Regular success #1 | 01770618575 |
| Regular success #2 | 01929918378 |
| Regular success #3 | 01770618576 |
| Regular success #4 | 01877722345 |
| Regular success #5 | 01619777282 |
| Regular success #6 | 01619777283 |
| Forced failure — insufficient balance | 01823074817 |
| Forced failure — debit block | 01823074818 |

PIN: `12121` — OTP: `123456` for all sandbox wallets. If one wallet becomes locked/inactive
during testing, switch to another from the list.
