-- =====================================================================
--  סנכרון אוטומטי מטופס ההרשמה
--
--  מטרה: שסקריפט שרץ בגיליון Google יוכל להוסיף נרשמים חדשים —
--  ורק את זה.
--
--  מודל האבטחה:
--    • הסקריפט לא מקבל גישה לטבלאות. הוא יכול לקרוא לפונקציה אחת.
--    • הפונקציה דורשת סוד שנשמר במסד ואינו קריא מבחוץ.
--    • אין דרך לקרוא נתונים דרך הדלת הזו — רק לכתוב הרשמה אחת.
--
--  להריץ אחרי schema.sql.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. מקום לסודות של השרת
--    RLS דלוק בלי אף policy — כלומר אף לקוח לא יכול לקרוא מכאן.
--    רק פונקציות SECURITY DEFINER רואות את התוכן.
-- ---------------------------------------------------------------------

create table if not exists app_config (
  key   text primary key,
  value text not null
);

alter table app_config enable row level security;

-- הסוד שהסקריפט בגיליון יצטרך להציג.
--
-- ✏️ הערך עצמו שמור ב-.env.local תחת SIGNUP_SECRET, ולא בקובץ הזה —
--    הריפו ציבורי. העתק אותו לכאן לפני ההרצה, והדבק את אותו ערך
--    בדיוק גם בסקריפט שב-Apps Script.
--
-- ליצירת ערך אקראי חדש:
--   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
insert into app_config (key, value)
values ('signup_secret', 'כאן-להדביק-מ-env-local')
on conflict (key) do update set value = excluded.value;


-- ---------------------------------------------------------------------
-- 2. הדלת הצרה
--
--    מקבלת הרשמה אחת, מנרמלת את הטלפון, ומכניסה ל-people אם הוא חדש,
--    ואז משבצת אותו לתור של כל פעולה שעוד לא עברה.
--
--    השיבוץ הוא לא פרט טכני: generate_assignments() בונה את המאגר
--    פעם אחת, כשהפעולה נוצרת. בלי השורות למטה, מי שנרשם אחרי שהפעולה
--    כבר נוצרה יישב ב-people ולא יגיע לאף טלפן — כלומר בדיוק מי
--    שההרשמה שלו הכי טרייה הוא היחיד שאף אחד לא מתקשר אליו.
--
--    שים לב: שני ה-on conflict do nothing הם מה שהופך את זה לבטוח
--    להרצה חוזרת — קיים לא נדרס, ושיבוץ קיים לא נכפל.
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

  /* קיים כבר — מאתרים אותו בכל זאת, כי ייתכן שהוא נוסף אחרי
     שהפעולה נוצרה ומעולם לא שובץ */
  if v_person is null then
    select id into v_person from people where phone_e164 = v_phone;
  end if;

  /* שיבוץ לכל פעולה שעוד לא עברה — אותו טווח שהאפליקציה מציגה.
     ה-exists שומר על אותם כללים של callable_people: מי שעזב או
     ביקש שלא יפנו אליו לא נכנס לתור, גם אם מילא את הטופס שוב. */
  insert into assignments (event_id, person_id)
  select e.id, v_person
    from events e
   where e.starts_at >= now()
     and exists (
       select 1 from people p
        where p.id = v_person
          and p.status = 'active'
          and p.do_not_contact = false
     )
  on conflict (event_id, person_id) do nothing;

  return case when v_added then 'added' else 'already_exists' end;
end;
$$;


-- ---------------------------------------------------------------------
-- 3. הרשאות
--    anon יכול להריץ את הפונקציה הזו ותו לא. אין לו גישה לאף טבלה.
-- ---------------------------------------------------------------------

revoke all on function submit_signup(text, text, text, text, text, text, timestamptz)
  from public;

grant execute on function submit_signup(text, text, text, text, text, text, timestamptz)
  to anon;


-- ---------------------------------------------------------------------
-- 4. בדיקה
--
--    הרצה ראשונה מחזירה 'added', שנייה 'already_exists'.
--    השאילתה שאחריה היא העיקר: היא מוודאת שהבדיקה לא רק נכנסה
--    למאגר אלא גם קיבלה מקום בתור של הפעולה הקרובה.
-- ---------------------------------------------------------------------

-- select submit_signup(
--   'הסוד-מ-env-local',
--   'בדיקת סנכרון', '050-000-0000', null, 'תל אביב', 'בדיקה', now()
-- );

-- select e.title as "פעולה", a.state as "מצב"
--   from assignments a
--   join events e on e.id = a.event_id
--   join people p on p.id = a.person_id
--  where p.full_name = 'בדיקת סנכרון';

-- ניקוי אחרי הבדיקה (מוחק גם את השיבוץ):
-- delete from people where full_name = 'בדיקת סנכרון';


-- ---------------------------------------------------------------------
-- 5. השלמה חד-פעמית
--
--    אם יש כבר אנשים ב-people שנוספו אחרי שהפעולה נוצרה ולכן חסרים
--    מהתור — השורה הזו משבצת אותם. בטוחה להרצה חוזרת.
-- ---------------------------------------------------------------------

-- select e.title, generate_assignments(e.id) as "שובצו עכשיו"
--   from events e where e.starts_at >= now();
