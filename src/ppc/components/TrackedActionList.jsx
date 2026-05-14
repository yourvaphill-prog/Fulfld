import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';

// ── Constants ──────────────────────────────────────────────────────────────────
const STATUS_CONFIG = {
  open:        { label: 'Open',        color: '#3b82f6', bg: '#3b82f611', dot: '#3b82f6' },
  in_progress: { label: 'In Progress', color: '#f97316', bg: '#f9731611', dot: '#f97316' },
  done:        { label: 'Done',        color: '#22c55e', bg: '#22c55e11', dot: '#22c55e' },
  ignored:     { label: 'Ignored',     color: '#555',    bg: '#55555511', dot: '#555'    },
};

const STATUS_CYCLE = ['open', 'in_progress', 'done', 'ignored'];

const SEVERITY_CONFIG = {
  HIGH:        { label: 'High',        color: '#ef4444' },
  MEDIUM:      { label: 'Medium',      color: '#f97316' },
  OPPORTUNITY: { label: 'Opportunity', color: '#22c55e' },
};

const TYPE_LABEL = {
  campaign:   'Campaign',
  searchTerm: 'Search Term',
  product:    'Product',
};

const STATUS_FILTERS   = ['all', 'open', 'in_progress', 'done', 'ignored'];
const PRIORITY_FILTERS = ['all', 'HIGH', 'MEDIUM', 'OPPORTUNITY'];

// ── Helpers ────────────────────────────────────────────────────────────────────
function formatDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric',
    });
  } catch { return ''; }
}

function cycleStatus(current) {
  const idx = STATUS_CYCLE.indexOf(current);
  return STATUS_CYCLE[(idx + 1) % STATUS_CYCLE.length];
}

