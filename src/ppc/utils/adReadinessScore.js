import { groupBy } from './metricCalculator.js';

/**
 * Product Ad Readiness Scorer
 *
 * Scores each aggregated product row on a 0–100 scale across four weighted
 * components, then assigns a label via a priority ladder (first match wins).
 *
 * Aggregated field names (from groupBy):
 *   totalSpend, totalSales, totalOrders, totalClicks, totalImpressions
 *   avgAcos, avgRoas, avgCtr, avgCpc, avgCvr
 */

// ── Label metadata ─────────────────────────────────────────────────────────────
export const READINESS_META = {
  scale: {
    label:       'Ready to Scale',
    statusGroup: 'scale',
    priority:    1,
    color:       '#22c55e',
    bg:          '#22c55e11',
    border:      '#22c55e33',
  },
  monitor: {
    label:       'Monitor',
    statusGroup: 'monitor',
    priority:    2,
    color:       '#3b82f6',
    bg:          '#3b82f611',
    border:      '#3b82f633',
  },
  offer: {
    label:       'Needs Offer/Price Review',
    statusGroup: 'offer',
    priority:    3,
    color:       '#f97316',
    bg:          '#f9731611',
    border:      '#f9731633',
  },
  listing: {
    label:       'Needs Listing Review',
    statusGroup: 'listing',
    priority:    3,
    color:       '#f97316',
    bg:          '#f9731611',
    border:      '#f9731633',
  },
  poor_fit: {
    label:       'Poor PPC Fit',
    statusGroup: 'poor_fit',
    priority:    4,
    color:       '#ef4444',
    bg:          '#ef444411',
    border:      '#ef444433',
  },
  needs_data: {
    label:       'Needs More Data',
    statusGroup: 'needs_data',
    priority:    5,
    color:       '#eab308',
    bg:          '#eab30811',
    border:      '#eab30833',
  },
};

// ── Inline formatters (for reason strings only) ────────────────────────────────
function pct(val) {
  return typeof val === 'number' ? (val * 100).toFixed(1) + '%' : '—';
}
function usd(val) {
  return typeof val === 'number' ? '$' + val.toFixed(2) : '—';
}
function x2(val) {
  return typeof val === 'number' ? val.toFixed(2) + 'x' : '—';
}
function n(val) {
  return typeof val === 'number'
    ? val.toLocaleString('en-US', { maximumFractionDigits: 0 })
    : '—';
}

// ── Score calculation ──────────────────────────────────────────────────────────
/**
 * Computes a 0–100 readiness score from four weighted components.
 * Score reflects ad efficiency independent of the label assignment.
 */
function computeScore(row, t) {
  const orders      = row.totalOrders      ?? 0;
  const clicks      = row.totalClicks      ?? 0;
  const impressions = row.totalImpressions ?? 0;
  const spend       = row.totalSpend       ?? 0;
  const acos        = typeof row.avgAcos === 'number' ? row.avgAcos : null;
  const roas        = typeof row.avgRoas === 'number' ? row.avgRoas : null;
  const ctr         = row.avgCtr  ?? null;
  const cvr         = row.avgCvr  ?? null;

  let score = 0;

  // ── Component 1: Conversion quality (40 pts) ──
  if (cvr !== null && cvr >= 0.10) {
    score += 40;
  } else if (cvr !== null && cvr >= 0.05) {
    score += 30;
  } else if (cvr !== null && cvr >= 0.02) {
    score += 20;
  } else if (orders > 0) {
    score += 10; // converting, but low rate
  } else if (clicks >= t.minClicks) {
    score += 0;  // enough clicks to judge — confirmed no conversion
  } else {
    score += 15; // not enough data yet — neutral, don't penalise
  }

  // ── Component 2: ACoS / ROAS efficiency (35 pts) ──
  if (row.avgAcos === 'NO_SALES') {
    score += spend < t.maxNoOrderSpend ? 5 : 0;
  } else if (acos !== null) {
    if (acos <= t.targetACoS && roas !== null && roas >= t.goodROASThreshold) {
      score += 35;
    } else if (acos <= t.targetACoS) {
      score += 25;
    } else if (acos <= t.targetACoS * 1.5) {
      score += 15;
    } else if (acos <= t.targetACoS * 2) {
      score += 8;
    }
  } else {
    score += 12; // no acos data yet — neutral
  }

  // ── Component 3: CTR / ad appeal (15 pts) ──
  if (ctr !== null) {
    if (ctr >= 0.005) {
      score += 15;
    } else if (ctr >= t.lowCTRThreshold) {
      score += 10;
    } else if (ctr >= t.lowCTRThreshold * 0.5) {
      score += 5;
    } else if (impressions >= t.minImpressions) {
      score += 0; // confirmed low CTR
    } else {
      score += 6; // not enough impressions to judge
    }
  } else {
    score += 6; // no data
  }

  // ── Component 4: Data sufficiency (10 pts) ──
  const hasClicks      = clicks      >= t.minClicks;
  const hasImpressions = impressions >= t.minImpressions;
  if (hasClicks && hasImpressions) {
    score += 10;
  } else if (hasClicks || hasImpressions) {
    score += 5;
  }

  return Math.min(100, Math.max(0, score));
}

