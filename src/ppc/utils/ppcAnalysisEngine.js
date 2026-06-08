/**
 * PPC Analysis Engine — orchestrates all rule-based PPC analysis utilities.
 * Called by the API endpoint (api/ppc/analyze.js).
 * Zero React, zero browser APIs, zero AI calls.
 *
 * Input:  { campaignRows, searchTermRows, productRows, thresholds }
 * Output: internal analysis object consumed by apiFormatters.js
 */

import { enrichRows, aggregateMetrics } from './metricCalculator.js';
import { generateRecommendations }       from './recommendationEngine.js';
import { buildScalingPlan, summarisePlan } from './scalingEngine.js';
import { buildReadinessPlan, summariseReadiness } from './adReadinessScore.js';
import { buildWinners }                  from './winnerClassifier.js';
import { buildNegativeCandidates }       from './negativeEngine.js';

// ── Default thresholds (match the PPC Pilot UI Settings defaults) ──────────────
const DEFAULT_THRESHOLDS = {
  targetACoS:        0.30,   // 30%
  goodROASThreshold: 3.0,
  minOrders:         1,
  maxNoOrderSpend:   10.00,  // $10 spent with 0 orders → waste flag
  minClicks:         10,
  minImpressions:    100,
  lowCTRThreshold:   0.002,  // 0.2%
  highCPCThreshold:  2.00,   // $2
};

function resolveThresholds(incoming = {}) {
  return { ...DEFAULT_THRESHOLDS, ...incoming };
}

// ── Account health score (0–100) ──────────────────────────────────────────────
// Mirrors the private calcAccountHealth in bossReportGenerator.js
function calcAccountHealth(summary, thresholds, planSum, rdSum) {
  if (!summary) return 0;
  let score = 0;

  // ACoS (30 pts)
  if (typeof summary.avgAcos === 'number') {
    if (summary.avgAcos <= thresholds.targetACoS)              score += 30;
    else if (summary.avgAcos <= thresholds.targetACoS * 1.3)   score += 20;
    else if (summary.avgAcos <= thresholds.targetACoS * 1.7)   score += 10;
  }

  // ROAS (25 pts)
  if (typeof summary.avgRoas === 'number') {
    if (summary.avgRoas >= thresholds.goodROASThreshold)             score += 25;
    else if (summary.avgRoas >= thresholds.goodROASThreshold * 0.7)  score += 15;
    else if (summary.avgRoas >= 1)                                    score += 8;
  }

  // Scale candidates proportion (20 pts)
  if (planSum.total > 0) {
    const scaleRatio = planSum.scaleCount / planSum.total;
    if (scaleRatio >= 0.4)      score += 20;
    else if (scaleRatio >= 0.2) score += 13;
    else if (scaleRatio >= 0.1) score += 7;
  }

  // Product readiness (15 pts)
  if (rdSum.total > 0) {
    const readyRatio = rdSum.scaleCount / rdSum.total;
    if (readyRatio >= 0.4)      score += 15;
    else if (readyRatio >= 0.2) score += 10;
    else if (readyRatio >= 0.1) score += 5;
  }

  // Pause drag (−10 pts max)
  if (planSum.pauseCount > 0 && planSum.total > 0) {
    const pauseRatio = planSum.pauseCount / planSum.total;
    if (pauseRatio >= 0.3)      score -= 10;
    else if (pauseRatio >= 0.1) score -= 5;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Run full PPC analysis on the provided rows.
 *
 * @param {object}   params
 * @param {object[]} params.campaignRows    - normalized campaign report rows
 * @param {object[]} params.searchTermRows  - normalized search term report rows
 * @param {object[]} params.productRows     - normalized advertised product report rows
 * @param {object}   [params.thresholds]    - optional threshold overrides
 * @returns {object} internal analysis result (pass to formatApiResponse)
 */
export function runAnalysis({ campaignRows = [], searchTermRows = [], productRows = [], thresholds = {} }) {
  const t = resolveThresholds(thresholds);

  // Enrich all rows with derived metrics (ACoS, ROAS, CTR, CPC, CVR)
  const campaigns    = enrichRows(campaignRows);
  const searchTerms  = enrichRows(searchTermRows);
  const products     = enrichRows(productRows);

  // Account-level aggregate (from campaign rows — avoids double-counting)
  const summary = aggregateMetrics(campaigns.length ? campaigns : searchTerms);

  // Campaign analysis
  const plan    = buildScalingPlan(campaigns, t);
  const planSum = summarisePlan(plan);

  // Product readiness
  const readiness = buildReadinessPlan(products, t);
  const rdSum     = summariseReadiness(readiness);

  // Winner classification (search term rows)
  const winners = buildWinners(searchTerms, t);

  // Negative keyword candidates (search term rows)
  const negatives = buildNegativeCandidates(searchTerms, t);

  // Rule-based recommendations
  const recommendations = generateRecommendations(
    { campaigns, searchTerms, products },
    t
  );

  // Account health score
  const accountHealthScore = calcAccountHealth(summary, t, planSum, rdSum);

  return {
    summary,
    campaigns,
    searchTerms,
    products,
    plan,
    planSum,
    readiness,
    rdSum,
    winners,
    negatives,
    recommendations,
    thresholds: t,
    accountHealthScore,
  };
}
