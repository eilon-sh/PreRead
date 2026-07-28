# Preread

**Preread** helps students learn academic English from their own articles and course materials. Upload an English PDF, and the system extracts advanced vocabulary by CEFR level, then builds flashcards, games, and achievements.

---

## Getting started

1. **Sign up** - Create an account on the registration page, or sign in with Google (if enabled).
2. **Log in** - After logging in, you land on the **Upload** page.
3. **Forgot your password?** - Use the reset link on the login page to receive an email. *(Local testing only.)*

---

## How it works

```
English PDF → automatic analysis → word list → study / games
```

1. **Upload a PDF** - An article, summary, or course handout in English.
2. **Processing** - The system extracts academic words, definitions, Hebrew translations, and CEFR tags (B1–C2).
3. **Learn** - Spaced-repetition flashcards (SM-2), games, XP, and achievements.

Processing runs in the background. On the Upload page, each document shows a status: **Uploading…**, **Processing**, **Ready**, or **Failed**.

---

## Uploading a document

On the **Upload** page:

- Choose a **PDF** file (up to **10 MB**, up to **100 pages**).
- Select a **minimum CEFR level** - e.g. “B2 and above” returns only B2+ words.
- Click **Upload and extract words**.

When the document is **Ready**, you can:

- Open the **word list**
- Start **Study** (flashcards)
- Play **word games**

> **Tip:** English PDFs work best. If the document has little or no English text, you may get no words.

---

## Main pages

| Page | What you do there |
| --- | --- |
| **Upload** | Upload PDFs, view existing documents and processing status |
| **Study** | SM-2 flashcards - the system schedules when each word comes back |
| **Profile** | Level, XP, daily streak, and overall progress |
| **Achievements** | Milestones and rewards for consistent learning |

From each ready document you can also open:

- **Words** - Full list, filter by level, print flashcards
- **Games** - Match words to definitions, multiple choice

---

## Studying with flashcards (SM-2)

1. Open **Study** (from the menu or from a specific document).
2. Read the word (and optional context from the article).
3. Click **Show answer**.
4. Rate how well you knew it:
   - **Again** - didn’t know it
   - **Hard** / **Good** / **Easy** / **Perfect**

Your rating affects **when** the word returns - not just whether it does. Lower ratings bring the word back sooner.

---

## Games, XP, and achievements

- **Games** - Fun practice on words you’ve already extracted.
- **XP** - Points from study and games; they add up to a higher **level**.
- **Streak** - Consecutive days of activity - shown on your profile.
- **Achievements** - Milestones (e.g. words learned or reviews completed).

---

## Dark mode

Use the **theme** toggle in the top corner (light / dark).

---

## FAQ

**How long does processing take?**  
Usually a few minutes, depending on file size. The Upload page refreshes automatically.

**Why are there no words in my document?**  
The PDF may be Hebrew-only, below the CEFR level you selected, or lack enough academic English text.

**Can I delete a document?**  
Yes - from the **Words** page; failed documents can also be deleted from **Upload**. You cannot delete a document while it is still processing.

**Are my documents private?**  
Yes. Every document and word belongs only to your account. You must be logged in to see your data.

---

## For developers

AWS infrastructure, deployment, and development setup: [`docs/aws-infrastructure.md`](docs/aws-infrastructure.md)
