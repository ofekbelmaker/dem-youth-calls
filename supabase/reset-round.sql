-- =====================================================================
--  איפוס סבב חיוג
--
--  מחליף את new-event.sql כשלא רוצים לתת שם חדש בכל פעם: השם קבוע
--  ("טלפונים נוער"), ולפני כל פעולה מריצים את הקובץ הזה ומקבלים
--  מאגר נקי עם כל הפעילים.
--
--  למה סבב חדש ולא איפוס במקום:
--    האיפוס נראה מבחוץ כאילו מחקנו הכול, אבל בפועל הסבב הקודם נשאר
--    שלם — מי ענה, מי אישר הגעה, מי ביקש שלא יפנו אליו. מחיקת
--    contacts הייתה מוחקת גם את "אל תפנו אליי", ואותם אנשים היו
--    חוזרים לתור בסבב הבא. זה בדיוק מה שאסור שיקרה.
--
--  אפשר להריץ שוב ושוב. כל הרצה = סבב חדש.
-- =====================================================================

do $$
declare
  ------------------------------------------------------------------
  -- ✏️  השורה היחידה לעריכה: מתי הפעולה הבאה
  ------------------------------------------------------------------
  v_when  timestamptz := '2026-08-24 18:30';   -- שנה-חודש-יום שעה
  ------------------------------------------------------------------

  v_title text := 'טלפונים נוער';
  v_prev  events%rowtype;
  v_event uuid;
  v_count integer;
begin
  select * into v_prev from events order by starts_at desc limit 1;

  /* סבב קודם שעדיין לא הגיע — סוגרים אותו, אחרת האפליקציה תמשיך
     להציג אותו: היא בוחרת תמיד את הקרוב ביותר שעוד לא עבר.
     סבב שכבר עבר מעצמו נשאר עם התאריך האמיתי שלו. */
  if v_prev.id is not null and v_prev.starts_at >= now() then
    update events set starts_at = now() - interval '1 minute'
     where id = v_prev.id;
    raise notice 'הסבב הקודם נסגר';
  end if;

  /* מקום ויעד נגררים מהסבב הקודם — שינוי שלהם הוא החריג, לא הכלל */
  insert into events (title, starts_at, location, target_count, assignment_strategy)
  values (v_title, v_when, v_prev.location, v_prev.target_count, 'pool')
  returning id into v_event;

  v_count := generate_assignments(v_event);

  raise notice 'סבב חדש · % · % שיחות במאגר',
    to_char(v_when, 'DD/MM/YYYY HH24:MI'), v_count;
end;
$$;


-- ---------------------------------------------------------------------
-- אימות: הסבבים לפי סדר, החדש למעלה
-- ---------------------------------------------------------------------

select
  to_char(e.starts_at, 'DD/MM/YYYY HH24:MI')                as "מתי",
  case when e.starts_at >= now() then '● פעיל' else '' end  as "",
  count(a.id)                                               as "במאגר",
  count(a.id) filter (where a.state = 'done')               as "בוצעו"
from events e
left join assignments a on a.event_id = e.id
group by e.id
order by e.starts_at desc;


-- ---------------------------------------------------------------------
--  ביטול סבב שנוצר בטעות — מוחק אותו ואת השיחות שתועדו בו.
--  רק על סבב שעוד לא עבר, וכשאתה בטוח שלא תיעדו בו כלום:
--
--    delete from events
--     where starts_at >= now()
--       and not exists (
--         select 1 from assignments a
--           join contacts c on c.assignment_id = a.id
--          where a.event_id = events.id
--       );
-- ---------------------------------------------------------------------
