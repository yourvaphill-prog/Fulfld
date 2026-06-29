import { useState, useRef, useEffect } from 'react';
import { ACCENTS } from './theme/tokens.js';
import './CommandCenterLanding.css';

// ─── Command Center landing — light clickable 3D module-card hero ───────────────
// The cards ARE the navigation. Each card flips ("Opening …") then calls
// onSelectModule(id) — the same contract App.jsx already uses (setPage(id)), so no
// routing/module/API/Supabase logic changes. Card content is visual sample data
// only (no live data wired this pass). Contact Intelligence stays a small external
// GPT link, per the approved direction.

const CONTACT_GPT_URL =
  'https://chatgpt.com/g/g-6a297117a7908191bf496698addb9419-fufld-decision-maker-finder';

const prefersReduced = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// Subtle pointer parallax → writes --px/--py on the stage. Live-gated: disabled on
// coarse pointers, narrow viewports, and prefers-reduced-motion (idle float only).
function usePointerParallax(maxShift = 16) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const pointerMQ = window.matchMedia('(pointer: fine)');
    const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
    const active = () => pointerMQ.matches && !reduceMQ.matches && window.innerWidth >= 900;
    let raf = 0, tnx = 0, tny = 0, cnx = 0, cny = 0;
    const clamp = (v) => Math.max(-1, Math.min(1, v));
    const set = () => {
      el.style.setProperty('--px', `${(cnx * maxShift).toFixed(2)}px`);
      el.style.setProperty('--py', `${(cny * maxShift).toFixed(2)}px`);
    };
    const tick = () => {
      cnx += (tnx - cnx) * 0.08; cny += (tny - cny) * 0.08; set();
      if (Math.abs(tnx - cnx) > 0.001 || Math.abs(tny - cny) > 0.001) raf = requestAnimationFrame(tick);
      else raf = 0;
    };
    const onMove = (e) => {
      if (!active()) { tnx = 0; tny = 0; if (!raf) raf = requestAnimationFrame(tick); return; }
      const r = el.getBoundingClientRect();
      tnx = clamp((e.clientX - (r.left + r.width / 2)) / (r.width / 2));
      tny = clamp((e.clientY - (r.top + r.height / 2)) / (r.height / 2));
      if (!raf) raf = requestAnimationFrame(tick);
    };
    const onLeave = () => { tnx = 0; tny = 0; if (!raf) raf = requestAnimationFrame(tick); };
    set();
    el.addEventListener('mousemove', onMove);
    el.addEventListener('mouseleave', onLeave);
    return () => { el.removeEventListener('mousemove', onMove); el.removeEventListener('mouseleave', onLeave); if (raf) cancelAnimationFrame(raf); };
  }, [maxShift]);
  return ref;
}

function ModuleCard({ posClass, id, title, badge, accent, onSelectModule, children }) {
  const [flipping, setFlipping] = useState(false);
  const handle = () => {
    if (flipping) return;
    if (prefersReduced()) { onSelectModule(id); return; }
    setFlipping(true);
    window.setTimeout(() => onSelectModule(id), 620); // matches flip duration
  };
  return (
    <button type="button" className={`ccl-mod ${posClass}`} onClick={handle} aria-label={`Open ${title}`}>
      <span className="ccl-mod-float">
        <span className={`ccl-mod-flip ${flipping ? 'is-flipping' : ''}`}>
          <span className="ccl-mod-front">
            <span className="ccl-mh">
              <span className="ccl-badge" style={{ background: `${accent}22`, color: accent }}>{badge}</span>
              <span className="ccl-title">{title}</span>
              <span className="ccl-open">Open →</span>
            </span>
            {children}
          </span>
          <span className="ccl-mod-back">
            <span className="ccl-dots"><i /><i /><i /></span>
            Opening {title}…
          </span>
        </span>
      </span>
    </button>
  );
}

