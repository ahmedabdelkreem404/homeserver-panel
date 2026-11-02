// On-demand speed test against Cloudflare's public endpoints: a capped download and a capped upload.
// At most one run at a time and one every 10 minutes; every result (or failure) is stored with its time.
import { PanelError } from "../errors.js";

export const MIN_INTERVAL_MS = 10 * 60_000;
const DOWN_BYTES = 25_000_000, UP_BYTES = 10_000_000, DOWN_TIMEOUT_MS = 20_000, UP_TIMEOUT_MS = 20_000;

export function createSpeedTest({ db, now = () => new Date(), fetchImpl = globalThis.fetch, clock = () => performance.now() }) {
  let running = false;
  const last = () => db.prepare("SELECT at, down_mbps AS downMbps, up_mbps AS upMbps, bytes_down AS bytesDown, bytes_up AS bytesUp, error FROM speed_tests ORDER BY at DESC LIMIT 1").get() ?? null;
  const history = (hours = 24) => {
    const since = new Date(now().getTime() - hours * 3600_000).toISOString();
    return db.prepare("SELECT at, down_mbps AS downMbps, up_mbps AS upMbps, error FROM speed_tests WHERE at >= ? ORDER BY at ASC").all(since);
  };
  const mbps = (bytes, ms) => Math.round(((bytes * 8) / (ms / 1000) / 1e6) * 10) / 10;

  return {
    last,
    history,
    async run() {
      if (running) throw new PanelError("rate_limited", "A speed test is already running.", { details: { retryAfterSec: 30 } });
      const previous = last();
      if (previous && now().getTime() - Date.parse(previous.at) < MIN_INTERVAL_MS) {
        const wait = Math.ceil((MIN_INTERVAL_MS - (now().getTime() - Date.parse(previous.at))) / 1000);
        throw new PanelError("rate_limited", "A speed test ran a few minutes ago. Wait before running another.", { details: { retryAfterSec: wait } });
      }
      running = true;
      const result = { at: now().toISOString(), downMbps: null, upMbps: null, bytesDown: 0, bytesUp: 0, error: null };
      try {
        const t0 = clock();
        const res = await fetchImpl(`https://speed.cloudflare.com/__down?bytes=${DOWN_BYTES}`, { signal: AbortSignal.timeout(DOWN_TIMEOUT_MS) });
        if (!res.ok) throw new Error(`download answered ${res.status}`);
        for await (const chunk of res.body) { result.bytesDown += chunk.length; if (result.bytesDown >= DOWN_BYTES) break; }
        result.downMbps = mbps(result.bytesDown, Math.max(1, clock() - t0));
        const t1 = clock();
        const up = await fetchImpl("https://speed.cloudflare.com/__up", { method: "POST", body: new Uint8Array(UP_BYTES), headers: { "content-type": "application/octet-stream" }, signal: AbortSignal.timeout(UP_TIMEOUT_MS) });
        if (!up.ok) throw new Error(`upload answered ${up.status}`);
        result.bytesUp = UP_BYTES;
        result.upMbps = mbps(UP_BYTES, Math.max(1, clock() - t1));
      } catch (e) {
        result.error = e?.name === "TimeoutError" ? "The test timed out." : String(e?.message ?? e).slice(0, 120);
      } finally {
        running = false;
        db.prepare("INSERT INTO speed_tests (at, down_mbps, up_mbps, bytes_down, bytes_up, error) VALUES (?, ?, ?, ?, ?, ?)").run(result.at, result.downMbps, result.upMbps, result.bytesDown, result.bytesUp, result.error);
      }
      return result;
    },
  };
}
