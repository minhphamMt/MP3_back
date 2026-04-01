# Frontend Prompt: Artist Song Form Release Date + Layout Fixes

## Goal
Update the artist-facing create/edit song screens so they match the current backend behavior and stop the broken layout shown in the screenshots.

## Current Backend Facts
- `POST /api/songs` already accepts `release_date` for both admin and artist.
- `PUT /api/songs/:id` already accepts `release_date` for both admin and artist.
- Artist requests still get forced to `status = "pending"` by backend, but `release_date` is preserved.
- Public song visibility now requires all of the following:
  - `audio_path` exists and is not an empty string
  - `status = approved`
  - `release_date` is set
  - `release_date <= now`
  - if the song belongs to an album, that album must also be released

## Required Frontend Changes

### 1. Add release date field to artist create song form
- Add an input for `release_date`.
- Use a datetime input if the design allows it.
- If the UI only supports date, still submit a backend-compatible datetime string.
- Include `release_date` in the payload sent to `POST /api/songs`.
- Keep the field editable for artist.
- Do not hide it just because backend sets `status = pending`.

### 2. Add release date field to artist edit song form
- Add the same `release_date` input to the edit screen.
- Pre-fill it from the song detail response.
- Include `release_date` in the payload sent to `PUT /api/songs/:id`.
- Allow clearing it only if the product really wants "no schedule yet".
  - If cleared, send `null` or empty value consistently with the existing form serializer.

### 3. Fix broken layout in artist edit song screen
- The media/info cards are overflowing horizontally.
- Long filenames are forcing cards and action buttons out of the container.
- The right preview panel is visually colliding with the left form area.

Apply these layout rules:
- On the main two-column edit layout:
  - use a stable grid such as `grid-template-columns: minmax(0, 1.4fr) minmax(320px, 0.9fr)`
  - add a mobile breakpoint that collapses to one column
- On every grid/flex child that contains text content:
  - add `min-width: 0`
- On file name rows/cards:
  - allow filename text to shrink
  - apply `overflow: hidden`
  - apply `text-overflow: ellipsis`
  - apply `white-space: nowrap` for single-line truncation
  - if the design prefers multi-line, use line clamp instead
- On rows that contain file actions like "Mo file", "Tai file", "Chon file":
  - allow wrapping with `flex-wrap: wrap`
  - keep a visible gap between buttons
  - prevent buttons from pushing parent width wider than the card
- On info cards under lyric source / cover / audio:
  - make each card width-aware inside the container
  - avoid fixed widths that exceed the parent
- On the sticky preview/right-side panel:
  - ensure the column itself has `min-width: 0`
  - prevent child cards from using widths larger than the column
  - disable sticky behavior on narrower screens if it causes overlap

### 4. Fix file source sections
- The lyric source, cover, and audio sections should all use the same responsive pattern:
  - source file card
  - upload action area
  - metadata/helper cards
- Long Firebase object names must not stretch the section.
- Show the full filename via tooltip/title on hover if text is truncated.

### 5. Submission behavior
- Keep current Firebase upload flow:
  - frontend uploads source file directly to Firebase Storage
  - lyric files go to `uploads/lyric/`
  - frontend then sends the stored path/url to backend as `lyrics_path`
- Audio files still need to exist before a song can become publicly visible.
- Frontend should clearly indicate that a song without audio will not appear publicly.

## API Payload Examples

### Create song
```json
{
  "title": "Example Song",
  "album_id": 12,
  "genres": ["Pop", "Ballad"],
  "release_date": "2026-05-01 09:00:00",
  "lyrics_path": "uploads/lyric/example-song.lrc"
}
```

### Update song
```json
{
  "title": "Example Song Updated",
  "release_date": "2026-05-10 09:00:00",
  "lyrics_path": "uploads/lyric/example-song-v2.lrc"
}
```

## UX Notes
- Artist can set or edit `release_date`, but the song still stays pending until admin review.
- If audio is missing, show a warning badge or helper text:
  - `Bai hat chua co audio nen chua the hien thi cong khai.`
- If lyric source exists, keep showing the current file card, but do not let the filename break the layout.

## Acceptance Checklist
- Artist create form has a visible release date input.
- Artist edit form has a visible release date input with prefilled value.
- `release_date` is included in create/update requests.
- Long filenames no longer overflow their container.
- Action buttons wrap correctly on narrow widths.
- Right preview column no longer overlaps or forces horizontal overflow.
- Mobile layout stacks cleanly into one column.
