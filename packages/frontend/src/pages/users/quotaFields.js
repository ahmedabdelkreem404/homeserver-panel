// The allowance fields in the order they are shown; the ranges mirror the backend, and the backend has the final say.
export const QUOTA_FIELDS = [
  { key: "maxApps", step: 1, min: 0, max: 50 },
  { key: "maxDatabases", step: 1, min: 0, max: 50 },
  { key: "maxMemoryMb", step: 64, min: 0, max: 3000 },
  { key: "maxCpu", step: 0.25, min: 0, max: 4 },
  { key: "maxDiskMb", step: 256, min: 0, max: 100000 },
  { key: "maxSubdomains", step: 1, min: 0, max: 50 },
  { key: "maxUploadMb", step: 10, min: 1, max: 500 },
];
export const DEFAULT_QUOTA = { maxApps: 2, maxDatabases: 1, maxMemoryMb: 512, maxCpu: 1, maxDiskMb: 2048, maxSubdomains: 2, maxUploadMb: 50 };

export const asText = quota => Object.fromEntries(Object.entries(quota).map(([key, value]) => [key, String(value)]));

// Turns the text boxes into numbers, or returns the first field that is not valid.
export function readQuota(values) {
  const out = {};
  for (const field of QUOTA_FIELDS) {
    const n = Number(values[field.key]);
    if (values[field.key] === "" || !Number.isFinite(n) || n < field.min || n > field.max) return { problem: field.key };
    out[field.key] = n;
  }
  return { quota: out };
}
