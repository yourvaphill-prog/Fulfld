# Fulfld Brand Scout — Web App Setup

## Quick Start (Local, No Backend)

```bash
cd fulfld-brand-scout-web
npm install
npm run dev
```

The app works fully offline with local-only state (no Supabase required).  
CSV data is saved to IndexedDB and persists across browser refreshes.

---

## Supabase Setup (Shared Team Features)

Supabase enables: shared brand statuses, team notes, activity feed, online presence indicators.

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com) → New Project.

### 2. Run this SQL in the Supabase SQL Editor

```sql
-- Shared brand statuses (one row per brand, upserted on change)
create table brand_statuses (
  brand_name   text primary key,
  status       text,
  updated_by   text,
  updated_at   timestamptz default now()
);

-- Per-brand team notes
create table brand_notes (
  id           uuid primary key default gen_random_uuid(),
  brand_name   text not null,
  note         text not null,
  created_by   text,
  created_at   timestamptz default now()
);

-- Activity feed (last 50 events shown in sidebar)
create table activity_feed (
  id           uuid primary key default gen_random_uuid(),
  brand_name   text,
  action_type  text,
  user_name    text,
  created_at   timestamptz default now()
);

-- Online presence heartbeat (30-second ping per user)
create table online_presence (
  user_name    text primary key,
  last_seen    timestamptz default now()
);

-- Shared CSV datasets — one row per type (brands/products/adspy/etc.)
-- Uploading a CSV via the app automatically syncs it to all other users.
create table csv_datasets (
  type         text primary key,       -- 'brands' | 'products' | 'sellers' | 'adspy' | 'subcategories'
  data         jsonb not null default '[]',
  row_count    integer default 0,
  uploaded_by  text,
  uploaded_at  timestamptz default now()
);

-- Enable realtime on all tables
alter publication supabase_realtime add table brand_statuses;
alter publication supabase_realtime add table brand_notes;
alter publication supabase_realtime add table activity_feed;
alter publication supabase_realtime add table online_presence;
alter publication supabase_realtime add table csv_datasets;
```

### 3. Enable Row Level Security (RLS) — run all at once

```sql
-- Enable RLS
alter table brand_statuses  enable row level security;
alter table brand_notes     enable row level security;
alter table activity_feed   enable row level security;
alter table online_presence enable row level security;
alter table csv_datasets    enable row level security;

-- Allow full anonymous access (suitable for internal team tools)
create policy "anon_all" on brand_statuses  for all using (true) with check (true);
create policy "anon_all" on brand_notes     for all using (true) with check (true);
create policy "anon_all" on activity_feed   for all using (true) with check (true);
create policy "anon_all" on online_presence for all using (true) with check (true);
create policy "anon_all" on csv_datasets    for all using (true) with check (true);
```

### 4. Configure environment variables

Copy `.env.example` to `.env.local`:

```bash
cp .env.example .env.local
```

Fill in your project credentials from Supabase → Project Settings → API:

```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 5. Restart the dev server

```bash
npm run dev
```

The activity feed, shared statuses, notes, and online presence indicators will now be live.

---

## Deploy to Vercel

### Option A — Vercel CLI

```bash
npm install -g vercel
vercel
```

### Option B — Vercel Dashboard

1. Push this folder to a GitHub repo
2. Go to [vercel.com](https://vercel.com) → New Project → Import repo
3. Framework: **Vite** (auto-detected)
4. Add environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
5. Deploy

The `vercel.json` rewrites file is already included — SPA routing works out of the box.

---

## CSV File Types

The app auto-detects CSV type from column headers:

| Type | Required Columns |
|------|-----------------|
| **brands** | `Brand Name`, `Brand Score` |
| **products** | `ASIN`, `Page Score` |
| **search_terms** | `Search Term`, `Opportunity Score` |
| **sellers** | `Seller ID` |
| **adspy** | `Total Ad Spend` |
| **subcategories** | `Node ID` |

You can drop multiple files at once — the app will process them all.

---

## Team Member Names

To add or change team members, edit the `TEAM` array at the top of `src/App.jsx`:

```js
const TEAM = ['Phillip', 'Ashley', 'Mario', 'Cesar', 'Pat', 'King', 'Other'];
```

---

## Data Persistence

| Data | Storage | Shared |
|------|---------|--------|
| CSV data | IndexedDB (browser) | ❌ Per-device |
| KPI settings | localStorage | ❌ Per-device |
| Brand statuses | Supabase + localStorage fallback | ✅ Team |
| Notes | Supabase | ✅ Team |
| Activity feed | Supabase | ✅ Team |
| Online presence | Supabase | ✅ Team |

CSV data is stored per-device. Each team member uploads their own CSVs.  
Brand statuses sync in real-time across all connected team members.
