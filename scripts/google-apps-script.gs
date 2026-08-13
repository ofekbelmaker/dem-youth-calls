/**
 * סנכרון אוטומטי מגיליון ההרשמות למסד הנתונים.
 *
 * להדביק ב-Apps Script של גיליון התשובות, למלא את שלושת הערכים
 * למטה, ולהריץ פעם אחת את setup().
 *
 * מרגע זה הסקריפט רץ כל חמש דקות, שולח רק שורות חדשות, ומסמן
 * לעצמו עד היכן הגיע. הוא לא קורא נתונים מהמסד ולא יכול — הוא
 * מכיר פונקציה אחת שיודעת רק לקלוט הרשמה.
 *
 * הערה על טריגרים: משתמשים בטריגר מבוסס-זמן ולא ב"בעת שליחת טופס",
 * כי שורות שנכתבות לגיליון דרך API לא תמיד מפעילות טריגרים של עריכה.
 * זמן הוא הדרך היחידה שעובדת בוודאות בכל מקרה.
 */

/* ─────────── להשלים ─────────── */
/* למלא בעורך של Apps Script, לא בקובץ שבריפו. סוד שנשמר בגיט הוא
   סוד שדלף — גם אחרי שמוחקים אותו הוא נשאר בהיסטוריה. */

const SUPABASE_URL = "https://hqytnipauhkcfddjdoju.supabase.co";

/** המפתח הציבורי מ-Project Settings ← API (anon / Publishable) */
const SUPABASE_ANON_KEY = "כאן_להדביק_את_המפתח";

/** אותו ערך בדיוק שהוגדר ב-app_config דרך auto-sync.sql */
const SIGNUP_SECRET = "כאן_להדביק_את_הסוד";

/** שם הלשונית בגיליון */
const SHEET_NAME = "גיליון1";

/* ─────────── כותרות העמודות ─────────── */
/* מזוהות לפי שם, כך שסידור מחדש של עמודות לא ישבור כלום */

const COLUMNS = {
  date: ["תאריך", "חותמת זמן"],
  firstName: ["שם פרטי"],
  lastName: ["שם משפחה"],
  fullName: ["שם מלא"],
  phone: ["טלפון", "נייד"],
  grade: ["שכבה", "כיתה"],
  city: ["יישוב", "ישוב", "עיר"],
  school: ["בית ספר"],
};

/* ────────────────────────────── */

const PROP_LAST_ROW = "lastSyncedRow";

/** להריץ פעם אחת ביד. מתקין טריגר של כל חמש דקות. */
function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "syncNewSignups") {
      ScriptApp.deleteTrigger(t);
    }
  });

  ScriptApp.newTrigger("syncNewSignups")
    .timeBased()
    .everyMinutes(5)
    .create();

  Logger.log("הטריגר הותקן. הסנכרון ירוץ כל חמש דקות.");
  Logger.log('להעברת כל ההרשמות הקיימות, הרץ פעם אחת את resyncAll().');
}

/**
 * מסמן שכל השורות הקיימות כבר טופלו, בלי לשלוח אותן.
 * להריץ אחרי ייבוא ידני, כדי שהסקריפט יתחיל מכאן והלאה.
 */
function markAllAsSynced() {
  const sheet = getSheet_();
  PropertiesService.getScriptProperties().setProperty(
    PROP_LAST_ROW,
    String(sheet.getLastRow()),
  );
  Logger.log("סומן עד שורה " + sheet.getLastRow() + ". רק חדשות יישלחו מעכשיו.");
}

/** שולח מחדש את כל השורות. בטוח — קיימים לא ייכפלו. */
function resyncAll() {
  PropertiesService.getScriptProperties().deleteProperty(PROP_LAST_ROW);
  syncNewSignups();
}