// ── Styles ─────────────────────────────────────────────────────────────────────
const s = {
  container:   { display: 'flex', flexDirection: 'column', gap: 16 },
  filterRow:   { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  filterGroup: { display: 'flex', gap: 4, flexWrap: 'wrap' },
  filterLabel: { color: '#444', fontSize: 11, marginRight: 4, alignSelf: 'center' },
  filterBtn: {
    padding: '4px 11px', borderRadius: 20, border: '1px solid #2a2a2a',
    background: 'transparent', color: '#666', cursor: 'pointer',
    fontSize: 11, fontWeight: 600, transition: 'all 0.12s',
  },
  divider:     { width: 1, height: 20, background: '#1e1e1e', margin: '0 4px', alignSelf: 'center' },
  summary:     { color: '#444', fontSize: 12 },
  empty: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    justifyContent: 'center', padding: '64px 24px', gap: 12, textAlign: 'center',
  },
  card: {
    borderRadius: 8, border: '1px solid #1e1e1e',
    background: '#0d0d14', padding: '14px 16px',
    display: 'flex', flexDirection: 'column', gap: 8,
    transition: 'opacity 0.2s',
  },
  cardTop: {
    display: 'flex', alignItems: 'flex-start',
    justifyContent: 'space-between', gap: 10,
  },
  badges:      { display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', flex: 1 },
  badge: {
    borderRadius: 4, padding: '2px 7px',
    fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
    border: '1px solid transparent',
  },
  cardActions: { display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 },
  statusBtn: {
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '5px 11px', borderRadius: 6, border: '1px solid',
    cursor: 'pointer', fontSize: 12, fontWeight: 600,
    background: 'transparent', transition: 'all 0.15s',
  },
  dot: { width: 7, height: 7, borderRadius: '50%', flexShrink: 0 },
  headline: { fontWeight: 700, fontSize: 14, lineHeight: 1.4 },
  action: {
    fontSize: 12, color: '#60a5fa', lineHeight: 1.5,
    paddingLeft: 2,
  },
  meta: {
    display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap',
    marginTop: 2,
  },
  metaItem:    { color: '#444', fontSize: 11 },
  deleteBtn: {
    background: 'transparent', border: 'none',
    color: '#333', cursor: 'pointer', padding: '4px 6px',
    borderRadius: 4, transition: 'color 0.15s', flexShrink: 0,
  },
};

// ── Component ──────────────────────────────────────────────────────────────────
export default function TrackedActionList({ trackedActions, onUpdateStatus, onDelete }) {
  const [statusFilter,   setStatusFilter]   = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');

  // Active (open + in_progress) count for summary
  const activeCount = trackedActions.filter(
    a => a.status === 'open' || a.status === 'in_progress'
  ).length;

  const filtered = trackedActions.filter(a => {
    const matchStatus   = statusFilter   === 'all' || a.status   === statusFilter;
    const matchPriority = priorityFilter === 'all' || a.severity === priorityFilter;
    return matchStatus && matchPriority;
  });

  // ── Empty state ──
  if (trackedActions.length === 0) {
    return (
      <div style={s.empty}>
        <div style={{ fontSize: 36 }}>🎯</div>
        <div style={{ color: '#555', fontSize: 14, fontWeight: 600 }}>No tracked actions yet</div>
        <div style={{ color: '#333', fontSize: 12, maxWidth: 380, lineHeight: 1.7 }}>
          Go to the <span style={{ color: '#3b82f6' }}>Recommendations</span> tab and click{' '}
          <span style={{ color: '#3b82f6' }}>Track →</span> on any item to add it here.
        </div>
      </div>
    );
  }

  return (
    <div style={s.container}>

      {/* ── Filters ── */}
      <div style={s.filterRow}>
        {/* Status filters */}
        <span style={s.filterLabel}>Status</span>
        <div style={s.filterGroup}>
          {STATUS_FILTERS.map(f => {
            const active = statusFilter === f;
            const cfg    = STATUS_CONFIG[f];
            const color  = cfg?.color ?? '#888';
            return (
              <button
                key={f}
                style={{
                  ...s.filterBtn,
                  background:   active ? (color + '22') : 'transparent',
                  color:        active ? color : '#666',
                  borderColor:  active ? (color + '55') : '#2a2a2a',
                }}
                onClick={() => setStatusFilter(f)}
              >
                {f === 'all' ? 'All' : STATUS_CONFIG[f].label}
              </button>
            );
          })}
        </div>

        <div style={s.divider} />

        {/* Priority filters */}
        <span style={s.filterLabel}>Priority</span>
        <div style={s.filterGroup}>
          {PRIORITY_FILTERS.map(f => {
            const active = priorityFilter === f;
            const cfg    = SEVERITY_CONFIG[f];
            const color  = cfg?.color ?? '#888';
            return (
              <button
                key={f}
                style={{
                  ...s.filterBtn,
                  background:  active ? (color + '22') : 'transparent',
                  color:       active ? color : '#666',
                  borderColor: active ? (color + '55') : '#2a2a2a',
                }}
                onClick={() => setPriorityFilter(f)}
              >
                {f === 'all' ? 'All' : SEVERITY_CONFIG[f].label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Summary line ── */}
      <div style={s.summary}>
        {activeCount} active &middot; {trackedActions.filter(a => a.status === 'done').length} done
        &middot; showing {filtered.length} of {trackedActions.length}
      </div>

      {/* ── No results for current filter ── */}
      {filtered.length === 0 && (
        <div style={{ color: '#444', fontSize: 13, textAlign: 'center', padding: '32px 0' }}>
          No actions match the current filters.
        </div>
      )}

      {/* ── Action cards ── */}
      {filtered.map(action => {
        const sevCfg    = SEVERITY_CONFIG[action.severity] ?? SEVERITY_CONFIG.MEDIUM;
        const statusCfg = STATUS_CONFIG[action.status]     ?? STATUS_CONFIG.open;
        const isDim     = action.status === 'done' || action.status === 'ignored';
        const nextLabel = STATUS_CONFIG[cycleStatus(action.status)].label;

        return (
          <div
            key={action.id}
            style={{ ...s.card, opacity: isDim ? 0.55 : 1 }}
          >
            {/* Top row: badges + controls */}
            <div style={s.cardTop}>
              <div style={s.badges}>
                {/* Severity badge */}
                <span style={{
                  ...s.badge,
                  color:       sevCfg.color,
                  background:  sevCfg.color + '18',
                  borderColor: sevCfg.color + '44',
                }}>
                  {sevCfg.label}
                </span>

                {/* Type badge */}
                <span style={{
                  ...s.badge,
                  color: '#888', background: '#88888818', borderColor: '#88888833',
                }}>
                  {TYPE_LABEL[action.type] ?? action.type}
                </span>
              </div>

              <div style={s.cardActions}>
                {/* Status cycle button */}
                <button
                  style={{
                    ...s.statusBtn,
                    color:       statusCfg.color,
                    borderColor: statusCfg.color + '55',
                    background:  statusCfg.bg,
                  }}
                  onClick={() => onUpdateStatus(action.id, cycleStatus(action.status))}
                  title={`Click to mark as ${nextLabel}`}
                >
                  <div style={{ ...s.dot, background: statusCfg.dot }} />
                  {statusCfg.label}
                </button>

                {/* Delete */}
                <button
                  style={s.deleteBtn}
                  onClick={() => onDelete(action.id)}
                  title="Remove this tracked action"
                  onMouseEnter={e => { e.currentTarget.style.color = '#ef4444'; }}
                  onMouseLeave={e => { e.currentTarget.style.color = '#333'; }}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>

            {/* Headline */}
            <div style={{
              ...s.headline,
              color: isDim ? '#555' : '#e2e8f0',
              textDecoration: action.status === 'done' ? 'line-through' : 'none',
            }}>
              {action.headline}
            </div>

            {/* Recommended action */}
            <div style={s.action}>→ {action.action}</div>

            {/* Meta: entity + date */}
            <div style={s.meta}>
              <span style={s.metaItem}>📌 {action.entity}</span>
              <span style={s.metaItem}>Added {formatDate(action.createdAt)}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
