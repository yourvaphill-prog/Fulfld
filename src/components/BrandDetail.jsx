import { memo, useState, useCallback, useMemo } from 'react';
import {
  X, Phone, Eye, BarChart2, AlertCircle, Users, ShoppingBag, Star,
  TrendingUp, TrendingDown, Minus, Layers, Target, Zap, Sliders,
  Tag, PieChart, AlertTriangle, Send, MessageSquare,
  CheckCircle, XCircle,
} from 'lucide-react';
import { calcScore, scoreColor } from '../utils/scoring.js';
import { generateInsights } from '../utils/insights.js';
import {
  normalizeSubcat, getBrandSubcatRevenue, fmt, pct, money,
} from '../utils/csvHelpers.js';
import { useBrandNotes } from '../hooks/useSharedState.js';
import { hasSupabase } from '../lib/supabase.js';

const G      = '#00ff87';
const B      = '#3b82f6';
const CARD   = 'rgba(13,20,35,0.85)';
const BORDER = 'rgba(255,255,255,0.07)';

const STATUS_OPTIONS = [
  { value: 'submitted', label: 'Submitted', color: G },
  { value: 'contacted', label: 'Contacted', color: '#ffd166' },
  { value: 'denied',    label: 'Denied',    color: '#ef476f' },
];

function SectionTitle({ icon, label }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:14, color:'#475569', fontSize:10, fontFamily:"'DM Mono'", textTransform:'uppercase', letterSpacing:'0.1em' }}>
      {icon} {label}
    </div>
  );
}

function MetricCard({ label, value, icon, highlight }) {
  return (
    <div style={{ background:CARD, border:`1px solid ${highlight ? highlight+'25' : BORDER}`, borderRadius:10, padding:'12px 14px', backdropFilter:'blur(8px)' }}>
      <div style={{ color:'#475569', fontSize:10, fontFamily:"'DM Mono'", marginBottom:6, display:'flex', alignItems:'center', gap:5, textTransform:'uppercase', letterSpacing:'0.05em' }}>{icon} {label}</div>
      <div style={{ color:highlight||'#e2e8f0', fontSize:14, fontWeight:600, fontFamily:"'DM Mono'" }}>{value}</div>
    </div>
  );
}

function GrowthBadge({ value }) {
  const num = Number(value);
  if (isNaN(num) || value==='' || value===null) return <span style={{ color:'#334155' }}>—</span>;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:3, color: num>0?G:num<0?'#ef476f':'#475569', fontFamily:"'DM Mono'", fontSize:11 }}>
      {num>0?<TrendingUp size={10}/>:num<0?<TrendingDown size={10}/>:<Minus size={10}/>}
      {`${num>=0?'+':''}${(num*100).toFixed(1)}%`}
    </span>
  );
}

