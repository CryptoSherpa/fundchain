"""FundchainAgent — Python client for the FundChain REST + x402 gateway.

The backend (https://fundchain.up.railway.app by default) exposes the on-chain
Crowdfund contract over HTTP. Read endpoints are free; write endpoints
(/api/create, /api/donate) require an x402 micropayment. This client follows
the x402 protocol: on HTTP 402 it reads the X-Payment-Required header, mints a
payment payload, base64-encodes it into X-PAYMENT, and retries.

In production the payload should reference a real on-chain payment that the
backend's facilitator can verify. In the gateway's demo mode (no
FACILITATOR_URL configured server-side), any decodable payload is accepted —
useful for local development against a Hardhat node.
"""

from __future__ import annotations

import base64
import json
import time
from typing import Any, Optional
from urllib import error, request

DEFAULT_API_URL = "https://fundchain.up.railway.app"
X402_HEADER = "X-PAYMENT"
X402_REQUIREMENTS_HEADER = "X-Payment-Required"


class FundchainError(RuntimeError):
    """Raised when the FundChain backend returns an error response."""

    def __init__(self, message: str, status: Optional[int] = None, body: Any = None):
        super().__init__(message)
        self.status = status
        self.body = body


class FundchainAgent:
    """High-level client for FundChain. One instance per wallet/agent.

    Args:
        wallet_key: Hex private key used (in production) to sign x402 payments.
            Stored on the instance and embedded as an identifier in the demo
            payment payload — never sent in plaintext to the backend.
        api_url:    Base URL of the FundChain REST gateway.
    """

    def __init__(self, wallet_key: str, api_url: str = DEFAULT_API_URL):
        if not wallet_key:
            raise ValueError("wallet_key is required")
        self.wallet_key = wallet_key
        self.api_url = api_url.rstrip("/")

    # ── Read endpoints (free) ────────────────────────────────────────────
    def list_campaigns(self) -> dict:
        """Return ``{"count": N, "campaigns": [...]}``."""
        return self._request("GET", "/api/campaigns")

    def get_campaign(self, campaign_id: int) -> dict:
        """Return a single serialized campaign by numeric id."""
        return self._request("GET", f"/api/campaigns/{int(campaign_id)}")

    # ── Write endpoints (x402-paid) ──────────────────────────────────────
    def create_campaign(
        self,
        title: str,
        goal_eth: str,
        duration_days: int,
        description: str,
        category: str,
        currency: str = "ETH",
        image_url: str = "",
    ) -> dict:
        """Create a campaign. Returns ``{"ok": True, "txHash": ..., "campaignId": N, ...}``."""
        return self._request(
            "POST",
            "/api/create",
            body={
                "title": title,
                "description": description,
                "category": category,
                "imageUrl": image_url,
                "goalAmount": str(goal_eth),
                "durationDays": int(duration_days),
                "currency": currency,
            },
        )

    def donate(self, campaign_id: int, amount_eth: str, currency: str = "ETH") -> dict:
        """Donate to a campaign. ``currency`` is informational — the on-chain
        campaign record is authoritative server-side. Returns the tx receipt JSON."""
        del currency  # documented for callers; not part of the backend contract
        return self._request(
            "POST",
            "/api/donate",
            body={"campaignId": int(campaign_id), "amount": str(amount_eth)},
        )

    # ── HTTP + x402 plumbing ─────────────────────────────────────────────
    def _request(self, method: str, path: str, body: Optional[dict] = None) -> dict:
        url = f"{self.api_url}{path}"
        data = json.dumps(body).encode("utf-8") if body is not None else None
        headers = {"Content-Type": "application/json", "Accept": "application/json"}

        status, resp_headers, resp_body = self._fetch(url, method, headers, data)

        if status == 402:
            requirements = self._extract_requirements(resp_headers, resp_body)
            payment_header = self._encode_payment_header(requirements, method, path)
            status, resp_headers, resp_body = self._fetch(
                url, method, {**headers, X402_HEADER: payment_header}, data
            )

        return self._unwrap(status, resp_body, method, path)

    @staticmethod
    def _fetch(url: str, method: str, headers: dict, data: Optional[bytes]):
        req = request.Request(url, data=data, method=method, headers=headers)
        try:
            with request.urlopen(req) as resp:
                return resp.getcode(), dict(resp.headers.items()), resp.read()
        except error.HTTPError as e:
            # 402 is an expected control flow signal, not an exception case.
            return e.code, dict(e.headers.items()), e.read()
        except error.URLError as e:
            raise FundchainError(f"Network error contacting {url}: {e.reason}") from e

    @staticmethod
    def _extract_requirements(headers: dict, body: bytes) -> dict:
        raw = headers.get(X402_REQUIREMENTS_HEADER) or headers.get(X402_REQUIREMENTS_HEADER.lower())
        if raw:
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                pass
        # Fallback: the demo backend also includes requirements in the 402 body.
        try:
            return json.loads(body).get("requirements", {})
        except (json.JSONDecodeError, AttributeError):
            return {}

    def _encode_payment_header(self, requirements: dict, method: str, path: str) -> str:
        # Demo-mode payload: backend accepts any decodable JSON. In production
        # this should be replaced with a signed on-chain payment reference that
        # the configured x402 facilitator can verify.
        payload = {
            "ts": int(time.time() * 1000),
            "note": "fundchain-python-sdk",
            "route": requirements.get("route") or f"{method} {path}",
            "wallet": self.wallet_key[:10] + "…",
        }
        return base64.b64encode(json.dumps(payload).encode("utf-8")).decode("ascii")

    @staticmethod
    def _unwrap(status: int, body: bytes, method: str, path: str) -> dict:
        try:
            parsed = json.loads(body) if body else {}
        except json.JSONDecodeError:
            parsed = {"raw": body.decode("utf-8", errors="replace")}

        if 200 <= status < 300:
            return parsed

        message = parsed.get("error") if isinstance(parsed, dict) else None
        raise FundchainError(
            f"{method} {path} → HTTP {status}: {message or parsed}",
            status=status,
            body=parsed,
        )
