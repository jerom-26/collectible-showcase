import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { test } from "node:test";
import { transpileModule, ModuleKind } from "typescript";

const source = readFileSync(
  new URL("../lib/nft-media.ts", import.meta.url),
  "utf8",
);

const { outputText } = transpileModule(source, {
  compilerOptions: {
    module: ModuleKind.ESNext,
    target: 9,
  },
});

let moduleId = 0;

const asset = (id, image = true) => ({
  assetId: id,
  name: id,
  imageUrl: image ? `https://media.test/${id}.jpg` : null,
  videoUrl: `https://media.test/${id}.mp4`,
});

const tick = async () => {
  for (let i = 0; i < 8; i++) {
    await Promise.resolve();
  }
};

async function harness(t, storage = new Map()) {
  const images = [];
  const videos = [];
  const timers = new Map();
  const handles = [];

  let timerId = 0;

  const flags = {
    reduced: false,
    canvas: true,
    storage: true,
  };

  const globals = [
    "Image",
    "document",
    "matchMedia",
    "sessionStorage",
    "setTimeout",
    "clearTimeout",
  ];

  const original = new Map(
    globals.map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );

  globalThis.setTimeout = (callback, delay) => {
    const id = ++timerId;

    timers.set(id, {
      callback,
      delay,
    });

    return id;
  };

  globalThis.clearTimeout = (id) => {
    timers.delete(id);
  };

  globalThis.matchMedia = () => ({
    matches: flags.reduced,
    addEventListener() {},
    removeEventListener() {},
  });

  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value: {
      getItem: (key) => storage.get(key),

      setItem: (key, value) => {
        if (!flags.storage) {
          throw new Error("Quota exceeded");
        }

        storage.set(key, value);
      },
    },
  });

  globalThis.Image = class {
    constructor() {
      images.push(this);
    }

    set src(value) {
      this.url = value;

      if (value.startsWith("data:")) {
        queueMicrotask(() => this.onload?.());
      }
    }

    get src() {
      return this.url;
    }

    removeAttribute() {
      this.url = "";
    }
  };

  globalThis.document = {
    hidden: false,

    addEventListener() {},
    removeEventListener() {},

    createElement(tag) {
      if (tag === "canvas") {
        return {
          getContext: () =>
            flags.canvas
              ? {
                  drawImage() {},
                }
              : null,

          toDataURL: () => "data:image/jpeg;base64,frame",
        };
      }

      const video = {
        paused: true,

        readyState: 0,

        videoWidth: 0,
        videoHeight: 0,

        duration: 5,
        currentTime: 0,

        _bufferedEnd: 0,

        get buffered() {
          if (this._bufferedEnd <= 0) {
            return {
              length: 0,
              start: () => 0,
              end: () => 0,
            };
          }

          return {
            length: 1,
            start: () => 0,
            end: () => this._bufferedEnd,
          };
        },

        setAttribute() {},

        removeAttribute(name) {
          if (name === "src") {
            this.src = "";
          }
        },

        load() {},

        remove() {},

        pause() {
          this.paused = true;
        },

        play() {
          this.paused = false;
          return Promise.resolve();
        },
      };

      videos.push(video);

      return video;
    },
  };

  const { acquireMedia } = await import(
    `data:text/javascript;base64,${Buffer.from(outputText).toString(
      "base64",
    )}#${moduleId++}`
  );

  t.after(async () => {
    handles.forEach((handle) => {
      handle.release();
    });

    await tick();

    const outstanding = timers.size;

    for (const [key, descriptor] of original) {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor);
      } else {
        delete globalThis[key];
      }
    }

    assert.equal(outstanding, 0, "unmount clears all request deadlines");
  });

  return {
    images,
    videos,
    timers,
    flags,
    storage,

    acquire(
      item,
      options = {
        priority: 2,
        animate: false,
      },
    ) {
      let state;

      const handle = acquireMedia(item, options, (next) => {
        state = next;
      });

      handles.push(handle);

      return {
        handle,

        get state() {
          return state;
        },
      };
    },

    frame(video, bufferedEnd = 2.5) {
      Object.assign(video, {
        readyState: 3,
        videoWidth: 700,
        videoHeight: 1000,
        duration: 5,
        _bufferedEnd: bufferedEnd,
      });

      video.onloadeddata?.();
      video.onprogress?.();
    },

    progress(video, bufferedEnd) {
      video._bufferedEnd = bufferedEnd;
      video.readyState = 3;
      video.onprogress?.();
    },

    expire(delay) {
      const timer = [...timers.entries()].find(
        ([, value]) => value.delay === delay,
      );

      assert.ok(timer, `expected ${delay}ms deadline`);

      timers.delete(timer[0]);

      timer[1].callback();
    },
  };
}

