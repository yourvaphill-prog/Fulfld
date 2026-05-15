import React from 'react';
import fufldLogo from './assets/fufld-logo.png';

// ── Design tokens (self-contained — no dep on theme.js) ───────────────────────
const CYAN   = '#06b6d4';
const GREEN  = '#22c55e';
const BORDER = 'rgba(255,255,255,0.072)';

// ── Module definitions ─────────────────────────────────────────────────────────
const MODULES = [
  {
    id:          'dashboard',
    icon:        '🔍',
    name:        'Brand Scout',
    accent:      GREEN,
    tagline:     'Evaluate brands with Fulfld intelligence',
    description: 'Upload Fulfld CSV exports to score brands, map subcategory markets, track team decisions, and build your qualified brand pipeline.',
    features: [
      'Brand scoring & weighted KPI analysis',
      'Subcategory market share mapping',
      'Ad intelligence integration (AdSpy)',
      'Team collaboration & shared pipeline statuses',
      'CSV export & duplicate brand detection',
    ],
  },
  {
    id:          'ppc',
    icon:        '⚡',
    name:        'PPC Pilot',
    accent:      CYAN,
    tagline:     'Command your Amazon PPC campaigns',
    description: 'Upload Amazon Ads CSV reports to analyze campaign health, eliminate wasted spend, build keyword lists, and generate client-ready executive reports.',
    features: [
      'Campaign health scoring & ROAS tracking',
      'Search term analysis — winners & wasted spend',
      'Negative & winning keyword builders with CSV export',
      'Product ad readiness scoring (0–100)',
      'Weekly report & executive Boss Report generator',
    ],
  },
];

// ── Landing screen ─────────────────────────────────────────────────────────────
export default function CommandCenterLanding({ onSelectModule }) {
  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '40px 24px 56px',
      overflowY: 'auto',
    }}>

      {/* ── Hero ── */}
      <div style={{ textAlign: 'center', marginBottom: 52 }}>

        {/* Logo — no background plate, PNG transparency used directly */}
        <img
          src={fufldLogo}
          alt="FULFLD"
          style={{ height: 40, width: 'auto', display: 'block', margin: '0 auto 28px' }}
        />

        <h1 style={{
          color: '#e2e8f0',
          fontSize: 30,
          fontWeight: 800,
          letterSpacing: '0.05em',
          margin: '0 0 12px',
          fontFamily: "'Syne', sans-serif",
          textTransform: 'uppercase',
        }}>
          <span style={{ color: CYAN }}>Command Center</span>
        </h1>

        <p style={{
          color: '#475569',
          fontSize: 13,
          margin: 0,
          letterSpacing: '0.04em',
          fontFamily: "'DM Mono', monospace",
        }}>
          Select a module to begin your session
        </p>
      </div>

      {/* ── Module cards ── */}
      <div style={{
        display: 'flex',
        gap: 24,
        flexWrap: 'wrap',
        justifyContent: 'center',
        maxWidth: 880,
        width: '100%',
      }}>
        {MODULES.map(mod => (
          <ModuleCard
            key={mod.id}
            module={mod}
            onOpen={() => onSelectModule(mod.id)}
          />
        ))}
      </div>

      {/* ── Footer tagline ── */}
      <div style={{
        marginTop: 48,
        color: '#1e293b',
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        fontFamily: "'DM Mono', monospace",
      }}>
        FUFLD · Fulfld Brand Intelligence Platform
      </div>
    </div>
  );
}

// ── Module card ────────────────────────────────────────────────────────────────
function ModuleCard({ module: mod, onOpen }) {
  const [hovered, setHovered] = React.useState(false);

  const isGreen = mod.accent === GREEN;
  // rgba components for glow without needing color-parse
  const glowRgba = isGreen ? '34,197,94' : '6,182,212';

  return (
    <div
      style={{
        flex: '1 1 340px',
        maxWidth: 408,
        position: 'relative',
        overflow: 'hidden',
        background: hovered
          ? `rgba(${glowRgba},0.055)`
          : 'rgba(255,255,255,0.030)',
        border: `1px solid ${hovered ? mod.accent + '50' : BORDER}`,
        borderRadius: 16,
        padding: '28px 28px 26px',
        boxShadow: hovered
          ? `0 10px 48px rgba(0,0,0,0.60), 0 0 36px rgba(${glowRgba},0.12)`
          : '0 4px 28px rgba(0,0,0,0.45)',
        transition: 'all 0.25s ease',
        cursor: 'default',
        display: 'flex',
        flexDirection: 'column',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Top accent bar */}
      <div style={{
        position: 'absolute',
        top: 0, left: 0, right: 0,
        height: 2,
        background: `linear-gradient(90deg, ${mod.accent}, ${mod.accent}00)`,
      }} />

      {/* Subtle ambient glow in corner */}
      <div style={{
        position: 'absolute',
        top: -40, right: -40,
        width: 160, height: 160,
        borderRadius: '50%',
        background: `radial-gradient(circle, rgba(${glowRgba},0.06) 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />

      {/* Icon + name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <div style={{
          width: 46, height: 46, borderRadius: 12,
          background: `rgba(${glowRgba},0.10)`,
          border: `1px solid rgba(${glowRgba},0.22)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, flexShrink: 0,
        }}>
          {mod.icon}
        </div>
        <div>
          <div style={{
            color: '#e2e8f0', fontSize: 18, fontWeight: 700,
            letterSpacing: '0.02em', fontFamily: "'Syne', sans-serif",
          }}>
            {mod.name}
          </div>
          <div style={{
            color: mod.accent, fontSize: 11, fontWeight: 600,
            letterSpacing: '0.05em', marginTop: 2,
            fontFamily: "'DM Mono', monospace",
          }}>
            {mod.tagline}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: BORDER, marginBottom: 16 }} />

      {/* Description */}
      <p style={{
        color: '#64748b', fontSize: 12, lineHeight: 1.75,
        margin: '0 0 18px',
        fontFamily: "'DM Mono', monospace",
      }}>
        {mod.description}
      </p>

      {/* Feature list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 26, flex: 1 }}>
        {mod.features.map((feat, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
            <span style={{
              color: mod.accent, fontSize: 11,
              lineHeight: '18px', flexShrink: 0, fontWeight: 700,
            }}>✓</span>
            <span style={{
              color: '#94a3b8', fontSize: 12,
              lineHeight: '18px', fontFamily: "'DM Mono', monospace",
            }}>
              {feat}
            </span>
          </div>
        ))}
      </div>

      {/* Open button */}
      <button
        onClick={onOpen}
        style={{
          width: '100%',
          background: hovered ? mod.accent : `rgba(${glowRgba},0.12)`,
          border: `1px solid rgba(${glowRgba},0.36)`,
          borderRadius: 8,
          padding: '11px 20px',
          color: hovered ? '#05080f' : mod.accent,
          fontSize: 12,
          fontWeight: 700,
          fontFamily: "'Syne', sans-serif",
          cursor: 'pointer',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={e => {
          e.currentTarget.style.background = mod.accent;
          e.currentTarget.style.color = '#05080f';
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = `rgba(${glowRgba},0.12)`;
          e.currentTarget.style.color = mod.accent;
        }}
      >
        Open {mod.name} →
      </button>
    </div>
  );
}
