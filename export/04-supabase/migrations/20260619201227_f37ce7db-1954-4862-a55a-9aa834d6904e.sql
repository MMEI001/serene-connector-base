-- Enums
CREATE TYPE public.voice_intent AS ENUM ('release', 'reminder', 'note', 'event', 'query', 'checkin');
CREATE TYPE public.voice_action_status AS ENUM ('completed', 'needs_confirmation', 'failed', 'skipped');

-- Table
CREATE TABLE public.voice_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  transcription_id uuid REFERENCES public.voice_transcriptions(id) ON DELETE SET NULL,
  intent public.voice_intent NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  result_table text,
  result_id uuid,
  status public.voice_action_status NOT NULL DEFAULT 'completed',
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX voice_actions_user_created_idx ON public.voice_actions (user_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.voice_actions TO authenticated;
GRANT ALL ON public.voice_actions TO service_role;

ALTER TABLE public.voice_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own voice_actions"
  ON public.voice_actions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own voice_actions"
  ON public.voice_actions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own voice_actions"
  ON public.voice_actions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own voice_actions"
  ON public.voice_actions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);