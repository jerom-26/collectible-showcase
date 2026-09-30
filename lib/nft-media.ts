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
  retainVideo: boolean;
  cancelImage?: () => void;
  cancelVideo?: () => void;
};

const entries = new Map<string, Entry>();

const POSTER_CACHE_KEY = "nft-posters-v1";
const MAX_POSTERS = 24;

let posterCache: Map<string, string> | undefined;
let scheduled = false;
let removeListeners: (() => void) | undefined;

const priority = (entry: Entry) =>
  Math.min(
    ...Array.from(
      entry.consumers,
      (consumer) => consumer.priority,
    ),
  );

const wantsAnimation = (entry: Entry) =>
  Array.from(entry.consumers).some(
    (consumer) => consumer.animate,
  );

// Small generated posters survive account changes and reloads in this tab.
// Storage being disabled or full must never prevent artwork from displaying.
function cachedPosters() {
  if (!posterCache) {
    posterCache = new Map();

    try {
      const saved: unknown = JSON.parse(
        sessionStorage.getItem(POSTER_CACHE_KEY) || "[]",
      );

      if (Array.isArray(saved)) {
        for (const pair of saved.slice(-MAX_POSTERS)) {
          if (
            Array.isArray(pair) &&
            typeof pair[0] === "string" &&
            typeof pair[1] === "string" &&
            pair[1].startsWith("data:image/jpeg;") &&
            pair[1].length < 512_000
          ) {
            posterCache.set(
              pair[0],
              pair[1],
            );
          }
        }
      }
    } catch {
      // Private browsing can disable storage.
    }
  }

  return posterCache;
}

function rememberPoster(entry: Entry) {
  if (
    !entry.asset.videoUrl ||
    !entry.state.still
  ) {
    return;
  }

  const cache = cachedPosters();

  cache.delete(entry.asset.videoUrl);

  cache.set(
    entry.asset.videoUrl,
    entry.state.still,
  );

  while (cache.size > MAX_POSTERS) {
    cache.delete(
      cache.keys().next().value!,
    );
  }

  try {
    sessionStorage.setItem(
      POSTER_CACHE_KEY,
      JSON.stringify([...cache]),
    );
  } catch {
    // The in-memory cache still works when the storage quota is full.
  }
}

function notify(entry: Entry) {
  entry.state.failed =
    entry.imageStatus === "failed" &&
    entry.videoStatus === "failed";

  entry.consumers.forEach(
    (consumer) =>
      consumer.notify({
        ...entry.state,

        image:
          entry.imageStatus === "ready"
            ? entry.state.image
            : null,
      }),
  );
}

function destroyVideo(entry: Entry) {
  entry.cancelVideo?.();
  entry.cancelVideo = undefined;

  const video = entry.state.video;

  if (video) {
    video.onloadeddata = null;
    video.oncanplay = null;
    video.onprogress = null;
    video.onwaiting = null;
    video.onstalled = null;
    video.onerror = null;

    video.pause();

    video.removeAttribute("src");

    video.load();

    video.remove();
  }

  entry.state.video = null;
  entry.state.videoReady = false;
}

function bufferedAhead(
  video: HTMLVideoElement,
) {
  try {
    const current =
      video.currentTime || 0;

    for (
      let i = 0;
      i < video.buffered.length;
      i++
    ) {
      const start =
        video.buffered.start(i);

      const end =
        video.buffered.end(i);

      if (
        current >= start - 0.05 &&
        current <= end + 0.05
      ) {
        return Math.max(
          0,
          end - current,
        );
      }
    }
  } catch {
    // Browser may temporarily expose an incomplete TimeRanges object.
  }

  return 0;
}

function isNearlyFullyBuffered(
  video: HTMLVideoElement,
) {
  const duration =
    Number.isFinite(video.duration) &&
    video.duration > 0
      ? video.duration
      : null;

  if (!duration) {
    return false;
  }

  try {
    for (
      let i = 0;
      i < video.buffered.length;
      i++
    ) {
      const start =
        video.buffered.start(i);

      const end =
        video.buffered.end(i);

      if (
        start <= 0.1 &&
        end >= duration - 0.1
      ) {
        return true;
      }
    }
  } catch {
    // Ignore temporary TimeRanges errors.
  }

  return false;
}

