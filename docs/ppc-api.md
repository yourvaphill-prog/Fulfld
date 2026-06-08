# PPC Pilot API — Reference

**Endpoint:** `POST /api/ppc/analyze`

Rule-based PPC analysis engine. Accepts normalized Amazon Ads report rows, returns structured JSON. No AI, no Anthropic keys required.

---

## Authentication

Every request must include the `x-api-key` header:

```
x-api-key: <your-secret>
```

Set the secret in Vercel → Project Settings → Environment Variables:
- **Name:** `PPC_PILOT_API_KEY`
- **Value:** a long random string (e.g. generated with `openssl rand -hex 32`)
- **Environments:** Production, Preview (not needed locally unless you test serverless functions)

The key is never exposed in frontend code or the browser.

---

## Request

```
POST https://your-app.vercel.app/api/ppc/analyze
Content-Type: application/json
x-api-key: your-secret
```

### Body Schema

```jsonc
{
  "campaignRows":   [],   // required — array of normalized campaign rows
  "searchTermRows": [],   // required — array of normalized search term rows
  "productRows":    [],   // required — array of normalized product rows
  "thresholds":     {}    // optional — override default analysis thresholds
}
```

All three row arrays may be empty. An all-empty payload returns zeroed results.

### Row Schema

Each row is a plain JSON object. Use the same field names that `csvNormalizer.js` produces:

| Field | Type | Description |
|---|---|---|
| `campaignName` | string | Campaign name |
| `adGroupName` | string | Ad group name |
| `searchTerm` | string | Customer search term (search term reports) |
| `targeting` | string | Keyword / targeting (alternative to searchTerm) |
| `sku` | string | Advertised SKU |
| `asin` | string | Advertised ASIN |
| `matchType` | string | Match type (Broad, Phrase, Exact) |
| `spend` | number | Ad spend ($) |
| `sales` | number | Total sales ($) |
| `orders` | number | Total orders |
| `clicks` | number | Clicks |
| `impressions` | number | Impressions |
| `ctr` | number | CTR (optional — calculated if missing) |
| `cpc` | number | CPC (optional — calculated if missing) |
| `acos` | number | ACoS as decimal (optional — calculated if missing) |
| `roas` | number | ROAS (optional — calculated if missing) |

The engine will enrich missing metrics (ACoS, ROAS, CTR, CPC, CVR) automatically.

### Threshold Options

All thresholds are optional. Defaults match the PPC Pilot UI Settings panel.

| Field | Default | Description |
|---|---|---|
| `targetACoS` | `0.30` | Target ACoS (30%) |
| `goodROASThreshold` | `3.0` | ROAS required for "strong" classification |
| `minOrders` | `1` | Minimum orders to appear in winner list |
| `maxNoOrderSpend` | `10.00` | Spend ($) with 0 orders → urgent waste flag |
| `minClicks` | `10` | Minimum clicks for negative phrase suggestion |
| `minImpressions` | `100` | Minimum impressions for data sufficiency |
| `lowCTRThreshold` | `0.002` | CTR below this → at-risk flag |
| `highCPCThreshold` | `2.00` | CPC above this → high CPC flag |

---

## Response

