-- =====================================================================
--  נרמול טלפון אוטומטי בהוספה ובעריכה
--
--  מאפשר להקליד מספר בכל צורה נוחה — 050-123-4567, 054 1234567,
--  ‎+972-50-1234567 — והמסד ימיר אותו לצורה האחידה בעצמו.
--
--  למה בכלל שומרים בצורה בינלאומית:
--    • זיהוי כפילויות. אותו אדם שנרשם פעמיים בשתי צורות כתיבה
--      חייב להיראות למסד כאדם אחד.
--    • קישורי וואטסאפ עובדים רק עם מספר בינלאומי.
--
--  להריץ אחרי schema.sql.
-- =====================================================================

create or replace function normalize_person_phone()
returns trigger
language plpgsql
as $$
declare
  v_raw   text := btrim(coalesce(new.phone_e164, ''));
  v_norm  text;
begin
  if v_raw = '' then
    raise exception 'חסר מספר טלפון';
  end if;

  /* מספר זר שכבר נכתב בצורה בינלאומית — לא נוגעים בו.
     בלי החריגה הזו היינו מוסיפים 972 למספר אמריקאי ומשחיתים אותו. */
  if v_raw ~ '^\+' and v_raw !~ '^\+972' then
    new.phone_e164 := regexp_replace(v_raw, '[^0-9+]', '', 'g');
    if new.phone_e164 !~ '^\+[1-9][0-9]{7,14}$' then
      raise exception 'מספר בינלאומי לא תקין: %', v_raw;
    end if;
    return new;
  end if;

  v_norm := normalize_il_phone(v_raw);

  if v_norm is null then
    raise exception
      'מספר טלפון לא תקין: "%". מצופה מספר ישראלי, למשל 050-1234567', v_raw;
  end if;

  new.phone_e164 := v_norm;
  return new;
end;
$$;

drop trigger if exists people_normalize_phone on people;

create trigger people_normalize_phone
  before insert or update of phone_e164 on people
  for each row execute function normalize_person_phone();


-- ---------------------------------------------------------------------
-- בדיקה — שלוש צורות כתיבה, אותה תוצאה
-- ---------------------------------------------------------------------

-- insert into people (full_name, phone_e164) values ('בדיקה א', '050-123-4599');
-- insert into people (full_name, phone_e164) values ('בדיקה ב', '054 987 6543');
-- select full_name, phone_e164 from people where full_name like 'בדיקה%';
-- delete from people where full_name like 'בדיקה%';
