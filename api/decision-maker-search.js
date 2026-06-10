/**
 * Vercel serverless function — Decision Maker Finder.
 *
 * POST /api/decision-maker-search  { brandName, websiteUrl }
 *
 * Auth: origin-gated only (no x-api-key — VITE_ vars are public in the browser bundle).
 * Only requests from ALLOWED_ORIGINS are accepted.
 *
 * Security:
 *   - SSRF protection via isUrlSafe / safeFetch from catalog/urlUtils.js (shared, not copied)
 *   - Raw HTML is never returned in the API response
 *   - No env vars are logged or returned
 */

import { normalizeUrl, isUrlSafe }  from './catalog/urlUtils.js';
import { scanWebsite }              from './decision/websiteScanner.js';
import { extractContacts }          from './decision/contactExtractor.js';
import { rankDecisionMakers }       from './decision/decisionMakerRanker.js';

// ── CORS / origin allowlist ───────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  'https://fufldcc.vercel.app',
  'http://localhost:5173',
  'http://localhost:4173',
];

function setCorsHeaders(res, reqOrigin) {
  const origin = ALLOWED_ORIGINS.includes(reqOrigin) ? reqOrigin : ALLOWED_ORIGINS[0];
  res.setHeader('Access-Control-Allow-Origin',  origin);
  res.setHeader('Vary',                         'Origin');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  const reqOrigin = req.headers.origin || '';
  setCorsHeaders(res, reqOrigin);

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed.' });

  // Origin gate — reject requests not originating from the allowed app origins
  if (!ALLOWED_ORIGINS.includes(reqOrigin)) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const { brandName = '', websiteUrl = '' } = req.body || {};

  // Input validation
  if (!brandName || typeof brandName !== 'string' || !brandName.trim()) {
    return res.status(400).json({ error: 'brandName is required.' });
  }
  if (!websiteUrl || typeof websiteUrl !== 'string' || !websiteUrl.trim()) {
    return res.status(400).json({ error: 'websiteUrl is required.' });
  }

  const normalized = normalizeUrl(websiteUrl.trim());
  if (!normalized) {
    return res.status(400).json({ error: 'websiteUrl could not be parsed as a valid URL.' });
  }
  if (!isUrlSafe(normalized)) {
    return res.status(400).json({ error: 'websiteUrl targets a blocked or private address.' });
  }

  const cleanBrand = brandName.trim();

  // ── Scan pages ───────────────────────────────────────────────────────────────
  const pageMap = await scanWebsite(normalized);

  // Hard failure: homepage not reachable and no pages at all
  if (pageMap.error && (!pageMap.fetchedPages || pageMap.fetchedPages.length === 0)) {
    return res.status(200).json({
      brandName:        cleanBrand,
      websiteUrl:       normalized,
      scannedAt:        new Date().toISOString(),
      pagesScanned:     [],
      contactPageUrl:   null,
      aboutPageUrl:     null,
      wholesalePageUrl: null,
      otherPageUrls:    [],
      emails:           [],
      phones:           [],
      socialLinks:      [],
      decisionMakerTargets: [],
      recommendedPriority:  null,
      confidenceScore:      0,
      confidenceLabel:      'Low',
      suggestedAction:      `Could not reach the website. Try searching LinkedIn for ${cleanBrand} decision makers directly.`,
      suggestedCallScript:  '',
      notes:                pageMap.error || 'Homepage fetch failed.',
    });
  }

  // ── Extract contacts from fetched HTML ───────────────────────────────────────
  const { emails, phones, socialLinks } = extractContacts(pageMap.fetchedPages || []);

  // ── Rank decision makers and build caller strategy ───────────────────────────
  const ranking = rankDecisionMakers({
    brandName:    cleanBrand,
    fetchedPages: pageMap.fetchedPages || [],
    emails,
    phones,
    socialLinks,
    pageMap,
  });

  // ── Build response — fetchedPages (raw HTML) intentionally excluded ───────────
  return res.status(200).json({
    brandName:        cleanBrand,
    websiteUrl:       normalized,
    scannedAt:        new Date().toISOString(),
    pagesScanned:     pageMap.pagesScanned     || [],
    contactPageUrl:   pageMap.contactPageUrl   || null,
    aboutPageUrl:     pageMap.aboutPageUrl     || null,
    wholesalePageUrl: pageMap.wholesalePageUrl || null,
    otherPageUrls:    pageMap.otherPageUrls    || [],
    emails,
    phones,
    socialLinks,
    ...ranking,
  });
}
