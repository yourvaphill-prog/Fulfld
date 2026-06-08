/**
 * Vercel serverless function — Keepa UPC search proxy.
 *
 * Frontend calls: POST /api/keepa  { upcs: string[] }
 * This function calls Keepa using the server-side KEEPA_API_KEY env var.
 * The key is never sent to or visible in the browser.
 *
 * ACCURACY NOTE — why positional mapping alone is wrong:
 * When Keepa cannot find a code, it may skip null entries instead of inserting
 * them, shifting the products[] array. This causes products to be assigned to
 * the wrong supplier UPC.
 *
 * FIX: every product is validated against the product's own barcode fields
 * (upcList / eanList). If the product has barcode data that contradicts the
 * supplier UPC, the match is rejected. Positional mapping is only trusted
 * when the product has no barcode fields at all (marked "unverified").
 */

// ── Barcode helpers ───────────────────────────────────────────────────────────

/** Strip everything except digits. */
function normalizeCode(code) {
  return String(code == null ? '' : code).trim().replace(/[^0-9]/g, '');
}

/**
 * Build the set of acceptable variants for a supplier UPC.
 *   12 digits → add EAN-13 (leading 0)
 *   13 digits starting with 0 → also include the 12-digit form
 */
function buildVariants(upc) {
  const s = normalizeCode(upc);
  const variants = new Set([s]);
  if (s.length === 12) {
    variants.add('0' + s);          // UPC-12 → EAN-13
  } else if (s.length === 13 && s.startsWith('0')) {
    variants.add(s.slice(1));       // EAN-13 → UPC-12
  }
  return variants;
}

/**
 * Collect every barcode Keepa provides for a product.
 * Returns a Set of normalized digit-only strings.
 */
function extractProductBarcodes(product) {
  const codes = new Set();
  const addList = arr => { if (Array.isArray(arr)) arr.forEach(c => { const n = normalizeCode(c); if (n) codes.add(n); }); };
  addList(product.upcList);
  addList(product.eanList);
  if (product.upc) codes.add(normalizeCode(product.upc));
  if (product.ean) codes.add(normalizeCode(product.ean));
  return codes;
}

/**
 * Validate a Keepa product against a single supplier UPC.
 * Returns:
 *   { match: true,  reason: 'exact_barcode'        }  — confirmed correct
 *   { match: false, reason: 'barcode_mismatch'      }  — confirmed wrong
 *   { match: null,  reason: 'no_barcode_data'       }  — can't confirm either way
 */
function validateProduct(product, supplierUPC) {
  const productCodes = extractProductBarcodes(product);

  if (productCodes.size === 0) {
    return { match: null, reason: 'no_barcode_data' };
  }

  const supplierVariants = buildVariants(supplierUPC);
  for (const variant of supplierVariants) {
    if (productCodes.has(variant)) {
      return { match: true, reason: 'exact_barcode' };
    }
  }
  return { match: false, reason: 'barcode_mismatch' };
}

