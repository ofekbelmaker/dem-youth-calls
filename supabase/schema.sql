-- =====================================================================
--  מערכת טלפניה לגיוס פעילים — סכמה + מדיניות הרשאות
--  Postgres / Supabase
--
--  עקרון מנחה: כל הגבלת הגישה נאכפת ב-RLS ברמת מסד הנתונים.
--  שכבת האפליקציה לא אמורה לסנן כלום מטעמי אבטחה.
--
--  מבנה שטוח: אין סניפים. כל הפעילים בגוש אחד, והחלוקה היחידה
--  היא בין מתקשרים. אם יידרשו סניפים בעתיד זו הוספה של טבלה
--  ועמודת branch_id — לא שינוי במבנה.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 1. טיפוסים
-- ---------------------------------------------------------------------

create type user_role           as enum ('guide', 'coordinator', 'admin');
create type person_status       as enum ('active', 'dormant', 'left');
create type assignment_state    as enum ('pending', 'done', 'skipped');
create type assignment_strategy as enum ('by_guide', 'pool');

-- תוצאת השיחה עצמה — לא תשובה על הגעה
create type contact_outcome as enum (
  'answered',        -- ענה ודיברנו
  'no_answer',       -- לא ענה
  'wrong_number',    -- מספר שגוי / לא שייך
  'callback_later',  -- ביקש שנחזור אליו
  'opted_out'        -- ביקש שלא נפנה אליו יותר
);

-- כוונת הגעה — נפרד לחלוטין מתוצאת השיחה
create type rsvp_status as enum ('yes', 'no', 'maybe', 'unknown');


-- ---------------------------------------------------------------------
-- 2. עזר: נרמול מספרי טלפון ישראליים ל-E.164
--    שימושי בעיקר בייבוא מטופס ההרשמה, שבו הפורמטים מעורבבים.
--    '050-123-4567' / '+972 50 1234567' / '972501234567'  ->  '+972501234567'
-- ---------------------------------------------------------------------

create or replace function normalize_il_phone(raw text)
returns text
language plpgsql
immutable
as $$
declare
  d text;
begin
  if raw is null or btrim(raw) = '' then
    return null;
  end if;

  d := regexp_replace(raw, '[^0-9]', '', 'g');

  if d like '00972%' then
    d := substring(d from 6);
  elsif d like '972%' then
    d := substring(d from 4);
  end if;

  d := regexp_replace(d, '^0+', '');

  -- קו נייח 8 ספרות, נייד 9 ספרות
  if length(d) < 8 or length(d) > 9 then
    return null;
  end if;

  return '+972' || d;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. טבלאות
-- ---------------------------------------------------------------------