function hasPlaybackBuffer(
  video: HTMLVideoElement,
) {
  if (video.readyState < 3) {
    return false;
  }

  const duration =
    Number.isFinite(video.duration) &&
    video.duration > 0
      ? video.duration
      : null;

  /*
   * These NFT animations are short looping clips.
   *
   * Showing a 5-second video after only 2 seconds have buffered causes:
   *
   * video
   * → stall
   * → poster
   * → video
   * → stall
   *
   * For short clips we therefore keep the poster visible until almost
   * the entire animation is available.
   */
  if (
    duration &&
    duration <= 15
  ) {
    return isNearlyFullyBuffered(
      video,
    );
  }

  // Longer videos do not need to be completely downloaded.
  return bufferedAhead(video) >= 4;
}

function syncPlayback() {
  const reduced = matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;

  const featured =
    Array.from(entries.values())
      .filter(
        (entry) =>
          entry.state.videoReady &&
          wantsAnimation(entry),
      )
      .sort(
        (a, b) =>
          priority(a) - priority(b),
      )[0];

  entries.forEach((entry) => {
    const video =
      entry.state.video;

    if (!video) {
      return;
    }

    if (
      document.hidden ||
      reduced ||
      entry !== featured
    ) {
      video.pause();

      return;
    }

    if (video.paused) {
      void video
        .play()
        .catch(() => {
          // Keep the poster if autoplay/playback is rejected.
        });
    }
  });
}

function schedule() {
  if (scheduled) {
    return;
  }

  scheduled = true;

  queueMicrotask(() => {
    scheduled = false;

    const ordered =
      Array.from(entries.values())
        .filter(
          (entry) =>
            entry.consumers.size &&
            !entry.disposed,
        )
        .sort(
          (a, b) =>
            priority(a) - priority(b),
        );

    let images =
      ordered.filter(
        (entry) =>
          entry.imageStatus ===
          "loading",
      ).length;

    for (const entry of ordered) {
      if (
        entry.imageStatus ===
          "queued" &&
        images < 4
      ) {
        images++;

        loadImage(
          entry,
          entry.state.still ||
            entry.asset.imageUrl!,
        );
      }

      /*
       * Videos loaded only to generate a fallback poster do not need to
       * remain alive after a still image exists.
       *
       * Videos that the user has actually selected are retained so that
       * revisiting the NFT can reuse its decoder/buffer.
       */
      if (
        entry.state.video &&
        !wantsAnimation(entry) &&
        !entry.retainVideo &&
        (
          entry.imageStatus ===
            "ready" ||
          entry.state.still
        )
      ) {
        destroyVideo(entry);

        entry.videoStatus =
          "queued";

        notify(entry);
      }
    }

    let videos =
      ordered.filter(
        (entry) =>
          entry.videoStatus ===
          "loading",
      ).length;

    /*
     * A selected NFT has priority over background videos that are only
     * being used to generate missing posters.
     */
    if (
      videos >= 2 &&
      ordered.some(
        (entry) =>
          priority(entry) === 0 &&
          wantsAnimation(entry) &&
          entry.videoStatus ===
            "queued" &&
          (
            entry.imageStatus ===
              "ready" ||
            entry.imageStatus ===
              "failed"
          ),
      )
    ) {
      const background =
        ordered
          .slice()
          .reverse()
          .find(
            (entry) =>
              entry.videoStatus ===
                "loading" &&
              priority(entry) > 0,
          );

      if (background) {
        destroyVideo(
          background,
        );

        background.videoStatus =
          "queued";

        notify(background);

        videos--;
      }
    }

    for (const entry of ordered) {
      const needsPoster =
        entry.imageStatus ===
          "failed" &&
        !entry.state.still;

      const canAnimate =
        wantsAnimation(entry) &&
        (
          entry.imageStatus ===
            "ready" ||
          entry.imageStatus ===
            "failed"
        );

      if (
        entry.videoStatus ===
          "queued" &&
        videos < 2 &&
        (
          needsPoster ||
          canAnimate
        )
      ) {
        videos++;

        loadVideo(entry);
      }
    }

    syncPlayback();
  });
}

