import test from "node:test";
import assert from "node:assert/strict";
import zlib from "node:zlib";
import { readZip, safeEntryPath, unwrapRoot } from "../src/deploy/zip-read.js";
import { makeZip } from "./zip-helpers.js";

const refused = (buffer, pattern, limits) => assert.throws(() => readZip(buffer, limits), e => e.code === "invalid_request" && pattern.test(e.message), String(pattern));

test("an honest zip is read back byte for byte, folders skipped, stored and deflated entries both", () => {
  const zip = makeZip([{ name: "site/", data: "", method: 0 }, { name: "site/index.html", data: "<h1>hi</h1>" }, { name: "site/a/b.txt", data: "stored", method: 0 }, { name: "site/empty.txt", data: "" }]);
  const entries = readZip(zip);
  assert.deepEqual(entries.map(e => [e.path, e.data.toString()]), [["site/index.html", "<h1>hi</h1>"], ["site/a/b.txt", "stored"], ["site/empty.txt", ""]]);
  assert.deepEqual(unwrapRoot(entries).map(e => e.path), ["index.html", "a/b.txt", "empty.txt"]);
  assert.deepEqual(unwrapRoot([{ path: "a/x" }, { path: "b/y" }]).map(e => e.path), ["a/x", "b/y"], "two top-level folders stay as they are");
  assert.deepEqual(unwrapRoot([{ path: "index.html" }, { path: "a/x" }]).map(e => e.path), ["index.html", "a/x"], "a file at the top keeps the layout");
});

test("path tricks are refused: zip-slip, absolute paths, drive letters, backslashes, NUL, dots, empty parts, depth, length", () => {
  for (const name of ["../evil.sh", "a/../../evil", "/etc/passwd", "C:/Windows/x", "a\\b.txt", "a\0b", "./a", "a//b", "a/./b", `${"d/".repeat(20)}f`, `${"x".repeat(300)}`]) {
    refused(makeZip([{ name, data: "x" }]), /file name|nested|too long|forbidden|leave/, undefined);
  }
  assert.equal(safeEntryPath("ok/dir/").isDir, true);
  assert.equal(safeEntryPath("ok/file.txt").path, "ok/file.txt");
});

test("links and special files, encryption and unsupported methods are refused", () => {
  refused(makeZip([{ name: "link", data: "/etc/passwd", mode: 0o120777 }]), /links/);
  refused(makeZip([{ name: "fifo", data: "", mode: 0o010644 }]), /links/);
  refused(makeZip([{ name: "secret.txt", data: "x", flags: 1 }]), /encrypted/);
  refused(makeZip([{ name: "a.txt", data: "x", method: 12 }]), /compression/);
  const windows = makeZip([{ name: "from-windows.txt", data: "x", host: 0, mode: 0o120777 }]);
  assert.equal(readZip(windows).length, 1, "the Unix mode bits only count when the archive says it was made on Unix");
});

test("sizes are checked before and after unpacking: the file count, one file, the total, and lies in the header", () => {
  refused(makeZip([{ name: "a", data: "1" }, { name: "b", data: "2" }]), /too many files/, { maxFiles: 1 });
  refused(makeZip([{ name: "big", data: Buffer.alloc(2000, 1) }]), /too large/, { maxEntryBytes: 1000 });
  refused(makeZip([{ name: "a", data: Buffer.alloc(600, 1) }, { name: "b", data: Buffer.alloc(600, 2) }]), /unpacked size/, { maxTotalBytes: 1000 });
  refused(makeZip([{ name: "lie", data: "hello world, this is longer", size: 5 }]), /damaged or larger|declared size/);
  refused(makeZip([{ name: "lie", data: "hello", size: 500 }]), /declared size/);
  refused(makeZip([{ name: "stored-lie", data: "hello", method: 0, size: 3 }]), /declared size/);
});

test("a zip bomb is refused by its compression ratio before anything is unpacked", () => {
  const bomb = makeZip([{ name: "zeros.bin", data: Buffer.alloc(3 * 1048576) }]);
  assert.ok(bomb.length < 10_000, "the bomb itself is tiny");
  refused(bomb, /suspiciously well/);
  assert.equal(readZip(makeZip([{ name: "small-zeros.bin", data: Buffer.alloc(100_000) }])).length, 1, "small and well compressed is fine");
});

test("checksums, duplicate names (any case) and damage are caught", () => {
  refused(makeZip([{ name: "a.txt", data: "hello", crc: 123 }]), /checksum/);
  refused(makeZip([{ name: "a.txt", data: "1" }, { name: "A.TXT", data: "2" }]), /same name/);
  refused(makeZip([{ name: "a.txt", data: "hello world", packed: Buffer.from([1, 2, 3, 4, 5]) , size: 11 }]), /damaged/);
  const good = makeZip([{ name: "a.txt", data: "hello" }]);
  refused(good.subarray(0, good.length - 5), /not a zip|damaged/);
  refused(Buffer.from("this is not a zip file at all, just text"), /not a zip/);
  refused(Buffer.alloc(0), /not a zip/);
  refused("a string", /not a zip/);
  const broken = Buffer.from(good);
  broken.writeUInt32LE(0xdeadbeef, broken.length - 22 + 16); // central directory offset points nowhere
  refused(broken, /damaged/);
});

test("zip64 markers are refused, not misread", () => {
  const zip = Buffer.from(makeZip([{ name: "a.txt", data: "x" }]));
  zip.writeUInt16LE(0xFFFF, zip.length - 22 + 10);
  refused(zip, /zip64/);
});

test("a gigantic declared size never allocates: inflate is capped at the declared size", () => {
  const body = zlib.deflateRawSync(Buffer.alloc(50_000, 7));
  refused(makeZip([{ name: "x.bin", data: Buffer.alloc(50_000, 7), packed: body, size: 10 }]), /damaged or larger|declared size/);
});
