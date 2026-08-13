-- =====================================================================
--  הרשימה מתעדכנת מהטופס
--
--  מה היה חסר: submit_signup() מכניסה נרשם חדש ל-people ונעצרת שם.
--  אבל הכרטיסים שהטלפנים מקבלים מגיעים מ-assignments, שמתמלאת פעם
--  אחת בלבד — ברגע יצירת הפעולה. כלומר כל מי שנרשם אחרי אותו רגע
--  נכנס למסד, נראה מצוין בטבלה, ולעולם לא יוצא ממנה כשיחה.
--
--  מה זה מוסיף: ההצטרפות לרשימה הופכת לתוצאה של המסד עצמו. כל מי
--  שנעשה בר-פנייה — נרשם חדש מהטופס, או מי שרכז החזיר לפעילות —
--  נכנס מיד לרשימה של כל פעולה פתוחה. באותה נשימה, מי שחדל להיות
--  בר-פנייה יוצא ממנה.
--
--  למה טריגר ולא ריענון תקופתי: הטריגר הוא היחיד שאי אפשר לשכוח
--  להריץ. ריענון ידני ייעלם בדיוק בערב שבו יש הכי הרבה הרשמות
--  ופחות מכל זמן לזכור אותו.
--
--  הרשאות: הטריגר SECURITY DEFINER, ולכן anon לא מקבל שום גישה
--  ל-assignments. הדלת הצרה של auto-sync.sql נשארת צרה בדיוק כפי
--  שהייתה — היא פשוט מגיעה עכשיו עד הסוף.
--
--  להריץ אחרי migration-shared-list.sql ו-auto-sync.sql.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. איזו פעולה האפליקציה מציגה
--
--    שכפול מכוון של הכלל מ-lib/queries.ts:getActiveEvent — הפעולה
--    הקרובה שעוד לא עברה, ואם אין כזו, האחרונה שהייתה.
--
--    המסד צריך את הכלל הזה כדי לדעת לאן להכניס נרשם חדש, ומחיר
--    הכפילות קטן ממחיר הטעות: נרשם שייכנס לפעולה אחרת מזו שעל
--    המסך פשוט לא יראה אף אחד.
-- ---------------------------------------------------------------------

create or replace function active_event()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select id from events where starts_at >= now() order by starts_at limit 1),
    (select id from events order by starts_at desc limit 1)
  );
$$;


-- ---------------------------------------------------------------------
-- 2. הפעולות שעדיין קולטות אנשים
--
--    כל מה שעוד לא עבר, ובנוסף הפעולה שמוצגת כרגע — כדי שגם ערב
--    חיוג שנמשך אחרי שעת ההתחלה עדיין יקלוט נרשמים.
-- ---------------------------------------------------------------------

create or replace view open_events
with (security_invoker = true)
as
select *
  from events
 where starts_at >= now()
    or id = active_event();


-- ---------------------------------------------------------------------
-- 3. הטריגר
--
--    שים לב לכיוון השני: מי שסומן 'עזב' או 'אל תפנו אליי' מקבל
--    'skipped' ולא נמחק. שתי סיבות — הדשבורד ממשיך לספור נכון כמה
--    שיחות היו ברשימה, ומחיקה של משימה מוחקת איתה את ההיסטוריה.
--
--    ו-do update הוא מה שסוגר את המעגל: מי שהוחזר לפעילות כבר יש לו
--    שורת משימה, ולכן insert לבדו היה נבלע ב-do nothing והוא היה
--    נשאר מחוץ לרשימה לנצח.
--
--    'skipped' חד-משמעי כאן: דילוג של טלפן משאיר 'pending' ורושם
--    ל-skips (ראה skip-log.sql), כך שהמצב הזה נוצר רק מנהלית.
--
--    התנאי not exists על contacts הוא מה שמגן על שיחה שכבר תועדה:
--    אף פעם לא נוגעים בכרטיס שמישהו כבר עבד עליו, לשום כיוון.
-- ---------------------------------------------------------------------

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

  return null;   -- after trigger: ערך ההחזרה לא נקרא
end;
$$;

drop trigger if exists people_sync_open_events on people;

create trigger people_sync_open_events
  after insert or update of status, do_not_contact on people
  for each row execute function sync_person_to_open_events();


-- ---------------------------------------------------------------------
-- 4. השלמת הפער שנפתח עד עכשיו
--
--    הטריגר תופס רק מה שנכתב מכאן והלאה. מי שכבר יושב ב-people
--    ואינו ברשימה — הייבוא הידני, ונרשמים שהגיעו לפני שהקובץ הזה
--    הורץ — נכנס כאן. generate_assignments בטוחה להרצה חוזרת.
-- ---------------------------------------------------------------------

select
  e.title                                as "פעולה",
  to_char(e.starts_at, 'DD/MM HH24:MI')  as "מתי",
  generate_assignments(e.id)             as "נוספו לרשימה"
from open_events e
order by e.starts_at;


-- ---------------------------------------------------------------------
-- 5. אימות — שתי השורות אמורות להראות אפס
-- ---------------------------------------------------------------------

select
  (select count(*)
     from callable_people p
    where not exists (
      select 1 from assignments a
       where a.person_id = p.id
         and a.event_id = active_event()
    ))                                        as "בר-פנייה שאינו ברשימה",

  (select count(*)
     from assignments a
     join people p on p.id = a.person_id
    where a.event_id = active_event()
      and a.state = 'pending'
      and (p.status <> 'active' or p.do_not_contact))
                                              as "ברשימה למרות שאין לפנות אליו";


-- מאיפה הגיעו האנשים שבמסד — הייבוא הידני מול הסנכרון החי
select
  coalesce(consent_source, '(לא מסומן)')  as "מקור",
  count(*)                                as "כמה",
  to_char(max(created_at), 'DD/MM HH24:MI') as "אחרון"
from people
group by 1
order by 2 desc;


-- ---------------------------------------------------------------------
-- 6. בדיקה מקצה לקצה — הרשמה מדומה שאמורה להופיע ברשימה
--    הסר הערה, החלף את הסוד, והרץ. ואז נקה.
-- ---------------------------------------------------------------------

-- select submit_signup(
--   'הסוד-שקבעת-ב-auto-sync',
--   'בדיקת רשימה חיה', '050-000-0001', null, 'תל אביב', 'בדיקה', now()
-- );
--
-- select p.full_name, a.state, e.title
--   from people p
--   join assignments a on a.person_id = p.id
--   join events e      on e.id = a.event_id
--  where p.full_name = 'בדיקת רשימה חיה';
--
-- ניקוי (מוחק גם את המשימה, דרך on delete cascade):
-- delete from people where full_name = 'בדיקת רשימה חיה';
