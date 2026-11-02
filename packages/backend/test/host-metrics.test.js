import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createNetSampler, startOfToday, sumIncreases } from "../src/metrics/sampler.js";
import { createServerStatus } from "../src/metrics/status.js";
import { createSpeedTest, MIN_INTERVAL_MS } from "../src/metrics/speedtest.js";
import { cpuPercent, defaultRoute, ifaceKind, parseFibTrie, parseLoadavg, parseMem, parseMeminfo, parseNetDev, parsePercent, parseRoutes, parseStat, parseUptime, parseWireless, pickLocalIpv4, powerSummary, temperatures } from "../src/metrics/parsers.js";
import { migrate, openDatabase } from "../src/db.js";

// Real files captured read-only from the homeserver (laptop with wifi wlp2s0b1, ethernet eno1 down, battery BAT1, adapter ACAD).
const raw = fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures/host/host-samples.txt"), "utf8");
const section = name => { const m = new RegExp(`@@@ ${name.replace("/", "\\/")}\\n([\\s\\S]*?)(?=\\n@@@ |$)`).exec(raw); return m ? m[1] : null; };
const kv = line => Object.fromEntries(line.trim().split(/\s+/).filter(p => p.includes("=")).map(p => p.split("=")));

// A host file reader backed by the captured sample, so the aggregator runs on real data.
function sampleHostFs() {
  const files = new Map([["dev", section("net/dev")], ["wireless", section("1/net/wireless")], ["route", section("net/route")], ["fib_trie", section("fib_trie")]]);
  const proc = new Map([["stat", section("stat")], ["meminfo", section("meminfo")], ["loadavg", section("loadavg")], ["uptime", section("uptime")]]);
  const sys = new Map(), dirs = new Map();
  for (const line of section("ifaces").trim().split("\n")) { const [name, ...rest] = line.split(" "); const v = kv(rest.join(" ")); dirs.set("class/net", [...(dirs.get("class/net") ?? []), name]); if (v.wireless === "yes") sys.set(`class/net/${name}/wireless`, ""); }
  for (const line of section("thermal").trim().split("\n")) { const [name, ...rest] = line.split(" "); const v = kv(rest.join(" ")); sys.set(`class/thermal/${name}/type`, v.type); sys.set(`class/thermal/${name}/temp`, v.temp); dirs.set("class/thermal", [...(dirs.get("class/thermal") ?? []), name]); }
  for (const line of section("hwmon").trim().split("\n")) { const [name, ...rest] = line.split(" "); const v = kv(rest.join(" ")); sys.set(`class/hwmon/${name}/name`, rest.join(" ").match(/name=(\S+)/)[1]); dirs.set("class/hwmon", [...(dirs.get("class/hwmon") ?? []), name]); dirs.set(`class/hwmon/${name}`, Object.keys(v).filter(k => k.startsWith("temp"))); for (const [k, val] of Object.entries(v)) if (k.startsWith("temp")) sys.set(`class/hwmon/${name}/${k}`, val); }
  let current;
  for (const line of section("power").trim().split("\n")) { if (line.startsWith("== ")) { current = line.slice(3); dirs.set("class/power_supply", [...(dirs.get("class/power_supply") ?? []), current]); } else { const [k, ...v] = line.split("="); sys.set(`class/power_supply/${current}/${k}`, v.join("=")); } }
  return { proc: rel => proc.get(rel) ?? null, procNet: rel => files.get(rel) ?? null, sys: rel => sys.get(rel) ?? null, sysExists: rel => sys.has(rel), sysList: rel => dirs.get(rel) ?? [] };
}
const emptyHostFs = { proc: () => null, procNet: () => null, sys: () => null, sysExists: () => false, sysList: () => [] };

test("network parsers on the real samples: counters, wifi signal, default route, local address, interface kind", () => {
  const dev = parseNetDev(section("net/dev"));
  assert.ok(dev.wlp2s0b1.rx > 0 && dev.wlp2s0b1.tx > 0 && "lo" in dev && "eno1" in dev);
  const wifi = parseWireless(section("1/net/wireless"));
  assert.ok(wifi.wlp2s0b1.levelDbm < 0 && wifi.wlp2s0b1.percent >= 0 && wifi.wlp2s0b1.percent <= 100);
  const routes = parseRoutes(section("net/route"));
  const def = defaultRoute(routes);
  assert.equal(def.iface, "wlp2s0b1");
  assert.match(def.gateway, /^192\.168\./);
  const ips = parseFibTrie(section("fib_trie"));
  assert.ok(ips.includes("127.0.0.1"));
  const local = pickLocalIpv4(ips, def.gateway);
  assert.equal(local.split(".").slice(0, 3).join("."), def.gateway.split(".").slice(0, 3).join("."), "the address in the gateway's subnet");
  assert.equal(ifaceKind({ iface: "wlp2s0b1", hasWirelessDir: true }), "wifi");
  assert.equal(ifaceKind({ iface: "eno1", hasWirelessDir: false }), "ethernet");
  assert.equal(ifaceKind({ iface: "tailscale0", hasWirelessDir: false }), "other");
});

