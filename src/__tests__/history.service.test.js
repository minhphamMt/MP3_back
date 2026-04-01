import { jest } from "@jest/globals";

const mockDb = {
  query: jest.fn(),
};

const loadService = async () => {
  jest.unstable_mockModule("../config/db.js", () => ({
    default: mockDb,
  }));

  return import("../services/history.service.js");
};

describe("history.service visibility filtering", () => {
  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
  });

  it("filters user listening history by public song visibility", async () => {
    mockDb.query
      .mockResolvedValueOnce([[{ total: 0 }]]);

    const { getUserListeningHistory } = await loadService();
    const result = await getUserListeningHistory(15, {
      page: 1,
      limit: 10,
      offset: 0,
    });

    const [countSql, countParams] = mockDb.query.mock.calls[0];

    expect(countSql).toContain("s.audio_path IS NOT NULL");
    expect(countSql).toContain("s.status = 'approved'");
    expect(countSql).toContain("s.release_date IS NOT NULL");
    expect(countParams).toEqual([15]);
    expect(result).toEqual({
      items: [],
      meta: expect.objectContaining({
        page: 1,
        limit: 10,
        total: 0,
      }),
    });
  });

  it("keeps hidden songs available for admin user detail history", async () => {
    mockDb.query
      .mockResolvedValueOnce([[{ total: 0 }]]);

    const { getUserListeningHistory } = await loadService();
    await getUserListeningHistory(15, {
      page: 1,
      limit: 10,
      offset: 0,
      includeHiddenSongs: true,
    });

    const [countSql] = mockDb.query.mock.calls[0];

    expect(countSql).toContain("s.is_deleted = 0");
    expect(countSql).not.toContain("s.audio_path IS NOT NULL");
    expect(countSql).not.toContain("s.status = 'approved'");
  });
});
