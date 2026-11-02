import StatCard from "../../components/StatCard.jsx";
import { formatDuration, formatMegabytes, formatNumber, formatPercent } from "../../lib/format.js";
import { t } from "../../i18n/index.js";

const POWER_STATUS = { Charging: "charging", Discharging: "discharging", Full: "full", "Not charging": "notCharging" };

export function CpuCard({ cpu }) {
  const load = cpu?.load;
  return <StatCard label={t("server.cpu.title")} value={cpu?.available && Number.isFinite(cpu.percent) ? formatNumber(cpu.percent, 0) : undefined} unit="%" percent={cpu?.percent} unavailableReason={cpu?.reason}
    note={load ? `${t("server.cpu.load")}: ${formatNumber(load.one, 2)} / ${formatNumber(load.five, 2)} / ${formatNumber(load.fifteen, 2)}` : undefined} />;
}

export function MemoryCard({ memory }) {
  const ok = memory?.available;
  const percent = ok ? (memory.memUsedMb / memory.memTotalMb) * 100 : undefined;
  const swap = ok && memory.swapTotalMb ? `${t("server.memory.swap")}: ${formatMegabytes(memory.swapUsedMb)} / ${formatMegabytes(memory.swapTotalMb)}` : undefined;
  return <StatCard label={t("server.memory.title")} value={ok ? formatMegabytes(memory.memUsedMb) : undefined} percent={percent} unavailableReason={memory?.reason}
    note={ok ? [`${t("server.memory.ram")}: ${formatMegabytes(memory.memTotalMb)}`, swap].filter(Boolean).join(" · ") : undefined} />;
}

export function DiskCard({ disk }) {
  const ok = disk?.available;
  return <StatCard label={t("server.disk.title")} value={ok ? formatPercent(disk.usedPercent).replace("%", "") : undefined} unit="%" percent={disk?.usedPercent} unavailableReason={disk?.reason}
    note={ok ? `${t("server.disk.used")}: ${formatNumber(disk.usedGb, 1)} GB · ${t("server.disk.free")}: ${formatNumber(disk.freeGb, 1)} GB` : undefined} />;
}

export function TemperatureCard({ temperature }) {
  const ok = temperature?.available;
  return <StatCard label={t("server.temperature.title")} value={ok ? formatNumber(temperature.maxCelsius, 0) : undefined} unit="°C" percent={ok ? temperature.maxCelsius : undefined} warnAt={70} dangerAt={85} unavailableReason={temperature?.reason}
    note={ok ? temperature.sensors.map(s => `${s.name}: ${formatNumber(s.celsius, 0)}°`).join(" · ") : undefined} />;
}

export function UptimeCard({ uptime }) {
  return <StatCard label={t("server.uptime.title")} value={uptime?.available ? formatDuration(uptime.seconds) : undefined} unavailableReason={uptime?.reason} />;
}

export function PowerCard({ power }) {
  if (!power?.available) return <StatCard label={t("server.power.title")} value={undefined} unavailableReason={power?.reason} />;
  const battery = power.battery;
  if (!battery) return <StatCard label={t("server.power.title")} value={t("server.power.noBattery")} note={power.ac ? `${t("server.power.ac")}: ${power.ac.online ? t("server.power.online") : t("server.power.offline")}` : undefined} />;
  const status = POWER_STATUS[battery.status] ? t(`server.power.${POWER_STATUS[battery.status]}`) : t("server.power.unknown");
  const notes = [status, power.ac ? `${t("server.power.ac")}: ${power.ac.online ? t("server.power.online") : t("server.power.offline")}` : null, Number.isFinite(battery.healthPct) ? `${t("server.power.health")}: ${formatNumber(battery.healthPct, 0)}%` : null].filter(Boolean);
  return <StatCard label={t("server.power.battery")} value={formatNumber(battery.capacityPct, 0)} unit="%" percent={100 - battery.capacityPct} note={notes.join(" · ")} warnAt={70} dangerAt={90} />;
}
