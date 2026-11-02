import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { authApp } from "./auth-helpers.js";
import { SECURITY_HEADERS } from "../src/static.js";

// A small stand-in for the frontend build output: shell, hashed assets, one file outside the served folder.
function makeBuild() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "panel-static-"));
  const dir = path.join(root, "dist");
  fs.mkdirSync(path.join(dir, "assets"), { recursive: true });
  fs.writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>shell</title>");
  fs.writeFileSync(path.join(dir, "assets", "app-abc123.js"), "console.log(1)");
  fs.writeFileSync(path.join(dir, "assets", "font-abc123.woff2"), "wOF2");
  fs.writeFileSync(path.join(root, "secret.txt"), "outside the build");
  return { root, dir };
}
const get = (app, url, method = "GET") => app.inject({ method, url });

test("serves the shell, hashed assets with long cache, and client routes fall back to the shell", async () => {
  const { dir } = makeBuild();
  const { app } = await authApp({ env: { STATIC_DIR: dir } });
  const home = await get(app, "/");
  assert.deepEqual([home.statusCode, home.headers["content-type"], home.headers["cache-control"]], [200, "text/html; charset=utf-8", "no-cache"]);
  assert.match(home.body, /shell/);
  const js = await get(app, "/assets/app-abc123.js");
  assert.deepEqual([js.statusCode, js.headers["content-type"], js.headers["cache-control"]], [200, "text/javascript; charset=utf-8", "public, max-age=31536000, immutable"]);
  assert.equal((await get(app, "/assets/font-abc123.woff2")).headers["content-type"], "font/woff2");
  for (const route of ["/projects", "/server", "/mcp", "/settings/security"]) assert.match((await get(app, route)).body, /shell/, route);
  const head = await get(app, "/", "HEAD");
  assert.deepEqual([head.statusCode, head.body], [200, ""]);
});

test("a missing asset, an unknown API path and non-GET methods are not answered with the shell", async () => {
  const { dir } = makeBuild();
  const { app } = await authApp({ env: { STATIC_DIR: dir } });
  assert.equal((await get(app, "/assets/missing.js")).statusCode, 404);
  assert.equal((await get(app, "/favicon.ico")).statusCode, 404);
  const api = await get(app, "/api/nope");
  assert.deepEqual([api.statusCode, JSON.parse(api.body).error.code], [404, "not_found"]);
  assert.equal((await app.inject({ method: "POST", url: "/projects" })).statusCode, 404);
});

test("only files that were in the build are served: traversal attempts get the shell or a 404, never another file", async () => {
  const { dir } = makeBuild();
  const { app } = await authApp({ env: { STATIC_DIR: dir } });
  for (const url of ["/..%2fsecret.txt", "/assets/..%2f..%2fsecret.txt", "/%2e%2e/secret.txt", "/assets/../../secret.txt", "/secret.txt", "/%00", "/assets/%", "//etc/passwd"]) {
    const res = await get(app, url);
    assert.ok(!res.body.includes("outside the build"), url);
    assert.ok([200, 400, 404].includes(res.statusCode), `${url} -> ${res.statusCode}`);
  }
});

test("security headers are on every response: pages, assets, API answers and errors", async () => {
  const { dir } = makeBuild();
  const { app } = await authApp({ env: { STATIC_DIR: dir } });
  for (const url of ["/", "/assets/app-abc123.js", "/api/health", "/api/auth/session", "/api/nope", "/assets/missing.js"]) {
    const res = await get(app, url);
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) assert.equal(res.headers[name], value, `${url} ${name}`);
    assert.equal(res.headers["x-powered-by"], undefined, url);
  }
  const csp = SECURITY_HEADERS["content-security-policy"];
  for (const part of ["default-src 'none'", "script-src 'self'", "frame-ancestors 'none'", "base-uri 'none'"]) assert.ok(csp.includes(part), part);
  assert.ok(!/unsafe-inline|unsafe-eval|\*/.test(csp), "no inline or eval scripts, no wildcard sources");
  assert.equal((await get(app, "/api/auth/session")).headers["cache-control"], "no-store", "API answers are never cached");
});

test("without a build folder the panel serves the API only, and a folder without index.html fails at startup", async () => {
  const { app } = await authApp();
  assert.equal((await get(app, "/")).statusCode, 404);
  assert.equal(SECURITY_HEADERS["x-frame-options"], (await get(app, "/")).headers["x-frame-options"]);
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), "panel-empty-"));
  await assert.rejects(authApp({ env: { STATIC_DIR: empty } }), /no index\.html/);
});
