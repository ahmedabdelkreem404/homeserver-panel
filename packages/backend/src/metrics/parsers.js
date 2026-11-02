// Pure parsers for the host files. Each takes text and returns plain data, so they are tested against real captured samples.

export function parseNetDev(text) {
  const out = {};
  for (const line of String(text ?? "").split("\n").slice(2)) {
    const m = /^\s*([^:\s]+):\s*(.*)$/.exec(line);
    if (!m) continue;
    const f = m[2].trim().split(/\s+/).map(Number);
    if (f.length >= 9) out[m[1]] = { rx: f[0], tx: f[8] };
  }
  return out;
}

// Linux wireless "quality" is out of 70; level is in dBm.
export function parseWireless(text) {
  const out = {};
  for (const line of String(text ?? "").split("\n").slice(2)) {
    const m = /^\s*([^:\s]+):\s+\S+\s+(-?\d+)\.?\s+(-?\d+)\.?\s+(-?\d+)\.?/.exec(line);
    if (m) out[m[1]] = { quality: Number(m[2]), levelDbm: Number(m[3]), percent: Math.max(0, Math.min(100, Math.round((Number(m[2]) / 70) * 100))) };
  }
  return out;
}

const hexIp = hex => [6, 4, 2, 0].map(i => parseInt(hex.slice(i, i + 2), 16)).join(".");

export function parseRoutes(text) {
  return String(text ?? "").split("\n").slice(1).map(l => l.trim().split(/\s+/)).filter(f => f.length >= 8).map(f => ({ iface: f[0], destination: hexIp(f[1]), gateway: hexIp(f[2]), flags: parseInt(f[3], 16), metric: Number(f[6]), mask: hexIp(f[7]) }));
}

// The route that carries traffic: default destination, usable, lowest metric.
export function defaultRoute(routes) {
  return routes.filter(r => r.destination === "0.0.0.0" && r.mask === "0.0.0.0" && (r.flags & 1) === 1).sort((a, b) => a.metric - b.metric)[0] ?? null;
}

export function parseFibTrie(text) {
  const ips = [];
  let last;
  for (const line of String(text ?? "").split("\n")) {
    const ip = /\|--\s+(\d+\.\d+\.\d+\.\d+)/.exec(line);
    if (ip) { last = ip[1]; continue; }
    if (/\/32 host LOCAL/.test(line) && last && !ips.includes(last)) ips.push(last);
  }
  return ips;
}

const inDocker = ip => /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
// Prefers the address in the same /24 as the default gateway; otherwise any address that is not loopback, Docker or Tailscale.
export function pickLocalIpv4(localIps, gateway) {
  const net24 = gateway ? gateway.split(".").slice(0, 3).join(".") : null;
  const candidates = localIps.filter(ip => !ip.startsWith("127.") && !inDocker(ip) && !/^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(ip) && !ip.startsWith("169.254."));
  return candidates.find(ip => net24 && ip.startsWith(`${net24}.`)) ?? candidates[0] ?? null;
}

export function ifaceKind({ iface, hasWirelessDir }) {
  if (hasWirelessDir) return "wifi";
  if (/^(eth|en|em)/.test(iface)) return "ethernet";
  return "other";
}

export function parseStat(text) {
  const m = /^cpu\s+(.+)$/m.exec(String(text ?? ""));
  if (!m) return null;
  const f = m[1].trim().split(/\s+/).map(Number);
  const total = f.slice(0, 8).reduce((a, b) => a + b, 0);
  return { total, idle: f[3] + (f[4] ?? 0) };
}
export function cpuPercent(prev, next) {
  if (!prev || !next || next.total <= prev.total) return null;
  return Math.max(0, Math.min(100, Math.round((1 - (next.idle - prev.idle) / (next.total - prev.total)) * 1000) / 10));
}

export function parseMeminfo(text) {
  const kb = name => { const m = new RegExp(`^${name}:\\s+(\\d+)`, "m").exec(String(text ?? "")); return m ? Number(m[1]) : null; };
  const total = kb("MemTotal"), available = kb("MemAvailable");
  if (total === null || available === null) return null;
  return { memTotalMb: Math.round(total / 1024), memUsedMb: Math.round((total - available) / 1024), swapTotalMb: Math.round((kb("SwapTotal") ?? 0) / 1024), swapUsedMb: Math.round(((kb("SwapTotal") ?? 0) - (kb("SwapFree") ?? 0)) / 1024) };
}

export function parseLoadavg(text) {
  const f = String(text ?? "").trim().split(/\s+/).map(Number);
  return f.length >= 3 && f.slice(0, 3).every(Number.isFinite) ? { one: f[0], five: f[1], fifteen: f[2] } : null;
}

export const parseUptime = text => { const first = String(text ?? "").trim().split(/\s+/)[0]; const s = first === "" ? NaN : Number(first); return Number.isFinite(s) ? Math.round(s) : null; };

// zones: [{ name, milli }]. Anything outside -20..150 C is a broken sensor and is dropped.
export function temperatures(zones) {
  return zones.filter(z => Number.isFinite(z.milli)).map(z => ({ name: z.name, celsius: Math.round(z.milli / 100) / 10 })).filter(t => t.celsius > -20 && t.celsius < 150);
}

// supplies: [{ name, values: { type, status, capacity, online, energy_full, energy_full_design, ... } }]
export function powerSummary(supplies) {
  const bat = supplies.find(s => s.values.type === "Battery" && s.values.present !== "0");
  const ac = supplies.find(s => s.values.type === "Mains");
  const num = v => (v === undefined || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  const full = num(bat?.values.energy_full ?? bat?.values.charge_full), design = num(bat?.values.energy_full_design ?? bat?.values.charge_full_design);
  return {
    battery: bat ? { name: bat.name, capacityPct: num(bat.values.capacity), status: bat.values.status ?? null, healthPct: full && design ? Math.round((full / design) * 100) : null, cycleCount: num(bat.values.cycle_count) } : null,
    ac: ac ? { name: ac.name, online: ac.values.online === "1" } : null,
  };
}

// "65.77MiB / 3.771GiB" -> megabytes used; "0.60%" -> 0.6
export function parseMem(text) {
  const m = /^([\d.]+)\s*([KMG]i?B|B)/i.exec(String(text ?? "").trim());
  if (!m) return null;
  const unit = { b: 1 / 1048576, kb: 1 / 1024, kib: 1 / 1024, mb: 1, mib: 1, gb: 1024, gib: 1024 }[m[2].toLowerCase()];
  return Math.round(Number(m[1]) * unit * 10) / 10;
}
export const parsePercent = text => { const n = Number(String(text ?? "").replace("%", "")); return Number.isFinite(n) ? n : null; };
