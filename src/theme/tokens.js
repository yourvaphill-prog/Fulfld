// ─────────────────────────────────────────────────────────────────────────────
// FUFLD Operations Console — design tokens
//
// A plain JS constants module compatible with the existing inline-style codebase.
// No dependencies, no CSS framework. Import what you need:
//
//   import { COLORS, ACCENTS, SPACE, RADIUS, FONT } from './theme/tokens.js';
//
// Design intent: premium internal operations console — flat solid surfaces,
// hairline borders, muted accents. Depth comes from border + background-step,
// never from glow, blur, or gradients.
// ─────────────────────────────────────────────────────────────────────────────

export const COLORS = {
  // Surfaces — near-black navy, stepped up by elevation
  bg:           '#0A0E14', // app background (near-black navy)
  surface:      '#0F141C', // panels / cards (one step over bg)
  surfaceHover: '#131A24', // card hover / raised rows
  surfaceInset: '#0C1118', // inputs / wells (one step under surface)

  // Borders — thin hairlines
  border:       'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.16)',

  // Text
  text:         '#E6EAF0', // primary
  textMuted:    '#8A95A5', // secondary / descriptions
  textDim:      '#5A6675', // tertiary / labels / footnotes
};

// Muted, desaturated per-tool accents. Used ONLY on icon tiles, hover borders,
// and small badges — never as fills or glows.
export const ACCENTS = {
  brandScout: '#3FB67E', // emerald (muted)
  ppcPilot:   '#4F8CC9', // steel blue
  upcScanner: '#C99A4F', // amber (muted)
  catalog:    '#8B83C9', // slate violet
  contact:    '#C97E8B', // slate rose (external)
};

// rgba helpers for translucent accent backgrounds (icon tiles / badges) without
// a color-parse dependency. Keep alpha low — these are tints, not glows.
export const ACCENT_RGB = {
  brandScout: '63,182,126',
  ppcPilot:   '79,140,201',
  upcScanner: '201,154,79',
  catalog:    '139,131,201',
  contact:    '201,126,139',
};

export const SPACE = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
};

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 12,
};

export const FONT =
  "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// Fast, calm transitions on border/background only.
export const TRANSITION = 'background 140ms ease, border-color 140ms ease, color 140ms ease';

export default { COLORS, ACCENTS, ACCENT_RGB, SPACE, RADIUS, FONT, TRANSITION };
