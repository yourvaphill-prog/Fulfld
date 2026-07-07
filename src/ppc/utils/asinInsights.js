/**
 * ASIN Insights — per-ASIN rollups of search-term performance.
 * Pure business logic shared between the PPC Pilot UI and API.
 * Zero React or browser dependencies.
 *
 * For each advertised ASIN it surfaces, from the Search Term Report:
 *   • top winning keywords          (term type "keyword")
 *   • top winning ASIN/product targets (term type "asin")
 *   • negative keyword candidates
 *   • spend wasted with no sales
 *   • a suggested next action
 *
 * These answer, per ASIN:
 *   1. Is it ready to scale?              → winners + spend efficiency
 *   2. Which exact keywords to move?      → topKeywords
 *   3. Which competitor ASINs to target?  → topTargets
 *   4. Which terms to negate?             → negatives
 */

import { buildWinners } from './winnerClassifier.js';
import { buildNegativeCandidates } from './negativeEngine.js';
import {
  buildAsinInferenceMap,
  resolveAdvertisedAsin,
  UNKNOWN_ASIN,
} from './asinUtils.js';

const TOP_N = 5;

function usd(v) {
  return typeof v === 'number' ? '$' + v.toFixed(2) : '$0.00';
}

/**
 * Compute insights for a single ASIN's rows (already filtered + asin-stamped).
 *
 * @param {object[]} rows        - enriched search-term rows for one ASIN
 * @param {object}   thresholds
 * @returns {object} insights
 */
export function buildAsinInsights(rows, thresholds) {
  const winners = buildWinners(rows, thresholds);
  const topKeywords = winners.filter(w => w.termType === 'keyword');
  const topTargets  = winners.filter(w => w.termType === 'asin');
  const negatives   = buildNegativeCandidates(rows, thresholds);

  // Spend wasted = spend on terms that produced no orders and no sales.
  const spendWasted = rows.reduce((sum, r) => {
    const noSale = (r.orders ?? 0) === 0 && (r.sales ?? 0) === 0;
    return noSale ? sum + (r.spend ?? 0) : sum;
  }, 0);

  const winningKeywordsCount = topKeywords.length;
  const winningTargetsCount  = topTargets.length;
  const negativeCount        = negatives.length;

  return {
    topKeywords:      topKeywords.slice(0, TOP_N),
    topTargets:       topTargets.slice(0, TOP_N),
    negatives:        negatives.slice(0, TOP_N),
    winningKeywordsCount,
    winningTargetsCount,
    negativeCount,
    spendWasted,
    suggestedAction: buildSuggestedAction({
      winningKeywordsCount,
      winningTargetsCount,
      negativeCount,
      spendWasted,
    }, thresholds),
  };
}

function buildSuggestedAction(counts, t) {
  const { winningKeywordsCount, winningTargetsCount, negativeCount, spendWasted } = counts;
  const moves = [];

  if (winningKeywordsCount > 0) {
    moves.push(`Move ${winningKeywordsCount} keyword${winningKeywordsCount !== 1 ? 's' : ''} to Manual Exact`);
  }
  if (winningTargetsCount > 0) {
    moves.push(`Add ${winningTargetsCount} product target${winningTargetsCount !== 1 ? 's' : ''} (Manual Product Targeting)`);
  }
  if (negativeCount > 0) {
    moves.push(`Negate ${negativeCount} wasted term${negativeCount !== 1 ? 's' : ''}`);
  }

  if (moves.length === 0) {
    if (spendWasted >= (t.maxNoOrderSpend ?? 10)) {
      return `${usd(spendWasted)} spent with no sales — tighten targeting and review the listing before adding spend.`;
    }
    return 'No strong keyword or target signals yet — keep collecting data.';
  }

  const lead = winningKeywordsCount > 0 || winningTargetsCount > 0
    ? 'Ready to scale: '
    : 'Clean up: ';
  return lead + moves.join('; ') + '.';
}

/**
 * Group all search-term rows by advertised ASIN (resolving inferred ASINs) and
 * compute insights for each. Rows whose ASIN can't be determined roll up under
 * the "Unknown ASIN" bucket.
 *
 * @param {object[]} searchTerms - enriched search-term rows
 * @param {object}   thresholds
 * @returns {Map<string, object>} ASIN (upper-case, or "Unknown ASIN") → insights
 */
export function buildAllAsinInsights(searchTerms, thresholds) {
  const result = new Map();
  if (!Array.isArray(searchTerms) || searchTerms.length === 0) return result;

  const inferenceMap = buildAsinInferenceMap(searchTerms);

  // Bucket rows by resolved ASIN, stamping the resolved ASIN onto a shallow copy
  // so downstream classifiers see a consistent identifier.
  const buckets = new Map(); // asinKey -> rows[]
  for (const row of searchTerms) {
    const { asin, confidence } = resolveAdvertisedAsin(row, inferenceMap);
    const key = asin ? asin.toUpperCase() : UNKNOWN_ASIN;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(asin ? { ...row, asin, asinConfidence: confidence } : { ...row, asinConfidence: 'unknown' });
  }

  for (const [key, rows] of buckets) {
    result.set(key, buildAsinInsights(rows, thresholds));
  }
  return result;
}

/**
 * Convenience: insights for a single ASIN pulled from the full search-term set.
 *
 * @param {string}   asin
 * @param {object[]} searchTerms
 * @param {object}   thresholds
 * @returns {object|null}
 */
export function getInsightsForAsin(asin, searchTerms, thresholds) {
  if (!asin) return null;
  const all = buildAllAsinInsights(searchTerms, thresholds);
  return all.get(String(asin).toUpperCase()) ?? null;
}
