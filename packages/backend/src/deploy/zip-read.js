// Reads an uploaded zip without trusting it. No dependency: only zlib. Everything is checked BEFORE it is used: path
// escapes (zip-slip), links and device files, encryption, zip64, duplicate names, the number and size of files, the
// compression ratio (zip bombs), declared sizes against the real ones, and every checksum.
import zlib from "node:zlib";
import { PanelError } from "../errors.js";

const EOCD = 0x06054b50, CENTRAL = 0x02014b50, LOCAL = 0x04034b50;
export const ZIP_LIMITS = Object.freeze({ maxFiles: 5000, maxTotalBytes: 300 * 1048576, maxEntryBytes: 100 * 1048576, maxRatio: 200, ratioFloorBytes: 1048576, maxPathLength: 240, maxDepth: 16 });

const bad = why => new PanelError("invalid_request", `The zip file was refused: ${why}.`);

// Returns the cleaned path and whether the entry is a folder, or throws.
export function safeEntryPath(name, limits = ZIP_LIMITS) {
  if (name.length === 0 || name.length > limits.maxPathLength) throw bad("a file name is empty or too long");
  if (name.includes("\0") || name.includes("\\")) throw bad("a file name has forbidden characters");
  if (name.startsWith("/") || /^[A-Za-z]:/.test(name)) throw bad("a file name is an absolute path");
  const isDir = name.endsWith("/");
  const parts = (isDir ? name.slice(0, -1) : name).split("/");
  if (parts.length > limits.maxDepth) throw bad("folders are nested too deeply");
  if (parts.some(part => part === "" || part === "." || part === "..")) throw bad("a file name tries to leave the folder");
  return { path: parts.join("/"), isDir };
}

const SPECIAL_MODES = new Set([0xA000, 0x1000, 0x2000, 0x6000, 0xC000]); // symlink, fifo, char, block, socket

export function readZip(buffer, overrides = {}) {
  const limits = { ...ZIP_LIMITS, ...overrides };
  if (!Buffer.isBuffer(buffer) || buffer.length < 22) throw bad("it is not a zip file");
  let end = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 22 - 65535); i--) if (buffer.readUInt32LE(i) === EOCD) { end = i; break; }
  if (end < 0) throw bad("it is not a zip file");
  const count = buffer.readUInt16LE(end + 10), centralSize = buffer.readUInt32LE(end + 12), centralOffset = buffer.readUInt32LE(end + 16);
  if (count === 0xFFFF || centralSize === 0xFFFFFFFF || centralOffset === 0xFFFFFFFF) throw bad("zip64 archives are not supported");
  if (count > limits.maxFiles) throw bad("it has too many files");
  if (centralOffset + centralSize > end) throw bad("it is damaged");

  const entries = [], seen = new Set();
  let pos = centralOffset, totalBytes = 0;
  for (let i = 0; i < count; i++) {
    if (pos + 46 > buffer.length || buffer.readUInt32LE(pos) !== CENTRAL) throw bad("it is damaged");
    const host = buffer.readUInt16LE(pos + 4) >> 8, flags = buffer.readUInt16LE(pos + 8), method = buffer.readUInt16LE(pos + 10), crc = buffer.readUInt32LE(pos + 16);
    const packed = buffer.readUInt32LE(pos + 20), size = buffer.readUInt32LE(pos + 24), nameLength = buffer.readUInt16LE(pos + 28), extraLength = buffer.readUInt16LE(pos + 30), commentLength = buffer.readUInt16LE(pos + 32);
    const attributes = buffer.readUInt32LE(pos + 38), localOffset = buffer.readUInt32LE(pos + 42);
    if (pos + 46 + nameLength > buffer.length) throw bad("it is damaged");
    const { path, isDir } = safeEntryPath(buffer.toString("utf8", pos + 46, pos + 46 + nameLength), limits);
    pos += 46 + nameLength + extraLength + commentLength;

    if (flags & 1) throw bad("encrypted files are not supported");
    if (host === 3 && SPECIAL_MODES.has((attributes >>> 16) & 0xF000)) throw bad("links and special files are not allowed");
    if (isDir) continue;
    if (method !== 0 && method !== 8) throw bad("a file uses an unsupported compression");
    const key = path.toLowerCase();
    if (seen.has(key)) throw bad("two files have the same name");
    seen.add(key);

    if (size > limits.maxEntryBytes) throw bad("a file is too large");
    totalBytes += size;
    if (totalBytes > limits.maxTotalBytes) throw bad("the unpacked size is too large");
    if (size > limits.ratioFloorBytes && (packed === 0 || size / packed > limits.maxRatio)) throw bad("a file compresses suspiciously well");

    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== LOCAL) throw bad("it is damaged");
    const start = localOffset + 30 + buffer.readUInt16LE(localOffset + 26) + buffer.readUInt16LE(localOffset + 28);
    if (start + packed > buffer.length) throw bad("it is damaged");
    const raw = buffer.subarray(start, start + packed);
    let data;
    if (method === 0) {
      if (packed !== size) throw bad("a file does not match its declared size");
      data = Buffer.from(raw);
    } else {
      try { data = zlib.inflateRawSync(raw, { maxOutputLength: size + 1 }); } catch { throw bad("a file is damaged or larger than it says"); }
    }
    if (data.length !== size) throw bad("a file does not match its declared size");
    if (zlib.crc32(data) !== crc) throw bad("a file failed its checksum");
    entries.push({ path, data });
  }
  return entries;
}

// Zips made from a folder usually wrap everything in one top-level folder: drop it so the project is at the root.
export function unwrapRoot(entries) {
  if (!entries.length) return entries;
  const first = entries[0].path.split("/")[0];
  if (!entries.every(e => e.path.includes("/") && e.path.split("/")[0] === first)) return entries;
  return entries.map(e => ({ path: e.path.slice(first.length + 1), data: e.data }));
}
