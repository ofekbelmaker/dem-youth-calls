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
-- ✏️ החלף את המחרוזת למטה במשהו אקראי משלך לפני ההרצה, והדבק את
--    אותו ערך בדיוק גם ב-scripts/google-apps-script.gs.
--
-- ליצירת ערך אקראי:
--   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
insert into app_config (key, value)
values ('signup_secret', 'החלף-אותי')
on conflict (key) do update set value = excluded.value;


-- ---------------------------------------------------------------------
-- 2. הדלת הצרה
--
--    מקבלת הרשמה אחת, מנרמלת את הטלפון, ומכניסה ל-people אם הוא חדש.
--    מחזירה מחרוזת מצב כדי שהסקריפט בגיליון יוכל לרשום לוג.
--
--    שים לב: on conflict do nothing הוא מה שהופך את זה לבטוח להרצה
--    חוזרת — מי שכבר קיים פשוט לא נוגעים בו.
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
  on conflict (phone_e164) do nothing;

  get diagnostics v_added = row_count;
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
-- 4. בדיקה — אמור להחזיר 'added' בפעם הראשונה
--    ו-'already_exists' בשנייה.
-- ---------------------------------------------------------------------

-- select submit_signup(
--   'הסוד-שקבעת-למעלה',
--   'בדיקת סנכרון', '050-000-0000', null, 'תל אביב', 'בדיקה', now()
-- );
--
-- ניקוי אחרי הבדיקה:
-- delete from people where full_name = 'בדיקת סנכרון';
