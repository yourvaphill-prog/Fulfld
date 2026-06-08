/**
 * Negative Keyword Engine — pure business logic shared between the PPC Pilot UI and API.
 * Zero React or browser dependencies. Safe to run in Node.js serverless functions.
 *
 * CLASSIFICATION:
 *   Negative Exact  : spend >= maxNoOrderSpend  AND  orders === 0  (definitive wasted spend)
 *   Negative Phrase : clicks >= minClicks       AND  orders === 0  (enough data to judge intent)
 *   Review First    : cpc >= highCPCThreshold   AND  orders === 0  (expensive but low traffic)
 *
 * Terms with orders > 0 or sales > 0 are never suggested as negatives.
 * Deduplication by (term + campaign) fingerprint.
 *
 * @param {object[]} searchTerms  - enriched search term rows
 * @param {object}   thresholds   - { maxNoOrderSpend, minClicks, highCPCThreshold, ... }
 * @returns {object[]} sorted negative candidates with negType and reason fields
 */
export function buildNegativeCandidates(searchTerms, thresholds) {
  const t    = thresholds;
  const seen = new Set();
  const out  = [];

  for (const row of searchTerms) {
    const term = (row.searchTerm ?? row.targeting ?? '').trim();
    if (!term) continue;

    // Never suggest negating a converting term
    if ((row.orders ?? 0) > 0 || (row.sales ?? 0) > 0) continue;
    // No data worth classifying
    if ((row.spend ?? 0) === 0 && (row.clicks ?? 0) === 0) continue;

    const fp = `${term.toLowerCase()}::${(row.campaignName ?? '').toLowerCase()}`;
    if (seen.has(fp)) continue;
    seen.add(fp);

    let negType, reason;

    if ((row.spend ?? 0) >= t.maxNoOrderSpend) {
      // Tier 1 — highest confidence
      negType = 'Negative Exact';
      reason  = `$${(row.spend ?? 0).toFixed(2)} spent with zero orders — definitive wasted spend`;
    } else if ((row.clicks ?? 0) >= t.minClicks) {
      // Tier 2 — has enough data to judge conversion
      negType = 'Negative Phrase';
      reason  = `${row.clicks} clicks with zero orders — low conversion, check phrase intent`;
    } else if ((row.cpc ?? 0) >= t.highCPCThreshold && (row.clicks ?? 0) > 0) {
      // Tier 3 — expensive but low traffic; watch first
      negType = 'Review First';
      reason  = `High CPC ($${(row.cpc ?? 0).toFixed(2)}) with zero orders — monitor before negating`;
    } else {
      continue; // not enough signal
    }

    out.push({ ...row, fingerprint: fp, negType, reason });
  }

  // Sort: Exact first (spend desc), then Phrase (clicks desc), then Review First
  const TIER_ORDER = { 'Negative Exact': 0, 'Negative Phrase': 1, 'Review First': 2 };
  out.sort((a, b) => {
    const td = (TIER_ORDER[a.negType] ?? 9) - (TIER_ORDER[b.negType] ?? 9);
    return td !== 0 ? td : (b.spend ?? 0) - (a.spend ?? 0);
  });

  return out;
}
