-- =====================================================================
--  תיעוד דילוגים
--
--  המטרה העיקרית: לגלות מי שכולם מדלגים עליו.
--  אדם שאף אחד לא מכיר יכול להסתובב במאגר לנצח — כל טלפן רואה אותו
--  פעם אחת, מדלג, וממשיך — והוא נראה בדשבורד בדיוק כמו מי שפשוט
--  עוד לא הגיע אליו התור. זה בדיוק מי שהכי חשוב שיקבל שיחה.
--
--  תועלת נלווית: אי אפשר יותר לעבור על הרשימה בלי להשאיר עקבות.
--
--  להריץ אחרי migration-shared-list.sql.
-- =====================================================================

create table if not exists skips (
  id            uuid primary key default gen_random_uuid(),
  assignment_id uuid not null references assignments(id) on delete cascade,
  profile_id    uuid not null references profiles(id) on delete cascade,
  skipped_at    timestamptz not null default now()
);

create index if not exists skips_assignment_idx on skips (assignment_id);

alter table skips enable row level security;
-- בלי policies: נגיש רק דרך השרת, כמו שאר הטבלאות


-- ---------------------------------------------------------------------
-- שחרור עם תיעוד
--
-- מחליף את release_assignment: אותה התנהגות, פלוס רישום.
-- ההחזרה למאגר נשארת מיידית — מי שדילגו עליו זמין מיד לכל אחד אחר.
-- ---------------------------------------------------------------------

create or replace function release_assignment(
  p_assignment uuid,
  p_profile    uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  /* רק אם הכרטיס באמת היה בידיו ולא תועד עליו כלום */
  if not exists (
    select 1 from assignments a
     where a.id = p_assignment
       and a.assigned_to = p_profile
       and a.state = 'pending'
       and not exists (select 1 from contacts c where c.assignment_id = a.id)
  ) then
    return;
  end if;

  insert into skips (assignment_id, profile_id)
  values (p_assignment, p_profile);

  update assignments
     set assigned_to = null, claimed_at = null
   where id = p_assignment;
end;
$$;


-- ---------------------------------------------------------------------
-- מי שכולם מדלגים עליו
--
-- רק פעילים שעדיין לא קיבלו שיחה. ברגע שמישהו תיעד שיחה,
-- הם יורדים מהרשימה הזו גם אם דילגו עליהם קודם.
-- ---------------------------------------------------------------------

create or replace view neglected_people
with (security_invoker = true)
as
select
  a.event_id,
  p.id            as person_id,
  p.full_name,
  p.phone_e164,
  p.notes,
  count(s.id)                 as skip_count,
  count(distinct s.profile_id) as skipped_by,
  max(s.skipped_at)           as last_skipped_at
from assignments a
join people p on p.id = a.person_id
join skips  s on s.assignment_id = a.id
where a.state = 'pending'
  and not exists (select 1 from contacts c where c.assignment_id = a.id)
group by a.event_id, p.id
having count(s.id) >= 3
order by count(s.id) desc;


-- ---------------------------------------------------------------------
-- בדיקה
-- ---------------------------------------------------------------------

-- select count(*) as "דילוגים שנרשמו" from skips;
-- select * from neglected_people;
