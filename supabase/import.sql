-- =====================================================================
--  ייבוא רשימת הפעילים מטופס ההרשמה
--
--  להריץ אחרי ש-import_staging כבר מלאה (ייבוא CSV מהדשבורד).
--  מריצים בלוק אחרי בלוק, לא הכל בבת אחת — הבדיקה לפני הקידום היא
--  כל העניין.
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. בדיקה לפני שנוגעים במשהו
--    norm_phone מחושב אוטומטית מ-raw_phone. אם הוא null, המספר לא תקין.
-- ---------------------------------------------------------------------

select
  count(*)                                          as "סה״כ שורות",
  count(*) filter (where norm_phone is null)        as "מספר לא תקין",
  count(*) - count(distinct norm_phone)             as "כפילויות",
  count(distinct norm_phone)                        as "פעילים ייחודיים"
from import_staging
where imported_at is null;


-- ---------------------------------------------------------------------
-- 2. הצצה למה שנדחה, לפני שמוותרים עליו
--    לרוב אלה מספרים עם ספרה חסרה או טקסט חופשי במקום מספר.
-- ---------------------------------------------------------------------

select raw_name, raw_phone
from import_staging
where imported_at is null and norm_phone is null
limit 50;


-- ---------------------------------------------------------------------
-- 2ב. הסרת רשומות בדיקה וספאם, לפני הקידום
--     הסקריפט מסמן אותן בדוח; כאן מוחקים אותן מטבלת הביניים.
--     בדוק את הרשימה לפני שאתה מריץ.
-- ---------------------------------------------------------------------

select id, raw_name, raw_phone
from import_staging
where imported_at is null
  and (raw_name ilike '%בדיקה%' or raw_name !~ '[֐-׿]');

-- delete from import_staging
--  where imported_at is null
--    and (raw_name ilike '%בדיקה%' or raw_name !~ '[֐-׿]');


-- ---------------------------------------------------------------------
-- 3. הקידום עצמו
--    מכל קבוצת כפילויות נשמרת ההרשמה המוקדמת ביותר.
--    on conflict מגן מפני הרצה כפולה של הבלוק הזה.
-- ---------------------------------------------------------------------

with ranked as (
  select
    s.*,
    row_number() over (
      partition by s.norm_phone
      order by s.submitted_at nulls last, s.id
    ) as rn
  from import_staging s
  where s.imported_at is null
    and s.norm_phone is not null
    and btrim(coalesce(s.raw_name, '')) <> ''
)
insert into people (full_name, phone_e164, grade, notes, consent_source, consent_at)
select
  btrim(r.raw_name),
  r.norm_phone,
  nullif(btrim(coalesce(r.raw_grade, '')), ''),
  /* יישוב ובית ספר נשמרים כהקשר למתקשר */
  nullif(
    concat_ws(' · ',
      nullif(btrim(coalesce(r.raw_city, '')), ''),
      nullif(btrim(coalesce(r.raw_school, '')), '')),
    ''),
  r.source,
  coalesce(r.submitted_at, now())
from ranked r
where r.rn = 1
on conflict (phone_e164) do nothing;


-- ---------------------------------------------------------------------
-- 4. סימון מה נכנס ומה לא
-- ---------------------------------------------------------------------

update import_staging s
   set imported_at = now()
 where s.imported_at is null
   and s.norm_phone is not null
   and exists (select 1 from people p where p.phone_e164 = s.norm_phone);

update import_staging s
   set reject_reason = case
         when s.norm_phone is null then 'מספר טלפון לא תקין'
         when btrim(coalesce(s.raw_name, '')) = '' then 'חסר שם'
         else 'לא יובא'
       end
 where s.imported_at is null and s.reject_reason is null;


-- ---------------------------------------------------------------------
-- 5. סיכום
-- ---------------------------------------------------------------------

select
  (select count(*) from people)                                as "פעילים במערכת",
  (select count(*) from import_staging where imported_at is not null) as "יובאו",
  (select count(*) from import_staging where imported_at is null)     as "נדחו";

select reject_reason, count(*)
from import_staging
where imported_at is null
group by reject_reason;


-- ---------------------------------------------------------------------
-- 6. ניקוי טבלת הביניים — רק אחרי שאישרת שהכל נכון
-- ---------------------------------------------------------------------

-- truncate import_staging;
