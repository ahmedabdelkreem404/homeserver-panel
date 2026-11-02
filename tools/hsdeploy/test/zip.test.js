import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { buildZip, collectFiles, compileIgnore, readZip, toZipName } from "../src/zip.js";

test("zip entries use forward slashes and round-trip through an independent reader", () => {
  const entries = [
    { name: "public/index.html", data: Buffer.from("<h1>hello</h1>".repeat(50)) },
    { name: "public/assets/app.js", data: Buffer.from("console.log(1)") },
    { name: "Dockerfile", data: Buffer.from("FROM node:24-alpine\n") },
    { name: "random.bin", data: crypto.randomBytes(4096) },
  ];
  const files = readZip(buildZip(entries));
  assert.deepEqual(files.map(f => f.name), entries.map(e => e.name));
  for (let i = 0; i < files.length; i++) assert.ok(files[i].data.equals(entries[i].data));
  assert.ok(files.every(f => !f.name.includes("\\")));
});

test("Windows paths are converted and unsafe names are rejected", () => {
  assert.equal(toZipName(["a", "b", "c.txt"].join(path.sep)), "a/b/c.txt");
  for (const name of ["..\\evil", "../evil", "/abs", "a/../b", "a\\b"]) assert.throws(() => buildZip([{ name, data: Buffer.from("x") }]), /Unsafe zip entry name/);
});

test("incompressible data is stored, compressible data is deflated", () => {
  const rand = crypto.randomBytes(100_000);
  const zipRand = buildZip([{ name: "r", data: rand }]);
  const zipText = buildZip([{ name: "t", data: Buffer.alloc(100_000, 65) }]);
  assert.ok(zipRand.length >= rand.length);
  assert.ok(zipText.length < 2_000);
});

test("ignore matcher: dirs, globs, nested names; negation is rejected", () => {
  const ignored = compileIgnore(["# comment", "", "**/node_modules", "*.log", "build/", "docs/private"]);
  assert.ok(ignored("node_modules/x/y.js"));
  assert.ok(ignored("packages/a/node_modules/z.js"));
  assert.ok(ignored("debug.log"));
  assert.ok(ignored("build/out.js"));
  assert.ok(ignored("docs/private/secret.md"));
  assert.ok(!ignored("src/app.js"));
  assert.ok(!ignored("docs/public.md"));
  assert.throws(() => compileIgnore(["!keep.me"]), /negation is not supported/);
});

test("collectFiles skips default excludes, env files and .dockerignore entries", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hsd-"));
  try {
    const w = (rel, text = "x") => { const f = path.join(dir, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, text); };
    w("Dockerfile"); w("src/app.js"); w("node_modules/dep/index.js"); w(".git/config"); w(".env"); w(".env.production"); w(".hsdeploy.json"); w("secret/token.txt"); w(".dockerignore", "secret\n");
    const names = collectFiles(dir).map(f => f.name);
    assert.deepEqual(names, [".dockerignore", "Dockerfile", "src/app.js"]);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
