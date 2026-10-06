-- ============================================================================
--  TicketsSA: one-off Supabase setup for "anyone can list, admin approves"
--
--  Run this ONCE in Supabase Dashboard -> SQL Editor -> New query -> Run.
--  It is safe to run again (everything is IF NOT EXISTS / DROP IF EXISTS).
--
--  What it does
--   1. Creates `seller_listings` (equipment + merchandise submissions).
--   2. Adds `owner_id` to `accommodations` so sellers see their own stays.
--   3. Lets any signed-in user INSERT their own listing, but only as 'pending'.
--   4. Lets the public read only 'published' rows (owners also see their own).
--   5. Lets admins (app_metadata.role = 'admin') see and change everything.
--
--  To make someone an admin: Authentication -> Users -> the user ->
--  "Raw app meta data" -> {"role": "admin"}
-- ============================================================================

-- ── helper: is the caller an admin? (app_metadata can't be edited by users) ──
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin'
$$;

-- ── 1. seller_listings ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.seller_listings (
  id            text PRIMARY KEY,
  category      text NOT NULL,                 -- 'equipment' | 'merchandise'
  title         text NOT NULL,
  status        text NOT NULL DEFAULT 'pending', -- pending | published | rejected
  owner_id      uuid,
  owner_email   text,
  contact_name  text,
  contact_email text,
  contact_phone text,
  details       jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.seller_listings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "seller_listings: owner insert pending" ON public.seller_listings;
CREATE POLICY "seller_listings: owner insert pending" ON public.seller_listings
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "seller_listings: owner read own" ON public.seller_listings;
CREATE POLICY "seller_listings: owner read own" ON public.seller_listings
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "seller_listings: public read published" ON public.seller_listings;
CREATE POLICY "seller_listings: public read published" ON public.seller_listings
  FOR SELECT USING (status = 'published');

DROP POLICY IF EXISTS "seller_listings: admin all" ON public.seller_listings;
CREATE POLICY "seller_listings: admin all" ON public.seller_listings
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── 2/3/4. accommodations ───────────────────────────────────────────────────
ALTER TABLE public.accommodations ADD COLUMN IF NOT EXISTS owner_id uuid;
ALTER TABLE public.accommodations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "accommodations: public read published" ON public.accommodations;
CREATE POLICY "accommodations: public read published" ON public.accommodations
  FOR SELECT USING (status = 'published');

DROP POLICY IF EXISTS "accommodations: owner read own" ON public.accommodations;
CREATE POLICY "accommodations: owner read own" ON public.accommodations
  FOR SELECT TO authenticated USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "accommodations: owner insert pending" ON public.accommodations;
CREATE POLICY "accommodations: owner insert pending" ON public.accommodations
  FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid() AND status = 'pending');

DROP POLICY IF EXISTS "accommodations: admin all" ON public.accommodations;
CREATE POLICY "accommodations: admin all" ON public.accommodations
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ── events (+ ticket_types, event_tags): admin can see/approve everything ───
-- (Owners inserting their own events is already covered by supabase_rls.sql.)
DROP POLICY IF EXISTS "events: admin all" ON public.events;
CREATE POLICY "events: admin all" ON public.events
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "ticket_types: admin all" ON public.ticket_types;
CREATE POLICY "ticket_types: admin all" ON public.ticket_types
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "event_tags: admin all" ON public.event_tags;
CREATE POLICY "event_tags: admin all" ON public.event_tags
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
