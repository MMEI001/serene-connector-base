-- =====================================================================
-- HoofdRust Assistent — Volledig schema rebuild (schone recreate)
-- =====================================================================
--
-- Draai deze migratie op een LEGE nieuwe Supabase-database om exact
-- hetzelfde schema te krijgen als de bron-app. De originele migraties
-- (incrementeel) staan naast dit bestand voor referentie.
--
-- Volgorde: enums → tables → grants → RLS → policies → triggers.
-- Alle tabellen in schema public gebruiken auth.uid() voor RLS.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ENUMS
-- ---------------------------------------------------------------------
create type public.suggestion_status as enum ('pending','accepted','dismissed','deleted');
create type public.appointment_status as enum ('scheduled','completed','cancelled');
create type public.reminder_status    as enum ('active','done','snoozed','deleted');
create type public.let_go_status      as enum ('active','archived','processed');
create type public.item_source        as enum ('manual','ai_suggested','confirmed_from_ai','imported','onboarding','system');
create type public.voice_intent       as enum ('release','reminder','note','event','query','checkin','assistant_chat');
create type public.voice_action_status as enum ('completed','needs_confirmation','failed','skipped');
create type public.memory_category    as enum (
  'child_interest','child_activity','favorite','reminder_preference','shop_preference',
  'hobby','gift_preference','planning_preference','shopping_preference','travel_preference',
  'food_preference','pet','family_member','other'
);
create type public.memory_status      as enum ('pending_confirmation','active','rejected','archived');

-- ---------------------------------------------------------------------
-- 2. SHARED TRIGGER
-- ---------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path to 'public'
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3. PROFILES (minimal — vult zich via trigger op auth.users)
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key,
  display_name text,
  created_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "own read"   on public.profiles for select using (auth.uid() = id);
create policy "own insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own update" on public.profiles for update using (auth.uid() = id);

-- ---------------------------------------------------------------------
-- 4. USER_PROFILES (onboarding + persona-input)
-- ---------------------------------------------------------------------
create table public.user_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  primary_goal text[],
  support_style text,
  main_difficulty text[],
  overstimulation_level text,
  hard_moment_of_day text[],
  preferred_help_area text[],
  suggestion_count_preference text,
  reminder_style text,
  planning_style text,
  voice_enabled boolean default true,
  voice_id text default 'XB0fDUnXU5powFXDhCwa',
  voice_provider text not null default 'elevenlabs',
  voice_quality text not null default 'fast',
  ritual_enabled boolean not null default false,
  ritual_time text not null default '19:30',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);
grant select, insert, update, delete on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;
alter table public.user_profiles enable row level security;
create policy "own_all" on public.user_profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger user_profiles_updated_at before update on public.user_profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 5. CORE ITEMS: appointments, reminders, notes, let_go_items, ai_suggestions
-- ---------------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  description text,
  date date not null,
  start_time time,
  end_time time,
  source public.item_source not null default 'manual',
  status public.appointment_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.appointments to authenticated;
grant all on public.appointments to service_role;
alter table public.appointments enable row level security;
create policy "own_select" on public.appointments for select using (auth.uid() = user_id);
create policy "own_insert" on public.appointments for insert with check (auth.uid() = user_id);
create policy "own_update" on public.appointments for update using (auth.uid() = user_id);
create policy "own_delete" on public.appointments for delete using (auth.uid() = user_id);
create trigger appointments_updated_at before update on public.appointments
  for each row execute function public.set_updated_at();

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  description text,
  remind_at timestamptz,
  source public.item_source not null default 'manual',
  status public.reminder_status not null default 'active',
  related_appointment_id uuid references public.appointments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.reminders to authenticated;
grant all on public.reminders to service_role;
alter table public.reminders enable row level security;
create policy "own_select" on public.reminders for select using (auth.uid() = user_id);
create policy "own_insert" on public.reminders for insert with check (auth.uid() = user_id);
create policy "own_update" on public.reminders for update using (auth.uid() = user_id);
create policy "own_delete" on public.reminders for delete using (auth.uid() = user_id);
create trigger reminders_updated_at before update on public.reminders
  for each row execute function public.set_updated_at();

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text,
  content text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.notes to authenticated;
grant all on public.notes to service_role;
alter table public.notes enable row level security;
create policy "own_select" on public.notes for select using (auth.uid() = user_id);
create policy "own_insert" on public.notes for insert with check (auth.uid() = user_id);
create policy "own_update" on public.notes for update using (auth.uid() = user_id);
create policy "own_delete" on public.notes for delete using (auth.uid() = user_id);
create trigger notes_updated_at before update on public.notes
  for each row execute function public.set_updated_at();

