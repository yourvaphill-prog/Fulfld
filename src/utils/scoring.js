export const KPI_PRESETS = {
  conservative: {
    id: 'conservative',
    name: 'Conservative Fulfld KPI',
    description: 'Safe picks — proven revenue, low Amazon dominance',
    minRevenue: 500000,
    minSellers: 3,
    rejectAmazonDominant: true,
    rejectBrandSelfDominant: true,
    maxDominantShare: 60,
    minIdealMarketShare: 2,
    maxIdealMarketShare: 15,
    dominantMarketShare: 30,
    weights: { revenue: 30, sellers: 15, amazonPct: 15, growth: 15, brandScore: 15, marketOpportunity: 10 },
  },
  aggressive: {
    id: 'aggressive',
    name: 'Aggressive Growth KPI',
    description: 'Growth-first, lower revenue bar, tolerates competition',
    minRevenue: 100000,
    minSellers: 2,
    rejectAmazonDominant: false,
    rejectBrandSelfDominant: false,
    maxDominantShare: 80,
    minIdealMarketShare: 1,
    maxIdealMarketShare: 20,
    dominantMarketShare: 40,
    weights: { revenue: 15, sellers: 10, amazonPct: 10, growth: 35, brandScore: 20, marketOpportunity: 10 },
  },
  lowCompetition: {
    id: 'lowCompetition',
    name: 'Low Competition KPI',
    description: 'Few sellers, low Amazon % — easy to enter',
    minRevenue: 250000,
    minSellers: 2,
    rejectAmazonDominant: true,
    rejectBrandSelfDominant: false,
    maxDominantShare: 50,
    minIdealMarketShare: 1,
    maxIdealMarketShare: 10,
    dominantMarketShare: 25,
    weights: { revenue: 15, sellers: 30, amazonPct: 25, growth: 10, brandScore: 10, marketOpportunity: 10 },
  },
  highRevenue: {
    id: 'highRevenue',
    name: 'High Revenue KPI',
    description: 'Only $1M+ brands with strong pitch angle',
    minRevenue: 1000000,
    minSellers: 3,
    rejectAmazonDominant: true,
    rejectBrandSelfDominant: true,
    maxDominantShare: 60,
    minIdealMarketShare: 2,
    maxIdealMarketShare: 20,
    dominantMarketShare: 35,
    weights: { revenue: 40, sellers: 10, amazonPct: 15, growth: 10, brandScore: 15, marketOpportunity: 10 },
  },
};

export const DEFAULT_KPI = KPI_PRESETS.conservative;

