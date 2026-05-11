// Accepts both individual row field names (acos, spend) and aggregated names (avgAcos, totalSpend)
function getField(row, individual, aggregated) {
  return row[aggregated] !== undefined ? row[aggregated] : row[individual];
}

/**
 * Returns a 0–100 health score for a campaign row.
 * Works with both raw rows and groupBy-aggregated rows.
 *
 * Weights:
 *   ACoS vs target  35%
 *   ROAS vs target  30%
 *   CTR             20%
 *   Has orders      15%
 */
export function calcHealthScore(row, thresholds) {
  const { targetACoS, goodROASThreshold, lowCTRThreshold, maxNoOrderSpend } = thresholds;

  const acos = getField(row, 'acos', 'avgAcos');
  const roas = getField(row, 'roas', 'avgRoas');
  const ctr = getField(row, 'ctr', 'avgCtr');
  const spend = getField(row, 'spend', 'totalSpend') ?? 0;
  const orders = getField(row, 'orders', 'totalOrders') ?? 0;

  let score = 0;

  // ACoS component (35 pts)
  if (acos === 'NO_SALES') {
    score += spend < maxNoOrderSpend ? 10 : 0;
  } else if (acos != null) {
    if (acos <= targetACoS) {
      score += 35;
    } else if (acos <= targetACoS * 1.5) {
      score += 20;
    } else if (acos <= targetACoS * 2) {
      score += 10;
    }
  } else {
    score += 15; // no data yet
  }

  // ROAS component (30 pts)
  if (roas != null) {
    if (roas >= goodROASThreshold) {
      score += 30;
    } else if (roas >= goodROASThreshold * 0.7) {
      score += 18;
    } else if (roas >= 1) {
      score += 8;
    }
  } else {
    score += 12;
  }

  // CTR component (20 pts)
  if (ctr != null) {
    if (ctr >= 0.005) {
      score += 20;
    } else if (ctr >= 0.003) {
      score += 13;
    } else if (ctr >= lowCTRThreshold) {
      score += 7;
    }
  } else {
    score += 8;
  }

  // Has orders component (15 pts)
  if (orders > 0) {
    score += 15;
  } else if (spend < maxNoOrderSpend) {
    score += 8;
  }

  return Math.min(100, Math.max(0, score));
}

export function healthLabel(score) {
  if (score >= 80) return { label: 'Excellent', color: '#22c55e' };
  if (score >= 60) return { label: 'Good', color: '#00c896' };
  if (score >= 40) return { label: 'Watch', color: '#eab308' };
  if (score >= 20) return { label: 'At Risk', color: '#f97316' };
  return { label: 'Poor', color: '#ef4444' };
}

export function suggestedAction(row, thresholds) {
  const { targetACoS, maxNoOrderSpend, goodROASThreshold, lowCTRThreshold, minImpressions } = thresholds;

  const acos = getField(row, 'acos', 'avgAcos');
  const roas = getField(row, 'roas', 'avgRoas');
  const ctr = getField(row, 'ctr', 'avgCtr');
  const spend = getField(row, 'spend', 'totalSpend') ?? 0;
  const orders = getField(row, 'orders', 'totalOrders') ?? 0;
  const impressions = getField(row, 'impressions', 'totalImpressions') ?? 0;

  if (spend >= maxNoOrderSpend && orders === 0) {
    return { action: 'Pause / Review', color: '#ef4444' };
  }
  if (typeof acos === 'number' && acos <= targetACoS && orders >= 1) {
    return { action: 'Scale', color: '#22c55e' };
  }
  if ((roas ?? 0) >= goodROASThreshold && orders >= 1) {
    return { action: 'Scale', color: '#22c55e' };
  }
  if (typeof acos === 'number' && acos > targetACoS * 1.5 && orders > 0) {
    return { action: 'Reduce Bid', color: '#f97316' };
  }
  if ((ctr ?? 0) < lowCTRThreshold && impressions > minImpressions) {
    return { action: 'Improve Listing', color: '#eab308' };
  }
  const score = calcHealthScore(row, thresholds);
  if (score >= 40 && score < 60) {
    return { action: 'Watch', color: '#eab308' };
  }
  return { action: 'No Action Needed', color: '#888888' };
}