create table public.let_go_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  content text not null,
  linked_item_type text,
  linked_item_id uuid,
  action_intent text,
  status public.let_go_status not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.let_go_items to authenticated;
grant all on public.let_go_items to service_role;
alter table public.let_go_items enable row level security;
create policy "own_select" on public.let_go_items for select using (auth.uid() = user_id);
create policy "own_insert" on public.let_go_items for insert with check (auth.uid() = user_id);
create policy "own_update" on public.let_go_items for update using (auth.uid() = user_id);
create policy "own_delete" on public.let_go_items for delete using (auth.uid() = user_id);
create trigger let_go_items_updated_at before update on public.let_go_items
  for each row execute function public.set_updated_at();

create table public.ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  suggestion_type text not null,
  title text,
  content text,
  proposed_date date,
  proposed_time time,
  target_item_type text,
  target_item_id uuid,
  status public.suggestion_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.ai_suggestions to authenticated;
grant all on public.ai_suggestions to service_role;
alter table public.ai_suggestions enable row level security;
create policy "own_select" on public.ai_suggestions for select using (auth.uid() = user_id);
create policy "own_insert" on public.ai_suggestions for insert with check (auth.uid() = user_id);
create policy "own_update" on public.ai_suggestions for update using (auth.uid() = user_id);
create policy "own_delete" on public.ai_suggestions for delete using (auth.uid() = user_id);
create trigger ai_suggestions_updated_at before update on public.ai_suggestions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 6. ASSISTANT MEMORY
-- ---------------------------------------------------------------------
create table public.assistant_memory (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  subject text,
  category public.memory_category not null,
  value text not null,
  confidence numeric not null default 0.5,
  future_value_score numeric not null default 0.5,
  status public.memory_status not null default 'pending_confirmation',
  source_action_id uuid,
  source_turn_id text,
  last_used_at timestamptz,
  use_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.assistant_memory to authenticated;
grant all on public.assistant_memory to service_role;
alter table public.assistant_memory enable row level security;
create policy "Users select own memory" on public.assistant_memory for select using (auth.uid() = user_id);
create policy "Users insert own memory" on public.assistant_memory for insert with check (auth.uid() = user_id);
create policy "Users update own memory" on public.assistant_memory for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Users delete own memory" on public.assistant_memory for delete using (auth.uid() = user_id);
create trigger assistant_memory_updated_at before update on public.assistant_memory
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 7. VOICE PIPELINE TELEMETRY
-- ---------------------------------------------------------------------
create table public.voice_transcriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  duration_seconds numeric,
  estimated_cost_usd numeric,
  bytes integer,
  model text not null default 'whisper-1',
  created_at timestamptz not null default now()
);
grant select, insert on public.voice_transcriptions to authenticated;
grant all on public.voice_transcriptions to service_role;
alter table public.voice_transcriptions enable row level security;
create policy "own_select" on public.voice_transcriptions for select using (auth.uid() = user_id);
create policy "own_insert" on public.voice_transcriptions for insert with check (auth.uid() = user_id);

create table public.voice_intents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  transcription_id uuid references public.voice_transcriptions(id) on delete set null,
  model text not null,
  intent public.voice_intent not null,
  confidence numeric,
  payload jsonb not null default '{}'::jsonb,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  cost_usd numeric,
  ambiguous boolean not null default false,
  clarification_question text,
  created_at timestamptz not null default now()
);
grant select, insert on public.voice_intents to authenticated;
grant all on public.voice_intents to service_role;
alter table public.voice_intents enable row level security;
create policy "own_select" on public.voice_intents for select using (auth.uid() = user_id);
create policy "own_insert" on public.voice_intents for insert with check (auth.uid() = user_id);

create table public.voice_actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  transcription_id uuid references public.voice_transcriptions(id) on delete set null,
  intent public.voice_intent not null,
  payload jsonb not null default '{}'::jsonb,
  result_table text,
  result_id uuid,
  status public.voice_action_status not null default 'completed',
  error text,
  confirmation_text text,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.voice_actions to authenticated;
grant all on public.voice_actions to service_role;
alter table public.voice_actions enable row level security;
create policy "own_select" on public.voice_actions for select using (auth.uid() = user_id);
create policy "own_insert" on public.voice_actions for insert with check (auth.uid() = user_id);
create policy "own_update" on public.voice_actions for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_delete" on public.voice_actions for delete using (auth.uid() = user_id);

