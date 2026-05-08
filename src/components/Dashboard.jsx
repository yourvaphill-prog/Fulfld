import { useState, useMemo, useCallback, useRef } from 'react';
import Papa from 'papaparse';
import {
  Search, Filter, Download, ChevronUp, ChevronDown, Eye, Phone,
  CheckCircle, MessageSquare, XCircle, RefreshCw,
  TrendingUp, TrendingDown, Minus,
} from 'lucide-react';
import { scoreColor } from '../utils/scoring.js';
import { money } from '../utils/csvHelpers.js';

const G      = '#00ff87';
const B      = '#3b82f6';
const CARD   = 'rgba(13,20,35,0.85)';
const BORDER = 'rgba(255,255,255,0.07)';

const btn = (variant='default') => ({
  display:'inline-flex', alignItems:'center', gap:6, borderRadius:8,
  padding:'7px 14px', cursor:'pointer', fontSize:12, fontFamily:"'DM Mono'",
  whiteSpace:'nowrap', border:'1px solid',
  ...(variant==='green' ? { background:`${G}15`, borderColor:`${G}45`, color:G }
    : variant==='blue'  ? { background:`${B}15`, borderColor:`${B}45`, color:B }
    : variant==='red'   ? { background:'#ef476f15', borderColor:'#ef476f45', color:'#ef476f' }
    : variant==='active'? { background:`${G}20`, borderColor:G, color:G }
    : { background:'rgba(255,255,255,0.04)', borderColor:BORDER, color:'#64748b' }),
});

const inputStyle = {
  width:'100%', background:'rgba(255,255,255,0.04)', border:`1px solid ${BORDER}`,
  borderRadius:10, padding:'9px 12px 9px 34px', color:'#e2e8f0',
  fontFamily:"'DM Mono'", fontSize:12, outline:'none', boxSizing:'border-box',
};
const inputBare = {
  background:'rgba(255,255,255,0.04)', border:`1px solid ${BORDER}`, borderRadius:10,
  padding:'8px 12px', color:'#e2e8f0', fontFamily:"'DM Mono'", fontSize:12,
  outline:'none', width:'100%', boxSizing:'border-box',
};

const STATUS_OPTIONS = [
  { value:'submitted', label:'Submitted', color:G,        icon:<CheckCircle size={11}/> },
  { value:'contacted', label:'Contacted', color:'#ffd166', icon:<MessageSquare size={11}/> },
  { value:'denied',    label:'Denied',    color:'#ef476f', icon:<XCircle size={11}/> },
];

const DEFAULT_FILTERS = { minScore:0, maxAmazonPct:100, minRevenue:0, maxSellers:999, minGrowth:-100, search:'', callReadyOnly:false, status:'' };

function ScoreBadge({ score }) {
  const c = scoreColor(score);
  return (
    <div style={{ display:'inline-flex', alignItems:'center', gap:5, background:`${c}12`, border:`1px solid ${c}40`, borderRadius:8, padding:'3px 10px', boxShadow:`0 0 8px ${c}18` }}>
      <div style={{ width:6, height:6, borderRadius:'50%', background:c, boxShadow:`0 0 6px ${c}` }}/>
      <span style={{ fontFamily:"'DM Mono'", fontSize:12, fontWeight:700, color:c }}>{score}</span>
    </div>
  );
}

function GrowthBadge({ value }) {
  const num = Number(value);
  if (isNaN(num)||value===''||value===null) return <span style={{ color:'#334155' }}>—</span>;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:3, color:num>0?G:num<0?'#ef476f':'#475569', fontFamily:"'DM Mono'", fontSize:11 }}>
      {num>0?<TrendingUp size={10}/>:num<0?<TrendingDown size={10}/>:<Minus size={10}/>}
      {`${num>=0?'+':''}${(num*100).toFixed(1)}%`}
    </span>
  );
}

function StatusBadge({ status }) {
  const m = STATUS_OPTIONS.find(s=>s.value===status);
  if (!m) return null;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, background:`${m.color}15`, border:`1px solid ${m.color}35`, borderRadius:6, padding:'3px 9px', color:m.color, fontFamily:"'DM Mono'", fontSize:11 }}>
      {m.icon} {m.label}
    </span>
  );
}

