/**
 * ASIN utilities — pure helpers shared between the PPC Pilot UI and API.
 * Zero React or browser dependencies. Safe to run in Node.js serverless functions.
 *
 * A "Customer Search Term" in an Amazon Search Term Report is either:
 *   • normal keyword text  ("stainless steel water bottle")  → term type "keyword"
 *   • a product-target ASIN ("b0abc12345" / "asin=\"B0ABC12345\"") → term type "asin"
 *
 * The distinction drives the recommended move:
 *   keyword → Manual Exact
 *   ASIN    → Manual Product Targeting  (never Exact Match)
 */

// Modern Amazon ASINs: 10 chars, start with "B0". Product-targeting search
// terms surface exactly as a lowercase ASIN token (e.g. "b0abc12345").
export const ASIN_RE = /^b0[a-z0-9]{8}$/i;

// Some reports wrap the ASIN, e.g. asin="B0ABC12345" or ASIN: B0ABC12345.
const WRAPPED_ASIN_RE = /\bb0[a-z0-9]{8}\b/i;

export const UNKNOWN_ASIN = 'Unknown ASIN';

/** True when the value is (or contains) a single Amazon product-target ASIN. */
export function isAsin(value) {
  if (value == null) return false;
  const s = String(value).trim();
  if (ASIN_RE.test(s)) return true;
  // Wrapped forms like asin="B0..." — only if the whole term is essentially that token.
  return /^(asin=?["']?\s*)?b0[a-z0-9]{8}["']?$/i.test(s);
}

/** Extract the bare ASIN token from a search term, upper-cased. Null if none. */
export function extractAsin(value) {
  if (value == null) return null;
  const m = String(value).match(WRAPPED_ASIN_RE);
  return m ? m[0].toUpperCase() : null;
}

/** Classify a customer search term as 'asin' (product target) or 'keyword'. */
export function classifyTerm(term) {
  return isAsin(term) ? 'asin' : 'keyword';
}

function groupKey(row) {
  return `${(row.campaignName ?? '').toLowerCase()}::${(row.adGroupName ?? '').toLowerCase()}`;
}

/**
 * Build a map of "campaign::adGroup" → advertised ASIN, but ONLY for groups
 * that map unambiguously to exactly one advertised ASIN. This is the reliable
 * inference case: when every row in an ad group that carries an ASIN shares the
 * same one, rows in that group missing the ASIN can safely inherit it.
 *
 * @param {object[]} rows - normalized rows carrying `asin`, `campaignName`, `adGroupName`
 * @returns {Map<string,string>}
 */
export function buildAsinInferenceMap(rows) {
  const groups = new Map(); // key -> Set<asin>
  for (const row of rows) {
    const asin = (row.asin ?? '').trim();
    if (!asin) continue;
    const key = groupKey(row);
    if (!groups.has(key)) groups.set(key, new Set());
    groups.get(key).add(asin);
  }
  const map = new Map();
  for (const [key, set] of groups) {
    if (set.size === 1) map.set(key, [...set][0]);
  }
  return map;
}

/**
 * Resolve the advertised ASIN/SKU for a row with a confidence flag.
 *   confidence: 'exact'    — ASIN present directly on the row
 *               'inferred' — derived from a single-ASIN campaign/ad group
 *               'unknown'  — could not be determined
 *
 * @param {object} row
 * @param {Map<string,string>} [inferenceMap] - from buildAsinInferenceMap
 * @returns {{ asin: string|null, sku: string|null, confidence: 'exact'|'inferred'|'unknown' }}
 */
export function resolveAdvertisedAsin(row, inferenceMap) {
  const direct = (row.asin ?? '').trim();
  const sku    = row.sku ? String(row.sku).trim() : null;
  if (direct) return { asin: direct, sku, confidence: 'exact' };

  if (inferenceMap) {
    const inferred = inferenceMap.get(groupKey(row));
    if (inferred) return { asin: inferred, sku, confidence: 'inferred' };
  }
  return { asin: null, sku, confidence: 'unknown' };
}

/** Confidence display metadata (labels + colors) for UI badges. */
export const CONFIDENCE_META = {
  exact:    { label: 'Mapped',       color: '#22c55e', bg: '#22c55e11', border: '#22c55e33' },
  inferred: { label: 'Inferred',     color: '#eab308', bg: '#eab30811', border: '#eab30833' },
  unknown:  { label: 'Unknown ASIN', color: '#ef4444', bg: '#ef444411', border: '#ef444433' },
};
