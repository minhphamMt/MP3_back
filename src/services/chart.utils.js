export const buildDailySeries = (
  rawData,
  days = 5,
  options = {}
) => {
  const {
    basePlays = 1000,
    weight = 1,
    noiseRatio = 0.25,   // ❗ giảm noise
    rankOffset = 0,
  } = options;

  const map = new Map();
  rawData.forEach((r) => {
    const key =
      r.day instanceof Date
        ? r.day.toISOString().slice(0, 10)
        : r.day;
    map.set(key, Number(r.plays));
  });

  const result = [];
  const peakIndex = Math.floor(days / 2);

  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - (days - 1 - i));
    const key = d.toISOString().slice(0, 10);

    let plays;

    if (map.has(key)) {
      plays = map.get(key);
    } else {
      const distance = Math.abs(i - peakIndex);
      let trendFactor = 1 - distance / peakIndex;

      const noise =
        1 + (Math.random() * noiseRatio * 2 - noiseRatio);

      plays = basePlays * weight * trendFactor * noise + rankOffset;

      // ===============================
      // 🔥 FIX ĐUÔI — ÉP TÁCH NGÀY CUỐI
      // ===============================
      if (i === days - 2) {
        // ngày áp chót
        plays = basePlays * weight * 0.35 + rankOffset;
      }

      if (i === days - 1) {
        // ngày cuối: luôn thấp hơn ngày áp chót
        plays = basePlays * weight * 0.18 + rankOffset;
      }

      plays = Math.round(plays);
    }

    result.push({
      date: key,
      plays: Math.max(80, plays),
    });
  }

  return result;
};