create table public.voice_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null,
  http_status integer,
  error_code text,
  stage text not null default 'transcribe',
  created_at timestamptz not null default now()
);
grant select, insert on public.voice_errors to authenticated;
grant all on public.voice_errors to service_role;
alter table public.voice_errors enable row level security;
create policy "own_select" on public.voice_errors for select using (auth.uid() = user_id);
create policy "own_insert" on public.voice_errors for insert with check (auth.uid() = user_id);

create table public.voice_experience_state (
  user_id uuid primary key,
  kind text not null,
  data jsonb not null default '{}'::jsonb,
  asked_field text,
  clarify_count integer not null default 0,
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '15 minutes')
);
grant select, insert, update, delete on public.voice_experience_state to authenticated;
grant all on public.voice_experience_state to service_role;
alter table public.voice_experience_state enable row level security;
create policy "own_all" on public.voice_experience_state for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------
-- 8. CALENDAR INTEGRATIES
-- ---------------------------------------------------------------------
create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  provider text not null default 'google',
  access_token text not null,
  refresh_token text,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.calendar_connections to authenticated;
grant all on public.calendar_connections to service_role;
alter table public.calendar_connections enable row level security;
create policy "own_select" on public.calendar_connections for select to authenticated using (auth.uid() = user_id);
create policy "own_insert" on public.calendar_connections for insert to authenticated with check (auth.uid() = user_id);
create policy "own_update" on public.calendar_connections for update to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "own_delete" on public.calendar_connections for delete to authenticated using (auth.uid() = user_id);
create trigger calendar_connections_updated_at before update on public.calendar_connections
  for each row execute function public.set_updated_at();

create table public.calendar_preferences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  calendar_id text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, calendar_id)
);
grant select, insert, update, delete on public.calendar_preferences to authenticated;
grant all on public.calendar_preferences to service_role;
alter table public.calendar_preferences enable row level security;
create policy "own_all" on public.calendar_preferences for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger calendar_preferences_updated_at before update on public.calendar_preferences
  for each row execute function public.set_updated_at();

create table public.ics_calendars (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  url text not null,
  color text,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.ics_calendars to authenticated;
grant all on public.ics_calendars to service_role;
alter table public.ics_calendars enable row level security;
create policy "own_all" on public.ics_calendars for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);
create trigger ics_calendars_updated_at before update on public.ics_calendars
  for each row execute function public.set_updated_at();

create table public.ics_events (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.ics_calendars(id) on delete cascade,
  uid text not null,
  summary text not null default '',
  description text,
  location text,
  start_time timestamptz not null,
  end_time timestamptz,
  is_all_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (calendar_id, uid)
);
grant select, insert, update, delete on public.ics_events to authenticated;
grant all on public.ics_events to service_role;
alter table public.ics_events enable row level security;
create policy "Users view own ICS events"   on public.ics_events for select to authenticated using (
  exists (select 1 from public.ics_calendars c where c.id = ics_events.calendar_id and c.user_id = auth.uid())
);
create policy "Users insert own ICS events" on public.ics_events for insert to authenticated with check (
  exists (select 1 from public.ics_calendars c where c.id = ics_events.calendar_id and c.user_id = auth.uid())
);
create policy "Users update own ICS events" on public.ics_events for update to authenticated using (
  exists (select 1 from public.ics_calendars c where c.id = ics_events.calendar_id and c.user_id = auth.uid())
) with check (
  exists (select 1 from public.ics_calendars c where c.id = ics_events.calendar_id and c.user_id = auth.uid())
);
create policy "Users delete own ICS events" on public.ics_events for delete to authenticated using (
  exists (select 1 from public.ics_calendars c where c.id = ics_events.calendar_id and c.user_id = auth.uid())
);
create trigger ics_events_updated_at before update on public.ics_events
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 9. BEHAVIOR ANALYTICS
-- ---------------------------------------------------------------------
create table public.user_behavior_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  event_type text not null,
  item_type text,
  item_id uuid,
  metadata jsonb,
  created_at timestamptz not null default now()
);
grant select, insert on public.user_behavior_events to authenticated;
grant all on public.user_behavior_events to service_role;
alter table public.user_behavior_events enable row level security;
create policy "own_select" on public.user_behavior_events for select using (auth.uid() = user_id);
create policy "own_insert" on public.user_behavior_events for insert with check (auth.uid() = user_id);

-- =====================================================================
-- Klaar. Zie 04-supabase/policies-summary.md voor de plain-language uitleg
-- per tabel.
-- =====================================================================