// ── Label assignment (priority ladder, first match wins) ──────────────────────
function assignLabel(row, t) {
  const orders      = row.totalOrders      ?? 0;
  const clicks      = row.totalClicks      ?? 0;
  const impressions = row.totalImpressions ?? 0;
  const spend       = row.totalSpend       ?? 0;
  const acos        = typeof row.avgAcos === 'number' ? row.avgAcos : null;
  const roas        = typeof row.avgRoas === 'number' ? row.avgRoas : null;
  const ctr         = row.avgCtr  ?? null;
  const cvr         = row.avgCvr  ?? null;

  // ── Priority 1: Poor PPC Fit ──
  if (spend >= t.maxNoOrderSpend && orders === 0) {
    return {
      tier:   'poor_fit',
      reason: `${usd(spend)} spent with 0 orders — budget consumed without any return`,
      action: 'Pause ads immediately. Fix listing quality, price, or reviews before resuming ad spend.',
    };
  }

  // ── Priority 2: Needs More Data ──
  if (clicks < t.minClicks || impressions < t.minImpressions) {
    const why = clicks < t.minClicks
      ? `Only ${n(clicks)} click${clicks !== 1 ? 's' : ''} (min ${n(t.minClicks)} needed to judge)`
      : `Only ${n(impressions)} impression${impressions !== 1 ? 's' : ''} (min ${n(t.minImpressions)} needed)`;
    return {
      tier:   'needs_data',
      reason: why + ' — insufficient data to score accurately',
      action: 'Continue running. Do not make bid or budget changes until more data is available.',
    };
  }

  // ── Priority 3: Ready to Scale ──
  if (
    orders >= t.minOrders &&
    acos !== null && acos <= t.targetACoS &&
    roas !== null && roas >= t.goodROASThreshold
  ) {
    return {
      tier:   'scale',
      reason: `ACoS ${pct(acos)} (target ${pct(t.targetACoS)}), ROAS ${x2(roas)}, CVR ${pct(cvr)} — all efficiency targets met`,
      action: 'Increase ad support on this ASIN. Consider a dedicated Exact Match campaign or raise campaign budget by 15–20%.',
    };
  }

  // ── Priority 4: Monitor ──
  if (orders > 0 && acos !== null && acos <= t.targetACoS * 1.15) {
    return {
      tier:   'monitor',
      reason: `ACoS ${pct(acos)}, ROAS ${x2(roas)}, ${n(orders)} order${orders !== 1 ? 's' : ''} — near target, collecting more data`,
      action: 'Keep running. Review again in 7 days before making bid or budget changes.',
    };
  }

  // ── Priority 5: Needs Offer/Price Review ──
  // CTR is acceptable (ad appeal is there) but conversion fails
  if (
    ctr !== null && ctr >= t.lowCTRThreshold &&
    clicks >= Math.floor(t.minClicks / 2) &&
    (orders === 0 || (cvr !== null && cvr < 0.02))
  ) {
    return {
      tier:   'offer',
      reason: `CTR ${pct(ctr)} shows ad appeal, but CVR ${pct(cvr)} — shoppers click but don't buy`,
      action: 'Review price vs. competitors, coupon, primary image on detail page, reviews, rating, and shipping speed.',
    };
  }

  // ── Priority 6: Needs Listing Review ──
  // Enough clicks to judge, but no conversion — listing/ad creative issue
  if (clicks >= t.minClicks && (orders === 0 || (cvr !== null && cvr < 0.02))) {
    return {
      tier:   'listing',
      reason: `${n(clicks)} clicks with ${n(orders)} order${orders !== 1 ? 's' : ''} (CVR ${pct(cvr)}) — conversion gap suggests listing quality issue`,
      action: 'Review main image, title, bullet points, A+ content, and keyword relevance before scaling ad spend.',
    };
  }

  // ── Catch-all: Monitor ──
  return {
    tier:   'monitor',
    reason: `${n(orders)} order${orders !== 1 ? 's' : ''}, ACoS ${pct(acos)}, ROAS ${x2(roas)} — no strong signal yet`,
    action: 'Continue running. No major changes needed. Review in 7 days.',
  };
}

// ── Main export ────────────────────────────────────────────────────────────────
/**
 * Accepts raw product rows and thresholds.
 * Returns a scored, labelled, sorted array — one entry per unique ASIN/SKU.
 */
export function buildReadinessPlan(products, thresholds) {
  if (!products.length) return [];

  // Group by ASIN first, then by SKU for rows without an ASIN
  const byAsin = groupBy(products, 'asin');
  const bySku  = groupBy(products.filter(p => !p.asin), 'sku');
  const aggregated = [...byAsin, ...bySku];

  const plan = aggregated.map(row => {
    const score      = computeScore(row, thresholds);
    const { tier, reason, action } = assignLabel(row, thresholds);
    const meta       = READINESS_META[tier];

    return {
      ...row,
      score,
      tier,
      reason,
      action,
      ...meta,
    };
  });

  // Sort: best score first (Ready to Scale naturally floats to top)
  plan.sort((a, b) => b.score - a.score);

  return plan;
}

// ── Summary aggregator ─────────────────────────────────────────────────────────
export function summariseReadiness(plan) {
  const scaleCount    = plan.filter(r => r.statusGroup === 'scale').length;
  const monitorCount  = plan.filter(r => r.statusGroup === 'monitor').length;
  const listingCount  = plan.filter(r => r.statusGroup === 'listing').length;
  const offerCount    = plan.filter(r => r.statusGroup === 'offer').length;
  const poorFitCount  = plan.filter(r => r.statusGroup === 'poor_fit').length;
  const needsDataCount = plan.filter(r => r.statusGroup === 'needs_data').length;
  const spendAtRisk   = plan
    .filter(r => r.statusGroup === 'poor_fit')
    .reduce((s, r) => s + (r.totalSpend ?? 0), 0);
  const needsReviewCount = listingCount + offerCount;

  return {
    total: plan.length,
    scaleCount,
    monitorCount,
    listingCount,
    offerCount,
    poorFitCount,
    needsDataCount,
    needsReviewCount,
    spendAtRisk,
  };
}