test("route choice prefers the lowest metric and ignores unusable routes (ethernet 100 beats wifi 600)", () => {
  const hex = ip => ip.split(".").reverse().map(n => Number(n).toString(16).padStart(2, "0")).join("").toUpperCase();
  const row = (iface, gw, flags, metric) => `${iface}\t00000000\t${hex(gw)}\t${flags}\t0\t0\t${metric}\t00000000\t0\t0\t0`;
  const text = ["Iface\tDestination\tGateway\tFlags\tRefCnt\tUse\tMetric\tMask\tMTU\tWindow\tIRTT", row("wlp2s0b1", "192.168.1.1", "0003", 600), row("eno1", "192.168.1.1", "0003", 100), row("dead0", "10.0.0.1", "0002", 1)].join("\n");
  assert.equal(defaultRoute(parseRoutes(text)).iface, "eno1");
  assert.equal(defaultRoute(parseRoutes("Iface\tDestination\n")), null);
  assert.equal(pickLocalIpv4(["127.0.0.1", "172.17.0.1", "100.114.91.58", "169.254.1.1"], "192.168.1.1"), null, "nothing usable");
});

test("cpu, memory, load and uptime parsers on the real samples", () => {
  const a = parseStat(section("stat"));
  assert.ok(a.total > a.idle && a.idle > 0);
  assert.equal(cpuPercent(a, { total: a.total + 1000, idle: a.idle + 750 }), 25);
  assert.equal(cpuPercent(a, a), null, "no time passed");
  assert.equal(cpuPercent(null, a), null);
  const m = parseMeminfo(section("meminfo"));
  assert.ok(m.memTotalMb > 3000 && m.memTotalMb < 5000 && m.memUsedMb > 0 && m.memUsedMb <= m.memTotalMb && m.swapUsedMb >= 0);
  const l = parseLoadavg(section("loadavg"));
  assert.ok(l.one >= 0 && l.five >= 0 && l.fifteen >= 0);
  assert.ok(parseUptime(section("uptime")) > 0);
  for (const bad of [parseStat(""), parseStat(null), parseMeminfo(""), parseLoadavg("x y z"), parseUptime("nope")]) assert.equal(bad, null);
  assert.equal(parseMem("65.77MiB / 3.771GiB"), 65.8);
  assert.equal(parseMem("1.5GiB / 4GiB"), 1536);
  assert.equal(parsePercent("0.60%"), 0.6);
  assert.equal(parseMem("junk"), null);
});

test("temperature and power parsers on the real samples", () => {
  const status = createServerStatus({ hostfs: sampleHostFs(), gateway: { read: async () => [] }, sampler: { today: () => ({ rx: 0, tx: 0 }) }, speedTest: { last: () => null }, wait: async () => {} });
  return status.status().then(s => {
    assert.equal(s.temperature.available, true);
    assert.ok(s.temperature.sensors.length >= 2 && s.temperature.maxCelsius > 20 && s.temperature.maxCelsius < 110);
    assert.equal(s.power.battery.name, "BAT1");
    assert.deepEqual([s.power.battery.capacityPct, s.power.battery.status, s.power.battery.healthPct], [100, "Full", 100]);
    assert.equal(s.power.ac.online, true);
  });
});

test("sensor values that cannot be real are dropped; a laptop without a battery is reported as such", () => {
  assert.deepEqual(temperatures([{ name: "a", milli: 46000 }, { name: "b", milli: -273000 }, { name: "c", milli: NaN }, { name: "d", milli: 999999 }]), [{ name: "a", celsius: 46 }]);
  assert.deepEqual(powerSummary([{ name: "AC", values: { type: "Mains", online: "0" } }]), { battery: null, ac: { name: "AC", online: false } });
  assert.equal(powerSummary([{ name: "BAT0", values: { type: "Battery", present: "0" } }]).battery, null);
  assert.equal(powerSummary([{ name: "BAT0", values: { type: "Battery", capacity: "55", status: "Discharging", charge_full: "4000", charge_full_design: "5000" } }]).battery.healthPct, 80);
});

