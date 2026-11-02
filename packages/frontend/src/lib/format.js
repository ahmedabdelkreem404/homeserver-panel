import { locale, t } from "../i18n/index.js";

const number = (value, digits = 0) => new Intl.NumberFormat(locale().tag, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value);

export const formatNumber = (value, digits = 0) => (Number.isFinite(value) ? number(value, digits) : "—");
export const formatPercent = value => (Number.isFinite(value) ? `${number(value, value < 10 ? 1 : 0)}%` : "—");

const BYTE_UNITS = ["B", "KB", "MB", "GB", "TB"];
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  let value = bytes, unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) { value /= 1024; unit++; }
  return `${number(value, unit === 0 || value >= 100 ? 0 : value >= 10 ? 1 : 2)} ${BYTE_UNITS[unit]}`;
}
export const formatRate = bytesPerSecond => (Number.isFinite(bytesPerSecond) ? `${formatBytes(bytesPerSecond)}/s` : "—");
export const formatMegabytes = mb => (Number.isFinite(mb) ? (mb >= 1024 ? `${number(mb / 1024, 1)} GB` : `${number(mb, 0)} MB`) : "—");

export function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) return "—";
  const days = Math.floor(totalSeconds / 86400), hours = Math.floor((totalSeconds % 86400) / 3600), minutes = Math.floor((totalSeconds % 3600) / 60);
  const parts = [];
  if (days) parts.push(t("time.days", { n: days }));
  if (hours) parts.push(t("time.hours", { n: hours }));
  if (!days && (minutes || !hours)) parts.push(t("time.minutes", { n: minutes }));
  return parts.join(" و ");
}

const DATE_TIME = () => new Intl.DateTimeFormat(locale().tag, { timeZone: "Africa/Cairo", dateStyle: "medium", timeStyle: "short" });
export function formatDateTime(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? DATE_TIME().format(date) : "—";
}

export function formatAgo(value, now = Date.now()) {
  const time = value ? new Date(value).getTime() : NaN;
  if (Number.isNaN(time)) return "—";
  const seconds = Math.max(0, Math.round((now - time) / 1000));
  if (seconds < 45) return t("time.now");
  const text = formatDuration(seconds < 3600 ? Math.round(seconds / 60) * 60 : seconds);
  return t("time.ago", { text });
}

export const levelOf = (percent, warnAt = 75, dangerAt = 90) => (percent >= dangerAt ? "danger" : percent >= warnAt ? "warn" : "ok");
