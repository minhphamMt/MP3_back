import fs from "fs";
import path from "path";
import db from "../config/db.js";
import storageConfig from "../config/upload.js";
import { resolvePublicUrl } from "./storage.service.js";

const LRC_TIMESTAMP_PATTERN = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?\]/g;
const LRC_METADATA_PATTERN = /^\[([a-z]+):(.*)\]$/i;
const MAX_LRC_PREVIEW_ITEMS = 20;
const MAX_RAW_PREVIEW_LINES = 12;

const createError = (status, message, details) => {
  const error = new Error(message);
  error.status = status;
  if (details !== undefined) {
    error.details = details;
  }
  return error;
};

const normalizeFractionMs = (value = "") => {
  const digits = String(value).replace(/\D/g, "");
  if (!digits) {
    return 0;
  }

  return Number(digits.padEnd(3, "0").slice(0, 3));
};

const normalizeSongDurationToMs = (duration) => {
  const parsed = Number(duration);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return parsed >= 1000 ? Math.round(parsed) : Math.round(parsed * 1000);
};

const getLyricSourceExtension = (reference) => {
  const rawValue = String(reference || "").trim();
  if (!rawValue) {
    return "";
  }

  if (/^https?:\/\//i.test(rawValue)) {
    try {
      return path.posix.extname(
        decodeURIComponent(new URL(rawValue).pathname)
      ).toLowerCase();
    } catch {
      return "";
    }
  }

  if (/^gs:\/\//i.test(rawValue)) {
    const match = rawValue.match(/^gs:\/\/[^/]+\/(.+)$/i);
    return path.posix.extname(match?.[1] || "").toLowerCase();
  }

  const withoutQuery = rawValue.split("?")[0].split("#")[0];
  return path.posix.extname(decodeURIComponent(withoutQuery)).toLowerCase();
};

const buildPublicUrlFromGsReference = (reference) => {
  const match = String(reference || "").match(/^gs:\/\/([^/]+)\/(.+)$/i);
  if (!match) {
    throw createError(400, "Invalid gs:// lyrics_path");
  }

  const [, bucket, objectKey] = match;
  const encodedKey = objectKey
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  return `https://storage.googleapis.com/${bucket}/${encodedKey}`;
};

const readTextFromHttp = async (url) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw createError(
      400,
      `Failed to read lyric source file (${response.status})`
    );
  }

  return response.text();
};

const readTextFromLocalStorage = async (reference) => {
  const rawValue = String(reference || "").trim();
  const withoutQuery = rawValue.split("?")[0].split("#")[0];
  const normalized = withoutQuery.replace(/^\/+/, "");
  const relativePath = normalized.startsWith("uploads/")
    ? normalized.slice("uploads/".length)
    : normalized;
  const fullPath = path.join(storageConfig.local.uploadDir, relativePath);

  return fs.promises.readFile(fullPath, "utf8");
};

const readLyricSourceText = async (reference) => {
  if (!reference) {
    throw createError(400, "Song does not have lyrics_path");
  }

  if (/^https?:\/\//i.test(reference)) {
    return readTextFromHttp(reference);
  }

  if (/^gs:\/\//i.test(reference)) {
    return readTextFromHttp(buildPublicUrlFromGsReference(reference));
  }

  if (storageConfig.driver === "local") {
    return readTextFromLocalStorage(reference);
  }

  return readTextFromHttp(resolvePublicUrl(reference));
};

const resolveLrcOffsetMs = (lines, warnings) => {
  let offsetMs = 0;

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return;
    }

    const metadataMatch = trimmed.match(LRC_METADATA_PATTERN);
    LRC_TIMESTAMP_PATTERN.lastIndex = 0;
    if (!metadataMatch || LRC_TIMESTAMP_PATTERN.test(trimmed)) {
      LRC_TIMESTAMP_PATTERN.lastIndex = 0;
      return;
    }

    const [, key, rawValue] = metadataMatch;
    if (String(key).toLowerCase() !== "offset") {
      return;
    }

    const parsed = Number(String(rawValue).trim());
    if (Number.isFinite(parsed)) {
      offsetMs = Math.round(parsed);
    } else {
      warnings.push(`Line ${index + 1}: ignored invalid [offset:] metadata.`);
    }
  });

  LRC_TIMESTAMP_PATTERN.lastIndex = 0;
  return offsetMs;
};

