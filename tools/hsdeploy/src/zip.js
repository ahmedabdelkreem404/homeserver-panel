// Minimal zip writer: forward-slash names, deflate or store per file, no dependencies.
// Limits (no zip64): at most 65535 entries and 4 GiB; larger projects fail with a clear message.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { HsError } from "./errors.js";

const MAX_ENTRIES = 65535;
const MAX_BYTES = 0xffffffff;

export const DEFAULT_EXCLUDES = Object.freeze([
  "**/node_modules", "**/.git", "**/.env", "**/.env.*", "**/.next/cache", "**/.turbo", "**/.cache", "**/.parcel-cache",
  "**/__pycache__", "**/.venv", "**/vendor/bundle", "**/.tmp", ".hsdeploy.json", "**/.DS_Store", "**/Thumbs.db",
]);

export function toZipName(relPath) {
  return relPath.split(path.sep).join("/").replace(/^\/+/, "");
}

function globToRegex(pattern) {
  let re = "";
  for (let i = 0; i < pattern.length; i++) {
    const c = pattern[i];
    if (c === "*") {
      if (pattern[i + 1] === "*") {
        i++;
        if (pattern[i + 1] === "/") { i++; re += "(?:.*/)?"; } else re += ".*";
      } else re += "[^/]*";
    } else if (c === "?") re += "[^/]";
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${re}$`);
}

// Docker-style subset: comments, blank lines, "dir", "dir/", "*.ext", "**/name", "a/b". Negation is rejected, not ignored.
export function compileIgnore(lines) {
  const regexes = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) continue;
    if (line.startsWith("!")) throw new HsError("invalid", `Ignore pattern "${line}": negation is not supported. Remove it or restructure the file.`);
    const p = line.replace(/^\/+/, "").replace(/\/+$/, "");
    regexes.push(globToRegex(p));
  }
  return relPosix => {
    const parts = relPosix.split("/");
    for (let i = 1; i <= parts.length; i++) {
      const prefix = parts.slice(0, i).join("/");
      if (regexes.some(r => r.test(prefix))) return true;
    }
    return false;
  };
}

export function readIgnoreFile(file) {
  try { return fs.readFileSync(file, "utf8").split(/\r?\n/); } catch { return []; }
}

// Walks root and returns [{name, abs, size}] with forward-slash names. Symlinks are skipped.
export function collectFiles(root, { extraIgnore = [], useDockerignore = true, include = null } = {}) {
  const lines = [...DEFAULT_EXCLUDES, ...extraIgnore, ...(useDockerignore ? readIgnoreFile(path.join(root, ".dockerignore")) : [])];
  const ignored = compileIgnore(lines);
  const out = [];
  const walk = dir => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const abs = path.join(dir, ent.name);
      const name = toZipName(path.relative(root, abs));
      if (ent.isSymbolicLink()) continue;
      if (ignored(name)) continue;
      if (ent.isDirectory()) walk(abs);
      else if (ent.isFile()) out.push({ name, abs, size: fs.statSync(abs).size });
    }
  };
  walk(root);
  return include ? out.filter(e => include(e.name)) : out;
}

const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };

// entries: [{name, data: Buffer}] or [{name, abs}] (read lazily, one file in memory at a time)
export function buildZip(entries) {
  if (entries.length > MAX_ENTRIES) throw new HsError("invalid", `Too many files (${entries.length}); the zip writer supports at most ${MAX_ENTRIES}. Add excludes.`);
  const chunks = [];
  const central = [];
  let offset = 0;
  const DOS_TIME = 0, DOS_DATE = (1 << 5) | 1; // 1980-01-01 00:00, keeps the output reproducible
  for (const e of entries) {
    if (e.name.includes("\\") || e.name.startsWith("/") || e.name.split("/").includes("..")) throw new HsError("invalid", `Unsafe zip entry name: ${e.name}`);
    const data = e.data ?? fs.readFileSync(e.abs);
    const deflated = zlib.deflateRawSync(data, { level: 6 });
    const useDeflate = deflated.length < data.length;
    const body = useDeflate ? deflated : data;
    const method = useDeflate ? 8 : 0;
    const crc = zlib.crc32(data);
    const nameBuf = Buffer.from(e.name, "utf8");
    const header = Buffer.concat([u32(0x04034b50), u16(20), u16(0x0800), u16(method), u16(DOS_TIME), u16(DOS_DATE), u32(crc), u32(body.length), u32(data.length), u16(nameBuf.length), u16(0), nameBuf]);
    chunks.push(header, body);
    central.push({ nameBuf, method, crc, csize: body.length, usize: data.length, offset });
    offset += header.length + body.length;
    if (offset > MAX_BYTES) throw new HsError("invalid", "Project is larger than 4 GiB; the zip writer has no zip64 support.");
  }
  const cdStart = offset;
  let cdSize = 0;
  for (const c of central) {
    const rec = Buffer.concat([u32(0x02014b50), u16(0x031e), u16(20), u16(0x0800), u16(c.method), u16(DOS_TIME), u16(DOS_DATE), u32(c.crc), u32(c.csize), u32(c.usize), u16(c.nameBuf.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(c.offset), c.nameBuf]);
    chunks.push(rec);
    cdSize += rec.length;
  }
  chunks.push(Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(central.length), u16(central.length), u32(cdSize), u32(cdStart), u16(0)]));
  return Buffer.concat(chunks);
}

// Independent reader used by the tests (and by `hsdeploy up --dry-run` to list contents).
export function readZip(buf) {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new HsError("invalid", "Not a zip file.");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const files = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new HsError("invalid", "Corrupt central directory.");
    const method = buf.readUInt16LE(p + 10), crc = buf.readUInt32LE(p + 16), csize = buf.readUInt32LE(p + 20), usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32), lho = buf.readUInt32LE(p + 42);
    const name = buf.subarray(p + 46, p + 46 + nlen).toString("utf8");
    const lnlen = buf.readUInt16LE(lho + 26), lelen = buf.readUInt16LE(lho + 28);
    const raw = buf.subarray(lho + 30 + lnlen + lelen, lho + 30 + lnlen + lelen + csize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    if (data.length !== usize || zlib.crc32(data) !== crc) throw new HsError("invalid", `Checksum mismatch for ${name}.`);
    files.push({ name, data });
    p += 46 + nlen + elen + clen;
  }
  return files;
}
