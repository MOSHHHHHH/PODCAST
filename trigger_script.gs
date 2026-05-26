/**
 * trigger_script.gs
 * =================
 * סקריפט המנוע — הקובץ היחיד שיושב פיזית בתוך עורך Google Apps Script.
 *
 * הוראות התקנה:
 * 1. פתח https://script.google.com ← צור פרויקט חדש.
 * 2. העתק את כל הקוד הזה לתוך עורך ה-Apps Script.
 * 3. מלא את ארבעת המשתנים הקבועים למטה (PROCESSOR_FILE_ID, RSS_LIST_FILE_ID, ROOT_FOLDER_ID).
 * 4. הרץ את הפונקציה "dailyRun" פעם אחת ידנית לבדיקה.
 * 5. הגדר טריגר אוטומטי: Triggers ← Add Trigger ← dailyRun ← Time-driven ← Day timer.
 *
 * איך מוצאים File ID?
 *   פתח את הקובץ ב-Google Drive → בכתובת ה-URL תמצא: /d/FILE_ID/
 */


// =====================================================================
// ⚙️  הגדרות — יש למלא לפני הפעלה ראשונה
// =====================================================================


/** ה-ID של קובץ הלוגיקה (podcast_processor.js) ב-Google Drive */
var PROCESSOR_FILE_ID = "1VkNhgeYG0NM-U9Jy4Gu-Ju0DWMejz63w";


/** ה-ID של קובץ הרשימה (podcasts.txt) ב-Google Drive */
var RSS_LIST_FILE_ID  = "1rMM0J9-jRlUR8Kd8h1qtxWxhu_967iTM";


/** ה-ID של תיקיית-העל ב-Drive שבה יישמרו תיקיות הפודקאסטים */
var ROOT_FOLDER_ID    = "1mKhnrSSsCttODKgnahQI8UqWBNyb1_I4";




// =====================================================================
// ▶️  פונקציה ראשית — זו שמוגדרת כטריגר היומי
// =====================================================================
function dailyRun() {
  try {

    Logger.log("🚀 מערכת הורדת פודקאסטים — התחלה: " + new Date().toLocaleString("he-IL"));

    // --- שלב 1: קריאת רשימת ה-RSS מ-Drive ---
    var rssList = loadRssList();
    if (rssList.length === 0) {
      Logger.log("⚠️  לא נמצאו כתובות RSS תקינות — מסיים.");
      return;
    }
    Logger.log("📋 נטענו " + rssList.length + " כתובות RSS.");

    // --- שלב 2: קריאת קובץ הלוגיקה כטקסט ---
    var processorCode = loadProcessorCode();
    Logger.log("⚙️  קוד הלוגיקה נטען בהצלחה.");

    // --- שלב 3: הרצת קוד הלוגיקה בזיכרון ---
    eval(processorCode);  // מגדיר את processPodcasts() בסביבת הריצה הנוכחית

    // --- שלב 4: קריאה לפונקציה הראשית עם הפרמטרים ---
    processPodcasts(rssList, ROOT_FOLDER_ID);

    Logger.log("🏁 ריצה הסתיימה: " + new Date().toLocaleString("he-IL"));

  } catch (e) {
    // --- שגיאה קריטית (Drive לא נגיש, קובץ הקוד פגום וכו') ---
    // שליחת מייל אוטומטי לכתובת בעל הסקריפט
    var ownerEmail = Session.getEffectiveUser().getEmail();
    var subject    = "⚠️ שגיאה במערכת הורדת פודקאסטים — " + new Date().toLocaleDateString("he-IL");
    var body       = "אירעה שגיאה קריטית בריצה היומית של מערכת הורדת הפודקאסטים.\n\n"
                   + "שגיאה: " + e.message + "\n\n"
                   + "Stack trace:\n" + e.stack;
    MailApp.sendEmail(ownerEmail, subject, body);
    Logger.log("📧 נשלח מייל שגיאה אל: " + ownerEmail);
    throw e; // מגדיל את השגיאה כדי שתיכנס גם ללוג של GAS
  }
}




// =====================================================================
// 📄  קריאת קובץ רשימת ה-RSS
// =====================================================================
function loadRssList() {
  var file    = DriveApp.getFileById(RSS_LIST_FILE_ID);
  var content = file.getBlob().getDataAsString("UTF-8");
  var lines   = content.split("\n");
  var result  = [];


  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();


    // דלג על שורות ריקות ועל הערות (מתחילות ב-#)
    if (line === "" || line.charAt(0) === "#") continue;


    // בדיקה בסיסית שהשורה נראית כמו URL
    if (line.indexOf("http") === 0) {
      result.push(line);
    } else {
      Logger.log("⚠️  שורה לא תקינה בקובץ הרשימה (מדולגת): " + line);
    }
  }


  return result;
}




// =====================================================================
// 💾  קריאת קובץ הלוגיקה (podcast_processor.js) כטקסט
// =====================================================================
function loadProcessorCode() {
  var file = DriveApp.getFileById(PROCESSOR_FILE_ID);
  return file.getBlob().getDataAsString("UTF-8");
}


// =====================================================================
// ⏰  הגדרת טריגר יומי — יש להריץ פונקציה זו פעם אחת בלבד ידנית
// =====================================================================
/**
 * יוצר טריגר Time-driven מסוג Day timer שמפעיל את dailyRun בין 02:00–03:00.
 * אם טריגר כזה כבר קיים — מוחק אותו קודם כדי למנוע כפילויות.
 * לאחר הרצה ידנית אחת, הטריגר פועל אוטומטית מדי לילה.
 */
function setupTrigger() {
  // מחיקת טריגרים קיימים של dailyRun (למניעת כפילויות)
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === "dailyRun") {
      ScriptApp.deleteTrigger(triggers[i]);
      Logger.log("🗑️  טריגר קיים נמחק.");
    }
  }

  // יצירת טריגר יומי — יופעל בין 02:00 ל-03:00
  ScriptApp.newTrigger("dailyRun")
    .timeBased()
    .everyDays(1)
    .atHour(2)          // GAS מריץ בחלון של שעה: 02:00–03:00
    .create();

  Logger.log("✅ טריגר יומי נוצר — dailyRun יופעל בין 02:00 ל-03:00 כל לילה.");
}