// From an unpacked project to a build context: detect the technology, then add the Dockerfile (and what it needs) so the
// owner of the site never writes one. Images are official or widely used multi-arch ones, run as a non-root user, listen on
// a port above 1024 and carry a healthcheck. A project that ships its own Dockerfile is not accepted unless the caller says so.
import crypto from "node:crypto";
import { PanelError } from "../errors.js";

export const TEMPLATES = Object.freeze(["static", "node", "next", "php", "laravel", "n8n", "wordpress", "pocketbase"]);
const invalid = message => new PanelError("invalid_request", message);

const has = (entries, path) => entries.some(e => e.path === path);
const read = (entries, path) => entries.find(e => e.path === path)?.data;
const json = (entries, path) => { try { return JSON.parse(read(entries, path)?.toString("utf8") ?? ""); } catch { return null; } };

// What a project is, from the files alone. Order matters: Laravel and Next are also PHP and Node projects.
export function detectTemplate(entries) {
  if (has(entries, "Dockerfile")) return { template: "custom", reasons: ["it contains its own Dockerfile"] };
  const composer = json(entries, "composer.json");
  if (has(entries, "artisan") && composer?.require?.["laravel/framework"]) return { template: "laravel", reasons: ["artisan and laravel/framework in composer.json"] };
  const pkg = json(entries, "package.json");
  const deps = { ...pkg?.dependencies, ...pkg?.devDependencies };
  if (pkg && deps.next) return { template: "next", reasons: ["next in package.json"] };
  if (pkg && (pkg.scripts?.start || (pkg.main && has(entries, pkg.main)))) return { template: "node", reasons: [pkg.scripts?.start ? "a start script in package.json" : "a main file in package.json"] };
  if (has(entries, "index.php") || has(entries, "public/index.php")) return { template: "php", reasons: ["index.php"] };
  for (const dir of ["", "dist/", "build/", "public/", "out/"]) if (has(entries, `${dir}index.html`)) return { template: "static", reasons: [`${dir}index.html`], outputDir: dir.replace(/\/$/, "") };
  return { template: null, reasons: [] };
}

const HEALTH_TCP = `HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 CMD node -e "require('net').connect(process.env.PORT||3000,'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"`;

const NGINX_CONF = `server {
  listen 8080;
  root /usr/share/nginx/html;
  index index.html;
  add_header X-Content-Type-Options nosniff always;
  location / { try_files $uri $uri/ /index.html; }
}
`;

function staticBuild(entries, { outputDir = "" }) {
  const prefix = outputDir ? `${outputDir}/` : "";
  const site = entries.filter(e => e.path.startsWith(prefix) && e.path !== "Dockerfile").map(e => ({ path: `public/${e.path.slice(prefix.length)}`, data: e.data }));
  if (!site.some(e => e.path === "public/index.html")) throw invalid("A static site needs an index.html at the top of the site folder.");
  return {
    port: 8080, entries: site,
    add: {
      "nginx.conf": NGINX_CONF,
      Dockerfile: `FROM nginxinc/nginx-unprivileged:1.27-alpine\nCOPY nginx.conf /etc/nginx/conf.d/default.conf\nCOPY public/ /usr/share/nginx/html/\nEXPOSE 8080\nHEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1\n`,
    },
    warnings: [],
  };
}

function nodeBuild(entries) {
  const pkg = json(entries, "package.json") ?? {};
  const command = pkg.scripts?.start ? `["npm", "start"]` : `["node", ${JSON.stringify(pkg.main)}]`;
  if (!pkg.scripts?.start && !pkg.main) throw invalid("package.json needs a start script (or a main file).");
  return {
    port: 3000, entries, warnings: has(entries, "package-lock.json") ? [] : ["There is no package-lock.json, so dependency versions are not pinned."],
    add: {
      Dockerfile: `FROM node:24-alpine\nWORKDIR /app\nENV NODE_ENV=production PORT=3000\nCOPY package*.json ./\nRUN npm ci --omit=dev || npm install --omit=dev\nCOPY --chown=node:node . .\nUSER node\nEXPOSE 3000\n${HEALTH_TCP}\nCMD ${command}\n`,
    },
  };
}

function nextBuild(entries) {
  const built = entries.some(e => e.path.startsWith(".next/"));
  const install = built ? "RUN npm ci --omit=dev || npm install --omit=dev" : "RUN npm ci --include=dev || npm install --include=dev";
  const build = built ? "" : "RUN npm run build && npm prune --omit=dev\n";
  return {
    port: 3000, entries,
    warnings: built ? [] : ["There is no .next folder: the site is built on the server, which needs more than 1 GB of memory and is slow. Upload the built site to avoid that."],
    add: {
      Dockerfile: `FROM node:24-alpine\nWORKDIR /app\nENV NODE_ENV=production PORT=3000 NEXT_TELEMETRY_DISABLED=1 NODE_OPTIONS=--max-old-space-size=768\nCOPY package*.json ./\n${install}\nCOPY --chown=node:node . .\n${build}USER node\nEXPOSE 3000\n${HEALTH_TCP}\nCMD ["npm", "start"]\n`,
    },
  };
}

function phpBuild(entries) {
  const root = has(entries, "index.php") ? "/var/www/html" : "/var/www/html/public";
  return {
    port: 8080, entries, warnings: [],
    add: { Dockerfile: `FROM serversideup/php:8.3-fpm-nginx\nENV SSL_MODE=off NGINX_WEBROOT=${root}\nCOPY --chown=www-data:www-data . /var/www/html\nEXPOSE 8080\n` },
  };
}

