/**
 * podcast_processor.js
 * =====================
 * קובץ הלוגיקה המרכזית של מערכת הורדת הפודקאסטים.
 * קובץ זה נשמר ב-Google Drive ונקרא ומורץ ע"י ה-Trigger Script.
 *
 * אין להריץ קובץ זה ישירות מ-Apps Script — הוא מיועד לקריאה דרך eval() בלבד.
 */

// =====================================================================
// נקודת כניסה ראשית — נקראת מ-trigger_script.gs
// =====================================================================

/**
 * run(rssFileId, rootFolderId)
 * נטענת דרך eval() מ-trigger_script.gs.
 * טוענת את רשימת ה-RSS מ-Drive, מנתחת אותה, ומפעילה את processPodcasts().
 */
function run(rssFileId, rootFolderId) {
  Logger.log("🚀 מערכת הורדת פודקאסטים — " + new Date().toLocaleString("he-IL"));

  // טעינת קובץ RSS מ-Drive ופרסור שורות
  var content = DriveApp.getFileById(rssFileId).getBlob().getDataAsString("UTF-8");
  var rssList = content.split("\n")
    .map(function(l) { return l.trim(); })
    .filter(function(l) {
      if (l === "" || l.charAt(0) === "#") return false;
      if (l.indexOf("http") !== 0) {
        Logger.log("⚠️  שורה לא תקינה בקובץ הרשימה (מדולגת): " + l);
        return false;
      }
      return true;
    });

  if (rssList.length === 0) {
    Logger.log("⚠️  לא נמצאו כתובות RSS תקינות — מסיים.");
    return;
  }

  Logger.log("📋 נטענו " + rssList.length + " כתובות RSS.");
  processPodcasts(rssList, rootFolderId);
  Logger.log("🏁 ריצה הסתיימה: " + new Date().toLocaleString("he-IL"));
}


// =====================================================================
// קבועים גלובליים
// =====================================================================

var SEVEN_DAYS_MS     = 7 * 24 * 60 * 60 * 1000;        // 7 ימים במילישניות
var TIME_LIMIT_MS     = 5.5 * 60 * 1000;                 // עצירה ב-5.5 דקות (מגבלת GAS: 6)
var ITUNES_NS_URL     = "http://www.itunes.com/dtds/podcast-1.0.dtd";
var MAX_DIRECT_BYTES  = 45 * 1024 * 1024;                // 45MB — מתחת למגבלת UrlFetchApp
var CHUNK_SIZE_BYTES  = 15 * 1024 * 1024;                // 15MB לכל chunk (60 × 256KB — נדרש ע"י Drive API)


// =====================================================================
// פונקציה ראשית — נקראת מ-Trigger Script עם מערך כתובות ה-RSS
// =====================================================================
function processPodcasts(rssList, rootFolderId) {

  if (!rssList || rssList.length === 0) {
    Logger.log("⚠️  רשימת הפודקאסטים ריקה — אין מה לעבד.");
    return;
  }
  if (!rootFolderId) {
    throw new Error("חסר rootFolderId — יש להגדיר אותו ב-Trigger Script.");
  }

  var rootFolder = DriveApp.getFolderById(rootFolderId);
  var startTime  = new Date();

  Logger.log("📁 תיקיית-על: " + rootFolder.getName());
  Logger.log("🎙️  מספר פודקאסטים לבדיקה: " + rssList.length);

  for (var i = 0; i < rssList.length; i++) {
    var rssUrl = rssList[i];

    // --- Time Guard ברמת הפיד ---
    if (new Date() - startTime > TIME_LIMIT_MS) {
      Logger.log("⏰ מגבלת זמן הריצה הגיעה — עוצר לפני: " + rssUrl);
      Logger.log("   הפרקים שלא הורדו יטופלו בריצה הבאה.");
      break;
    }

    Logger.log("\n──────────────────────────────────────");
    Logger.log("⏳ מעבד: " + rssUrl);

    try {
      processSingleFeed(rssUrl, rootFolder, startTime);
    } catch (e) {
      Logger.log("❌ שגיאה בעיבוד " + rssUrl + ": " + e.message);
    }
  }

  Logger.log("\n✅ סיום עיבוד כל הפודקאסטים.");
}