// ── Handler ───────────────────────────────────────────────────────────────────
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.KEEPA_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'KEEPA_API_KEY is not configured. Add it in Vercel → Settings → Environment Variables.' });
    return;
  }

  const { upcs } = req.body || {};
  if (!Array.isArray(upcs) || upcs.length === 0) {
    res.status(400).json({ error: 'Request body must include a non-empty upcs array.' });
    return;
  }
  if (upcs.length > 20) {
    res.status(400).json({ error: 'Maximum 20 UPCs per request.' });
    return;
  }

  // Keep all UPCs as strings; normalise to digits only.
  const normalizedUPCs = upcs.map(u => normalizeCode(u));

  // Build search codes (EAN-13) and reverse map.
  // EAN-13 variants ensure Keepa can find 12-digit UPC-A codes.
  const ean13ToNormUPC = {};
  const searchCodes = normalizedUPCs.map(upc => {
    const ean = upc.length === 12 ? '0' + upc : upc;
    ean13ToNormUPC[ean]  = upc;
    ean13ToNormUPC[upc]  = upc;  // also keep original in case it's already 13 digits
    return ean;
  });

  console.log('[keepa] UPCs received (normalised):', normalizedUPCs);
  console.log('[keepa] Search codes (EAN-13):', searchCodes);

  const codeParam = searchCodes.join(',');
  const keepaUrl  = `https://api.keepa.com/product?key=${apiKey}&domain=1&code=${encodeURIComponent(codeParam)}&stats=90&buybox=1`;

  let keepaRes;
  try {
    keepaRes = await fetch(keepaUrl, {
      headers: { 'User-Agent': 'Fulfld-UPC-Scanner/1.0' },
      signal:  AbortSignal.timeout(28000),
    });
  } catch (err) {
    res.status(502).json({ error: `Keepa request failed: ${err.message}` });
    return;
  }

  if (keepaRes.status === 429) {
    res.status(429).json({ tokenLimitReached: true, error: 'Keepa token limit reached. Please wait before continuing.' });
    return;
  }
  if (!keepaRes.ok) {
    const txt = await keepaRes.text().catch(() => '');
    console.error('[keepa] Non-OK:', keepaRes.status, txt.slice(0, 300));
    res.status(502).json({ error: `Keepa API returned HTTP ${keepaRes.status}` });
    return;
  }

  let data;
  try { data = await keepaRes.json(); }
  catch { res.status(502).json({ error: 'Failed to parse Keepa response.' }); return; }

  console.log('[keepa] tokensLeft:', data.tokensLeft);
  const products = data.products || [];
  console.log('[keepa] products returned:', products.length, '| requested:', searchCodes.length);
  console.log('[keepa] ASINs returned:', products.map(p => p?.asin ?? 'null'));

  if (data.tokensLeft != null && data.tokensLeft < 5) {
    res.status(429).json({ tokenLimitReached: true, error: 'Keepa tokens critically low. Please wait.' });
    return;
  }

  // ── Accurate UPC → product matching ──────────────────────────────────────────
  //
  // We do NOT rely on positional mapping alone because Keepa may omit null
  // entries for unfound codes, shifting the array and causing false matches.
  //
  // Algorithm:
  //   1. Try exact barcode validation against every product's upcList / eanList.
  //   2. If a product's barcode fields confirm the supplier UPC → EXACT MATCH.
  //   3. If a product has barcode fields but they contradict the supplier UPC
  //      → BARCODE MISMATCH → reject (No Match for that UPC).
  //   4. If a product has NO barcode fields → fall back to positional mapping
  //      and tag result as "positional_unverified" so the UI can warn the user.
  //
  const results = {};
  for (const upc of normalizedUPCs) results[upc] = [];  // default: no match

  // Track which supplier UPCs have already been confirmed (to avoid double-assigns).
  const confirmedUPCs = new Set();

  // ── Pass 1: exact barcode matching (most accurate) ─────────────────────────
  for (const product of products) {
    if (product == null) continue;

    const productCodes   = extractProductBarcodes(product);
    const productCodesArr = [...productCodes];

    let matched = false;
    for (const upc of normalizedUPCs) {
      if (confirmedUPCs.has(upc)) continue;  // already confirmed for this batch
      const v = validateProduct(product, upc);

      if (v.match === true) {
        product._scanValidation = 'exact_barcode';
        product._scanNote       = null;
        results[upc].push(product);
        confirmedUPCs.add(upc);
        console.log(`[keepa] ✓ Exact barcode match: ASIN ${product.asin} → UPC ${upc}`);
        console.log(`[keepa]   Product codes: ${productCodesArr.join(', ')}`);
        matched = true;
        break;
      }
    }

    if (!matched) {
      // Product has barcode data but matched nothing — definite mismatch.
      if (productCodes.size > 0) {
        console.warn(`[keepa] ✗ Barcode mismatch: ASIN ${product.asin} has codes [${productCodesArr.join(', ')}] — no supplier UPC matched.`);
        // Product is NOT assigned to any UPC.
      }
      // Products with no barcode data are handled in Pass 2 below.
    }
  }

  // ── Pass 2: positional fallback for products with no barcode data ───────────
  // Only runs for UPCs not already confirmed in Pass 1.
  // We re-walk positionally because that's the best we can do without barcodes.
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    if (product == null) continue;

    const productCodes = extractProductBarcodes(product);
    if (productCodes.size > 0) continue;  // handled in Pass 1 (or rejected)

    // No barcode data → use positional mapping
    const searchCode   = searchCodes[i];
    const positionalUPC = searchCode ? ean13ToNormUPC[searchCode] : null;

    if (!positionalUPC || confirmedUPCs.has(positionalUPC)) continue;
    if (results[positionalUPC].length > 0) continue;  // already has a match

    product._scanValidation = 'positional_unverified';
    product._scanNote       = 'Keepa returned no barcode data for this product — match is by position only. Verify manually.';
    results[positionalUPC].push(product);
    console.log(`[keepa] ~ Positional (unverified, no barcode data): ASIN ${product.asin} → UPC ${positionalUPC}`);
  }

  // ── Mark rejected UPCs (where Keepa returned a product but barcode failed) ─
  // For UPCs still empty, check if there was a product at their positional slot
  // that was rejected due to barcode mismatch.
  for (let i = 0; i < normalizedUPCs.length; i++) {
    const upc     = normalizedUPCs[i];
    if (results[upc].length > 0) continue;  // already has a result

    const product = products[i];
    if (product == null) continue;

    const productCodes = extractProductBarcodes(product);
    if (productCodes.size > 0) {
      // There was a product at this position but it was rejected in Pass 1.
      // We return a special marker so the frontend can show the correct note.
      console.warn(`[keepa] UPC ${upc} had a positional product (${product.asin}) rejected by barcode validation.`);
      results[upc] = [{
        _scanValidation: 'barcode_mismatch',
        _scanNote:       'Keepa returned a product at this position, but its barcodes do not match this UPC. Marked as No Match.',
        _rejectedASIN:   product.asin,
      }];
    }
  }

  console.log('[keepa] Final mapping:', Object.fromEntries(
    Object.entries(results).map(([upc, arr]) => {
      const r = arr[0];
      if (!r)           return [upc, 'no_match'];
      if (r._scanValidation === 'barcode_mismatch') return [upc, `rejected(${r._rejectedASIN})`];
      return [upc, `${r._scanValidation}:${r.asin}`];
    })
  ));

  // ── BSR debug: log rank fields for every matched product ─────────────────────
  for (const [upc, arr] of Object.entries(results)) {
    const p = arr[0];
    if (!p || !p.asin) continue;
    const s = p.stats || {};
    console.log(`[keepa][bsr-debug] ASIN=${p.asin} title="${(p.title||'').slice(0,60)}"`);
    console.log(`  rootCategory=${p.rootCategory} salesRankReference=${p.salesRankReference}`);
    console.log(`  stats.current[3]=${s.current?.[3]} stats.avg30[3]=${s.avg30?.[3]} stats.avg90[3]=${s.avg90?.[3]}`);
    console.log(`  stats.currentSalesRank=${s.currentSalesRank} stats.avg90SalesRank=${s.avg90SalesRank}`);
    const srKeys = p.salesRanks ? Object.keys(p.salesRanks) : [];
    console.log(`  salesRanks keys (${srKeys.length}):`, srKeys.slice(0, 5).join(', '));
    if (srKeys.length > 0) {
      const rootKey = String(p.salesRankReference || p.rootCategory || '');
      const useKey  = srKeys.includes(rootKey) ? rootKey : srKeys[0];
      const arr2    = p.salesRanks[useKey] || [];
      // salesRanks arrays are [timestamp, rank, timestamp, rank …]
      const latestRank = arr2.length >= 2 ? arr2[arr2.length - 1] : null;
      console.log(`  salesRanks[${useKey}] latest rank=${latestRank}`);
    }
  }

  res.status(200).json({ results });
}
