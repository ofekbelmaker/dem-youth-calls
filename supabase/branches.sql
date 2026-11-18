-- =====================================================================
--  סניפים
--
--  schema.sql נכתב עם ההערה "מבנה שטוח: אין סניפים... אם יידרשו
--  סניפים בעתיד זו הוספה של טבלה ועמודת branch_id — לא שינוי
--  במבנה". זה בדיוק מה שקורה כאן.
--
--  שלוש שאלות נפרדות, ולכל אחת תשובה משלה:
--
--    • לאיזה סניף שייך הטלפן?      profiles.branch_id
--      קובע איזה קמפיין הוא רואה כשהוא נכנס.
--
--    • לאיזה סניף שייך הקמפיין?    events.branch_id
--      קובע מי נכנס לרשימת השיחות שלו.
--
--    • לאיזה סניף שייך הפעיל?      נגזר מהיישוב, דרך branch_cities
--      לא עמודה: אדם יכול להשתייך לכמה סניפים, וזו הייתה ההחלטה —
--      פעיל מהצפון נשאר גם ברשימה המרכזית.
--
--  הסניף המרכזי מסומן covers_all, כלומר הרשימה שלו היא כל מי
--  שמותר לפנות אליו, בלי סינון גיאוגרפי. זה שומר על ההתנהגות
--  הקיימת בדיוק כפי שהייתה.
--
--  להריץ אחרי live-list.sql.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. הסניפים
-- ---------------------------------------------------------------------

create table if not exists branches (
  id         uuid primary key default gen_random_uuid(),
  name       text unique not null,
  /* רשימת הסניף היא כל המאגר, בלי סינון לפי יישוב */
  covers_all boolean not null default false,
  created_at timestamptz not null default now()
);

alter table branches enable row level security;
-- בלי policies: נגיש רק דרך השרת, כמו שאר הטבלאות

insert into branches (name, covers_all) values
  ('מרכז', true),
  ('חיפה והצפון', false)
on conflict (name) do nothing;


-- ---------------------------------------------------------------------
-- 2. שיוך טלפנים וקמפיינים
--
--    הקיימים עוברים למרכז, כדי ששום דבר לא ישנה התנהגות ברגע
--    שהקובץ הזה רץ.
-- ---------------------------------------------------------------------

alter table profiles add column if not exists branch_id uuid references branches(id);
alter table events   add column if not exists branch_id uuid references branches(id);

update profiles set branch_id = (select id from branches where name = 'מרכז')
 where branch_id is null;

update events set branch_id = (select id from branches where name = 'מרכז')
 where branch_id is null;

create index if not exists profiles_branch_idx on profiles (branch_id);
create index if not exists events_branch_idx   on events (branch_id);


-- ---------------------------------------------------------------------
-- 3. היישוב
--
--    אין עמודת יישוב. הוא נשמר בתוך notes בצורה "יישוב · בית ספר",
--    ולכן נחלץ מכאן. כשהנרשם לא מילא יישוב, בית הספר נשאר ראשון
--    ומה שיחזור יהיה שם בית ספר — וזה בסדר: רק מחרוזות שנמצאות
--    ב-branch_cities נחשבות, ושם בית ספר פשוט לא יופיע שם.
--
--    ההגנה היא ברשימה המפורשת, לא בחילוץ.
-- ---------------------------------------------------------------------

create or replace function city_of(p_notes text)
returns text
language sql
immutable
as $$
  select nullif(btrim(split_part(coalesce(p_notes, ''), ' · ', 1)), '');
$$;


create table if not exists branch_cities (
  branch_id uuid not null references branches(id) on delete cascade,
  city      text not null,
  primary key (branch_id, city)
);

alter table branch_cities enable row level security;


-- ---------------------------------------------------------------------
-- 4. מי ברשימה של כל סניף
-- ---------------------------------------------------------------------

create or replace function people_for_branch(p_branch uuid)
returns setof people
language sql
stable
security definer
set search_path = public
as $$
  select p.*
    from callable_people p
   where p_branch is null
      or exists (select 1 from branches b
                  where b.id = p_branch and b.covers_all)
      or exists (select 1 from branch_cities bc
                  where bc.branch_id = p_branch
                    and bc.city = city_of(p.notes));
$$;


-- ---------------------------------------------------------------------
-- 5. יצירת משימות — לפי הסניף של הקמפיין
--
--    מחליף את הגרסה שב-migration-shared-list.sql. ההתנהגות לקמפיין
--    של המרכז זהה לחלוטין לקודמתה, כי covers_all מבטל את הסינון.
-- ---------------------------------------------------------------------

