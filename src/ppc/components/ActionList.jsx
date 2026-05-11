import React, { useState } from 'react';
import { recsToDailyActions } from '../utils/recommendationEngine.js';

const GROUP_CONFIG = [
  { key: 'pause', label: 'Pause / Add Negative Keyword', color: '#ef4444', emoji: '🔴' },
  { key: 'negative', label: 'Add Negative Keywords', color: '#ef4444', emoji: '🚫' },
  { key: 'reduce', label: 'Lower Bids', color: '#f97316', emoji: '🔽' },
  { key: 'listing', label: 'Review Listing Quality', color: '#eab308', emoji: '📋' },
  { key: 'exact', label: 'Move to Exact Match', color: '#3b82f6', emoji: '🎯' },
  { key: 'scale', label: 'Scale / Increase Budget', color: '#22c55e', emoji: '📈' },
];

const s = {
  container: { display: 'flex', flexDirection: 'column', gap: 20 },
  group: { display: 'flex', flexDirection: 'column', gap: 8 },
  groupHeader: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 },
  groupLabel: { fontWeight: 700, fontSize: 13 },
  item: {
    display: 'flex', alignItems: 'flex-start', gap: 10,
    padding: '10px 14px', borderRadius: 6, background: '#0d0d0d',
    border: '1px solid #1e1e1e',
  },
  checkbox: { marginTop: 2, accentColor: '#3b82f6', width: 15, height: 15, cursor: 'pointer', flexShrink: 0 },
  itemText: { display: 'flex', flexDirection: 'column', gap: 3 },
  entity: { fontWeight: 600, fontSize: 13, color: '#e2e8f0' },
  action: { fontSize: 12, color: '#888' },
  empty: { textAlign: 'center', padding: '40px 0', color: '#444', fontSize: 13 },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  resetBtn: {
    background: 'none', border: '1px solid #2a2a2a', borderRadius: 6,
    color: '#888', padding: '5px 12px', cursor: 'pointer', fontSize: 12,
  },
  progress: { fontSize: 12, color: '#555' },
};

export default function ActionList({ recommendations }) {
  const [checked, setChecked] = useState({});
  const groups = recsToDailyActions(recommendations);

  const totalItems = recommendations.length;
  const checkedCount = Object.values(checked).filter(Boolean).length;

  function toggle(key) {
    setChecked(prev => ({ ...prev, [key]: !prev[key] }));
  }

  if (!recommendations.length) {
    return <div style={s.empty}>No action items yet. Upload reports and the daily action list will be generated automatically.</div>;
  }

  const hasAny = GROUP_CONFIG.some(g => (groups[g.key] ?? []).length > 0);
  if (!hasAny) {
    return <div style={s.empty}>No specific actions generated. Your PPC looks clean!</div>;
  }

  return (
    <div style={s.container}>
      <div style={s.header}>
        <div>
          <div style={{ color: '#fff', fontWeight: 700, fontSize: 15 }}>Daily PPC Action List</div>
          <div style={s.progress}>
            {checkedCount} / {totalItems} completed
          </div>
        </div>
        <button style={s.resetBtn} onClick={() => setChecked({})}>Reset</button>
      </div>

      {GROUP_CONFIG.map(group => {
        const items = groups[group.key] ?? [];
        if (!items.length) return null;
        return (
          <div key={group.key} style={s.group}>
            <div style={s.groupHeader}>
              <span style={{ fontSize: 16 }}>{group.emoji}</span>
              <span style={{ ...s.groupLabel, color: group.color }}>{group.label}</span>
              <span style={{ color: '#555', fontSize: 12 }}>({items.length})</span>
            </div>
            {items.map((rec, i) => {
              const itemKey = `${group.key}-${i}`;
              const done = !!checked[itemKey];
              return (
                <div key={i} style={{
                  ...s.item,
                  borderColor: done ? '#22c55e33' : '#1e1e1e',
                  opacity: done ? 0.5 : 1,
                }}>
                  <input
                    type="checkbox"
                    style={s.checkbox}
                    checked={done}
                    onChange={() => toggle(itemKey)}
                  />
                  <div style={s.itemText}>
                    <div style={{ ...s.entity, textDecoration: done ? 'line-through' : 'none' }}>
                      {rec.entity}
                    </div>
                    <div style={s.action}>{rec.action}</div>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
