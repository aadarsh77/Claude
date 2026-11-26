-- કાર્ય મેટ્રિક્સ — Supabase schema
--
-- આખી ફાઇલ કૉપી કરીને Supabase ના SQL Editor માં એક વાર ચલાવો (Run).
-- ફરીથી ચલાવશો તો પણ વાંધો નથી — બધું "if not exists" છે.
--
-- Row Level Security દરેક વ્યક્તિને ફક્ત એની પોતાની હરોળ વંચાવે/બદલાવે છે.
-- RLS વગર anon key જાણનાર કોઈ પણ બધું વાંચી શકે, એટલે આ ફાઇલ ફરજિયાત છે.

-- ---------------------------------------------------------------- tasks
create table if not exists public.tasks (
  id          text        primary key,
  user_id     uuid        not null default auth.uid()
                          references auth.users (id) on delete cascade,
  text        text        not null,
  who         text,
  due         date,
  created     timestamptz,
  done        boolean     not null default false,
  done_at     timestamptz,
  fix_u       boolean,
  fix_i       boolean,
  trained_u   boolean,
  trained_i   boolean,
  deleted     boolean     not null default false,
  updated_at  timestamptz not null default now()
);

create index if not exists tasks_user_updated_idx
  on public.tasks (user_id, updated_at);

alter table public.tasks enable row level security;

drop policy if exists "own tasks: read"   on public.tasks;
drop policy if exists "own tasks: insert" on public.tasks;
drop policy if exists "own tasks: update" on public.tasks;
drop policy if exists "own tasks: delete" on public.tasks;

create policy "own tasks: read"   on public.tasks for select using (user_id = auth.uid());
create policy "own tasks: insert" on public.tasks for insert with check (user_id = auth.uid());
create policy "own tasks: update" on public.tasks for update using (user_id = auth.uid())
                                                        with check (user_id = auth.uid());
create policy "own tasks: delete" on public.tasks for delete using (user_id = auth.uid());

-- ------------------------------------------------------------- lexicon
-- એક વ્યક્તિ દીઠ એક જ હરોળ: શીખેલા શબ્દોની આખી યાદી એક jsonb માં.
create table if not exists public.lexicon (
  user_id     uuid        primary key default auth.uid()
                          references auth.users (id) on delete cascade,
  tokens      jsonb       not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.lexicon enable row level security;

drop policy if exists "own lexicon: read"   on public.lexicon;
drop policy if exists "own lexicon: insert" on public.lexicon;
drop policy if exists "own lexicon: update" on public.lexicon;

create policy "own lexicon: read"   on public.lexicon for select using (user_id = auth.uid());
create policy "own lexicon: insert" on public.lexicon for insert with check (user_id = auth.uid());
create policy "own lexicon: update" on public.lexicon for update using (user_id = auth.uid())
                                                          with check (user_id = auth.uid());

-- -------------------------------------------------- who may sign up
-- ખાતું ફક્ત તમારું જ રહે એ માટે Supabase માં:
--   Authentication → Sign In / Providers → Email ચાલુ, "Confirm email" ચાલુ
--   Authentication → Sign In / Providers → "Allow new users to sign up" —
--   તમે એક વાર લૉગિન કરી લો પછી આ બંધ કરી દો, જેથી બીજું કોઈ ખાતું ન ખોલી શકે.
