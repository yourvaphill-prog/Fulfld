import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase, hasSupabase } from '../lib/supabase.js';
import { loadLocalPipeline, saveLocalPipeline } from '../utils/storage.js';

// ── Brand statuses ─────────────────────────────────────────────────────────────
export function useSharedStatuses(userName) {
  const [statuses, setStatuses] = useState(() => loadLocalPipeline());
  const [loading,  setLoading]  = useState(hasSupabase);

  // Initial load from Supabase
  useEffect(() => {
    if (!hasSupabase) return;
    supabase.from('brand_statuses').select('brand_name, status').then(({ data }) => {
      if (data) {
        const map = {};
        data.forEach(r => { map[r.brand_name] = { status: r.status }; });
        setStatuses(map);
        saveLocalPipeline(map);
      }
      setLoading(false);
    });
  }, []);

  // Realtime subscription
  useEffect(() => {
    if (!hasSupabase) return;
    const channel = supabase
      .channel('brand_statuses_changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'brand_statuses' }, payload => {
        const r = payload.new || payload.old;
        if (!r) return;
        setStatuses(prev => {
          const next = { ...prev, [r.brand_name]: { status: r.status || '' } };
          saveLocalPipeline(next);
          return next;
        });
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, []);

  const updateStatus = useCallback(async (brandName, newStatus) => {
    // Optimistic update first so UI feels instant
    setStatuses(prev => {
      const next = { ...prev, [brandName]: { status: newStatus } };
      saveLocalPipeline(next);
      return next;
    });
    if (!hasSupabase || !userName) {
      console.warn('[updateStatus] skipped — hasSupabase:', hasSupabase, 'userName:', userName);
      return;
    }
    console.log('[updateStatus] upserting to brand_statuses:', { brand_name: brandName, status: newStatus, updated_by: userName });
    const { error } = await supabase
      .from('brand_statuses')
      .upsert(
        { brand_name: brandName, status: newStatus, updated_by: userName, updated_at: new Date().toISOString() },
        { onConflict: 'brand_name' }
      );
    if (error) {
      console.error('[updateStatus] Supabase upsert FAILED:', error.message, error);
    } else {
      console.log('[updateStatus] Supabase upsert OK — brand:', brandName, 'status:', newStatus);
    }
  }, [userName]);

  return { statuses, loading, updateStatus };
}

// ── Notes per brand ────────────────────────────────────────────────────────────
export function useBrandNotes(brandName) {
  const [notes,   setNotes]   = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!hasSupabase || !brandName) return;
    setLoading(true);
    supabase.from('brand_notes').select('*').eq('brand_name', brandName).order('created_at', { ascending: false }).then(({ data }) => {
      setNotes(data || []);
      setLoading(false);
    });
  }, [brandName]);

  // Realtime for this brand's notes
  useEffect(() => {
    if (!hasSupabase || !brandName) return;
    const channel = supabase
      .channel(`notes_${brandName}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'brand_notes', filter: `brand_name=eq.${brandName}` }, payload => {
        setNotes(prev => [payload.new, ...prev]);
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [brandName]);

  const addNote = useCallback(async (note, userName) => {
    if (!hasSupabase || !note.trim() || !userName) return;
    await supabase.from('brand_notes').insert({ brand_name: brandName, note: note.trim(), created_by: userName });
  }, [brandName]);

  return { notes, loading, addNote };
}

// ── Activity feed ──────────────────────────────────────────────────────────────
export function useActivityFeed() {
  const [feed, setFeed] = useState([]);

  // Initial fetch — merge with any realtime events already in state
  useEffect(() => {
    if (!hasSupabase) return;
    console.log('[ActivityFeed] fetching initial feed...');
    supabase
      .from('activity_feed')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        console.log('[ActivityFeed] initial fetch result:', { count: data?.length, error: error?.message });
        if (!error && data) {
          setFeed(prev => {
            const dbIds = new Set(data.map(r => r.id));
            const realtimeOnly = prev.filter(r => !dbIds.has(r.id));
            return [...realtimeOnly, ...data]
              .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
              .slice(0, 50);
          });
        }
      });
  }, []);

  // Realtime subscription — separate effect so it never races with initial fetch
  useEffect(() => {
    if (!hasSupabase) return;
    const channel = supabase
      .channel('activity_feed_changes')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_feed' }, payload => {
        console.log('[ActivityFeed] realtime INSERT received:', payload.new);
        setFeed(prev => [payload.new, ...prev].slice(0, 50));
      })
      .subscribe((status) => {
        console.log('[ActivityFeed] realtime subscription status:', status);
      });
    return () => supabase.removeChannel(channel);
  }, []);

  const logActivity = useCallback(async (brandName, actionType, userName) => {
    if (!hasSupabase || !userName) {
      console.warn('[logActivity] skipped — hasSupabase:', hasSupabase, 'userName:', userName);
      return;
    }
    console.log('[logActivity] inserting to activity_feed:', { brand_name: brandName, action_type: actionType, user_name: userName });
    const { error } = await supabase.from('activity_feed').insert({ brand_name: brandName, action_type: actionType, user_name: userName });
    if (error) {
      console.error('[logActivity] Supabase insert FAILED:', error.message, error);
    } else {
      console.log('[logActivity] Supabase insert OK');
    }
  }, []);

  return { feed, logActivity };
}

// ── Online presence ────────────────────────────────────────────────────────────
const HEARTBEAT_INTERVAL = 30_000;

export function useOnlinePresence(userName) {
  const [onlineUsers, setOnlineUsers] = useState([]);
  const timerRef = useRef(null);

  const heartbeat = useCallback(async () => {
    if (!hasSupabase || !userName) return;
    await supabase.from('online_presence').upsert({ user_name: userName, last_seen: new Date().toISOString() }, { onConflict: 'user_name' });
  }, [userName]);

  useEffect(() => {
    if (!hasSupabase || !userName) return;
    heartbeat();
    timerRef.current = setInterval(heartbeat, HEARTBEAT_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [heartbeat, userName]);

  useEffect(() => {
    if (!hasSupabase) return;
    const fetch = () => {
      const cutoff = new Date(Date.now() - 2 * 60_000).toISOString();
      supabase.from('online_presence').select('user_name').gte('last_seen', cutoff).then(({ data }) => {
        setOnlineUsers((data || []).map(r => r.user_name));
      });
    };
    fetch();
    const id = setInterval(fetch, 20_000);
    return () => clearInterval(id);
  }, []);

  return { onlineUsers };
}

// ── Synced CSV datasets ────────────────────────────────────────────────────────
// Persists uploaded CSV data in Supabase so all team members share the same
// brand data. onTypeLoaded(type, rows[]) is called for each loaded dataset.
export function useSyncedDatasets(onTypeLoaded) {
  const [syncing, setSyncing] = useState(false);
  // Always hold the latest callback in a ref to avoid stale closure in the effect
  const cbRef = useRef(onTypeLoaded);
  cbRef.current = onTypeLoaded;

  useEffect(() => {
    if (!hasSupabase) return;

    // ── Initial fetch ──
    supabase
      .from('csv_datasets')
      .select('type, data, uploaded_at')
      .then(({ data, error }) => {
        if (error || !data) return;
        data.forEach(row => {
          if (row.type && Array.isArray(row.data)) {
            cbRef.current(row.type, row.data);
          }
        });
      });

    // ── Realtime ── (refetch on change to avoid large payload issues)
    const channel = supabase
      .channel('csv_datasets_changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'csv_datasets' },
        async (payload) => {
          const type = payload.new?.type || payload.old?.type;
          if (!type) return;
          const { data, error } = await supabase
            .from('csv_datasets')
            .select('type, data')
            .eq('type', type)
            .single();
          if (!error && data && Array.isArray(data.data)) {
            cbRef.current(data.type, data.data);
          }
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, []); // mount once only

  const uploadDataset = useCallback(async (type, rows, userName) => {
    if (!hasSupabase || !type || !Array.isArray(rows)) return;
    setSyncing(true);
    try {
      await supabase.from('csv_datasets').upsert(
        {
          type,
          data:        rows,
          row_count:   rows.length,
          uploaded_by: userName || 'unknown',
          uploaded_at: new Date().toISOString(),
        },
        { onConflict: 'type' }
      );
    } catch (e) {
      console.warn('[useSyncedDatasets] upload failed:', e);
    }
    setSyncing(false);
  }, []);

  return { syncing, uploadDataset };
}
