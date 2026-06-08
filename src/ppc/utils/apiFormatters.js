/**
 * API Formatters — shapes the internal analysis result into the PPC Pilot API JSON contract.
 * Pure transformation. Zero side effects, zero imports needed.
 *
 * Input:  result of runAnalysis() from ppcAnalysisEngine.js
 * Output: the wire-format JSON returned by POST /api/ppc/analyze
 */

// ── Internal helpers ───────────────────────────────────────────────────────────

function safeNum(v) {
  return typeof v === 'number' ? v : null;
}

function pickFields(row, fields) {
  const out = {};
  for (const f of fields) out[f] = row[f] ?? null;
  return out;
}

// ── Section formatters ─────────────────────────────────────────────────────────

function formatAccountSnapshot(summary) {
  if (!summary) {
    return { spend: 0, sales: 0, orders: 0, acos: null, roas: null,
             clicks: 0, impressions: 0, ctr: null, cpc: null, cvr: null };
  }
  return {
    spend:       safeNum(summary.totalSpend),
    sales:       safeNum(summary.totalSales),
    orders:      safeNum(summary.totalOrders),
    acos:        typeof summary.avgAcos === 'number' ? summary.avgAcos : null,
    roas:        safeNum(summary.avgRoas),
    clicks:      safeNum(summary.totalClicks),
    impressions: safeNum(summary.totalImpressions),
    ctr:         safeNum(summary.avgCtr),
    cpc:         safeNum(summary.avgCpc),
    cvr:         safeNum(summary.avgCvr),
  };
}

function formatUrgentWaste(campaigns, searchTerms, thresholds) {
  const out = [];
  const t   = thresholds;

  // Campaigns with high spend and zero orders
  for (const c of campaigns) {
    if ((c.totalSpend ?? 0) >= t.maxNoOrderSpend && (c.totalOrders ?? 0) === 0) {
      out.push({
        type:   'campaign',
        entity: c.campaignName ?? '(unknown)',
        spend:  c.totalSpend ?? 0,
        orders: 0,
        reason: `$${(c.totalSpend ?? 0).toFixed(2)} spent with 0 orders`,
      });
    }
  }

  // Search terms with high spend and zero orders (top 10 by spend)
  const wastedTerms = searchTerms
    .filter(r => (r.spend ?? 0) >= t.maxNoOrderSpend && (r.orders ?? 0) === 0)
    .sort((a, b) => (b.spend ?? 0) - (a.spend ?? 0))
    .slice(0, 10);

  for (const r of wastedTerms) {
    out.push({
      type:   'searchTerm',
      entity: r.searchTerm ?? r.targeting ?? '(unknown)',
      spend:  r.spend ?? 0,
      orders: 0,
      reason: `$${(r.spend ?? 0).toFixed(2)} spent with 0 orders — add as negative keyword`,
    });
  }

  return out;
}

function formatNegatives(negatives) {
  return negatives.map(r => ({
    searchTerm:   r.searchTerm ?? r.targeting ?? '',
    campaignName: r.campaignName ?? null,
    adGroupName:  r.adGroupName  ?? null,
    negType:      r.negType,
    spend:        r.spend  ?? 0,
    clicks:       r.clicks ?? 0,
    orders:       r.orders ?? 0,
    acos:         typeof r.acos === 'number' ? r.acos : null,
    reason:       r.reason,
  }));
}

function formatWinners(winners) {
  const provenWinners = [];
  const earlyWinners  = [];
  const monitor       = [];

  for (const w of winners) {
    const row = {
      searchTerm:   w.searchTerm   ?? w.targeting ?? '',
      campaignName: w.campaignName ?? null,
      adGroupName:  w.adGroupName  ?? null,
      matchType:    w.matchType    ?? null,
      orders:       w.orders       ?? 0,
      spend:        w.spend        ?? 0,
      sales:        w.sales        ?? 0,
      acos:         typeof w.acos === 'number' ? w.acos : null,
      roas:         typeof w.roas === 'number' ? w.roas : null,
      tier:         w.tier,
      label:        w.label,
      action:       w.action,
      note:         w.note,
    };

    if (w.tier === 1) {
      provenWinners.push(row);
    } else if (w.tier === 2) {
      earlyWinners.push(row);
    } else {
      monitor.push(row);
    }
  }

  return { provenWinners, earlyWinners, monitor };
}