const WRITABLE = "storage/framework/cache storage/framework/sessions storage/framework/views storage/logs bootstrap/cache";

function laravelBuild(entries) {
  const vendored = entries.some(e => e.path.startsWith("vendor/"));
  const stage = vendored ? "" : `FROM composer:2 AS vendor\nWORKDIR /app\nCOPY composer.json composer.lock* ./\nRUN composer install --no-dev --no-scripts --no-autoloader --prefer-dist --no-interaction\nCOPY . .\nRUN composer dump-autoload --optimize --no-dev\n\n`;
  const source = vendored ? "." : "--from=vendor /app";
  return {
    port: 8080, entries,
    warnings: vendored ? [] : ["There is no vendor folder: composer installs the dependencies on the server (slow, needs network). Upload the project with vendor/ to avoid that."],
    add: {
      Dockerfile: `${stage}FROM serversideup/php:8.3-fpm-nginx\nENV SSL_MODE=off NGINX_WEBROOT=/var/www/html/public\nCOPY --chown=www-data:www-data ${source} /var/www/html\nUSER root\nRUN mkdir -p ${WRITABLE} && chown -R www-data:www-data storage bootstrap/cache\nUSER www-data\nEXPOSE 8080\n`,
    },
  };
}

function n8nBuild(entries) {
  return {
    port: 5678, entries, warnings: [],
    add: {
      Dockerfile: `FROM n8nio/n8n:latest\nUSER node\nENV PORT=5678 N8N_PORT=5678 N8N_HOST=0.0.0.0\nEXPOSE 5678\nHEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:5678/healthz || exit 1\n`,
    },
  };
}

function wordpressBuild(entries) {
  return {
    port: 8080, entries, warnings: [],
    add: {
      Dockerfile: `FROM wordpress:php8.3-apache\nRUN sed -i 's/80/8080/g' /etc/apache2/ports.conf /etc/apache2/sites-available/*.conf\nUSER www-data\nEXPOSE 8080\nHEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/ || exit 1\n`,
    },
  };
}

function pocketbaseBuild(entries) {
  return {
    port: 8080, entries, warnings: [],
    add: {
      Dockerfile: `FROM ghcr.io/muchobien/pocketbase:latest\nUSER www-data\nEXPOSE 8080\nHEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8080/api/health || exit 1\nCMD ["/pocketbase/pocketbase", "serve", "--http=0.0.0.0:8080"]\n`,
    },
  };
}

const BUILDERS = { static: staticBuild, node: nodeBuild, next: nextBuild, php: phpBuild, laravel: laravelBuild, n8n: n8nBuild, wordpress: wordpressBuild, pocketbase: pocketbaseBuild };

// Never part of a build: dependencies the server installs itself, version control, and every env file (secrets).
const EXCLUDED = path => /(^|\/)(node_modules|\.git)\//.test(path) || /(^|\/)\.env(\.|$)/.test(path) || /(^|\/)\.DS_Store$/.test(path);

// The files to send to Dokploy for a template. `allowCustom` is the owner's switch for projects with their own Dockerfile.
export function prepareBuild(entries, { template, outputDir = "", allowCustom = false } = {}) {
  const detected = detectTemplate(entries);
  const chosen = template ?? detected.template;
  if (chosen === "custom" || (chosen && chosen !== "custom" && has(entries, "Dockerfile"))) {
    if (!allowCustom) throw invalid("Projects with their own Dockerfile are not accepted here. Remove the Dockerfile and pick a template, or ask the owner.");
    return { template: "custom", port: null, entries: entries.filter(e => !EXCLUDED(e.path)), warnings: ["A custom Dockerfile was used as it is."], skipped: entries.filter(e => EXCLUDED(e.path)).map(e => e.path) };
  }
  if (!chosen) throw invalid("Could not tell what kind of project this is. It needs an index.html, a package.json with a start script, an index.php, or a Laravel project.");
  if (!TEMPLATES.includes(chosen)) throw invalid(`Unknown template "${chosen}".`);
  const kept = entries.filter(e => !EXCLUDED(e.path));
  const skipped = entries.filter(e => EXCLUDED(e.path)).map(e => e.path);
  const built = BUILDERS[chosen](kept, { outputDir: template ? outputDir : detected.outputDir ?? outputDir });
  const files = [...built.entries];
  for (const [path, text] of Object.entries(built.add)) files.push({ path, data: Buffer.from(text) });
  return { template: chosen, port: built.port, entries: files, warnings: built.warnings, skipped, reasons: template ? [] : detected.reasons };
}

// Variables a template needs to run, generated once and kept by the owner of the site. Laravel refuses to start without a key.
export function defaultEnv(template, { randomBytes = crypto.randomBytes } = {}) {
  if (template === "laravel") return { APP_KEY: `base64:${randomBytes(32).toString("base64")}`, APP_ENV: "production", APP_DEBUG: "false", LOG_CHANNEL: "stderr" };
  if (template === "node" || template === "next") return { NODE_ENV: "production" };
  if (template === "n8n") return { N8N_PORT: "5678", N8N_HOST: "0.0.0.0", N8N_PROTOCOL: "https", GENERIC_TIMEZONE: "Africa/Cairo" };
  if (template === "wordpress") return { WORDPRESS_DB_HOST: "shared-mysql:3306" };
  return {};
}

