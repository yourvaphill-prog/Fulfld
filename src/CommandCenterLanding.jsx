import React from 'react';
import { COLORS, ACCENTS, ACCENT_RGB, FONT, MONO, TRANSITION } from './theme/tokens.js';

// ── Module definitions (internal workflows) ────────────────────────────────────
const MODULES = [
  {
    id:         'dashboard',
    icon:       'BS',
    name:       'Brand Scout',
    accent:     ACCENTS.brandScout,
    rgb:        ACCENT_RGB.brandScout,
    capability: 'Evaluate brands · Score · Pipeline',
  },
  {
    id:         'ppc',
    icon:       'PPC',
    name:       'PPC Pilot',
    accent:     ACCENTS.ppcPilot,
    rgb:        ACCENT_RGB.ppcPilot,
    capability: 'Campaign analysis · Keyword builder · Reports',
  },
  {
    id:         'upc',
    icon:       'UPC',
    name:       'UPC Scanner',
    accent:     ACCENTS.upcScanner,
    rgb:        ACCENT_RGB.upcScanner,
    capability: 'ASIN matching · Profit calc · Lead scoring',
  },
  {
    id:         'catalog',
    icon:       'CAT',
    name:       'Website Catalog Scraper',
    accent:     ACCENTS.catalog,
    rgb:        ACCENT_RGB.catalog,
    capability: 'Shopify · WooCommerce · CSV export',
  },
];

const CONTACT_GPT_URL =
  'https://chatgpt.com/g/g-6a297117a7908191bf496698addb9419-fufld-decision-maker-finder';

// ── Landing — command console launcher ────────────────────────────────────────
export default function CommandCenterLanding({ onSelectModule }) {
  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'flex-start',
      padding: '44px 24px 64px',
    }}>
      <div style={{ width: '100%', maxWidth: 600 }}>

        {/* ── Identity block ── */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            color: COLORS.text,
            fontSize: 20,
            fontWeight: 700,
            letterSpacing: '-0.02em',
            margin: '0 0 9px',
            fontFamily: FONT,
          }}>
            FUFLD Command Center
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              width: 6, height: 6, borderRadius: '50%',
              background: ACCENTS.brandScout,
              display: 'inline-block', flexShrink: 0,
            }} />
            <span style={{
              color: COLORS.textDim,
              fontSize: 10,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontFamily: MONO,
            }}>
              Operational
            </span>
            <span style={{ color: '#1E2A38', fontFamily: MONO }}>·</span>
            <span style={{
              color: COLORS.textDim,
              fontSize: 10,
              letterSpacing: '0.05em',
              fontFamily: MONO,
            }}>
              AWL / FUFLD Internal
            </span>
          </div>
        </div>

        {/* ── Modules ── */}
        <EyebrowLabel>Modules</EyebrowLabel>
        <div style={{
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          overflow: 'hidden',
          background: COLORS.surface,
          marginBottom: 24,
        }}>
          {MODULES.map((mod, idx) => (
            <ToolRow
              key={mod.id}
              tool={mod}
              isLast={idx === MODULES.length - 1}
              onOpen={() => onSelectModule(mod.id)}
            />
          ))}
        </div>

        {/* ── External intelligence ── */}
        <EyebrowLabel>External Intelligence</EyebrowLabel>
        <div style={{
          border: `1px solid ${COLORS.border}`,
          borderRadius: 8,
          overflow: 'hidden',
          background: COLORS.surface,
        }}>
          <ExternalRow href={CONTACT_GPT_URL} />
        </div>

        {/* ── Footer ── */}
        <div style={{
          marginTop: 32,
          paddingTop: 16,
          borderTop: `1px solid ${COLORS.border}`,
          color: '#1E2A38',
          fontSize: 10,
          letterSpacing: '0.05em',
          fontFamily: MONO,
        }}>
          FUFLD · Fulfld Brand Intelligence Platform
        </div>

      </div>
    </div>
  );
}

// ── Eyebrow label (section marker) ────────────────────────────────────────────
function EyebrowLabel({ children }) {
  return (
    <div style={{
      color: COLORS.textDim,
      fontSize: 9,
      fontWeight: 600,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      marginBottom: 6,
      fontFamily: MONO,
    }}>
      {children}
    </div>
  );
}

