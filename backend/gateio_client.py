"""Client utilities for interacting with the Gate.io REST API."""
from __future__ import annotations

import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from typing import Any, Dict, Optional

import httpx


API_BASE_URL = "https://api.gateio.ws/api/v4"


class GateIOAPIError(RuntimeError):
    """Raised when the Gate.io API returns an error response."""


@dataclass
class APIResponse:
    """Wrapper object used for returning API call information."""

    request_path: str
    payload: Dict[str, Any]
    raw_response: Dict[str, Any]


class GateIOClient:
    """Minimal Gate.io REST client that supports the endpoints used by the grid bot."""

    def __init__(self, api_key: str, api_secret: str, session: Optional[httpx.AsyncClient] = None) -> None:
        self._api_key = api_key
        self._api_secret = api_secret
        self._session = session or httpx.AsyncClient(base_url=API_BASE_URL, timeout=20.0)

    async def __aenter__(self) -> "GateIOClient":
        return self

    async def __aexit__(self, *_exc: Any) -> None:
        await self.close()

    async def close(self) -> None:
        await self._session.aclose()

    async def get_currency_pairs(self) -> Dict[str, Any]:
        return await self._request("GET", "/spot/currency_pairs")

    async def get_order_book(self, currency_pair: str) -> Dict[str, Any]:
        params = {"currency_pair": currency_pair, "limit": 1}
        return await self._request("GET", "/spot/order_book", params=params)

    async def place_order(
        self,
        *,
        currency_pair: str,
        price: float,
        amount: float,
        side: str,
        account: str = "spot",
        order_type: str = "limit",
        time_in_force: str = "gtc",
    ) -> APIResponse:
        body = {
            "text": "grid-bot",
            "currency_pair": currency_pair,
            "type": order_type,
            "side": side,
            "amount": f"{amount:.8f}",
            "price": f"{price:.8f}",
            "account": account,
            "time_in_force": time_in_force,
        }
        payload = await self._request("POST", "/spot/orders", json_body=body, auth=True)
        return APIResponse(
            request_path="/spot/orders",
            payload=body,
            raw_response=payload,
        )

    async def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        json_body: Optional[Dict[str, Any]] = None,
        auth: bool = False,
    ) -> Dict[str, Any]:
        query = ""
        if params:
            query = httpx.QueryParams(params).to_str()
        headers = {"Accept": "application/json"}
        body = json.dumps(json_body) if json_body else ""

        if auth:
            timestamp = str(int(time.time()))
            sign_payload = "\n".join([timestamp, method.upper(), path, query, body])
            sign = hmac.new(
                self._api_secret.encode(), sign_payload.encode(), hashlib.sha512
            ).hexdigest()
            headers.update(
                {
                    "KEY": self._api_key,
                    "Timestamp": timestamp,
                    "SIGN": sign,
                    "Content-Type": "application/json",
                }
            )
        response = await self._session.request(
            method,
            path,
            params=params,
            content=body if body else None,
            headers=headers,
        )
        data = response.json()
        if response.status_code >= 400:
            raise GateIOAPIError(data)
        return data


__all__ = ["GateIOClient", "GateIOAPIError", "APIResponse"]