/** הפונקציה שרצה בטריגר */
function syncNewSignups() {
  const sheet = getSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const props = PropertiesService.getScriptProperties();
  const startRow = Number(props.getProperty(PROP_LAST_ROW) || 1) + 1;
  if (startRow > lastRow) return;

  const header = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0]
    .map(function (h) {
      return String(h).trim();
    });

  const idx = {};
  Object.keys(COLUMNS).forEach(function (key) {
    idx[key] = -1;
    COLUMNS[key].forEach(function (name) {
      if (idx[key] === -1) idx[key] = header.indexOf(name);
    });
  });

  if (idx.phone === -1 || (idx.firstName === -1 && idx.fullName === -1)) {
    Logger.log("לא זוהו עמודות שם וטלפון. כותרות: " + header.join(" | "));
    return;
  }

  const rows = sheet
    .getRange(startRow, 1, lastRow - startRow + 1, sheet.getLastColumn())
    .getValues();

  let added = 0;
  let existing = 0;
  let failed = 0;
  let processedRow = startRow - 1;

  /* Apps Script קוטע ריצה אחרי שש דקות, באמצע פקודה ובלי אזהרה.
     בלי היציאה המסודרת הזו, סנכרון ראשון של גיליון מלא היה נקטע
     לפני שההתקדמות נשמרת — וכל ריצה הייתה מתחילה שוב מאותה שורה,
     בלי להתקדם לעולם. */
  const deadline = Date.now() + 4.5 * 60 * 1000;

  for (let i = 0; i < rows.length; i++) {
    if (Date.now() > deadline) {
      Logger.log(
        "עצירה מסודרת לפני מגבלת הזמן. הריצה הבאה תמשיך משורה " +
          (processedRow + 1),
      );
      break;
    }

    const row = rows[i];
    const get = function (key) {
      return idx[key] === -1 ? "" : String(row[idx[key]] || "").trim();
    };

    const name =
      idx.fullName !== -1
        ? get("fullName")
        : [get("firstName"), get("lastName")].filter(String).join(" ").trim();

    const phone = get("phone");

    if (!name && !phone) {
      processedRow = startRow + i;
      continue;
    }

    const result = callSubmit_({
      p_secret: SIGNUP_SECRET,
      p_name: name,
      p_phone: phone,
      p_grade: get("grade") || null,
      p_city: get("city") || null,
      p_school: get("school") || null,
      p_submitted_at: toIso_(idx.date === -1 ? null : row[idx.date]),
    });

    if (result === "added") added++;
    else if (result === "already_exists") existing++;
    else {
      failed++;
      Logger.log("שורה " + (startRow + i) + " נכשלה: " + result + " | " + name);
    }

    /* מתקדמים רק על מה שבאמת נשלח, כדי שכשל רשת לא יבלע שורות */
    if (result !== null) processedRow = startRow + i;
    else break;
  }

  props.setProperty(PROP_LAST_ROW, String(processedRow));

  if (added || existing || failed) {
    Logger.log(
      "סנכרון: " + added + " נוספו, " + existing + " כבר קיימים, " + failed + " נכשלו",
    );
  }
}

/* ─────────── עזר ─────────── */

function getSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.getSheets()[0];
}

/** מחזיר מחרוזת מצב, או null אם הקריאה עצמה נכשלה */
function callSubmit_(payload) {
  try {
    const response = UrlFetchApp.fetch(SUPABASE_URL + "/rest/v1/rpc/submit_signup", {
      method: "post",
      contentType: "application/json",
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: "Bearer " + SUPABASE_ANON_KEY,
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    const code = response.getResponseCode();
    const body = response.getContentText();

    if (code !== 200) {
      Logger.log("שגיאת HTTP " + code + ": " + body);
      return null;
    }

    return body.replace(/^"|"$/g, "");
  } catch (e) {
    Logger.log("קריאה נכשלה: " + e);
    return null;
  }
}

/** "14.6.2026, 12:29:02" או תא תאריך אמיתי -> ISO */
function toIso_(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();

  const m = String(value).match(
    /(\d{1,2})[./](\d{1,2})[./](\d{4})(?:[,\s]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!m) return null;

  const pad = function (v) {
    return String(v).padStart(2, "0");
  };
  return (
    m[3] + "-" + pad(m[2]) + "-" + pad(m[1]) +
    "T" + pad(m[4] || 0) + ":" + pad(m[5] || 0) + ":" + pad(m[6] || 0)
  );
}
