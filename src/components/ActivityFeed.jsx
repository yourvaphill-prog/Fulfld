import { CheckCircle, MessageSquare, XCircle, FileText, Clock } from 'lucide-react';
import { hasSupabase } from '../lib/supabase.js';

const G      = '#00ff87';
const B      = '#3b82f6';
const CARD   = 'rgba(13,20,35,0.85)';
const BORDER = 'rgba(255,255,255,0.07)';

const ACTION_META = {
  submitted: { icon: <CheckCircle size={11} />, color: G,        label: 'submitted' },
  contacted: { icon: <MessageSquare size={11}/>, color: '#ffd166', label: 'contacted' },
  denied:    { icon: <XCircle size={11} />,      color: '#ef476f', label: 'denied' },
  note:      { icon: <FileText size={11} />,     color: B,         label: 'added a note on' },
  cleared:   { icon: <Clock size={11} />,        color: '#64748b', label: 'cleared status for' },
};

function timeAgo(isoStr) {
  const diff = (Date.now() - new Date(isoStr)) / 1000;
  if (diff < 60)      return `${Math.floor(diff)}s ago`;
  if (diff < 3600)    return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)   return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function ActivityFeed({ feed }) {
  const safeFeed = Array.isArray(feed) ? feed : [];

  if (!hasSupabase) {
    return (
      <div style={{ padding: '18px 16px', color: '#334155', fontFamily: "'DM Mono'", fontSize: 11, textAlign: 'center', lineHeight: 1.7 }}>
        Activity feed requires Supabase.<br />
        <span style={{ color: '#1e293b' }}>See SETUP.md to configure.</span>
      </div>
    );
  }

  if (!safeFeed.length) {
    return (
      <div style={{ padding: '18px 16px', color: '#334155', fontFamily: "'DM Mono'", fontSize: 11, textAlign: 'center' }}>
        No activity yet.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {safeFeed.map((item, i) => {
        const meta = ACTION_META[item.action_type] || ACTION_META.cleared;
        return (
          <div key={item.id || i} style={{ padding: '9px 14px', display: 'flex', alignItems: 'flex-start', gap: 9, borderBottom: `1px solid ${BORDER}` }}>
            <div style={{ marginTop: 1, color: meta.color, flexShrink: 0 }}>{meta.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: "'DM Mono'", fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
                <span style={{ color: '#e2e8f0', fontWeight: 600 }}>{item.user_name}</span>
                {' '}
                <span style={{ color: meta.color }}>{meta.label}</span>
                {' '}
                {item.brand_name && (
                  <span style={{ color: '#cbd5e1', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.brand_name}</span>
                )}
              </div>
              <div style={{ fontFamily: "'DM Mono'", fontSize: 10, color: '#334155', marginTop: 2 }}>
                {timeAgo(item.created_at)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