function MiniTrend({ color = '#4F8CC9' }) {
  const d = 'M2,26 L16,22 L30,24 L44,16 L58,18 L72,9 L86,12 L100,4';
  return (
    <svg className="ccl-trend" viewBox="0 0 102 30" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${d} L100,30 L2,30 Z`} fill={`${color}26`} />
      <path d={d} fill="none" stroke={color} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function CommandCenterLanding({ onSelectModule }) {
  const stageRef = usePointerParallax(16);

  return (
    <div className="ccl-root">
      <section className="ccl-shell">
        {/* Left: copy */}
        <div className="ccl-copy">
          <div className="ccl-eyebrow"><span className="ccl-dot" /> All-in-one operations command center</div>
          <h1 className="ccl-headline">Operate Smarter.<br /><span className="ccl-grad">Scale Faster.</span></h1>
          <p className="ccl-sub">
            Brand research, PPC analysis, product scanning, catalog extraction, and
            workflow tracking — every tool in one place.
          </p>
          <div className="ccl-cue">↳ Choose a module to open</div>
          <div>
            <a className="ccl-ext" href={CONTACT_GPT_URL} target="_blank" rel="noreferrer">
              Contact Intelligence
              <span className="ccl-ext-badge">GPT ↗</span>
              <small>Decision makers · caller scripts</small>
            </a>
          </div>
        </div>

        {/* Right: clickable 3D card cluster */}
        <div className="ccl-stage" ref={stageRef}>
          <div className="ccl-cluster">
            {/* 1 — Brand Scout → dashboard */}
            <ModuleCard posClass="ccl-pos-1" id="dashboard" title="Brand Scout" badge="BS" accent={ACCENTS.brandScout} onSelectModule={onSelectModule}>
              <span className="ccl-big">128<small>Opportunities</small></span>
              <span className="ccl-chips">
                <span className="ccl-chip ccl-chip-green">12 Submitted</span>
                <span className="ccl-chip ccl-chip-amber">8 Contacted</span>
              </span>
            </ModuleCard>

            {/* 2 — PPC Pilot → ppc */}
            <ModuleCard posClass="ccl-pos-2" id="ppc" title="PPC Pilot" badge="PPC" accent={ACCENTS.ppcPilot} onSelectModule={onSelectModule}>
              <span className="ccl-row">
                <span className="ccl-stat"><b>24.5%</b><small>ACOS</small></span>
                <span className="ccl-stat"><b>4.1x</b><small>ROAS</small></span>
              </span>
              <MiniTrend color={ACCENTS.ppcPilot} />
            </ModuleCard>

            {/* 3 — UPC Scanner → upc */}
            <ModuleCard posClass="ccl-pos-3" id="upc" title="UPC Scanner" badge="UPC" accent={ACCENTS.upcScanner} onSelectModule={onSelectModule}>
              <span className="ccl-big">36<small>Scans today</small></span>
              <span className="ccl-chips">
                <span className="ccl-chip ccl-chip-green">21 Approved</span>
                <span className="ccl-chip ccl-chip-red">6 Denied</span>
              </span>
            </ModuleCard>

            {/* 4 — Website Catalog Scraper → catalog */}
            <ModuleCard posClass="ccl-pos-4" id="catalog" title="Catalog Scraper" badge="CAT" accent={ACCENTS.catalog} onSelectModule={onSelectModule}>
              <span className="ccl-big">1,204<small>Products</small></span>
              <span className="ccl-chips">
                <span className="ccl-chip ccl-chip-blue">CSV ready</span>
              </span>
            </ModuleCard>

            {/* 5 — Project Checklist → checklist */}
            <ModuleCard posClass="ccl-pos-5" id="checklist" title="Project Checklist" badge="CL" accent={ACCENTS.checklist} onSelectModule={onSelectModule}>
              <span className="ccl-row ccl-row-tight"><small>Tasks completed</small><b className="ccl-progval">23 / 42</b></span>
              <span className="ccl-progress"><i style={{ width: '55%' }} /></span>
            </ModuleCard>

            {/* 6 — Decision Maker Finder → decision */}
            <ModuleCard posClass="ccl-pos-6" id="decision" title="Decision Maker" badge="DM" accent={ACCENTS.contact} onSelectModule={onSelectModule}>
              <span className="ccl-row">
                <span className="ccl-stat"><b>48</b><small>Leads</small></span>
                <span className="ccl-stat"><b>12</b><small>Decision makers</small></span>
              </span>
              <span className="ccl-chips">
                <span className="ccl-chip ccl-chip-amber">Outreach active</span>
              </span>
            </ModuleCard>
          </div>
        </div>
      </section>
    </div>
  );
}
