import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, hasSupabase } from '../lib/supabase.js';
import { COLORS, FONT, MONO, TRANSITION, ACCENTS, ACCENT_RGB } from '../theme/tokens.js';
import { RefreshCw, Plus, ChevronLeft } from 'lucide-react';
import { TEMPLATES, TEMPLATE_NAMES, TASK_STATUSES, PROJECT_STATUSES } from './templates.js';

// ── Constants ──────────────────────────────────────────────────────────────────
const ACCENT   = ACCENTS.checklist;
const ACCENT_R = ACCENT_RGB.checklist;
const TEAM     = ['', 'Phillip', 'Johan', 'Cesar', 'Pat', 'King', 'Other'];

const STATUS_STYLE = {
  'Not Started': { color: '#64748b', bg: 'rgba(100,116,139,0.12)' },
  'In Progress': { color: '#4F8CC9', bg: 'rgba(79,140,201,0.14)'  },
  'Done':        { color: '#3FB67E', bg: 'rgba(63,182,126,0.14)'  },
  'Blocked':     { color: '#f87171', bg: 'rgba(248,113,113,0.14)' },
  'Pass':        { color: '#4ade80', bg: 'rgba(74,222,128,0.12)'  },
  'Stop':        { color: '#fb923c', bg: 'rgba(251,146,60,0.12)'  },
};