-- הפעילים. שים לב: זו הטבלה הרגישה — מספרי טלפון של קטינים.
create table people (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  phone_e164      text not null unique
                    check (phone_e164 ~ '^\+[1-9][0-9]{7,14}$'),
  grade           text,                        -- שכבה: ט', י', ...
  birth_date      date,                        -- לזיהוי קטינים
  guide_id        uuid references people(id) on delete set null,
  status          person_status not null default 'active',

  do_not_contact  boolean not null default false,

  -- תיעוד בסיס ההסכמה. ממולא בייבוא מטופס ההרשמה.
  consent_source   text,                       -- 'signup_form_2025'
  consent_at       timestamptz,
  guardian_consent boolean not null default false,

  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index on people (guide_id);
create index on people (status) where do_not_contact = false;


-- משתמשי המערכת.
--
-- `id` עצמאי ו-`auth_user_id` מתמלא רק כשהמשתמש נכנס בפועל דרך הזמנה.
-- זה מה שמאפשר להקים את כל מבנה המתקשרים — מדריכים, שיוכים, משימות —
-- לפני שאף אחד מהם התחבר אי פעם.
create table profiles (
  id           uuid primary key default gen_random_uuid(),
  auth_user_id uuid unique references auth.users(id) on delete set null,
  person_id    uuid unique references people(id) on delete set null,
  display_name text not null,
  role         user_role not null default 'guide',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create index on profiles (person_id);


-- הזמנות: רכז מייצר קישור חד-פעמי, המדריך נכנס עם גוגל,
-- ו-redeem_invite() קושר את חשבון הגוגל שלו לפרופיל הקיים.
create table invites (
  id         uuid primary key default gen_random_uuid(),
  token      text not null unique default encode(gen_random_bytes(24), 'hex'),
  profile_id uuid not null references profiles(id) on delete cascade,
  created_by uuid references profiles(id) on delete set null,
  expires_at timestamptz not null default now() + interval '14 days',
  used_at    timestamptz,
  created_at timestamptz not null default now()
);


create table events (
  id                  uuid primary key default gen_random_uuid(),
  title               text not null,
  description         text,
  starts_at           timestamptz not null,
  location            text,
  target_count        integer,
  assignment_strategy assignment_strategy not null default 'by_guide',
  created_by          uuid references profiles(id) on delete set null,
  created_at          timestamptz not null default now()
);

create index on events (starts_at desc);


-- מאגר המתקשרים של פעולה — רלוונטי רק ל-strategy = 'pool'.
-- מי שנרשם למשמרת חיוג, להבדיל מכלל המדריכים.
create table event_callers (
  event_id   uuid not null references events(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (event_id, profile_id)
);


-- משימת חיוג: מי אחראי להתקשר למי, לקראת איזו פעולה.
-- הטבלה הזו היא גם מנגנון ההרשאות: שיוך משימה = הענקת גישה לרשומה.
create table assignments (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  person_id   uuid not null references people(id) on delete cascade,
  assigned_to uuid not null references profiles(id) on delete cascade,
  state       assignment_state not null default 'pending',
  created_at  timestamptz not null default now(),
  unique (event_id, person_id)
);

create index on assignments (assigned_to, state);
create index on assignments (event_id);
create index on assignments (person_id);


-- תיעוד שיחות. append-only: שיחה חוזרת = שורה חדשה, לעולם לא עדכון.
create table contacts (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  contacted_by  uuid references profiles(id) on delete set null,
  contacted_at  timestamptz not null default now(),
  outcome       contact_outcome not null,
  rsvp          rsvp_status not null default 'unknown',
  needs_ride    boolean not null default false,
  callback_at   timestamptz,
  note          text
);

create index on contacts (assignment_id, contacted_at desc);


-- ---------------------------------------------------------------------
-- 4. טריגרים
-- ---------------------------------------------------------------------

create or replace function touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger people_touch
  before update on people
  for each row execute function touch_updated_at();


-- תיעוד שיחה מקדם את מצב המשימה, ואוכף "אל תפנו אליי" אוטומטית.
-- SECURITY DEFINER: המדריך לא צריך הרשאת כתיבה ישירה ל-people.
create or replace function apply_contact_effects()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_person_id uuid;
begin
  select person_id into v_person_id
    from assignments where id = new.assignment_id;

  if new.outcome in ('answered', 'wrong_number', 'opted_out') then
    update assignments set state = 'done' where id = new.assignment_id;
  end if;

  if new.outcome = 'opted_out' then
    update people set do_not_contact = true where id = v_person_id;

    -- מבטל משימות עתידיות פתוחות עבור אותו אדם
    update assignments a
       set state = 'skipped'
      from events e
     where a.event_id = e.id
       and a.person_id = v_person_id
       and a.state = 'pending'
       and e.starts_at > now();
  end if;

  return new;
end;
$$;

create trigger contacts_apply_effects
  after insert on contacts
  for each row execute function apply_contact_effects();


-- ---------------------------------------------------------------------
-- 5. פונקציות עזר להרשאות
--    SECURITY DEFINER כדי שקריאה ל-profiles מתוך מדיניות
--    לא תיצור רקורסיה של RLS.
-- ---------------------------------------------------------------------

create or replace function auth_profile_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from profiles where auth_user_id = auth.uid() and is_active
$$;

create or replace function auth_role()
returns user_role language sql stable security definer set search_path = public as $$
  select role from profiles where auth_user_id = auth.uid() and is_active
$$;

create or replace function auth_person_id()
returns uuid language sql stable security definer set search_path = public as $$
  select person_id from profiles where auth_user_id = auth.uid() and is_active
$$;

-- קיצור: רכז ואדמין רואים את כל הגוש
create or replace function auth_is_staff()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('coordinator', 'admin')
       from profiles where auth_user_id = auth.uid() and is_active),
    false)
$$;


-- מימוש הזמנה: קושר את המשתמש המחובר לפרופיל שהוכן מראש
create or replace function redeem_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  select profile_id into v_profile_id
    from invites
   where token = p_token
     and used_at is null
     and expires_at > now();

  if v_profile_id is null then
    raise exception 'invalid or expired invite';
  end if;

  update profiles
     set auth_user_id = auth.uid()
   where id = v_profile_id
     and (auth_user_id is null or auth_user_id = auth.uid());

  update invites set used_at = now() where token = p_token;

  return v_profile_id;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. RLS
-- ---------------------------------------------------------------------

alter table people        enable row level security;
alter table profiles      enable row level security;
alter table invites       enable row level security;
alter table events        enable row level security;
alter table event_callers enable row level security;
alter table assignments   enable row level security;
alter table contacts      enable row level security;


-- פעילים — הליבה.
-- מדריך רואה: את עצמו, את החניכים שלו, וכל מי ששויך אליו כמשימה.
-- השורה האחרונה היא מה שמאפשר מודל 'pool' בלי שינוי מדיניות.
create policy people_read on people
  for select to authenticated
  using (
    auth_is_staff()
    or id = auth_person_id()
    or guide_id = auth_person_id()
    or exists (
      select 1 from assignments a
       where a.person_id = people.id
         and a.assigned_to = auth_profile_id()
    )
  );

-- כתיבה לפעילים: רכז ואדמין בלבד.
-- מדריך לא מעדכן פעילים ידנית — שינויים עוברים דרך תיעוד השיחה.
create policy people_write on people
  for insert to authenticated with check (auth_is_staff());

create policy people_update on people
  for update to authenticated using (auth_is_staff()) with check (auth_is_staff());

-- אין policy למחיקה: מחיקת פעיל היא פעולת אדמין דרך service role בלבד.


create policy profiles_read on profiles
  for select to authenticated
  using (auth_user_id = auth.uid() or auth_is_staff());

create policy profiles_manage on profiles
  for all to authenticated
  using (auth_is_staff()) with check (auth_is_staff());


-- הזמנות: הטוקן עצמו לעולם לא נקרא מהלקוח — רק דרך redeem_invite()
create policy invites_manage on invites
  for all to authenticated
  using (auth_is_staff()) with check (auth_is_staff());


create policy events_read on events
  for select to authenticated using (true);

create policy events_write on events
  for all to authenticated
  using (auth_is_staff()) with check (auth_is_staff());


create policy event_callers_read on event_callers
  for select to authenticated
  using (profile_id = auth_profile_id() or auth_is_staff());

create policy event_callers_write on event_callers
  for all to authenticated
  using (auth_is_staff()) with check (auth_is_staff());


create policy assignments_read on assignments
  for select to authenticated
  using (assigned_to = auth_profile_id() or auth_is_staff());

create policy assignments_write on assignments
  for all to authenticated
  using (auth_is_staff()) with check (auth_is_staff());

-- המתקשר רשאי לוותר על משימה משלו (pending -> skipped)
create policy assignments_self_skip on assignments
  for update to authenticated
  using (assigned_to = auth_profile_id())
  with check (assigned_to = auth_profile_id());


-- תיעוד שיחות: מותר לרשום רק על משימה שלך. אין update, אין delete —
-- הטבלה הזו היא רשומת האמת ההיסטורית.
create policy contacts_insert on contacts
  for insert to authenticated
  with check (
    contacted_by = auth_profile_id()
    and exists (
      select 1 from assignments a
       where a.id = contacts.assignment_id
         and a.assigned_to = auth_profile_id()
    )
  );

create policy contacts_read on contacts
  for select to authenticated
  using (
    auth_is_staff()
    or exists (
      select 1 from assignments a
       where a.id = contacts.assignment_id
         and a.assigned_to = auth_profile_id()
    )
  );


-- ---------------------------------------------------------------------
-- 7. תצוגות
-- ---------------------------------------------------------------------

-- מי מותר לפנות אליו בכלל. כל יצירת משימות חייבת לעבור דרך זה.
create view callable_people
with (security_invoker = true)
as
select *
  from people
 where status = 'active'
   and do_not_contact = false;


-- התור של המתקשר: המשימה + הקשר קצר להצגה במסך
create view my_queue
with (security_invoker = true)
as
select
  a.id                as assignment_id,
  a.event_id,
  a.state,
  p.id                as person_id,
  p.full_name,
  p.phone_e164,
  p.grade,
  last_c.outcome      as last_outcome,
  last_c.rsvp         as last_rsvp,
  last_c.needs_ride   as last_needs_ride,
  last_c.contacted_at as last_contacted_at,
  coalesce(hist.attended_count, 0) as attended_count,
  coalesce(hist.total_events, 0)   as total_events
from assignments a
join people p on p.id = a.person_id
left join lateral (
  select c.outcome, c.rsvp, c.needs_ride, c.contacted_at
    from contacts c
   where c.assignment_id = a.id
   order by c.contacted_at desc
   limit 1
) last_c on true
left join lateral (
  select
    count(*) filter (where c2.rsvp = 'yes') as attended_count,
    count(distinct a2.event_id)             as total_events
  from assignments a2
  join contacts c2 on c2.assignment_id = a2.id
  where a2.person_id = p.id and a2.event_id <> a.event_id
) hist on true
where a.assigned_to = auth_profile_id();


-- דשבורד הרכז, שורה אחת לפעולה: המספר הגדול + הכיסוי
create view event_stats
with (security_invoker = true)
as
select
  e.id as event_id,
  e.title,
  e.starts_at,
  e.target_count,
  count(a.id)                                          as assigned,
  count(a.id) filter (where a.state = 'done')          as reached,
  count(*) filter (where latest.outcome = 'answered')  as answered,
  count(*) filter (where latest.rsvp = 'yes')          as rsvp_yes,
  count(*) filter (where latest.rsvp = 'maybe')        as rsvp_maybe,
  count(*) filter (where latest.rsvp = 'no')           as rsvp_no,
  count(*) filter (where latest.needs_ride)            as needs_ride
from events e
left join assignments a on a.event_id = e.id
left join lateral (
  select c.rsvp, c.needs_ride, c.outcome
    from contacts c
   where c.assignment_id = a.id
   order by c.contacted_at desc
   limit 1
) latest on true
group by e.id;


-- החתך התפעולי של הרכז: מי מתקדם ומי תקוע.
-- בלי סניפים, זו יחידת החלוקה היחידה שנשארה.
create view caller_progress
with (security_invoker = true)
as
select
  a.event_id,
  pr.id            as profile_id,
  pr.display_name,
  count(*)                                     as assigned,
  count(*) filter (where a.state = 'done')     as reached,
  count(*) filter (where latest.rsvp = 'yes')  as rsvp_yes,
  max(latest.contacted_at)                     as last_activity_at
from assignments a
join profiles pr on pr.id = a.assigned_to
left join lateral (
  select c.rsvp, c.contacted_at
    from contacts c
   where c.assignment_id = a.id
   order by c.contacted_at desc
   limit 1
) latest on true
group by a.event_id, pr.id, pr.display_name;


-- ---------------------------------------------------------------------
-- 8. יצירת משימות לפעולה
--    שתי האסטרטגיות מאחורי אותה קריאה. מריצים עם service role.
-- ---------------------------------------------------------------------

create or replace function generate_assignments(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_strategy assignment_strategy;
  v_count    integer;
begin
  select assignment_strategy into v_strategy
    from events where id = p_event_id;

  if v_strategy = 'by_guide' then
    -- כל מדריך מקבל את החניכים שלו
    insert into assignments (event_id, person_id, assigned_to)
    select p_event_id, p.id, pr.id
      from callable_people p
      join profiles pr on pr.person_id = p.guide_id and pr.is_active
    on conflict (event_id, person_id) do nothing;

  else
    -- חלוקה שווה בין מי שנרשם למשמרות החיוג של הפעולה
    insert into assignments (event_id, person_id, assigned_to)
    select p_event_id, q.id, pool.profile_id
      from (
        select p.id, row_number() over (order by p.full_name) as rn
          from callable_people p
      ) q
      join (
        select ec.profile_id,
               row_number() over (order by ec.profile_id) - 1 as idx,
               count(*) over ()                                as n
          from event_callers ec
         where ec.event_id = p_event_id
      ) pool on (q.rn - 1) % pool.n = pool.idx
    on conflict (event_id, person_id) do nothing;
  end if;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- ---------------------------------------------------------------------
-- 9. טבלת ביניים לייבוא מטופס ההרשמה
--    מייבאים לכאן גולמי, מנרמלים, מזהים כפילויות, ואז מקדמים ל-people.
-- ---------------------------------------------------------------------

create table import_staging (
  id            bigserial primary key,
  raw_name      text,
  raw_phone     text,
  raw_grade     text,
  raw_city      text,
  raw_school    text,
  submitted_at  timestamptz,
  /* ברירת מחדל כדי שאפשר יהיה לייבא CSV עם שלוש עמודות בלבד,
     בלי להוסיף עמודה טכנית לגיליון */
  source        text not null default 'signup_form',
  norm_phone    text generated always as (normalize_il_phone(raw_phone)) stored,
  imported_at   timestamptz,
  reject_reason text
);

create index on import_staging (norm_phone);

alter table import_staging enable row level security;
-- אין policies: נגיש דרך service role בלבד.
