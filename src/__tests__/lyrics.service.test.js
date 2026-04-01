import { jest } from "@jest/globals";

const mockConnection = {
  beginTransaction: jest.fn(),
  query: jest.fn(),
  commit: jest.fn(),
  rollback: jest.fn(),
  release: jest.fn(),
};

const mockDb = {
  query: jest.fn(),
  getConnection: jest.fn(),
};

const mockResolvePublicUrl = jest.fn((value) => `https://storage.test/${value}`);

const loadService = async (driver = "gcs") => {
  jest.unstable_mockModule("../config/db.js", () => ({
    default: mockDb,
  }));
  jest.unstable_mockModule("../config/upload.js", () => ({
    default: {
      driver,
      local: {
        uploadDir: "D:\\uploads",
      },
    },
  }));
  jest.unstable_mockModule("../services/storage.service.js", () => ({
    resolvePublicUrl: mockResolvePublicUrl,
  }));

  return import("../services/lyrics.service.js");
};

describe("lyrics.service", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    mockDb.getConnection.mockResolvedValue(mockConnection);
    mockConnection.beginTransaction.mockResolvedValue(undefined);
    mockConnection.query.mockResolvedValue([{}]);
    mockConnection.commit.mockResolvedValue(undefined);
    mockConnection.rollback.mockResolvedValue(undefined);
    mockConnection.release.mockReturnValue(undefined);
    global.fetch = jest.fn();
  });

  it("parses LRC content into sorted lyric rows with computed end_time", async () => {
    const { parseLrcContent } = await loadService();

    const result = parseLrcContent(
      `
[00:31.157] Line one
[00:34.954] Line two
[00:38.401] Line three
      `,
      { songDurationMs: 45000 }
    );

    expect(result.items).toEqual([
      {
        line_number: 2,
        start_time: 31157,
        end_time: 34953,
        text: "Line one",
      },
      {
        line_number: 3,
        start_time: 34954,
        end_time: 38400,
        text: "Line two",
      },
      {
        line_number: 4,
        start_time: 38401,
        end_time: 45000,
        text: "Line three",
      },
    ]);
  });

  it("validates a remote LRC source file and returns preview metadata", async () => {
    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 15,
          title: "Validated Song",
          duration: 200,
          lyrics_path:
            "https://firebasestorage.googleapis.com/v0/b/app/o/uploads%2Flyric%2Fvalidated-song.lrc?alt=media",
          has_lyrics_in_db: 0,
        },
      ],
    ]);
    global.fetch.mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(
        "[00:10.000] Start line\n[00:12.500] Next line"
      ),
    });

    const { validateSongLyricsSource } = await loadService();
    const result = await validateSongLyricsSource(15);

    expect(result).toMatchObject({
      song_id: 15,
      song_title: "Validated Song",
      source_type: "lrc",
      line_count: 2,
      has_lyrics_in_db: false,
      preview: [
        {
          line_number: 1,
          start_time: 10000,
          end_time: 12499,
          text: "Start line",
        },
        {
          line_number: 2,
          start_time: 12500,
          end_time: 200000,
          text: "Next line",
        },
      ],
    });
  });

  it("imports lyrics from the stored source path into the lyrics table", async () => {
    mockDb.query.mockResolvedValueOnce([
      [
        {
          id: 21,
          title: "Imported Song",
          duration: 180,
          lyrics_path: "uploads/lyric/imported-song.lrc",
          has_lyrics_in_db: 1,
        },
      ],
    ]);
    global.fetch.mockResolvedValue({
      ok: true,
      text: jest.fn().mockResolvedValue(
        "[00:01.000] Intro\n[00:03.000] Verse"
      ),
    });

    const { importSongLyricsFromSource } = await loadService();
    const result = await importSongLyricsFromSource(21);

    expect(mockResolvePublicUrl).toHaveBeenCalledWith(
      "uploads/lyric/imported-song.lrc"
    );
    expect(mockConnection.beginTransaction).toHaveBeenCalledTimes(1);
    expect(mockConnection.query.mock.calls[0]).toEqual([
      "DELETE FROM lyrics WHERE song_id = ?",
      [21],
    ]);
    expect(mockConnection.query.mock.calls[1]).toEqual([
      "INSERT INTO lyrics (song_id, start_time, end_time, text) VALUES ?",
      [
        [
          [21, 1000, 2999, "Intro"],
          [21, 3000, 180000, "Verse"],
        ],
      ],
    ]);
    expect(mockConnection.commit).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({
      song_id: 21,
      imported_count: 2,
      has_lyrics_in_db: true,
    });
  });
});
