CREATE TABLE public.voice_errors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider text NOT NULL,
  http_status integer,
  error_code text,
  stage text NOT NULL DEFAULT 'transcribe',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX voice_errors_user_recent_idx ON public.voice_errors (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.voice_errors TO authenticated;
GRANT ALL ON public.voice_errors TO service_role;

ALTER TABLE public.voice_errors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own voice errors"
ON public.voice_errors FOR SELECT TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users insert own voice errors"
ON public.voice_errors FOR INSERT TO authenticated
WITH CHECK (auth.uid() = user_id);