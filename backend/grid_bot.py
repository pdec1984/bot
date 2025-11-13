"""Grid trading strategy logic."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .gateio_client import APIResponse, GateIOClient


@dataclass
class GridConfig:
    """Configuration provided by the user for constructing the grid."""

    api_key: str
    api_secret: str
    currency_pair: str
    lower_price: float
    upper_price: float
    grid_levels: int
    total_quote: float
    total_base: float
    dry_run: bool = True


@dataclass
class GridOrder:
    side: str
    price: float
    amount: float
    placed: bool = False
    order_response: Optional[APIResponse] = None


@dataclass
class GridResult:
    orders: List[GridOrder] = field(default_factory=list)
    current_price: Optional[float] = None
    dry_run: bool = True


class GridBot:
    """Builds and optionally places a grid of orders on Gate.io."""

    def __init__(self, config: GridConfig) -> None:
        if config.upper_price <= config.lower_price:
            raise ValueError("upper_price must be greater than lower_price")
        if config.grid_levels < 2:
            raise ValueError("grid_levels must be at least 2")
        self.config = config

    async def prepare_orders(self) -> GridResult:
        async with GateIOClient(self.config.api_key, self.config.api_secret) as client:  # type: ignore[arg-type]
            order_book = await client.get_order_book(self.config.currency_pair)
            current_price = self._extract_reference_price(order_book)

            grid_prices = self._build_grid_prices()
            buy_levels = [p for p in grid_prices if p < current_price]
            sell_levels = [p for p in grid_prices if p > current_price]

            orders = self._allocate_orders(buy_levels, sell_levels)

            if not self.config.dry_run:
                await self._submit_orders(client, orders)

            return GridResult(orders=orders, current_price=current_price, dry_run=self.config.dry_run)

    async def _submit_orders(self, client: GateIOClient, orders: List[GridOrder]) -> None:
        for order in orders:
            response = await client.place_order(
                currency_pair=self.config.currency_pair,
                price=order.price,
                amount=order.amount,
                side=order.side,
            )
            order.order_response = response
            order.placed = True

    def _build_grid_prices(self) -> List[float]:
        step = (self.config.upper_price - self.config.lower_price) / (self.config.grid_levels - 1)
        return [self.config.lower_price + i * step for i in range(self.config.grid_levels)]

    def _allocate_orders(self, buy_levels: List[float], sell_levels: List[float]) -> List[GridOrder]:
        orders: List[GridOrder] = []

        quote_per_buy = self.config.total_quote / len(buy_levels) if buy_levels else 0
        base_per_sell = self.config.total_base / len(sell_levels) if sell_levels else 0

        for price in buy_levels:
            amount = quote_per_buy / price if price else 0
            orders.append(GridOrder(side="buy", price=price, amount=amount, placed=False))

        for price in sell_levels:
            amount = base_per_sell
            orders.append(GridOrder(side="sell", price=price, amount=amount, placed=False))

        return orders

    @staticmethod
    def _extract_reference_price(order_book: Dict[str, Any]) -> float:
        bids = order_book.get("bids", [])
        asks = order_book.get("asks", [])
        if not bids and not asks:
            raise ValueError("Order book does not contain bids or asks")
        best_bid = float(bids[0][0]) if bids else 0
        best_ask = float(asks[0][0]) if asks else 0
        if best_bid and best_ask:
            return (best_bid + best_ask) / 2
        return best_bid or best_ask
