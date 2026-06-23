
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS voice_provider text NOT NULL DEFAULT 'elevenlabs';

ALTER TABLE public.user_profiles
  ALTER COLUMN voice_enabled SET DEFAULT true;

UPDATE public.user_profiles
  SET voice_enabled = true
  WHERE voice_enabled IS NULL;