// =====================================================================
// עיבוד פיד RSS בודד
// =====================================================================
function processSingleFeed(rssUrl, rootFolder, startTime) {

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

  // --- Namespace של iTunes ---
  var itunesNs = XmlService.getNamespace(ITUNES_NS_URL);

  // --- פרטי הערוץ ---
  var channelTitle  = channel.getChildText("title") || "פודקאסט_ללא_שם";
  var channelAuthor = channel.getChildText("author", itunesNs)
                   || channel.getChildText("author")
                   || "";
  var folderName    = sanitizeFolderName(channelTitle);

  Logger.log("🎙️  ערוץ: " + channelTitle);

  // --- מציאת / יצירת תיקייה ---
  var podcastFolder = getOrCreateFolder(rootFolder, folderName);

  // --- גבול תאריך: 7 ימים אחורה ---
  var cutoffDate = new Date(Date.now() - SEVEN_DAYS_MS);

  // --- מעבר על פרקים ---
  var items      = channel.getChildren("item");
  var downloaded = 0;

  Logger.log("📋 מספר פרקים ב-RSS: " + items.length);

  for (var j = 0; j < items.length; j++) {
    var item = items[j];

    // ── 1. בדיקת תאריך ──
    var pubDateStr = item.getChildText("pubDate") || "";
    var pubDate    = pubDateStr ? new Date(pubDateStr) : null;

    if (pubDate && !isNaN(pubDate) && pubDate < cutoffDate) {
      Logger.log("📅 הגענו לפרקים מעבר ל-7 ימים — עוצר לפודקאסט זה.");
      break;
    }

    var title         = item.getChildText("title") || ("פרק_" + (j + 1));
    var enclosureInfo = getEnclosureInfo(item);

    if (!enclosureInfo) {
      Logger.log("⚠️  אין enclosure לפרק: " + title + " — מדלג.");
      continue;
    }

    // ── 2. שם הקובץ = כותרת הפרק + סיומת ──
    var fileExt  = getFileExtension(enclosureInfo.url, enclosureInfo.type);
    var fileName = sanitizeFileName(title) + fileExt;

    // ── 3. בדיקת קיום ──
    if (fileExistsInFolder(podcastFolder, fileName)) {
      Logger.log("🔁 פרק קיים: " + fileName + " — מדלג, ממשיך לבדוק פרקים נוספים.");
      continue;
    }

    // ── 4. Time Guard לפני ההורדה ──
    if (new Date() - startTime > TIME_LIMIT_MS) {
      Logger.log("⏰ מגבלת זמן — עוצר הורדות לפודקאסט זה.");
      break;
    }

    // ── 5. הורדת קובץ האודיו (תומכת בקבצים גדולים) ──
    Logger.log("⬇️  מוריד: " + title);

    var audioMimeType = enclosureInfo.type || "audio/mpeg";
    var dlSuccess     = downloadAndSaveAudio(
      enclosureInfo.url,
      fileName,
      audioMimeType,
      podcastFolder,
      startTime
    );

    if (!dlSuccess) {
      Logger.log("❌ ההורדה נכשלה עבור: " + title + " — מדלג.");
      continue;
    }

    downloaded++;
    Logger.log("✅ נשמר: " + fileName);

    // ── 6. יצירת קובץ LRC ──
    var description   = item.getChildText("description")             || "";
    var duration      = item.getChildText("duration",  itunesNs)     || "";
    var episodeAuthor = item.getChildText("author",    itunesNs)
                     || item.getChildText("author")
                     || channelAuthor;
    var episodeNum    = item.getChildText("episode",   itunesNs)     || "";
    var season        = item.getChildText("season",    itunesNs)     || "";
    var subtitle      = item.getChildText("subtitle",  itunesNs)     || "";
    var guid          = item.getChildText("guid")                    || enclosureInfo.url;

    createLrcFile(podcastFolder, sanitizeFileName(title), {
      channelTitle  : channelTitle,
      episodeTitle  : title,
      pubDate       : pubDateStr,
      author        : episodeAuthor,
      duration      : duration,
      episodeNumber : episodeNum,
      season        : season,
      subtitle      : subtitle,
      guid          : guid,
      description   : description
    });
  }

  Logger.log("📥 סה\"כ פרקים חדשים שהורדו לערוץ זה: " + downloaded);
}


