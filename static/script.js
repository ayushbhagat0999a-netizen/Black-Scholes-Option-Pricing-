/**
 * Black-Scholes Option Pricing Dashboard — Real-Time Logic
 * =========================================================
 * Synchronises five paired (range-slider ↔ numeric-input) controls and
 * fires fetch POSTs to the Flask backend. Updates price cards, Greeks
 * table, implied volatility results, and the payoff chart in real-time.
 *
 * UI features:
 *   • Toast notifications for edge-case warnings
 *   • OTM / ITM / ATM visual cues on the output cards
 *   • Defensive slider clamping to prevent divide-by-zero
 */

(function () {
  "use strict";

  // =======================================================================
  //  DOM references
  // =======================================================================

  // Prices + cards
  const callEl    = document.getElementById("callPrice");
  const putEl     = document.getElementById("putPrice");
  const callCard  = document.getElementById("callCard");
  const putCard   = document.getElementById("putCard");
  const callStat  = document.getElementById("callStatus");
  const putStat   = document.getElementById("putStatus");
  const callProbEl = document.getElementById("callProb");
  const putProbEl  = document.getElementById("putProb");

  // Greeks
  const greekIds = {
    call: ["callDelta",  "callGamma",  "callTheta",  "callVega"],
    put:  ["putDelta",   "putGamma",   "putTheta",   "putVega"],
  };

  // Parameter controls (id → { slider, number, display })
  const paramDefs = ["S", "K", "T", "r", "sigma", "q"];
  const params = paramDefs.map((id) => ({
    id,
    slider:  document.getElementById(id),
    number:  document.getElementById(id).nextElementSibling,
    display: document.getElementById(`${id}_display`),
  }));

  // IV elements
  const ivToggle      = document.getElementById("ivToggle");
  const ivControls    = document.getElementById("ivControls");
  const ivCallPrice   = document.getElementById("ivCallPrice");
  const ivPutPrice    = document.getElementById("ivPutPrice");
  const ivCallResult  = document.getElementById("ivCallResult");
  const ivPutResult   = document.getElementById("ivPutResult");
  const ivSpread      = document.getElementById("ivSpread");

  // Sigma slider (needs to be disabled in IV mode)
  const sigmaSlider   = document.getElementById("sigma");
  const sigmaNumber   = sigmaSlider.nextElementSibling;

  // Toast container
  const toastContainer = document.getElementById("toastContainer");

  // Chart (guarded — app works without Chart.js)
  const chartCanvas   = document.getElementById("payoffChart");
  let chartInstance   = null;

  // =======================================================================
  //  Helpers
  // =======================================================================

  function fmt(v, decimals = 2) {
    return Number(v).toFixed(decimals);
  }

  /** Grab current slider values, converting % params to decimals. */
  function getPayload() {
    const payload = {};
    for (const p of params) {
      let val = parseFloat(p.slider.value);
      if (p.id === "r" || p.id === "sigma" || p.id === "q") val /= 100;
      if (p.id === "T") val /= 365;
      payload[p.id] = val;
    }
    return payload;
  }

  // =======================================================================
  //  Toast notification system
  // =======================================================================

  function showToast(message, type, duration) {
    if (!toastContainer) return;
    duration = duration || 4000;

    var toast = document.createElement("div");
    toast.className = "toast toast--" + (type || "info");
    toast.textContent = message;
    toastContainer.appendChild(toast);

    // Animate in on next frame
    requestAnimationFrame(function () {
      toast.classList.add("toast--visible");
    });

    // Auto-remove after duration
    setTimeout(function () {
      toast.classList.remove("toast--visible");
      toast.addEventListener("transitionend", function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      });
    }, duration);
  }

  // =======================================================================
  //  Slider ↔ Number syncing (defensive — enforces slider bounds)
  // =======================================================================

  function syncDisplay(param) {
    var v = parseFloat(param.slider.value);
    param.number.value = v;
    param.display.textContent =
      param.id === "r" || param.id === "sigma" || param.id === "q" ? fmt(v, 2)
        : param.id === "T" ? fmt(v, 0) : fmt(v, 1);
  }

  function syncSlider(param) {
    var v = parseFloat(param.number.value);
    var min = parseFloat(param.slider.min);
    var max = parseFloat(param.slider.max);
    var clamped = Math.min(max, Math.max(min, v));
    param.slider.value = clamped;
    param.display.textContent =
      param.id === "r" || param.id === "sigma" || param.id === "q" ? fmt(clamped, 2)
        : param.id === "T" ? fmt(clamped, 0) : fmt(clamped, 1);
  }

  // =======================================================================
  //  Greeks table updater
  // =======================================================================

  function updateGreeks(greeks) {
    if (!greeks) return;
    for (var side = 0; side < 2; side++) {
      var s = side === 0 ? "call" : "put";
      var g = greeks[s];
      var ids = greekIds[s];
      document.getElementById(ids[0]).textContent = fmt(g.delta, 4);
      document.getElementById(ids[1]).textContent = fmt(g.gamma, 4);
      document.getElementById(ids[2]).textContent = fmt(g.theta, 4);
      document.getElementById(ids[3]).textContent = fmt(g.vega, 4);
    }
  }

  // =======================================================================
  //  Stateful visual cues — OTM / ITM / ATM
  // =======================================================================

  function updateMoneyness(S, K) {
    // Reset
    callCard.classList.remove("output-card--otm", "output-card--atm");
    putCard.classList.remove("output-card--otm", "output-card--atm");

    var diff = Math.abs(S - K);
    var threshold = 0.01; // within 1 cent = ATM

    if (diff <= threshold) {
      // At-the-money
      callCard.classList.add("output-card--atm");
      putCard.classList.add("output-card--atm");
      callStat.textContent = "ATM";
      putStat.textContent  = "ATM";
    } else if (S > K) {
      // Call ITM, Put OTM
      putCard.classList.add("output-card--otm");
      callStat.textContent = "ITM";
      putStat.textContent  = "OTM";
    } else {
      // Put ITM, Call OTM
      callCard.classList.add("output-card--otm");
      callStat.textContent = "OTM";
      putStat.textContent  = "ITM";
    }
  }

  // =======================================================================
  //  Payoff chart
  // =======================================================================

  var CHART_COLORS = {
    call: { line: "rgba(34, 197, 94, 0.85)", fill: "rgba(34, 197, 94, 0.12)" },
    put:  { line: "rgba(239, 68, 68, 0.85)", fill: "rgba(239, 68, 68, 0.12)" },
    zero: "rgba(156, 163, 175, 0.4)",
  };

  function buildPayoffData(K, callPremium, putPremium) {
    var maxX = Math.max(K * 2, 200);
    var step = maxX / 60;
    var labels = [];
    var callPL = [];
    var putPL = [];

    for (var x = 0; x <= maxX; x += step) {
      labels.push(x);
      callPL.push(Math.max(x - K, 0) - callPremium);
      putPL.push(Math.max(K - x, 0) - putPremium);
    }
    return { labels: labels, callPL: callPL, putPL: putPL };
  }

  // Guarded chart initialisation — if Chart.js didn't load the app still works
  var ChartJS = (typeof Chart !== "undefined") ? Chart : null;

  if (ChartJS) {
    var zeroLinePlugin = {
      id: "zeroLine",
      afterDraw: function (chart) {
        var ctx = chart.ctx;
        var left = chart.chartArea.left;
        var right = chart.chartArea.right;
        var top = chart.chartArea.top;
        var bottom = chart.chartArea.bottom;
        var y = chart.scales.y;
        var yZero = y.getPixelForValue(0);
        if (yZero >= top && yZero <= bottom) {
          ctx.save();
          ctx.beginPath();
          ctx.strokeStyle = CHART_COLORS.zero;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([6, 4]);
          ctx.moveTo(left, yZero);
          ctx.lineTo(right, yZero);
          ctx.stroke();
          ctx.restore();
        }
      },
    };
    ChartJS.register(zeroLinePlugin);
  }

  function renderChart(K_val, callPremium, putPremium) {
    if (!ChartJS) return; // silently skip chart if CDN unavailable

    var data = buildPayoffData(K_val, callPremium, putPremium);

    if (chartInstance) chartInstance.destroy();

    chartInstance = new ChartJS(chartCanvas, {
      type: "line",
      data: {
        labels: data.labels,
        datasets: [
          {
            label: "Call P/L",
            data: data.callPL,
            borderColor: CHART_COLORS.call.line,
            backgroundColor: CHART_COLORS.call.fill,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2,
          },
          {
            label: "Put P/L",
            data: data.putPL,
            borderColor: CHART_COLORS.put.line,
            backgroundColor: CHART_COLORS.put.fill,
            fill: true,
            tension: 0.4,
            pointRadius: 0,
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top", labels: { boxWidth: 12, padding: 16 } },
          tooltip: {
            callbacks: {
              label: function (ctx) {
                return ctx.dataset.label + ": $" + fmt(ctx.parsed.y, 2);
              },
            },
          },
        },
        scales: {
          x: {
            title: { display: true, text: "Underlying Price at Expiration" },
            grid: { color: "rgba(255,255,255,0.06)" },
            ticks: { callback: function (v) { return "$" + v; } },
          },
          y: {
            title: { display: true, text: "Profit / Loss ($)" },
            grid: { color: "rgba(255,255,255,0.06)" },
            ticks: { callback: function (v) { return "$" + fmt(v, 0); } },
          },
        },
        interaction: { mode: "nearest", intersect: false },
      },
    });
  }

  // =======================================================================
  //  API calls
  // =======================================================================

  /** Main pricing call — prices, Greeks, chart data */
  async function fetchPrices() {
    var payload = getPayload();

    try {
      var res = await fetch("/calculate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error("Server " + res.status);

      var data = await res.json();

      if (data.error) {
        callEl.textContent = "ERR";
        putEl.textContent  = "ERR";
        if (callProbEl) callProbEl.textContent = "\u2014";
        if (putProbEl)  putProbEl.textContent  = "\u2014";
        return;
      }

      callEl.textContent = "$" + fmt(data.call, 2);
      putEl.textContent  = "$" + fmt(data.put,  2);

      if (callProbEl) callProbEl.textContent = "ITM " + fmt((data.call_prob || 0) * 100, 1) + "%";
      if (putProbEl)  putProbEl.textContent  = "ITM " + fmt((data.put_prob || 0) * 100, 1) + "%";

      // Greeks
      updateGreeks(data.greeks);

      // Stateful visual cues — OTM / ITM / ATM
      updateMoneyness(payload.S, payload.K);

      renderChart(payload.K, data.call, data.put);
      syncURL();

      // IV: if active, re-calc implied vols
      if (ivToggle.checked) {
        fetchIV();
      }

    } catch (err) {
      console.error("Fetch failed:", err);
      callEl.textContent = "\u2014";
      putEl.textContent  = "\u2014";
      if (callProbEl) callProbEl.textContent = "\u2014";
      if (putProbEl)  putProbEl.textContent  = "\u2014";
    }
  }

  // =======================================================================
  //  Implied Volatility calls
  // =======================================================================

  var _ivCallRaw = null;
  var _ivPutRaw  = null;

  async function fetchIV() {
    var basePayload = getPayload();
    var callMkt = parseFloat(ivCallPrice.value) || 0;
    var putMkt  = parseFloat(ivPutPrice.value)  || 0;

    async function solveIV(market_price, option_type) {
      if (market_price <= 0) return null;
      try {
        var res = await fetch("/implied-volatility", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            market_price: market_price,
            S: basePayload.S,
            K: basePayload.K,
            T: basePayload.T,
            r: basePayload.r,
            option_type: option_type,
          }),
        });
        var d = await res.json();
        return d.error ? null : d.implied_volatility;
      } catch (e) {
        return null;
      }
    }

    var ivCall = await solveIV(callMkt, "call");
    var ivPut  = await solveIV(putMkt,  "put");

    _ivCallRaw = ivCall;
    _ivPutRaw  = ivPut;

    ivCallResult.textContent = ivCall != null ? fmt(ivCall * 100, 2) + "%" : "\u2014";
    ivPutResult.textContent  = ivPut  != null ? fmt(ivPut  * 100, 2) + "%" : "\u2014";

    if (ivCall != null && ivPut != null) {
      ivSpread.textContent = fmt((ivCall - ivPut) * 100, 2) + " pts";
    } else {
      ivSpread.textContent = "\u2014";
    }
  }

  // =======================================================================
  //  URL state sharing
  // =======================================================================

  function syncURL() {
    var urlParams = new URLSearchParams();
    for (var i = 0; i < params.length; i++) {
      urlParams.set(params[i].id, params[i].slider.value);
    }
    var qs = urlParams.toString();
    var url = window.location.pathname + (qs ? "?" + qs : "");
    history.replaceState(null, "", url);
  }

  function readURLParams() {
    var urlParams = new URLSearchParams(window.location.search);
    if (urlParams.toString() === "") return false;

    for (var i = 0; i < params.length; i++) {
      var p = params[i];
      var val = urlParams.get(p.id);
      if (val !== null) {
        val = parseFloat(val);
        var min = parseFloat(p.slider.min);
        var max = parseFloat(p.slider.max);
        val = Math.min(max, Math.max(min, val));
        p.slider.value = val;
        p.number.value = val;
        p.display.textContent = (p.id === "r" || p.id === "sigma" || p.id === "q") ? fmt(val, 2) : (p.id === "T") ? fmt(val, 0) : fmt(val, 1);
      }
    }
    return true;
  }

  // =======================================================================
  //  Debounce
  // =======================================================================

  var debounceTimer = null;

  function scheduleFetch() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(fetchPrices, 30);
  }

  // =======================================================================
  //  IV toggle logic
  // =======================================================================

  ivToggle.addEventListener("change", function () {
    var active = ivToggle.checked;
    ivControls.hidden = !active;

    sigmaSlider.disabled = active;
    sigmaNumber.disabled = active;

    ivCallPrice.disabled = !active;
    ivPutPrice.disabled  = !active;

    if (!active) {
      ivCallResult.textContent = "\u2014";
      ivPutResult.textContent  = "\u2014";
      ivSpread.textContent     = "\u2014";
    }

    showToast(
      active
        ? "IV mode active \u2014 sigma is now calculated from market prices"
        : "Switched back to price mode",
      active ? "info" : "info",
      2500
    );

    fetchPrices();
  });

  ivCallPrice.addEventListener("input", scheduleFetch);
  ivPutPrice.addEventListener("input", scheduleFetch);

  // =======================================================================
  //  Defensive slider / input guards (edge-case protection)
  // =======================================================================

  // Prevent T from reaching exactly 0 (divide-by-zero in d1/d2)
  function guardTimeParam(param, rawValue) {
    var min = parseFloat(param.slider.min);
    if (rawValue < min) {
      param.slider.value = min;
      param.number.value = min;
      param.display.textContent = fmt(min, 2);
      showToast(
        "Days to expiry cannot be below " + min,
        "warning",
        3000
      );
      return true;
    }
    return false;
  }

  // Prevent sigma slider from reaching exactly 0
  function guardVolatilityParam(param, rawValue) {
    var min = parseFloat(param.slider.min);
    if (rawValue < min) {
      param.slider.value = min;
      param.number.value = min;
      param.display.textContent = fmt(min, 2);
      showToast(
        "Volatility cannot be zero \u2014 minimum is " + min + "%",
        "warning",
        3000
      );
      return true;
    }
    return false;
  }

  // =======================================================================
  //  Wire parameter controls
  // =======================================================================

  for (var i = 0; i < params.length; i++) {
    var p = params[i];

    (function (param) {
      param.slider.addEventListener("input", function () {
        var raw = parseFloat(param.slider.value);
        if (param.id === "T") guardTimeParam(param, raw);
        if (param.id === "sigma") guardVolatilityParam(param, raw);
        syncDisplay(param);
        scheduleFetch();
      });

      param.number.addEventListener("input", function () {
        var raw = parseFloat(param.number.value);
        if (param.id === "T") guardTimeParam(param, raw);
        if (param.id === "sigma") guardVolatilityParam(param, raw);
        syncSlider(param);
        scheduleFetch();
      });
    })(p);
  }

  // =======================================================================
  //  Initialise — read URL params or use defaults, then calculate
  // =======================================================================

  readURLParams();
  fetchPrices();
})();
