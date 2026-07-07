/**
 * Winner Classifier — pure business logic shared between the PPC Pilot UI and API.
 * Zero React or browser dependencies. Safe to run in Node.js serverless functions.
 *
 * WINNER LOGIC SUMMARY:
 *   Tier 1 — High Priority Winner : 3+ orders, good ACoS, strong ROAS
 *   Tier 2 — Early Winner         : 1–2 orders, good ACoS, strong ROAS
 *   Tier 3 — Move to Exact Match  : good ACoS, ROAS below strong threshold
 *   Tier 4 — Increase Bid         : slightly above ACoS, still ROAS ≥ 1
 *   Tier 5 — Keep Monitoring      : converting but well above ACoS target
 *
 * 1-order terms are NEVER Tier 1 / High Priority Winner.
 * PROVEN_ORDER_COUNT (3) is the gate between Early Winner and High Priority Winner.
 *
 * ASIN-AWARENESS:
 *   Winners are grouped primarily by Advertised ASIN + Customer Search Term, so the
 *   same term winning on two different ASINs is NOT merged into one row. Each winner
 *   carries its source ASIN/SKU (with a confidence flag) and a term type:
 *     • keyword term → recommended move is "Manual Exact"
 *     • ASIN term    → recommended move is "Manual Product Targeting" (never Exact)
 */

import {
  classifyTerm,
  buildAsinInferenceMap,
  resolveAdvertisedAsin,
  UNKNOWN_ASIN,
} from './asinUtils.js';

export const PROVEN_ORDER_COUNT = 3;

export const TIER_LABELS = {
  1: 'High Priority Winner',
  2: 'Early Winner',
  3: 'Move to Exact Match',
  4: 'Increase Bid',
  5: 'Keep Monitoring',
};

export const TIER_ACTIONS = {
  1: 'Move to Exact Match — increase bid carefully',
  2: 'Add to Exact Match — conservative bid, monitor closely',
  3: 'Test Exact Match',
  4: 'Increase Bid Carefully',
  5: 'Monitor – Borderline',
};

function fmtPct(v) {
  return typeof v === 'number' ? (v * 100).toFixed(1) + '%' : '—';
}
function fmtRoas(v) {
  return typeof v === 'number' ? v.toFixed(2) + 'x' : '—';
}

function tierNote(row, tier) {
  const orders = row.orders ?? 0;
  const acosPct = fmtPct(row.acos);
  const roasStr = fmtRoas(row.roas);
  switch (tier) {
    case 1: return `${orders} order${orders !== 1 ? 's' : ''}, ACoS ${acosPct}, ROAS ${roasStr} — proven winner, exceeds all targets`;
    case 2: return `${orders} order${orders !== 1 ? 's' : ''}, ACoS ${acosPct}, ROAS ${roasStr} — promising early signal, needs more data`;
    case 3: return `${orders} order${orders !== 1 ? 's' : ''}, ACoS ${acosPct} — below target ACoS, isolate in Exact Match`;
    case 4: return `${orders} order${orders !== 1 ? 's' : ''}, ACoS ${acosPct} — slightly above target but ROAS ≥ 1; increase bid carefully`;
    case 5: return `${orders} order${orders !== 1 ? 's' : ''}, ACoS ${acosPct} — converting but above target; monitor trend`;
    default: return '';
  }
}

// ── ASIN-aware label / action ──────────────────────────────────────────────────
// The "move" destination depends on whether the customer search term is a keyword
// (→ Manual Exact) or an ASIN product target (→ Manual Product Targeting).

/** Human label for the move destination. */
export function moveTargetFor(termType) {
  return termType === 'asin' ? 'Manual Product Targeting' : 'Manual Exact';
}

function labelFor(tier, termType) {
  if (termType === 'asin') {
    if (tier === 1) return 'High Priority Target';
    if (tier === 2) return 'Early Target Winner';
    if (tier === 3) return 'Move to Product Targeting';
  }
  return TIER_LABELS[tier];
}

function actionFor(tier, termType) {
  const target = moveTargetFor(termType);
  switch (tier) {
    case 1: return `Move to ${target} — increase bid carefully`;
    case 2: return `Add to ${target} — conservative bid, monitor closely`;
    case 3: return `Move to ${target}`;
    case 4: return 'Increase Bid Carefully';
    case 5: return 'Monitor – Borderline';
    default: return '';
  }
}