create or replace function generate_assignments(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  insert into assignments (event_id, person_id)
  select p_event_id, p.id
    from people_for_branch((select branch_id from events where id = p_event_id)) p
  on conflict (event_id, person_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- ---------------------------------------------------------------------
-- 6. הקמפיין הפעיל — לפי הסניף של הטלפן
--
--    אותו כלל כמו קודם (הקרוב שעוד לא עבר, ואם אין — האחרון שהיה),
--    רק בתוך הסניף. הגרסה בלי פרמטר נשארת ומצביעה על המרכז, כדי
--    ש-duplicates.sql וכל מה שכבר קורא לה ימשיכו לעבוד.
-- ---------------------------------------------------------------------

create or replace function active_event(p_branch uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select id from events
      where branch_id is not distinct from p_branch and starts_at >= now()
      order by starts_at limit 1),
    (select id from events
      where branch_id is not distinct from p_branch
      order by starts_at desc limit 1)
  );
$$;

create or replace function active_event()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select active_event((select id from branches where name = 'מרכז'));
$$;


-- ---------------------------------------------------------------------
-- 7. הצטרפות אוטומטית לרשימה — עכשיו מודעת לסניף
--
--    מחליף את הטריגר מ-live-list.sql. ההבדל: נרשם חדש נכנס רק
--    לקמפיינים של סניפים שהוא שייך אליהם. בלי זה, פעיל מתל אביב
--    היה נכנס לרשימת הצפון ברגע שהוא נרשם.
-- ---------------------------------------------------------------------

create or replace view open_events
with (security_invoker = true)
as
select *
  from events
 where starts_at >= now()
    or id = active_event(branch_id);


create or replace function sync_person_to_open_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'active' and new.do_not_contact = false then
    insert into assignments (event_id, person_id)
    select e.id, new.id
      from open_events e
     where exists (
       select 1 from people_for_branch(e.branch_id) pb where pb.id = new.id
     )
    on conflict (event_id, person_id) do update
       set state = 'pending'
     where assignments.state = 'skipped'
       and not exists (
         select 1 from contacts c where c.assignment_id = assignments.id
       );

  else
    update assignments a
       set state = 'skipped'
     where a.person_id = new.id
       and a.state = 'pending'
       and a.event_id in (select id from open_events)
       and not exists (
         select 1 from contacts c where c.assignment_id = a.id
       );
  end if;

  return null;
end;
$$;


-- ---------------------------------------------------------------------
-- 8. הדלת מהטופס — גם היא מודעת לסניף
--
--    submit_signup נכתבה לפני שסניפים היו קיימים, ולכן היא משבצת
--    נרשם חדש לכל קמפיין שעוד לא עבר, בלי לשאול של מי הקמפיין.
--    התוצאה: נרשם מחולון נכנס לרשימת הצפון.
--
--    כאן היא נדרסת בגרסה שעוברת דרך people_for_branch — אותו כלל
--    יחיד שקובע מי ברשימה של כל סניף. שאר הפונקציה זהה, כולל
--    האיתור של מי שכבר קיים ומעולם לא שובץ.
--
--    ⚠️ הרצה חוזרת של auto-sync.sql תחזיר את הגרסה העיוורת לסניפים.
--       אם הרצת אותו שוב, הרץ אחריו גם את הקובץ הזה.
-- ---------------------------------------------------------------------

create or replace function submit_signup(
  p_secret       text,
  p_name         text,
  p_phone        text,
  p_grade        text default null,
  p_city         text default null,
  p_school       text default null,
  p_submitted_at timestamptz default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret text;
  v_phone  text;
  v_name   text;
  v_person uuid;
  v_added  boolean;
begin
  select value into v_secret from app_config where key = 'signup_secret';
  if v_secret is null or p_secret is distinct from v_secret then
    raise exception 'denied';
  end if;

  v_name := btrim(coalesce(p_name, ''));
  if v_name = '' then
    return 'missing_name';
  end if;

  v_phone := normalize_il_phone(p_phone);
  if v_phone is null then
    return 'invalid_phone';
  end if;

  insert into people (
    full_name, phone_e164, grade, notes, consent_source, consent_at
  )
  values (
    v_name,
    v_phone,
    nullif(btrim(coalesce(p_grade, '')), ''),
    nullif(concat_ws(' · ',
      nullif(btrim(coalesce(p_city, '')), ''),
      nullif(btrim(coalesce(p_school, '')), '')), ''),
    'form_live',
    coalesce(p_submitted_at, now())
  )
  on conflict (phone_e164) do nothing
  returning id into v_person;

  v_added := v_person is not null;

  if v_person is null then
    select id into v_person from people where phone_e164 = v_phone;
  end if;

  insert into assignments (event_id, person_id)
  select e.id, v_person
    from events e
   where e.starts_at >= now()
     and exists (
       select 1 from people_for_branch(e.branch_id) pb where pb.id = v_person
     )
  on conflict (event_id, person_id) do nothing;

  return case when v_added then 'added' else 'already_exists' end;
end;
$$;


-- ---------------------------------------------------------------------
-- 9. אימות
-- ---------------------------------------------------------------------

select b.name as "סניף",
       b.covers_all as "כל המאגר",
       (select count(*) from branch_cities bc where bc.branch_id = b.id) as "יישובים",
       (select count(*) from people_for_branch(b.id))                    as "ברשימה",
       (select count(*) from profiles pr where pr.branch_id = b.id)      as "טלפנים"
  from branches b
 order by b.covers_all desc, b.name;
