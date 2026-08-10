-- =====================================================================
--  נתוני זרע לפיתוח
--
--  מבנה שטוח, בלי סניפים: 12 מדריכים, 240 פעילים, פעולה שעברה עם
--  היסטוריית שיחות מלאה, ופעולה קרובה עם משימות פתוחות.
--
--  ⚠ כל מספרי הטלפון כאן הם בקידומת +999, שהיא קידומת מדינה לא מוקצית.
--    כלומר גם אם מישהו ילחץ בטעות על "חייג" במהלך הפיתוח, אף אדם אמיתי
--    לא יקבל שיחה. אל תחליף את זה למספרים ישראליים בסביבת פיתוח.
--
--  להרצה: SQL Editor של Supabase, אחרי schema.sql, על מסד ריק.
-- =====================================================================

do $$
declare
  fn text[] := array['נועה','יעל','שירה','תמר','מאיה','אורי','איתי','יונתן',
                     'דניאל','עמית','רוני','גיא','אלון','טל','ליאם','עדי',
                     'שחר','נועם','איילה','הדר','אביב','ניצן','יהלי','רותם'];
  ln text[] := array['כהן','לוי','מזרחי','פרץ','ביטון','דהן','אברהם','פרידמן',
                     'שפירא','אזולאי','גבאי','חדד','אוחיון','ברק','שרון','נחום'];
  grades text[] := array['ט','י','יא','יב'];

  n_guides   int := 12;
  n_people   int := 240;

  guide_person_ids uuid[] := '{}';

  v_person uuid;
  v_admin  uuid;

  v_event_past uuid;
  v_event_next uuid;

  i int; k int; gi int;
