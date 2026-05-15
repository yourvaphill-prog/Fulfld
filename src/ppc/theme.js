/**
 * PPC Pilot — Design Token System
 * Phase 3A: Futuristic Command-Center UI
 *
 * Import as:  import { T } from './theme.js';
 * Usage:      color: T.color.cyan
 */

export const T = {
  bg: {
    root:    '#05080f',          // page-level dark navy
    panel:   '#080c16',          // sidebar / panel surface
    card:    'rgba(255,255,255,0.032)',   // content card surface
    cardHov: 'rgba(255,255,255,0.056)',   // card on hover
    input:   'rgba(255,255,255,0.038)',   // text inputs / selects
    overlay: 'rgba(5,8,15,0.88)',         // image overlay (keeps text readable)
  },

  border: {
    base:   'rgba(255,255,255,0.072)',   // standard border
    subtle: 'rgba(255,255,255,0.038)',   // de-emphasised border
    input:  'rgba(255,255,255,0.10)',    // input focus border
    cyan:   'rgba(6,182,212,0.30)',      // cyan accent border / active indicator
  },

  color: {
    // Primary accent — nav active, buttons, links, charts (~80% of accent usage)
    cyan:   '#06b6d4',
    // Positive signal — scale, healthy, success (~15% of accent usage)
    green:  '#22c55e',
    // Subtle ambient glow only — max 5% usage
    purple: '#a78bfa',
    // Optimise / watch / caution
    orange: '#f97316',
    // Danger / pause / wasted spend / high priority
    red:    '#ef4444',
    // Needs more data
    yellow: '#eab308',
    // Text hierarchy
    white:  '#e2e8f0',
    muted:  '#94a3b8',
    dim:    '#475569',
  },

  glow: {
    cyan:    '0 0 20px rgba(6,182,212,0.15)',
    green:   '0 0 20px rgba(34,197,94,0.12)',
    card:    '0 4px 24px rgba(0,0,0,0.4)',
    cardHov: '0 8px 36px rgba(0,0,0,0.55)',
    nav:     '0 2px 20px rgba(0,0,0,0.6)',
  },

  glass: {
    // Sidebar / persistent panels — backdrop blur applied here only
    panel: {
      background:    '#080c16',
      borderRight:   '1px solid rgba(255,255,255,0.072)',
      backdropFilter:'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
    },
    // Top nav bar — backdrop blur applied here only
    nav: {
      background:    'rgba(8,12,22,0.80)',
      borderBottom:  '1px solid rgba(255,255,255,0.072)',
      backdropFilter:'blur(20px)',
      WebkitBackdropFilter: 'blur(20px)',
    },
    // Content cards — NO backdrop blur (avoids scroll repaint cost)
    card: {
      background:   'rgba(255,255,255,0.032)',
      border:       '1px solid rgba(255,255,255,0.072)',
      borderRadius: 12,
      boxShadow:    '0 4px 24px rgba(0,0,0,0.4)',
    },
  },

  font: {
    heading: "'Syne', sans-serif",
    body:    "'Syne', sans-serif",
    mono:    "'DM Mono', monospace",
  },

  radius: {
    sm:   6,
    md:   10,
    lg:   14,
    xl:   18,
    pill: 999,
  },

  transition: {
    fast: 'all 0.15s ease',
    base: 'all 0.2s ease',
  },

  // Cyber grid background (pure CSS, no image file dependency)
  cyberGrid: {
    backgroundImage: [
      // Radial purple ambient glow — top left
      'radial-gradient(ellipse 70% 60% at 15% 10%, rgba(167,139,250,0.04) 0%, transparent 70%)',
      // Radial cyan glow — bottom right
      'radial-gradient(ellipse 60% 50% at 85% 90%, rgba(6,182,212,0.04) 0%, transparent 70%)',
      // Horizontal grid lines
      'repeating-linear-gradient(0deg, transparent, transparent 39px, rgba(255,255,255,0.022) 40px)',
      // Vertical grid lines
      'repeating-linear-gradient(90deg, transparent, transparent 39px, rgba(255,255,255,0.022) 40px)',
      // Base gradient
      'linear-gradient(135deg, #05080f 0%, #070b12 50%, #060a10 100%)',
    ].join(', '),
  },
};

export default T;
