const safeDivide = (a, b) => (b == null || b === 0 ? null : a / b);

/**
 * Enriches a normalized row with derived metrics.
 * Existing values from the report are preserved; only missing ones are calculated.
 */
export function enrichRow(row) {
  const r = { ...row };

  // CTR: prefer existing, calculate from impressions/clicks
  if (r.ctr == null || r.ctr === 0) {
    r.ctr = safeDivide(r.clicks, r.impressions);
  }

  // CPC
  if (r.cpc == null || r.cpc === 0) {
    r.cpc = safeDivide(r.spend, r.clicks);
  }

  // Conversion rate (orders / clicks)
  r.cvr = safeDivide(r.orders, r.clicks);

  // ACoS: special NO_SALES state when spend > 0 but sales = 0
  if (r.acos == null || r.acos === 0) {
    if ((r.spend ?? 0) > 0 && (r.sales ?? 0) === 0) {
      r.acos = 'NO_SALES';
    } else {
      r.acos = safeDivide(r.spend, r.sales);
    }
  }

  // ROAS
  if (r.roas == null || r.roas === 0) {
    r.roas = safeDivide(r.sales, r.spend);
  }

  return r;
}

export function enrichRows(rows) {
  return rows.map(enrichRow);
}

/** Aggregate all rows into a single totals/averages summary object. */
export function aggregateMetrics(rows) {
  if (!rows.length) return null;

  const totalSpend = sum(rows, 'spend');
  const totalSales = sum(rows, 'sales');
  const totalOrders = sum(rows, 'orders');
  const totalClicks = sum(rows, 'clicks');
  const totalImpressions = sum(rows, 'impressions');

  return {
    totalSpend,
    totalSales,
    totalOrders,
    totalClicks,
    totalImpressions,
    avgAcos: totalSales > 0 ? totalSpend / totalSales : 'NO_SALES',
    avgRoas: totalSpend > 0 ? totalSales / totalSpend : null,
    avgCtr: totalImpressions > 0 ? totalClicks / totalImpressions : null,
    avgCpc: totalClicks > 0 ? totalSpend / totalClicks : null,
    avgCvr: totalClicks > 0 ? totalOrders / totalClicks : null,
  };
}

function sum(rows, field) {
  return rows.reduce((acc, r) => acc + (r[field] ?? 0), 0);
}

/** Group rows by a key field and aggregate metrics per group. */
export function groupBy(rows, keyField) {
  const groups = {};
  for (const row of rows) {
    const key = row[keyField] ?? '(unknown)';
    if (!groups[key]) {
      groups[key] = { [keyField]: key, rows: [] };
    }
    groups[key].rows.push(row);
  }

  return Object.values(groups).map(group => {
    const agg = aggregateMetrics(group.rows);
    return {
      [keyField]: group[keyField],
      ...agg,
      rowCount: group.rows.length,
    };
  });
}

// ── Display helpers ──────────────────────────────────────────────────────────

export function fmtCurrency(val) {
  if (val == null) return 'N/A';
  return '$' + val.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function fmtPct(val) {
  if (val == null) return 'N/A';
  if (val === 'NO_SALES') return '—';
  return (val * 100).toFixed(1) + '%';
}

export function fmtNum(val, decimals = 0) {
  if (val == null) return 'N/A';
  return val.toLocaleString('en-US', { maximumFractionDigits: decimals });
}

export function fmtRoas(val) {
  if (val == null) return 'N/A';
  return val.toFixed(2) + 'x';
}