// =====================================================================
// הורדת קובץ אודיו ושמירה ישירה ב-Drive
// תומכת בקבצים גדולים מ-45MB דרך Chunked Download + Resumable Upload
// =====================================================================

/**
 * מנקודת כניסה יחידה להורדה.
 * קבצים ≤45MB: הורדה רגילה עם UrlFetchApp.
 * קבצים >45MB: HEAD לבדיקת תמיכת Range → הורדה ב-chunks + Resumable Upload ל-Drive.
 */
function downloadAndSaveAudio(url, fileName, mimeType, folder, startTime) {

  // שלב א׳: HEAD request לבדיקת גודל ותמיכת Range
  var contentLength = 0;
  var supportsRange = false;

  try {
    var headResp  = UrlFetchApp.fetch(url, { method: "head", muteHttpExceptions: true });
    var hdrs      = headResp.getHeaders();
    contentLength = parseInt(hdrs["Content-Length"] || hdrs["content-length"] || "0", 10);
    var ar        = (hdrs["Accept-Ranges"] || hdrs["accept-ranges"] || "").toLowerCase();
    supportsRange = (ar === "bytes");
  } catch (e) {
    Logger.log("⚠️  HEAD request נכשל, מנסה הורדה רגילה: " + e.message);
  }

  // שלב ב׳: קובץ קטן (או גודל לא ידוע) — הורדה רגילה
  if (contentLength === 0 || contentLength <= MAX_DIRECT_BYTES) {
    return downloadDirect(url, fileName, folder);
  }

  // שלב ג׳: קובץ גדול — חייב תמיכת Range
  Logger.log("📦 קובץ גדול: " + Math.round(contentLength / 1024 / 1024) + "MB");
  if (!supportsRange) {
    Logger.log("⚠️  השרת לא מחזיר Accept-Ranges: bytes. מנסה הורדה רגילה בכל זאת...");
    // ניסיון אחרון — יכשל אם הקובץ >50MB, אבל שווה לנסות
    return downloadDirect(url, fileName, folder);
  }

  return downloadChunked(url, fileName, mimeType, folder, contentLength, startTime);
}

/**
 * הורדה רגילה — לקבצים עד 45MB.
 */
function downloadDirect(url, fileName, folder) {
  var resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
  if (resp.getResponseCode() !== 200) {
    Logger.log("❌ שגיאת HTTP (" + resp.getResponseCode() + ") בהורדת: " + fileName);
    return false;
  }
  folder.createFile(resp.getBlob().setName(fileName));
  return true;
}

/**
 * הורדת קובץ גדול ב-chunks + העלאה מיידית ל-Drive דרך Resumable Upload API.
 * בכל רגע נתון רק chunk בודד (15MB) נמצא בזיכרון.
 *
 * דרישות Drive Resumable Upload:
 *  - גודל chunk חייב להיות מכפלה של 256KB (262,144 bytes) — 15MB = 60 × 256KB ✓
 *  - ה-chunk האחרון יכול להיות בכל גודל
 *  - קוד 308 = chunk התקבל, ממשיך | 200/201 = הקובץ הושלם
 */