export const parseLrcContent = (content, { songDurationMs = null } = {}) => {
  const normalizedContent = String(content || "").replace(/^\uFEFF/, "");
  const lines = normalizedContent.split(/\r?\n/);
  const warnings = [];
  const rawPreview = [];
  const offsetMs = resolveLrcOffsetMs(lines, warnings);
  const items = [];
  const errors = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    const lineNumber = index + 1;

    if (!trimmed) {
      return;
    }

    if (rawPreview.length < MAX_RAW_PREVIEW_LINES) {
      rawPreview.push(trimmed);
    }

    const metadataMatch = trimmed.match(LRC_METADATA_PATTERN);
    LRC_TIMESTAMP_PATTERN.lastIndex = 0;
    const timestampMatches = [...trimmed.matchAll(LRC_TIMESTAMP_PATTERN)];

    if (metadataMatch && !timestampMatches.length) {
      return;
    }

    if (!timestampMatches.length) {
      warnings.push(
        `Line ${lineNumber}: skipped because no LRC timestamp was found.`
      );
      return;
    }

    LRC_TIMESTAMP_PATTERN.lastIndex = 0;
    const text = trimmed.replace(LRC_TIMESTAMP_PATTERN, "").trim();
    if (!text) {
      warnings.push(
        `Line ${lineNumber}: skipped because lyric text is empty after timestamps.`
      );
      return;
    }

    timestampMatches.forEach((match) => {
      const minutes = Number(match[1]);
      const seconds = Number(match[2]);
      const milliseconds = normalizeFractionMs(match[3]);

      if (
        !Number.isInteger(minutes) ||
        !Number.isInteger(seconds) ||
        seconds < 0 ||
        seconds >= 60
      ) {
        errors.push(`Line ${lineNumber}: invalid timestamp "${match[0]}".`);
        return;
      }

      const startTime = Math.max(
        0,
        minutes * 60000 + seconds * 1000 + milliseconds + offsetMs
      );

      items.push({
        line_number: lineNumber,
        start_time: startTime,
        text,
      });
    });
  });

  if (errors.length) {
    throw createError(400, errors[0], errors);
  }

  if (!items.length) {
    throw createError(400, "No valid LRC lyric lines found in source file");
  }

  const sortedItems = items
    .sort(
      (left, right) =>
        left.start_time - right.start_time || left.line_number - right.line_number
    )
    .map((item, index, source) => {
      const nextStart = source[index + 1]?.start_time;
      const fallbackEnd =
        songDurationMs && songDurationMs >= item.start_time
          ? songDurationMs
          : item.start_time;

      return {
        ...item,
        end_time:
          nextStart !== undefined
            ? Math.max(item.start_time, nextStart - 1)
            : fallbackEnd,
      };
    });

  return {
    items: sortedItems,
    warnings,
    raw_preview: rawPreview,
    offset_ms: offsetMs,
  };
};

const getSongLyricContext = async (songId) => {
  if (!songId) {
    throw createError(400, "songId is required");
  }

  const [rows] = await db.query(
    `
    SELECT
      s.id,
      s.title,
      s.duration,
      s.lyrics_path,
      EXISTS (
        SELECT 1
        FROM lyrics l
        WHERE l.song_id = s.id
      ) AS has_lyrics_in_db
    FROM songs s
    WHERE s.id = ? AND s.is_deleted = 0
    LIMIT 1
    `,
    [songId]
  );

  if (!rows[0]) {
    throw createError(404, "Song not found");
  }

  return rows[0];
};

