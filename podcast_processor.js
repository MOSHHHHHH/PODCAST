/**
 * podcast_processor.js
 * =====================
 * קובץ הלוגיקה המרכזית של מערכת הורדת הפודקאסטים.
 * קובץ זה נשמר ב-Google Drive ונקרא ומורץ ע"י ה-Trigger Script (קובץ 3).
 *
 * אין להריץ קובץ זה ישירות מ-Apps Script — הוא מיועד לקריאה דרך eval() בלבד.
 *
 * פרמטרים שיש להגדיר ב-Trigger Script (קובץ 3):
 *   ROOT_FOLDER_ID  — ה-ID של תיקיית-העל ב-Drive שבה יישמרו כל הפודקאסטים
 */

// =====================================================================
// פונקציה ראשית — נקראת מ-Trigger Script עם מערך כתובות ה-RSS
// =====================================================================
function processPodcasts(rssList, rootFolderId) {

  // אימות פרמטרים
  if (!rssList || rssList.length === 0) {
    Logger.log("⚠️  רשימת הפודקאסטים ריקה — אין מה לעבד.");
    return;
  }
  if (!rootFolderId) {
    throw new Error("חסר rootFolderId — יש להגדיר אותו ב-Trigger Script.");
  }

  var rootFolder = DriveApp.getFolderById(rootFolderId);
  Logger.log("📁 תיקיית-על: " + rootFolder.getName());
  Logger.log("🎙️  מספר פודקאסטים לבדיקה: " + rssList.length);

  // לולאה על כל כתובת RSS ברשימה
  for (var i = 0; i < rssList.length; i++) {
    var rssUrl = rssList[i];
    Logger.log("\n──────────────────────────────────────");
    Logger.log("⏳ מעבד: " + rssUrl);

    try {
      processSingleFeed(rssUrl, rootFolder);
    } catch (e) {
      // שגיאה בפודקאסט אחד לא עוצרת את שאר הרשימה
      Logger.log("❌ שגיאה בעיבוד " + rssUrl + ": " + e.message);
    }
  }

  Logger.log("\n✅ סיום עיבוד כל הפודקאסטים.");
}


// =====================================================================
// עיבוד פיד RSS בודד
// =====================================================================
function processSingleFeed(rssUrl, rootFolder) {

  // --- שליפת ה-RSS ---
  var response = UrlFetchApp.fetch(rssUrl, { muteHttpExceptions: true });
  if (response.getResponseCode() !== 200) {
    throw new Error("קוד תגובה " + response.getResponseCode() + " עבור: " + rssUrl);
  }

  var xmlText = response.getContentText("UTF-8");
  var doc     = XmlService.parse(xmlText);
  var channel = doc.getRootElement().getChild("channel");

  if (!channel) {
    throw new Error("לא נמצא אלמנט <channel> ב-RSS: " + rssUrl);
  }

  // --- שם הערוץ ←  שם התיקייה ---
  var channelTitle = channel.getChildText("title") || "פודקאסט_ללא_שם";
  var folderName   = sanitizeFolderName(channelTitle);
  Logger.log("🎙️  ערוץ: " + channelTitle);

  // --- מציאת / יצירת תיקייה ---
  var podcastFolder = getOrCreateFolder(rootFolder, folderName);

  // --- מעבר על פרקים (חדש → ישן) ---
  var items = channel.getChildren("item");
  Logger.log("📋 מספר פרקים ב-RSS: " + items.length);

  var downloaded = 0;

  for (var j = 0; j < items.length; j++) {
    var item  = items[j];
    var title = item.getChildText("title") || ("פרק_" + (j + 1));

    // --- שם קובץ יעד ---
    var fileName = sanitizeFileName(title) + ".mp3";

    // --- בדיקת קיום — אם קיים, עצור לולאה (כל הפרקים הבאים ישנים יותר) ---
    if (fileExistsInFolder(podcastFolder, fileName)) {
      Logger.log("🔁 נמצא פרק קיים: " + fileName + " — עוצר לולאה.");
      break;
    }

    // --- מציאת כתובת ה-Audio מתוך תגית enclosure ---
    var audioUrl = getEnclosureUrl(item);
    if (!audioUrl) {
      Logger.log("⚠️  אין enclosure לפרק: " + title + " — מדלג.");
      continue;
    }

    // --- הורדה ושמירה ב-Drive ---
    Logger.log("⬇️  מוריד: " + title);
    var audioResponse = UrlFetchApp.fetch(audioUrl, { muteHttpExceptions: true });

    if (audioResponse.getResponseCode() !== 200) {
      Logger.log("❌ שגיאת הורדה (" + audioResponse.getResponseCode() + ") עבור: " + title);
      continue;
    }

    var blob = audioResponse.getBlob().setName(fileName);
    podcastFolder.createFile(blob);
    downloaded++;
    Logger.log("✅ נשמר: " + fileName);
  }

  Logger.log("📥 סה\"כ פרקים חדשים שהורדו לערוץ זה: " + downloaded);
}


// =====================================================================
// פונקציות עזר
// =====================================================================

/**
 * מחזיר תיקייה קיימת לפי שם, או יוצר אותה אם לא קיימת.
 */
function getOrCreateFolder(parentFolder, folderName) {
  var it = parentFolder.getFoldersByName(folderName);
  if (it.hasNext()) {
    return it.next();
  }
  Logger.log("📂 יוצר תיקייה חדשה: " + folderName);
  return parentFolder.createFolder(folderName);
}

/**
 * בודק האם קובץ בשם מסוים קיים בתיקייה.
 */
function fileExistsInFolder(folder, fileName) {
  var it = folder.getFilesByName(fileName);
  return it.hasNext();
}

/**
 * שולף את כתובת האודיו מתגית <enclosure url="...">
 */
function getEnclosureUrl(item) {
  var enclosure = item.getChild("enclosure");
  if (!enclosure) return null;
  return enclosure.getAttribute("url") ? enclosure.getAttribute("url").getValue() : null;
}

/**
 * מנקה שם לשימוש כשם תיקייה ב-Drive.
 * מסיר תווים לא חוקיים, מגביל ל-100 תווים.
 */
function sanitizeFolderName(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, "_")  // תווים אסורים ב-Windows/Drive
    .replace(/\s+/g, " ")            // ריבוי רווחים לרווח יחיד
    .trim()
    .substring(0, 100);
}

/**
 * מנקה שם לשימוש כשם קובץ.
 * מסיר תווים בעייתיים ומגביל ל-150 תווים.
 */
function sanitizeFileName(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 150);
}