const PROJECT_STATUS_COLOR = {
  'Active':    '#4F8CC9',
  'Completed': '#3FB67E',
  'Passed':    '#4ade80',
  'Stopped':   '#fb923c',
  'Archived':  '#475569',
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function addDays(dateStr, days) {
  if (!dateStr || days == null) return null;
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtDate(s) {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${m}/${d}/${y.slice(2)}`;
}

function isOverdue(task) {
  if (!task.target_date) return false;
  if (['Done', 'Pass', 'Stop'].includes(task.status)) return false;
  return task.target_date < todayStr();
}

function calcProgress(tasks) {
  if (!tasks?.length) return 0;
  return Math.round(
    tasks.filter(t => t.status === 'Done' || t.status === 'Pass').length / tasks.length * 100
  );
}

// ── Data hook ─────────────────────────────────────────────────────────────────
function useChecklistData() {
  const [projects, setProjects] = useState([]);
  const [taskMap,  setTaskMap]  = useState({}); // { [project_id]: Task[] }
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState(null);

  const fetchAll = useCallback(async () => {
    if (!hasSupabase) return;
    setLoading(true);
    setError(null);
    try {
      const [pRes, tRes] = await Promise.all([
        supabase.from('checklist_projects').select('*').order('created_at', { ascending: false }),
        supabase.from('checklist_tasks').select('*').order('sort_order', { ascending: true }),
      ]);
      if (pRes.error) throw pRes.error;
      if (tRes.error) throw tRes.error;
      setProjects(pRes.data || []);
      const map = {};
      (tRes.data || []).forEach(t => {
        if (!map[t.project_id]) map[t.project_id] = [];
        map[t.project_id].push(t);
      });
      setTaskMap(map);
    } catch (e) {
      setError(e.message);
    }
    setLoading(false);
  }, []);

  // Initial fetch
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Realtime — subscribe to both tables in one channel
  useEffect(() => {
    if (!hasSupabase) return;
    const channel = supabase
      .channel('checklist_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_projects' }, () => fetchAll())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'checklist_tasks' },    () => fetchAll())
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [fetchAll]);

  // Create project + tasks from template
  const createProject = useCallback(async (form) => {
    const steps    = TEMPLATES[form.template_type] || [];
    const taskRows = steps.map((s, i) => ({
      step_title:         s.step_title,
      target_day_label:   s.target_day_label,
      target_offset_days: s.target_offset_days,
      target_date:        (form.start_date && s.target_offset_days != null)
                            ? addDays(form.start_date, s.target_offset_days)
                            : null,
      hard_stop:     s.hard_stop,
      status:        'Not Started',
      owner:         '',
      completed_date: null,
      notes:         '',
      sort_order:    i,
    }));

    if (!hasSupabase) {
      // Local-only fallback
      const id   = crypto.randomUUID();
      const proj = {
        id, ...form, project_status: 'Active',
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      };
      const tasks = taskRows.map(r => ({
        ...r, id: crypto.randomUUID(), project_id: id,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }));
      setProjects(prev => [proj, ...prev]);
      setTaskMap(prev => ({ ...prev, [id]: tasks }));
      return proj;
    }

    const { data: proj, error: pErr } = await supabase
      .from('checklist_projects')
      .insert({ ...form, project_status: 'Active' })
      .select()
      .single();
    if (pErr) throw pErr;

    if (taskRows.length) {
      const { error: tErr } = await supabase
        .from('checklist_tasks')
        .insert(taskRows.map(r => ({ ...r, project_id: proj.id })));
      if (tErr) throw tErr;
    }

    await fetchAll();
    return proj;
  }, [fetchAll]);

  // Update a single task — optimistic first, then sync
  const updateTask = useCallback(async (taskId, updates) => {
    setTaskMap(prev => {
      const next = {};
      for (const pid of Object.keys(prev)) {
        next[pid] = prev[pid].map(t => t.id === taskId ? { ...t, ...updates } : t);
      }
      return next;
    });
    if (!hasSupabase) return;
    const { error: e } = await supabase
      .from('checklist_tasks')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', taskId);
    if (e) console.error('[updateTask]', e.message);
  }, []);

  // Update project fields — optimistic first
  const updateProject = useCallback(async (projectId, updates) => {
    setProjects(prev => prev.map(p => p.id === projectId ? { ...p, ...updates } : p));
    if (!hasSupabase) return;
    const { error: e } = await supabase
      .from('checklist_projects')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', projectId);
    if (e) console.error('[updateProject]', e.message);
  }, []);

  // Delete project (cascade deletes tasks via FK)
  const deleteProject = useCallback(async (projectId) => {
    setProjects(prev => prev.filter(p => p.id !== projectId));
    setTaskMap(prev => { const n = { ...prev }; delete n[projectId]; return n; });
    if (!hasSupabase) return;
    await supabase.from('checklist_projects').delete().eq('id', projectId);
  }, []);

  return { projects, taskMap, loading, error, fetchAll, createProject, updateTask, updateProject, deleteProject };
}

// ── New Project Modal ─────────────────────────────────────────────────────────
function NewProjectModal({ onClose, onCreate }) {
  const [form, setForm] = useState({
    name:          '',
    template_type: TEMPLATE_NAMES[0],
    client:        '',
    owner:         '',
    start_date:    todayStr(),
    notes:         '',
  });
  const [saving, setSaving] = useState(false);
  const [err,    setErr]    = useState('');

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = async () => {
    if (!form.name.trim()) { setErr('Project name is required.'); return; }
    setSaving(true);
    try {
      await onCreate(form);
      onClose();
    } catch (e) {
      setErr(e.message);
      setSaving(false);
    }
  };

  const field = {
    width: '100%', background: COLORS.surfaceInset,
    border: `1px solid ${COLORS.border}`, borderRadius: 6,
    padding: '8px 10px', color: COLORS.text, fontSize: 12,
    fontFamily: FONT, outline: 'none', boxSizing: 'border-box',
  };
  const label = {
    display: 'block', color: COLORS.textDim, fontSize: 10,
    letterSpacing: '0.08em', textTransform: 'uppercase',
    marginBottom: 4, fontFamily: MONO,
  };

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.72)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000, fontFamily: FONT,
      }}
    >
      <div style={{
        background: COLORS.surface, border: `1px solid ${COLORS.borderStrong}`,
        borderRadius: 12, padding: 28, width: 460,
        maxHeight: '90vh', overflowY: 'auto',
        boxShadow: '0 24px 64px rgba(0,0,0,0.7)',
      }}>
        <div style={{ color: COLORS.text, fontSize: 15, fontWeight: 700, marginBottom: 20 }}>
          New Project
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={label}>Project Name *</label>
            <input
              style={field} value={form.name}
              onChange={e => set('name', e.target.value)}
              placeholder="e.g. Acme PPC Launch — June"
              autoFocus
            />
          </div>
          <div>
            <label style={label}>Template</label>
            <select style={field} value={form.template_type} onChange={e => set('template_type', e.target.value)}>
              {TEMPLATE_NAMES.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Client / Brand / Store</label>
            <input style={field} value={form.client} onChange={e => set('client', e.target.value)} placeholder="e.g. Acme Corp" />
          </div>
          <div>
            <label style={label}>Owner</label>
            <select style={field} value={form.owner} onChange={e => set('owner', e.target.value)}>
              {TEAM.map(n => <option key={n} value={n}>{n || '— unassigned —'}</option>)}
            </select>
          </div>
          <div>
            <label style={label}>Start Date</label>
            <input type="date" style={field} value={form.start_date} onChange={e => set('start_date', e.target.value)} />
          </div>
          <div>
            <label style={label}>Notes</label>
            <textarea
              style={{ ...field, height: 72, resize: 'vertical' }}
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              placeholder="Optional notes…"
            />
          </div>
        </div>

        {err && (
          <div style={{ color: '#f87171', fontSize: 11, marginTop: 10 }}>{err}</div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{
            background: 'transparent', border: `1px solid ${COLORS.border}`,
            borderRadius: 6, padding: '7px 16px', color: COLORS.textMuted,
            fontSize: 12, fontFamily: FONT, cursor: 'pointer',
          }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving} style={{
            background: `rgba(${ACCENT_R},0.18)`, border: `1px solid rgba(${ACCENT_R},0.35)`,
            borderRadius: 6, padding: '7px 16px', color: ACCENT,
            fontSize: 12, fontFamily: FONT, cursor: saving ? 'default' : 'pointer', fontWeight: 600,
          }}>
            {saving ? 'Creating…' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Task Row ──────────────────────────────────────────────────────────────────
function TaskRow({ task, onUpdate, rowIndex }) {
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesVal,     setNotesVal]     = useState(task.notes || '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal,     setTitleVal]     = useState(task.step_title || '');
  const overdue = isOverdue(task);
  const sm      = STATUS_STYLE[task.status] || STATUS_STYLE['Not Started'];

  // Sync notesVal if task.notes changes externally (realtime update)
  useEffect(() => {
    if (!editingNotes) setNotesVal(task.notes || '');
  }, [task.notes, editingNotes]);

  // Sync titleVal if step_title changes externally (realtime update)
  useEffect(() => {
    if (!editingTitle) setTitleVal(task.step_title || '');
  }, [task.step_title, editingTitle]);

  const borderLeft =
    task.status === 'Blocked' ? '3px solid rgba(248,113,113,0.7)' :
    task.hard_stop             ? `3px solid rgba(${ACCENT_R},0.55)` :
    '3px solid transparent';

  const rowBg =
    task.status === 'Blocked' ? 'rgba(248,113,113,0.04)' :
    rowIndex % 2 === 1        ? 'rgba(255,255,255,0.015)' :
    'transparent';

  const cellBorder = { borderBottom: `1px solid ${COLORS.border}` };

  return (
    <tr style={{ background: rowBg, borderLeft }}>
      {/* Step Title — inline editable */}
      <td style={{ ...cellBorder, padding: '9px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {task.hard_stop && (
            <span title="Hard Stop — project must not proceed past this step until complete" style={{ fontSize: 12, lineHeight: 1, flexShrink: 0 }}>🛑</span>
          )}
          {editingTitle ? (
            <input
              autoFocus
              value={titleVal}
              onChange={e => setTitleVal(e.target.value)}
              onBlur={() => {
                const v = titleVal.trim();
                if (v && v !== task.step_title) onUpdate(task.id, { step_title: v });
                else setTitleVal(task.step_title || '');
                setEditingTitle(false);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.target.blur(); }
                if (e.key === 'Escape') { setTitleVal(task.step_title || ''); setEditingTitle(false); }
              }}
              style={{
                background: COLORS.surfaceInset, border: `1px solid ${COLORS.border}`,
                borderRadius: 4, color: COLORS.text, fontSize: 12,
                fontFamily: FONT, padding: '2px 6px', outline: 'none',
                width: '100%', boxSizing: 'border-box',
              }}
            />
          ) : (
            <span
              onClick={() => { setTitleVal(task.step_title || ''); setEditingTitle(true); }}
              title="Click to rename"
              style={{ color: COLORS.text, fontSize: 12, cursor: 'text', flex: 1 }}
            >
              {task.step_title}
            </span>
          )}
          {overdue && !editingTitle && (
            <span style={{
              color: '#f87171', fontSize: 9, fontFamily: MONO,
              background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)',
              borderRadius: 3, padding: '1px 5px', flexShrink: 0,
            }}>
              OVERDUE
            </span>
          )}
        </div>
      </td>

      {/* Owner */}
      <td style={{ ...cellBorder, padding: '9px 8px' }}>
        <select
          value={task.owner || ''}
          onChange={e => onUpdate(task.id, { owner: e.target.value })}
          style={{
            background: 'transparent', border: 'none',
            color: task.owner ? COLORS.textMuted : COLORS.textDim,
            fontSize: 11, fontFamily: FONT, cursor: 'pointer', outline: 'none', width: '100%',
          }}
        >
          {TEAM.map(n => <option key={n} value={n}>{n || '—'}</option>)}
        </select>
      </td>

      {/* Day Label */}
      <td style={{ ...cellBorder, padding: '9px 8px', color: COLORS.textDim, fontSize: 11, fontFamily: MONO, whiteSpace: 'nowrap' }}>
        {task.target_day_label || '—'}
      </td>

      {/* Target Date */}
      <td style={{ ...cellBorder, padding: '9px 8px' }}>
        <input
          type="date"
          value={task.target_date || ''}
          onChange={e => onUpdate(task.id, { target_date: e.target.value || null })}
          style={{
            background: 'transparent', border: 'none',
            color: overdue ? '#f87171' : COLORS.textMuted,
            fontSize: 11, fontFamily: FONT, cursor: 'pointer', outline: 'none',
          }}
        />
      </td>

      {/* Status */}
      <td style={{ ...cellBorder, padding: '9px 8px' }}>
        <select
          value={task.status}
          onChange={e => {
            const s = e.target.value;
            const updates = { status: s };
            if (['Done', 'Pass', 'Stop'].includes(s) && !task.completed_date) {
              updates.completed_date = todayStr();
            }
            onUpdate(task.id, updates);
          }}
          style={{
            background: sm.bg, border: `1px solid ${sm.color}50`,
            borderRadius: 5, color: sm.color, fontSize: 11,
            fontFamily: FONT, cursor: 'pointer', outline: 'none', padding: '3px 6px', fontWeight: 600,
          }}
        >
          {TASK_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </td>

      {/* Completed Date */}
      <td style={{ ...cellBorder, padding: '9px 8px' }}>
        <input
          type="date"
          value={task.completed_date || ''}
          onChange={e => onUpdate(task.id, { completed_date: e.target.value || null })}
          style={{
            background: 'transparent', border: 'none',
            color: COLORS.textMuted, fontSize: 11,
            fontFamily: FONT, cursor: 'pointer', outline: 'none',
          }}
        />
      </td>

      {/* Notes */}
      <td style={{ ...cellBorder, padding: '9px 8px' }}>
        {editingNotes ? (
          <textarea
            autoFocus
            value={notesVal}
            onChange={e => setNotesVal(e.target.value)}
            onBlur={() => { onUpdate(task.id, { notes: notesVal }); setEditingNotes(false); }}
            style={{
              background: COLORS.surfaceInset, border: `1px solid ${COLORS.border}`,
              borderRadius: 4, color: COLORS.text, fontSize: 11,
              fontFamily: FONT, width: '100%', minHeight: 52,
              padding: '4px 6px', outline: 'none', resize: 'vertical', boxSizing: 'border-box',
            }}
          />
        ) : (
          <div
            onClick={() => { setNotesVal(task.notes || ''); setEditingNotes(true); }}
            title="Click to edit"
            style={{
              color: task.notes ? COLORS.textMuted : '#334155',
              fontSize: 11, cursor: 'text', minHeight: 20,
              whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}
          >
            {task.notes || <span style={{ fontStyle: 'italic', opacity: 0.5 }}>Add note…</span>}
          </div>
        )}
      </td>
    </tr>
  );
}

// ── Project Card ──────────────────────────────────────────────────────────────
function ProjectCard({ project, tasks, onSelect }) {
  const [hov, setHov] = useState(false);
  const pct            = calcProgress(tasks);
  const overdueCnt     = tasks.filter(isOverdue).length;
  const blockedCnt     = tasks.filter(t => t.status === 'Blocked').length;
  const hardStopCnt    = tasks.filter(t => t.hard_stop && !['Done', 'Pass', 'Stop'].includes(t.status)).length;
  const sc             = PROJECT_STATUS_COLOR[project.project_status] || '#475569';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect(project.id)}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(project.id); } }}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        position: 'relative',
        background: hov ? COLORS.surfaceHover : COLORS.surface,
        border: `1px solid ${hov ? COLORS.borderStrong : COLORS.border}`,
        borderLeft: `3px solid ${hov ? ACCENT : `rgba(${ACCENT_R},0.45)`}`,
        borderRadius: 10,
        padding: '15px 18px',
        cursor: 'pointer',
        transition: TRANSITION,
        outline: 'none', userSelect: 'none',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: COLORS.text, fontSize: 14, fontWeight: 600, marginBottom: 2 }}>
            {project.name}
          </div>
          <div style={{ color: COLORS.textDim, fontSize: 11, fontFamily: MONO }}>
            {project.template_type}
            {project.client && ` · ${project.client}`}
            {project.owner  && ` · ${project.owner}`}
            {project.start_date && ` · Started ${fmtDate(project.start_date)}`}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{
            fontSize: 10, padding: '2px 8px', borderRadius: 4, fontWeight: 600,
            color: sc, background: `${sc}1A`, border: `1px solid ${sc}35`,
            fontFamily: MONO, letterSpacing: '0.04em',
          }}>
            {project.project_status}
          </span>
          <span style={{ color: hov ? ACCENT : COLORS.textDim, fontSize: 14, fontWeight: 700, transition: 'color 140ms ease' }}>→</span>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
        <div style={{ flex: 1, height: 4, background: COLORS.surfaceInset, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{
            width: `${pct}%`, height: '100%',
            background: pct === 100 ? '#3FB67E' : ACCENT,
            borderRadius: 2, transition: 'width 300ms ease',
          }} />
        </div>
        <span style={{ color: COLORS.textDim, fontSize: 11, fontFamily: MONO, flexShrink: 0 }}>{pct}%</span>
        <span style={{ color: COLORS.textDim, fontSize: 11 }}>{tasks.length} tasks</span>
      </div>

      {/* Alert chips */}
      {(overdueCnt > 0 || blockedCnt > 0 || hardStopCnt > 0) && (
        <div style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
          {overdueCnt > 0 && (
            <span style={{ fontSize: 10, color: '#f87171', background: 'rgba(248,113,113,0.1)', border: '1px solid rgba(248,113,113,0.22)', borderRadius: 4, padding: '2px 7px' }}>
              ⚠ {overdueCnt} overdue
            </span>
          )}
          {blockedCnt > 0 && (
            <span style={{ fontSize: 10, color: '#fb923c', background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.22)', borderRadius: 4, padding: '2px 7px' }}>
              ✕ {blockedCnt} blocked
            </span>
          )}
          {hardStopCnt > 0 && (
            <span style={{ fontSize: 10, color: ACCENT, background: `rgba(${ACCENT_R},0.1)`, border: `1px solid rgba(${ACCENT_R},0.22)`, borderRadius: 4, padding: '2px 7px' }}>
              🛑 {hardStopCnt} hard stop{hardStopCnt > 1 ? 's' : ''} pending
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ── Project Detail View ───────────────────────────────────────────────────────
function ProjectDetailView({ project, tasks, onBack, onUpdateTask, onUpdateProject, onDeleteProject }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const pct        = calcProgress(tasks);
  const overdueCnt = tasks.filter(isOverdue).length;
  const blockedCnt = tasks.filter(t => t.status === 'Blocked').length;
  const sc         = PROJECT_STATUS_COLOR[project.project_status] || '#475569';

  const TH = ({ children, w }) => (
    <th style={{
      padding: '8px 10px', color: COLORS.textDim, fontSize: 10,
      letterSpacing: '0.08em', textTransform: 'uppercase', fontFamily: MONO,
      fontWeight: 600, borderBottom: `1px solid ${COLORS.border}`,
      textAlign: 'left', whiteSpace: 'nowrap', width: w,
      background: COLORS.surface,
    }}>
      {children}
    </th>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Project header bar */}
      <div style={{
        background: COLORS.surface, borderBottom: `1px solid ${COLORS.border}`,
        padding: '12px 20px', flexShrink: 0,
      }}>
        {/* Row 1: back + name + controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <button
            onClick={onBack}
            style={{
              background: 'transparent', border: `1px solid ${COLORS.border}`,
              borderRadius: 6, padding: '4px 10px', color: COLORS.textMuted,
              fontSize: 11, fontFamily: FONT, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            <ChevronLeft size={12} /> Projects
          </button>

          <div style={{ color: COLORS.text, fontSize: 15, fontWeight: 700 }}>{project.name}</div>

          <div style={{ flex: 1 }} />

          {/* Project status selector */}
          <select
            value={project.project_status}
            onChange={e => onUpdateProject(project.id, { project_status: e.target.value })}
            style={{
              background: `${sc}1A`, border: `1px solid ${sc}35`,
              borderRadius: 5, color: sc, fontSize: 11,
              fontFamily: FONT, cursor: 'pointer', outline: 'none',
              padding: '4px 8px', fontWeight: 600,
            }}
          >
            {PROJECT_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>

          {/* Delete */}
          {!confirmDelete ? (
            <button
              onClick={() => setConfirmDelete(true)}
              style={{
                background: 'transparent', border: '1px solid rgba(248,113,113,0.22)',
                borderRadius: 6, padding: '4px 10px', color: '#f87171',
                fontSize: 11, fontFamily: FONT, cursor: 'pointer',
              }}
            >
              Delete
            </button>
          ) : (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ color: '#f87171', fontSize: 11 }}>Sure?</span>
              <button
                onClick={() => onDeleteProject(project.id)}
                style={{ background: 'rgba(248,113,113,0.15)', border: '1px solid rgba(248,113,113,0.3)', borderRadius: 6, padding: '4px 10px', color: '#f87171', fontSize: 11, fontFamily: FONT, cursor: 'pointer' }}
              >
                Yes, delete
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ background: 'transparent', border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: '4px 10px', color: COLORS.textMuted, fontSize: 11, fontFamily: FONT, cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Row 2: meta + progress */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
          {project.template_type && (
            <span style={{ color: COLORS.textDim, fontSize: 11, fontFamily: MONO }}>{project.template_type}</span>
          )}
          {project.client && (
            <span style={{ color: COLORS.textMuted, fontSize: 11 }}>Client: <strong style={{ color: COLORS.text }}>{project.client}</strong></span>
          )}
          {project.owner && (
            <span style={{ color: COLORS.textMuted, fontSize: 11 }}>Owner: <strong style={{ color: COLORS.text }}>{project.owner}</strong></span>
          )}
          {project.start_date && (
            <span style={{ color: COLORS.textMuted, fontSize: 11 }}>Start: {fmtDate(project.start_date)}</span>
          )}

          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
            {overdueCnt > 0 && <span style={{ fontSize: 10, color: '#f87171' }}>⚠ {overdueCnt} overdue</span>}
            {blockedCnt > 0 && <span style={{ fontSize: 10, color: '#fb923c' }}>✕ {blockedCnt} blocked</span>}
            <div style={{ width: 110, height: 4, background: COLORS.surfaceInset, borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${pct}%`, height: '100%', background: pct === 100 ? '#3FB67E' : ACCENT, borderRadius: 2 }} />
            </div>
            <span style={{ color: COLORS.textDim, fontSize: 11, fontFamily: MONO }}>{pct}%</span>
          </div>
        </div>
      </div>

      {/* Notes banner (if project has notes) */}
      {project.notes && (
        <div style={{
          background: `rgba(${ACCENT_R},0.06)`, borderBottom: `1px solid rgba(${ACCENT_R},0.18)`,
          padding: '8px 20px', color: COLORS.textMuted, fontSize: 11, flexShrink: 0,
        }}>
          <span style={{ color: COLORS.textDim, fontFamily: MONO, fontSize: 10, marginRight: 8 }}>NOTES</span>
          {project.notes}
        </div>
      )}

      {/* Task table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <colgroup>
            <col style={{ width: '26%' }} />
            <col style={{ width: '9%' }}  />
            <col style={{ width: '8%' }}  />
            <col style={{ width: '11%' }} />
            <col style={{ width: '13%' }} />
            <col style={{ width: '11%' }} />
            <col />
          </colgroup>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              <TH>Step</TH>
              <TH>Owner</TH>
              <TH>Day</TH>
              <TH>Target Date</TH>
              <TH>Status</TH>
              <TH>Completed</TH>
              <TH>Notes</TH>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task, i) => (
              <TaskRow key={task.id} task={task} onUpdate={onUpdateTask} rowIndex={i} />
            ))}
            {tasks.length === 0 && (
              <tr>
                <td colSpan={7} style={{ padding: '48px 20px', color: COLORS.textDim, fontSize: 12, textAlign: 'center' }}>
                  No tasks in this project.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
export default function ChecklistApp({ onSwitchModule, userName }) {
  const {
    projects, taskMap, loading, error,
    fetchAll, createProject, updateTask, updateProject, deleteProject,
  } = useChecklistData();

  const [selectedId, setSelectedId] = useState(null);
  const [showForm,   setShowForm]   = useState(false);
  const [filter,     setFilter]     = useState('Active');

  const selectedProject = projects.find(p => p.id === selectedId) || null;
  const selectedTasks   = (selectedId && taskMap[selectedId]) || [];

  // Clear selection if the project was deleted
  useEffect(() => {
    if (selectedId && !projects.find(p => p.id === selectedId)) {
      setSelectedId(null);
    }
  }, [projects, selectedId]);

  const visibleProjects = projects.filter(p => {
    if (filter === 'All')      return true;
    if (filter === 'Archived') return p.project_status === 'Archived';
    return p.project_status !== 'Archived';
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', fontFamily: FONT, background: COLORS.bg }}>

      {/* ── Header ── */}
      <div style={{
        height: 52, background: COLORS.surface,
        borderBottom: `1px solid ${COLORS.border}`,
        display: 'flex', alignItems: 'center',
        padding: '0 20px', gap: 10, flexShrink: 0,
      }}>
        <span style={{
          color: ACCENT, fontSize: 10, letterSpacing: '0.12em',
          textTransform: 'uppercase', fontFamily: MONO, fontWeight: 600,
        }}>
          Project Checklist
        </span>
        <span style={{ color: COLORS.border, fontSize: 12 }}>|</span>
        <span style={{ color: COLORS.textDim, fontSize: 11, fontFamily: MONO }}>SOP Tracker</span>

        <div style={{ flex: 1 }} />

        {/* Local-only warning */}
        {!hasSupabase && (
          <span style={{
            fontSize: 10, color: '#fb923c', fontFamily: MONO,
            background: 'rgba(251,146,60,0.1)', border: '1px solid rgba(251,146,60,0.25)',
            borderRadius: 4, padding: '3px 10px',
          }}>
            ⚠ Local mode only — changes are not shared with other users
          </span>
        )}

        {/* Refresh */}
        <button
          onClick={fetchAll}
          disabled={loading}
          title="Refresh from Supabase"
          style={{
            background: 'transparent', border: `1px solid ${COLORS.border}`,
            borderRadius: 6, padding: '5px 10px', color: COLORS.textMuted,
            cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.5 : 1,
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 11, fontFamily: FONT, transition: TRANSITION,
          }}
        >
          <RefreshCw size={11} className={loading ? 'cl-spin' : ''} />
          {loading ? 'Loading…' : 'Refresh'}
        </button>

        {/* New project — only in list view */}
        {!selectedId && (
          <button
            onClick={() => setShowForm(true)}
            style={{
              background: `rgba(${ACCENT_R},0.15)`, border: `1px solid rgba(${ACCENT_R},0.32)`,
              borderRadius: 6, padding: '5px 12px', color: ACCENT,
              fontSize: 11, fontFamily: FONT, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 5, fontWeight: 600,
            }}
          >
            <Plus size={12} /> New Project
          </button>
        )}
      </div>

      {/* ── Content ── */}
      {selectedProject ? (
        <ProjectDetailView
          project={selectedProject}
          tasks={selectedTasks}
          onBack={() => setSelectedId(null)}
          onUpdateTask={updateTask}
          onUpdateProject={updateProject}
          onDeleteProject={id => { deleteProject(id); setSelectedId(null); }}
        />
      ) : (
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>

          {/* Filter tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 16 }}>
            {['Active', 'All', 'Archived'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                style={{
                  background: filter === f ? `rgba(${ACCENT_R},0.14)` : 'transparent',
                  border:     `1px solid ${filter === f ? `rgba(${ACCENT_R},0.3)` : COLORS.border}`,
                  borderRadius: 6, padding: '4px 12px',
                  color:    filter === f ? ACCENT : COLORS.textDim,
                  fontSize: 11, fontFamily: FONT, cursor: 'pointer',
                  transition: TRANSITION,
                }}
              >
                {f}
              </button>
            ))}
            <span style={{ color: COLORS.textDim, fontSize: 11, marginLeft: 8 }}>
              {visibleProjects.length} project{visibleProjects.length !== 1 ? 's' : ''}
            </span>
          </div>

          {/* Error */}
          {error && (
            <div style={{
              color: '#f87171', fontSize: 12, marginBottom: 14,
              padding: '8px 14px', background: 'rgba(248,113,113,0.08)',
              borderRadius: 6, border: '1px solid rgba(248,113,113,0.2)',
            }}>
              Error loading data: {error}
            </div>
          )}

          {/* Loading skeleton */}
          {loading && projects.length === 0 && (
            <div style={{ color: COLORS.textDim, fontSize: 12, padding: '48px 0', textAlign: 'center' }}>
              Loading projects…
            </div>
          )}

          {/* Empty state */}
          {!loading && visibleProjects.length === 0 && (
            <div style={{
              color: COLORS.textDim, fontSize: 12, padding: '56px 0',
              textAlign: 'center', lineHeight: 1.8,
            }}>
              No {filter !== 'All' ? filter.toLowerCase() + ' ' : ''}projects yet.
              {' '}
              <span
                onClick={() => setShowForm(true)}
                style={{ color: ACCENT, cursor: 'pointer', textDecoration: 'underline' }}
              >
                Create one
              </span>
            </div>
          )}

          {/* Project cards */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {visibleProjects.map(p => (
              <ProjectCard
                key={p.id}
                project={p}
                tasks={taskMap[p.id] || []}
                onSelect={setSelectedId}
              />
            ))}
          </div>
        </div>
      )}

      {/* New project modal */}
      {showForm && (
        <NewProjectModal
          onClose={() => setShowForm(false)}
          onCreate={createProject}
        />
      )}

      {/* Spin animation for refresh icon */}
      <style>{`
        .cl-spin { animation: cl-spin 1s linear infinite; }
        @keyframes cl-spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
