DROP POLICY IF EXISTS "Users manage own calendar connections" ON public.calendar_connections;
REVOKE ALL ON public.calendar_connections FROM authenticated, anon;
GRANT ALL ON public.calendar_connections TO service_role;