test("the status answer on real data: wifi interface, signal, rate, totals; every source present", async () => {
  const db = openDatabase(":memory:"); migrate(db);
  const hostfs = sampleHostFs();
  const sampler = createNetSampler({ db, hostfs });
  const gateway = { read: async p => (p === "docker.getServerHealth" ? { resources: { memTotalBytes: 4048683008, memUsedBytes: 1754488832 }, disk: { totalBytes: 125422911488, usedBytes: 12955381760 } } : [{ name: "infra-cloudflared-x.1.d", state: "running", status: "Up 2 hours" }]) };
  const s = await createServerStatus({ hostfs, gateway, sampler, speedTest: { last: () => null }, fetchImpl: async () => ({ ok: true }), wait: async () => {} }).status();
  assert.deepEqual([s.network.available, s.network.interface, s.network.kind], [true, "wlp2s0b1", "wifi"]);
  assert.ok(s.network.signal.percent >= 0 && s.network.localIpv4.startsWith("192.168."));
  assert.equal(s.network.otherInterfaces.includes("eno1"), true);
  assert.equal(s.cpu.available, true);
  assert.equal(s.memory.source, "host");
  assert.deepEqual([s.disk.totalGb, s.disk.usedPercent], [125.4, 10]);
  assert.deepEqual([s.tunnel.available, s.tunnel.running, s.internet.reachable], [true, true, true]);
  assert.ok(s.uptime.seconds > 0 && s.network.totals.sinceBoot.rx > 0);
});

test("every source degrades to 'unavailable' on its own instead of failing the answer", async () => {
  const db = openDatabase(":memory:"); migrate(db);
  const sampler = createNetSampler({ db, hostfs: emptyHostFs });
  const down = { read: async () => { const e = new Error("x"); e.code = "upstream_unreachable"; throw e; } };
  const s = await createServerStatus({ hostfs: emptyHostFs, gateway: down, sampler, speedTest: { last: () => null }, fetchImpl: async () => { throw new Error("offline"); }, wait: async () => {} }).status();
  for (const k of ["network", "cpu", "memory", "disk", "temperature", "power", "uptime", "tunnel"]) { assert.equal(s[k].available, false, k); assert.ok(typeof s[k].reason === "string" && s[k].reason.length > 0, `${k} explains why`); }
  assert.deepEqual([s.internet.available, s.internet.reachable], [true, false], "offline is an answer, not a failure");
  const noRoute = await createServerStatus({ hostfs: { ...emptyHostFs, procNet: rel => (rel === "route" ? "Iface\tDestination\n" : rel === "dev" ? "a\nb\n" : null) }, gateway: down, sampler, speedTest: { last: () => null }, wait: async () => {} }).status();
  assert.equal(noRoute.network.interface, null);
  assert.match(noRoute.network.note, /no connection/i);
});

test("memory falls back to Dokploy when the host mount is missing", async () => {
  const db = openDatabase(":memory:"); migrate(db);
  const gateway = { read: async p => (p === "docker.getServerHealth" ? { resources: { memTotalBytes: 4294967296, memUsedBytes: 1073741824 }, disk: { totalBytes: 1e11, usedBytes: 2e10 } } : []) };
  const s = await createServerStatus({ hostfs: emptyHostFs, gateway, sampler: createNetSampler({ db, hostfs: emptyHostFs }), speedTest: { last: () => null }, wait: async () => {} }).status();
  assert.deepEqual([s.memory.source, s.memory.memTotalMb, s.memory.memUsedMb], ["dokploy", 4096, 1024]);
});

test("per container usage is cached for 15 seconds", async () => {
  let calls = 0, t = 0;
  const gateway = { read: async () => { calls++; return [{ Name: "app-x.1.abc", CPUPerc: "1.5%", MemUsage: "40MiB / 3GiB", MemPerc: "1.0%" }]; } };
  const db = openDatabase(":memory:"); migrate(db);
  const st = createServerStatus({ hostfs: emptyHostFs, gateway, sampler: createNetSampler({ db, hostfs: emptyHostFs }), speedTest: { last: () => null }, now: () => new Date(t) });
  assert.deepEqual((await st.containers())[0], { name: "app-x.1.abc", service: "app-x", cpuPercent: 1.5, memMb: 40, memPercent: 1 });
  t += 14_000; await st.containers(); assert.equal(calls, 1);
  t += 2_000; await st.containers(); assert.equal(calls, 2);
});

