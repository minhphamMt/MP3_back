export const DEFAULT_TIME_ZONE = "Asia/Ho_Chi_Minh";

const pad2 = (num) => String(num).padStart(2, "0");

const getDatePartsInTimeZone = (date, timeZone = DEFAULT_TIME_ZONE) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  const map = Object.fromEntries(parts.map((part) => [part.type, part.value]));

  return {
    year: Number(map.year),
    month: Number(map.month),
    day: Number(map.day),
  };
};

export const getCurrentDateInTimeZone = (
  timeZone = DEFAULT_TIME_ZONE,
  date = new Date()
) => {
  const parts = getDatePartsInTimeZone(date, timeZone);
  return `${parts.year}-${pad2(parts.month)}-${pad2(parts.day)}`;
};

export const shiftDateString = (dateString, deltaDays) => {
  const [year, month, day] = dateString.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + deltaDays));

  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate()
  )}`;
};

export const getStartOfWeekDateString = (dateString) => {
  const date = new Date(`${dateString}T00:00:00.000Z`);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;

  return shiftDateString(dateString, offset);
};
