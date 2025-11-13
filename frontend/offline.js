const form = document.getElementById("grid-form");
const resultEl = document.getElementById("result");
const chartStatusEl = document.getElementById("chart-status");
const chartCanvas = document.getElementById("price-chart");

const SERIES_LENGTH = 120;
const UPDATE_INTERVAL = 5000;
let priceSeries = [];
let currentPrice = 0;
let updateTimer = null;

const normaliseNumber = (value) => value.replace(/\s+/g, "").replace(/,/g, ".");

const parseNumberField = (fieldId, label) => {
  const field = document.getElementById(fieldId);
  if (!field) {
    throw new Error(`Nie znaleziono pola "${label}".`);
  }
  const normalised = normaliseNumber(field.value.trim());
  const parsed = Number(normalised);
  if (Number.isNaN(parsed)) {
    throw new Error(`Pole "${label}" zawiera nieprawidłową wartość.`);
  }
  return parsed;
};

const generateInitialSeries = (startPrice) => {
  const now = Math.floor(Date.now() / 1000);
  const series = [];
  let price = startPrice;
  let timestamp = now - (SERIES_LENGTH - 1) * 60;
  for (let i = 0; i < SERIES_LENGTH; i += 1) {
    const drift = 1 + (Math.random() - 0.5) * 0.01;
    price = Math.max(1, price * drift);
    series.push({ timestamp, price });
    timestamp += 60;
  }
  return series;
};

const resizeCanvas = () => {
  if (!chartCanvas) {
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  const { clientWidth, clientHeight } = chartCanvas;
  chartCanvas.width = clientWidth * dpr;
  chartCanvas.height = clientHeight * dpr;
};

const drawSeries = () => {
  if (!chartCanvas || !priceSeries.length) {
    return;
  }

  resizeCanvas();
  const ctx = chartCanvas.getContext("2d");
  if (!ctx) {
    return;
  }
  const dpr = window.devicePixelRatio || 1;
  ctx.save();
  ctx.scale(dpr, dpr);

  const width = chartCanvas.width / dpr;
  const height = chartCanvas.height / dpr;
  ctx.clearRect(0, 0, width, height);

  const margin = 24;
  const usableWidth = Math.max(1, width - margin * 2);
  const usableHeight = Math.max(1, height - margin * 2);

  const prices = priceSeries.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const range = maxPrice - minPrice || 1;

  ctx.fillStyle = "#0f172a";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "rgba(148, 163, 184, 0.15)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i <= 4; i += 1) {
    const y = margin + (i / 4) * usableHeight;
    ctx.moveTo(margin, y);
    ctx.lineTo(width - margin, y);
  }
  ctx.stroke();

  ctx.beginPath();
  priceSeries.forEach((point, index) => {
    const x = margin + (index / (priceSeries.length - 1 || 1)) * usableWidth;
    const y =
      height -
      margin -
      ((point.price - minPrice) / range) * usableHeight;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.strokeStyle = "#38bdf8";
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  priceSeries.forEach((point, index) => {
    const x = margin + (index / (priceSeries.length - 1 || 1)) * usableWidth;
    const y =
      height -
      margin -
      ((point.price - minPrice) / range) * usableHeight;
    ctx.lineTo(x, y);
  });
  ctx.lineTo(width - margin, height - margin);
  ctx.lineTo(margin, height - margin);
  ctx.closePath();
  ctx.fillStyle = "rgba(56, 189, 248, 0.2)";
  ctx.fill();

  ctx.fillStyle = "#94a3b8";
  ctx.font = "12px 'Inter', 'Segoe UI', sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(maxPrice.toFixed(2), margin, margin / 2);
  ctx.textBaseline = "bottom";
  ctx.fillText(minPrice.toFixed(2), margin, height - margin / 2);

  ctx.restore();
};

const scheduleUpdates = () => {
  if (updateTimer) {
    clearInterval(updateTimer);
  }
  updateTimer = setInterval(() => {
    const last = priceSeries[priceSeries.length - 1];
    const drift = 1 + (Math.random() - 0.5) * 0.006;
    const nextPrice = Math.max(1, last.price * drift);
    priceSeries = [...priceSeries.slice(1), { timestamp: last.timestamp + 60, price: nextPrice }];
    currentPrice = nextPrice;
    drawSeries();
    updateStatus();
  }, UPDATE_INTERVAL);
};

const updateStatus = () => {
  if (!chartStatusEl) {
    return;
  }
  chartStatusEl.textContent = `Tryb offline – syntetyczna cena: ${currentPrice.toFixed(2)} USDT`;
  chartStatusEl.classList.remove("error");
};

const buildGridPreview = () => {
  const lowerPrice = parseNumberField("lower-price", "Dolna granica ceny");
  const upperPrice = parseNumberField("upper-price", "Górna granica ceny");
  const gridLevels = parseNumberField("grid-levels", "Liczba poziomów siatki");
  const totalQuote = parseNumberField("total-quote", "Budżet w walucie kwotowanej");
  const totalBase = parseNumberField("total-base", "Budżet w walucie bazowej");

  if (upperPrice <= lowerPrice) {
    throw new Error("Górna granica ceny musi być większa od dolnej.");
  }
  if (gridLevels < 2) {
    throw new Error("Liczba poziomów siatki musi być większa lub równa 2.");
  }

  const step = (upperPrice - lowerPrice) / (gridLevels - 1);
  const gridPrices = Array.from({ length: gridLevels }, (_, index) => lowerPrice + index * step);
  const buyLevels = gridPrices.filter((price) => price < currentPrice);
  const sellLevels = gridPrices.filter((price) => price > currentPrice);

  const orders = [];
  const quotePerBuy = buyLevels.length ? totalQuote / buyLevels.length : 0;
  const basePerSell = sellLevels.length ? totalBase / sellLevels.length : 0;

  buyLevels.forEach((price) => {
    const amount = price ? quotePerBuy / price : 0;
    orders.push({ side: "buy", price, amount });
  });

  sellLevels.forEach((price) => {
    orders.push({ side: "sell", price, amount: basePerSell });
  });

  return {
    referencePrice: currentPrice,
    orders,
  };
};

const formatOrders = (preview) => {
  const lines = [];
  lines.push(`Cena odniesienia (symulowana): ${preview.referencePrice.toFixed(4)} USDT`);
  lines.push("");
  if (!preview.orders.length) {
    lines.push("Brak zleceń w ramach podanych parametrów.");
    return lines.join("\n");
  }
  lines.push("Zlecenia:");
  preview.orders.forEach((order, index) => {
    lines.push(
      `${index + 1}. ${order.side.toUpperCase()} @ ${order.price.toFixed(8)} | Ilość: ${order.amount.toFixed(8)}`
    );
  });
  return lines.join("\n");
};

const handleSubmit = (event) => {
  event.preventDefault();
  try {
    const preview = buildGridPreview();
    resultEl.textContent = formatOrders(preview);
  } catch (error) {
    resultEl.textContent = `Błąd: ${error.message}`;
  }
};

const init = () => {
  const initialPrice = 30000 + Math.random() * 1000;
  priceSeries = generateInitialSeries(initialPrice);
  currentPrice = priceSeries[priceSeries.length - 1]?.price || initialPrice;
  drawSeries();
  updateStatus();
  scheduleUpdates();
  window.addEventListener("resize", drawSeries);
  if (form) {
    form.addEventListener("submit", handleSubmit);
  }
};

init();
