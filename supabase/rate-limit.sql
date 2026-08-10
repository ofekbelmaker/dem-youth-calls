-- =====================================================================
--  הגבלת קצב על ניסיונות כניסה — במסד, לא בזיכרון
--
--  למה במסד: בענן האפליקציה רצה כמופעים קצרי-חיים שנולדים ונמחקים.
--  ספירה בזיכרון של מופע אחד לא נראית למופעים האחרים ומתאפסת עם
--  מחזור המופע, ולכן היא כמעט חסרת ערך שם. המסד הוא הזיכרון היחיד
--  שכולם חולקים.
--
--  שתי שכבות:
--    • לפי מקור — חוסם ניסיונות חוזרים מאותה כתובת.
--    • גלובלי — מאט את כולם כשיש פרץ חריג, כי תוקף יכול להחליף
--      כתובות. במכוון האטה ולא חסימה: חסימה גלובלית הייתה מאפשרת
--      לתוקף לנעול את הטלפנים האמיתיים בדיוק בערב פעולה.
--
--  להריץ בעורך ה-SQL.
-- =====================================================================

create table if not exists login_attempts (
  id           bigserial primary key,
  client_key   text not null,
  attempted_at timestamptz not null default now()
);

create index if not exists login_attempts_key_idx
  on login_attempts (client_key, attempted_at desc);
create index if not exists login_attempts_time_idx
  on login_attempts (attempted_at desc);

alter table login_attempts enable row level security;
-- בלי policies: נגיש רק דרך השרת


-- ---------------------------------------------------------------------
-- מצב נוכחי: כמה כשלונות מהמקור הזה, וכמה בסך הכל
-- ---------------------------------------------------------------------

create or replace function login_rate_state(p_key text)
returns table (from_source integer, global integer)
language sql
security definer
set search_path = public
as $$
  select
    (select count(*)::integer from login_attempts
      where client_key = p_key
        and attempted_at > now() - interval '15 minutes'),
    (select count(*)::integer from login_attempts
      where attempted_at > now() - interval '10 minutes');
$$;


-- ---------------------------------------------------------------------
-- רישום כישלון
-- ---------------------------------------------------------------------

create or replace function record_login_failure(p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into login_attempts (client_key) values (p_key);

  /* ניקוי מדי פעם, כדי שהטבלה לא תגדל בלי גבול */
  if random() < 0.02 then
    delete from login_attempts where attempted_at < now() - interval '2 days';
  end if;
end;
$$;


-- ---------------------------------------------------------------------
-- מחיקת הרשומות של מקור שהצליח להיכנס
-- ---------------------------------------------------------------------

create or replace function clear_login_failures(p_key text)
returns void
language sql
security definer
set search_path = public
as $$
  delete from login_attempts where client_key = p_key;
$$;


-- ---------------------------------------------------------------------
-- בדיקה
-- ---------------------------------------------------------------------

-- select record_login_failure('בדיקה');
-- select * from login_rate_state('בדיקה');
-- select clear_login_failures('בדיקה');