test("seven posters load without downloading seven videos; the featured animation starts after its poster", async (t) => {
  const h = await harness(t);

  const items = Array.from({ length: 7 }, (_, i) =>
    h.acquire(asset(String(i)), {
      priority: i ? 1 : 0,
      animate: i === 0,
    }),
  );

  await tick();

  assert.equal(h.images.length, 4);

  assert.equal(h.videos.length, 0);

  for (let i = 0; i < 7; i++) {
    h.images[i].onload();

    await tick();
  }

  assert.ok(items.every((item) => item.state.image));

  assert.equal(h.videos.length, 1, "only the selected NFT downloads a video");

  assert.equal(items[0].state.videoReady, false);

  h.frame(h.videos[0], 2.5);

  await tick();

  assert.equal(items[0].state.videoReady, true);

  h.videos[0].onerror();

  await tick();

  assert.ok(items[0].state.image, "playback failure preserves the poster");

  assert.equal(items[0].state.failed, false);
});

test("selected video waits for useful buffering before replacing the poster", async (t) => {
  const h = await harness(t);

  const item = h.acquire(asset("buffer-test"), {
    priority: 0,
    animate: true,
  });

  await tick();

  h.images[0].onload();

  await tick();

  assert.equal(h.videos.length, 1);

  h.frame(h.videos[0], 0.5);

  await tick();

  assert.equal(
    item.state.videoReady,
    false,
    "a first frame is not enough to expose the video",
  );

  assert.ok(item.state.image, "poster remains visible while video buffers");

  h.progress(h.videos[0], 2.5);

  await tick();

  assert.equal(
    item.state.videoReady,
    true,
    "video becomes ready after enough media is buffered",
  );
});

test("video-only thumbnails capture the first frame and stop background transfers", async (t) => {
  const h = await harness(t);

  const items = Array.from({ length: 7 }, (_, i) =>
    h.acquire(asset(`video-${i}`, false)),
  );

  await tick();

  assert.equal(h.videos.length, 2);

  h.videos[0].onloadeddata();

  assert.equal(items[0].state.image, null, "metadata alone is insufficient");

  h.frame(h.videos[0], 2.5);

  await tick();

  assert.ok(
    items[0].state.image,
    "the first usable frame supplies a thumbnail",
  );

  assert.equal(
    h.videos[0].src,
    "",
    "thumbnail extraction cancels unnecessary background transfer",
  );

  assert.equal(h.videos.length, 3, "the next thumbnail starts immediately");

  assert.ok(h.storage.get("nft-posters-v1"));
});

test("a stalled video frees its queue slot and late events are ignored", async (t) => {
  const h = await harness(t);

  const first = h.acquire(asset("stalled", false));

  h.acquire(asset("second", false));

  h.acquire(asset("third", false));

  await tick();

  const lateFrame = h.videos[0].onloadeddata;

  h.expire(20_000);

  await tick();

  assert.equal(first.state.failed, true);

  assert.equal(h.videos.length, 3);

  Object.assign(h.videos[0], {
    readyState: 3,
    videoWidth: 700,
    videoHeight: 1000,
    _bufferedEnd: 2.5,
  });

  lateFrame();

  await tick();

  assert.equal(first.state.failed, true);

  assert.equal(first.state.image, null);
});

test("image requests respect priority and stalled images fall back to video", async (t) => {
  const h = await harness(t);

  for (let i = 0; i < 8; i++) {
    h.acquire(asset(`image-${i}`), {
      priority: i === 7 ? 0 : 2,

      animate: false,
    });
  }

  await tick();

  assert.equal(h.images.length, 4);

  assert.equal(h.images[0].src, "https://media.test/image-7.jpg");

  h.expire(15_000);

  await tick();

  assert.equal(h.images.length, 5);

  assert.equal(h.videos[0].src, "https://media.test/image-7.mp4");
});

test("different mints share one media request and stay alive until the last consumer releases", async (t) => {
  const h = await harness(t);

  const first = h.acquire(asset("shared"));

  const second = h.acquire({
    ...asset("shared"),
    assetId: "another-mint",
  });

  await tick();

  assert.equal(h.images.length, 1);

  first.handle.release();

  await tick();

  h.images[0].onload();

  await tick();

  assert.ok(second.state.image);

  assert.equal(h.videos.length, 0);
});

