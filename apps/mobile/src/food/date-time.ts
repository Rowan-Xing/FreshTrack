export const INVALID_LOCAL_DATE_TIME_LABEL = "时间未知";

export function formatChineseLocalDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return INVALID_LOCAL_DATE_TIME_LABEL;
  }

  return [
    `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`,
    [
      date.getHours(),
      date.getMinutes(),
      date.getSeconds()
    ]
      .map(padTwoDigits)
      .join(":")
  ].join(" ");
}

function padTwoDigits(value: number): string {
  return String(value).padStart(2, "0");
}
