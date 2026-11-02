// The server status page (D11). One function per source; each degrades to { available: false, reason } on its own,
// so a missing mount, an unreachable Dokploy or a laptop without a sensor never fails the whole answer.
import { cpuPercent, defaultRoute, ifaceKind, parseFibTrie, parseLoadavg, parseMem, parseMeminfo, parseNetDev, parsePercent, parseRoutes, parseStat, parseUptime, parseWireless, pickLocalIpv4, powerSummary, temperatures } from "./parsers.js";

const unavailable = reason => ({ available: false, reason });
const sleep = ms => new Promise(r => setTimeout(r, ms));

export function createServerStatus({ hostfs, gateway, sampler, speedTest, timeZone = "Africa/Cairo", fetchImpl = globalThis.fetch, sampleWindowMs = 1000, wait = sleep, now = () => new Date(), containerTtlMs = 15_000 }) {
  const guard = async fn => { try { return await fn(); } catch (e) { return unavailable(e?.code === "upstream_unreachable" || e?.code === "upstream_timeout" ? "Dokploy did not answer." : e?.message?.slice(0, 80) ?? "failed"); } };
  let containerCache;

  async function network() {
    const routeText = hostfs.procNet("route"), devText = hostfs.procNet("dev");
    if (routeText === null || devText === null) return unavailable("The host network files are not readable (/host/proc not mounted).");
    const routes = parseRoutes(routeText), def = defaultRoute(routes);
    if (!def) return { available: true, interface: null, kind: null, note: "No default route: the server has no connection." };
    const iface = def.iface;
    const first = parseNetDev(devText)[iface];
    await wait(sampleWindowMs);
    const second = parseNetDev(hostfs.procNet("dev") ?? "")[iface] ?? first;
    const seconds = Math.max(0.001, sampleWindowMs / 1000);
    const wifi = parseWireless(hostfs.procNet("wireless") ?? "")[iface];
    return {
      available: true,
      interface: iface,
      kind: ifaceKind({ iface, hasWirelessDir: hostfs.sysExists(`class/net/${iface}/wireless`) }),
      gateway: def.gateway,
      localIpv4: pickLocalIpv4(parseFibTrie(hostfs.procNet("fib_trie") ?? ""), def.gateway),
      signal: wifi ? { percent: wifi.percent, dbm: wifi.levelDbm } : null,
      rate: first && second ? { rxBytesPerSec: Math.max(0, Math.round((second.rx - first.rx) / seconds)), txBytesPerSec: Math.max(0, Math.round((second.tx - first.tx) / seconds)) } : null,
      totals: first ? { sinceBoot: { rx: second.rx, tx: second.tx }, today: sampler.today(iface, timeZone) } : null,
      otherInterfaces: Object.entries(parseNetDev(devText)).filter(([n]) => /^(eth|en|em|wl)/.test(n) && n !== iface).map(([n]) => n),
    };
  }

  async function cpu() {
    const a = parseStat(hostfs.proc("stat"));
    if (!a) return unavailable("/host/proc/stat is not readable.");
    await wait(sampleWindowMs);
    const percent = cpuPercent(a, parseStat(hostfs.proc("stat")));
    const load = parseLoadavg(hostfs.proc("loadavg"));
    return { available: true, percent, load };
  }

  async function memory(health) {
    const m = parseMeminfo(hostfs.proc("meminfo"));
    if (m) return { available: true, source: "host", ...m };
    const r = health?.resources;
    return r ? { available: true, source: "dokploy", memTotalMb: Math.round(r.memTotalBytes / 1048576), memUsedMb: Math.round(r.memUsedBytes / 1048576), swapTotalMb: null, swapUsedMb: null } : unavailable("No memory source answered.");
  }

  const disk = health => {
    const d = health?.disk;
    if (!d?.totalBytes) return unavailable("Dokploy did not report the disk.");
    const gb = b => Math.round((b / 1e9) * 10) / 10;
    return { available: true, totalGb: gb(d.totalBytes), usedGb: gb(d.usedBytes), freeGb: gb(d.totalBytes - d.usedBytes), usedPercent: Math.round((d.usedBytes / d.totalBytes) * 100) };
  };

  function temperature() {
    const zones = hostfs.sysList("class/thermal").filter(n => n.startsWith("thermal_zone")).map(n => ({ name: (hostfs.sys(`class/thermal/${n}/type`) ?? n).trim(), milli: Number(hostfs.sys(`class/thermal/${n}/temp`)) }));
    for (const h of hostfs.sysList("class/hwmon")) {
      const name = (hostfs.sys(`class/hwmon/${h}/name`) ?? h).trim();
      for (const f of hostfs.sysList(`class/hwmon/${h}`).filter(x => /^temp\d+_input$/.test(x))) zones.push({ name: `${name} ${f.replace("_input", "")}`, milli: Number(hostfs.sys(`class/hwmon/${h}/${f}`)) });
    }
    const t = temperatures(zones);
    return t.length ? { available: true, sensors: t, maxCelsius: Math.max(...t.map(x => x.celsius)) } : unavailable("This machine exposes no temperature sensor.");
  }

  function power() {
    const dir = "class/power_supply";
    const names = hostfs.sysList(dir);
    if (!names.length) return unavailable("No power supply information.");
    const keys = ["type", "status", "capacity", "online", "energy_full", "energy_full_design", "charge_full", "charge_full_design", "cycle_count", "present"];
    const supplies = names.map(name => ({ name, values: Object.fromEntries(keys.map(k => [k, hostfs.sys(`${dir}/${name}/${k}`)?.trim()]).filter(([, v]) => v !== undefined)) }));
    const s = powerSummary(supplies);
    return s.battery || s.ac ? { available: true, ...s } : unavailable("No battery or adapter found.");
  }

  function uptime() { const s = parseUptime(hostfs.proc("uptime")); return s === null ? unavailable("/host/proc/uptime is not readable.") : { available: true, seconds: s }; }

  async function tunnel() {
    const containers = await gateway.read("docker.getContainers");
    const t = (Array.isArray(containers) ? containers : []).filter(c => /cloudflared/.test(c.name ?? ""));
    return t.length ? { available: true, running: t.some(c => c.state === "running"), status: t[0].status ?? null } : unavailable("No Cloudflare tunnel container found.");
  }

  async function internet() {
    const t0 = Date.now();
    try {
      const res = await fetchImpl("https://www.cloudflare.com/cdn-cgi/trace", { signal: AbortSignal.timeout(3000) });
      return { available: true, reachable: res.ok, latencyMs: Date.now() - t0 };
    } catch { return { available: true, reachable: false, latencyMs: null }; }
  }

  return {
    async status() {
      const health = await guard(() => gateway.read("docker.getServerHealth", { sinceHours: "1" })).then(h => (h?.available === false ? null : h));
      const [net, cpuInfo, mem, tun, web] = await Promise.all([guard(network), guard(cpu), guard(() => memory(health)), guard(tunnel), guard(internet)]);
      return { at: now().toISOString(), network: net, cpu: cpuInfo, memory: mem, disk: health ? disk(health) : unavailable("Dokploy did not answer."), temperature: temperature(), power: power(), uptime: uptime(), tunnel: tun, internet: web, speedTest: speedTest.last() };
    },
    // Per container usage: fetched only when a status page asks, cached 15 seconds.
    async containers() {
      if (containerCache && now().getTime() - containerCache.at < containerTtlMs) return containerCache.data;
      const stats = await gateway.read("swarm.getContainerStats");
      const data = (Array.isArray(stats) ? stats : []).map(s => ({ name: s.Name, service: String(s.Name ?? "").split(".")[0], cpuPercent: parsePercent(s.CPUPerc), memMb: parseMem(s.MemUsage), memPercent: parsePercent(s.MemPerc) }));
      containerCache = { at: now().getTime(), data };
      return data;
    },
  };
}
