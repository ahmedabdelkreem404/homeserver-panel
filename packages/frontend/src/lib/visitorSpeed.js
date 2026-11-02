// In-browser visitor connection speed test: latency, download, upload against Cloudflare edge
// Fast and gentle: small payloads (< 3 MB total transfer) that complete in 1-3 seconds without lagging the browser.

export async function testVisitorSpeed({ onProgress = () => {} } = {}) {
  const result = {
    pingMs: null,
    downMbps: null,
    upMbps: null,
    testedAt: new Date().toISOString(),
    error: null,
  };

  try {
    onProgress({ phase: "ping" });
    const pings = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      try {
        await fetch(`https://speed.cloudflare.com/__down?bytes=0&_t=${Date.now()}_${i}`, { cache: "no-store", mode: "cors" });
        pings.push(performance.now() - t0);
      } catch {
        // Fallback to origin if Cloudflare endpoint unreachable
        const f0 = performance.now();
        await fetch(`/api/health?_t=${Date.now()}_${i}`, { cache: "no-store" });
        pings.push(performance.now() - f0);
      }
    }
    pings.sort((a, b) => a - b);
    result.pingMs = Math.round(pings[Math.floor(pings.length / 2)] ?? pings[0] ?? 0);

    onProgress({ phase: "download", pingMs: result.pingMs });
    const bytesDown = 2_500_000;
    const tDown = performance.now();
    let downReceived = 0;
    try {
      const downRes = await fetch(`https://speed.cloudflare.com/__down?bytes=${bytesDown}&_t=${Date.now()}`, { cache: "no-store", mode: "cors" });
      const blob = await downRes.blob();
      downReceived = blob.size;
    } catch {
      // Fallback: smaller transfer from panel
      const downRes = await fetch(`/favicon.svg?_t=${Date.now()}`, { cache: "no-store" });
      const blob = await downRes.blob();
      downReceived = blob.size;
    }
    const downSec = Math.max(0.05, (performance.now() - tDown) / 1000);
    result.downMbps = Math.round(((downReceived * 8) / downSec / 1e6) * 10) / 10;

    onProgress({ phase: "upload", pingMs: result.pingMs, downMbps: result.downMbps });
    const bytesUp = 500_000;
    const payload = new Uint8Array(bytesUp);
    const tUp = performance.now();
    try {
      await fetch("https://speed.cloudflare.com/__up", {
        method: "POST",
        body: payload,
        headers: { "content-type": "application/octet-stream" },
        mode: "cors",
      });
    } catch {
      // Ignore upload failure on fallback
    }
    const upSec = Math.max(0.05, (performance.now() - tUp) / 1000);
    result.upMbps = Math.round(((bytesUp * 8) / upSec / 1e6) * 10) / 10;
  } catch (err) {
    result.error = String(err?.message ?? err).slice(0, 100);
  }

  return result;
}
