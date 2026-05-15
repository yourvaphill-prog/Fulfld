import { groupBy } from './metricCalculator.js';
import { calcHealthScore } from './healthScore.js';

/**
 * Priority ladder for tier assignment (first match wins).
 * All conditions use aggregated field names produced by groupBy():
 *   totalSpend, totalSales, totalOrders, totalClicks, totalImpressions
 *   avgAcos, avgRoas, avgCtr, avgCpc, avgCvr
 */

// Internal tier keys → display metadata
const TIER_META = {
  pause: {
    statusLabel: 'Pause / Review',
    statusGroup: 'pause',
    priority:    1,
    color:       '#ef4444',
    bg:          '#ef444411',
    border:      '#ef444433',
  },
  scale_strong: {
    statusLabel: 'Scale Opportunity',
    statusGroup: 'scale',
    priority:    2,
    color:       '#22c55e',
    bg:          '#22c55e11',
    border:      '#22c55e33',
  },
  scale_moderate: {
    statusLabel: 'Scale Opportunity',
    statusGroup: 'scale',
    priority:    2,
    color:       '#22c55e',
    bg:          '#22c55e11',
    border:      '#22c55e33',
  },
  optimize_acos: {
    statusLabel: 'Optimize',
    statusGroup: 'optimize',
    priority:    3,
    color:       '#3b82f6',
    bg:          '#3b82f611',
    border:      '#3b82f633',
  },
  at_risk_ctr: {
    statusLabel: 'At Risk',
    statusGroup: 'at_risk',
    priority:    4,
    color:       '#f97316',
    bg:          '#f9731611',
    border:      '#f9731633',
  },
  at_risk_cpc: {
    statusLabel: 'At Risk',
    statusGroup: 'at_risk',
    priority:    4,
    color:       '#f97316',
    bg:          '#f9731611',
    border:      '#f9731633',
  },
  needs_data: {
    statusLabel: 'Needs More Data',
    statusGroup: 'needs_data',
    priority:    5,
    color:       '#eab308',
    bg:          '#eab30811',
    border:      '#eab30833',
  },
  monitor: {
    statusLabel: 'Optimize',
    statusGroup: 'optimize',
    priority:    3,
    color:       '#3b82f6',
    bg:          '#3b82f611',
    border:      '#3b82f633',
  },
};

// ── Formatting helpers (used only for reason strings) ──────────────────────────
function pct(val) {
  return typeof val === 'number' ? (val * 100).toFixed(1) + '%' : '—';
}
function usd(val) {
  return typeof val === 'number' ? '$' + val.toFixed(2) : '—';
}
function x2(val) {
  return typeof val === 'number' ? val.toFixed(2) + 'x' : '—';
}
function num(val) {
  return typeof val === 'number' ? val.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—';
}

