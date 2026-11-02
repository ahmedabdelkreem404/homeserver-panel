import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "../src/cli.js";

// End-to-end through the CLI entry point with a throwaway HSDEPLOY_HOME. Nothing here calls the network:
// `up --dry-run` only builds the zip locally after the trust check.
function sandbox() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "hsd-home-"));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "hsd-proj-"));
  const previous = process.env.HSDEPLOY_HOME;
  const ttyDescriptor = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
  process.env.HSDEPLOY_HOME = home;
  Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true }); // deterministic: no terminal
  const project = name => { const dir = path.join(root, name); fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, "Dockerfile"), "FROM node:24-alpine\n"); return dir; };
  const cleanup = () => {
    if (previous === undefined) delete process.env.HSDEPLOY_HOME; else process.env.HSDEPLOY_HOME = previous;
    if (ttyDescriptor) Object.defineProperty(process.stdin, "isTTY", ttyDescriptor); else delete process.stdin.isTTY;
    fs.rmSync(home, { recursive: true, force: true }); fs.rmSync(root, { recursive: true, force: true });
  };
  return { project, cleanup };
}
const quiet = { out: () => {}, err: () => {} };
const edit = (dir, fn) => { const f = path.join(dir, ".hsdeploy.json"); const j = JSON.parse(fs.readFileSync(f, "utf8")); fn(j); fs.writeFileSync(f, JSON.stringify(j)); };
const dry = dir => run(["up", "--dir", dir, "--dry-run"], quiet);

test("D13: a config created by init is trusted at once; non-code edits keep trust; a new build command needs a person", async () => {
  const s = sandbox();
  try {
    const dir = s.project("app");
    await run(["init", "--dir", dir, "--project", "hs-x", "--subdomain", "x", "--mode", "dockerfile"], quiet);
    await dry(dir); // trusted automatically, no `trust` call

    edit(dir, j => { j.subdomain = "y"; j.port = 8080; });
    await dry(dir); // fields that cannot execute code: still trusted

    edit(dir, j => { j.buildCommand = "echo hi"; });
    await assert.rejects(dry(dir), e => e.kind === "refused" && /never approved|changed/.test(e.message), "changed build command is refused");
    await assert.rejects(run(["trust", "--dir", dir], quiet), e => e.kind === "refused" && /interactive terminal/.test(e.message), "trust without a TTY is refused");

    edit(dir, j => { delete j.buildCommand; });
    await dry(dir); // back to the approved command: trusted again
  } finally { s.cleanup(); }
});

test("D13: a config that was not created by init on this machine needs manual trust, and trust is bound to its folder", async () => {
  const s = sandbox();
  try {
    const foreign = s.project("foreign");
    fs.writeFileSync(path.join(foreign, ".hsdeploy.json"), JSON.stringify({ dokployProject: "hs-x", app: "foreign", subdomain: "foreign", mode: "dockerfile" }));
    await assert.rejects(dry(foreign), e => e.kind === "refused");

    const mine = s.project("mine");
    await run(["init", "--dir", mine, "--project", "hs-x", "--subdomain", "mine", "--mode", "dockerfile"], quiet);
    await dry(mine);
    const copy = s.project("copy");
    fs.copyFileSync(path.join(mine, ".hsdeploy.json"), path.join(copy, ".hsdeploy.json"));
    await assert.rejects(dry(copy), e => e.kind === "refused", "a copied config is foreign to the new folder");
  } finally { s.cleanup(); }
});

test("init still refuses protected projects and reserved subdomains, and trusts nothing it refused", async () => {
  const s = sandbox();
  try {
    const dir = s.project("proj-p");
    await assert.rejects(run(["init", "--dir", dir, "--project", "infra", "--subdomain", "x", "--mode", "dockerfile"], quiet), e => e.kind === "refused");
    await assert.rejects(run(["init", "--dir", dir, "--project", "hs-x", "--subdomain", "panel", "--mode", "dockerfile"], quiet), e => e.kind === "refused");
    assert.ok(!fs.existsSync(path.join(dir, ".hsdeploy.json")));
  } finally { s.cleanup(); }
});