/**
 * ASIN-aware winner classification (first match wins per tier).
 *
 *   Tier 1 — High Priority Winner  : orders >= PROVEN_ORDER_COUNT(3) AND acos <= targetACoS AND roas >= goodROASThreshold
 *   Tier 2 — Early Winner          : orders >= minOrders AND orders < PROVEN_ORDER_COUNT AND acos <= targetACoS AND roas >= goodROASThreshold
 *   Tier 3 — Move to Exact Match   : orders >= minOrders AND acos <= targetACoS  (good ACoS but ROAS below strong threshold)
 *   Tier 4 — Increase Bid          : orders > 0 AND acos > targetACoS AND acos <= targetACoS × 1.5 AND roas >= 1
 *   Tier 5 — Keep Monitoring       : orders > 0 AND acos > targetACoS × 1.5
 *
 * minOrders (Settings) gates entry to the list entirely.
 * Terms with orders === 0 are never included. acos === 'NO_SALES' is skipped.
 * Deduplication key is (advertisedAsin + term + campaign) so the same term winning
 * on different ASINs is preserved as separate rows.
 *
 * @param {object[]} searchTerms  - enriched search term rows
 * @param {object}   thresholds   - { targetACoS, goodROASThreshold, minOrders, ... }
 * @returns {object[]} sorted winner rows with tier, label, action, note, termType,
 *                     asin, advertisedSku, productTitle, asinConfidence, moveTarget
 */
export function buildWinners(searchTerms, thresholds) {
  const t    = thresholds;
  const seen = new Set();
  const out  = [];

  // Reliable campaign/ad-group → ASIN inference for rows missing an explicit ASIN.
  const inferenceMap = buildAsinInferenceMap(searchTerms);

  for (const row of searchTerms) {
    const term = (row.searchTerm ?? row.targeting ?? '').trim();
    if (!term) continue;

    if ((row.orders ?? 0) < t.minOrders) continue;
    if ((row.spend ?? 0) === 0 && (row.clicks ?? 0) === 0) continue;
    if (row.acos === 'NO_SALES') continue;

    const acos   = typeof row.acos === 'number' ? row.acos : null;
    const roas   = typeof row.roas === 'number' ? row.roas : null;
    const orders = row.orders ?? 0;

    const { asin, sku, confidence } = resolveAdvertisedAsin(row, inferenceMap);
    const asinKey = (asin ?? 'unknown').toLowerCase();

    const fp = `${asinKey}::${term.toLowerCase()}::${(row.campaignName ?? '').toLowerCase()}`;
    if (seen.has(fp)) continue;
    seen.add(fp);

    let tier;

    if (
      orders >= PROVEN_ORDER_COUNT &&
      acos !== null && acos <= t.targetACoS &&
      roas !== null && roas >= t.goodROASThreshold
    ) {
      // Proven winner: 3+ orders, good ACoS, strong ROAS
      tier = 1;
    } else if (
      orders >= t.minOrders && orders < PROVEN_ORDER_COUNT &&
      acos !== null && acos <= t.targetACoS &&
      roas !== null && roas >= t.goodROASThreshold
    ) {
      // Early winner: 1–2 orders, good ACoS, strong ROAS
      tier = 2;
    } else if (acos !== null && acos <= t.targetACoS && orders >= t.minOrders) {
      // Good ACoS but ROAS below strong threshold
      tier = 3;
    } else if (
      acos !== null && acos > t.targetACoS &&
      acos <= t.targetACoS * 1.5 &&
      roas !== null && roas >= 1
    ) {
      // Slightly above ACoS but still ROAS-positive
      tier = 4;
    } else if (acos !== null && acos > t.targetACoS * 1.5 && orders > 0) {
      // Converting but well above ACoS target
      tier = 5;
    } else {
      continue;
    }

    const termType = classifyTerm(term);

    out.push({
      ...row,
      fingerprint:    fp,
      tier,
      termType,
      moveTarget:     moveTargetFor(termType),
      // Source ASIN / SKU / title (resolved, with confidence)
      asin:           asin ?? row.asin ?? null,
      advertisedAsin: asin,
      advertisedSku:  sku,
      asinDisplay:    asin ?? UNKNOWN_ASIN,
      asinConfidence: confidence,
      productTitle:   row.productTitle ?? null,
      // ASIN-aware label + action override the keyword-centric defaults
      label:  labelFor(tier, termType),
      action: actionFor(tier, termType),
      note:   tierNote(row, tier),
    });
  }

  // Sort: Tier 1/2 → ROAS desc, Tier 3 → orders desc, Tier 4/5 → acos asc
  out.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    if (a.tier === 1 || a.tier === 2) return (b.roas ?? 0) - (a.roas ?? 0);
    if (a.tier === 3) return (b.orders ?? 0) - (a.orders ?? 0);
    return (a.acos ?? 0) - (b.acos ?? 0);
  });

  return out;
}
