## Goal

Add a **Geo Analytics** tab to the Admin Dashboard showing site-visit insights: total visits, unique visitors, top countries, devices, browsers, OS, top pages, referrers, and a daily trend chart.

## Approach

We'll capture lightweight, privacy-friendly visit events from the live app and aggregate them in our backend, then render the results in a new admin tab. No third-party analytics service required.

```text
Visitor → App loads → log-visit edge fn → page_visits table
                                              │
                                              ▼
                                Admin Dashboard › Geo tab (charts)
```

### 1. Database

New table `public.page_visits`:
- `id`, `created_at`
- `session_id` (uuid stored in `localStorage` to count unique visitors)
- `user_id` (nullable — set if logged in)
- `organization_id` (nullable — set if logged in)
- `path` (e.g. `/join-organization`)
- `referrer`
- `country`, `country_code`, `region`, `city` (from IP geolocation)
- `device_type` (mobile / tablet / desktop)
- `browser`, `os`
- `user_agent`
- `ip_hash` (SHA-256 of IP, never raw IP)

RLS:
- INSERT: allow anon + authenticated (so anonymous visitors can be logged via the edge function using service role; client never inserts directly).
- SELECT: only org admins (`is_org_admin`) — admins see only their org's visits, plus rows where `organization_id IS NULL` (pre-login pages like `/`, `/auth`, `/join-organization`) restricted to super_admin only.

Indexes on `created_at`, `country_code`, `device_type`, `path`.

### 2. Edge function `log-visit` (verify_jwt = false)

- Accepts `{ path, referrer, session_id, user_id? }`.
- Reads visitor IP from `x-forwarded-for` / `cf-connecting-ip`.
- Geolocates IP using free `ipapi.co/{ip}/json/` (no key needed; ~1k req/day free) with a fallback to `ip-api.com`. Cache results in-memory per cold start by IP.
- Parses `user-agent` with a small inline UA parser (no dep) for `device_type`, `browser`, `os`.
- Hashes IP with SHA-256 before storing.
- Inserts row using service role. Fails silently (returns 200) so it never breaks the app.

### 3. Client tracking hook

`src/hooks/usePageTracking.tsx`:
- Generates/persists a `pulse_session_id` in `localStorage`.
- On every route change (via `useLocation`), debounced ~500ms, fires `supabase.functions.invoke('log-visit', { body: { path, referrer: document.referrer, session_id, user_id } })`.
- Skips known bot UAs and admin-only routes (configurable).

Mounted once in `src/App.tsx` inside the router.

### 4. Geo Analytics UI

New component `src/components/admin/GeoAnalytics.tsx` shown under a new "Geo" tab in `AdminDashboard.tsx`:

- **Date range picker**: Last 24h / 7d / 30d / 90d.
- **Top stat cards**: Total Visits, Unique Visitors, Avg Visits/Day, Top Country.
- **Daily visits line chart** (recharts — already in project).
- **Top Countries** table with flag emoji + bar.
- **Device split** donut (mobile / tablet / desktop).
- **Browser & OS** mini bar charts.
- **Top Pages** table.
- **Top Referrers** table.

Data fetched via a single SECURITY DEFINER RPC `get_visit_analytics(_org_id, _from, _to)` returning JSON with all aggregates (one round-trip, fast).

### 5. Tab wiring

Add `Geo` tab (icon: `Globe`) to `AdminDashboard.tsx` tabs list, visible to both `admin` and `super_admin`. Increase grid cols accordingly.

## Privacy notes

- No raw IPs stored — only SHA-256 hash + coarse geo (country/region/city).
- Session IDs are random UUIDs, not tied to identity until login.
- Documented on the admin page with a small "Privacy" footer note.

## Out of scope

- Heatmaps, funnels, A/B testing.
- Real-time live-visitor counter (can be added later via Supabase Realtime on `page_visits`).
- Exporting CSV (easy follow-up if wanted).

## Files to create / change

- New: `supabase/functions/log-visit/index.ts`
- New migration: `page_visits` table + RLS + `get_visit_analytics` RPC
- New: `src/hooks/usePageTracking.tsx`
- New: `src/components/admin/GeoAnalytics.tsx`
- Edit: `src/App.tsx` (mount tracker)
- Edit: `src/pages/AdminDashboard.tsx` (add Geo tab)
- Edit: `supabase/config.toml` (add `[functions.log-visit] verify_jwt = false`)

Reply **approve** to proceed.