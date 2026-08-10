-- =====================================================================
--  מעבר ממאגר מחולק מראש למאגר משותף
--
--  לפני: לכל מתקשר הוקצו שיחות מראש. מי שלא הגיע למשמרת — השיחות
--        שלו לא נעשו, ואף אחד אחר לא ראה אותן.
--  אחרי: רשימה אחת לכולם. כל אחד לוקח מלמעלה כמה שהוא מספיק,
--        וכרטיס שנפתח ננעל זמנית כדי שלא יתקשרו אליו פעמיים.
--
--  להריץ אחרי schema.sql, פעם אחת.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. משימה כבר לא חייבת בעלים
-- ---------------------------------------------------------------------

alter table assignments alter column assigned_to drop not null;

alter table assignments
  add column if not exists claimed_at timestamptz;

create index if not exists assignments_open_idx
  on assignments (event_id, state)
  where state = 'pending';

/* משחרר את החלוקה הקיימת — מה שלא תועד חוזר למאגר המשותף */
update assignments
   set assigned_to = null, claimed_at = null
 where state = 'pending';


-- ---------------------------------------------------------------------
-- 2. יצירת משימות — ללא בעלים
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
    from callable_people p
  on conflict (event_id, person_id) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. תפיסת כרטיס
--
--    התנאי ב-where הוא מה שמונע מרוץ: אם שני מתקשרים לוחצים על
--    אותו שם באותה שנייה, רק אחד מהם יעדכן שורה, והשני יקבל false.
--    זו אטומיות של המסד — לא אפשר להשיג אותה בקוד האפליקציה.
-- ---------------------------------------------------------------------

create or replace function claim_assignment(
  p_assignment uuid,
  p_profile    uuid,
  p_window     interval default '10 minutes'
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ok boolean;
begin
  update assignments
     set assigned_to = p_profile,
         claimed_at  = now()
   where id = p_assignment
     and state = 'pending'
     and (
       assigned_to is null
       or assigned_to = p_profile
       or claimed_at is null
       or claimed_at < now() - p_window
     );

  get diagnostics v_ok = row_count;
  return v_ok;
end;
$$;


-- ---------------------------------------------------------------------
-- 4. שחרור כרטיס שנפתח ולא תועד
-- ---------------------------------------------------------------------

create or replace function release_assignment(
  p_assignment uuid,
  p_profile    uuid
)
returns void
language sql
security definer
set search_path = public
as $$
  update assignments
     set assigned_to = null, claimed_at = null
   where id = p_assignment
     and assigned_to = p_profile
     and state = 'pending'
     and not exists (select 1 from contacts c where c.assignment_id = assignments.id);
$$;


-- ---------------------------------------------------------------------
-- 5. בדיקה
-- ---------------------------------------------------------------------

select
  count(*)                                            as "משימות",
  count(*) filter (where assigned_to is null)         as "פנויות",
  count(*) filter (where state = 'done')              as "הושלמו"
from assignments;
