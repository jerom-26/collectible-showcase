import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { transpileModule, ModuleKind } from 'typescript';

// Exercise the resource scheduler with deterministic media events (no gateway).
const images = [], videos = [];
let mobile = true, reduced = false;
globalThis.matchMedia = query => ({ matches: query.includes('reduced-motion') ? reduced : mobile, addEventListener() {}, removeEventListener() {} });
globalThis.Image = class {
  constructor() { images.push(this); }
  removeAttribute() {}
};
globalThis.document = {
  hidden: false, addEventListener() {}, removeEventListener() {},
  createElement(tag) {
    if (tag === 'canvas') return { getContext: () => ({ drawImage() {} }), toDataURL: () => 'data:image/jpeg;base64,frame' };
    const video = { paused: true, readyState: 0, videoWidth: 0, videoHeight: 0,
      setAttribute() {}, removeAttribute() {}, load() {}, remove() {},
      pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); } };
    videos.push(video);
    return video;
  },
};
const source = readFileSync(new URL('../lib/nft-media.ts', import.meta.url), 'utf8');
const { outputText } = transpileModule(source, { compilerOptions: { module: ModuleKind.ESNext, target: 9 } });
const { acquireMedia } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const tick = async () => { await Promise.resolve(); await Promise.resolve(); };
const asset = id => ({ assetId: id, name: id, imageUrl: `https://gateway.test/${id}.jpg`, videoUrl: `https://gateway.test/${id}.mp4` });
const frame = video => { video.readyState = 2; video.videoWidth = 700; video.videoHeight = 1000; video.onloadeddata?.(); };

let state;
const item = asset('featured');
const room = acquireMedia(item, { priority: 0, animate: true }, next => { state = next; });
const detail = acquireMedia(item, { priority: 0, animate: true }, () => {});
const thumb = acquireMedia(item, { priority: 2, animate: false }, () => {});
await tick();
assert.equal(images.length, 1);
assert.equal(videos.length, 1, 'room and details share one decoder');
assert.equal(state.failed, false, 'pending is not failure');
images[0].onload();
assert.equal(state.image, images[0], 'image is available before video');
assert.equal(state.videoReady, false);
videos[0].onloadeddata();
assert.equal(state.videoReady, false, 'metadata/empty frame must not replace image');
frame(videos[0]);
await tick();
assert.equal(state.videoReady, true);
assert.equal(state.image, images[0], 'poster retained after video arrives');
assert.equal(videos[0].paused, false);
videos[0].onerror();
assert.equal(state.failed, false, 'video error retains successful image');
assert.equal(state.videoReady, false);
room.release(); detail.release(); thumb.release(); await tick();

let fallback;
const broken = acquireMedia(asset('fallback'), { priority: 2, animate: false }, next => { fallback = next; });
await tick();
const before = videos.length;
assert.equal(before, 1, 'static thumbnails do not load video');
images.at(-1).onerror(); await tick();
assert.equal(fallback.failed, false, 'image failure waits for video fallback');
frame(videos.at(-1)); await tick();
assert.ok(fallback.still, 'video-only fallback supplies static thumbnail');
assert.equal(videos.at(-1).paused, true);
broken.release(); await tick();

let failed;
const both = acquireMedia(asset('both-fail'), { priority: 0, animate: true }, next => { failed = next; });
await tick();
images.at(-1).onerror();
assert.equal(failed.failed, false);
videos.at(-1).onerror();
assert.equal(failed.failed, true, 'unavailable only after both fail');
both.release(); await tick();

const orderStart = images.length;
const handles = Array.from({ length: 8 }, (_, i) => acquireMedia(asset(`queue-${i}`), { priority: i === 7 ? 0 : i < 6 ? 1 : 2, animate: i !== 6 }, () => {}));
await tick();
assert.equal(images[orderStart].src, 'https://gateway.test/queue-7.jpg', 'featured image starts first');
assert.equal(images.length - orderStart, 4, 'image concurrency bounded');
assert.equal(videos.at(-2).src, 'https://gateway.test/queue-7.mp4', 'featured video starts first');
const initialVideos = videos.length;
assert.equal(videos.at(-1).src, 'https://gateway.test/queue-0.mp4');
frame(videos.at(-2)); frame(videos.at(-1)); await tick();
assert.ok(videos.length > initialVideos, 'next visible videos start after first frames');
frame(videos.at(-2)); frame(videos.at(-1)); await tick();
assert.ok(videos.filter(v => !v.paused).length <= 2, 'phone playback capped at two');
handles.forEach(h => h.release()); await tick();
assert.equal(videos.filter(v => !v.paused).length, 0, 'cleanup pauses every decoder');

const slowA = acquireMedia(asset('slow-a'), { priority: 1, animate: true }, () => {});
const slowB = acquireMedia(asset('slow-b'), { priority: 1, animate: true }, () => {});
await tick();
let urgent;
const selected = acquireMedia(asset('new-selection'), { priority: 0, animate: true }, next => { urgent = next; });
await tick();
assert.equal(videos.at(-1).src, 'https://gateway.test/new-selection.mp4', 'selection preempts a slow background download');
assert.equal(urgent.failed, false, 'a slow image or video never triggers unavailability');
frame(videos.at(-1)); await tick();
reduced = true;
selected.update({ priority: 0, animate: true }); await tick();
assert.equal(videos.filter(v => !v.paused).length, 0, 'reduced motion pauses playback');
reduced = false;
document.hidden = true;
selected.update({ priority: 0, animate: true }); await tick();
assert.equal(videos.filter(v => !v.paused).length, 0, 'background tab pauses playback');
slowA.release(); slowB.release(); selected.release(); await tick();
document.hidden = false;
console.log('NFT media tests passed: poster-first, deduplication, failure recovery, priority, concurrency, phone playback, cleanup.');
