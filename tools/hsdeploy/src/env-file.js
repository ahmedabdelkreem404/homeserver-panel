// .env parsing and merging. Values are never logged by callers; only key names are.
export function parseEnv(text) {
  const map = new Map();
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const key = line.slice(0, i).trim().replace(/^export\s+/, "");
    let value = line.slice(i + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) map.set(key, value);
  }
  return map;
}

export const serializeEnv = map => [...map].map(([k, v]) => `${k}=${v}`).join("\n");

// current (from Dokploy) + updates (from the file): updates win, other keys such as DATABASE_URL survive.
export function mergeEnv(currentText, updates) {
  const merged = parseEnv(currentText);
  for (const [k, v] of updates) merged.set(k, v);
  return serializeEnv(merged);
}