begin
  ------------------------------------------------------------------
  -- מדריכים: רשומת פעיל + פרופיל משתמש.
  -- auth_user_id נשאר null — הם "קיימים" במערכת בלי שהתחברו מעולם.
  ------------------------------------------------------------------
  for i in 1 .. n_guides loop
    insert into people (full_name, phone_e164, grade, birth_date,
                        status, consent_source, consent_at, guardian_consent)
    values (
      fn[1 + (i % array_length(fn, 1))] || ' ' || ln[1 + ((i * 5) % array_length(ln, 1))],
      '+9990' || lpad(i::text, 8, '0'),
      'יב',
      current_date - ((17 * 365) + (i * 11)),
      'active', 'seed', now(), true
    )
    returning id into v_person;

    insert into profiles (person_id, display_name, role)
    select v_person, p.full_name, 'guide' from people p where p.id = v_person;

    guide_person_ids := guide_person_ids || v_person;
  end loop;

  ------------------------------------------------------------------
  -- הפעילים — גוש אחד, מחולק בין המדריכים
  ------------------------------------------------------------------
  for k in 1 .. n_people loop
    gi := 1 + ((k - 1) % n_guides);

    insert into people (full_name, phone_e164, grade, birth_date,
                        guide_id, status, consent_source, consent_at, guardian_consent)
    values (
      fn[1 + (k % array_length(fn, 1))] || ' ' || ln[1 + ((k * 3) % array_length(ln, 1))],
      '+9991' || lpad(k::text, 8, '0'),
      grades[1 + (k % 4)],
      current_date - ((14 * 365) + (k % 1400)),
      guide_person_ids[gi],
      case when k % 25 = 0 then 'dormant' else 'active' end::person_status,
      'seed', now() - (k || ' days')::interval,
      (k % 4 <> 0)
    );
  end loop;

  ------------------------------------------------------------------
  -- פרופיל אדמין (בלי חשבון גוגל עדיין — ראה הוראות בסוף הקובץ)
  ------------------------------------------------------------------
  insert into profiles (display_name, role) values ('מנהל מערכת', 'admin')
  returning id into v_admin;

  ------------------------------------------------------------------
  -- פעולה שעברה — כדי שיהיה הקשר היסטורי בתור של המתקשר
  ------------------------------------------------------------------
  insert into events (title, description, starts_at, location, target_count,
                      assignment_strategy, created_by)
  values ('הפגנת מטה נוער', 'פעולה ארצית', now() - interval '30 days',
          'כיכר הבימה, תל אביב', 150, 'by_guide', v_admin)
  returning id into v_event_past;

  perform generate_assignments(v_event_past);

  -- תיעוד שיחות לפעולה שעברה. ההתפלגות מכוונת להיראות אמיתית:
  -- ~20% לא ענו, ~10% ביקשו שיחזרו אליהם, 2% ביקשו לא לפנות אליהם שוב.
  with numbered as (
    select a.id, a.assigned_to,
           (row_number() over (order by a.id))::int as rn
      from assignments a
     where a.event_id = v_event_past
  )
  insert into contacts (assignment_id, contacted_by, contacted_at,
                        outcome, rsvp, needs_ride)
  select
    n.id,
    n.assigned_to,
    now() - interval '33 days' + (n.rn || ' minutes')::interval,
    case
      when n.rn % 10 in (0, 1) then 'no_answer'
      when n.rn % 10 = 2       then 'callback_later'
      when n.rn % 50 = 7       then 'opted_out'
      else 'answered'
    end::contact_outcome,
    case
      when n.rn % 10 in (0, 1, 2) then 'unknown'
      when n.rn % 3 = 0           then 'yes'
      when n.rn % 3 = 1           then 'maybe'
      else 'no'
    end::rsvp_status,
    (n.rn % 7 = 0)
  from numbered n;

  ------------------------------------------------------------------
  -- הפעולה הקרובה — זו שעליה עובדים במסכים
  --
  -- שים לב: מי שסימנו לו 'opted_out' בפעולה הקודמת כבר לא ייכלל,
  -- כי הטריגר עדכן do_not_contact והוא נפל מ-callable_people.
  ------------------------------------------------------------------
  insert into events (title, description, starts_at, location, target_count,
                      assignment_strategy, created_by)
  values ('פעולת פתיחת שנה', 'מפגש שכבות + הרצאה', now() + interval '10 days',
          'בית התנועה, תל אביב', 120, 'by_guide', v_admin)
  returning id into v_event_next;

  perform generate_assignments(v_event_next);

  raise notice 'seed complete: % people, % assignments',
    (select count(*) from people),
    (select count(*) from assignments);
end;
$$;


-- =====================================================================
--  אחרי ההרצה
-- =====================================================================
--
--  1. היכנס לאפליקציה פעם אחת עם גוגל. זה יוצר שורה ב-auth.users.
--
--  2. קשר את החשבון שלך לפרופיל האדמין:
--
--       update profiles
--          set auth_user_id = (select id from auth.users order by created_at desc limit 1)
--        where role = 'admin';
--
--  3. כדי לראות את מסך "השיחות שלי" עם תור מלא, קשר את עצמך למדריך
--     במקום לאדמין — למשל הראשון ברשימה:
--
--       update profiles set auth_user_id = null where role = 'admin';
--       update profiles
--          set auth_user_id = (select id from auth.users order by created_at desc limit 1)
--        where id = (select id from profiles where role = 'guide' order by created_at limit 1);
--
--  4. בדיקת שפיות מהירה:
--
--       select * from event_stats;
--       select * from caller_progress order by reached;
--       select count(*) from my_queue;
--
--  להרצת פעולה במודל מוקד במקום מדריכים:
--
--       update events set assignment_strategy = 'pool' where title = 'פעולת פתיחת שנה';
--       insert into event_callers (event_id, profile_id)
--       select e.id, p.id from events e, profiles p
--        where e.title = 'פעולת פתיחת שנה' and p.role = 'guide' limit 8;
--       delete from assignments where event_id = (select id from events where title = 'פעולת פתיחת שנה');
--       select generate_assignments((select id from events where title = 'פעולת פתיחת שנה'));