// ── Internal tool row ─────────────────────────────────────────────────────────
function ToolRow({ tool, isLast, onOpen }) {
  const [active, setActive] = React.useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      }}
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        padding: '13px 16px',
        background: active ? COLORS.surfaceHover : 'transparent',
        borderBottom: isLast ? 'none' : `1px solid ${COLORS.border}`,
        cursor: 'pointer',
        transition: TRANSITION,
        outline: 'none',
        userSelect: 'none',
      }}
    >
      {/* Left accent bar — brightens on hover */}
      <div style={{
        position: 'absolute',
        left: 0, top: 0, bottom: 0,
        width: 3,
        background: tool.accent,
        opacity: active ? 1 : 0.28,
        transition: 'opacity 140ms ease',
        borderRadius: '0 2px 2px 0',
      }} />

      {/* Icon tile */}
      <div style={{
        width: 28, height: 28,
        borderRadius: 6,
        background: `rgba(${tool.rgb},0.09)`,
        border: `1px solid rgba(${tool.rgb},${active ? '0.30' : '0.18'})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700, fontFamily: MONO, color: tool.accent,
        letterSpacing: '0.02em', flexShrink: 0,
        transition: 'border-color 140ms ease',
      }}>
        {tool.icon}
      </div>

      {/* Name + capability */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          color: active ? COLORS.text : COLORS.textMuted,
          fontSize: 13,
          fontWeight: 600,
          marginBottom: 1,
          fontFamily: FONT,
          transition: 'color 140ms ease',
        }}>
          {tool.name}
        </div>
        <div style={{
          color: COLORS.textDim,
          fontSize: 11,
          fontFamily: FONT,
        }}>
          {tool.capability}
        </div>
      </div>

      {/* Arrow — accent color on hover, dim otherwise */}
      <span style={{
        color: active ? tool.accent : COLORS.textDim,
        fontSize: 12,
        fontWeight: 700,
        flexShrink: 0,
        fontFamily: FONT,
        transition: 'color 140ms ease',
        opacity: active ? 1 : 0.5,
      }}>
        →
      </span>
    </div>
  );
}

// ── External tool row (opens in new tab) ──────────────────────────────────────
function ExternalRow({ href }) {
  const [active, setActive] = React.useState(false);
  const accent = ACCENTS.contact;
  const rgb    = ACCENT_RGB.contact;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onMouseEnter={() => setActive(true)}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 13,
        padding: '13px 16px',
        background: active ? COLORS.surfaceHover : 'transparent',
        textDecoration: 'none',
        cursor: 'pointer',
        transition: TRANSITION,
        outline: 'none',
        userSelect: 'none',
      }}
    >
      {/* Left accent bar */}
      <div style={{
        position: 'absolute',
        left: 0, top: 0, bottom: 0,
        width: 3,
        background: accent,
        opacity: active ? 1 : 0.28,
        transition: 'opacity 140ms ease',
        borderRadius: '0 2px 2px 0',
      }} />

      {/* Icon tile */}
      <div style={{
        width: 28, height: 28,
        borderRadius: 6,
        background: `rgba(${rgb},0.09)`,
        border: `1px solid rgba(${rgb},${active ? '0.30' : '0.18'})`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 9, fontWeight: 700, fontFamily: MONO, color: accent,
        letterSpacing: '0.02em', flexShrink: 0,
        transition: 'border-color 140ms ease',
      }}>
        CI
      </div>

      {/* Name + capability */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          marginBottom: 1,
        }}>
          <span style={{
            color: active ? COLORS.text : COLORS.textMuted,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: FONT,
            transition: 'color 140ms ease',
          }}>
            Contact Intelligence
          </span>
          <RowBadge>GPT</RowBadge>
          <RowBadge>External</RowBadge>
        </div>
        <div style={{
          color: COLORS.textDim,
          fontSize: 11,
          fontFamily: FONT,
        }}>
          Decision makers · Caller scripts · LinkedIn angles
        </div>
      </div>

      {/* External arrow + sub-label */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        alignItems: 'flex-end', gap: 2, flexShrink: 0,
      }}>
        <span style={{
          color: active ? accent : COLORS.textDim,
          fontSize: 13,
          fontWeight: 700,
          fontFamily: FONT,
          transition: 'color 140ms ease',
        }}>
          ↗
        </span>
        <span style={{
          color: '#1E2A38',
          fontSize: 9,
          fontFamily: MONO,
          letterSpacing: '0.04em',
          whiteSpace: 'nowrap',
        }}>
          Opens in ChatGPT
        </span>
      </div>
    </a>
  );
}

// ── Row badge ─────────────────────────────────────────────────────────────────
function RowBadge({ children }) {
  return (
    <span style={{
      fontSize: 8,
      fontWeight: 600,
      letterSpacing: '0.08em',
      color: COLORS.textDim,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 3,
      padding: '1px 5px',
      textTransform: 'uppercase',
      fontFamily: FONT,
    }}>
      {children}
    </span>
  );
}
