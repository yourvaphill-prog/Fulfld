/**
 * PPC Pilot API — POST /api/ppc/analyze
 *
 * Accepts normalized Amazon Ads report rows and returns structured PPC analysis JSON.
 * Rule-based engine only — no AI, no Anthropic API keys required.
 *
 * Auth: caller must send header  x-api-key: <PPC_PILOT_API_KEY>
 * Set PPC_PILOT_API_KEY in Vercel → Settings → Environment Variables.
 */

import { runAnalysis }      from '../../src/ppc/utils/ppcAnalysisEngine.js';
import { formatApiResponse } from '../../src/ppc/utils/apiFormatters.js';

// ── CORS headers (allow cross-origin callers — auth is handled by x-api-key) ──
function setCorsHeaders(res) {
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
}

export default async function handler(req, res) {
  setCorsHeaders(res);

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed. Use POST.' });
    return;
  }

  // ── Auth check ─────────────────────────────────────────────────────────────
  const expectedKey = process.env.PPC_PILOT_API_KEY;
  if (!expectedKey) {
    res.status(500).json({
      error: 'PPC_PILOT_API_KEY is not configured. Add it in Vercel → Settings → Environment Variables.',
    });
    return;
  }

  const incomingKey = req.headers['x-api-key'];
  if (!incomingKey || incomingKey !== expectedKey) {
    res.status(401).json({ error: 'Unauthorized. Provide a valid x-api-key header.' });
    return;
  }

  // ── Parse body ─────────────────────────────────────────────────────────────
  const body = req.body ?? {};

  const campaignRows   = body.campaignRows   ?? [];
  const searchTermRows = body.searchTermRows ?? [];
  const productRows    = body.productRows    ?? [];
  const thresholds     = body.thresholds     ?? {};

  // Basic type validation
  if (!Array.isArray(campaignRows)) {
    res.status(400).json({ error: 'campaignRows must be an array.' });
    return;
  }
  if (!Array.isArray(searchTermRows)) {
    res.status(400).json({ error: 'searchTermRows must be an array.' });
    return;
  }
  if (!Array.isArray(productRows)) {
    res.status(400).json({ error: 'productRows must be an array.' });
    return;
  }
  if (typeof thresholds !== 'object' || Array.isArray(thresholds)) {
    res.status(400).json({ error: 'thresholds must be an object.' });
    return;
  }

  // Size guard — prevent accidental very large payloads
  const totalRows = campaignRows.length + searchTermRows.length + productRows.length;
  if (totalRows > 50_000) {
    res.status(413).json({ error: `Payload too large: ${totalRows} rows. Max 50,000 total rows.` });
    return;
  }

  // ── Run analysis ───────────────────────────────────────────────────────────
  let result;
  try {
    result = runAnalysis({ campaignRows, searchTermRows, productRows, thresholds });
  } catch (err) {
    console.error('[ppc/analyze] runAnalysis error:', err);
    res.status(500).json({ error: 'Analysis failed. Check row format matches expected schema.' });
    return;
  }

  // ── Format response ────────────────────────────────────────────────────────
  let response;
  try {
    response = formatApiResponse(result);
  } catch (err) {
    console.error('[ppc/analyze] formatApiResponse error:', err);
    res.status(500).json({ error: 'Failed to format analysis results.' });
    return;
  }

  res.status(200).json(response);
}
