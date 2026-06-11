import React from 'react';
import { COLORS, ACCENTS, ACCENT_RGB, FONT, TRANSITION } from './theme/tokens.js';

// ── Module definitions (internal workflows) ────────────────────────────────────
const MODULES = [
  {
    id:       'dashboard',
    icon:     '🔍',
    name:     'Brand Scout',
    accent:   ACCENTS.brandScout,
    rgb:      ACCENT_RGB.brandScout,
    tagline:  'Evaluate brands with Fulfld intelligence',
    description: 'Score brands, map subcategory markets, and track team decisions from Fulfld CSV exports.',
  },
  {
    id:       'ppc',
    icon:     '⚡',
    name:     'PPC Pilot',
    accent:   ACCENTS.ppcPilot,
    rgb:      ACCENT_RGB.ppcPilot,
    tagline:  'Command your Amazon PPC campaigns',
    description: 'Analyze campaign health, cut wasted spend, build keyword lists, and generate client-ready reports.',
  },
  {
    id:       'upc',
    icon:     '🏷️',
    name:     'UPC Scanner',
    accent:   ACCENTS.upcScanner,
    rgb:      ACCENT_RGB.upcScanner,
    tagline:  'Scan supplier catalogs for opportunities',
    description: 'Match UPCs to ASINs via Keepa, estimate profit and ROI, and classify every product as a lead.',
  },
  {
    id:       'catalog',
    icon:     '🌐',
    name:     'Website Catalog Scraper',
    accent:   ACCENTS.catalog,
    rgb:      ACCENT_RGB.catalog,
    tagline:  'Extract product catalogs from brand sites',
    description: 'Pull product data from Shopify, WooCommerce, or generic HTML into a scanner-ready CSV.',
  },
];

// Contact Intelligence — external GPT agent (NOT an internal module).
const CONTACT_GPT_URL =
  'https://chatgpt.com/g/g-6a297117a7908191bf496698addb9419-fufld-decision-maker-finder';

// ── Landing screen ──────────────────────────────────────────────────────────────
export default function CommandCenterLanding({ onSelectModule }) {
  return (
    <div style={{
      flex: 1,
      overflowY: 'auto',
      display: 'flex',
      justifyContent: 'center',
      // Top-aligned — content starts from the top, never vertically centered.
      alignItems: 'flex-start',
      padding: '48px 24px 64px',
    }}>
      <div style={{ width: '100%', maxWidth: 1000 }}>

        {/* ── Intro (left-aligned) ── */}
        <div style={{ marginBottom: 32 }}>
          <h1 style={{
            color: COLORS.text,
            fontSize: 24,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            margin: '0 0 6px',
            fontFamily: FONT,
          }}>
            Choose a workflow
          </h1>
          <p style={{
            color: COLORS.textMuted,
            fontSize: 13,
            lineHeight: 1.6,
            margin: 0,
            fontFamily: FONT,
          }}>
            FUFLD / AWL internal operations console — select a module to begin your session.
          </p>
        </div>

        {/* ── Workflows section ── */}
        <SectionLabel>Workflows</SectionLabel>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(2, 1fr)',
          gap: 14,
          marginBottom: 36,
        }}>
          {MODULES.map(mod => (
            <ModuleCard key={mod.id} module={mod} onOpen={() => onSelectModule(mod.id)} />
          ))}
        </div>

        {/* ── External tools section ── */}
        <SectionLabel>External Tools</SectionLabel>
        <ContactIntelligenceCard href={CONTACT_GPT_URL} />

        {/* ── Footer ── */}
        <div style={{
          marginTop: 40,
          paddingTop: 18,
          borderTop: `1px solid ${COLORS.border}`,
          color: COLORS.textDim,
          fontSize: 11,
          letterSpacing: '0.04em',
          fontFamily: FONT,
        }}>
          FUFLD · Fulfld Brand Intelligence Platform
        </div>
      </div>
    </div>
  );
}

// ── Section label (eyebrow) ─────────────────────────────────────────────────────
function SectionLabel({ children }) {
  return (
    <div style={{
      color: COLORS.textDim,
      fontSize: 10,
      fontWeight: 600,
      letterSpacing: '0.12em',
      textTransform: 'uppercase',
      marginBottom: 12,
      fontFamily: FONT,
    }}>
      {children}
    </div>
  );
}

