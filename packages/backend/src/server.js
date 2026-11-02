import path from "node:path";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { migrate, openDatabase } from "./db.js";

let config;
try {
  config = loadConfig();
} catch (e) {
  console.error(e.message); // names the problem variables, never their values
  process.exit(1);
}

const db = openDatabase(path.join(config.dataDir, "panel.db"));
migrate(db);
const app = await buildApp({ config, db, background: true });

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, async () => { await app.close(); db.close(); process.exit(0); });
}
await app.listen({ port: config.port, host: config.host });
