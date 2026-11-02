// Read-only access to the host's /proc and /sys, bind-mounted into the container at /host/proc and /host/sys.
// Every read answers null instead of throwing, so each metric can say "unavailable" on its own.
import fs from "node:fs";

export function createHostFs({ proc = "/host/proc", sys = "/host/sys" } = {}) {
  const read = file => { try { return fs.readFileSync(file, "utf8"); } catch { return null; } };
  const exists = file => { try { fs.accessSync(file); return true; } catch { return false; } };
  const list = dir => { try { return fs.readdirSync(dir); } catch { return []; } };
  return {
    proc: rel => read(`${proc}/${rel}`),
    // Network files must come from the host's network namespace (PID 1), not the container's own.
    procNet: rel => read(`${proc}/1/net/${rel}`),
    sys: rel => read(`${sys}/${rel}`),
    sysExists: rel => exists(`${sys}/${rel}`),
    sysList: rel => list(`${sys}/${rel}`),
  };
}
