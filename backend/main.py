"""FastAPI application exposing endpoints for the Gate.io grid bot."""
from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import httpx
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .grid_bot import GridBot, GridConfig


GATEIO_PUBLIC_BASE_URL = "https://api.gateio.ws/api/v4"


class GridConfigRequest(BaseModel):
    api_key: str = Field(..., description="Gate.io API key")
    api_secret: str = Field(..., description="Gate.io API secret")
    currency_pair: str = Field(..., example="BTC_USDT")
    lower_price: float = Field(..., gt=0)
    upper_price: float = Field(..., gt=0)
    grid_levels: int = Field(..., ge=2, le=100)
    total_quote: float = Field(..., gt=0, description="Total quote currency budget for buy orders")
    total_base: float = Field(..., ge=0, description="Total base currency budget for sell orders")
    dry_run: bool = Field(True, description="When true, the bot will not place real orders")


def create_app() -> FastAPI:
    app = FastAPI(title="Gate.io Grid Bot", version="1.0.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/health")
    async def health() -> Dict[str, str]:
        return {"status": "ok"}

    @app.post("/api/start")
    async def start_grid_bot(config: GridConfigRequest) -> JSONResponse:
        try:
            bot = GridBot(
                GridConfig(
                    api_key=config.api_key,
                    api_secret=config.api_secret,
                    currency_pair=config.currency_pair,
                    lower_price=config.lower_price,
                    upper_price=config.upper_price,
                    grid_levels=config.grid_levels,
                    total_quote=config.total_quote,
                    total_base=config.total_base,
                    dry_run=config.dry_run,
                )
            )
            result = await bot.prepare_orders()
        except Exception as exc:  # pylint: disable=broad-except
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        response_payload: Dict[str, Any] = {
            "current_price": result.current_price,
            "dry_run": result.dry_run,
            "orders": [
                {
                    "side": order.side,
                    "price": order.price,
                    "amount": order.amount,
                    "placed": order.placed,
                    "response": order.order_response.raw_response if order.order_response else None,
                }
                for order in result.orders
            ],
        }
        return JSONResponse(response_payload)

    async def _fetch_gateio_public(path: str, params: Dict[str, Any]) -> Any:
        try:
            async with httpx.AsyncClient(
                base_url=GATEIO_PUBLIC_BASE_URL, timeout=10.0
            ) as client:
                response = await client.get(path, params=params)
                response.raise_for_status()
        except httpx.HTTPStatusError as exc:
            detail: str
            try:
                error_payload = exc.response.json()
                detail = error_payload.get("label") or error_payload.get("detail") or str(error_payload)
            except ValueError:
                detail = exc.response.text
            raise HTTPException(status_code=exc.response.status_code, detail=detail) from exc
        except httpx.HTTPError as exc:  # pragma: no cover - network failures
            raise HTTPException(status_code=502, detail=str(exc)) from exc

        return response.json()

    @app.get("/api/candlesticks/{currency_pair}")
    async def candlesticks(
        currency_pair: str,
        interval: str = Query("1m", description="Gate.io candle interval"),
        limit: int = Query(60, ge=1, le=500, description="Number of candles to return"),
    ) -> Dict[str, Any]:
        raw_data: List[List[str]] = await _fetch_gateio_public(
            "/spot/candlesticks",
            {"currency_pair": currency_pair, "interval": interval, "limit": limit},
        )

        try:
            candles = [
                {
                    "timestamp": int(item[0]),
                    "volume": float(item[1]),
                    "close": float(item[2]),
                    "high": float(item[3]),
                    "low": float(item[4]),
                    "open": float(item[5]),
                }
                for item in raw_data
            ]
        except (ValueError, IndexError, TypeError) as exc:
            raise HTTPException(
                status_code=502,
                detail="Niepoprawna odpowiedź z Gate.io dla danych świecowych",
            ) from exc
        candles.sort(key=lambda candle: candle["timestamp"])
        return {"candles": candles}

    @app.get("/api/ticker/{currency_pair}")
    async def ticker(currency_pair: str) -> Dict[str, Any]:
        tickers: List[Dict[str, Any]] = await _fetch_gateio_public(
            "/spot/tickers", {"currency_pair": currency_pair}
        )
        if not tickers:
            raise HTTPException(status_code=404, detail="Nie znaleziono pary walutowej")

        ticker_data = tickers[0]
        try:
            last_price = float(ticker_data["last"])
            high = float(ticker_data.get("high_24h", last_price))
            low = float(ticker_data.get("low_24h", last_price))
            base_volume = float(ticker_data.get("base_volume", 0.0))
            quote_volume = float(ticker_data.get("quote_volume", 0.0))
            timestamp = int(ticker_data.get("timestamp", 0))
        except (TypeError, ValueError, KeyError) as exc:
            raise HTTPException(
                status_code=502,
                detail="Niepoprawna odpowiedź z Gate.io dla danych ticker",
            ) from exc

        return {
            "currency_pair": ticker_data.get("currency_pair", currency_pair),
            "last": last_price,
            "high_24h": high,
            "low_24h": low,
            "base_volume": base_volume,
            "quote_volume": quote_volume,
            "timestamp": timestamp,
        }

    @app.on_event("shutdown")
    async def on_shutdown() -> None:
        # nothing to clean up at the moment
        return None

    static_dir = Path(__file__).resolve().parent.parent / "frontend"
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="frontend")

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)