export function calcScore(row, kpi, marketSharePct, adData = null) {
  // Guard: if kpi is null/corrupted fall back to DEFAULT_KPI
  const s = (kpi && kpi.weights && typeof kpi.weights === 'object') ? kpi : DEFAULT_KPI;
  const {
    minRevenue, minSellers,
    rejectAmazonDominant, rejectBrandSelfDominant, maxDominantShare,
    minIdealMarketShare = 2,
    maxIdealMarketShare = 15,
    dominantMarketShare = 30,
  } = s;
  // Guard: weights must be a valid object with numeric keys
  const weights = (s.weights && Number.isFinite(s.weights.revenue))
    ? s.weights
    : DEFAULT_KPI.weights;

  const revenue        = Number(row['Est. Monthly Revenue']) || 0;
  const amazonPct      = Number(row['Sales %']) || 0;
  const sellers        = Number(row['Avg. Sellers']) || 0;
  const growth1m       = Number(row['1 Month Growth']) || 0;
  const growth12m      = Number(row['12 Month Growth']) || 0;
  const brandScore     = Number(row['Brand Score']) || 0;
  const dominantSeller = (row['Dominant Seller'] || '').toLowerCase().trim();
  const dominantShare  = Number(row['Dominant Seller Share']) || 0;
  const brandName      = (row['Brand Name'] || '').toLowerCase().trim();
  const inStockRate    = Number(row['Amazon In-Stock Rate']) || 0;

  let score = 0;
  const breakdown = [];
  const rejectReasons = [];

  // ── Revenue ──────────────────────────────────────────────────────────────────
  let revScore = 0, revDetail = '—';
  if      (revenue >= 500000 && revenue < 5000000) { revScore = weights.revenue;        revDetail = `$${(revenue/1000).toFixed(0)}K — ideal range`; }
  else if (revenue >= 5000000)                      { revScore = weights.revenue * 0.8;  revDetail = `$${(revenue/1e6).toFixed(1)}M — large brand`; }
  else if (revenue >= 100000)                       { revScore = weights.revenue * 0.5;  revDetail = `$${(revenue/1000).toFixed(0)}K — viable`; }
  else if (revenue > 0)                             { revScore = weights.revenue * 0.05; revDetail = `$${(revenue/1000).toFixed(0)}K — too small`; }
  score += revScore;
  breakdown.push({ label: 'Revenue', earned: Math.round(revScore), max: weights.revenue, detail: revDetail });

  // ── Distribution Signal ───────────────────────────────────────────────────────
  let selScore = 0, selDetail = `${sellers} sellers`;
  if      (sellers >= 3 && sellers <= 8)  { selScore = weights.sellers;        selDetail += ' — ideal range'; }
  else if (sellers > 8  && sellers <= 20) { selScore = weights.sellers * 0.85; selDetail += ' — distribution issues'; }
  else if (sellers > 20)                  { selScore = weights.sellers * 0.7;  selDetail += ' — uncontrolled'; }
  else if (sellers >= 1)                  { selScore = weights.sellers * 0.2;  selDetail += ' — too controlled'; }
  if (inStockRate > 0 && inStockRate < 0.7) {
    selScore = Math.min(weights.sellers, selScore + weights.sellers * 0.15);
    selDetail += ` · ${(inStockRate * 100).toFixed(0)}% in-stock`;
  }
  score += selScore;
  breakdown.push({ label: 'Sellers', earned: Math.round(selScore), max: weights.sellers, detail: selDetail });

  // ── Amazon % ──────────────────────────────────────────────────────────────────
  let amzScore = 0;
  if      (amazonPct < 20) amzScore = weights.amazonPct;
  else if (amazonPct < 40) amzScore = weights.amazonPct * 0.75;
  else if (amazonPct < 60) amzScore = weights.amazonPct * 0.5;
  else if (amazonPct < 80) amzScore = weights.amazonPct * 0.25;
  score += amzScore;
  breakdown.push({ label: 'Amazon %', earned: Math.round(amzScore), max: weights.amazonPct, detail: `${amazonPct.toFixed(1)}%` });

  // ── Growth ────────────────────────────────────────────────────────────────────
  let gScore = 0;
  if (growth1m  > 0) gScore += weights.growth * 0.5;
  if (growth12m > 0) gScore += weights.growth * 0.5;
  score += gScore;
  breakdown.push({ label: 'Growth', earned: Math.round(gScore), max: weights.growth, detail: `1M: ${growth1m >= 0 ? '+' : ''}${(growth1m * 100).toFixed(1)}%` });

  // ── Optimization Gap ──────────────────────────────────────────────────────────
  let bsScore = 0, bsDetail = 'no data';
  if (brandScore > 0) {
    bsDetail = `${brandScore}/10`;
    if      (brandScore < 3) bsScore = weights.brandScore;
    else if (brandScore < 5) bsScore = weights.brandScore * 0.75;
    else if (brandScore < 7) bsScore = weights.brandScore * 0.5;
    else                     bsScore = weights.brandScore * 0.2;
  } else {
    bsScore  = weights.brandScore * 0.6;
    bsDetail = 'unknown';
  }
  if (adData) {
    const adSpend     = Number(adData['Total Ad Spend']) || 0;
    const searchTerms = Number(adData['Search Terms'])   || 0;
    if (adSpend < 5000 && revenue > 100000) {
      bsScore  = Math.min(weights.brandScore, bsScore + weights.brandScore * 0.2);
      bsDetail += ' · low ad spend';
    }
    if (searchTerms > 0 && searchTerms < 50) {
      bsScore  = Math.min(weights.brandScore, bsScore + weights.brandScore * 0.1);
      bsDetail += ` · ${searchTerms} terms`;
    }
  }
  score += bsScore;
  breakdown.push({ label: 'Optimization Gap', earned: Math.round(bsScore), max: weights.brandScore, detail: bsDetail });

  // ── Market Opportunity ────────────────────────────────────────────────────────
  const mow = weights.marketOpportunity ?? 0;
  let msScore = 0, msDetail = 'no subcat data';
  const validMsPct = marketSharePct !== null && marketSharePct !== undefined && marketSharePct <= 100;
  if (validMsPct && mow > 0) {
    msDetail = `${marketSharePct.toFixed(1)}% subcat share`;
    if      (marketSharePct >= minIdealMarketShare && marketSharePct <= maxIdealMarketShare) msScore = mow;
    else if (marketSharePct < minIdealMarketShare)                                           msScore = mow * 0.5;
    else if (marketSharePct <= dominantMarketShare)                                          msScore = mow * 0.3;
    else                                                                                     msScore = mow * 0.1;
  }
  score += msScore;
  breakdown.push({ label: 'Market Opportunity', earned: Math.round(msScore), max: mow, detail: msDetail });

  // ── Hard reject reasons ───────────────────────────────────────────────────────
  if (revenue > 0 && revenue < minRevenue)
    rejectReasons.push(`Revenue $${(revenue/1000).toFixed(0)}K below $${(minRevenue/1000).toFixed(0)}K min`);
  if (sellers > 0 && sellers < minSellers)
    rejectReasons.push(`${sellers} avg sellers below ${minSellers} min`);
  if (rejectAmazonDominant && dominantSeller && (dominantSeller === 'amazon.com' || dominantSeller.startsWith('amazon')))
    rejectReasons.push('Amazon.com is dominant seller');
  if (rejectBrandSelfDominant && dominantSeller && brandName && dominantSeller === brandName)
    rejectReasons.push('Brand self-dominates sales');
  if (maxDominantShare && dominantShare > maxDominantShare)
    rejectReasons.push(`Dominant share ${dominantShare.toFixed(0)}% > ${maxDominantShare}% limit`);
  if (validMsPct && marketSharePct >= dominantMarketShare)
    rejectReasons.push(`Already dominant at ${marketSharePct.toFixed(1)}% subcategory share`);

  // ── Dominance penalty ─────────────────────────────────────────────────────────
  let dominancePenalty = 1.0;
  if (validMsPct) {
    if      (marketSharePct >= 50) dominancePenalty = 0.30;
    else if (marketSharePct >= 40) dominancePenalty = 0.45;
    else if (marketSharePct >= 30) dominancePenalty = 0.60;
  }

  const finalScore  = Math.min(100, Math.max(0, Math.round(score * dominancePenalty)));
  const isCallReady = finalScore >= 65 && rejectReasons.length === 0;

  return { score: finalScore, breakdown, rejectReasons, isCallReady };
}

export function scoreColor(score) {
  if (score >= 70) return '#00ff87';
  if (score >= 45) return '#ffd166';
  return '#ef476f';
}
