// Downloads phyce's RuneLite install-count SQL dump from the Google Drive
// link he shared, decompresses/extracts it if needed, and leaves a plain
// .sql file ready for `npm run import:phyce -- <path>`.
//
// Usage: tsx src/fetch-phyce-dump.ts [driveUrlOrFileId] [outDir]
import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import zlib from "zlib";
import { pipeline } from "stream/promises";
import type { ReadableStream as NodeReadableStream } from "stream/web";
import { Readable } from "stream";

const DEFAULT_DRIVE_URL = "https://drive.google.com/file/d/17kfTVs015Nrbxduy6F6OPMmx0rc2SjcB/view";

function extractFileId(urlOrId: string): string {
  const match = urlOrId.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : urlOrId;
}

// Google Drive serves small files straight away, but anything past ~100MB
// (this dump is a couple GB) gets an interstitial "can't scan this file for
// viruses" HTML page instead -- the real download needs the confirm token
// and uuid buried in that page's form, replayed against a second host.
async function downloadFromDrive(fileId: string, destPath: string): Promise<void> {
  const first = await fetch(`https://drive.google.com/uc?export=download&id=${fileId}`);
  const contentType = first.headers.get("content-type") ?? "";

  if (!contentType.includes("text/html")) {
    await pipeline(Readable.fromWeb(first.body as NodeReadableStream), fs.createWriteStream(destPath));
    return;
  }

  const html = await first.text();
  const confirm = html.match(/name="confirm"\s+value="([^"]+)"/)?.[1];
  const uuid = html.match(/name="uuid"\s+value="([^"]+)"/)?.[1];
  if (!confirm || !uuid) {
    throw new Error("couldn't find the confirm/uuid fields on Google Drive's interstitial page -- its format may have changed");
  }
  const cookie = (first.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");

  const second = await fetch(
    `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${confirm}&uuid=${uuid}`,
    { headers: cookie ? { cookie } : {} },
  );
  if (!second.ok || !second.body) throw new Error(`download failed: HTTP ${second.status}`);
  await pipeline(Readable.fromWeb(second.body as NodeReadableStream), fs.createWriteStream(destPath));
}

function sniffFormat(filePath: string): "gzip" | "zip" | "tar" | "plain" {
  const fd = fs.openSync(filePath, "r");
  const buf = Buffer.alloc(263);
  fs.readSync(fd, buf, 0, buf.length, 0);
  fs.closeSync(fd);
  if (buf[0] === 0x1f && buf[1] === 0x8b) return "gzip";
  if (buf[0] === 0x50 && buf[1] === 0x4b) return "zip";
  if (buf.toString("utf8", 257, 262) === "ustar") return "tar";
  return "plain";
}

async function gunzip(src: string, dest: string): Promise<void> {
  await pipeline(fs.createReadStream(src), zlib.createGunzip(), fs.createWriteStream(dest));
}

// `tar.gz` and plain `tar` both show up in the wild for dumps this size --
// gunzip only strips the outer gzip layer, so what's left can itself be a
// tar archive wrapping the real .sql file.
//
// On Windows, the `tar` found via PATH in a bash-style shell is usually
// MSYS2/GNU tar, which misreads a `D:\...` path as `host:path` remote-archive
// syntax ("Cannot connect to D:"). Windows' own bundled tar.exe (bsdtar,
// System32) handles drive letters fine, so use that one explicitly there.
function untar(src: string, destDir: string): string {
  const tarBin = process.platform === "win32" ? path.join(process.env.SystemRoot ?? "C:\\Windows", "System32", "tar.exe") : "tar";
  execFileSync(tarBin, ["-xf", src, "-C", destDir], { stdio: "inherit" });
  const sqlFile = fs.readdirSync(destDir).find((f) => f.endsWith(".sql"));
  if (!sqlFile) throw new Error(`extracted tar ${src} but found no .sql file inside`);
  return path.join(destDir, sqlFile);
}

function unzip(src: string, destDir: string): string {
  try {
    execFileSync("unzip", ["-o", src, "-d", destDir], { stdio: "inherit" });
  } catch {
    if (process.platform === "win32") {
      execFileSync(
        "powershell",
        ["-NoProfile", "-Command", `Expand-Archive -Path '${src}' -DestinationPath '${destDir}' -Force`],
        { stdio: "inherit" },
      );
    } else {
      throw new Error("no `unzip` available and this isn't Windows -- install unzip and retry");
    }
  }
  const sqlFile = fs.readdirSync(destDir).find((f) => f.endsWith(".sql"));
  if (!sqlFile) throw new Error(`extracted ${destDir} but found no .sql file inside`);
  return path.join(destDir, sqlFile);
}

async function main() {
  const arg = process.argv[2] ?? DEFAULT_DRIVE_URL;
  const outDir = process.argv[3] ?? path.join(__dirname, "..", "tmp");
  const fileId = extractFileId(arg);

  fs.mkdirSync(outDir, { recursive: true });
  const rawPath = path.join(outDir, "phyce-dump.download");

  console.log(`downloading from Google Drive (file id ${fileId})...`);
  await downloadFromDrive(fileId, rawPath);
  const { size } = fs.statSync(rawPath);
  console.log(`  downloaded ${(size / 1024 / 1024).toFixed(1)} MB`);

  let currentPath = rawPath;
  let format = sniffFormat(currentPath);

  if (format === "gzip") {
    console.log("decompressing gzip...");
    const gunzipped = path.join(outDir, "phyce-dump.gunzipped");
    await gunzip(currentPath, gunzipped);
    fs.rmSync(currentPath);
    currentPath = gunzipped;
    format = sniffFormat(currentPath);
  }

  let sqlPath: string;
  if (format === "tar") {
    console.log("extracting tar...");
    sqlPath = untar(currentPath, outDir);
    fs.rmSync(currentPath);
  } else if (format === "zip") {
    console.log("extracting zip...");
    sqlPath = unzip(currentPath, outDir);
    fs.rmSync(currentPath);
  } else {
    sqlPath = path.join(outDir, "phyce-dump.sql");
    if (currentPath !== sqlPath) fs.renameSync(currentPath, sqlPath);
  }

  console.log(`\nready: ${sqlPath}`);
  console.log(`next: npm run import:phyce -w @rspluginpulse/ingest -- ${sqlPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
