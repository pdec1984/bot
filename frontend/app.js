const form = document.getElementById("grid-form");
const resultEl = document.getElementById("result");
const pairInput = document.getElementById("currency-pair");
const chartCanvas = document.getElementById("price-chart");
const chartStatusEl = document.getElementById("chart-status");

let priceChart = null;
let priceUpdateInterval = null;
let pairInputDebounce = null;

const ensureInputsEditable = () => {
  if (!form) {
    return;
  }
  Array.from(form.querySelectorAll("input")).forEach((input) => {
    input.disabled = false;
    input.readOnly = false;
  });
};

ensureInputsEditable();

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

const fetchJSON = async (url, options = {}) => {
  const response = await fetch(url, options);
  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (!response.ok || data === null) {
    const message = data && data.detail ? data.detail : `Żądanie ${url} nie powiodło się.`;
    throw new Error(message);
  }

  return data;
};

const formatOrder = (order, index) => {
  const header = `${index + 1}. ${order.side.toUpperCase()} @ ${Number(order.price).toFixed(8)}`;
  const amount = `  Ilość: ${Number(order.amount).toFixed(8)}`;
  const status = `  Zlecenie wysłane: ${order.placed ? "TAK" : "NIE"}`;
  return [header, amount, status].join("\n");
};

const timeLabel = (timestamp) => {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString("pl-PL", {
    hour: "2-digit",
    minute: "2-digit",
  });
};

const buildChart = (candles) => {
  if (!chartCanvas) {
    return;
  }

  const labels = candles.map((candle) => timeLabel(candle.timestamp));
  const values = candles.map((candle) => candle.close);

  if (priceChart) {
    priceChart.destroy();
  }

  priceChart = new Chart(chartCanvas, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: "Cena zamknięcia",
          data: values,
          borderColor: "#38bdf8",
          backgroundColor: "rgba(56, 189, 248, 0.2)",
          borderWidth: 2,
          tension: 0.25,
          pointRadius: 0,
        },
      ],
    },
    options: {
      maintainAspectRatio: false,
      scales: {
        x: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148, 163, 184, 0.15)" },
        },
        y: {
          ticks: { color: "#94a3b8" },
          grid: { color: "rgba(148, 163, 184, 0.15)" },
        },
      },
      plugins: {
        legend: {
          labels: {
            color: "#f8fafc",
          },
        },
        tooltip: {
          callbacks: {
            label: (context) => `Cena: ${Number(context.parsed.y).toFixed(4)} USDT`,
          },
        },
      },
    },
  });
};

const appendTickerPoint = (ticker) => {
  if (!priceChart) {
    return;
  }
  const label = timeLabel(ticker.timestamp);
  const price = Number(ticker.last);
  if (Number.isNaN(price)) {
    return;
  }

  const { labels, datasets } = priceChart.data;
  const dataSeries = datasets[0].data;

  const lastLabel = labels[labels.length - 1];
  if (lastLabel === label && dataSeries.length) {
    dataSeries[dataSeries.length - 1] = price;
  } else {
    labels.push(label);
    dataSeries.push(price);
    if (labels.length > 180) {
      labels.shift();
      dataSeries.shift();
    }
  }
  priceChart.update("none");
};

const loadChartData = async (currencyPair) => {
  if (!chartCanvas || !currencyPair) {
    return;
  }
  try {
    const data = await fetchJSON(
      `/api/candlesticks/${encodeURIComponent(currencyPair)}?interval=1m&limit=60`
    );
    const candles = data.candles || [];
    if (!candles.length) {
      if (priceChart) {
        priceChart.destroy();
        priceChart = null;
      }
      if (chartStatusEl) {
        chartStatusEl.textContent = `Brak danych świecowych dla ${currencyPair}.`;
        chartStatusEl.classList.add("error");
      }
      return;
    }
    buildChart(candles);
    if (chartStatusEl) {
      chartStatusEl.textContent = "Dane odświeżane co 5 sekund.";
      chartStatusEl.classList.remove("error");
    }
  } catch (error) {
    console.error("Błąd ładowania świec:", error);
    if (chartStatusEl) {
      chartStatusEl.textContent = `Nie udało się pobrać danych świecowych: ${error.message}`;
      chartStatusEl.classList.add("error");
    }
  }
};

const scheduleTickerUpdates = (currencyPair) => {
  if (priceUpdateInterval) {
    clearInterval(priceUpdateInterval);
  }
  if (!currencyPair) {
    return;
  }
  priceUpdateInterval = setInterval(async () => {
    try {
      const ticker = await fetchJSON(`/api/ticker/${encodeURIComponent(currencyPair)}`);
      appendTickerPoint(ticker);
    } catch (error) {
      console.error("Błąd aktualizacji ticker:", error);
      if (chartStatusEl) {
        chartStatusEl.textContent = `Błąd aktualizacji ticker: ${error.message}`;
        chartStatusEl.classList.add("error");
      }
    }
  }, 5000);
};

const refreshChart = async (currencyPair) => {
  const pair = currencyPair.trim();
  if (!pair) {
    return;
  }
  if (chartStatusEl) {
    chartStatusEl.textContent = "Ładowanie danych z Gate.io...";
    chartStatusEl.classList.remove("error");
  }
  await loadChartData(pair);
  scheduleTickerUpdates(pair);
};

if (pairInput && chartCanvas) {
  refreshChart(pairInput.value.trim());

  pairInput.addEventListener("change", () => {
    refreshChart(pairInput.value);
  });

  pairInput.addEventListener("input", () => {
    if (pairInputDebounce) {
      clearTimeout(pairInputDebounce);
    }
    pairInputDebounce = setTimeout(() => {
      refreshChart(pairInput.value);
    }, 800);
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();

  let lowerPrice;
  let upperPrice;
  let totalQuote;
  let totalBase;

  try {
    lowerPrice = parseNumberField("lower-price", "Dolna granica ceny");
    upperPrice = parseNumberField("upper-price", "Górna granica ceny");
    totalQuote = parseNumberField("total-quote", "Budżet w walucie kwotowanej");
    totalBase = parseNumberField("total-base", "Budżet w walucie bazowej");
  } catch (parseError) {
    resultEl.textContent = `Błąd: ${parseError.message}`;
    return;
  }

  const payload = {
    api_key: document.getElementById("api-key").value,
    api_secret: document.getElementById("api-secret").value,
    currency_pair: pairInput.value.trim().toUpperCase(),
    lower_price: lowerPrice,
    upper_price: upperPrice,
    grid_levels: Number(document.getElementById("grid-levels").value),
    total_quote: totalQuote,
    total_base: totalBase,
    dry_run: document.getElementById("dry-run").checked,
  };

  resultEl.textContent = "Uruchamianie strategii...";

  try {
    const data = await fetchJSON("/api/start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const orders = data.orders || [];

    const lines = [
      `Aktualna cena referencyjna: ${Number(data.current_price).toFixed(8)}`,
      `Tryb: ${data.dry_run ? "Dry-run (testowy)" : "Live"}`,
      "",
      orders.length ? "Wygenerowane zlecenia:" : "Brak zleceń do wyświetlenia.",
      ...orders.map((order, idx) => formatOrder(order, idx)),
    ];

    resultEl.textContent = lines.join("\n");
  } catch (error) {
    console.error(error);
    resultEl.textContent = `Błąd: ${error.message}`;
  }
});