function loadImage(
  entry: Entry,
  url: string,
) {
  entry.cancelImage?.();

  entry.imageStatus =
    "loading";

  const image = new Image();

  entry.state.image =
    image;

  image.crossOrigin =
    "anonymous";

  image.decoding =
    "async";

  image.fetchPriority =
    priority(entry) === 0
      ? "high"
      : "auto";

  const cancel = () => {
    clearTimeout(timer);

    image.onload = null;
    image.onerror = null;

    image.removeAttribute(
      "src",
    );
  };

  const fail = () => {
    if (
      entry.disposed ||
      entry.state.image !== image
    ) {
      return;
    }

    cancel();

    entry.cancelImage =
      undefined;

    entry.imageStatus =
      "failed";

    entry.state.image =
      null;

    /*
     * A corrupt cached poster must still be able to fall back
     * to its original video.
     */
    entry.state.still =
      null;

    notify(entry);

    schedule();
  };

  const timer = setTimeout(
    fail,
    15_000,
  );

  entry.cancelImage =
    cancel;

  image.onload = () => {
    if (
      entry.disposed ||
      entry.state.image !== image
    ) {
      return;
    }

    clearTimeout(timer);

    entry.cancelImage =
      undefined;

    entry.imageStatus =
      "ready";

    notify(entry);

    schedule();
  };

  image.onerror = fail;

  image.src = url;
}

function loadVideo(
  entry: Entry,
) {
  entry.videoStatus =
    "loading";

  const video =
    document.createElement(
      "video",
    );

  entry.state.video =
    video;

  video.crossOrigin =
    "anonymous";

  video.muted = true;
  video.defaultMuted = true;

  video.playsInline = true;
  video.loop = true;

  video.preload = "auto";

  video.setAttribute(
    "aria-label",
    `${entry.asset.name} NFT artwork`,
  );

  const fail = () => {
    if (
      entry.disposed ||
      entry.state.video !== video
    ) {
      return;
    }

    destroyVideo(entry);

    entry.videoStatus =
      "failed";

    notify(entry);

    schedule();
  };

  const timer = setTimeout(
    fail,
    20_000,
  );

  entry.cancelVideo = () => {
    clearTimeout(timer);
  };

  const capturePoster = () => {
    if (
      entry.disposed ||
      entry.state.video !== video ||
      entry.imageStatus ===
        "ready" ||
      entry.state.still ||
      video.readyState < 2 ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      return;
    }

    try {
      const canvas =
        document.createElement(
          "canvas",
        );

      canvas.width =
        Math.min(
          640,
          video.videoWidth,
        );

      canvas.height =
        Math.round(
          (
            canvas.width *
            video.videoHeight
          ) /
            video.videoWidth,
        );

      const ctx =
        canvas.getContext(
          "2d",
        );

      if (!ctx) {
        return;
      }

      ctx.drawImage(
        video,
        0,
        0,
        canvas.width,
        canvas.height,
      );

      entry.state.still =
        canvas.toDataURL(
          "image/jpeg",
          0.85,
        );

      rememberPoster(entry);

      loadImage(
        entry,
        entry.state.still,
      );
    } catch {
      // Playback can still work if canvas extraction is blocked.
    }
  };

  const ready = () => {
    if (
      entry.disposed ||
      entry.state.video !== video
    ) {
      return;
    }

    capturePoster();

    /*
     * Do not expose the VideoTexture merely because the browser has a
     * first frame. Wait until the clip is sufficiently buffered.
     */
    if (
      !hasPlaybackBuffer(
        video,
      )
    ) {
      return;
    }

    clearTimeout(timer);

    entry.cancelVideo =
      undefined;

    entry.videoStatus =
      "ready";

    if (
      !entry.state.videoReady
    ) {
      entry.state.videoReady =
        true;

      notify(entry);
    }

    if (
      !wantsAnimation(entry) &&
      !entry.state.still &&
      entry.imageStatus ===
        "failed"
    ) {
      fail();

      return;
    }

    schedule();
  };

  const buffering = () => {
    if (
      entry.disposed ||
      entry.state.video !== video ||
      !entry.state.videoReady
    ) {
      return;
    }

    /*
     * Some browsers emit waiting/stalled even when a short clip has
     * already been buffered almost completely. Do not flick back to
     * the poster in that case.
     */
    if (
      isNearlyFullyBuffered(
        video,
      )
    ) {
      return;
    }

    entry.state.videoReady =
      false;

    notify(entry);

    syncPlayback();
  };

  video.onloadeddata =
    () => {
      capturePoster();

      ready();
    };

  video.oncanplay =
    ready;

  video.onprogress =
    ready;

  video.onwaiting =
    buffering;

  video.onstalled =
    buffering;

  video.onerror =
    fail;

  video.src =
    entry.asset.videoUrl!;

  video.load();
}

