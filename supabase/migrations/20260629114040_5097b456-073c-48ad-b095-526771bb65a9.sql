CREATE TABLE public.voice_experience_state (
  user_id UUID NOT NULL PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('gift_event')),
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  asked_field TEXT,
  clarify_count INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '15 minutes')
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_experience_state TO authenticated;
GRANT ALL ON public.voice_experience_state TO service_role;

ALTER TABLE public.voice_experience_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own experience state"
  ON public.voice_experience_state
  FOR ALL
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX voice_experience_state_expires_at_idx
  ON public.voice_experience_state (expires_at);