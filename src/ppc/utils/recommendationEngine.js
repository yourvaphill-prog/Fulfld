/**
 * Generates rule-based recommendations from all parsed PPC data.
 * Returns an array of recommendation objects sorted by severity.
 */

const SEVERITY_ORDER = { HIGH: 0, OPPORTUNITY: 1, MEDIUM: 2 };

export function generateRecommendations(data, thresholds) {
  const recs = [];
  const { campaigns, searchTerms, products } = data;
  const t = thresholds;

  // ── Campaign rules ───────────────────────────────────────────────────────
  for (const c of campaigns) {
    const name = c.campaignName ?? c.targeting ?? '(unknown campaign)';

    // RULE 1 — No-order wasted spend
    if ((c.spend ?? 0) >= t.maxNoOrderSpend && (c.orders ?? 0) === 0) {
      recs.push({
        severity: 'HIGH',
        type: 'campaign',
        entity: name,
        headline: `High spend, zero orders — ${name}`,
        explanation: `This campaign has spent $${c.spend?.toFixed(2)} with no orders. Ad budget is being consumed without return.`,
        action: 'Pause the campaign or significantly lower bids. Review search terms and targeting before resuming.',
      });
    }

    // RULE 2 — Profitable, scale signal
    if (
      typeof c.acos === 'number' && c.acos <= t.targetACoS &&
      (c.orders ?? 0) >= t.minOrders &&
      (c.roas ?? 0) >= t.goodROASThreshold
    ) {
      recs.push({
        severity: 'OPPORTUNITY',
        type: 'campaign',
        entity: name,
        headline: `Profitable campaign ready to scale — ${name}`,
        explanation: `ACoS is ${(c.acos * 100).toFixed(1)}% (below your ${(t.targetACoS * 100).toFixed(0)}% target) with a ${c.roas?.toFixed(2)}x ROAS.`,
        action: 'Increase daily budget by 10–20% to capture more sales at current efficiency.',
      });
    }

    // RULE 3 — High ACoS, has orders
    if (typeof c.acos === 'number' && c.acos > t.targetACoS * 1.5 && (c.orders ?? 0) > 0) {
      recs.push({
        severity: 'MEDIUM',
        type: 'campaign',
        entity: name,
        headline: `High ACoS — ${name}`,
        explanation: `ACoS is ${(c.acos * 100).toFixed(1)}% — well above your ${(t.targetACoS * 100).toFixed(0)}% target. Ad spend is high relative to sales generated.`,
        action: 'Review bids, add negative keywords for wasted search terms, and check listing quality.',
      });
    }

    // RULE 4 — Low CTR, high impressions
    if ((c.ctr ?? 0) < t.lowCTRThreshold && (c.impressions ?? 0) >= t.minImpressions) {
      recs.push({
        severity: 'MEDIUM',
        type: 'campaign',
        entity: name,
        headline: `Low click-through rate — ${name}`,
        explanation: `CTR is ${((c.ctr ?? 0) * 100).toFixed(2)}% with ${c.impressions?.toLocaleString()} impressions. Ads are showing but shoppers aren't clicking.`,
        action: 'Improve main image, title, price point, or add a coupon to increase relevance and appeal.',
      });
    }

    // RULE 5 — High CPC, low conversion
    if ((c.cpc ?? 0) >= t.highCPCThreshold && (c.cvr ?? 0) < 0.05) {
      recs.push({
        severity: 'MEDIUM',
        type: 'campaign',
        entity: name,
        headline: `High CPC with low conversion — ${name}`,
        explanation: `CPC is $${c.cpc?.toFixed(2)} but conversion rate is only ${((c.cvr ?? 0) * 100).toFixed(1)}%. Clicks are expensive and few convert to sales.`,
        action: 'Lower bids by 15–25% or move spend to lower-funnel, higher-intent keywords.',
      });
    }

    // RULE 6 — Budget-limited winner
    if ((c.roas ?? 0) >= t.goodROASThreshold && (c.impressions ?? 0) < 5000 && (c.orders ?? 0) > 0) {
      recs.push({
        severity: 'OPPORTUNITY',
        type: 'campaign',
        entity: name,
        headline: `Profitable but low reach — ${name}`,
        explanation: `ROAS is ${c.roas?.toFixed(2)}x but only ${c.impressions?.toLocaleString()} impressions. The campaign may be budget-constrained.`,
        action: 'Increase daily budget to unlock more traffic. Monitor ACoS as you scale.',
      });
    }
  }

  // ── Search term rules ────────────────────────────────────────────────────
  for (const st of searchTerms) {
    const term = st.searchTerm ?? st.targeting ?? '(unknown term)';

    // RULE 7 — Winning search term
    if ((st.orders ?? 0) > 0 && typeof st.acos === 'number' && st.acos <= t.targetACoS) {
      recs.push({
        severity: 'OPPORTUNITY',
        type: 'searchTerm',
        entity: term,
        headline: `Winning search term — "${term}"`,
        explanation: `This term generated ${st.orders} order(s) at a ${(st.acos * 100).toFixed(1)}% ACoS. It converts profitably.`,
        action: 'Add this search term to a dedicated Exact Match campaign to control spend and scale.',
      });
    }

    // RULE 8 — Wasted search term
    if ((st.spend ?? 0) >= t.maxNoOrderSpend && (st.orders ?? 0) === 0) {
      recs.push({
        severity: 'HIGH',
        type: 'searchTerm',
        entity: term,
        headline: `Wasted spend on search term — "${term}"`,
        explanation: `$${st.spend?.toFixed(2)} spent with zero orders. This term is consuming budget without generating sales.`,
        action: 'Add as a Negative Exact keyword immediately to stop wasted spend.',
      });
    }
  }

  // ── Product rules ────────────────────────────────────────────────────────
  for (const p of products) {
    const id = p.asin ?? p.sku ?? '(unknown product)';

    // RULE 9 — Clicks but no orders
    if ((p.clicks ?? 0) >= t.minClicks && (p.orders ?? 0) === 0) {
      recs.push({
        severity: 'MEDIUM',
        type: 'product',
        entity: id,
        headline: `Clicks without orders — ${id}`,
        explanation: `${p.clicks} clicks with zero orders. Shoppers are interested but not converting.`,
        action: 'Review listing quality: images, bullet points, price vs. competitors, and review count.',
      });
    }
  }

  recs.sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
  return recs;
}

export function recsToDailyActions(recs) {
  const groups = {
    pause: [],
    reduce: [],
    scale: [],
    listing: [],
    exact: [],
    negative: [],
  };

  for (const rec of recs) {
    const a = rec.action.toLowerCase();
    if (a.includes('pause') || a.includes('stop')) {
      groups.pause.push(rec);
    } else if (a.includes('lower') || a.includes('reduce') || a.includes('lower bid')) {
      groups.reduce.push(rec);
    } else if (a.includes('increase') || a.includes('scale') || a.includes('budget')) {
      groups.scale.push(rec);
    } else if (a.includes('listing') || a.includes('image') || a.includes('title') || a.includes('review')) {
      groups.listing.push(rec);
    } else if (a.includes('exact match')) {
      groups.exact.push(rec);
    } else if (a.includes('negative')) {
      groups.negative.push(rec);
    }
  }

  return groups;
}