function formatScaleOpportunities(plan) {
  return plan
    .filter(r => r.statusGroup === 'scale')
    .map(r => ({
      campaignName:      r.campaignName ?? '(unknown)',
      status:            r.statusLabel  ?? 'Scale Opportunity',
      budgetDelta:       r.budgetDelta  ?? null,
      recommendedAction: r.recommendedAction ?? null,
      avgAcos:           safeNum(r.avgAcos),
      avgRoas:           safeNum(r.avgRoas),
      totalSpend:        safeNum(r.totalSpend),
      totalOrders:       safeNum(r.totalOrders),
      reason:            r.reason ?? null,
    }));
}

function formatProductReadiness(readiness) {
  return readiness.map(r => ({
    asin:        r.asin        ?? null,
    sku:         r.sku         ?? null,
    label:       r.label       ?? r.statusLabel ?? null,
    statusGroup: r.statusGroup ?? null,
    score:       r.score       ?? 0,
    totalOrders: safeNum(r.totalOrders),
    totalSpend:  safeNum(r.totalSpend),
    avgAcos:     safeNum(r.avgAcos),
    avgRoas:     safeNum(r.avgRoas),
    reason:      r.reason ?? null,
    action:      r.action ?? null,
  }));
}

function formatCampaignRecommendations(recommendations) {
  return recommendations.map(r => ({
    severity:    r.severity,
    type:        r.type,
    entity:      r.entity,
    headline:    r.headline,
    explanation: r.explanation ?? null,
    action:      r.action,
  }));
}

function formatDailyActionChecklist(plan, negatives, winners) {
  const addNegatives   = negatives
    .filter(r => r.negType === 'Negative Exact')
    .map(r => r.searchTerm ?? r.targeting ?? '')
    .filter(Boolean);

  const reduceBids     = plan
    .filter(r => r.statusGroup === 'optimize')
    .map(r => r.campaignName ?? '')
    .filter(Boolean);

  const increaseBudgets = plan
    .filter(r => r.statusGroup === 'scale')
    .map(r => r.campaignName ?? '')
    .filter(Boolean);

  const moveToExact    = winners
    .filter(w => w.tier === 1 || w.tier === 2)
    .map(w => w.searchTerm ?? w.targeting ?? '')
    .filter(Boolean);

  const watchlist      = plan
    .filter(r => r.statusGroup === 'at_risk')
    .map(r => r.campaignName ?? '')
    .filter(Boolean);

  return { addNegatives, reduceBids, increaseBudgets, moveToExact, watchlist };
}

