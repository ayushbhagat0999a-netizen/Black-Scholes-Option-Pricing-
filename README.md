# Black–Scholes Option Pricing Dashboard

![Uploading Screenshot 2026-06-20 114414.png…]()


A professional-grade option pricer with real-time Greeks, a payoff chart, and an implied volatility solver. Built as a **single self-contained HTML file** — open it in a browser and it just works.

---

## Features

- **Merton (1973) extension** — supports a continuous dividend yield `q`
- **All standard Greeks** — Delta, Gamma, Theta (daily), Vega (per 1 % vol)
- **Probability of ITM** — risk-neutral `N(d₂)` / `N(-d₂)` shown on each price card
- **Implied Volatility solver** — Newton–Raphson with fail‑safe fallbacks; toggles on/off
- **Interactive payoff chart** — P/L at expiration for both call and put (Chart.js)
- **URL state sharing** — every slider move updates the address bar; paste the link to share a specific scenario
- **Dark‑theme responsive UI** — 2-column desktop layout collapses to single column on mobile
- **Edge‑case safe** — gracefully handles `T=0`, `σ=0`, `S≤0`

---

## Quick start

### Standalone (no server needed)

Open **`dashboard.html`** directly in any modern browser.

### Flask server (optional)

```bash
pip install -r requirements.txt
python app.py
```

Open `http://localhost:5000` in your browser.

---

## Usage

| Input | Range | Description |
|---|---|---|
| Spot Price `S` | 1 – 500 | Current price of the underlying |
| Strike Price `K` | 1 – 500 | Option exercise price |
| Days to Expiry `T` | 1 – 730 | Converted to years internally |
| Risk‑Free Rate `r` | 0 – 50 % | Continuous rate |
| Volatility `σ` | 1 – 150 % | Annualised |
| Dividend Yield `q` | 0 – 20 % | Continuous yield (Merton extension) |

Toggle the **Implied Volatility Mode** to enter market prices and reverse‑engineer the market's implied volatility for the call and put separately.

---

## Math

<details>
<summary>Black–Scholes formulas (click to expand)</summary>

```
d₁ = [ln(S/K) + (r − q + ½σ²)·T] / (σ·√T)
d₂ = d₁ − σ·√T

Call = S·e⁻ᵠᵀ·N(d₁) − K·e⁻ʳᵀ·N(d₂)
Put  = K·e⁻ʳᵀ·N(−d₂) − S·e⁻ᵠᵀ·N(−d₁)

Δ_call = e⁻ᵠᵀ·N(d₁)
Δ_put  = e⁻ᵠᵀ·(N(d₁) − 1)
Γ      = e⁻ᵠᵀ·N'(d₁) / (S·σ·√T)

Θ_call = −(S·e⁻ᵠᵀ·N'(d₁)·σ)/(2·√T) − r·K·e⁻ʳᵀ·N(d₂) + q·S·e⁻ᵠᵀ·N(d₁)
Θ_put  = −(S·e⁻ᵠᵀ·N'(d₁)·σ)/(2·√T) + r·K·e⁻ʳᵀ·N(−d₂) − q·S·e⁻ᵠᵀ·N(−d₁)

ν = S·e⁻ᵠᵀ·√T·N'(d₁)  (per 1 % vol, i.e. ×0.01)
```

P(ITM_call) = N(d₂)  
P(ITM_put)  = N(−d₂)
</details>

---

## Tech stack

| Layer | Technology |
|---|---|
| **Client** | Vanilla JavaScript, Chart.js (CDN), CSS Grid / Flexbox |
| **Server** *(optional)* | Python 3, Flask, SciPy (`scipy.stats.norm`) |
| **Normal CDF** | Abramowitz & Stegun approximation (accuracy ~1.5×10⁻⁷) built into the client JS — no extra libraries needed |

---

## Project structure

```
├── dashboard.html       # Standalone single-page app (open in browser)
├── app.py               # Flask backend (optional)
├── requirements.txt     # Python dependencies
├── static/
│   ├── script.js        # Front-end logic for Flask version
│   └── style.css        # Styles for Flask version
└── templates/
    └── index.html       # Flask template
```
