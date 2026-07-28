"""
bkash_client.py

Reference Python client for the bKash Checkout (URL Based) / Tokenized Checkout REST
API -- see ../references/api-reference.md for the full field-level spec this implements.

Requires: pip install requests

This is a STARTING POINT, not a drop-in production library:
  - Swap the in-memory token cache for Redis/DB storage in a multi-process deployment
    (e.g. gunicorn with multiple workers) so you don't grant a fresh token per worker.
  - Add your own retry/backoff policy around network errors.
  - Wire your callback route to call execute_payment() only when status == "success",
    per the rules in SKILL.md.

Usage:
    from bkash_client import BkashClient

    bkash = BkashClient(
        base_url="https://tokenized.sandbox.bka.sh/v1.2.0-beta/tokenized",  # no trailing slash
        app_key=os.environ["BKASH_APP_KEY"],
        app_secret=os.environ["BKASH_APP_SECRET"],
        username=os.environ["BKASH_USERNAME"],
        password=os.environ["BKASH_PASSWORD"],
    )

    payment = bkash.create_payment(
        amount="500",
        payer_reference="01712345678",
        callback_url="https://yourdomain.com/bkash/callback",
        merchant_invoice_number="INV-0124",
    )
    # redirect the customer's browser to payment["bkashURL"]

    # ...later, in your callback route, only if request.args["status"] == "success":
    executed = bkash.execute_payment(request.args["paymentID"])
    if executed.get("statusCode") == "0000":
        # store executed["trxID"] + executed["paymentID"], mark the order paid
        pass
"""

import time
from typing import Optional

import requests


class BkashClient:
    def __init__(self, base_url: str, app_key: str, app_secret: str, username: str, password: str):
        if not all([base_url, app_key, app_secret, username, password]):
            raise ValueError("BkashClient requires base_url, app_key, app_secret, username, password")
        self.base_url = base_url.rstrip("/")
        self.app_key = app_key
        self.app_secret = app_secret
        self.username = username
        self.password = password

        # In-memory token cache -- replace with shared storage (Redis/DB) outside of a
        # single-process demo.
        self._id_token: Optional[str] = None
        self._refresh_token: Optional[str] = None
        self._token_expires_at: float = 0.0  # epoch seconds

    # ------------------------------------------------------------------
    # Token management (section 1 & 2 of api-reference.md)
    # ------------------------------------------------------------------

    def _grant_token(self) -> dict:
        res = requests.post(
            f"{self.base_url}/checkout/token/grant",
            headers={
                "Content-Type": "application/json",
                "username": self.username,
                "password": self.password,
            },
            json={"app_key": self.app_key, "app_secret": self.app_secret},
            timeout=30,
        )
        data = res.json()
        self._store_token(data)
        return data

    def _refresh_token_call(self) -> dict:
        res = requests.post(
            f"{self.base_url}/checkout/token/refresh",
            headers={
                "Content-Type": "application/json",
                "username": self.username,
                "password": self.password,
            },
            json={
                "app_key": self.app_key,
                "app_secret": self.app_secret,
                "refresh_token": self._refresh_token,
            },
            timeout=30,
        )
        data = res.json()
        self._store_token(data)
        return data

    def _store_token(self, data: dict) -> None:
        if not data or "id_token" not in data:
            return  # let the caller see the raw error response
        self._id_token = data["id_token"]
        self._refresh_token = data.get("refresh_token")
        safety_margin_seconds = 5 * 60
        self._token_expires_at = time.time() + data["expires_in"] - safety_margin_seconds

    def _get_token(self) -> str:
        if self._id_token and time.time() < self._token_expires_at:
            return self._id_token
        if self._refresh_token:
            self._refresh_token_call()
        else:
            self._grant_token()
        return self._id_token

    # ------------------------------------------------------------------
    # Internal request helper -- attaches auth headers to every business call
    # ------------------------------------------------------------------

    def _business_request(self, path: str, body: dict) -> dict:
        token = self._get_token()
        res = requests.post(
            f"{self.base_url}{path}",
            headers={
                "Content-Type": "application/json",
                "Accept": "application/json",
                "Authorization": token,
                "X-APP-Key": self.app_key,
            },
            json=body,
            timeout=30,
        )
        return res.json()

    # ------------------------------------------------------------------
    # Payment (section 3-6 of api-reference.md)
    # ------------------------------------------------------------------

    def create_payment(
        self,
        amount,
        payer_reference: str,
        callback_url: str,
        merchant_invoice_number: str,
        currency: str = "BDT",
        merchant_association_info: Optional[str] = None,
        agreement_id: Optional[str] = None,
    ) -> dict:
        """One-time 'regular sale' payment (mode 0011). See api-reference.md section 3.
        Pass agreement_id instead to charge an existing recurring-payment Agreement."""
        body = {
            "mode": "0011",
            "payerReference": payer_reference,
            "callbackURL": callback_url,
            "amount": str(amount),
            "currency": currency,
            "intent": "sale",
            "merchantInvoiceNumber": merchant_invoice_number,
        }
        if merchant_association_info:
            body["merchantAssociationInfo"] = merchant_association_info
        if agreement_id:
            body["agreementID"] = agreement_id
        return self._business_request("/checkout/create", body)

    def execute_payment(self, payment_id: str) -> dict:
        """Finalizes a payment. Call ONLY when your callback route received status=success."""
        return self._business_request("/checkout/execute", {"paymentID": payment_id})

    def query_payment(self, payment_id: str) -> dict:
        """Fallback status check -- use only if execute_payment() returned no response
        at all (e.g. a network timeout), not as a routine step."""
        return self._business_request("/checkout/payment/status", {"paymentID": payment_id})

    def search_transaction(self, trx_id: str) -> dict:
        """Look up a completed transaction by trxID (reconciliation / support)."""
        return self._business_request("/checkout/payment/search", {"trxID": trx_id})

    # ------------------------------------------------------------------
    # Refund (section 7-8)
    # ------------------------------------------------------------------

    def refund_payment(self, payment_id: str, trx_id: str, amount, sku: str, reason: str) -> dict:
        """Full or partial refund. `amount` may be less than the original (partial refund)."""
        return self._business_request(
            "/checkout/payment/refund",
            {
                "paymentID": payment_id,
                "trxID": trx_id,
                "amount": str(amount),
                "sku": sku,
                "reason": reason,
            },
        )

    def refund_status(self, payment_id: str, trx_id: str) -> dict:
        return self._business_request(
            "/checkout/payment/refund/status", {"paymentID": payment_id, "trxID": trx_id}
        )

    # ------------------------------------------------------------------
    # Recurring payments: Agreement flow (section 9)
    # ------------------------------------------------------------------

    def create_agreement(self, payer_reference: str, callback_url: str) -> dict:
        """Step 1 of recurring billing: get customer consent to store their wallet for
        future charges. Redirect the customer to the returned bkashURL."""
        return self._business_request(
            "/checkout/create", {"payerReference": payer_reference, "callbackURL": callback_url}
        )

    def execute_agreement(self, payment_id: str) -> dict:
        """Call only after the customer's agreement callback shows status=success.
        Store the returned agreementID -- it's what you'll bill against later."""
        return self._business_request("/checkout/execute", {"paymentID": payment_id})

    def cancel_agreement(self, agreement_id: str) -> dict:
        return self._business_request("/checkout/agreement/cancel", {"agreementID": agreement_id})
