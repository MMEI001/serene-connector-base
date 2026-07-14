ALTER TABLE public.reminders
  ADD COLUMN IF NOT EXISTS related_appointment_id UUID NULL
    REFERENCES public.appointments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS reminders_related_appointment_id_idx
  ON public.reminders(related_appointment_id)
  WHERE related_appointment_id IS NOT NULL;