```jsonc
{
  "accountSnapshot": {
    "spend": 1234.56,
    "sales": 4500.00,
    "orders": 87,
    "acos": 0.2743,
    "roas": 3.65,
    "clicks": 892,
    "impressions": 44210,
    "ctr": 0.0202,
    "cpc": 1.38,
    "cvr": 0.0975
  },

  "urgentWaste": [
    {
      "type": "campaign",           // "campaign" | "searchTerm"
      "entity": "Campaign Name",
      "spend": 45.20,
      "orders": 0,
      "reason": "$45.20 spent with 0 orders"
    }
  ],

  "negativeKeywordCandidates": [
    {
      "searchTerm": "cheap widget",
      "campaignName": "My Campaign",
      "adGroupName": "Ad Group 1",
      "negType": "Negative Exact",   // "Negative Exact" | "Negative Phrase" | "Review First"
      "spend": 18.40,
      "clicks": 12,
      "orders": 0,
      "acos": null,
      "reason": "$18.40 spent with zero orders — definitive wasted spend"
    }
  ],

  "winningKeywords": {
    "provenWinners": [
      {
        "searchTerm": "blue widget",
        "campaignName": "Exact Match - Blue",
        "adGroupName": null,
        "matchType": "Exact",
        "orders": 5,
        "spend": 22.10,
        "sales": 149.95,
        "acos": 0.147,
        "roas": 6.78,
        "tier": 1,
        "label": "High Priority Winner",
        "action": "Move to Exact Match — increase bid carefully",
        "note": "5 orders, ACoS 14.7%, ROAS 6.78x — proven winner, exceeds all targets"
      }
    ],
    "earlyWinners": [
      {
        "searchTerm": "red widget",
        "tier": 2,
        "label": "Early Winner",
        "orders": 2,
        "acos": 0.218,
        "roas": 4.58,
        "note": "2 orders, ACoS 21.8%, ROAS 4.58x — promising early signal, needs more data"
      }
    ],
    "monitor": []
  },

  "scaleOpportunities": [
    {
      "campaignName": "Exact - Blue Widget",
      "status": "Scale Opportunity",
      "budgetDelta": "+15–20%",
      "recommendedAction": "Increase budget by 15–20%",
      "avgAcos": 0.182,
      "avgRoas": 5.49,
      "totalSpend": 88.30,
      "totalOrders": 12,
      "reason": "ACoS 18.2% (target 30.0%), ROAS 5.49x — all efficiency targets exceeded"
    }
  ],

  "productReadiness": [
    {
      "asin": "B01EXAMPLE1",
      "sku": "WIDGET-BLUE-L",
      "label": "Ready to Scale",
      "statusGroup": "scale",
      "score": 82,
      "totalOrders": 14,
      "totalSpend": 95.20,
      "avgAcos": 0.192,
      "avgRoas": 5.21,
      "reason": "ACoS 19.2% (target 30.0%), ROAS 5.21x, CVR 9.8% — all efficiency targets met",
      "action": "Increase ad support on this ASIN. Consider a dedicated Exact Match campaign or raise campaign budget by 15–20%."
    }
  ],

  "campaignRecommendations": [
    {
      "severity": "HIGH",                 // "HIGH" | "MEDIUM" | "OPPORTUNITY"
      "type": "campaign",
      "entity": "Campaign Name",
      "headline": "High spend, zero orders — Campaign Name",
      "explanation": "This campaign has spent $45.20 with no orders.",
      "action": "Pause the campaign or significantly lower bids."
    }
  ],

  "dailyActionChecklist": {
    "addNegatives":    ["cheap widget", "free widget"],
    "reduceBids":      ["Campaign with High ACoS"],
    "increaseBudgets": ["Profitable Campaign A"],
    "moveToExact":     ["blue widget", "red widget premium"],
    "watchlist":       ["Campaign at Risk - Low CTR"]
  },

  "bossReportData": {
    "accountHealthScore": 72,
    "healthLabel": "Healthy",
    "wins": [
      "Campaign \"Exact - Blue Widget\" is scaling — ACoS 18.2%, ROAS 5.49x",
      "Proven winner: \"blue widget\" — 5 orders, ACoS 14.7%"
    ],
    "issues": [
      "High spend, zero orders — Broad Match - Generic"
    ],
    "nextSteps": [
      "Increase budget on 2 scale-ready campaigns",
      "Pause 1 campaign with zero orders"
    ],
    "campaignSummary": {
      "total": 8, "scale": 2, "optimize": 3, "atRisk": 1, "pause": 1, "spendAtRisk": 45.20
    },
    "productSummary": {
      "total": 4, "readyToScale": 1, "monitor": 2, "needsReview": 1, "poorFit": 0
    }
  },

  "aiReadySummary": {
    "reportDateRange":    null,
    "totalCampaigns":     8,
    "totalSearchTerms":   142,
    "provenWinnerCount":  3,
    "earlyWinnerCount":   5,
    "urgentWasteCount":   2,
    "topRecommendation":  "Pause the campaign or significantly lower bids.",
    "accountSpend":       1234.56,
    "accountSales":       4500.00,
    "accountAcos":        0.2743,
    "accountRoas":        3.65
  }
}
```

