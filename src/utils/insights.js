export function generateInsights(brand, allData, kpiSettings, msPct = null, isMismatch = false) {
  const insights = [];

  const revenue        = Number(brand['Est. Monthly Revenue']) || 0;
  const amazonPct      = Number(brand['Sales %']) || 0;
  const sellers        = Number(brand['Avg. Sellers']) || 0;
  const growth1m       = Number(brand['1 Month Growth']) || 0;
  const brandName      = (brand['Brand Name'] || '').toLowerCase();
  const dominantSeller = (brand['Dominant Seller'] || '').toLowerCase();
  const dominantShare  = Number(brand['Dominant Seller Share']) || 0;
  const inStockRate    = Number(brand['Amazon In-Stock Rate']) || 0;
  const smBrandScore   = Number(brand['Brand Score']) || 0;

  const minIdeal   = kpiSettings?.minIdealMarketShare ?? 2;
  const maxIdeal   = kpiSettings?.maxIdealMarketShare ?? 15;
  const dominantMs = kpiSettings?.dominantMarketShare ?? 30;

  const adData = (allData.adspy || []).find(a => (a['Brand'] || '').toLowerCase() === brandName);
  const brandAdSpend     = adData ? (Number(adData['Total Ad Spend']) || 0) : 0;
  const brandSearchTerms = adData ? (Number(adData['Search Terms'])   || 0) : 0;

  // ── Market share ──────────────────────────────────────────────────────────────
  if (isMismatch) {
    insights.push({ type: 'neutral', icon: '⚠️', title: 'Subcategory data mismatch — excluded from scoring', body: 'Brand revenue exceeds the matched subcategory total. Market share excluded from scoring.' });
  } else if (msPct !== null) {
    if (msPct >= minIdeal && msPct <= maxIdeal) {
      insights.push({ type: 'opportunity', icon: '🎯', title: 'Under-positioned — strong growth opportunity', body: `Brand holds ${msPct.toFixed(1)}% of subcategory revenue — proven but under-positioned. Ideal range for Fulfld to add meaningful distribution impact.` });
    } else if (msPct > maxIdeal && msPct <= dominantMs) {
      insights.push({ type: 'neutral', icon: '📊', title: 'Moderate subcategory position', body: `Brand holds ${msPct.toFixed(1)}% of subcategory revenue — moderately established. Some distribution opportunity remains.` });
    } else if (msPct > dominantMs) {
      insights.push({ type: 'risk', icon: '👑', title: 'Already dominant in subcategory', body: `Brand controls ${msPct.toFixed(1)}% of subcategory revenue. Less room for Fulfld to move the needle.` });
    } else if (msPct > 0 && msPct < minIdeal) {
      insights.push({ type: 'neutral', icon: '🔍', title: 'Low subcategory share', body: `Brand holds only ${msPct.toFixed(1)}% of subcategory revenue — may be too early-stage or niche.` });
    }
  }

  // ── Competitor ad gap ─────────────────────────────────────────────────────────
  if (adData) {
    const maxCompetitorSpend = (allData.adspy || []).reduce((max, a) => {
      if ((a['Brand'] || '').toLowerCase() === brandName) return max;
      return Math.max(max, Number(a['Total Ad Spend']) || 0);
    }, 0);
    if (brandAdSpend > 0 && maxCompetitorSpend > brandAdSpend * 5 && maxCompetitorSpend > 50000) {
      insights.push({ type: 'opportunity', icon: '🔥', title: 'Competitors are capturing demand', body: `Top competitor spends $${(maxCompetitorSpend/1000).toFixed(0)}K/mo on ads vs this brand's $${(brandAdSpend/1000).toFixed(0)}K. Fulfld can help close this revenue gap.` });
    }
    if (brandAdSpend < 5000 && maxCompetitorSpend < 20000 && revenue > 300000) {
      insights.push({ type: 'opportunity', icon: '💡', title: 'Entire category is under-advertised', body: 'Neither this brand nor its competitors are investing heavily in ads. First-mover distribution advantage available for Fulfld.' });
    }
  }

  // ── Low search visibility ─────────────────────────────────────────────────────
  if (brandSearchTerms > 0 && brandSearchTerms < 50) {
    insights.push({ type: 'opportunity', icon: '👁️', title: 'Low search visibility', body: `Brand ranks for only ${brandSearchTerms} search terms — significantly under-indexed. Strong opportunity for distribution and ad support.` });
  }

  if (smBrandScore > 0 && smBrandScore < 4 && revenue > 100000) {
    insights.push({ type: 'opportunity', icon: '🚀', title: 'Under-Optimized Brand', body: `SmartScout brand score is ${smBrandScore}/10 — brand is under-investing in growth. Fulfld's distribution support could unlock significant upside.` });
  }

  // ── Distribution problems ─────────────────────────────────────────────────────
  const hasDistributionChaos = sellers > 8;
  const hasStockoutProblem   = inStockRate > 0 && inStockRate < 0.7;
  const hasFragmentedControl = dominantShare > 0 && dominantShare < 40 && sellers > 4;

  if (hasDistributionChaos || (hasStockoutProblem && sellers > 3)) {
    const parts = [];
    if (hasDistributionChaos) parts.push(`${sellers} sellers competing for the buy box`);
    if (hasStockoutProblem)   parts.push(`${(inStockRate * 100).toFixed(0)}% Amazon in-stock rate`);
    if (hasFragmentedControl) parts.push(`dominant seller controls only ${dominantShare.toFixed(0)}%`);
    insights.push({ type: 'opportunity', icon: '🔧', title: 'Uncontrolled distribution — Fulfld can fix this', body: `${parts.join(' · ')}. Fulfld can bring order to distribution, protect margin, and improve shelf availability.` });
  }

  if (hasStockoutProblem && !hasDistributionChaos) {
    insights.push({ type: 'opportunity', icon: '📦', title: 'Low Amazon In-Stock Rate', body: `Amazon in-stock rate is ${(inStockRate * 100).toFixed(0)}% — consistent inventory from Fulfld could capture lost demand.` });
  }

  // ── Growth momentum ───────────────────────────────────────────────────────────
  if (growth1m > 0.05) {
    insights.push({ type: 'positive', icon: '⚡', title: 'Strong growth momentum', body: `+${(growth1m * 100).toFixed(1)}% growth last month — brand is gaining traction. Fulfld can accelerate this with consistent supply.` });
  }

  // ── High ad spend ─────────────────────────────────────────────────────────────
  if (brandAdSpend > 50000) {
    insights.push({ type: 'opportunity', icon: '💰', title: 'High ad spend confirms demand', body: `Brand spending $${(brandAdSpend/1000).toFixed(0)}K/mo on ads — demand is validated and category is proven.` });
  }

  // ── Risks ─────────────────────────────────────────────────────────────────────
  if (amazonPct > 70) {
    insights.push({ type: 'risk', icon: '⚠️', title: 'High Amazon dominance', body: `Amazon accounts for ${amazonPct.toFixed(0)}% of sales — high platform dependency, may be resistant to 3P sellers.` });
  }
  if (dominantSeller && dominantSeller !== 'amazon.com' && dominantSeller === brandName && dominantShare > 50) {
    insights.push({ type: 'risk', icon: '🔒', title: 'Brand self-dominates', body: `The brand controls ${dominantShare.toFixed(0)}% of its own sales — likely selling direct, not seeking 3P distribution.` });
  }
  if (sellers > 20) {
    insights.push({ type: 'risk', icon: '📊', title: 'Over-distributed', body: `${sellers} avg sellers per product — highly competitive, likely margin-compressed.` });
  }

  return insights;
}