// ── Internal module card — compact, flat, fully clickable ──────────────────────
function ModuleCard({ module: mod, onOpen }) {
  const [hovered, setHovered] = React.useState(false);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        background: hovered ? COLORS.surfaceHover : COLORS.surface,
        border: `1px solid ${hovered ? COLORS.borderStrong : COLORS.border}`,
        borderRadius: 10,
        padding: '16px 18px',
        cursor: 'pointer',
        transition: TRANSITION,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        outline: 'none',
      }}
    >
      {/* Icon + name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 34, height: 34, borderRadius: 8,
          background: `rgba(${mod.rgb},0.10)`,
          border: `1px solid rgba(${mod.rgb},0.25)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 17, flexShrink: 0,
        }}>
          {mod.icon}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{
            color: COLORS.text, fontSize: 14, fontWeight: 600,
            letterSpacing: '-0.01em', fontFamily: FONT,
          }}>
            {mod.name}
          </div>
          <div style={{
            color: COLORS.textDim, fontSize: 11, marginTop: 1,
            fontFamily: FONT,
          }}>
            {mod.tagline}
          </div>
        </div>
      </div>

      {/* Description */}
      <p style={{
        color: COLORS.textMuted, fontSize: 12, lineHeight: 1.55,
        margin: 0, fontFamily: FONT,
      }}>
        {mod.description}
      </p>

      {/* Open affordance — accent only on hover */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
        color: hovered ? mod.accent : COLORS.textDim,
        fontSize: 11, fontWeight: 600, letterSpacing: '0.02em',
        fontFamily: FONT, transition: TRANSITION,
      }}>
        Open&nbsp;→
      </div>
    </div>
  );
}

// ── Contact Intelligence — full-width horizontal external card ─────────────────
function ContactIntelligenceCard({ href }) {
  const [hovered, setHovered] = React.useState(false);
  const accent = ACCENTS.contact;
  const rgb    = ACCENT_RGB.contact;

  const capabilities = [
    'USA-first phone routes',
    'Possible decision makers',
    'Contact sources',
    'LinkedIn search angles',
    'AWL / FUFLD caller scripts',
  ];

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? COLORS.surfaceHover : COLORS.surface,
        border: `1px solid ${hovered ? COLORS.borderStrong : COLORS.border}`,
        borderRadius: 10,
        padding: '16px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        flexWrap: 'wrap',
        transition: TRANSITION,
      }}
    >
      {/* Icon */}
      <div style={{
        width: 38, height: 38, borderRadius: 8,
        background: `rgba(${rgb},0.10)`,
        border: `1px solid rgba(${rgb},0.25)`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 18, flexShrink: 0,
      }}>
        🧠
      </div>

      {/* Text block */}
      <div style={{ flex: '1 1 360px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3, flexWrap: 'wrap' }}>
          <span style={{
            color: COLORS.text, fontSize: 14, fontWeight: 600,
            letterSpacing: '-0.01em', fontFamily: FONT,
          }}>
            Contact Intelligence
          </span>
          <Badge>GPT</Badge>
          <Badge>External</Badge>
        </div>
        <div style={{
          color: COLORS.textMuted, fontSize: 12, lineHeight: 1.55,
          fontFamily: FONT,
        }}>
          Decision-maker & contact research for any brand —{' '}
          {capabilities.join(' · ')}.
        </div>
      </div>

      {/* Action — opens GPT agent in a new tab */}
      <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            background: hovered ? `rgba(${rgb},0.14)` : `rgba(${rgb},0.08)`,
            border: `1px solid rgba(${rgb},${hovered ? '0.45' : '0.30'})`,
            borderRadius: 8,
            padding: '8px 16px',
            color: accent,
            fontSize: 12, fontWeight: 600,
            fontFamily: FONT,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            transition: TRANSITION,
          }}
        >
          Open in ChatGPT ↗
        </a>
        <span style={{ color: COLORS.textDim, fontSize: 10, fontFamily: FONT }}>
          ↗ Opens in ChatGPT
        </span>
      </div>
    </div>
  );
}

// ── Small badge ─────────────────────────────────────────────────────────────────
function Badge({ children }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 600, letterSpacing: '0.08em',
      color: COLORS.textDim,
      border: `1px solid ${COLORS.border}`,
      borderRadius: 4, padding: '1px 6px',
      textTransform: 'uppercase',
      fontFamily: FONT,
    }}>
      {children}
    </span>
  );
}
