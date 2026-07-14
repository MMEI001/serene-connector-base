
CREATE TABLE public.voice_transcriptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  duration_seconds NUMERIC,
  estimated_cost_usd NUMERIC,
  bytes INTEGER,
  model TEXT NOT NULL DEFAULT 'whisper-1',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);
CREATE INDEX voice_transcriptions_user_created_idx ON public.voice_transcriptions(user_id, created_at DESC);
GRANT SELECT, INSERT ON public.voice_transcriptions TO authenticated;
GRANT ALL ON public.voice_transcriptions TO service_role;
ALTER TABLE public.voice_transcriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view their own transcriptions" ON public.voice_transcriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own transcriptions" ON public.voice_transcriptions FOR INSERT WITH CHECK (auth.uid() = user_id);
