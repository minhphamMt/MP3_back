// Only keep genres that explicitly identify a region.
// Generic styles like Pop/Rock/Rap can appear in many regions and should not
// be used to build region-specific charts.
export const REGION_GENRES = {
  VIETNAM: [
    "Vi\u1EC7t Nam",
    "V-Pop",
    "Rap Vi\u1EC7t",
    "Dance Vi\u1EC7t",
    "EDM Vi\u1EC7t",
    "Rock Vi\u1EC7t",
    "R&B Vi\u1EC7t",
    "Nh\u1EA1c Tr\u1EEF T\u00ECnh",
    "Nh\u1EA1c D\u00E2n Ca - Qu\u00EA H\u01B0\u01A1ng",
    "Nh\u1EA1c Tr\u1ECBnh",
    "Nh\u1EA1c C\u00E1ch M\u1EA1ng",
  ],
  USUK: ["\u00C2u M\u1EF9"],
  KPOP: ["H\u00E0n Qu\u1ED1c"],
};

// If an artist already has a nationality, keep the chart aligned with it.
// Empty nationality still falls back to genre so we do not unintentionally
// drop valid songs that have incomplete artist metadata.
export const REGION_ALLOWED_ARTIST_NATIONALITIES = {
  VIETNAM: ["Vi\u1EC7t Nam"],
  KPOP: ["South Korea"],
};

// USUK/\u00C2u M\u1EF9 is broad, so it is safer to exclude clearly non-USUK
// nationalities than to maintain an exhaustive allowlist of western countries.
export const REGION_BLOCKED_ARTIST_NATIONALITIES = {
  USUK: [
    "Vi\u1EC7t Nam",
    "South Korea",
    "Japan",
    "China",
    "Thailand",
    "Myanmar",
    "India",
    "Indonesia",
    "Malaysia",
    "Singapore",
    "Philippines",
    "Cambodia",
    "Laos",
  ],
};
