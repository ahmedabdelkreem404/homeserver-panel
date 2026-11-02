// Files generated for static mode: a tiny dependency-free server on the node:24-alpine image the server already caches.
export const STATIC_SERVER_JS = `const http = require("http");
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "public");
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif", ".webp": "image/webp", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".woff": "font/woff", ".woff2": "font/woff2", ".map": "application/json", ".xml": "application/xml" };
function resolve(urlPath) {
  const clean = path.normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^([/\\\\]*\\.\\.)+/, "");
  const file = path.join(ROOT, clean);
  if (!file.startsWith(ROOT)) return null;
  try { if (fs.statSync(file).isDirectory()) return path.join(file, "index.html"); return file; } catch { return null; }
}
http.createServer((req, res) => {
  if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end(); }
  let file;
  try { file = resolve(req.url); } catch { res.writeHead(400); return res.end(); }
  if (!file || !fs.existsSync(file)) file = path.join(ROOT, "index.html"); // single-page app fallback
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    const ext = path.extname(file);
    res.writeHead(200, { "content-type": TYPES[ext] || "application/octet-stream", "cache-control": ext === ".html" ? "no-cache" : "public, max-age=3600" });
    res.end(req.method === "HEAD" ? undefined : data);
  });
}).listen(3000, () => console.log("static server listening on 3000"));
`;

export const STATIC_DOCKERFILE = `FROM node:24-alpine
WORKDIR /app
COPY server.js ./
COPY public ./public
EXPOSE 3000
CMD ["node", "server.js"]
`;
