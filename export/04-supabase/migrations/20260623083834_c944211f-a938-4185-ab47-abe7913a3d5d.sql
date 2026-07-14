
ALTER TABLE public.voice_actions
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS confirmation_text TEXT;

CREATE INDEX IF NOT EXISTS voice_actions_pending_idx
  ON public.voice_actions (user_id, expires_at DESC)
  WHERE status = 'needs_confirmation';

CREATE TABLE IF NOT EXISTS public.voice_intents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  transcription_id UUID,
  model TEXT NOT NULL,
  intent public.voice_intent NOT NULL,
  confidence NUMERIC,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  cost_usd NUMERIC,
  ambiguous BOOLEAN NOT NULL DEFAULT false,
  clarification_question TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.voice_intents TO authenticated;
GRANT ALL ON public.voice_intents TO service_role;
ALTER TABLE public.voice_intents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own voice_intents" ON public.voice_intents FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "users insert own voice_intents" ON public.voice_intents FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS voice_intents_user_created_idx ON public.voice_intents (user_id, created_at DESC);