test("sampler: today's totals count increases since local midnight and survive a reboot (counter reset)", () => {
  const db = openDatabase(":memory:"); migrate(db);
  const clock = { t: Date.parse("2026-11-01T21:00:00Z") }; // 23:00 on Nov 1 in Cairo
  let counters = { rx: 1000, tx: 500 };
  const hostfs = { procNet: () => `h1\nh2\nwlp2s0b1: ${counters.rx} 1 0 0 0 0 0 0 ${counters.tx} 1 0 0 0 0 0 0\neth9: 5 1 0 0 0 0 0 0 5 1 0 0 0 0 0 0\nveth1: 9 1 0 0 0 0 0 0 9 1 0 0 0 0 0 0\n` };
  const sampler = createNetSampler({ db, hostfs, now: () => new Date(clock.t) });
  assert.equal(sampler.sampleOnce(), 2, "physical interfaces only, not veth");
  clock.t = Date.parse("2026-11-01T22:30:00Z"); counters = { rx: 4000, tx: 900 }; sampler.sampleOnce(); // 00:30 Nov 2
  clock.t = Date.parse("2026-11-02T00:00:00Z"); counters = { rx: 9000, tx: 1900 }; sampler.sampleOnce();
  clock.t = Date.parse("2026-11-02T06:00:00Z"); counters = { rx: 200, tx: 50 }; sampler.sampleOnce(); // rebooted: counters restarted
  clock.t = Date.parse("2026-11-02T10:00:00Z");
  // Cairo midnight is 22:00Z. The last row before it (21:00Z, rx 1000) is the baseline, so today = 4000-1000, 9000-4000, then the reboot restarts at 200.
  assert.deepEqual(sampler.today("wlp2s0b1", "Africa/Cairo"), { rx: (4000 - 1000) + (9000 - 4000) + 200, tx: (900 - 500) + (1900 - 900) + 50 });
  assert.equal(startOfToday(new Date("2026-11-02T10:00:00Z"), "Africa/Cairo").toISOString(), "2026-11-01T22:00:00.000Z");
  assert.deepEqual(sumIncreases([{ rx: 10, tx: 10 }, { rx: 5, tx: 20 }]), { rx: 5, tx: 10 });
});

test("speed test: stores every run, one at a time, one every 10 minutes, failures are results too", async () => {
  const db = openDatabase(":memory:"); migrate(db);
  const clock = { t: Date.parse("2026-11-02T10:00:00Z"), perf: 0 };
  const mkRes = bytes => ({ ok: true, body: (async function* () { yield new Uint8Array(bytes); })() });
  let mode = "ok", seen = [];
  const fetchImpl = async (url, init) => {
    seen.push(String(url));
    if (mode === "fail") throw Object.assign(new Error("offline"), { name: "TypeError" });
    clock.perf += 1000;
    return String(url).includes("__down") ? mkRes(25_000_000) : { ok: true };
  };
  const st = createSpeedTest({ db, now: () => new Date(clock.t), fetchImpl, clock: () => clock.perf });
  const first = await st.run();
  assert.deepEqual([first.error, first.bytesDown, first.bytesUp], [null, 25_000_000, 10_000_000]);
  assert.equal(first.downMbps, 200, "25 MB in 1 s = 200 Mbit/s");
  assert.ok(seen[0].includes("speed.cloudflare.com/__down?bytes=25000000") && seen[1].includes("__up"), "capped sizes, public endpoints only");
  assert.deepEqual(st.last().downMbps, 200);
  clock.t += 5 * 60_000;
  await assert.rejects(st.run(), e => e.code === "rate_limited" && e.details.retryAfterSec > 0 && e.details.retryAfterSec <= 300);
  clock.t += MIN_INTERVAL_MS;
  mode = "fail";
  const failed = await st.run();
  assert.match(failed.error, /offline/);
  assert.equal(db.prepare("SELECT count(*) AS n FROM speed_tests").get().n, 2, "the failure is stored with its time");
  const slow = createSpeedTest({ db: (() => { const d = openDatabase(":memory:"); migrate(d); return d; })(), now: () => new Date(clock.t), fetchImpl: () => new Promise(() => {}), clock: () => 0 });
  const running = slow.run();
  await assert.rejects(slow.run(), e => e.code === "rate_limited" && /already running/.test(e.message));
  running.catch(() => {});
});