function formatBossReportData(accountHealthScore, plan, planSum, rdSum, winners, recommendations) {
  const healthLabel =
    accountHealthScore >= 70 ? 'Healthy' :
    accountHealthScore >= 50 ? 'Mixed'   :
    accountHealthScore >= 30 ? 'At Risk' : 'Developing';

  const wins = [
    ...plan
      .filter(r => r.statusGroup === 'scale')
      .slice(0, 3)
      .map(r => `Campaign "${r.campaignName}" is scaling — ACoS ${r.avgAcos != null ? (r.avgAcos * 100).toFixed(1) + '%' : '—'}, ROAS ${r.avgRoas != null ? r.avgRoas.toFixed(2) + 'x' : '—'}`),
    ...winners
      .filter(w => w.tier === 1)
      .slice(0, 3)
      .map(w => `Proven winner: "${w.searchTerm ?? w.targeting}" — ${w.orders} orders, ACoS ${w.acos != null ? (w.acos * 100).toFixed(1) + '%' : '—'}`),
  ];

  const issues = recommendations
    .filter(r => r.severity === 'HIGH')
    .slice(0, 5)
    .map(r => r.headline);

  const nextSteps = [
    planSum.scaleCount   > 0 ? `Increase budget on ${planSum.scaleCount} scale-ready campaign${planSum.scaleCount !== 1 ? 's' : ''}` : null,
    planSum.pauseCount   > 0 ? `Pause ${planSum.pauseCount} campaign${planSum.pauseCount !== 1 ? 's' : ''} with zero orders` : null,
    planSum.optimizeCount > 0 ? `Reduce bids on ${planSum.optimizeCount} above-target-ACoS campaign${planSum.optimizeCount !== 1 ? 's' : ''}` : null,
    rdSum.needsReviewCount > 0 ? `Review listing quality for ${rdSum.needsReviewCount} product${rdSum.needsReviewCount !== 1 ? 's' : ''}` : null,
  ].filter(Boolean);

  return {
    accountHealthScore,
    healthLabel,
    wins,
    issues,
    nextSteps,
    campaignSummary: {
      total:        planSum.total,
      scale:        planSum.scaleCount,
      optimize:     planSum.optimizeCount,
      atRisk:       planSum.atRiskCount,
      pause:        planSum.pauseCount,
      spendAtRisk:  planSum.spendAtRisk,
    },
    productSummary: {
      total:        rdSum.total,
      readyToScale: rdSum.scaleCount,
      monitor:      rdSum.monitorCount,
      needsReview:  rdSum.needsReviewCount,
      poorFit:      rdSum.poorFitCount,
    },
  };
}

function formatAiReadySummary(summary, campaigns, searchTerms, winners, urgentWaste, recommendations) {
  const uniqueCampaigns = new Set(campaigns.map(c => c.campaignName ?? '')).size;
  const provenCount     = winners.filter(w => w.tier === 1).length;
  const earlyCount      = winners.filter(w => w.tier === 2).length;
  const topRec          = recommendations.find(r => r.severity === 'HIGH')
    ?? recommendations[0];

  return {
    reportDateRange:      null,
    totalCampaigns:       uniqueCampaigns,
    totalSearchTerms:     searchTerms.length,
    provenWinnerCount:    provenCount,
    earlyWinnerCount:     earlyCount,
    urgentWasteCount:     urgentWaste.length,
    topRecommendation:    topRec ? topRec.action : null,
    accountSpend:         summary ? (summary.totalSpend ?? 0) : 0,
    accountSales:         summary ? (summary.totalSales ?? 0) : 0,
    accountAcos:          summary ? (typeof summary.avgAcos === 'number' ? summary.avgAcos : null) : null,
    accountRoas:          summary ? (summary.avgRoas ?? null) : null,
  };
}

// ── Main export ────────────────────────────────────────────────────────────────

/**
 * Formats the internal analysis result into the PPC Pilot API JSON contract.
 *
 * @param {object} result - output of runAnalysis() from ppcAnalysisEngine.js
 * @returns {object} API response body
 */
export function formatApiResponse(result) {
  const {
    summary,
    campaigns,
    searchTerms,
    plan,
    planSum,
    readiness,
    rdSum,
    winners,
    negatives,
    recommendations,
    thresholds,
    accountHealthScore,
  } = result;

  const accountSnapshot      = formatAccountSnapshot(summary);
  const urgentWaste          = formatUrgentWaste(plan, searchTerms, thresholds);
  const negativeKeywordCandidates = formatNegatives(negatives);
  const winningKeywords      = formatWinners(winners);
  const scaleOpportunities   = formatScaleOpportunities(plan);
  const productReadiness     = formatProductReadiness(readiness);
  const campaignRecommendations = formatCampaignRecommendations(recommendations);
  const dailyActionChecklist = formatDailyActionChecklist(plan, negatives, winners);
  const bossReportData       = formatBossReportData(accountHealthScore, plan, planSum, rdSum, winners, recommendations);
  const aiReadySummary       = formatAiReadySummary(summary, campaigns, searchTerms, winners, urgentWaste, recommendations);

  return {
    accountSnapshot,
    urgentWaste,
    negativeKeywordCandidates,
    winningKeywords,
    scaleOpportunities,
    productReadiness,
    campaignRecommendations,
    dailyActionChecklist,
    bossReportData,
    aiReadySummary,
  };
}
