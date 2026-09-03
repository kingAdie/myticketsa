-- ============================================================
--  MyTicketSA Row Level Security Policies
--
--  Run this in your Supabase project → SQL Editor
--  AFTER running supabase_schema.sql.
--
--  The service_role key (backend) always bypasses RLS.
--  These policies control what the anon key (frontend) can access.
-- ============================================================

-- ── Enable RLS on all public tables ──────────────────────────────────────────
ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ticket_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_tags         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tickets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipment_requests ENABLE ROW LEVEL SECURITY;

-- ── profiles ─────────────────────────────────────────────────────────────────
CREATE POLICY "profiles: owner can read"   ON public.profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles: owner can insert" ON public.profiles FOR INSERT WITH CHECK (id = auth.uid());
CREATE POLICY "profiles: owner can update" ON public.profiles FOR UPDATE USING (id = auth.uid());

-- ── events ───────────────────────────────────────────────────────────────────
-- Anyone (including anon) can read published events
CREATE POLICY "events: public can read published"
  ON public.events FOR SELECT USING (status = 'published');

-- Authenticated users can also read their own events (all statuses)
CREATE POLICY "events: organiser can read own"
  ON public.events FOR SELECT USING (organiser_id = auth.uid());

-- Authenticated users can create events (they become the organiser)
CREATE POLICY "events: organiser can insert"
  ON public.events FOR INSERT WITH CHECK (organiser_id = auth.uid());

-- Organisers can update their own events
CREATE POLICY "events: organiser can update own"
  ON public.events FOR UPDATE USING (organiser_id = auth.uid());

-- Organisers can delete their own events
CREATE POLICY "events: organiser can delete own"
  ON public.events FOR DELETE USING (organiser_id = auth.uid());

-- ── ticket_types ─────────────────────────────────────────────────────────────
-- Anyone can read ticket types (needed to show event pricing)
CREATE POLICY "ticket_types: public can read"
  ON public.ticket_types FOR SELECT USING (true);

-- Organisers can manage ticket types for their own events
CREATE POLICY "ticket_types: organiser can insert"
  ON public.ticket_types FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organiser_id = auth.uid())
  );

CREATE POLICY "ticket_types: organiser can delete"
  ON public.ticket_types FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organiser_id = auth.uid())
  );

-- ── event_tags ────────────────────────────────────────────────────────────────
-- Anyone can read tags
CREATE POLICY "event_tags: public can read"
  ON public.event_tags FOR SELECT USING (true);

-- Organisers can manage tags for their own events
CREATE POLICY "event_tags: organiser can insert"
  ON public.event_tags FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organiser_id = auth.uid())
  );

CREATE POLICY "event_tags: organiser can delete"
  ON public.event_tags FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.events e WHERE e.id = event_id AND e.organiser_id = auth.uid())
  );

-- ── tickets ──────────────────────────────────────────────────────────────────
-- Users can read their own tickets (matched by email)
CREATE POLICY "tickets: buyer can read own"
  ON public.tickets FOR SELECT USING (buyer_email = auth.email());

-- ── equipment_requests ───────────────────────────────────────────────────────
-- Users can read their own service requests
CREATE POLICY "requests: owner can read"
  ON public.equipment_requests FOR SELECT USING (user_id = auth.uid());

-- Authenticated users can submit service requests
CREATE POLICY "requests: owner can insert"
  ON public.equipment_requests FOR INSERT WITH CHECK (user_id = auth.uid());
