/**
 * trigger_script.gs
 * =================
 * הקובץ היחיד שיושב בתוך עורך Google Apps Script.
 * כל הלוגיקה נמצאת ב-podcast_processor.js ב-Drive — נטענת דרך eval().
 *
 * הגדרה ראשונית:
 *   1. מלא את שלושת ה-IDs למטה.
 *   2. הרץ dailyRun פעם אחת ידנית לאישור הרשאות.
 *   3. הרץ setupTrigger פעם אחת ידנית — לא תצטרך לגעת שוב.
 *
 * מציאת File/Folder ID: פתח ב-Drive → בכתובת ה-URL: /d/[ID]/ או /folders/[ID]
 */

// =====================================================================
// ⚙️  הגדרות — יש למלא לפני הפעלה ראשונה
// =====================================================================

var PROCESSOR_FILE_ID = "REPLACE_WITH_PROCESSOR_FILE_ID";   // podcast_processor.js
var RSS_LIST_FILE_ID  = "REPLACE_WITH_RSS_LIST_FILE_ID";    // podcasts.txt
var ROOT_FOLDER_ID    = "REPLACE_WITH_ROOT_FOLDER_ID";      // תיקיית הפודקאסטים

// =====================================================================
// ▶️  ריצה יומית — מוגדרת כטריגר
// =====================================================================

function dailyRun() {
  try {
    eval(DriveApp.getFileById(PROCESSOR_FILE_ID).getBlob().getDataAsString());
    run(RSS_LIST_FILE_ID, ROOT_FOLDER_ID);
  } catch (e) {
    MailApp.sendEmail(
      Session.getEffectiveUser().getEmail(),
      "⚠️ שגיאה במערכת הורדת פודקאסטים — " + new Date().toLocaleDateString("he-IL"),
      "שגיאה: " + e.message + "\n\nStack:\n" + e.stack
    );
    throw e;
  }
}

// =====================================================================
// ⏰  הגדרת טריגרים — מריץ פעם אחת בלבד
// =====================================================================

function setupTrigger() {
  ScriptApp.getProjectTriggers()
    .filter(function(t) { return t.getHandlerFunction() === "dailyRun"; })
    .forEach(function(t) { ScriptApp.deleteTrigger(t); });

  [1, 2, 3, 4].forEach(function(h) {
    ScriptApp.newTrigger("dailyRun").timeBased().everyDays(1).atHour(h).create();
    Logger.log("✅ טריגר נוצר: " + h + ":00–" + (h + 1) + ":00");
  });

  Logger.log("🏁 4 ריצות לילה הוגדרו (01:00–05:00). לא נדרשת פעולה נוספת.");
}