function downloadChunked(url, fileName, mimeType, folder, contentLength, startTime) {

  var token = ScriptApp.getOAuthToken();

  // ── פתיחת Resumable Upload Session ──
  var initResp = UrlFetchApp.fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable",
    {
      method  : "POST",
      headers : {
        "Authorization"           : "Bearer " + token,
        "Content-Type"            : "application/json",
        "X-Upload-Content-Type"   : mimeType,
        "X-Upload-Content-Length" : String(contentLength)
      },
      payload            : JSON.stringify({ name: fileName, parents: [folder.getId()] }),
      muteHttpExceptions : true
    }
  );

  if (initResp.getResponseCode() !== 200) {
    Logger.log("❌ פתיחת Resumable Upload נכשלה: HTTP " + initResp.getResponseCode());
    return false;
  }

  var uploadUrl = initResp.getHeaders()["Location"] || initResp.getHeaders()["location"];
  if (!uploadUrl) {
    Logger.log("❌ חסר Location header ב-Resumable Upload response.");
    return false;
  }

  Logger.log("📡 פתיחת Resumable Upload הצליחה. מתחיל להוריד " +
    Math.ceil(contentLength / CHUNK_SIZE_BYTES) + " chunks...");

  // ── לולאת chunks ──
  var offset   = 0;
  var chunkNum = 0;

  while (offset < contentLength) {

    // Time Guard בתוך הלולאה
    if (new Date() - startTime > TIME_LIMIT_MS) {
      Logger.log("⏰ מגבלת זמן באמצע הורדה ב-chunks — מבטל session.");
      try {
        UrlFetchApp.fetch(uploadUrl, { method: "delete", muteHttpExceptions: true });
      } catch (e) { /* לא קריטי */ }
      return false;
    }

    var end       = Math.min(offset + CHUNK_SIZE_BYTES - 1, contentLength - 1);
    var chunkSize = end - offset + 1;
    chunkNum++;

    Logger.log("  📥 Chunk " + chunkNum + ": " +
      Math.round(offset/1024/1024) + "MB – " + Math.round((end+1)/1024/1024) + "MB");

    // הורדת chunk מה-CDN של הפודקאסט
    var chunkResp = UrlFetchApp.fetch(url, {
      headers            : { "Range": "bytes=" + offset + "-" + end },
      muteHttpExceptions : true
    });

    var chunkCode = chunkResp.getResponseCode();
    if (chunkCode !== 206 && chunkCode !== 200) {
      Logger.log("❌ הורדת chunk נכשלה: HTTP " + chunkCode);
      try { UrlFetchApp.fetch(uploadUrl, { method: "delete", muteHttpExceptions: true }); } catch(e) {}
      return false;
    }

    var chunkBytes = chunkResp.getContent();  // byte[] — רק 15MB בזיכרון

    // העלאת chunk ל-Drive
    var uploadResp = UrlFetchApp.fetch(uploadUrl, {
      method  : "PUT",
      headers : {
        "Content-Range" : "bytes " + offset + "-" + end + "/" + contentLength,
        "Content-Type"  : mimeType
      },
      payload            : chunkBytes,
      muteHttpExceptions : true
    });

    var uploadCode = uploadResp.getResponseCode();

    if (uploadCode === 308) {
      // chunk התקבל, ממשיך ל-chunk הבא
    } else if (uploadCode === 200 || uploadCode === 201) {
      // הקובץ כולו הושלם
      Logger.log("✅ chunked download הושלם: " + fileName);
      return true;
    } else {
      Logger.log("❌ העלאת chunk ל-Drive נכשלה: HTTP " + uploadCode +
        " | " + uploadResp.getContentText().substring(0, 200));
      return false;
    }

    offset = end + 1;
    Logger.log("  ✔ " + Math.round(offset/1024/1024) + "/" +
      Math.round(contentLength/1024/1024) + "MB הועלו.");
  }

  Logger.log("✅ chunked download הושלם: " + fileName);
  return true;
}


