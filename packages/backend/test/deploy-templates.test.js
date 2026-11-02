import test from "node:test";
import assert from "node:assert/strict";
import { defaultEnv, detectTemplate, prepareBuild, TEMPLATES } from "../src/deploy/templates.js";
import { readZip, unwrapRoot } from "../src/deploy/zip-read.js";
import { makeZip } from "./zip-helpers.js";

const files = (...pairs) => pairs.map(([path, data = ""]) => ({ path, data: Buffer.from(typeof data === "string" ? data : JSON.stringify(data)) }));
const dockerfileOf = built => built.entries.find(e => e.path === "Dockerfile").data.toString();

test("detection from the files alone, in the right order", () => {
  const table = [
    [files(["index.html"]), "static"],
    [files(["dist/index.html"], ["package.json", {}]), "static"],
    [files(["index.php"]), "php"],
    [files(["public/index.php"]), "php"],
    [files(["package.json", { scripts: { start: "node server.js" } }]), "node"],
    [files(["package.json", { main: "app.js" }], ["app.js"]), "node"],
    [files(["package.json", { dependencies: { next: "15" }, scripts: { start: "next start" } }]), "next"],
    [files(["artisan"], ["composer.json", { require: { "laravel/framework": "^11" } }], ["public/index.php"]), "laravel"],
    [files(["composer.json", { require: { "slim/slim": "4" } }], ["index.php"]), "php"],
    [files(["Dockerfile", "FROM scratch"], ["index.html"]), "custom"],
    [files(["README.md"], ["notes.txt"]), null],
    [files(["package.json", "{ not json"]), null],
  ];
  for (const [entries, expected] of table) assert.equal(detectTemplate(entries).template, expected, entries.map(e => e.path).join(", "));
  assert.equal(detectTemplate(files(["dist/index.html"])).outputDir, "dist");
});

test("every template yields a Dockerfile that runs as a non-root user on a high port, with a healthcheck", () => {
  const builds = {
    static: prepareBuild(files(["index.html", "<p>hi</p>"], ["css/a.css", "a{}"]), {}),
    node: prepareBuild(files(["package.json", { scripts: { start: "node s.js" } }], ["package-lock.json", "{}"], ["s.js"]), {}),
    next: prepareBuild(files(["package.json", { dependencies: { next: "15" } }]), {}),
    php: prepareBuild(files(["index.php", "<?php echo 1;"]), {}),
    laravel: prepareBuild(files(["artisan"], ["composer.json", { require: { "laravel/framework": "11" } }]), {}),
    n8n: prepareBuild([], { template: "n8n" }),
    wordpress: prepareBuild([], { template: "wordpress" }),
    pocketbase: prepareBuild([], { template: "pocketbase" }),
  };
  assert.deepEqual(Object.keys(builds).sort(), [...TEMPLATES].sort());
  for (const [name, built] of Object.entries(builds)) {
    const docker = dockerfileOf(built);
    assert.ok(built.port > 1024, `${name} port`);
    assert.match(docker, new RegExp(`EXPOSE ${built.port}`), name);
    assert.ok(/USER (node|www-data)|nginx-unprivileged|serversideup\/php/.test(docker), `${name} does not run as root`);
    assert.ok(!/^USER root\s*$/m.test(docker.split("\n").slice(-4).join("\n")), `${name} ends as root`);
    assert.ok(/HEALTHCHECK/.test(docker) || /serversideup/.test(docker), `${name} has a healthcheck (built in for the PHP image)`);
  }
  assert.match(dockerfileOf(builds.node), /CMD \["npm", "start"\]/);
  assert.match(dockerfileOf(builds.laravel), /FROM composer:2 AS vendor/);
  assert.match(dockerfileOf(builds.laravel), /NGINX_WEBROOT=\/var\/www\/html\/public/);
  assert.match(dockerfileOf(builds.php), /NGINX_WEBROOT=\/var\/www\/html\n/);
  assert.match(dockerfileOf(prepareBuild(files(["public/index.php"]), {})), /NGINX_WEBROOT=\/var\/www\/html\/public/);
});

test("static sites are moved under public/ and served with a single-page fallback", () => {
  const built = prepareBuild(files(["dist/index.html", "x"], ["dist/app.js", "y"], ["package.json", {}], ["src/main.js", "z"]), {});
  assert.equal(built.template, "static");
  assert.deepEqual(built.entries.map(e => e.path).sort(), ["Dockerfile", "nginx.conf", "public/app.js", "public/index.html"], "only the output folder is shipped");
  assert.match(built.entries.find(e => e.path === "nginx.conf").data.toString(), /try_files \$uri \$uri\/ \/index\.html/);
  assert.throws(() => prepareBuild(files(["dist/app.js"], ["notes.txt"]), { template: "static", outputDir: "dist" }), e => e.code === "invalid_request");
});

