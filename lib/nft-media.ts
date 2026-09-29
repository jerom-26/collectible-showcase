import type { ShowcaseAsset } from "./collection";

type Status = "queued" | "loading" | "ready" | "failed";
export type MediaState = {
  image: HTMLImageElement | null;
  video: HTMLVideoElement | null;
  videoReady: boolean;
  still: string | null;
  failed: boolean;
};
type Consumer = {
  priority: number;
  animate: boolean;
  notify: (state: MediaState) => void;
};
type Entry = {
  asset: ShowcaseAsset;
  consumers: Set<Consumer>;
  imageStatus: Status;
  videoStatus: Status;
  state: MediaState;
  disposed: boolean;
  cancelImage?: () => void;
  cancelVideo?: () => void;
};

const entries = new Map<string, Entry>();
const POSTER_CACHE_KEY = "nft-posters-v1";
const MAX_POSTERS = 24;
let posterCache: Map<string, string> | undefined;
let scheduled = false;
let removeListeners: (() => void) | undefined;
const priority = (entry: Entry) => Math.min(...Array.from(entry.consumers, c => c.priority));
const wantsAnimation = (entry: Entry) => Array.from(entry.consumers).some(c => c.animate);

// Small generated posters survive account changes and reloads in this tab.
// Storage being disabled or full must never prevent artwork from displaying.
function cachedPosters() {
  if (!posterCache) {
    posterCache = new Map();
    try {
      const saved: unknown = JSON.parse(sessionStorage.getItem(POSTER_CACHE_KEY) || "[]");
      if (Array.isArray(saved)) {
        for (const pair of saved.slice(-MAX_POSTERS)) {
          if (Array.isArray(pair) && typeof pair[0] === "string" && typeof pair[1] === "string" && pair[1].startsWith("data:image/jpeg;") && pair[1].length < 512_000) {
            posterCache.set(pair[0], pair[1]);
          }
        }
      }
    } catch { /* Private browsing can disable storage. */ }
  }
  return posterCache;
}

function rememberPoster(entry: Entry) {
  if (!entry.asset.videoUrl || !entry.state.still) return;
  const cache = cachedPosters();
  cache.delete(entry.asset.videoUrl);
  cache.set(entry.asset.videoUrl, entry.state.still);
  while (cache.size > MAX_POSTERS) cache.delete(cache.keys().next().value!);
  try { sessionStorage.setItem(POSTER_CACHE_KEY, JSON.stringify([...cache])); }
  catch { /* The in-memory cache still works when the storage quota is full. */ }
}

function notify(entry: Entry) {
  entry.state.failed = entry.imageStatus === "failed" && entry.videoStatus === "failed";
  entry.consumers.forEach(c => c.notify({
    ...entry.state,
    image: entry.imageStatus === "ready" ? entry.state.image : null,
  }));
}

function stopVideo(entry: Entry) {
  entry.cancelVideo?.();
  entry.cancelVideo = undefined;
  const video = entry.state.video;
  if (video) {
    video.onloadeddata = null;
    video.oncanplay = null;
    video.onerror = null;
    video.pause();
    video.removeAttribute("src");
    video.load();
    video.remove();
  }
  entry.state.video = null;
  entry.state.videoReady = false;
}

function syncPlayback() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const featured = Array.from(entries.values())
    .filter(entry => entry.state.videoReady && wantsAnimation(entry))
    .sort((a, b) => priority(a) - priority(b))[0];
  entries.forEach(entry => {
    const video = entry.state.video;
    if (!video) return;
    if (document.hidden || reduced || entry !== featured) video.pause();
    else if (video.paused) void video.play().catch(() => { /* Keep the poster. */ });
  });
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  queueMicrotask(() => {
    scheduled = false;
    const ordered = Array.from(entries.values())
      .filter(entry => entry.consumers.size && !entry.disposed)
      .sort((a, b) => priority(a) - priority(b));
    let images = ordered.filter(entry => entry.imageStatus === "loading").length;
    for (const entry of ordered) {
      if (entry.imageStatus === "queued" && images < 4) {
        images++;
        loadImage(entry, entry.state.still || entry.asset.imageUrl!);
      }
      // Thumbnails need only a poster. Cancel background video transfers once
      // a still exists, including when the user selects a different NFT.
      if (entry.state.video && !wantsAnimation(entry) && (entry.imageStatus === "ready" || entry.state.still)) {
        stopVideo(entry);
        entry.videoStatus = "queued";
        notify(entry);
      }
    }
    let videos = ordered.filter(entry => entry.videoStatus === "loading").length;
    if (videos >= 2 && ordered.some(entry => priority(entry) === 0 && wantsAnimation(entry) && entry.videoStatus === "queued" && (entry.imageStatus === "ready" || entry.imageStatus === "failed"))) {
      const background = ordered.slice().reverse().find(entry => entry.videoStatus === "loading" && priority(entry) > 0);
      if (background) {
        stopVideo(background);
        background.videoStatus = "queued";
        notify(background);
        videos--;
      }
    }
    for (const entry of ordered) {
      const needsPoster = entry.imageStatus === "failed" && !entry.state.still;
      const canAnimate = wantsAnimation(entry) && (entry.imageStatus === "ready" || entry.imageStatus === "failed");
      if (entry.videoStatus === "queued" && videos < 2 && (needsPoster || canAnimate)) {
        videos++;
        loadVideo(entry);
      }
    }
    syncPlayback();
  });
}