---

## Winner Classification Logic

| Tier | Label | Condition |
|---|---|---|
| 1 | High Priority Winner | orders ≥ 3 AND acos ≤ targetACoS AND roas ≥ goodROASThreshold |
| 2 | Early Winner | 1–2 orders AND acos ≤ targetACoS AND roas ≥ goodROASThreshold |
| 3 | Move to Exact Match | orders ≥ minOrders AND acos ≤ targetACoS (ROAS below strong threshold) |
| 4 | Increase Bid | orders > 0 AND acos slightly above target AND roas ≥ 1 |
| 5 | Keep Monitoring | orders > 0 AND acos well above target |

**1-order terms are never Tier 1 / High Priority Winner.**

---

## Error Responses

| Status | Meaning |
|---|---|
| `400` | Bad request — invalid body or row arrays not arrays |
| `401` | Missing or wrong `x-api-key` |
| `405` | Wrong HTTP method (must be POST) |
| `413` | Payload too large (> 50,000 total rows) |
| `500` | Internal error — server misconfigured or analysis threw |

---

## curl Test Examples

### 1. Unauthorized (expect 401)
```bash
curl -X POST https://your-app.vercel.app/api/ppc/analyze \
  -H "Content-Type: application/json" \
  -d '{}'
```

### 2. Empty authorized payload (expect 200, all arrays empty)
```bash
curl -X POST https://your-app.vercel.app/api/ppc/analyze \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_SECRET" \
  -d '{"campaignRows":[],"searchTermRows":[],"productRows":[]}'
```

### 3. Small fixture with known results
```bash
curl -X POST https://your-app.vercel.app/api/ppc/analyze \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_SECRET" \
  -d '{
    "searchTermRows": [
      {
        "searchTerm": "proven winner term",
        "campaignName": "Auto Campaign",
        "spend": 22.10, "sales": 149.95, "orders": 4,
        "clicks": 41, "impressions": 2100,
        "acos": 0.147, "roas": 6.78
      },
      {
        "searchTerm": "early winner term",
        "campaignName": "Auto Campaign",
        "spend": 8.40, "sales": 39.98, "orders": 2,
        "clicks": 18, "impressions": 900,
        "acos": 0.210, "roas": 4.76
      },
      {
        "searchTerm": "wasted spend term",
        "campaignName": "Auto Campaign",
        "spend": 15.80, "sales": 0, "orders": 0,
        "clicks": 22, "impressions": 1100
      }
    ],
    "campaignRows": [
      {
        "campaignName": "Auto Campaign",
        "spend": 46.30, "sales": 189.93, "orders": 6,
        "clicks": 81, "impressions": 4100
      }
    ],
    "productRows": [],
    "thresholds": { "targetACoS": 0.30, "goodROASThreshold": 3.0, "minOrders": 1 }
  }'
```

**Expected in response:**
- `winningKeywords.provenWinners` → `"proven winner term"` (4 orders ≥ 3, good ACoS/ROAS)
- `winningKeywords.earlyWinners` → `"early winner term"` (2 orders, good ACoS/ROAS)
- `urgentWaste` or `negativeKeywordCandidates` → `"wasted spend term"` ($15.80, 0 orders)

---

## Local Testing (dev)

The Vercel serverless function only runs in the Vercel environment or via `vercel dev`.
To test locally:

```bash
# Install Vercel CLI if needed
npm i -g vercel

# Run local dev server (serves both Vite frontend and /api/* functions)
vercel dev
```

Then use the same curl commands with `http://localhost:3000` instead of the production URL.

---

## Environment Variables Required

| Variable | Where | Description |
|---|---|---|
| `PPC_PILOT_API_KEY` | Vercel env vars | The secret key callers send in `x-api-key` header |

No Anthropic API key, no database, no external services required.
