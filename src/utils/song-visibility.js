const SQL_ALIAS_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const normalizeAlias = (alias, fallback) => {
  const value = String(alias || fallback);
  if (!SQL_ALIAS_PATTERN.test(value)) {
    throw new Error(`Invalid SQL alias: ${value}`);
  }

  return value;
};

export const buildAlbumReleasedCondition = (
  albumAlias = "al",
  { includeDeleted = false } = {}
) => {
  const al = normalizeAlias(albumAlias, "al");
  const conditions = [];

  if (!includeDeleted) {
    conditions.push(`${al}.is_deleted = 0`);
  }

  conditions.push(`${al}.release_date IS NOT NULL`);
  conditions.push(`${al}.release_date <= NOW()`);

  return conditions.join(" AND ");
};

const buildSongAlbumReleaseGate = (
  songAlias = "s",
  { albumAlias = null, includeDeleted = false } = {}
) => {
  const s = normalizeAlias(songAlias, "s");

  if (albumAlias) {
    const al = normalizeAlias(albumAlias, "al");
    const albumConditions = [`${al}.id IS NOT NULL`];

    if (!includeDeleted) {
      albumConditions.push(`${al}.is_deleted = 0`);
    }

    albumConditions.push(`${al}.release_date IS NOT NULL`);
    albumConditions.push(`${al}.release_date <= NOW()`);

    return `(${s}.album_id IS NULL OR (${albumConditions.join(" AND ")}))`;
  }

  const albumConditions = [`al_visibility.id = ${s}.album_id`];
  if (!includeDeleted) {
    albumConditions.push("al_visibility.is_deleted = 0");
  }
  albumConditions.push("al_visibility.release_date IS NOT NULL");
  albumConditions.push("al_visibility.release_date <= NOW()");

  return `(${s}.album_id IS NULL OR EXISTS (
    SELECT 1
    FROM albums al_visibility
    WHERE ${albumConditions.join(" AND ")}
  ))`;
};

export const buildSongPublicVisibilityCondition = (
  songAlias = "s",
  { albumAlias = null, includeDeleted = false } = {}
) => {
  const s = normalizeAlias(songAlias, "s");
  const conditions = [];

  if (!includeDeleted) {
    conditions.push(`${s}.is_deleted = 0`);
  }

  conditions.push(`${s}.audio_path IS NOT NULL`);
  conditions.push(`${s}.audio_path <> ''`);
  conditions.push(`${s}.status = 'approved'`);
  conditions.push(`${s}.release_date IS NOT NULL`);
  conditions.push(`${s}.release_date <= NOW()`);
  conditions.push(
    buildSongAlbumReleaseGate(s, { albumAlias, includeDeleted })
  );

  return conditions.join(" AND ");
};

export default {
  buildAlbumReleasedCondition,
  buildSongPublicVisibilityCondition,
};