// ── Tier classifier ────────────────────────────────────────────────────────────
function classifyRow(row, t) {
  const spend       = row.totalSpend       ?? 0;
  const sales       = row.totalSales       ?? 0;
  const orders      = row.totalOrders      ?? 0;
  const clicks      = row.totalClicks      ?? 0;
  const impressions = row.totalImpressions ?? 0;
  const acos        = typeof row.avgAcos === 'number' ? row.avgAcos : null;
  const roas        = typeof row.avgRoas === 'number' ? row.avgRoas : null;
  const ctr         = row.avgCtr  ?? null;
  const cpc         = row.avgCpc  ?? null;
  const cvr         = row.avgCvr  ?? null;

  // ── Priority 1: Pause / Review ──
  if (spend >= t.maxNoOrderSpend && orders === 0) {
    return {
      tier:              'pause',
      budgetDelta:       null,
      recommendedAction: 'Pause or significantly reduce bids',
      reason:            `${usd(spend)} spent with 0 orders — ad budget consumed without return`,
      nextStep:          'Pause the campaign. Review search terms, targeting, and product listing before resuming.',
    };
  }

  // ── Priority 2: Needs More Data ──
  if (clicks < t.minClicks || impressions < t.minImpressions) {
    const why = clicks < t.minClicks
      ? `Only ${num(clicks)} click${clicks !== 1 ? 's' : ''} (min ${num(t.minClicks)} needed)`
      : `Only ${num(impressions)} impression${impressions !== 1 ? 's' : ''} (min ${num(t.minImpressions)} needed)`;
    return {
      tier:              'needs_data',
      budgetDelta:       null,
      recommendedAction: 'Continue collecting data',
      reason:            why + ' — not enough data to judge performance',
      nextStep:          'Do not make aggressive changes yet. Allow the campaign to run for more data before optimizing.',
    };
  }

  // ── Priority 3: Strong Scale Candidate ──
  if (
    orders >= t.minOrders &&
    acos !== null && acos <= t.targetACoS &&
    roas !== null && roas >= t.goodROASThreshold
  ) {
    return {
      tier:              'scale_strong',
      budgetDelta:       '+15–20%',
      recommendedAction: 'Increase budget by 15–20%',
      reason:            `ACoS ${pct(acos)} (target ${pct(t.targetACoS)}), ROAS ${x2(roas)} — all efficiency targets exceeded`,
      nextStep:          'Increase daily budget by 15–20%. Monitor for 3 days. Scale again if ACoS stays below target.',
    };
  }

  // ── Priority 4: Moderate Scale Candidate ──
  if (
    orders >= t.minOrders &&
    acos !== null && acos <= t.targetACoS * 1.15
  ) {
    return {
      tier:              'scale_moderate',
      budgetDelta:       '+5–10%',
      recommendedAction: 'Increase budget by 5–10%',
      reason:            `ACoS ${pct(acos)} — near target (${pct(t.targetACoS)}), ROAS ${x2(roas)}`,
      nextStep:          'Increase budget modestly by 5–10%. Monitor ACoS closely before scaling further.',
    };
  }

  // ── Priority 5: Optimize — High ACoS ──
  if (orders > 0 && acos !== null && acos > t.targetACoS) {
    const howFar = acos > t.targetACoS * 2
      ? `${pct(acos)} — more than 2× above target`
      : `${pct(acos)} — above ${pct(t.targetACoS)} target`;
    return {
      tier:              'optimize_acos',
      budgetDelta:       '-10–15%',
      recommendedAction: 'Reduce bids by 10–15%',
      reason:            `ACoS ${howFar}`,
      nextStep:          'Reduce keyword bids by 10–15%. Review search terms for wasted spend. Add negative keywords.',
    };
  }

  // ── Priority 6: At Risk — Low CTR ──
  if (ctr !== null && ctr < t.lowCTRThreshold && impressions >= t.minImpressions) {
    return {
      tier:              'at_risk_ctr',
      budgetDelta:       null,
      recommendedAction: 'Improve listing appeal',
      reason:            `CTR ${pct(ctr)} with ${num(impressions)} impressions — below ${pct(t.lowCTRThreshold)} threshold`,
      nextStep:          'Review main image, title, price, coupon, and ad creative. Low CTR means ads are showing but not compelling shoppers to click.',
    };
  }

  // ── Priority 7: At Risk — High CPC + Low CVR ──
  if (cpc !== null && cpc >= t.highCPCThreshold && (cvr ?? 0) < 0.05) {
    return {
      tier:              'at_risk_cpc',
      budgetDelta:       '-10–15%',
      recommendedAction: 'Lower bids — high cost, low conversion',
      reason:            `CPC ${usd(cpc)} with ${pct(cvr)} conversion rate — clicks are expensive and not converting`,
      nextStep:          'Lower bids by 15–25%. Shift spend toward lower-funnel, higher-intent keywords.',
    };
  }

  // ── Catch-all: Monitor ──
  return {
    tier:              'monitor',
    budgetDelta:       null,
    recommendedAction: 'Keep budget stable — monitor',
    reason:            `${num(orders)} order${orders !== 1 ? 's' : ''}, ACoS ${pct(acos)}, ROAS ${x2(roas)} — no strong signal yet`,
    nextStep:          'No major changes needed. Continue running and review again in 7 days.',
  };
}

// ── Main export ────────────────────────────────────────────────────────────────
/**
 * Accepts raw campaign rows and thresholds.
 * Returns a sorted array of plan entries — one per unique campaign name.
 */
export function buildScalingPlan(campaigns, thresholds) {
  if (!campaigns.length) return [];

  const aggregated = groupBy(campaigns, 'campaignName');

  const plan = aggregated.map(row => {
    const classification = classifyRow(row, thresholds);
    const meta           = TIER_META[classification.tier];
    const healthScore    = calcHealthScore(row, thresholds);

    return {
      ...row,
      ...classification,
      ...meta,
      healthScore,
    };
  });

  // Sort by priority asc, then by totalSpend desc within same priority
  plan.sort((a, b) =>
    a.priority !== b.priority
      ? a.priority - b.priority
      : (b.totalSpend ?? 0) - (a.totalSpend ?? 0)
  );

  return plan;
}

// ── Summary aggregator ─────────────────────────────────────────────────────────
export function summarisePlan(plan) {
  const scaleCount     = plan.filter(r => r.statusGroup === 'scale').length;
  const optimizeCount  = plan.filter(r => r.statusGroup === 'optimize').length;
  const atRiskCount    = plan.filter(r => r.statusGroup === 'at_risk').length;
  const needsDataCount = plan.filter(r => r.statusGroup === 'needs_data').length;
  const pauseCount     = plan.filter(r => r.statusGroup === 'pause').length;
  const spendAtRisk    = plan
    .filter(r => r.statusGroup === 'pause')
    .reduce((s, r) => s + (r.totalSpend ?? 0), 0);

  return { scaleCount, optimizeCount, atRiskCount, needsDataCount, pauseCount, spendAtRisk, total: plan.length };
}

// Re-export TIER_META so the component can access colours without duplicating them
export { TIER_META };
