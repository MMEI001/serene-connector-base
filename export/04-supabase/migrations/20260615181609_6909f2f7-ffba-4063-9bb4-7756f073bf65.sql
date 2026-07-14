
CREATE TABLE public.ics_calendars (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  color TEXT,
  last_synced_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ics_calendars_user_id_idx ON public.ics_calendars(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ics_calendars TO authenticated;
GRANT ALL ON public.ics_calendars TO service_role;
ALTER TABLE public.ics_calendars ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own ICS calendars" ON public.ics_calendars
  FOR ALL TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
CREATE TRIGGER set_ics_calendars_updated_at
  BEFORE UPDATE ON public.ics_calendars
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.ics_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  calendar_id UUID NOT NULL REFERENCES public.ics_calendars(id) ON DELETE CASCADE,
  uid TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  description TEXT,
  location TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  is_all_day BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (calendar_id, uid)
);
CREATE INDEX ics_events_calendar_start_idx ON public.ics_events(calendar_id, start_time);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ics_events TO authenticated;
GRANT ALL ON public.ics_events TO service_role;
ALTER TABLE public.ics_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own ICS events" ON public.ics_events
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ics_calendars c
    WHERE c.id = ics_events.calendar_id AND c.user_id = auth.uid()
  ));
CREATE POLICY "Users insert own ICS events" ON public.ics_events
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ics_calendars c
    WHERE c.id = ics_events.calendar_id AND c.user_id = auth.uid()
  ));
CREATE POLICY "Users update own ICS events" ON public.ics_events
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ics_calendars c
    WHERE c.id = ics_events.calendar_id AND c.user_id = auth.uid()
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.ics_calendars c
    WHERE c.id = ics_events.calendar_id AND c.user_id = auth.uid()
  ));
CREATE POLICY "Users delete own ICS events" ON public.ics_events
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.ics_calendars c
    WHERE c.id = ics_events.calendar_id AND c.user_id = auth.uid()
  ));
CREATE TRIGGER set_ics_events_updated_at
  BEFORE UPDATE ON public.ics_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