const loadValidatedLrcSource = async (songId) => {
  const song = await getSongLyricContext(songId);
  const extension = getLyricSourceExtension(song.lyrics_path);

  if (!song.lyrics_path) {
    throw createError(400, "Song does not have lyrics_path");
  }

  if (extension !== ".lrc") {
    throw createError(400, "lyrics_path must point to a .lrc file");
  }

  const content = await readLyricSourceText(song.lyrics_path);
  const parsed = parseLrcContent(content, {
    songDurationMs: normalizeSongDurationToMs(song.duration),
  });

  return {
    song,
    extension,
    content,
    parsed,
  };
};

export const validateSongLyricsSource = async (songId) => {
  const { song, extension, parsed } = await loadValidatedLrcSource(songId);

  return {
    song_id: Number(song.id),
    song_title: song.title,
    lyrics_path: song.lyrics_path,
    source_type: extension.slice(1),
    line_count: parsed.items.length,
    has_lyrics_in_db: Boolean(song.has_lyrics_in_db),
    warnings: parsed.warnings,
    raw_preview: parsed.raw_preview,
    preview: parsed.items.slice(0, MAX_LRC_PREVIEW_ITEMS),
  };
};

export const importSongLyricsFromSource = async (songId) => {
  const { song, extension, parsed } = await loadValidatedLrcSource(songId);
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();
    await connection.query("DELETE FROM lyrics WHERE song_id = ?", [songId]);

    if (parsed.items.length) {
      const values = parsed.items.map((item) => [
        songId,
        item.start_time,
        item.end_time,
        item.text,
      ]);

      await connection.query(
        "INSERT INTO lyrics (song_id, start_time, end_time, text) VALUES ?",
        [values]
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }

  return {
    song_id: Number(song.id),
    song_title: song.title,
    lyrics_path: song.lyrics_path,
    source_type: extension.slice(1),
    imported_count: parsed.items.length,
    has_lyrics_in_db: true,
    warnings: parsed.warnings,
    preview: parsed.items.slice(0, MAX_LRC_PREVIEW_ITEMS),
  };
};

export const listLyricsBySongId = async (songId) => {
  if (!songId) {
    throw createError(400, "songId is required");
  }

  const [rows] = await db.query(
    `
    SELECT id, song_id, start_time, end_time, text
    FROM lyrics
    WHERE song_id = ?
    ORDER BY start_time ASC
    `,
    [songId]
  );

  return rows;
};

const fetchLyricLine = async (songId, comparator, timeMs, order) => {
  const [rows] = await db.query(
    `
    SELECT id, song_id, start_time, end_time, text
    FROM lyrics
    WHERE song_id = ? AND start_time ${comparator} ?
    ORDER BY start_time ${order}
    LIMIT 1
    `,
    [songId, timeMs]
  );

  return rows[0] || null;
};

export const getLyricSnapshot = async (songId, timeMs) => {
  if (!songId) {
    throw createError(400, "songId is required");
  }

  if (!Number.isFinite(timeMs) || timeMs < 0) {
    throw createError(400, "time must be a non-negative number");
  }

  const [currentRows] = await db.query(
    `
    SELECT id, song_id, start_time, end_time, text
    FROM lyrics
    WHERE song_id = ? AND start_time <= ? AND end_time >= ?
    ORDER BY start_time DESC
    LIMIT 1
    `,
    [songId, timeMs, timeMs]
  );

  const current = currentRows[0] || null;

  let previous = null;
  let next = null;

  if (current) {
    previous = await fetchLyricLine(songId, "<", current.start_time, "DESC");
    next = await fetchLyricLine(songId, ">", current.start_time, "ASC");
  } else {
    previous = await fetchLyricLine(songId, "<", timeMs, "DESC");
    next = await fetchLyricLine(songId, ">", timeMs, "ASC");
  }

  return {
    current,
    previous,
    next,
  };
};
