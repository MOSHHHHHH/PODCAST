# 🎙️ מערכת הורדת פודקאסטים אוטומטית

מערכת לגיבוי אוטומטי של פרקי פודקאסט ל-Google Drive, מבוססת Google Apps Script.  
כל לילה המערכת סורקת פידי RSS, מורידה פרקים חדשים ויוצרת לצד כל פרק קובץ מידע מלא.

---

## 📋 תוכן עניינים

- [סקירה כללית](#סקירה-כללית)
- [מבנה הקבצים](#מבנה-הקבצים)
- [דרישות מוקדמות](#דרישות-מוקדמות)
- [התקנה](#התקנה)
- [הגדרת הטריגרים האוטומטיים](#הגדרת-הטריגרים-האוטומטיים)
- [מבנה הפלט ב-Drive](#מבנה-הפלט-ב-drive)
- [מידע טכני](#מידע-טכני)
- [מגבלות ופתרונות](#מגבלות-ופתרונות)
- [פתרון תקלות](#פתרון-תקלות)

---

## סקירה כללית

```
RSS Feed 1 ─┐
RSS Feed 2 ─┤─▶ Google Apps Script ─▶ Google Drive
RSS Feed N ─┘        (כל לילה)
```

המערכת רצה **4 פעמים בלילה** (01:00, 02:00, 03:00, 04:00), כל ריצה עד 5.5 דקות.  
ריצה שנייה מדלגת אוטומטית על מה שכבר הורד וממשיכה משם שהפסיקה — סה"כ עד **~22 דקות הורדה אפקטיביות** בלילה.

### מה מורד?

- פרקים שפורסמו **ב-7 הימים האחרונים** בלבד
- פרקים שאינם קיימים עדיין בתיקייה (לא מורידים כפולים)
- לצד כל פרק — קובץ `.lrc` עם כל המטאדטה

---

## מבנה הקבצים

```
podcast-downloader/
├── trigger_script.gs      # מוכנס ל-Google Apps Script — מכיל רק הגדרות וטריגרים
├── podcast_processor.js   # כל הלוגיקה — מועלה ל-Google Drive
├── README.md              # קובץ זה
└── הנחיות_הפעלה.txt       # הוראות מפורטות להפעלה
```

### הפרדת אחריות

| קובץ | תפקיד | היכן נשמר |
|------|--------|-----------|
| `trigger_script.gs` | טוען את הלוגיקה מ-Drive ומריץ אותה; מגדיר טריגרים | Apps Script בלבד |
| `podcast_processor.js` | כל לוגיקת ה-RSS, ההורדה, ה-chunking והכתיבה ל-Drive | Google Drive |
| `podcasts.txt` | רשימת כתובות RSS — נוצר ידנית על ידי המשתמש | Google Drive |

> **עיצוב מכוון:** `trigger_script.gs` קצר ככל האפשר (56 שורות).  
> עדכון הלוגיקה מחייב עדכון `podcast_processor.js` ב-Drive בלבד — ללא נגיעה ב-Apps Script.

---

## דרישות מוקדמות

- חשבון Google (Gmail / Google Workspace)
- גישה ל-[Google Drive](https://drive.google.com)
- גישה ל-[Google Apps Script](https://script.google.com)

---

## התקנה

### שלב 1 — הכנת Google Drive

**א. העלאת קובץ הלוגיקה**

העלה את `podcast_processor.js` ל-Google Drive:  
`Drive → New → File upload → בחר podcast_processor.js`

**ב. יצירת קובץ רשימת ה-RSS**

צור קובץ בשם `podcasts.txt` והעלה אותו ל-Drive עם כתובות ה-RSS:

```
# שורות המתחילות ב-# הן הערות — מדולגות
# שורות ריקות מדולגות

https://feeds.simplecast.com/example_podcast
https://rss.art19.com/another-show
https://anchor.fm/s/abc123/podcast/rss
```

**ג. יצירת תיקיית יעד**

צור תיקייה ב-Drive שבה יישמרו הפרקים (לדוגמה: `פודקאסטים`).

**ד. איסוף ה-IDs**

לכל אחד מ-3 הפריטים שיצרת, פתח אותו ב-Drive והעתק את ה-ID מה-URL:

```
קובץ:    https://drive.google.com/file/d/[FILE_ID]/view
תיקייה: https://drive.google.com/drive/folders/[FOLDER_ID]
```

> ⚠️ אין תמיכה בנתיבים (`/תיקייה/קובץ`) ב-GAS — יש להשתמש ב-ID בלבד.

---

### שלב 2 — הגדרת Apps Script

1. פתח [script.google.com](https://script.google.com) ← לחץ **New project**
2. מחק את כל הקוד הקיים
3. הדבק את תוכן `trigger_script.gs`
4. מלא את שלושת ה-IDs בראש הקובץ:

```javascript
var PROCESSOR_FILE_ID = "ID של podcast_processor.js";
var RSS_LIST_FILE_ID  = "ID של podcasts.txt";
var ROOT_FOLDER_ID    = "ID של תיקיית הפודקאסטים";
```

5. שמור (`Ctrl+S`)

---

### שלב 3 — הרצה ראשונה ואישור הרשאות

בחר `dailyRun` מהתפריט הנפתח ← לחץ **▶ Run**

בחלון ההרשאות שיפתח, אשר את:

| הרשאה | שימוש |
|-------|-------|
| Google Drive | קריאת הלוגיקה וה-RSS; כתיבת קבצי האודיו |
| Gmail | שליחת מייל אוטומטי בשגיאה קריטית |
| External requests | הורדת פרקים ופידי RSS מהאינטרנט |

> אם מופיע **"Google hasn't verified this app"** ← לחץ **Advanced** ← **Go to [שם פרויקט] (unsafe)**

לאחר הריצה, בדוק לוג תקין דרך **View → Logs**:

```
🚀 מערכת הורדת פודקאסטים — 28/5/2026, 14:00:00
📋 נטענו 5 כתובות RSS.
📁 תיקיית-על: פודקאסטים
🎙️  ערוץ: שם הפודקאסט
⬇️  מוריד: כותרת פרק
✅ נשמר: כותרת פרק.mp3
📄 נוצר קובץ LRC: כותרת פרק.lrc
🏁 ריצה הסתיימה: 28/5/2026, 14:03:21
```

---

## הגדרת הטריגרים האוטומטיים

לאחר שהריצה הידנית עבדה, הרץ `setupTrigger` פעם אחת בלבד:

בחר `setupTrigger` מהתפריט הנפתח ← לחץ **▶ Run**

ייווצרו 4 טריגרים אוטומטיים:

| שעה | חלון ריצה |
|-----|-----------|
| 01:00 | 01:00 – 02:00 |
| 02:00 | 02:00 – 03:00 |
| 03:00 | 03:00 – 04:00 |
| 04:00 | 04:00 – 05:00 |

לאימות: **תפריט שמאל → ⏰ Triggers** — אמורות להופיע 4 שורות.

> ⚠️ אין להריץ `setupTrigger` יותר מפעם אחת. אם בטעות הרצת שוב: כנס ל-Triggers, מחק הכל ידנית, הרץ מחדש.

---

## מבנה הפלט ב-Drive

```
📁 פודקאסטים/
├── 📁 שם פודקאסט א׳/
│   ├── 🎵 כותרת פרק 1.mp3
│   ├── 📄 כותרת פרק 1.lrc
│   ├── 🎵 כותרת פרק 2.mp3
│   └── 📄 כותרת פרק 2.lrc
└── 📁 שם פודקאסט ב׳/
    ├── 🎵 כותרת פרק.m4a
    └── 📄 כותרת פרק.lrc
```

### מבנה קובץ LRC

```
פודקאסט:      שם הפודקאסט
פרק:          כותרת הפרק המלאה
תאריך פרסום:  Mon, 26 May 2025 08:00:00 +0000
מגיש / כותב:  שם המגיש
משך:          45:32
עונה:         3
מספר פרק:     12
כותרת משנה:   תקציר קצר
מזהה ייחודי:  https://example.com/episode/guid

── תיאור ──────────────────────────────────
תיאור מלא של הפרק, ללא תגיות HTML.
```

> שדות כמו עונה, מספר פרק וכותרת משנה מופיעים רק אם קיימים בפיד.

---

## מידע טכני

### ארכיטקטורה

```
dailyRun()  [trigger_script.gs]
    │
    ├─ eval(podcast_processor.js)   ← טוען מ-Drive בכל ריצה
    │
    └─ run(rssFileId, rootFolderId)  [podcast_processor.js]
           │
           ├─ טוען podcasts.txt מ-Drive
           ├─ מנתח שורות RSS
           └─ processPodcasts(rssList, rootFolderId)
                  │
                  └─ לכל פיד: processSingleFeed()
                         │
                         ├─ שליפת RSS + פרסור XML
                         ├─ לכל פרק: downloadAndSaveAudio()
                         │       ├─ HEAD → בדיקת גודל ו-Range support
                         │       ├─ קובץ ≤ 45MB → downloadDirect()
                         │       └─ קובץ > 45MB → downloadChunked()
                         │               ├─ Drive Resumable Upload API
                         │               └─ chunks של 15MB
                         └─ createLrcFile()
```

### טיפול בקבצים גדולים (Chunked Download)

קבצים מעל 45MB מורדים ב-chunks ומועלים ישירות ל-Drive:

```
CDN של הפודקאסט          Google Apps Script        Google Drive
       │                        │                        │
       │◄── Range: 0-15MB ──────│                        │
       │─── 206 Partial ────────►│                        │
       │                        │── PUT chunk 1 ─────────►│
       │                        │◄── 308 Resume ──────────│
       │◄── Range: 15-30MB ─────│                        │
       │─── 206 Partial ────────►│                        │
       │                        │── PUT chunk 2 ─────────►│
       │                        │◄── 200 OK ──────────────│
       │                        │                     קובץ שלם
```

- **גודל chunk:** 15MB (= 60 × 256KB, נדרש ע"י Drive Resumable Upload API)
- **זיכרון מקסימלי:** 15MB בלבד בכל רגע נתון
- **תנאי:** השרת חייב לתמוך ב-`Accept-Ranges: bytes`

### Namespace של iTunes

המערכת תומכת בפידי RSS סטנדרטיים + שדות iTunes:

| שדה RSS סטנדרטי | שדה iTunes |
|-----------------|------------|
| `<title>` | `<itunes:title>` |
| `<author>` | `<itunes:author>` |
| `<pubDate>` | — |
| `<description>` | `<itunes:subtitle>` |
| — | `<itunes:duration>` |
| — | `<itunes:episode>` |
| — | `<itunes:season>` |

### סינון פרקים

```
פרק ב-RSS
    │
    ├─ תאריך > 7 ימים? ──► break (כל הבאים ישנים יותר)
    │
    ├─ אין enclosure? ────► continue (פרק ללא קובץ אודיו)
    │
    ├─ קובץ קיים ב-Drive? ► continue (לא מוריד כפולים)
    │
    ├─ מגבלת זמן? ────────► break (ריצה הבאה תמשיך)
    │
    └─ הורדה ✓
```

---

## מגבלות ופתרונות

| מגבלת GAS | ערך | פתרון במערכת |
|-----------|-----|--------------|
| זמן ריצה מקסימלי | 6 דקות | Time Guard עוצר ב-5.5 דקות; 4 ריצות לילה |
| גודל response מקסימלי | 50MB | Chunked Download + Resumable Upload |
| UrlFetch בקשות/יום | 20,000 | בשימוש רגיל (<20 פודקאסטים) אין בעיה |

---

## עדכון ותחזוקה

**הוספה/הסרה של פודקאסט:**  
ערוך את `podcasts.txt` ב-Drive — יכנס לתוקף בריצה הבאה. אין צורך לנגוע ב-Apps Script.

**עדכון הלוגיקה:**  
החלף את `podcast_processor.js` ב-Drive — ייטען אוטומטית בריצה הבאה.

**שינוי שעות הריצה:**  
ערוך את `[1, 2, 3, 4]` בפונקציית `setupTrigger` ← הרץ אותה מחדש.

**צפייה בלוגים:**  
Apps Script → **Executions** (תפריט שמאל) — מציג היסטוריה מלאה.

---

## פתרון תקלות

| שגיאה | סיבה | פתרון |
|-------|------|-------|
| `No item with the given ID` | ID שגוי | בדוק את 3 ה-IDs ב-`trigger_script.gs` |
| `Authorization required` בכל ריצה | הריצה הראשונה טרם אושרה ידנית | הרץ `dailyRun` ידנית פעם אחת |
| `HTTP 403` על פרק | הפיד דורש מנוי | לא ניתן להוריד אוטומטית |
| `Chunk upload failed: 403` | בעיית הרשאות Drive API | ודא שמריץ הסקריפט הוא בעל הקבצים ב-Drive |
| טריגרים כפולים | `setupTrigger` הורץ פעמיים | מחק ב-Triggers ידנית, הרץ מחדש |
| פרק לא הורד — אין הודעת שגיאה | השרת לא תומך ב-Range requests | קובץ גדול על שרת ישן — לא ניתן להוריד |
