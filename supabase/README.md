# סנכרון חי מטופס ההרשמה

איך נרשם חדש בטופס הופך לכרטיס אצל טלפן, ומה להריץ כדי שזה יעבוד.

## הצינור

```
טופס Google
   ↓  (Google כותב שורה)
גיליון התשובות
   ↓  scripts/google-apps-script.gs — טריגר כל 5 דקות
submit_signup()                        supabase/auto-sync.sql
   ↓  מוסיף ל-people ומשבץ לתור
assignments  →  next_assignment()  →  הכרטיס על המסך

                                       supabase/live-list.sql
טריגר people_sync_open_events  ────────┘
   מכסה את מה שמחוץ למסלול הטופס: החזרה לפעילות, הוספה ידנית,
   וההורדה מהרשימה של מי שעזב או ביקש שלא יפנו אליו
```

כל חוליה חיה בלי החוליה שאחריה, ובלי להתלונן. זו הסיבה שכשמשהו
לא עובד כדאי לבדוק שלב-שלב לפי הסדר שלמטה, ולא לנחש.

## הרצה חד-פעמית

בעורך ה-SQL של Supabase, לפי הסדר:

| קובץ | מתי | תלוי ב |
|---|---|---|
| `schema.sql` | הקמה ראשונית | — |
| `normalize-on-write.sql` | הקמה ראשונית | `schema.sql` |
| `migration-shared-list.sql` | מעבר לרשימה משותפת | `schema.sql` |
| `next-card.sql` | חלוקת "אחד בכל פעם" | `migration-shared-list.sql` |
| `random-order.sql` | סדר אקראי | `next-card.sql` |
| `skip-log.sql` | תיעוד דילוגים | `migration-shared-list.sql` |
| `rate-limit.sql` | הגבלת ניסיונות כניסה | `schema.sql` |
| `awaiting-whatsapp-1.sql` | תוצאת "ממתין לוואטסאפ" | `schema.sql` |
| `awaiting-whatsapp-2.sql` | הספרייה הפרטית של הטלפן | הקודם |
| `reset-round.sql` | איפוס סבב חיוג | `migration-shared-list.sql` |
| **`auto-sync.sql`** | **פותח את הדלת לגיליון ומשבץ לתור** | `schema.sql` |
| **`live-list.sql`** | **מכסה את מה שמחוץ למסלול הטופס** | שני הקודמים |

`new-event.sql`, `import.sql` ו-`duplicates.sql` הם לא מיגרציות —
מריצים אותם כשצריך פעולה חדשה, ייבוא ידני, או בדיקת כפילויות.

## הפעלת הסנכרון

**1. סוד משותף.** צור אחד:

```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
```

שמור אותו ב-`.env.local` תחת `SIGNUP_SECRET`, הדבק אותו ב-`auto-sync.sql`
במקום `'כאן-להדביק-מ-env-local'`, והרץ את הקובץ. **אל תשמור אותו בגיט —
הריפו ציבורי.**

**2. `live-list.sql`.** הרץ. הוא גם משלים לרשימה את כל מי שכבר במסד
מהייבוא הידני, ומדפיס בסוף שתי בדיקות שאמורות להראות אפס.

**3. הסקריפט בגיליון.** בגיליון התשובות: `תוספים ← Apps Script`.
הדבק את `scripts/google-apps-script.gs`, ומלא בעורך שלושה ערכים:

- `SUPABASE_ANON_KEY` — מ-`Project Settings ← API`, המפתח הציבורי
- `SIGNUP_SECRET` — הסוד מסעיף 1
- `SHEET_NAME` — שם הלשונית

את הערכים ממלאים שם, לא בקובץ שבריפו.

**4. `setup()`.** הרץ פעם אחת מהעורך. Google יבקש הרשאות — זו
בקשה של הסקריפט שלך על הגיליון שלך. מכאן הטריגר רץ כל חמש דקות.

**5. `resyncAll()`.** הרץ פעם אחת. הוא שולח את כל שורות הגיליון,
כולל אלה שכבר יובאו ידנית — `on conflict do nothing` דואג שאיש
לא ייכפל, וכך גם מי שנפל בין הייבוא הידני להיום נכנס פנימה.
גיליון גדול יתפרס על כמה ריצות; זה תקין, הוא ממשיך מאיפה שעצר.

מכאן ואילך אין מה לעשות. הרשמה חדשה בטופס מופיעה כשיחה תוך חמש דקות.

## כשזה לא עובד

לפי סדר הצינור — הבדיקה הראשונה שנכשלת היא התשובה.

**הגיליון לא מגיע ל-people.** בעורך Apps Script:
`ביצועים` / `Executions`. אם אין ריצות — `setup()` לא רץ. אם יש
ריצות עם `שגיאת HTTP 404` — ה-URL שגוי; `401` — המפתח שגוי;
`denied` — הסוד לא תואם לזה שב-`app_config`. אם רשום
`לא זוהו עמודות שם וטלפון`, כותרות הגיליון לא ברשימת `COLUMNS`
שבראש הסקריפט — הוסף שם את הכותרת כפי שהיא כתובה בגיליון.

**נכנס ל-people אבל לא מופיע לטלפנים.** אז החוליה החסרה היא
`live-list.sql`:

```sql
select count(*) from callable_people p
 where not exists (
   select 1 from assignments a
    where a.person_id = p.id and a.event_id = active_event()
 );
```

אפס = הרשימה מלאה. אחרת הקובץ לא הורץ, או שהטריגר ירד:

```sql
select tgname, tgenabled from pg_trigger where tgname = 'people_sync_open_events';
```

**נכנס לרשימה אבל אף אחד לא מקבל אותו.** כנראה נכנס לפעולה אחרת
מזו שעל המסך:

```sql
select e.title, count(*) filter (where a.state = 'pending') as "פתוחות"
  from events e left join assignments a on a.event_id = e.id
 group by e.id order by e.starts_at desc;
```

**רשת ביטחון.** אם משהו נשמט, אפשר תמיד למלא מחדש — בטוח להרצה
חוזרת, לא נוגע במה שכבר תועד:

```sql
select title, generate_assignments(id) from open_events;
```

## מה הסנכרון לא עושה

מי שכבר קיים במסד ונרשם שוב עם פרטים מעודכנים — לא מתעדכן.
`submit_signup` מזהה אותו לפי הטלפון ולא נוגעת בו. זו החלטה
מכוונת: הרשמה חוזרת לא אמורה לדרוס תיקון שרכז עשה ביד.
עדכון פרטים נעשה ישירות בטבלה.
