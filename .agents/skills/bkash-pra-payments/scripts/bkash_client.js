/**
 * bkash_client.js
 *
 * Reference Node.js client for the bKash Checkout (URL Based) / Tokenized Checkout
 * REST API — see ../references/api-reference.md for the full field-level spec this
 * implements.
 *
 * Requires Node.js 18+ (uses the built-in `fetch`). No external dependencies.
 *
 * This is a STARTING POINT, not a drop-in production library:
 *   - Swap the in-memory token cache for Redis/DB storage in a multi-instance deployment.
 *   - Add your own retry/backoff policy around network errors.
 *   - Wire `onPaymentCreated` / your callback route to call `executePayment` only on
 *     status=success, per the rules in SKILL.md.
 *
 * Usage:
 *   const { BkashClient } = require('./bkash_client');
 *
 *   const bkash = new BkashClient({
 *     baseURL: 'https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized', // no trailing slash
 *     appKey: process.env.BKASH_APP_KEY,
 *     appSecret: process.env.BKASH_APP_SECRET,
 *     username: process.env.BKASH_USERNAME,
 *     password: process.env.BKASH_PASSWORD,
 *   });
 *
 *   const payment = await bkash.createPayment({
 *     amount: '500',
 *     payerReference: '01712345678',
 *     callbackURL: 'https://yourdomain.com/bkash/callback',
 *     merchantInvoiceNumber: 'INV-0124',
 *   });
 *   // redirect the customer's browser to payment.bkashURL
 *
 *   // ...later, in your callback route, only if req.query.status === 'success':
 *   const executed = await bkash.executePayment(req.query.paymentID);
 *   if (executed.statusCode === '0000') {
 *     // store executed.trxID + executed.paymentID, mark the order paid
 *   }
 */

class BkashClient {
  /**
   * @param {Object} config
   * @param {string} config.baseURL   e.g. https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized
   * @param {string} config.appKey
   * @param {string} config.appSecret
   * @param {string} config.username
   * @param {string} config.password
   */
  constructor(config) {
    if (!config || !config.baseURL || !config.appKey || !config.appSecret || !config.username || !config.password) {
      throw new Error('BkashClient requires baseURL, appKey, appSecret, username, password');
    }
    this.baseURL = config.baseURL.replace(/\/$/, '');
    this.appKey = config.appKey;
    this.appSecret = config.appSecret;
    this.username = config.username;
    this.password = config.password;

    // In-memory token cache — replace with shared storage (Redis/DB) outside of a
    // single-process demo so multiple server instances don't each grant their own token.
    this._idToken = null;
    this._refreshToken = null;
    this._tokenExpiresAt = 0; // epoch ms
  }

  // ---------------------------------------------------------------------
  // Token management (section 1 & 2 of api-reference.md)
  // ---------------------------------------------------------------------

