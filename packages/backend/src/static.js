// Serves the built frontend (D5) and puts the security headers on every response.
// The set of servable files is listed once at startup and looked up by exact URL path, so a request can never
// reach a file that was not in the build output (no path joining with user input, no traversal).
import fs from "node:fs";
import path from "node:path";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".webmanifest": "application/manifest+json", ".svg": "image/svg+xml",
  ".png": "image/png", ".ico": "image/x-icon", ".woff2": "font/woff2", ".txt": "text/plain; charset=utf-8",
};

export const CONTENT_SECURITY_POLICY = "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://speed.cloudflare.com; manifest-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'";

export const SECURITY_HEADERS = Object.freeze({
  "content-security-policy": CONTENT_SECURITY_POLICY,
  "x-frame-options": "DENY",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "cross-origin-opener-policy": "same-origin",
  "cross-origin-resource-policy": "same-origin",
  "strict-transport-security": "max-age=31536000",
});

export function registerSecurityHeaders(app) {
  app.addHook("onSend", async (req, reply, payload) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) reply.header(name, value);
    if (String(req.url).startsWith("/api/") && !reply.hasHeader("cache-control")) reply.header("cache-control", "no-store");
    return payload;
  });
}

function listFiles(root, dir = root, out = new Map()) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) listFiles(root, full, out);
    else if (entry.isFile()) out.set(`/${path.relative(root, full).split(path.sep).join("/")}`, full);
  }
  return out;
}

// Returns a function that answers GET and HEAD for non-API paths and reports whether it did.
export function createStaticHandler({ dir }) {
  const files = listFiles(path.resolve(dir));
  const index = files.get("/index.html");
  if (!index) throw new Error(`The frontend build has no index.html in ${dir}.`);

  return (req, reply) => {
    if ((req.method !== "GET" && req.method !== "HEAD") || String(req.url).startsWith("/api/")) return false;
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, "http://localhost").pathname); } catch { return false; }
    let file = files.get(pathname);
    if (!file) {
      if (path.extname(pathname) !== "") return false; // a missing asset is a 404, not the app shell
      file = index; // client side routes (/projects, /server, ...) open the app shell
    }
    const hashed = pathname.startsWith("/assets/");
    reply
      .header("content-type", CONTENT_TYPES[path.extname(file)] ?? "application/octet-stream")
      .header("content-length", fs.statSync(file).size)
      .header("cache-control", hashed ? "public, max-age=31536000, immutable" : "no-cache");
    reply.send(req.method === "HEAD" ? "" : fs.createReadStream(file));
    return true;
  };
}