test("node: the start script or the main file runs; with neither the project is refused; versions not pinned is a warning", () => {
  assert.match(dockerfileOf(prepareBuild(files(["package.json", { main: "app.js" }], ["app.js"]), {})), /CMD \["node", "app\.js"\]/);
  assert.throws(() => prepareBuild(files(["package.json", { name: "x" }]), { template: "node" }), e => /start script/.test(e.message));
  assert.ok(prepareBuild(files(["package.json", { scripts: { start: "x" } }]), {}).warnings.some(w => /package-lock/.test(w)));
  assert.deepEqual(prepareBuild(files(["package.json", { scripts: { start: "x" } }], ["package-lock.json"]), {}).warnings, []);
});

test("next builds on the server only when there is no .next folder, and says so", () => {
  const source = prepareBuild(files(["package.json", { dependencies: { next: "15" } }]), {});
  assert.match(dockerfileOf(source), /npm run build/);
  assert.ok(source.warnings.some(w => /1 GB/.test(w)));
  const prebuilt = prepareBuild(files(["package.json", { dependencies: { next: "15" } }], [".next/BUILD_ID", "1"]), {});
  assert.doesNotMatch(dockerfileOf(prebuilt), /npm run build/);
  assert.deepEqual(prebuilt.warnings, []);
});

test("laravel: composer runs in a build stage unless vendor/ is shipped; storage folders exist and belong to www-data", () => {
  const base = [["artisan"], ["composer.json", { require: { "laravel/framework": "11" } }]];
  const source = prepareBuild(files(...base), {});
  assert.ok(source.warnings.some(w => /vendor/.test(w)));
  const vendored = prepareBuild(files(...base, ["vendor/autoload.php"]), {});
  assert.doesNotMatch(dockerfileOf(vendored), /composer install/);
  assert.deepEqual(vendored.warnings, []);
  for (const built of [source, vendored]) assert.match(dockerfileOf(built), /mkdir -p storage\/framework\/cache .*bootstrap\/cache && chown -R www-data:www-data storage bootstrap\/cache/);
});

test("secrets and bulk never reach the build: .env files, .git and node_modules are dropped and listed", () => {
  const built = prepareBuild(files(["package.json", { scripts: { start: "x" } }], [".env", "SECRET=1"], [".env.production", "SECRET=2"], ["sub/.env", "S=3"], ["node_modules/a/index.js"], [".git/config"], ["src/.environment.js", "ok"]), {});
  assert.deepEqual(built.skipped.sort(), [".env", ".env.production", ".git/config", "node_modules/a/index.js", "sub/.env"]);
  const shipped = built.entries.map(e => e.path);
  assert.ok(shipped.includes("src/.environment.js"), "a file that only starts like .env is kept");
  assert.ok(!shipped.some(p => /\.env($|\.)|node_modules|\.git\//.test(p)));
});

test("a project with its own Dockerfile is refused unless the owner allows it; an unknown or undetectable project is refused", () => {
  const own = files(["Dockerfile", "FROM scratch"], ["index.html"]);
  assert.throws(() => prepareBuild(own, {}), e => /own Dockerfile/.test(e.message));
  assert.throws(() => prepareBuild(own, { template: "static" }), e => /own Dockerfile/.test(e.message), "choosing a template does not hide it");
  const allowed = prepareBuild(own, { allowCustom: true });
  assert.equal(allowed.template, "custom");
  assert.equal(allowed.entries.find(e => e.path === "Dockerfile").data.toString(), "FROM scratch");
  assert.throws(() => prepareBuild(files(["notes.txt"]), {}), e => /could not tell/i.test(e.message));
  assert.throws(() => prepareBuild(files(["index.html"]), { template: "ruby" }), e => /Unknown template/.test(e.message));
});

test("default variables: Laravel gets a fresh key every time, Node gets production, static and PHP need none", () => {
  const a = defaultEnv("laravel"), b = defaultEnv("laravel");
  assert.match(a.APP_KEY, /^base64:[A-Za-z0-9+/]{43}=$/);
  assert.notEqual(a.APP_KEY, b.APP_KEY);
  assert.deepEqual([a.APP_ENV, a.APP_DEBUG], ["production", "false"]);
  assert.deepEqual(defaultEnv("node"), { NODE_ENV: "production" });
  assert.deepEqual(defaultEnv("static"), {});
  assert.deepEqual(defaultEnv("php"), {});
});

test("from an uploaded zip to a build context: read, unwrap the top folder, prepare", () => {
  const zip = makeZip([{ name: "my-site/index.html", data: "<h1>x</h1>" }, { name: "my-site/.env", data: "SECRET=1" }, { name: "my-site/style.css", data: "a{}" }]);
  const built = prepareBuild(unwrapRoot(readZip(zip)), {});
  assert.equal(built.template, "static");
  assert.deepEqual(built.skipped, [".env"]);
  assert.ok(built.entries.some(e => e.path === "public/index.html"));
});
