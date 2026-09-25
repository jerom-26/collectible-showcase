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
  key: string;
  asset: ShowcaseAsset;
  consumers: Set<Consumer>;
  imageStatus: Status;
  videoStatus: Status;
  state: MediaState;
  disposed: boolean;
};

const entries = new Map<string, Entry>();

let scheduled = false;
let removeListeners: (() => void) | undefined;

const priority = (entry: Entry) =>
  Math.min(...Array.from(entry.consumers, (c) => c.priority));

const wantsAnimation = (entry: Entry) =>
  Array.from(entry.consumers).some((c) => c.animate);

function notify(entry: Entry) {
  entry.state.failed =
    entry.imageStatus === "failed" && entry.videoStatus === "failed";

  entry.consumers.forEach((c) => {
    c.notify({ ...entry.state });
  });
}

function syncPlayback() {
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const featuredEntry = Array.from(entries.values())
    .filter((entry) => entry.state.videoReady && wantsAnimation(entry))
    .sort((a, b) => priority(a) - priority(b))[0];

  entries.forEach((entry) => {
    const video = entry.state.video;

    if (!video) return;

    const shouldPlay = !document.hidden && !reduced && entry === featuredEntry;

    if (!shouldPlay) {
      video.pause();
      return;
    }

    video.muted = true;
    video.defaultMuted = true;
    video.loop = true;
    video.playsInline = true;

    if (video.paused) {
      void video.play().catch(() => {
        // Static image stays visible if autoplay fails.
      });
    }
  });
}

function schedule() {
  if (scheduled) return;

  scheduled = true;

  queueMicrotask(() => {
    scheduled = false;

    const ordered = Array.from(entries.values()).sort(
      (a, b) => priority(a) - priority(b),
    );

    for (const entry of ordered) {
      if (entry.imageStatus === "queued") {
        loadImage(entry);
      }
    }

    let videos = ordered.filter(
      (entry) => entry.videoStatus === "loading",
    ).length;

    if (
      videos >= 2 &&
      ordered.some(
        (entry) =>
          priority(entry) === 0 &&
          wantsAnimation(entry) &&
          entry.videoStatus === "queued",
      )
    ) {
      const background = ordered
        .slice()
        .reverse()
        .find(
          (entry) => entry.videoStatus === "loading" && priority(entry) > 0,
        );

      const video = background?.state.video;

      if (background && video) {
        video.oncanplay = null;
        video.onerror = null;

        video.pause();
        video.removeAttribute("src");
        video.load();

        background.state.video = null;
        background.state.videoReady = false;
        background.videoStatus = "queued";

        videos--;
      }
    }

    for (const entry of ordered) {
      if (
        entry.videoStatus === "queued" &&
        videos < 2 &&
        (wantsAnimation(entry) || entry.imageStatus === "failed")
      ) {
        videos++;
        loadVideo(entry);
      }
    }

    syncPlayback();
  });
}

function loadImage(entry: Entry) {
  entry.imageStatus = "loading";

  const image = new Image();

  entry.state.image = image;

  image.crossOrigin = "anonymous";
  image.decoding = "async";

  image.fetchPriority = priority(entry) === 0 ? "high" : "auto";

  image.onload = () => {
    if (entry.disposed) return;

    entry.imageStatus = "ready";

    notify(entry);
    schedule();
  };

  image.onerror = () => {
    if (entry.disposed) return;

    entry.imageStatus = "failed";
    entry.state.image = null;

    notify(entry);
    schedule();
  };

  image.src = entry.asset.imageUrl!;
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

  const ready = () => {
    if (
      entry.disposed ||
      entry.state.videoReady ||
      video.readyState < 3 ||
      !video.videoWidth ||
      !video.videoHeight
    ) {
      return;
    }

    const canvas = document.createElement("canvas");

    canvas.width = Math.min(640, video.videoWidth);

    canvas.height = Math.round(
      (canvas.width * video.videoHeight) / video.videoWidth,
    );

    try {
      const ctx = canvas.getContext("2d");

      if (!ctx) return;

      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      entry.state.still = canvas.toDataURL("image/jpeg", 0.88);
    } catch {
      /*
       * If snapshot generation fails,
       * video playback can still continue.
       */
    }

    entry.videoStatus = "ready";
    entry.state.videoReady = true;

    notify(entry);
    syncPlayback();
    schedule();
  };

  video.oncanplay = ready;

  video.onerror = () => {
    if (entry.disposed) return;

    entry.videoStatus = "failed";
    entry.state.videoReady = false;

    notify(entry);
    schedule();
  };

  video.src = entry.asset.videoUrl!;
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
  const key = `${asset.assetId}|${asset.imageUrl}|${asset.videoUrl}`;

  let entry = entries.get(key);

  if (!entry) {
    entry = {
      key,
      asset,
      consumers: new Set(),
      disposed: false,

      imageStatus: asset.imageUrl ? "queued" : "failed",

      videoStatus: asset.videoUrl ? "queued" : "failed",

      state: {
        image: null,
        video: null,
        videoReady: false,
        still: null,
        failed: !asset.imageUrl && !asset.videoUrl,
      },
    };

    entries.set(key, entry);
  }

  const current = entry;

  const consumer: Consumer = {
    ...options,

    notify: (state) =>
      notifyState({
        ...state,

        image: current.imageStatus === "ready" ? state.image : null,
      }),
  };

  current.consumers.add(consumer);

  consumer.notify(current.state);

  if (!removeListeners) {
    const motion = matchMedia("(prefers-reduced-motion: reduce)");

    const mobile = matchMedia("(max-width: 760px)");

    motion.addEventListener("change", syncPlayback);

    mobile.addEventListener("change", syncPlayback);

    document.addEventListener("visibilitychange", syncPlayback);

    removeListeners = () => {
      motion.removeEventListener("change", syncPlayback);

      mobile.removeEventListener("change", syncPlayback);

      document.removeEventListener("visibilitychange", syncPlayback);
    };
  }

  schedule();

  return {
    update(options: { priority: number; animate: boolean }) {
      Object.assign(consumer, options);

      consumer.notify(current.state);
      syncPlayback();
      schedule();
    },

    release() {
      current.consumers.delete(consumer);

      queueMicrotask(() => {
        if (current.consumers.size) {
          return;
        }

        current.disposed = true;

        if (current.state.image) {
          current.state.image.onload = null;
          current.state.image.onerror = null;

          current.state.image.removeAttribute("src");
        }

        const video = current.state.video;

        if (video) {
          video.onloadeddata = null;
          video.oncanplay = null;
          video.onerror = null;

          video.pause();
          video.removeAttribute("src");
          video.load();
          video.remove();
        }

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
