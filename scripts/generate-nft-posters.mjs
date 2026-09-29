import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile, access } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// FFMPEG_PATH=/path/to/ffmpeg npm run media:posters -- account [site-origin]
// Run before deployment to give every mint of these videos a same-origin poster.
const [account, origin = "https://collectible-showcase.itsjj.workers.dev"] = process.argv.slice(2);
if (!account || !/^[a-z1-5.]{1,12}$/.test(account)) throw new Error("Supply a WAX account name.");
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";
const root = new URL("../", import.meta.url);
const manifestPath = new URL("lib/nft-posters.json", root);
const posterDir = new URL("public/nft-posters/", root);
const workDir = new URL("work/poster-videos/", root);
await mkdir(posterDir, { recursive: true });
await mkdir(workDir, { recursive: true });
let manifest = {};
try { manifest = JSON.parse(await readFile(manifestPath, "utf8")); }
catch (error) { if (error.code !== "ENOENT") throw error; }
const response = await fetch(`${origin}/api/wax-assets?account=${encodeURIComponent(account)}`, { signal: AbortSignal.timeout(20000) });
if (!response.ok) throw new Error(`Collection lookup failed: ${response.status}`);
const { assets } = await response.json();
for (const asset of assets) {
  if (!asset.videoUrl || (asset.imageUrl && !asset.imageUrl.startsWith("/nft-posters/"))) continue;
  const hash = createHash("sha256").update(asset.videoUrl).digest("hex").slice(0, 20);
  const filename = `${hash}.jpg`;
  const output = new URL(filename, posterDir);
  let exists = false;
  try { await access(output); exists = true; } catch { /* Generate missing posters. */ }
  if (!exists) {
    const video = new URL(`${hash}.mp4`, workDir);
    const media = await fetch(asset.videoUrl, { signal: AbortSignal.timeout(90000) });
    if (!media.ok) throw new Error(`Video download failed: ${media.status} (${asset.name})`);
    await writeFile(video, Buffer.from(await media.arrayBuffer()));
    const result = spawnSync(ffmpeg, ["-hide_banner", "-loglevel", "error", "-y", "-i", fileURLToPath(video), "-ss", "0.25", "-frames:v", "1", "-vf", "scale=640:-2", "-q:v", "3", fileURLToPath(output)], { stdio: "inherit", timeout: 30000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Poster extraction failed: ${asset.name}`);
  }
  manifest[asset.videoUrl] = `/nft-posters/${filename}`;
  console.log(`${asset.name}: ${manifest[asset.videoUrl]}`);
}
await writeFile(manifestPath, JSON.stringify(Object.fromEntries(Object.entries(manifest).sort()), null, 2) + "\n");
