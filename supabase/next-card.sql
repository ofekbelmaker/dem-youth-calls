-- =====================================================================
--  "אחד בכל פעם" — חלוקת הכרטיס הבא
--
--  במקום שהטלפן יבחר מרשימה, המסד מוסר לו פעיל אחד ותופס אותו עבורו.
--
--  שני מנגנונים מונעים ששניים יקבלו את אותו אדם:
--    • for update skip locked — מי שכבר נבחר על ידי בקשה מקבילה
--      פשוט מדולג, בלי לחכות ובלי לקרוס.
--    • claimed_at — כרטיס שנמסר שמור לעשר דקות, ואם לא תועד
--      הוא חוזר למאגר מעצמו.
--
--  להריץ אחרי migration-shared-list.sql.
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
  /* אם כבר מוחזק אצלי כרטיס שלא תועד — מחזירים אותו, כדי שרענון
     דף לא יבזבז פעיל ולא ישאיר כרטיסים תפוסים מאחור */
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

  /* אחרת — הפנוי הבא לפי סדר האלף-בית */
  select a.id into v_id
    from assignments a
    join people p on p.id = a.person_id
   where a.event_id = p_event
     and a.state = 'pending'
     and not (a.id = any(p_exclude))
     and (
       a.assigned_to is null
       or a.claimed_at is null
       or a.claimed_at < now() - p_window
     )
   order by p.full_name
   for update of a skip locked
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
-- בדיקה: מסירת כרטיס לטלפן הראשון ברשימה, ואז שחרורו בחזרה
-- ---------------------------------------------------------------------

-- select next_assignment(
--   (select id from events order by starts_at desc limit 1),
--   (select id from profiles order by created_at limit 1)
-- );
--
-- update assignments set assigned_to = null, claimed_at = null
--  where assigned_to = (select id from profiles order by created_at limit 1)
--    and state = 'pending';