// =====================================================================
// פונקציות עזר
// =====================================================================

/**
 * מחזיר תיקייה קיימת לפי שם, או יוצר אותה אם לא קיימת.
 */
function getOrCreateFolder(parentFolder, folderName) {
  var it = parentFolder.getFoldersByName(folderName);
  if (it.hasNext()) return it.next();
  Logger.log("📂 יוצר תיקייה חדשה: " + folderName);
  return parentFolder.createFolder(folderName);
}

/**
 * בודק האם קובץ בשם מסוים קיים בתיקייה.
 */
function fileExistsInFolder(folder, fileName) {
  return folder.getFilesByName(fileName).hasNext();
}

/**
 * שולף כתובת URL וסוג MIME מתגית <enclosure>.
 * מחזיר {url, type} או null.
 */
function getEnclosureInfo(item) {
  var enclosure = item.getChild("enclosure");
  if (!enclosure) return null;
  var urlAttr = enclosure.getAttribute("url");
  if (!urlAttr) return null;
  var typeAttr = enclosure.getAttribute("type");
  return {
    url  : urlAttr.getValue(),
    type : typeAttr ? typeAttr.getValue() : ""
  };
}

/**
 * מחלץ סיומת קובץ אמיתית מה-URL, עם fallback לפי MIME type.
 */
function getFileExtension(url, mimeType) {
  var knownExts = ["mp3", "m4a", "mp4", "ogg", "wav", "flac", "aac", "opus"];
  var cleanUrl  = url.split("?")[0].split("#")[0];
  var lastDot   = cleanUrl.lastIndexOf(".");
  if (lastDot > -1) {
    var ext = cleanUrl.substring(lastDot + 1).toLowerCase();
    if (knownExts.indexOf(ext) > -1) return "." + ext;
  }
  var mimeMap = {
    "audio/mpeg"  : ".mp3",
    "audio/mp3"   : ".mp3",
    "audio/x-m4a" : ".m4a",
    "audio/mp4"   : ".m4a",
    "audio/ogg"   : ".ogg",
    "audio/aac"   : ".aac",
    "audio/opus"  : ".opus"
  };
  return mimeMap[mimeType] || ".mp3";
}

/**
 * יוצר קובץ .lrc לצד קובץ האודיו עם כל פרטי הפרק.
 * אם הקובץ כבר קיים — לא יוצר כפול.
 */
function createLrcFile(folder, baseName, meta) {
  var lrcName = baseName + ".lrc";
  if (folder.getFilesByName(lrcName).hasNext()) return;

  var lines = [
    "פודקאסט:      " + meta.channelTitle,
    "פרק:          " + meta.episodeTitle,
    "תאריך פרסום:  " + meta.pubDate,
    "מגיש / כותב:  " + meta.author,
    "משך:          " + meta.duration
  ];

  if (meta.season)        lines.push("עונה:          " + meta.season);
  if (meta.episodeNumber) lines.push("מספר פרק:     "  + meta.episodeNumber);
  if (meta.subtitle)      lines.push("כותרת משנה:   "  + meta.subtitle);
  if (meta.guid)          lines.push("מזהה ייחודי:  "  + meta.guid);

  lines.push("");
  lines.push("── תיאור ──────────────────────────────────");

  var cleanDescription = meta.description
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g,  "&")
    .replace(/&lt;/g,   "<")
    .replace(/&gt;/g,   ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g,  "'")
    .trim();
  lines.push(cleanDescription);

  folder.createFile(lrcName, lines.join("\n"), MimeType.PLAIN_TEXT);
  Logger.log("📄 נוצר קובץ LRC: " + lrcName);
}

/**
 * מנקה שם לשימוש כשם תיקייה ב-Drive.
 */
function sanitizeFolderName(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 100);
}

/**
 * מנקה שם לשימוש כשם קובץ.
 */
function sanitizeFileName(name) {
  return name
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, " ")
    .trim()
    .substring(0, 150);
}
