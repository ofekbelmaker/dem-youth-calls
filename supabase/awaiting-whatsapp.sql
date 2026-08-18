-- =====================================================================
--  "ממתין לתשובה בוואטסאפ"
--
--  הרקע: טלפנים דיווחו שרוב האנשים לא עונים בוואטסאפ מיד. עד עכשיו
--  לא הייתה לזה תשובה טובה — 'לא ענה' סוגר את הנושא ומחזיר את האדם
--  למאגר, ו'שיחזרו אליו' משאיר אותו שם. בשני המקרים ההודעה שנשלחה
--  הולכת לאיבוד, וטלפן אחר עלול לשלוח הודעה שנייה לאותו אדם.
--
--  מה שנוסף:
--    • תוצאה חדשה שלא סוגרת את המשימה.
--    • מי שסומן בה יורד מהמאגר המשותף ונשמר בספרייה של הטלפן
--      שסימן אותו — ורק שלו.
--    • כשמגיעה תשובה, אותו טלפן מתעד רטרואקטיבית מהספרייה.
--
--  ⚠️  להריץ בשני שלבים נפרדים. סעיף 1 לבד, ואז השאר.
--      Postgres לא מרשה להשתמש בערך חדש של enum באותה טרנזקציה
--      שבה הוא נוצר, וה-SQL Editor מריץ כל הרצה כטרנזקציה אחת.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. הערך החדש  ←  לסמן רק את השורה הזו ולהריץ
-- ---------------------------------------------------------------------

alter type contact_outcome add value if not exists 'awaiting_whatsapp';


-- =====================================================================
--  ⬇️  עד כאן שלב ראשון. מכאן ולמטה — הרצה שנייה נפרדת.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 2. המאגר המשותף מדלג על מי שממתין לתשובה
--
--    הסעיף החדש הוא תת-השאילתה בסוף: התוצאה האחרונה שתועדה על
--    המשימה. "האחרונה" ולא "אי פעם" — אחרת מי שכבר קיבל תיעוד
--    אמיתי אחרי ההמתנה היה נשאר מחוץ למאגר לתמיד.
--
--    is distinct from מטפל גם במשימה בלי תיעוד כלל (null), שצריכה
--    להישאר זמינה.
-- ---------------------------------------------------------------------

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
     and (
       select c.outcome
         from contacts c
        where c.assignment_id = a.id
        order by c.contacted_at desc, c.id desc
        limit 1
     ) is distinct from 'awaiting_whatsapp'::contact_outcome
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
-- 3. הספרייה — פרטית לטלפן שסימן
--
--    הבעלות נקבעת לפי מי שתיעד את ההמתנה (contacts.contacted_by)
--    ולא לפי assignments.assigned_to, כי assigned_to משתחרר
--    בחלון תפיסה ואילו ההמתנה אמורה להישאר צמודה לאדם שכתב.
-- ---------------------------------------------------------------------

create or replace view awaiting_whatsapp_queue
with (security_invoker = true)
as
select
  a.id             as assignment_id,
  a.event_id,
  last_c.contacted_by as owner_profile_id,
  last_c.contacted_at as waiting_since,
  a.person_id,
  p.full_name,
  p.phone_e164,
  p.grade,
  p.notes
from assignments a
join people p on p.id = a.person_id
join lateral (
  select c.contacted_by, c.contacted_at, c.outcome
    from contacts c
   where c.assignment_id = a.id
   order by c.contacted_at desc, c.id desc
   limit 1
) last_c on true
where a.state = 'pending'
  and last_c.outcome = 'awaiting_whatsapp';


-- ---------------------------------------------------------------------
-- 4. בדיקה
-- ---------------------------------------------------------------------

-- כמה ממתינים, ואצל מי:
-- select pr.display_name as "טלפן", count(*) as "ממתינים"
--   from awaiting_whatsapp_queue q
--   join profiles pr on pr.id = q.owner_profile_id
--  group by pr.display_name;

-- ודא שהם באמת ירדו מהמאגר: המספר אמור לרדת בהתאם
-- select count(*) as "זמינים במאגר"
--   from assignments a
--  where a.state = 'pending'
--    and (select c.outcome from contacts c where c.assignment_id = a.id
--          order by c.contacted_at desc, c.id desc limit 1)
--        is distinct from 'awaiting_whatsapp'::contact_outcome;