export function acquireMedia(
  asset: ShowcaseAsset,
  options: {
    priority: number;
    animate: boolean;
  },
  notifyState: Consumer["notify"],
) {
  /*
   * Different mints can share identical artwork. Keying on the
   * media URLs lets them share the same image/video decoder.
   */
  const key =
    `${asset.imageUrl}|${asset.videoUrl}`;

  let entry =
    entries.get(key);

  if (!entry) {
    const still =
      asset.videoUrl
        ? (
            cachedPosters().get(
              asset.videoUrl,
            ) ?? null
          )
        : null;

    entry = {
      asset,

      consumers:
        new Set(),

      disposed: false,

      retainVideo: false,

      imageStatus:
        asset.imageUrl ||
        still
          ? "queued"
          : "failed",

      videoStatus:
        asset.videoUrl
          ? "queued"
          : "failed",

      state: {
        image: null,

        video: null,

        videoReady:
          false,

        still,

        failed:
          !asset.imageUrl &&
          !asset.videoUrl,
      },
    };

    entries.set(
      key,
      entry,
    );
  }

  const current =
    entry;

  const consumer: Consumer =
    {
      ...options,

      notify:
        notifyState,
    };

  current.consumers.add(
    consumer,
  );

  /*
   * Once a video has been selected by the user, retain it so switching
   * away and returning does not recreate the decoder/download.
   */
  if (options.animate) {
    current.retainVideo =
      true;
  }

  notify(current);

  if (!removeListeners) {
    const motion =
      matchMedia(
        "(prefers-reduced-motion: reduce)",
      );

    motion.addEventListener(
      "change",
      syncPlayback,
    );

    document.addEventListener(
      "visibilitychange",
      syncPlayback,
    );

    removeListeners = () => {
      motion.removeEventListener(
        "change",
        syncPlayback,
      );

      document.removeEventListener(
        "visibilitychange",
        syncPlayback,
      );
    };
  }

  schedule();

  return {
    update(
      options: {
        priority: number;
        animate: boolean;
      },
    ) {
      const wasAnimated =
        wantsAnimation(
          current,
        );

      Object.assign(
        consumer,
        options,
      );

      if (
        options.animate
      ) {
        current.retainVideo =
          true;
      }

      /*
       * If the video previously failed but the user explicitly selects
       * the NFT again, permit another attempt.
       */
      if (
        !wasAnimated &&
        wantsAnimation(
          current,
        ) &&
        current.videoStatus ===
          "failed" &&
        current.asset.videoUrl
      ) {
        current.videoStatus =
          "queued";
      }

      notify(current);

      syncPlayback();

      schedule();
    },

    release() {
      current.consumers.delete(
        consumer,
      );

      queueMicrotask(
        () => {
          if (
            current.consumers
              .size ||
            current.disposed
          ) {
            return;
          }

          current.disposed =
            true;

          current.cancelImage?.();

          destroyVideo(
            current,
          );

          entries.delete(
            key,
          );

          if (
            !entries.size
          ) {
            removeListeners?.();

            removeListeners =
              undefined;
          }

          schedule();
        },
      );
    },
  };
}