// ── Why This Brand summary ────────────────────────────────────────────────────
function WhyThisBrand({ insights, score, msPct, kpiSettings }) {
  const safeInsights  = Array.isArray(insights) ? insights : [];
  const opportunities = safeInsights.filter(i => i.type === 'opportunity' || i.type === 'positive');
  const risks         = safeInsights.filter(i => i.type === 'risk');
  if (!opportunities.length && !risks.length) return null;

  const minIdeal = kpiSettings?.minIdealMarketShare ?? 2;
  const maxIdeal = kpiSettings?.maxIdealMarketShare ?? 15;

  const bullets = opportunities.slice(0, 4).map(i => ({ text: i.title, icon: i.icon, color: G }));
  if (msPct !== null && msPct >= minIdeal && msPct <= maxIdeal)
    bullets.unshift({ text: `Only ${msPct.toFixed(1)}% subcategory share — room to grow`, icon: '🎯', color: G });

  return (
    <div style={{ background: 'rgba(0,255,135,0.04)', border:`1px solid ${G}18`, borderRadius:12, padding:'16px 18px', marginBottom:20, backdropFilter:'blur(8px)' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <Zap size={14} color={G} />
        <span style={{ fontFamily:"'Syne'", fontWeight:800, fontSize:14, color:'#f1f5f9' }}>Why This Brand</span>
        <div style={{ marginLeft:'auto', background:`${G}15`, border:`1px solid ${G}35`, borderRadius:8, padding:'3px 10px', fontFamily:"'DM Mono'", fontSize:11, color:G, fontWeight:700 }}>
          Score {score}
        </div>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {bullets.slice(0,4).map((b, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:13 }}>{b.icon}</span>
            <span style={{ fontFamily:"'DM Mono'", fontSize:11, color:'#94a3b8' }}>{b.text}</span>
          </div>
        ))}
      </div>
      {risks.length > 0 && (
        <div style={{ marginTop:10, paddingTop:10, borderTop:`1px solid ${BORDER}` }}>
          {risks.slice(0,2).map((r, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:7, marginTop:4 }}>
              <span style={{ fontSize:12 }}>{r.icon}</span>
              <span style={{ fontFamily:"'DM Mono'", fontSize:10, color:'#ef476f' }}>{r.title}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Score breakdown ───────────────────────────────────────────────────────────
function ScoreBreakdown({ breakdown, rejectReasons, isCallReady }) {
  return (
    <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:12, padding:'16px 18px', marginBottom:20, backdropFilter:'blur(8px)' }}>
      <SectionTitle icon={<Sliders size={13}/>} label="Score Breakdown" />
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {breakdown.map((item, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:110, color:'#475569', fontSize:11, fontFamily:"'DM Mono'" }}>{item.label}</div>
            <div style={{ flex:1, background:'rgba(255,255,255,0.05)', borderRadius:4, height:5, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${item.max>0?(item.earned/item.max)*100:0}%`, background:item.earned>=item.max*0.7?G:item.earned>=item.max*0.4?'#ffd166':'#ef476f', borderRadius:4, transition:'width 0.4s ease' }} />
            </div>
            <div style={{ width:48, textAlign:'right', fontFamily:"'DM Mono'", fontSize:11, color:'#64748b' }}>{item.earned}/{item.max}</div>
            <div style={{ width:100, color:'#334155', fontSize:10, fontFamily:"'DM Mono'" }}>{item.detail}</div>
          </div>
        ))}
      </div>
      {rejectReasons.length > 0 && (
        <div style={{ marginTop:14, display:'flex', flexDirection:'column', gap:5 }}>
          {rejectReasons.map((r, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:7, background:'rgba(239,71,111,0.07)', border:'1px solid #ef476f22', borderRadius:8, padding:'7px 11px' }}>
              <AlertTriangle size={12} color="#ef476f" />
              <span style={{ fontFamily:"'DM Mono'", fontSize:11, color:'#ef476f' }}>{r}</span>
            </div>
          ))}
        </div>
      )}
      {isCallReady && (
        <div style={{ marginTop:10, display:'flex', alignItems:'center', gap:7, background:`${G}0d`, border:`1px solid ${G}30`, borderRadius:8, padding:'7px 11px' }}>
          <Phone size={12} color={G} />
          <span style={{ fontFamily:"'DM Mono'", fontSize:11, color:G, fontWeight:600 }}>CALL-READY — Meets all KPI thresholds</span>
        </div>
      )}
    </div>
  );
}

// ── Shared notes ──────────────────────────────────────────────────────────────
function NotesPanel({ brandName, userName }) {
  const { notes, loading, addNote } = useBrandNotes(brandName);
  const [text, setText] = useState('');

  const submit = useCallback(async () => {
    if (!text.trim()) return;
    await addNote(text, userName);
    setText('');
  }, [text, addNote, userName]);

  if (!hasSupabase) {
    return (
      <div style={{ color:'#334155', fontFamily:"'DM Mono'", fontSize:11, padding:'10px 0' }}>
        Shared notes require Supabase. See SETUP.md.
      </div>
    );
  }

  return (
    <div>
      {/* New note input */}
      <div style={{ display:'flex', gap:8, marginBottom:14 }}>
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => e.key==='Enter' && submit()}
          placeholder="Add a note..."
          style={{ flex:1, background:'rgba(255,255,255,0.04)', border:`1px solid ${BORDER}`, borderRadius:9, padding:'8px 12px', color:'#e2e8f0', fontFamily:"'DM Mono'", fontSize:12, outline:'none' }}
        />
        <button onClick={submit}
          style={{ background:`${B}15`, border:`1px solid ${B}45`, borderRadius:9, padding:'8px 13px', color:B, cursor:'pointer', display:'flex', alignItems:'center', gap:5, fontFamily:"'DM Mono'", fontSize:12 }}>
          <Send size={12}/> Post
        </button>
      </div>
      {/* Notes list */}
      {loading ? (
        <div style={{ color:'#334155', fontFamily:"'DM Mono'", fontSize:11 }}>Loading notes…</div>
      ) : notes.length === 0 ? (
        <div style={{ color:'#334155', fontFamily:"'DM Mono'", fontSize:11 }}>No notes yet. Be the first.</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {notes.map((n, i) => (
            <div key={n.id||i} style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:9, padding:'10px 13px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontFamily:"'DM Mono'", fontSize:11, color:'#e2e8f0', fontWeight:600 }}>{n.created_by}</span>
                <span style={{ fontFamily:"'DM Mono'", fontSize:10, color:'#334155' }}>{new Date(n.created_at).toLocaleDateString()}</span>
              </div>
              <div style={{ fontFamily:"'DM Mono'", fontSize:11, color:'#94a3b8', lineHeight:1.5 }}>{n.note}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main BrandDetail ──────────────────────────────────────────────────────────
const BrandDetail = memo(function BrandDetail({
  brand, allData, kpiSettings, currentStatus, onStatusChange, onClose,
  subcatNodeMap, brandSubcatMaps, userName, onLogActivity,
}) {
  const [activeTab, setActiveTab] = useState('analysis');

  const subcategoryName   = brand['Primary Subcategory'] || '';
  const brandTotalRevenue = Number(brand['Est. Monthly Revenue']) || 0;
  const safeMaps = brandSubcatMaps ?? { revenueMap:new Map(), countMap:new Map(), totalCountMap:new Map() };

  const subcatKey     = normalizeSubcat(subcategoryName);
  const subcatRow     = (subcatNodeMap ?? new Map()).get(subcatKey) ?? null;
  const subcatRevenue = subcatRow ? (Number(subcatRow['Estimated Monthly Revenue']) || null) : null;

  const brandSubcatRevenue = useMemo(() => {
    const brandKey = (brand['Brand Name'] || '').toLowerCase().trim();
    return getBrandSubcatRevenue(brandKey, subcatKey, brandTotalRevenue, safeMaps);
  }, [brand, subcatKey, brandTotalRevenue, safeMaps]);

  const { marketShareNum, marketShareMismatch } = useMemo(() => {
    if (!subcatRevenue || !brandSubcatRevenue) return { marketShareNum:null, marketShareMismatch:false };
    const raw = (brandSubcatRevenue / subcatRevenue) * 100;
    if (raw > 100) return { marketShareNum:null, marketShareMismatch:true };
    return { marketShareNum:raw, marketShareMismatch:false };
  }, [subcatRevenue, brandSubcatRevenue, brand]);

  const marketSharePct = marketShareMismatch ? 'Data mismatch' : marketShareNum !== null ? `${marketShareNum.toFixed(1)}%` : '—';

  const adData = useMemo(() =>
    (allData.adspy||[]).find(a => (a['Brand']||'').toLowerCase()===(brand['Brand Name']||'').toLowerCase()) ?? null
  , [allData.adspy, brand]);

  const { score, breakdown: rawBreakdown, rejectReasons: rawRejectReasons, isCallReady } = useMemo(() =>
    calcScore(brand, kpiSettings, marketShareNum, adData)
  , [brand, kpiSettings, marketShareNum, adData]);

  const breakdown     = Array.isArray(rawBreakdown)     ? rawBreakdown     : [];
  const rejectReasons = Array.isArray(rawRejectReasons) ? rawRejectReasons : [];

  const insights = useMemo(() => {
    try {
      const result = generateInsights(brand, allData, kpiSettings, marketShareNum, marketShareMismatch);
      return Array.isArray(result) ? result : [];
    } catch {
      return [];
    }
  }, [brand, allData, kpiSettings, marketShareNum, marketShareMismatch]);

  const competitors = useMemo(() => {
    if (!Array.isArray(allData.products) || !allData.products.length) return [];
    const subcatTarget = normalizeSubcat(subcategoryName);
    const thisBrand    = (brand['Brand Name']||'').toLowerCase().trim();
    const brandMap = {};
    for (const p of allData.products) {
      const bName = (p['Brand']||'').trim();
      if (!bName || bName.toLowerCase()===thisBrand) continue;
      if (normalizeSubcat(p['Primary Subcategory Name']||p['Primary Subcategory']||'') !== subcatTarget) continue;
      const rev = Number(p['Est. Monthly Revenue'])||0;
      if (!brandMap[bName]) brandMap[bName] = { name:bName, subcatRevenue:0, productCount:0 };
      brandMap[bName].subcatRevenue += rev;
      brandMap[bName].productCount  += 1;
    }
    return Object.values(brandMap).sort((a,b)=>b.subcatRevenue-a.subcatRevenue).slice(0,8);
  }, [allData.products, subcategoryName, brand]);

  const sellerStats = useMemo(() => {
    if (!brand['Brand Name'] || !Array.isArray(allData.products) || !allData.products.length) return null;
    const target = (brand['Brand Name']||'').toLowerCase().trim();
    const bp = allData.products.filter(p => (p['Brand']||'').toLowerCase().trim()===target);
    if (!bp.length) return null;
    const allS = bp.map(p => Number(p['All Sellers'])||0).filter(n => !isNaN(n));
    const fbaS = bp.map(p => Number(p['FBA Sellers'])||0).filter(n => !isNaN(n));
    if (!allS.length) return null;
    return {
      maxSellers:   Math.max(...allS),
      avgSellers:   (allS.reduce((a,b)=>a+b,0) / allS.length).toFixed(1),
      maxFBA:       fbaS.length ? Math.max(...fbaS) : 0,
      productCount: bp.length,
    };
  }, [brand, allData.products]);

  const c = scoreColor(score);

  const handleStatus = useCallback((val) => {
    const next = currentStatus === val ? '' : val;
    onStatusChange(brand['Brand Name'], next);
    if (next && onLogActivity) onLogActivity(brand['Brand Name'], next, userName);
  }, [brand, currentStatus, onStatusChange, onLogActivity, userName]);

  const TABS = [
    { id:'analysis', label:'Analysis' },
    { id:'notes',    label:`Notes${hasSupabase?'':' (local)'}` },
  ];

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(2,6,14,0.75)', zIndex:100, display:'flex', justifyContent:'flex-end', backdropFilter:'blur(4px)' }} onClick={onClose}>
      <div style={{ width:'min(760px,95vw)', height:'100vh', background:'linear-gradient(180deg,#0b1220 0%,#080c12 100%)', borderLeft:`1px solid ${BORDER}`, overflowY:'auto', padding:'26px 26px', animation:'slideIn 0.2s ease' }} onClick={e=>e.stopPropagation()}>

        {/* Header */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
          <div>
            <div style={{ color:'#334155', fontSize:10, fontFamily:"'DM Mono'", marginBottom:5, letterSpacing:'0.1em' }}>BRAND ANALYSIS</div>
            <h2 style={{ margin:0, fontSize:24, fontFamily:"'Syne'", fontWeight:800, color:'#f1f5f9' }}>{brand['Brand Name']}</h2>
            <div style={{ color:'#475569', fontSize:12, marginTop:4, fontFamily:"'DM Mono'" }}>{brand['Main Category']} → {subcategoryName}</div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            {isCallReady && (
              <div style={{ display:'flex', alignItems:'center', gap:5, background:`${G}12`, border:`1px solid ${G}35`, borderRadius:8, padding:'5px 11px' }}>
                <Phone size={11} color={G}/>
                <span style={{ fontFamily:"'DM Mono'", fontSize:10, color:G, fontWeight:600 }}>CALL-READY</span>
              </div>
            )}
            <div style={{ textAlign:'center' }}>
              <div style={{ color:'#334155', fontSize:9, fontFamily:"'DM Mono'", marginBottom:4, letterSpacing:'0.08em' }}>SCORE</div>
              <div style={{ width:54, height:54, borderRadius:'50%', border:`2px solid ${c}`, display:'flex', alignItems:'center', justifyContent:'center', color:c, fontFamily:"'DM Mono'", fontWeight:800, fontSize:18, boxShadow:`0 0 20px ${c}30, inset 0 0 20px ${c}08` }}>{score}</div>
            </div>
            <button onClick={onClose} style={{ background:'rgba(255,255,255,0.04)', border:`1px solid ${BORDER}`, borderRadius:8, padding:7, cursor:'pointer', color:'#475569', display:'flex', alignItems:'center' }}>
              <X size={15}/>
            </button>
          </div>
        </div>

        {/* Status Actions */}
        <div style={{ display:'flex', gap:6, marginBottom:18, alignItems:'center' }}>
          <span style={{ color:'#334155', fontSize:10, fontFamily:"'DM Mono'", marginRight:4, letterSpacing:'0.08em' }}>STATUS</span>
          {STATUS_OPTIONS.map(s => (
            <button key={s.value} onClick={() => handleStatus(s.value)}
              style={{ display:'inline-flex', alignItems:'center', gap:6, borderRadius:8, padding:'7px 14px', cursor:'pointer', fontSize:12, fontFamily:"'DM Mono'", border:'1px solid', whiteSpace:'nowrap', borderColor: currentStatus===s.value ? s.color : BORDER, color: currentStatus===s.value ? s.color : '#475569', background: currentStatus===s.value ? `${s.color}15` : 'rgba(255,255,255,0.04)' }}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Tab nav */}
        <div style={{ display:'flex', gap:0, borderBottom:`1px solid ${BORDER}`, marginBottom:20 }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setActiveTab(t.id)}
              style={{ background:'transparent', border:'none', cursor:'pointer', padding:'8px 16px', borderBottom:`2px solid ${activeTab===t.id?G:'transparent'}`, color:activeTab===t.id?G:'#475569', fontFamily:"'DM Mono'", fontSize:11, transition:'color 0.15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === 'analysis' && (
          <>
            {/* Why This Brand */}
            <WhyThisBrand insights={insights} score={score} msPct={marketShareNum} kpiSettings={kpiSettings}/>

            {/* Score Breakdown */}
            <ScoreBreakdown breakdown={breakdown} rejectReasons={rejectReasons} isCallReady={isCallReady}/>

            {/* Insights */}
            {insights.length > 0 && (
              <div style={{ marginBottom:22 }}>
                <SectionTitle icon={<Zap size={13}/>} label="Pitch Insights"/>
                <div style={{ display:'flex', flexDirection:'column', gap:7 }}>
                  {insights.map((ins, i) => (
                    <div key={i} style={{ background: ins.type==='risk'?'rgba(239,71,111,0.06)':ins.type==='opportunity'?'rgba(0,255,135,0.05)':'rgba(59,130,246,0.06)', border:`1px solid ${ins.type==='risk'?'#ef476f20':ins.type==='opportunity'?`${G}20`:`${B}20`}`, borderRadius:10, padding:'11px 14px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
                        <span style={{ fontSize:14 }}>{ins.icon}</span>
                        <span style={{ fontFamily:"'Syne'", fontWeight:700, fontSize:13, color: ins.type==='risk'?'#ef476f':ins.type==='opportunity'?G:B }}>{ins.title}</span>
                      </div>
                      <div style={{ fontFamily:"'DM Mono'", fontSize:11, color:'#64748b', lineHeight:1.6 }}>{ins.body}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Market share highlight */}
            {subcatRow && (
              <div style={{ background: marketShareMismatch?'rgba(239,71,111,0.06)':'rgba(0,255,135,0.05)', border:`1px solid ${marketShareMismatch?'#ef476f20':`${G}20`}`, borderRadius:12, padding:'14px 18px', marginBottom:20, display:'flex', gap:24, flexWrap:'wrap', backdropFilter:'blur(8px)' }}>
                <div>
                  <div style={{ color:'#334155', fontSize:9, fontFamily:"'DM Mono'", marginBottom:4, letterSpacing:'0.08em' }}>BRAND SHARE IN SUBCATEGORY</div>
                  <div style={{ color:marketShareMismatch?'#ef476f':G, fontSize:marketShareMismatch?14:28, fontWeight:800, fontFamily:"'Syne'", textShadow:marketShareMismatch?'none':`0 0 20px ${G}50` }}>
                    {marketShareMismatch?'Data mismatch':marketSharePct}
                  </div>
                </div>
                {!marketShareMismatch && (
                  <>
                    <div style={{ borderLeft:`1px solid ${BORDER}`, paddingLeft:24 }}>
                      <div style={{ color:'#334155', fontSize:9, fontFamily:"'DM Mono'", marginBottom:4, letterSpacing:'0.08em' }}>BRAND SUBCATEGORY REVENUE</div>
                      <div style={{ color:'#e2e8f0', fontSize:16, fontWeight:600, fontFamily:"'DM Mono'" }}>{brandSubcatRevenue!=null?`${money(brandSubcatRevenue)}/mo`:'—'}</div>
                    </div>
                    <div style={{ borderLeft:`1px solid ${BORDER}`, paddingLeft:24 }}>
                      <div style={{ color:'#334155', fontSize:9, fontFamily:"'DM Mono'", marginBottom:4, letterSpacing:'0.08em' }}>{subcategoryName.toUpperCase()} TOTAL REVENUE</div>
                      <div style={{ color:'#e2e8f0', fontSize:16, fontWeight:600, fontFamily:"'DM Mono'" }}>{money(subcatRevenue)}/mo</div>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Metrics grid */}
            <div style={{ marginBottom:22 }}>
              <SectionTitle icon={<Target size={13}/>} label="Brand Metrics"/>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                {[
                  { label:'Monthly Revenue', value:money(brand['Est. Monthly Revenue']), icon:<BarChart2 size={13}/> },
                  { label:'Amazon %', value:brand['Sales %']!==undefined?`${Number(brand['Sales %']).toFixed(1)}%`:'—', icon:<AlertCircle size={13}/>, highlight:Number(brand['Sales %'])<30?G:Number(brand['Sales %'])>70?'#ef476f':'#ffd166' },
                  { label:'Brand Share in Subcategory', value:marketSharePct, icon:<PieChart size={13}/>, highlight:marketShareMismatch?'#ef476f':marketShareNum!==null&&marketShareNum>=(kpiSettings?.minIdealMarketShare??2)&&marketShareNum<=(kpiSettings?.maxIdealMarketShare??15)?G:marketShareNum!==null&&marketShareNum>=(kpiSettings?.dominantMarketShare??30)?'#ef476f':'#ffd166' },
                  { label:'Max Total Sellers', value:sellerStats?sellerStats.maxSellers:(brand['Avg. Sellers']||'—'), icon:<Users size={13}/> },
                  { label:'Avg Sellers / Product', value:sellerStats?sellerStats.avgSellers:(brand['Avg. Sellers']||'—'), icon:<Users size={13}/> },
                  { label:'FBA Sellers (Max)', value:sellerStats?sellerStats.maxFBA:(brand['Avg. FBA Sellers']||'—'), icon:<Users size={13}/> },
                  { label:'Product Count', value:sellerStats?sellerStats.productCount:(brand['Product Count']||'—'), icon:<ShoppingBag size={13}/> },
                  { label:'Brand Score', value:brand['Brand Score']||'—', icon:<Star size={13}/> },
                  { label:'1M Growth', value:<GrowthBadge value={brand['1 Month Growth']}/>, icon:<TrendingUp size={13}/> },
                  { label:'12M Growth', value:<GrowthBadge value={brand['12 Month Growth']}/>, icon:<TrendingUp size={13}/> },
                  { label:'Total Reviews', value:fmt(brand['Total Reviews']), icon:<Star size={13}/> },
                  { label:'Avg Price', value:money(brand['Avg. Price']), icon:<Tag size={13}/> },
                ].map((m,i) => <MetricCard key={i} {...m}/>)}
              </div>
            </div>

            {/* Subcategory Intel */}
            {subcatRow && (
              <div style={{ marginBottom:22 }}>
                <SectionTitle icon={<Layers size={13}/>} label="Subcategory Intelligence"/>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
                  {[
                    { label:'Subcategory Revenue', value:money(subcatRow['Estimated Monthly Revenue']) },
                    { label:'Seller Revenue Share', value:pct(subcatRow['Seller Revenue Share']) },
                    { label:'Amazon Revenue Share', value:pct(subcatRow['Amazon Revenue Share']), highlight:Number(subcatRow['Amazon Revenue Share'])>0.5?'#ef476f':G },
                    { label:'# Brands', value:fmt(subcatRow['Number of Brands']) },
                    { label:'Avg Sellers / Product', value:fmt(subcatRow['Average Number of Sellers']) },
                    { label:'Avg Price', value:money(subcatRow['Average Price']) },
                  ].map((m,i) => <MetricCard key={i} {...m}/>)}
                </div>
              </div>
            )}

            {/* Ad Intel */}
            {adData && (
              <div style={{ marginBottom:22 }}>
                <SectionTitle icon={<Zap size={13}/>} label="Ad Intelligence"/>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:8 }}>
                  {[
                    { label:'Search Terms', value:fmt(adData['Search Terms']) },
                    { label:'Products with Ads', value:fmt(adData['Products with Ads']) },
                    { label:'Total Ad Spend', value:money(adData['Total Ad Spend']) },
                    { label:'Amazon Retail %', value:pct(adData['Percent of Sales by Amazon Retail']) },
                  ].map((m,i) => <MetricCard key={i} {...m}/>)}
                </div>
              </div>
            )}

            {/* Competitors */}
            <div style={{ marginBottom:22 }}>
              <SectionTitle icon={<Users size={13}/>} label={`Competing Brands in "${subcategoryName||'Subcategory'}"`}/>
              {competitors.length > 0 ? (
                <div style={{ overflowX:'auto', borderRadius:10, border:`1px solid ${BORDER}`, background:CARD }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                    <thead>
                      <tr style={{ borderBottom:`1px solid ${BORDER}` }}>
                        {['Brand','Subcategory Revenue','Subcat Share','Products'].map(h => (
                          <th key={h} style={{ padding:'8px 11px', textAlign:'left', color:'#334155', fontFamily:"'DM Mono'", fontWeight:400, fontSize:10, letterSpacing:'0.06em', textTransform:'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {competitors.map((comp, i) => {
                        const sharePct = subcatRevenue && comp.subcatRevenue ? (comp.subcatRevenue/subcatRevenue)*100 : 0;
                        return (
                          <tr key={i} style={{ borderBottom:`1px solid rgba(255,255,255,0.03)` }}
                            onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                            <td style={{ padding:'10px 11px', color:'#cbd5e1', fontWeight:500, maxWidth:150, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{comp.name}</td>
                            <td style={{ padding:'10px 11px', fontFamily:"'DM Mono'", color:G }}>{money(comp.subcatRevenue)}/mo</td>
                            <td style={{ padding:'10px 11px', fontFamily:"'DM Mono'", color:'#94a3b8' }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <span>{sharePct>0?`${sharePct.toFixed(1)}%`:'—'}</span>
                                {sharePct>0 && (
                                  <div style={{ flex:1, maxWidth:60, background:'rgba(255,255,255,0.06)', borderRadius:3, height:4, overflow:'hidden' }}>
                                    <div style={{ height:'100%', width:`${Math.min(100,sharePct*2)}%`, background:`${G}80`, borderRadius:3 }}/>
                                  </div>
                                )}
                              </div>
                            </td>
                            <td style={{ padding:'10px 11px', fontFamily:"'DM Mono'", color:'#475569' }}>{comp.productCount}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ color:'#334155', fontSize:12, fontFamily:"'DM Mono'" }}>Upload Products CSV to see competitor data.</div>
              )}
            </div>

            {brand['Storefront Url'] && (
              <a href={brand['Storefront Url']} target="_blank" rel="noreferrer"
                style={{ display:'inline-flex', alignItems:'center', gap:8, background:`${G}10`, border:`1px solid ${G}30`, borderRadius:10, padding:'10px 18px', color:G, textDecoration:'none', fontSize:12, fontFamily:"'DM Mono'", boxShadow:`0 0 16px ${G}15` }}>
                <ShoppingBag size={13}/> View Amazon Storefront ↗
              </a>
            )}
          </>
        )}

        {activeTab === 'notes' && (
          <div>
            <SectionTitle icon={<MessageSquare size={13}/>} label="Shared Notes"/>
            <NotesPanel brandName={brand['Brand Name']} userName={userName}/>
          </div>
        )}
      </div>
    </div>
  );
});

export default BrandDetail;
