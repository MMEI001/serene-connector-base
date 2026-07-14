-- Enums
CREATE TYPE public.memory_category AS ENUM (
  'child_interest',
  'child_activity',
  'favorite',
  'reminder_preference',
  'shop_preference',
  'hobby',
  'gift_preference',
  'planning_preference',
  'shopping_preference',
  'travel_preference',
  'food_preference',
  'pet',
  'family_member',
  'other'
);

CREATE TYPE public.memory_status AS ENUM (
  'pending_confirmation',
  'active',
  'rejected',
  'archived'
);

-- Table
CREATE TABLE public.assistant_memory (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  subject TEXT,
  category public.memory_category NOT NULL,
  value TEXT NOT NULL,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.5,
  future_value_score NUMERIC(3,2) NOT NULL DEFAULT 0.5,
  status public.memory_status NOT NULL DEFAULT 'pending_confirmation',
  source_action_id UUID,
  source_turn_id TEXT,
  last_used_at TIMESTAMPTZ,
  use_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX assistant_memory_user_status_idx
  ON public.assistant_memory (user_id, status);
CREATE INDEX assistant_memory_user_category_idx
  ON public.assistant_memory (user_id, category);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.assistant_memory TO authenticated;
GRANT ALL ON public.assistant_memory TO service_role;

-- RLS
ALTER TABLE public.assistant_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users select own memory"
  ON public.assistant_memory FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own memory"
  ON public.assistant_memory FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own memory"
  ON public.assistant_memory FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own memory"
  ON public.assistant_memory FOR DELETE
  USING (auth.uid() = user_id);

-- updated_at trigger (reuse existing set_updated_at function)
CREATE TRIGGER assistant_memory_set_updated_at
  BEFORE UPDATE ON public.assistant_memory
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();