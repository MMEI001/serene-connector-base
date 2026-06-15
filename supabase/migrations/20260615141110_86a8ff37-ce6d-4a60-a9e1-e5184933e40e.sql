DROP TABLE IF EXISTS public.cases;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;

REVOKE SELECT ON public.calendar_connections FROM authenticated;
GRANT SELECT (id, user_id, provider, expires_at, created_at, updated_at)
  ON public.calendar_connections TO authenticated;