# Frontend Prompt: Lyrics Source Upload + Admin LRC Review/Import

You are updating the frontend for the new lyrics workflow in the music platform.

## Goal

Implement a two-step lyrics workflow:

1. Artist uploads a lyric source file to Firebase Storage only.
2. Backend stores the lyric source path in `songs.lyrics_path`.
3. Admin reviews that source file.
4. Only admin can validate and import `.lrc` content into the `lyrics` table in the backend DB.

Important:

- Source files must be uploaded by the frontend to the Firebase Storage folder `uploads/lyric/`.
- Backend does **not** upload lyric files.
- Backend only stores `lyrics_path` and later reads that source file for admin validation/import.

## Backend Changes Already Done

### Database

- Added migration: `database/migrations/20260401_add_song_lyrics_path.sql`
- New song column: `lyrics_path VARCHAR(1024) NULL`

### Existing APIs Updated

These APIs now accept `lyrics_path` in the request body:

- `POST /api/songs`
- `PUT /api/songs/:id`
- `PUT /api/admin/songs/:id`

Aliases also accepted by backend:

- `lyrics_path`
- `lyricsPath`
- `lyrics_url`

Backend normalizes them into `lyrics_path`.

### New Admin APIs

- `POST /api/admin/songs/:id/lyrics/validate`
- `POST /api/admin/songs/:id/lyrics/import`

These APIs use the stored `songs.lyrics_path`.

## Required Frontend UX

### 1. Artist Create/Edit Song

For artist song create/edit screens:

- Add a lyric source file picker.
- Accepted file types: `.txt`, `.lrc`
- Upload the selected file directly from frontend to Firebase Storage under `uploads/lyric/`.
- After upload succeeds, store the returned file URL or storage path in the song form as `lyrics_path`.
- When submitting song create/edit:
  - send `lyrics_path` together with the rest of the song payload
  - do **not** call any import API

Artist flow ends after storing source file path only.

### 2. Admin Song Review

For admin song detail/edit screen:

- Show `lyrics_path` if present.
- Show whether lyrics were already imported via `has_lyrics_in_db`.
- If source file is `.txt`:
  - show download/open link
  - admin handles conversion outside the system
  - admin uploads the new `.lrc` file to Firebase Storage under `uploads/lyric/`
  - then frontend calls `PUT /api/admin/songs/:id` with the new `lyrics_path`
- If source file is `.lrc`:
  - show a "Validate LRC" action
  - show parsed preview and warnings from backend
  - if valid, show an "Import To DB" action

Only admin can import `.lrc` into DB.

## API Contracts

### A. Create Song

`POST /api/songs`

Request body example:

```json
{
  "title": "Example Song",
  "album_id": 12,
  "genres": ["Pop"],
  "lyrics_path": "https://firebasestorage.googleapis.com/..."
}
```

Notes:

- Artist can send `.txt` or `.lrc` source path.
- Backend only saves the path.

### B. Update Song

`PUT /api/songs/:id`

Request body example:

```json
{
  "title": "Example Song Updated",
  "lyrics_path": "https://firebasestorage.googleapis.com/..."
}
```

### C. Admin Update Song

`PUT /api/admin/songs/:id`

Request body example:

```json
{
  "lyrics_path": "https://firebasestorage.googleapis.com/..."
}
```

Use this when admin replaces a `.txt` source with a processed `.lrc` source.

### D. Validate LRC Before Import

`POST /api/admin/songs/:id/lyrics/validate`

Request body:

```json
{}
```

Backend behavior:

- reads `songs.lyrics_path`
- rejects if no `lyrics_path`
- rejects if file is not `.lrc`
- downloads source file
- parses timestamps and lyric lines
- returns preview data

Success response shape:

```json
{
  "success": true,
  "data": {
    "song_id": 123,
    "song_title": "Example Song",
    "lyrics_path": "https://firebasestorage.googleapis.com/...",
    "source_type": "lrc",
    "line_count": 42,
    "has_lyrics_in_db": false,
    "warnings": [],
    "raw_preview": [
      "[00:31.157] Line one",
      "[00:34.954] Line two"
    ],
    "preview": [
      {
        "line_number": 1,
        "start_time": 31157,
        "end_time": 34953,
        "text": "Line one"
      },
      {
        "line_number": 2,
        "start_time": 34954,
        "end_time": 38400,
        "text": "Line two"
      }
    ]
  },
  "message": "Success"
}
```

Frontend UX for this response:

- render `raw_preview` as source preview
- render `preview` as parsed lines
- render `warnings` prominently if non-empty
- enable import button only after validate succeeds

### E. Import Validated LRC Into DB

`POST /api/admin/songs/:id/lyrics/import`

Request body:

```json
{}
```

Backend behavior:

- reads `songs.lyrics_path`
- rejects if file is not `.lrc`
- downloads source file
- parses it
- deletes old rows in `lyrics`
- inserts new lyric rows

Success response shape:

```json
{
  "success": true,
  "data": {
    "song_id": 123,
    "song_title": "Example Song",
    "lyrics_path": "https://firebasestorage.googleapis.com/...",
    "source_type": "lrc",
    "imported_count": 42,
    "has_lyrics_in_db": true,
    "warnings": [],
    "preview": [
      {
        "line_number": 1,
        "start_time": 31157,
        "end_time": 34953,
        "text": "Line one"
      }
    ]
  },
  "message": "Success"
}
```

Frontend after import:

- refresh song detail
- refresh admin list if needed
- show success state "Lyrics imported"
- reflect `has_lyrics_in_db = true`

## Response Fields To Use In Frontend

Privileged views now need to read:

- `lyrics_path`
- `has_lyrics_in_db`

Use them in:

- artist song detail/edit
- admin song list
- admin song detail/review

Do not assume public song APIs expose lyric source fields for anonymous users.

## File Handling Rules

- Upload only to `uploads/lyric/`
- Keep original source file, even if later importing `.lrc` into DB
- `.txt` is source-only, never imported directly
- `.lrc` is source + importable

## Recommended Frontend UI States

For each song in artist/admin views, derive one of these states:

- `no_source`: `lyrics_path` is empty
- `source_txt`: `lyrics_path` exists and ends with `.txt`
- `source_lrc_not_imported`: `.lrc` exists and `has_lyrics_in_db` is false
- `source_lrc_imported`: `.lrc` exists and `has_lyrics_in_db` is true

## Required Frontend Actions Summary

1. Add lyric source upload to artist create/edit song forms.
2. Upload lyric source to Firebase Storage folder `uploads/lyric/`.
3. Save returned path/url as `lyrics_path`.
4. Show lyric source info in admin song review UI.
5. Add admin "Validate LRC" button.
6. Add admin "Import To DB" button.
7. Add admin ability to replace source file and update `lyrics_path`.

## Important Implementation Note

If your Firebase upload layer returns both:

- a public download URL
- a storage object path

prefer storing the public download URL in `lyrics_path`, unless your current frontend/backend convention already consistently uses relative storage paths.