test("new selections preempt a stalled background video", async (t) => {
  const h = await harness(t);

  h.acquire(asset("background-a", false));

  h.acquire(asset("background-b", false));

  await tick();

  const selected = h.acquire(asset("urgent", false), {
    priority: 0,
    animate: true,
  });

  await tick();

  assert.equal(h.videos.length, 3);

  assert.equal(h.videos[1].src, "");

  assert.equal(h.videos[2].src, "https://media.test/urgent.mp4");

  h.frame(h.videos[2], 2.5);

  await tick();

  assert.equal(selected.state.videoReady, true);
});

test("changing selection pauses the old video and revisiting reuses the decoder", async (t) => {
  const h = await harness(t);

  const item = h.acquire(asset("switch"), {
    priority: 0,
    animate: true,
  });

  await tick();

  h.images[0].onload();

  await tick();

  h.frame(h.videos[0], 2.5);

  await tick();

  const originalVideo = h.videos[0];

  assert.equal(item.state.videoReady, true);

  item.handle.update({
    priority: 1,
    animate: false,
  });

  await tick();

  assert.equal(originalVideo.paused, true);

  assert.equal(
    originalVideo.src,
    "https://media.test/switch.mp4",
    "deselection must not discard the buffered video",
  );

  item.handle.update({
    priority: 0,
    animate: true,
  });

  await tick();

  assert.equal(
    h.videos.length,
    1,
    "revisiting must reuse the existing video element",
  );

  assert.equal(item.state.video, originalVideo);

  assert.equal(originalVideo.paused, false);

  h.flags.reduced = true;

  item.handle.update({
    priority: 0,
    animate: true,
  });

  await tick();

  assert.equal(originalVideo.paused, true);

  h.flags.reduced = false;
  document.hidden = true;

  item.handle.update({
    priority: 0,
    animate: true,
  });

  await tick();

  assert.equal(originalVideo.paused, true);
});

test("buffering after playback falls back to the poster without destroying the player", async (t) => {
  const h = await harness(t);

  const item = h.acquire(asset("stall-after-ready"), {
    priority: 0,
    animate: true,
  });

  await tick();

  h.images[0].onload();

  await tick();

  h.frame(h.videos[0], 2.5);

  await tick();

  const video = h.videos[0];

  assert.equal(item.state.videoReady, true);

  video.onwaiting?.();

  await tick();

  assert.equal(
    item.state.videoReady,
    false,
    "poster should be used while playback is buffering",
  );

  assert.equal(
    item.state.video,
    video,
    "buffering must not destroy the video player",
  );

  assert.ok(item.state.image, "poster remains available during buffering");

  h.progress(video, 3);

  await tick();

  assert.equal(
    item.state.videoReady,
    true,
    "video can resume after its buffer recovers",
  );

  assert.equal(
    item.state.video,
    video,
    "the same player is reused after recovery",
  );
});

test("session-cached posters display without video requests after reload", async (t) => {
  const item = asset("cached", false);

  const storage = new Map([
    [
      "nft-posters-v1",
      JSON.stringify([[item.videoUrl, "data:image/jpeg;base64,frame"]]),
    ],
  ]);

  const h = await harness(t, storage);

  const loaded = h.acquire(item);

  await tick();

  assert.ok(loaded.state.image);

  assert.equal(h.videos.length, 0);
});

test("storage quota errors do not prevent first-frame thumbnails", async (t) => {
  const h = await harness(t);

  h.flags.storage = false;

  const item = h.acquire(asset("quota", false));

  await tick();

  h.frame(h.videos[0], 2.5);

  await tick();

  assert.ok(item.state.image);
});

test("canvas failure does not leave static thumbnails permanently loading", async (t) => {
  const h = await harness(t);

  h.flags.canvas = false;

  const item = h.acquire(asset("no-canvas", false));

  await tick();

  h.frame(h.videos[0], 2.5);

  await tick();

  assert.equal(item.state.failed, true);
});

test("published poster manifest references small, real JPEG files", () => {
  const manifest = JSON.parse(
    readFileSync(new URL("../lib/nft-posters.json", import.meta.url), "utf8"),
  );

  assert.ok(Object.keys(manifest).length >= 7);

  for (const [video, path] of Object.entries(manifest)) {
    assert.ok(video.startsWith("https://"));

    assert.match(path, /^\/nft-posters\/[a-f0-9]{20}\.jpg$/);

    const image = readFileSync(new URL(`../public${path}`, import.meta.url));

    assert.equal(image.readUInt16BE(0), 0xffd8);

    assert.ok(image.length < 150_000);
  }
});