function loadImage(entry: Entry, url: string) {
  entry.cancelImage?.();
  entry.imageStatus = "loading";
  const image = new Image();
  entry.state.image = image;
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.fetchPriority = priority(entry) === 0 ? "high" : "auto";
  const cancel = () => {
    clearTimeout(timer);
    image.onload = null;
    image.onerror = null;
    image.removeAttribute("src");
  };
  const fail = () => {
    if (entry.disposed || entry.state.image !== image) return;
    cancel();
    entry.cancelImage = undefined;
    entry.imageStatus = "failed";
    entry.state.image = null;
    // A corrupt cached poster must still be able to fall back to its video.
    entry.state.still = null;
    notify(entry);
    schedule();
  };
  const timer = setTimeout(fail, 15_000);
  entry.cancelImage = cancel;
  image.onload = () => {
    if (entry.disposed || entry.state.image !== image) return;
    clearTimeout(timer);
    entry.imageStatus = "ready";
    notify(entry);
    schedule();
  };
  image.onerror = fail;
  image.src = url;
}

function loadVideo(entry: Entry) {
  entry.videoStatus = "loading";
  const video = document.createElement("video");
  entry.state.video = video;
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.defaultMuted = true;
  video.playsInline = true;
  video.loop = true;
  video.preload = "auto";
  video.setAttribute("aria-label", `${entry.asset.name} NFT artwork`);
  const fail = () => {
    if (entry.disposed || entry.state.video !== video) return;
    stopVideo(entry);
    entry.videoStatus = "failed";
    notify(entry);
    schedule();
  };
  const timer = setTimeout(fail, 20_000);
  entry.cancelVideo = () => clearTimeout(timer);
  const ready = () => {
    // HAVE_CURRENT_DATA is enough to capture a poster and show a VideoTexture.
    // Waiting for canplay unnecessarily holds up all the remaining thumbnails.
    if (entry.disposed || entry.state.video !== video || entry.state.videoReady || video.readyState < 2 || !video.videoWidth || !video.videoHeight) return;
    clearTimeout(timer);
    if (entry.imageStatus !== "ready") {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.min(640, video.videoWidth);
        canvas.height = Math.round(canvas.width * video.videoHeight / video.videoWidth);
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          entry.state.still = canvas.toDataURL("image/jpeg", 0.85);
          rememberPoster(entry);
          loadImage(entry, entry.state.still);
        }
      } catch { /* Playback can still work if canvas extraction is blocked. */ }
    }
    entry.videoStatus = "ready";
    entry.state.videoReady = true;
    if (!wantsAnimation(entry) && !entry.state.still && entry.imageStatus === "failed") {
      fail();
      return;
    }
    notify(entry);
    schedule();
  };
  video.onloadeddata = ready;
  video.oncanplay = ready;
  video.onerror = fail;
  video.src = entry.asset.videoUrl!;
  video.load();
}

export function acquireMedia(
  asset: ShowcaseAsset,
  options: { priority: number; animate: boolean },
  notifyState: Consumer["notify"],
) {
  // Different mints can share the same artwork and decoder.
  const key = `${asset.imageUrl}|${asset.videoUrl}`;
  let entry = entries.get(key);
  if (!entry) {
    const still = asset.videoUrl ? cachedPosters().get(asset.videoUrl) ?? null : null;
    entry = {
      asset,
      consumers: new Set(),
      disposed: false,
      imageStatus: asset.imageUrl || still ? "queued" : "failed",
      videoStatus: asset.videoUrl ? "queued" : "failed",
      state: { image: null, video: null, videoReady: false, still, failed: !asset.imageUrl && !asset.videoUrl },
    };
    entries.set(key, entry);
  }
  const current = entry;
  const consumer: Consumer = { ...options, notify: notifyState };
  current.consumers.add(consumer);
  notify(current);
  if (!removeListeners) {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");
    motion.addEventListener("change", syncPlayback);
    document.addEventListener("visibilitychange", syncPlayback);
    removeListeners = () => {
      motion.removeEventListener("change", syncPlayback);
      document.removeEventListener("visibilitychange", syncPlayback);
    };
  }
  schedule();
  return {
    update(options: { priority: number; animate: boolean }) {
      const wasAnimated = wantsAnimation(current);
      Object.assign(consumer, options);
      if (!wasAnimated && wantsAnimation(current) && current.videoStatus === "failed" && current.asset.videoUrl) {
        current.videoStatus = "queued";
      }
      notify(current);
      syncPlayback();
      schedule();
    },
    release() {
      current.consumers.delete(consumer);
      queueMicrotask(() => {
        if (current.consumers.size || current.disposed) return;
        current.disposed = true;
        current.cancelImage?.();
        stopVideo(current);
        entries.delete(key);
        if (!entries.size) {
          removeListeners?.();
          removeListeners = undefined;
        }
        schedule();
      });
    },
  };
}
