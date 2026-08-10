-- =====================================================================
--  סדר אקראי בחלוקת הכרטיסים
--
--  שתי סיבות:
--    1. סדר אלפביתי אומר שמי שבסוף הרשימה כמעט אף פעם לא מקבל שיחה,
--       כי ערב חיוג נגמר לפני שמגיעים אליו — ותמיד אותם אנשים.
--    2. סדר קבוע ניתן לחיזוי, ולכן קל "לצוד" מכרים מוכרים דרך דילוגים.
--
--  להריץ אחרי next-card.sql. מחליף את הפונקציה הקיימת.
-- =====================================================================

create or replace function next_assignment(
  p_event   uuid,
  p_profile uuid,
  p_exclude uuid[] default '{}',
  p_window  interval default '10 minutes'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  /* כרטיס שכבר מוחזק אצלי ולא תועד — מחזירים אותו, כדי שרענון דף
     לא יבזבז פעיל ולא ישאיר כרטיסים תפוסים מאחור */
  select a.id into v_id
    from assignments a
   where a.event_id = p_event
     and a.state = 'pending'
     and a.assigned_to = p_profile
     and not (a.id = any(p_exclude))
     and not exists (select 1 from contacts c where c.assignment_id = a.id)
   limit 1;

  if v_id is not null then
    update assignments set claimed_at = now() where id = v_id;
    return v_id;
  end if;

  /* אחרת — פנוי אקראי מתוך המאגר */
  select a.id into v_id
    from assignments a
   where a.event_id = p_event
     and a.state = 'pending'
     and not (a.id = any(p_exclude))
     and (
       a.assigned_to is null
       or a.claimed_at is null
       or a.claimed_at < now() - p_window
     )
   order by random()
   for update skip locked
   limit 1;

  if v_id is null then
    return null;
  end if;

  update assignments
     set assigned_to = p_profile, claimed_at = now()
   where id = v_id;

  return v_id;
end;
$$;


-- ---------------------------------------------------------------------
-- בדיקה: חמש מסירות רצופות אמורות להחזיר חמישה אנשים שונים
-- ובסדר שאינו אלפביתי
-- ---------------------------------------------------------------------

-- with e as (select id from events order by starts_at desc limit 1),
--      p as (select id from profiles order by created_at limit 1)
-- select pe.full_name
-- from generate_series(1,5) i,
--      lateral (select next_assignment((select id from e), (select id from p))) n(id),
--      assignments a, people pe
-- where a.id = n.id and pe.id = a.person_id;
--
-- שחרור אחרי הבדיקה:
-- update assignments set assigned_to = null, claimed_at = null where state = 'pending';