  async _grantToken() {
    const res = await fetch(`${this.baseURL}/checkout/token/grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        username: this.username,
        password: this.password,
      },
      body: JSON.stringify({ app_key: this.appKey, app_secret: this.appSecret }),
    });
    const data = await res.json();
    this._storeToken(data);
    return data;
  }

  async _refreshTokenCall() {
    const res = await fetch(`${this.baseURL}/checkout/token/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        username: this.username,
        password: this.password,
      },
      body: JSON.stringify({
        app_key: this.appKey,
        app_secret: this.appSecret,
        refresh_token: this._refreshToken,
      }),
    });
    const data = await res.json();
    this._storeToken(data);
    return data;
  }

  _storeToken(data) {
    if (!data || !data.id_token) return; // let caller see the raw error response
    this._idToken = data.id_token;
    this._refreshToken = data.refresh_token;
    // Refresh 5 minutes early rather than cutting it exactly at expires_in.
    const safetyMarginMs = 5 * 60 * 1000;
    this._tokenExpiresAt = Date.now() + data.expires_in * 1000 - safetyMarginMs;
  }

  /** Returns a valid id_token, granting or refreshing as needed. */
  async _getToken() {
    if (this._idToken && Date.now() < this._tokenExpiresAt) {
      return this._idToken;
    }
    if (this._refreshToken) {
      await this._refreshTokenCall();
    } else {
      await this._grantToken();
    }
    return this._idToken;
  }

  // ---------------------------------------------------------------------
  // Internal request helper — attaches auth headers to every business call
  // ---------------------------------------------------------------------

  async _businessRequest(path, body) {
    const token = await this._getToken();
    const res = await fetch(`${this.baseURL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Authorization: token,
        'X-APP-Key': this.appKey,
      },
      body: JSON.stringify(body),
    });
    return res.json();
  }

  // ---------------------------------------------------------------------
  // Payment (section 3-6 of api-reference.md)
  // ---------------------------------------------------------------------

  /**
   * One-time "regular sale" payment (mode 0011). See api-reference.md section 3.
   * @param {Object} p
   * @param {string} p.amount
   * @param {string} p.payerReference
   * @param {string} p.callbackURL
   * @param {string} p.merchantInvoiceNumber
   * @param {string} [p.currency='BDT']
   * @param {string} [p.merchantAssociationInfo]
   * @param {string} [p.agreementID] pass this instead of a fresh checkout to charge an existing Agreement
   */
  async createPayment(p) {
    const body = {
      mode: '0011',
      payerReference: p.payerReference,
      callbackURL: p.callbackURL,
      amount: String(p.amount),
      currency: p.currency || 'BDT',
      intent: 'sale',
      merchantInvoiceNumber: p.merchantInvoiceNumber,
    };
    if (p.merchantAssociationInfo) body.merchantAssociationInfo = p.merchantAssociationInfo;
    if (p.agreementID) body.agreementID = p.agreementID;
    return this._businessRequest('/checkout/create', body);
  }

  /**
   * Finalizes a payment. Call ONLY when your callback route received status=success.
   * @param {string} paymentID
   */
  async executePayment(paymentID) {
    return this._businessRequest('/checkout/execute', { paymentID });
  }

  /**
   * Fallback status check — use only if executePayment returned no response at all
   * (e.g. a network timeout), not as a routine step.
   * @param {string} paymentID
   */
  async queryPayment(paymentID) {
    return this._businessRequest('/checkout/payment/status', { paymentID });
  }

  /**
   * Look up a completed transaction by trxID (reconciliation / support).
   * @param {string} trxID
   */
  async searchTransaction(trxID) {
    return this._businessRequest('/checkout/payment/search', { trxID });
  }

  // ---------------------------------------------------------------------
  // Refund (section 7-8)
  // ---------------------------------------------------------------------

  /**
   * @param {Object} p
   * @param {string} p.paymentID
   * @param {string} p.trxID
   * @param {string} p.amount   full or partial amount, max 2 decimal places
   * @param {string} p.sku
   * @param {string} p.reason
   */
  async refundPayment(p) {
    return this._businessRequest('/checkout/payment/refund', {
      paymentID: p.paymentID,
      trxID: p.trxID,
      amount: String(p.amount),
      sku: p.sku,
      reason: p.reason,
    });
  }

  /**
   * @param {string} paymentID
   * @param {string} trxID
   */
  async refundStatus(paymentID, trxID) {
    return this._businessRequest('/checkout/payment/refund/status', { paymentID, trxID });
  }

  // ---------------------------------------------------------------------
  // Recurring payments: Agreement flow (section 9)
  // ---------------------------------------------------------------------

  /**
   * Step 1 of recurring billing: get customer consent to store their wallet for future
   * charges. Redirect the customer to the returned bkashURL.
   * @param {string} payerReference
   * @param {string} callbackURL
   */
  async createAgreement(payerReference, callbackURL) {
    return this._businessRequest('/checkout/create', { payerReference, callbackURL });
  }

  /**
   * Call only after the customer's agreement callback shows status=success.
   * Store the returned `agreementID` — it's what you'll bill against later.
   * @param {string} paymentID  the AG... id from createAgreement
   */
  async executeAgreement(paymentID) {
    return this._businessRequest('/checkout/execute', { paymentID });
  }

  /** @param {string} agreementID */
  async cancelAgreement(agreementID) {
    return this._businessRequest('/checkout/agreement/cancel', { agreementID });
  }
}

module.exports = { BkashClient };