export default function Dashboard({ scoredBrands, statuses, onSelectBrand, onStatusChange }) {
  const [sort,        setSort]        = useState({ col:'__score', dir:'desc' });
  const [filters,     setFilters]     = useState(DEFAULT_FILTERS);
  const [showFilters, setShowFilters] = useState(false);
  const [page,        setPage]        = useState(0);
  const [pageSize,    setPageSize]    = useState(100);
  const [searchInput, setSearchInput] = useState('');
  const searchTimer = useRef(null);

  // Attach pipeline status
  const scored = useMemo(() => {
    const safe = Array.isArray(scoredBrands) ? scoredBrands : [];
    if (!safe.length) return [];
    const safeStatuses = statuses && typeof statuses === 'object' ? statuses : {};
    return safe.map(row => ({
      ...row,
      __score:         row.__score         ?? 0,
      __rejectReasons: Array.isArray(row.__rejectReasons) ? row.__rejectReasons : [],
      __isCallReady:   !!row.__isCallReady,
      __isDupe:        !!row.__isDupe,
      __status: (safeStatuses[row['Brand Name']] || {}).status || '',
    }));
  }, [scoredBrands, statuses]);

  const handleSearchChange = useCallback(e => {
    const val = e.target.value;
    setSearchInput(val);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => { setFilters(f=>({...f,search:val})); setPage(0); }, 300);
  }, []);

  const filtered = useMemo(() => scored.filter(row => {
    const rev = Number(row['Est. Monthly Revenue'])||0;
    const amz = Number(row['Sales %'])||0;
    const sel = Number(row['Avg. Sellers'])||0;
    const gr  = Number(row['1 Month Growth'])||0;
    const nm  = (row['Brand Name']||'').toLowerCase();
    if (row.__score  < filters.minScore)       return false;
    if (amz > filters.maxAmazonPct)            return false;
    if (rev < filters.minRevenue)              return false;
    if (sel > filters.maxSellers)              return false;
    if (gr*100 < filters.minGrowth)            return false;
    if (filters.search && !nm.includes(filters.search.toLowerCase())) return false;
    if (filters.callReadyOnly && !row.__isCallReady) return false;
    if (filters.status && row.__status !== filters.status) return false;
    return true;
  }), [scored, filters]);

  const sorted = useMemo(() => {
    const arr = [...filtered];
    arr.sort((a,b) => {
      let av = a[sort.col], bv = b[sort.col];
      av = isNaN(Number(av)) ? (av||'') : Number(av);
      bv = isNaN(Number(bv)) ? (bv||'') : Number(bv);
      if (av<bv) return sort.dir==='asc'?-1:1;
      if (av>bv) return sort.dir==='asc'?1:-1;
      return 0;
    });
    return arr;
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length/pageSize));
  const safePage   = Math.min(page, totalPages-1);
  const paged      = useMemo(() => sorted.slice(safePage*pageSize,(safePage+1)*pageSize), [sorted,safePage,pageSize]);

  const toggle = useCallback(col => { setSort(s=>({col,dir:s.col===col&&s.dir==='desc'?'asc':'desc'})); setPage(0); }, []);
  const SortIcon = useCallback(({col}) => sort.col===col?(sort.dir==='asc'?<ChevronUp size={11}/>:<ChevronDown size={11}/>):<ChevronDown size={11} style={{opacity:0.25}}/>, [sort]);

  const stats = useMemo(() => ({
    total:    scored.length,
    high:     scored.filter(r=>r.__score>=70).length,
    callReady:scored.filter(r=>r.__isCallReady).length,
    lowAmz:   scored.filter(r=>Number(r['Sales %'])<30).length,
    growing:  scored.filter(r=>Number(r['1 Month Growth'])>0).length,
  }), [scored]);

  const exportCSV = useCallback((subset) => {
    const rows = subset==='callReady' ? sorted.filter(r=>r.__isCallReady)
               : subset==='submitted' ? sorted.filter(r=>r.__status==='submitted')
               : subset==='contacted' ? sorted.filter(r=>r.__status==='contacted')
               : sorted;
    const csv = Papa.unparse(rows.map(r=>({
      'Brand Name':r['Brand Name'], 'Fulfld Score':r.__score,
      'Monthly Revenue':r['Est. Monthly Revenue'], 'Amazon %':r['Sales %'],
      'Avg Sellers':r['Avg. Sellers'], '1M Growth':r['1 Month Growth'],
      '12M Growth':r['12 Month Growth'], 'Brand Score':r['Brand Score'],
      'Category':r['Main Category'], 'Subcategory':r['Primary Subcategory'],
      'Status':r.__status, 'Call Ready':r.__isCallReady?'Yes':'No',
      'Reject Reasons':(Array.isArray(r.__rejectReasons)?r.__rejectReasons:[]).join('; '),
      'Storefront':r['Storefront Url'],
    })));
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'}));
    a.download = `fulfld_${subset}_${Date.now()}.csv`;
    a.click();
  }, [sorted]);

  const cols = [
    { key:'__score',                label:'Score' },
    { key:'Brand Name',             label:'Brand' },
    { key:'Est. Monthly Revenue',   label:'Revenue' },
    { key:'Sales %',                label:'Amazon %' },
    { key:'Avg. Sellers',           label:'Sellers' },
    { key:'1 Month Growth',         label:'1M Growth' },
    { key:'12 Month Growth',        label:'12M Growth' },
    { key:'Brand Score',            label:'B.Score' },
    { key:'Main Category',          label:'Category' },
  ];

  if (!scoredBrands?.length) return (
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:400, gap:12 }}>
      <div style={{ color:'#475569', fontFamily:"'DM Mono'", fontSize:13 }}>No brands data loaded yet.</div>
      <div style={{ color:'#334155', fontFamily:"'DM Mono'", fontSize:11 }}>Upload a SmartScout Brands CSV to get started.</div>
    </div>
  );

  const startRow = safePage*pageSize+1;
  const endRow   = Math.min((safePage+1)*pageSize, sorted.length);

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display:'flex', gap:10, marginBottom:18, flexWrap:'wrap' }}>
        {[
          { label:'Total Brands',   value:stats.total,    color:'#e2e8f0', glow:null },
          { label:'High Score ≥70', value:stats.high,     color:G,          glow:G },
          { label:'Call-Ready',     value:stats.callReady,color:G,          glow:G },
          { label:'Low Amazon %',   value:stats.lowAmz,   color:B,          glow:B },
          { label:'Growing 1M',     value:stats.growing,  color:'#ffd166',  glow:'#ffd166' },
        ].map((s,i) => (
          <div key={i} style={{ background:CARD, border:`1px solid ${s.glow?s.glow+'20':BORDER}`, borderRadius:12, padding:'14px 20px', flex:'1 1 120px', minWidth:100, backdropFilter:'blur(8px)', boxShadow:s.glow?`0 0 20px ${s.glow}10`:'none' }}>
            <div style={{ color:'#475569', fontSize:9, fontFamily:"'DM Mono'", marginBottom:5, textTransform:'uppercase', letterSpacing:'0.08em' }}>{s.label}</div>
            <div style={{ fontSize:26, fontWeight:800, color:s.color, fontFamily:"'Syne'", textShadow:s.glow?`0 0 20px ${s.glow}60`:'none' }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* Status filter tabs */}
      <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' }}>
        {[{ value:'', label:'All', color:'#64748b' }, ...STATUS_OPTIONS].map(tab => {
          const count  = tab.value ? scored.filter(r=>r.__status===tab.value).length : scored.length;
          const active = filters.status===tab.value;
          return (
            <button key={tab.value} onClick={()=>{setFilters(f=>({...f,status:tab.value}));setPage(0);}}
              style={{ display:'inline-flex', alignItems:'center', gap:6, background:active?`${tab.color}15`:CARD, border:`1px solid ${active?tab.color+'60':BORDER}`, borderRadius:9, padding:'6px 14px', cursor:'pointer', color:active?tab.color:'#64748b', fontFamily:"'DM Mono'", fontSize:11, backdropFilter:'blur(8px)' }}>
              {tab.label}
              <span style={{ background:active?`${tab.color}20`:'rgba(255,255,255,0.06)', borderRadius:10, padding:'1px 7px', fontSize:10, color:active?tab.color:'#475569' }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Toolbar */}
      <div style={{ display:'flex', gap:8, marginBottom:14, flexWrap:'wrap', alignItems:'center' }}>
        <div style={{ position:'relative', flex:1, minWidth:180 }}>
          <Search size={13} style={{ position:'absolute', left:11, top:'50%', transform:'translateY(-50%)', color:'#475569' }}/>
          <input placeholder="Search brand name..." value={searchInput} onChange={handleSearchChange} style={inputStyle}/>
        </div>
        <button onClick={()=>setShowFilters(f=>!f)} style={btn(showFilters?'active':'default')}><Filter size={13}/> Filters</button>
        <button onClick={()=>setFilters(f=>({...f,callReadyOnly:!f.callReadyOnly}))} style={btn(filters.callReadyOnly?'active':'default')}>
          <Phone size={13}/> Call-Ready {filters.callReadyOnly?'✓':''}
        </button>
        <button onClick={()=>exportCSV('submitted')} style={btn('green')}><Download size={13}/> Submitted</button>
        <button onClick={()=>exportCSV('contacted')} style={btn('blue')}><Download size={13}/> Contacted</button>
        <button onClick={()=>exportCSV('callReady')} style={btn('default')}><Download size={13}/> High Opp</button>
        <span style={{ color:'#475569', fontSize:12, fontFamily:"'DM Mono'" }}>{filtered.length}/{scored.length}</span>
      </div>

      {/* Filters panel */}
      {showFilters && (
        <div style={{ background:CARD, border:`1px solid ${BORDER}`, borderRadius:12, padding:'16px 20px', marginBottom:14, display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12, backdropFilter:'blur(8px)' }}>
          {[
            { label:'Min Fulfld Score', key:'minScore', min:0, max:100 },
            { label:'Max Amazon %',     key:'maxAmazonPct', min:0, max:100 },
            { label:'Min Revenue ($)',  key:'minRevenue', min:0, max:10000000, step:10000 },
            { label:'Max Sellers',      key:'maxSellers', min:0, max:500 },
            { label:'Min 1M Growth (%)' ,key:'minGrowth', min:-100, max:200 },
          ].map(({label,key,min,max,step=1}) => (
            <div key={key}>
              <label style={{ color:'#475569', fontSize:10, fontFamily:"'DM Mono'", display:'block', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.06em' }}>{label}</label>
              <input type="number" min={min} max={max} step={step} value={filters[key]}
                onChange={e=>{setFilters(f=>({...f,[key]:Number(e.target.value)}));setPage(0);}} style={inputBare}/>
            </div>
          ))}
          <div style={{ display:'flex', alignItems:'flex-end' }}>
            <button onClick={()=>{setFilters(DEFAULT_FILTERS);setSearchInput('');setPage(0);}} style={{...btn('default'),width:'100%',justifyContent:'center'}}>
              <RefreshCw size={12}/> Reset
            </button>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ overflowX:'auto', borderRadius:12, border:`1px solid ${BORDER}`, background:CARD, backdropFilter:'blur(8px)' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${BORDER}` }}>
              {cols.map(c => (
                <th key={c.key} onClick={()=>toggle(c.key)}
                  style={{ padding:'11px 14px', textAlign:'left', cursor:'pointer', color:sort.col===c.key?G:'#334155', fontFamily:"'DM Mono'", fontWeight:400, fontSize:10, whiteSpace:'nowrap', userSelect:'none', letterSpacing:'0.06em', textTransform:'uppercase' }}>
                  <span style={{ display:'inline-flex', alignItems:'center', gap:3 }}>{c.label} <SortIcon col={c.key}/></span>
                </th>
              ))}
              <th style={{ padding:'11px 14px', color:'#334155', fontFamily:"'DM Mono'", fontWeight:400, fontSize:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>Status</th>
              <th style={{ padding:'11px 14px', color:'#334155', fontFamily:"'DM Mono'", fontWeight:400, fontSize:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>Flags</th>
              <th style={{ padding:'11px 14px', color:'#334155', fontFamily:"'DM Mono'", fontWeight:400, fontSize:10, textTransform:'uppercase', letterSpacing:'0.06em' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {paged.map((row, i) => {
              const amzPct = Number(row['Sales %']);
              const rowBg  = row.__status==='submitted'?`${G}06`:row.__status==='denied'?'#ef476f05':'transparent';
              return (
                <tr key={i} style={{ borderBottom:`1px solid rgba(255,255,255,0.03)`, background:rowBg }}
                  onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                  onMouseLeave={e=>e.currentTarget.style.background=rowBg}>
                  <td style={{ padding:'11px 14px', verticalAlign:'middle' }}><ScoreBadge score={row.__score}/></td>
                  <td style={{ padding:'11px 14px', fontWeight:600, color:row.__status==='denied'?'#334155':'#e2e8f0', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', verticalAlign:'middle' }}>
                    {row['Brand Name']||'—'}
                    {row.__isDupe&&<span style={{ marginLeft:6, color:'#ffd166', fontSize:10 }}>↯ dup</span>}
                  </td>
                  <td style={{ padding:'11px 14px', fontFamily:"'DM Mono'", color:row.__status==='denied'?'#334155':'#94a3b8', verticalAlign:'middle' }}>{money(row['Est. Monthly Revenue'])}</td>
                  <td style={{ padding:'11px 14px', fontFamily:"'DM Mono'", color:row.__status==='denied'?'#334155':amzPct>70?'#ef476f':amzPct<30?G:'#ffd166', verticalAlign:'middle' }}>
                    {!isNaN(amzPct)?`${amzPct.toFixed(1)}%`:'—'}
                  </td>
                  <td style={{ padding:'11px 14px', fontFamily:"'DM Mono'", color:'#94a3b8', verticalAlign:'middle' }}>{row['Avg. Sellers']||'—'}</td>
                  <td style={{ padding:'11px 14px', verticalAlign:'middle' }}><GrowthBadge value={row['1 Month Growth']}/></td>
                  <td style={{ padding:'11px 14px', verticalAlign:'middle' }}><GrowthBadge value={row['12 Month Growth']}/></td>
                  <td style={{ padding:'11px 14px', fontFamily:"'DM Mono'", color:'#94a3b8', verticalAlign:'middle' }}>{row['Brand Score']||'—'}</td>
                  <td style={{ padding:'11px 14px', color:'#475569', maxWidth:130, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontSize:11, verticalAlign:'middle' }}>{row['Main Category']||'—'}</td>
                  <td style={{ padding:'11px 14px', verticalAlign:'middle' }}><StatusBadge status={row.__status}/></td>
                  <td style={{ padding:'11px 14px', minWidth:80, verticalAlign:'middle' }}>
                    {row.__isCallReady&&<span title="Call-Ready" style={{ marginRight:5, color:G, fontSize:12 }}>📞</span>}
                    {(row.__rejectReasons||[]).length>0&&<span title={(row.__rejectReasons||[]).join('\n')} style={{ color:'#ef476f', fontSize:12 }}>⚠️</span>}
                  </td>
                  <td style={{ padding:'11px 14px', whiteSpace:'nowrap', verticalAlign:'middle' }}>
                    <div style={{ display:'flex', gap:4, alignItems:'center' }}>
                      <button onClick={()=>onSelectBrand(row)}
                        style={{ background:'transparent', border:`1px solid ${BORDER}`, borderRadius:7, padding:'4px 9px', color:'#475569', cursor:'pointer', fontSize:11, display:'flex', alignItems:'center', gap:4 }}
                        onMouseEnter={e=>{e.currentTarget.style.borderColor=G;e.currentTarget.style.color=G;}}
                        onMouseLeave={e=>{e.currentTarget.style.borderColor=BORDER;e.currentTarget.style.color='#475569';}}>
                        <Eye size={11}/> Analyze
                      </button>
                      {STATUS_OPTIONS.map(s => {
                        const active = row.__status===s.value;
                        return (
                          <button key={s.value} title={s.label}
                            onClick={()=>onStatusChange(row['Brand Name'], active?'':s.value)}
                            style={{ background:active?`${s.color}20`:'transparent', border:`1px solid ${active?s.color:BORDER}`, borderRadius:7, padding:'4px 7px', cursor:'pointer', color:active?s.color:'#475569', display:'flex', alignItems:'center' }}>
                            {s.icon}
                          </button>
                        );
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
            {paged.length===0&&(
              <tr><td colSpan={12} style={{ textAlign:'center', padding:48, color:'#334155', fontFamily:"'DM Mono'" }}>No brands match current filters</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {sorted.length>0&&(
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 2px', flexWrap:'wrap', gap:10 }}>
          <span style={{ color:'#475569', fontFamily:"'DM Mono'", fontSize:11 }}>
            Showing {startRow}–{endRow} of {sorted.length} brands
          </span>
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <button onClick={()=>setPage(0)} disabled={safePage===0} style={{...btn('default'),padding:'5px 8px',opacity:safePage===0?0.3:1}}>«</button>
            <button onClick={()=>setPage(p=>Math.max(0,p-1))} disabled={safePage===0} style={{...btn('default'),padding:'5px 8px',opacity:safePage===0?0.3:1}}>‹</button>
            {Array.from({length:Math.min(7,totalPages)},(_,i)=>{
              let pg = totalPages<=7?i:safePage<4?i:safePage>=totalPages-4?totalPages-7+i:safePage-3+i;
              return <button key={pg} onClick={()=>setPage(pg)} style={{...btn(safePage===pg?'active':'default'),padding:'5px 8px',minWidth:32}}>{pg+1}</button>;
            })}
            <button onClick={()=>setPage(p=>Math.min(totalPages-1,p+1))} disabled={safePage>=totalPages-1} style={{...btn('default'),padding:'5px 8px',opacity:safePage>=totalPages-1?0.3:1}}>›</button>
            <button onClick={()=>setPage(totalPages-1)} disabled={safePage>=totalPages-1} style={{...btn('default'),padding:'5px 8px',opacity:safePage>=totalPages-1?0.3:1}}>»</button>
          </div>
          <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setPage(0);}}
            style={{...inputBare,width:'auto',paddingLeft:8,fontSize:11}}>
            {[50,100,250,500].map(n=><option key={n} value={n}>{n} / page</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
