export const normalizeKeyword = (keyword = "") =>
  String(keyword ?? "")
    .trim()
    .replace(/\s+/g, " ");

export const normalizeForSearch = (value = "") =>
  normalizeKeyword(String(value ?? ""))
    .normalize("NFD")
    .replace(/\u0111/g, "d")
    .replace(/\u0110/g, "D")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");

export const compactSearchValue = (value = "") =>
  normalizeForSearch(value).replace(/\s+/g, "");

export default {
  normalizeKeyword,
  normalizeForSearch,
  compactSearchValue,
};
