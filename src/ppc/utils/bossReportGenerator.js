/**
 * PPC Boss Report Generator
 *
 * Produces an executive-tone, copy-paste-ready text report.
 * Different from the Weekly Report: narrative language, fewer raw numbers,
 * account-level health score, wins / issues / next-steps structure.
 *
 * Pure function — no side effects, no localStorage, no React.
 */

import { buildScalingPlan, summarisePlan } from './scalingEngine.js';
import { buildReadinessPlan, summariseReadiness } from './adReadinessScore.js';
import { buildWinners } from './winnerClassifier.js';

// ── Inline formatters (plain strings, no JSX) ──────────────────────────────────
function usd(v)  { return typeof v === 'number' ? '$' + v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'; }
function pct(v)  { return typeof v === 'number' ? (v * 100).toFixed(1) + '%' : '—'; }
function roas(v) { return typeof v === 'number' ? v.toFixed(2) + 'x' : '—'; }
function num(v)  { return typeof v === 'number' ? v.toLocaleString('en-US', { maximumFractionDigits: 0 }) : '—'; }

// ── Section separator ──────────────────────────────────────────────────────────
function sep(title) {
  const bar = '─'.repeat(60);
  return `\n${bar}\n${title.toUpperCase()}\n${bar}`;
}

// ── Account-level health score (0–100) ────────────────────────────────────────
function calcAccountHealth(summary, thresholds, plan, readiness) {
  if (!summary) return 0;
  let score = 0;

  // ACoS (30 pts)
  if (typeof summary.avgAcos === 'number') {
    if (summary.avgAcos <= thresholds.targetACoS)          score += 30;
    else if (summary.avgAcos <= thresholds.targetACoS * 1.3) score += 20;
    else if (summary.avgAcos <= thresholds.targetACoS * 1.7) score += 10;
  }

  // ROAS (25 pts)
  if (typeof summary.avgRoas === 'number') {
    if (summary.avgRoas >= thresholds.goodROASThreshold)           score += 25;
    else if (summary.avgRoas >= thresholds.goodROASThreshold * 0.7) score += 15;
    else if (summary.avgRoas >= 1)                                  score += 8;
  }

  // Scale candidates proportion (20 pts)
  const planSum = summarisePlan(plan);
  if (planSum.total > 0) {
    const scaleRatio = planSum.scaleCount / planSum.total;
    if (scaleRatio >= 0.4)      score += 20;
    else if (scaleRatio >= 0.2) score += 13;
    else if (scaleRatio >= 0.1) score += 7;
  }

  // Product readiness (15 pts)
  const rdSum = summariseReadiness(readiness);
  if (rdSum.total > 0) {
    const readyRatio = rdSum.scaleCount / rdSum.total;
    if (readyRatio >= 0.4)      score += 15;
    else if (readyRatio >= 0.2) score += 10;
    else if (readyRatio >= 0.1) score += 5;
  }

  // Pause / poor-fit drag (−10 pts max)
  if (planSum.pauseCount > 0 && planSum.total > 0) {
    const pauseRatio = planSum.pauseCount / planSum.total;
    if (pauseRatio >= 0.3)      score -= 10;
    else if (pauseRatio >= 0.1) score -= 5;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

function healthState(score) {
  if (score >= 70) return { label: 'Healthy',    emoji: '🟢' };
  if (score >= 50) return { label: 'Mixed',      emoji: '🟡' };
  if (score >= 30) return { label: 'At Risk',    emoji: '🟠' };
  return             { label: 'Developing',  emoji: '🔴' };
}

// ── Section builders ───────────────────────────────────────────────────────────

function sectionOverallPerformance(summary) {
  if (!summary) return sep('OVERALL PERFORMANCE') + '\n  No data loaded.';
  const lines = [
    sep('OVERALL PERFORMANCE'),
    '',
    `  Total Spend       ${usd(summary.totalSpend)}`,
    `  Total Sales       ${usd(summary.totalSales)}`,
    `  Orders            ${num(summary.totalOrders)}`,
    `  Impressions       ${num(summary.totalImpressions)}`,
    `  Clicks            ${num(summary.totalClicks)}`,
    `  CTR               ${pct(summary.avgCtr)}`,
    `  CPC               ${usd(summary.avgCpc)}`,
    `  ACoS              ${pct(summary.avgAcos)}`,
    `  ROAS              ${roas(summary.avgRoas)}`,
    `  Conversion Rate   ${pct(summary.avgCvr)}`,
  ];
  return lines.join('\n');
}

function sectionExecutiveSummary(accountScore, state, summary, thresholds, planSum, rdSum) {
  const lines = [sep('EXECUTIVE SUMMARY'), ''];

  lines.push(`  Account Health Score: ${accountScore}/100  ${state.emoji} ${state.label}`);
  lines.push('');

  if (state.label === 'Healthy') {
    lines.push(
      `  The account is performing well. ACoS is ${pct(summary?.avgAcos)} against a ` +
      `${pct(thresholds.targetACoS)} target, and ROAS of ${roas(summary?.avgRoas)} ` +
      `exceeds the ${roas(thresholds.goodROASThreshold)} threshold. ` +
      `${planSum.scaleCount} campaign${planSum.scaleCount !== 1 ? 's' : ''} ` +
      `${planSum.scaleCount !== 1 ? 'are' : 'is'} ready to scale and ` +
      `${rdSum.scaleCount} product${rdSum.scaleCount !== 1 ? 's' : ''} ` +
      `${rdSum.scaleCount !== 1 ? 'meet' : 'meets'} all readiness criteria.`
    );
  } else if (state.label === 'Mixed') {
    lines.push(
      `  Performance is mixed. Some campaigns are hitting targets while others ` +
      `need attention. ACoS is ${pct(summary?.avgAcos)} (target: ${pct(thresholds.targetACoS)}), ` +
      `ROAS is ${roas(summary?.avgRoas)}. ` +
      `${planSum.optimizeCount} campaign${planSum.optimizeCount !== 1 ? 's' : ''} ` +
      `${planSum.optimizeCount !== 1 ? 'need' : 'needs'} bid optimization before scaling.`
    );
  } else if (state.label === 'At Risk') {
    lines.push(
      `  The account has several areas requiring immediate attention. ` +
      `ACoS of ${pct(summary?.avgAcos)} is above the ${pct(thresholds.targetACoS)} target. ` +
      `${planSum.pauseCount > 0 ? `${planSum.pauseCount} campaign${planSum.pauseCount !== 1 ? 's are' : ' is'} recommended for pause. ` : ''}` +
      `${planSum.atRiskCount > 0 ? `${planSum.atRiskCount} campaign${planSum.atRiskCount !== 1 ? 's are' : ' is'} at risk due to CTR or CPC issues. ` : ''}` +
      `Immediate optimization recommended.`
    );
  } else {
    lines.push(
      `  The account is in early stages or has insufficient data to make strong ` +
      `optimization decisions. Current ACoS is ${pct(summary?.avgAcos)}, ROAS ` +
      `${roas(summary?.avgRoas)}. ` +
      `${planSum.needsDataCount} campaign${planSum.needsDataCount !== 1 ? 's' : ''} ` +
      `${planSum.needsDataCount !== 1 ? 'need' : 'needs'} more data before optimizing.`
    );
  }

  return lines.join('\n');
}

function sectionWhatIsWorking(plan, readiness, winners) {
  const lines = [sep('WHAT IS WORKING'), ''];

  // Top scaling campaigns
  const topScale = plan.filter(r => r.statusGroup === 'scale').slice(0, 3);
  if (topScale.length) {
    lines.push('  Top Performing Campaigns:');
    topScale.forEach(c => {
      lines.push(
        `    ✓ ${c.campaignName}` +
        `  |  ACoS ${pct(c.avgAcos)}  |  ROAS ${roas(c.avgRoas)}  |  Orders ${num(c.totalOrders)}`
      );
    });
  } else {
    lines.push('  No campaigns currently meeting scale criteria.');
  }

  lines.push('');

  // Top winners
  const highPriorityWinners = winners.filter(w => w.tier === 1).slice(0, 3);
  if (highPriorityWinners.length) {
    lines.push('  Top Winning Search Terms:');
    highPriorityWinners.forEach(w => {
      lines.push(
        `    ✓ "${w.searchTerm ?? w.term ?? '—'}"` +
        `  |  ACoS ${pct(w.avgAcos ?? w.acos)}  |  ROAS ${roas(w.avgRoas ?? w.roas)}  |  Orders ${num(w.totalOrders ?? w.orders)}`
      );
    });
  } else {
    lines.push('  No high-priority winning search terms identified.');
  }

  lines.push('');

  // Top ready products
  const topReady = readiness.filter(r => r.statusGroup === 'scale').slice(0, 3);
  if (topReady.length) {
    lines.push('  Products Ready to Scale:');
    topReady.forEach(p => {
      const id = p.asin ?? p.sku ?? '—';
      lines.push(
        `    ✓ ${id}` +
        `  |  Score ${p.score}/100  |  ACoS ${pct(p.avgAcos)}  |  Orders ${num(p.totalOrders)}`
      );
    });
  } else {
    lines.push('  No products currently meeting all readiness criteria.');
  }

  return lines.join('\n');
}

function sectionMainIssues(recommendations) {
  const highs = recommendations.filter(r => r.severity === 'HIGH').slice(0, 5);
  const lines = [sep('MAIN ISSUES'), ''];

  if (!highs.length) {
    lines.push('  No high-priority issues detected.');
    return lines.join('\n');
  }

  highs.forEach((rec, i) => {
    lines.push(`  ${i + 1}. ${rec.headline}`);
    lines.push(`     → ${rec.action}`);
    if (i < highs.length - 1) lines.push('');
  });

  return lines.join('\n');
}

function sectionRecommendedActions(recommendations) {
  const lines = [sep('RECOMMENDED ACTIONS'), ''];

  if (!recommendations.length) {
    lines.push('  No recommendations at this time.');
    return lines.join('\n');
  }

  // Group by action prefix keyword
  const grouped = { 'Reduce / Pause': [], 'Scale / Increase': [], 'Review / Optimize': [], 'Other': [] };
  recommendations.forEach(rec => {
    const a = (rec.action || '').toLowerCase();
    if (/pause|reduce|cut/.test(a))      grouped['Reduce / Pause'].push(rec);
    else if (/scale|increase|expand/.test(a)) grouped['Scale / Increase'].push(rec);
    else if (/review|optimize|improve/.test(a)) grouped['Review / Optimize'].push(rec);
    else grouped['Other'].push(rec);
  });

  Object.entries(grouped).forEach(([label, recs]) => {
    if (!recs.length) return;
    lines.push(`  ${label} (${recs.length}):`);
    recs.slice(0, 4).forEach(rec => {
      lines.push(`    • ${rec.action} — ${rec.headline}`);
    });
    if (recs.length > 4) lines.push(`    … and ${recs.length - 4} more`);
    lines.push('');
  });

  return lines.join('\n').trimEnd();
}

function sectionCampaignScaling(plan, planSum) {
  const lines = [sep('CAMPAIGN SCALING SUMMARY'), ''];

  lines.push(
    `  Total Campaigns: ${planSum.total}  |  ` +
    `Scale: ${planSum.scaleCount}  |  ` +
    `Optimize: ${planSum.optimizeCount}  |  ` +
    `At Risk: ${planSum.atRiskCount}  |  ` +
    `Pause: ${planSum.pauseCount}`
  );
  lines.push('');

  // Top 3 scale candidates
  const scaleTop = plan.filter(r => r.statusGroup === 'scale').slice(0, 3);
  if (scaleTop.length) {
    lines.push('  Recommended Budget Increases:');
    scaleTop.forEach(c => {
      lines.push(
        `    ↑ ${c.campaignName}  |  ` +
        `Budget delta: ${c.budgetDelta ?? '—'}  |  ` +
        `Spend ${usd(c.totalSpend)}  |  ROAS ${roas(c.avgRoas)}`
      );
    });
    lines.push('');
  }

  // Top pause candidate
  const pauseTop = plan.filter(r => r.statusGroup === 'pause').slice(0, 2);
  if (pauseTop.length) {
    lines.push('  Campaigns to Pause / Review:');
    pauseTop.forEach(c => {
      lines.push(`    ✗ ${c.campaignName}  |  Spend ${usd(c.totalSpend)} with 0 orders`);
    });
    if (planSum.spendAtRisk > 0) lines.push(`    Spend at risk: ${usd(planSum.spendAtRisk)}`);
  }

  return lines.join('\n');
}

function sectionProductReadiness(readiness, rdSum) {
  const lines = [sep('PRODUCT READINESS SUMMARY'), ''];

  lines.push(
    `  Total Products: ${rdSum.total}  |  ` +
    `Ready to Scale: ${rdSum.scaleCount}  |  ` +
    `Monitor: ${rdSum.monitorCount}  |  ` +
    `Needs Review: ${rdSum.needsReviewCount}  |  ` +
    `Poor PPC Fit: ${rdSum.poorFitCount}`
  );
  lines.push('');

  const topReady = readiness.filter(r => r.statusGroup === 'scale').slice(0, 3);
  if (topReady.length) {
    lines.push('  Top Ready-to-Scale Products:');
    topReady.forEach(p => {
      lines.push(
        `    ✓ ${p.asin ?? p.sku ?? '—'}` +
        `  Score ${p.score}/100  |  ROAS ${roas(p.avgRoas)}  |  Orders ${num(p.totalOrders)}`
      );
    });
    lines.push('');
  }

  const poorFit = readiness.filter(r => r.statusGroup === 'poor_fit').slice(0, 2);
  if (poorFit.length) {
    lines.push('  Poor PPC Fit — Recommend Pausing:');
    poorFit.forEach(p => {
      lines.push(`    ✗ ${p.asin ?? p.sku ?? '—'}  |  Spend ${usd(p.totalSpend)} with 0 orders`);
    });
    if (rdSum.spendAtRisk > 0) lines.push(`    Spend at risk: ${usd(rdSum.spendAtRisk)}`);
  }

  return lines.join('\n');
}

function sectionKeywordSummary(searchTerms, thresholds, winners) {
  const lines = [sep('KEYWORD SUMMARY'), ''];

  // Negatives — inline filter (same logic as NegativeKeywordBuilder)
  const negCandidates = searchTerms.filter(r =>
    (r.orders ?? 0) === 0 &&
    (r.sales  ?? 0) === 0 &&
    (r.spend  ?? 0) >= thresholds.maxNoOrderSpend &&
    ((r.spend ?? 0) > 0 || (r.clicks ?? 0) > 0)
  );
  const negSpend = negCandidates.reduce((s, r) => s + (r.spend ?? 0), 0);

  lines.push(`  Negative Keywords:`);
  lines.push(`    Wasted-spend terms to add as negatives: ${negCandidates.length}`);
  if (negSpend > 0) lines.push(`    Total wasted spend:                 ${usd(negSpend)}`);
  if (negCandidates.length) {
    const examples = negCandidates.slice(0, 3).map(r => `"${r.searchTerm ?? r.term ?? '?'}"`);
    lines.push(`    Examples: ${examples.join(', ')}`);
  }
  lines.push('');

  // Winners
  const highPriority = winners.filter(w => w.tier === 1);
  const moderate     = winners.filter(w => w.tier === 2);
  lines.push(`  Winning Keywords:`);
  lines.push(`    High-priority Exact Match candidates: ${highPriority.length}`);
  lines.push(`    Moderate-priority candidates:         ${moderate.length}`);
  if (highPriority.length) {
    const exWin = highPriority.slice(0, 3).map(w => `"${w.searchTerm ?? w.term ?? '?'}"`);
    lines.push(`    Examples: ${exWin.join(', ')}`);
  }

  return lines.join('\n');
}

function sectionActionTracker(trackedActions) {
  const lines = [sep('ACTION TRACKER SUMMARY'), ''];

  if (!trackedActions.length) {
    lines.push('  No tracked actions yet. Add items from the Recommendations tab.');
    return lines.join('\n');
  }

  const open       = trackedActions.filter(a => a.status === 'open');
  const inProgress = trackedActions.filter(a => a.status === 'in_progress');
  const done       = trackedActions.filter(a => a.status === 'done');
  const ignored    = trackedActions.filter(a => a.status === 'ignored');

  lines.push(
    `  Open: ${open.length}  |  In Progress: ${inProgress.length}  |  ` +
    `Done: ${done.length}  |  Dismissed: ${ignored.length}`
  );
  lines.push('');

  const active = [...open, ...inProgress].slice(0, 5);
  if (active.length) {
    lines.push('  Active Items:');
    active.forEach(a => {
      const sev = a.severity === 'HIGH' ? '🔴' : a.severity === 'OPPORTUNITY' ? '🟢' : '🟡';
      lines.push(`    ${sev} [${a.status.toUpperCase()}] ${a.headline}`);
    });
  }

  if (done.length) {
    lines.push(`\n  Completed This Session: ${done.length} action${done.length !== 1 ? 's' : ''}`);
  }

  return lines.join('\n');
}

function sectionHistory(history) {
  const lines = [sep('WEEK-OVER-WEEK HISTORY'), ''];

  if (history.length >= 2) {
    const curr = history[0];
    const prev = history[1];

    const acosChange  = typeof curr.summary?.avgAcos === 'number' && typeof prev.summary?.avgAcos === 'number'
      ? curr.summary.avgAcos - prev.summary.avgAcos
      : null;
    const roasChange  = typeof curr.summary?.avgRoas === 'number' && typeof prev.summary?.avgRoas === 'number'
      ? curr.summary.avgRoas - prev.summary.avgRoas
      : null;
    const spendChange = typeof curr.summary?.totalSpend === 'number' && typeof prev.summary?.totalSpend === 'number'
      ? curr.summary.totalSpend - prev.summary.totalSpend
      : null;
    const salesChange = typeof curr.summary?.totalSales === 'number' && typeof prev.summary?.totalSales === 'number'
      ? curr.summary.totalSales - prev.summary.totalSales
      : null;

    lines.push(`  Comparing: ${curr.weekLabel}  vs  ${prev.weekLabel}`);
    lines.push('');
    lines.push('  Metric        This Week         Last Week         Change');
    lines.push('  ' + '─'.repeat(58));

    const row = (label, curr, prev, fmt, posIsGood) => {
      const change = typeof curr === 'number' && typeof prev === 'number' ? curr - prev : null;
      const arrow  = change === null ? '  —  ' : change > 0 ? (posIsGood ? '  ↑ ' : '  ↑ ') : (posIsGood ? '  ↓ ' : '  ↓ ');
      const sign   = change === null ? '' : change >= 0 ? '+' : '';
      const changeStr = change === null ? '—' : sign + fmt(change);
      const indicator = change === null ? '' : (posIsGood ? (change > 0 ? '✓' : '✗') : (change < 0 ? '✓' : '✗'));
      return `  ${label.padEnd(14)}${fmt(curr).padEnd(18)}${fmt(prev).padEnd(18)}${changeStr} ${indicator}`;
    };

    lines.push(row('ACoS',  curr.summary?.avgAcos,   prev.summary?.avgAcos,   pct,  false));
    lines.push(row('ROAS',  curr.summary?.avgRoas,   prev.summary?.avgRoas,   roas, true));
    lines.push(row('Spend', curr.summary?.totalSpend, prev.summary?.totalSpend, usd,  null));
    lines.push(row('Sales', curr.summary?.totalSales, prev.summary?.totalSales, usd,  true));

  } else if (history.length === 1) {
    lines.push(`  ${history[0].weekLabel} — only one week saved.`);
    lines.push('  Save another week from the Weekly Report tab to enable week-over-week comparison.');
  } else {
    lines.push('  No history saved yet.');
    lines.push('  To compare week-over-week, save a weekly snapshot from the Weekly Report tab.');
  }

  return lines.join('\n');
}

function sectionNextWeekFocus(planSum, rdSum, negCandidates, highPriorityWinners, recommendations, accountScore) {
  const lines = [sep('NEXT WEEK FOCUS'), ''];
  const bullets = [];

  // Scaling
  if (planSum.scaleCount > 0) {
    bullets.push(
      `Increase budget on ${planSum.scaleCount} scale-ready campaign${planSum.scaleCount !== 1 ? 's' : ''} by 15–20%.`
    );
  }

  // Pausing
  if (planSum.pauseCount > 0) {
    bullets.push(
      `Pause or review ${planSum.pauseCount} campaign${planSum.pauseCount !== 1 ? 's' : ''} with zero orders.`
    );
  }

  // Negative keywords
  if (negCandidates > 0) {
    bullets.push(`Add ${negCandidates} wasted-spend search term${negCandidates !== 1 ? 's' : ''} as negative keywords.`);
  }

  // Exact match winners
  if (highPriorityWinners > 0) {
    bullets.push(
      `Promote top ${Math.min(highPriorityWinners, 5)} winning search term${highPriorityWinners !== 1 ? 's' : ''} to dedicated Exact Match campaigns.`
    );
  }

  // Product readiness
  if (rdSum.needsReviewCount > 0) {
    bullets.push(
      `Review listing quality for ${rdSum.needsReviewCount} product${rdSum.needsReviewCount !== 1 ? 's' : ''} flagged with conversion issues.`
    );
  }

  // ACoS optimization
  if (planSum.optimizeCount > 0) {
    bullets.push(
      `Reduce bids on ${planSum.optimizeCount} campaign${planSum.optimizeCount !== 1 ? 's' : ''} with above-target ACoS.`
    );
  }

  // High-priority recommendations
  const highRecs = recommendations.filter(r => r.severity === 'HIGH');
  if (highRecs.length > 0 && bullets.length < 5) {
    bullets.push(`Address ${highRecs.length} high-priority recommendation${highRecs.length !== 1 ? 's' : ''} in the Recommendations tab.`);
  }

  // Fallback
  if (!bullets.length) {
    bullets.push('Continue monitoring — no urgent action items at this time.');
    if (accountScore >= 70) bullets.push('Account is healthy. Maintain current settings and review again next week.');
  }

  bullets.slice(0, 5).forEach((b, i) => {
    lines.push(`  ${i + 1}. ${b}`);
  });

  return lines.join('\n');
}

// ── Main export ────────────────────────────────────────────────────────────────
/**
 * @param {object} params
 * @param {object|null}  params.summary          - from aggregateMetrics()
 * @param {Array}        params.campaigns         - raw campaign rows
 * @param {Array}        params.searchTerms       - raw search term rows
 * @param {Array}        params.products          - raw product rows
 * @param {Array}        params.recommendations   - from generateRecommendations()
 * @param {Array}        params.trackedActions    - from localStorage ppc_tracked_actions
 * @param {Array}        params.history           - from localStorage ppc_history
 * @param {object}       params.thresholds        - current threshold settings
 * @param {string}       [params.dateLabel]       - optional "May 5–11, 2026"
 * @returns {string} formatted report text
 */
export function generateBossReport({
  summary,
  campaigns   = [],
  searchTerms = [],
  products    = [],
  recommendations = [],
  trackedActions  = [],
  history         = [],
  thresholds,
  dateLabel       = '',
}) {
  // Pre-compute derived plans
  const plan     = buildScalingPlan(campaigns, thresholds);
  const planSum  = summarisePlan(plan);
  const readiness = buildReadinessPlan(products, thresholds);
  const rdSum    = summariseReadiness(readiness);
  const winners  = buildWinners(searchTerms, thresholds);

  // Negative candidate count for Next Week Focus
  const negCandidates = searchTerms.filter(r =>
    (r.orders ?? 0) === 0 &&
    (r.sales  ?? 0) === 0 &&
    (r.spend  ?? 0) >= thresholds.maxNoOrderSpend &&
    ((r.spend ?? 0) > 0 || (r.clicks ?? 0) > 0)
  ).length;

  const highPriorityWinners = winners.filter(w => w.tier === 1).length;

  // Account health
  const accountScore = calcAccountHealth(summary, thresholds, plan, readiness);
  const state        = healthState(accountScore);

  // Report header
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
  const titleDate = dateLabel ? ` — ${dateLabel}` : '';

  const header = [
    '════════════════════════════════════════════════════════════',
    `PPC BOSS REPORT${titleDate}`,
    `Generated: ${today}`,
    `Account Health: ${accountScore}/100  ${state.emoji} ${state.label}`,
    '════════════════════════════════════════════════════════════',
  ].join('\n');

  // Assemble all sections
  const sections = [
    header,
    sectionOverallPerformance(summary),
    sectionExecutiveSummary(accountScore, state, summary, thresholds, planSum, rdSum),
    sectionWhatIsWorking(plan, readiness, winners),
    sectionMainIssues(recommendations),
    sectionRecommendedActions(recommendations),
    sectionCampaignScaling(plan, planSum),
    sectionProductReadiness(readiness, rdSum),
    sectionKeywordSummary(searchTerms, thresholds, winners),
    sectionActionTracker(trackedActions),
    sectionHistory(history),
    sectionNextWeekFocus(planSum, rdSum, negCandidates, highPriorityWinners, recommendations, accountScore),
    '\n════════════════════════════════════════════════════════════',
    'END OF BOSS REPORT',
    '════════════════════════════════════════════════════════════',
  ];

  return sections.join('\n\n');
}
