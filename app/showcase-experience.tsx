"use client";

import {
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  ArrowRight,
  Box,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LoaderCircle,
  Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  mintLabel,
  seriesLabel,
  WAX_ACCOUNT,
  type ShowcaseAsset,
} from "@/lib/collection";
import CollectorRoom from "./collector-room";
import { acquireMedia, type MediaState } from "@/lib/nft-media";

declare global {
  interface Document {
    modelContext?: {
      registerTool: (
        tool: {
          name: string;
          title: string;
          description: string;
          inputSchema: object;
          annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
          execute: (input: unknown) => unknown | Promise<unknown>;
        },
        options?: { signal?: AbortSignal },
      ) => void | Promise<void>;
    };
  }
}

function AssetMedia({
  asset,
  animated = false,
}: {
  asset: ShowcaseAsset;
  animated?: boolean;
}) {
  const [media, setMedia] = useState<MediaState>({
    image: null,
    video: null,
    videoReady: false,
    still: null,
    failed: false,
  });
  const videoHost = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const handle = acquireMedia(
      asset,
      { priority: animated ? 0 : 2, animate: animated },
      setMedia,
    );
    return () => handle.release();
  }, [asset, animated]);
  useEffect(() => {
    const host = videoHost.current;
    const video = media.video;
    if (!animated || !media.videoReady || !video || !host) return;
    host.appendChild(video);
    return () => {
      if (video.parentNode === host) host.removeChild(video);
    };
  }, [animated, media.video, media.videoReady]);
  const poster = animated ? media.image?.src || media.still : media.image?.src;
  return (
    <span className="nft-media">
      {poster ? (
        <img
          src={poster}
          crossOrigin="anonymous"
          alt={`${asset.name} NFT artwork`}
        />
      ) : (
        <span className="media-fallback">
          <Box size={22} />
          <span>
            {media.failed ? "Artwork unavailable" : "Loading artwork"}
          </span>
        </span>
      )}
      {animated && <span className="nft-media-video" ref={videoHost} />}
    </span>
  );
}

type View = "lookup" | "showroom";

export default function ShowcaseExperience({
  initialView = "lookup",
}: {
  initialView?: View;
}) {
  const [view, setView] = useState<View>(initialView);
  const [section, setSection] = useState<"showroom" | "collection">("showroom");
  const [account, setAccount] = useState("");
  const [loadedAccount, setLoadedAccount] = useState("");
  const [assets, setAssets] = useState<ShowcaseAsset[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(initialView === "showroom");
  const [error, setError] = useState("");
  const [empty, setEmpty] = useState(false);
  const requestRef = useRef<AbortController | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  const loadAccount = useCallback(
    async (
      candidate: string,
      historyMode: "push" | "replace" | "none" = "push",
    ) => {
      const normalized = candidate.trim().toLowerCase();
      if (!WAX_ACCOUNT.test(normalized)) {
        const failure = new Error(
          "Use a WAX account name: up to 12 lowercase letters, numbers 1–5, or dots.",
        );
        setError(failure.message);
        throw failure;
      }
      requestRef.current?.abort();
      const controller = new AbortController();
      requestRef.current = controller;
      setLoading(true);
      setError("");
      setEmpty(false);
      try {
        const response = await fetch(
          `/api/wax-assets?account=${encodeURIComponent(normalized)}`,
          { signal: controller.signal },
        );
        const result = (await response.json()) as {
          error?: string;
          assets?: ShowcaseAsset[];
        };
        if (!response.ok)
          throw new Error(
            result.error || "The collection could not be loaded.",
          );
        if (!Array.isArray(result.assets))
          throw new Error(
            "The collection response was incomplete. Please try again.",
          );
        if (controller.signal.aborted) return;
        const next: ShowcaseAsset[] = result.assets;
        setAssets(next);
        setAccount(normalized);
        setLoadedAccount(normalized);
        setSelectedIndex(0);
        setEmpty(!next.length);
        if (next.length) {
          setView("showroom");
          setSection("showroom");
          const path = `/showroom?account=${encodeURIComponent(normalized)}`;
          if (historyMode === "replace") history.replaceState({}, "", path);
          else if (historyMode === "push") history.pushState({}, "", path);
        } else setView("lookup");
        return {
          account: normalized,
          collectibleCount: next.length,
          displayedInRoom: Math.min(next.length, 7),
        };
      } catch (reason) {
        if (controller.signal.aborted) return;
        const failure =
          reason instanceof Error
            ? reason
            : new Error("The collection could not be reached.");
        setError(failure.message);
        setView("lookup");
        throw failure;
      } finally {
        if (requestRef.current === controller) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const initial = new URLSearchParams(location.search).get("account");
    if (initial) {
      setAccount(initial);
      void loadAccount(initial, "replace").catch(() => {
        setLoading(false);
        setView("lookup");
      });
    } else {
      setView("lookup");
      setLoading(false);
    }
    const onBack = () => {
      requestRef.current?.abort();
      const name = new URLSearchParams(location.search).get("account");
      if (location.pathname === "/showroom" && name) {
        setAccount(name);
        void loadAccount(name, "none").catch(() => {
          setLoading(false);
          setView("lookup");
        });
      } else {
        setView("lookup");
        setLoading(false);
        setError("");
        setEmpty(false);
      }
    };
    window.addEventListener("popstate", onBack);
    return () => {
      requestRef.current?.abort();
      window.removeEventListener("popstate", onBack);
    };
  }, [loadAccount]);

  useEffect(() => {
    const context = document.modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    void Promise.resolve(
      context.registerTool(
        {
          name: "load_wax_collection",
          title: "Load WAX collection",
          description:
            "Look up a public WAX account and open its Hot Wheels NFTs in the visible showroom. Does not authenticate wallet ownership.",
          inputSchema: {
            type: "object",
            properties: {
              account: {
                type: "string",
                description: "Public WAX account name.",
              },
            },
            required: ["account"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false, untrustedContentHint: true },
          execute: async (input) => {
            const candidate =
              input && typeof input === "object"
                ? (input as { account?: unknown }).account
                : null;
            if (typeof candidate !== "string")
              throw new Error("A WAX account name is required.");
            setAccount(candidate);
            return loadAccount(candidate);
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);
    return () => lifecycle.abort();
  }, [loadAccount]);

  useEffect(() => {
    const rail = railRef.current;
    const button = rail?.children[selectedIndex] as HTMLElement | undefined;
    if (!rail || !button) return;
    const ensureVisible = () => {
      const left = button.offsetLeft;
      if (
        left < rail.scrollLeft ||
        left + button.offsetWidth > rail.scrollLeft + rail.clientWidth
      ) {
        rail.scrollTo({
          left: left - rail.clientWidth / 2 + button.offsetWidth / 2,
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        });
      }
    };
    ensureVisible();
    const observer = new ResizeObserver(ensureVisible);
    observer.observe(rail);
    return () => observer.disconnect();
  }, [selectedIndex, view]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void loadAccount(account).catch(() => undefined);
  };
  const lookup = () => {
    requestRef.current?.abort();
    setLoading(false);
    setError("");
    setEmpty(false);
    setView("lookup");
    history.pushState({}, "", "/");
  };
  const select = (index: number) => {
    setSelectedIndex(index);
  };
  const selected = assets[selectedIndex];
  const move = (delta: number) =>
    setSelectedIndex(
      (index) => (index + delta + assets.length) % assets.length,
    );
  const showRoom = () => {
    setSection("showroom");
  };

  return (
    <main
      className={view === "lookup" ? "app-shell lookup-shell" : "app-shell"}
    >
      <header className="site-header">
        <button
          className="brand"
          onClick={lookup}
          aria-label="Collectible Showcase, account search"
        >
          <Box size={24} strokeWidth={1.4} />
          <span>
            Collectible <strong>Showcase</strong>
          </span>
        </button>
        {view === "showroom" && assets.length > 0 && (
          <>
            <nav aria-label="Collection views">
              <button
                aria-current={section === "showroom" ? "page" : undefined}
                onClick={showRoom}
              >
                Showroom
              </button>
              <button
                aria-current={section === "collection" ? "page" : undefined}
                onClick={() => setSection("collection")}
              >
                My Collection
              </button>
            </nav>
            <button
              className="account-link"
              onClick={lookup}
              title="Look up another account"
            >
              <span>{loadedAccount}</span>
              <ArrowLeft size={15} />
              <span className="account-link-label">Change account</span>
            </button>
          </>
        )}
        {view === "lookup" && (
          <span className="network-label">WAX COLLECTIONS</span>
        )}
      </header>

      {view === "lookup" ? (
        <section className="lookup-content" aria-labelledby="lookup-title">
          <div className="lookup-card">
            <span className="eyebrow">YOUR COLLECTION, ON DISPLAY</span>
            <h1 id="lookup-title">
              A room for
              <br />
              your collectibles.
            </h1>
            <p className="lookup-intro">
              Enter a WAX account to explore its Hot Wheels NFTs in a personal
              showroom.
            </p>
            <form onSubmit={submit}>
              <label htmlFor="wax-account">WAX account name</label>
              <div className="lookup-input">
                <Search size={20} />
                <Input
                  id="wax-account"
                  value={account}
                  onChange={(e) => {
                    setAccount(e.target.value);
                    setError("");
                    setEmpty(false);
                  }}
                  placeholder="Your account name"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  required
                  aria-describedby="lookup-message"
                  disabled={loading}
                />
              </div>
              <Button
                type="submit"
                disabled={loading}
                className="open-showroom"
              >
                {loading ? (
                  <>
                    <LoaderCircle className="animate-spin" size={18} />
                    Finding your collectibles…
                  </>
                ) : (
                  <>
                    Open showroom
                    <ArrowRight size={18} />
                  </>
                )}
              </Button>
            </form>
            <p
              id="lookup-message"
              className={error ? "lookup-message error" : "lookup-message"}
              role="status"
            >
              {error ||
                (empty
                  ? `No Hot Wheels NFTs were found for ${loadedAccount}. Try another WAX account.`
                  : "No wallet connection needed. This is a public collection lookup, not proof of ownership.")}
            </p>
          </div>
          <p className="lookup-footer">
            Collectible Showcase <span>·</span> Hot Wheels on WAX
          </p>
        </section>
      ) : loading && !selected ? (
        <section className="loading-room" role="status">
          <LoaderCircle className="animate-spin" />
          <p>Opening your collection…</p>
          <Button variant="outline" onClick={lookup}>
            Back to account search
          </Button>
        </section>
      ) : selected ? (
        <>
          <div className="showcase-heading">
            <div>
              <span className="eyebrow">
                {section === "showroom"
                  ? "THE COLLECTOR ROOM"
                  : "MY COLLECTION"}
              </span>
              <h1>
                {loadedAccount}
                <span> / {assets.length} collectibles</span>
              </h1>
            </div>
            <span className="public-note">Public collection · WAX</span>
          </div>
          <div className="showcase-body">
            <section
              className="collection-surface"
              aria-label={
                section === "showroom" ? "Collector room" : "My Collection"
              }
            >
              <div
                className={
                  section === "showroom" ? "room-view" : "room-view is-hidden"
                }
              >
                <CollectorRoom
                  assets={assets}
                  selectedIndex={selectedIndex}
                  onSelect={select}
                  mediaActive={section === "showroom"}
                />
                <div className="room-caption">
                  <span>FEATURED</span>
                  <strong aria-live="polite">{selected.name}</strong>
                  <span>{mintLabel(selected)}</span>
                </div>
                <p className="room-help">Drag gently to look around</p>
              </div>
              {section === "collection" && (
                <div className="collection-grid">
                  {assets.map((asset, index) => (
                    <button
                      key={asset.assetId}
                      className="collection-item"
                      onClick={() => {
                        select(index);
                        showRoom();
                      }}
                      aria-label={`Feature ${asset.name}, mint ${asset.mint}`}
                    >
                      <div className="collection-art">
                        <AssetMedia asset={asset} />
                      </div>
                      <span className="collection-item-name">{asset.name}</span>
                      <span className="collection-item-mint">
                        {mintLabel(asset)} ·{" "}
                        {asset.rarity || "Rarity unavailable"}
                      </span>
                      <span className="collection-item-action">
                        View in showroom <ArrowRight size={15} />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
            <aside className="details-panel" aria-label="Selected NFT details">
              <div className="detail-top">
                <span>
                  {String(selectedIndex + 1).padStart(2, "0")} /{" "}
                  {String(assets.length).padStart(2, "0")}
                </span>
                <div>
                  <button aria-label="Previous NFT" onClick={() => move(-1)}>
                    <ChevronLeft size={18} />
                  </button>
                  <button aria-label="Next NFT" onClick={() => move(1)}>
                    <ChevronRight size={18} />
                  </button>
                </div>
              </div>
              <div className="detail-art">
                <AssetMedia key={selected.assetId} asset={selected} />
              </div>
              <div className="detail-copy" aria-live="polite">
                <div className="asset-tags">
                  {selected.rarity && <span>{selected.rarity}</span>}
                  <span>{seriesLabel(selected.schemaName)}</span>
                </div>
                <h2>{selected.name}</h2>
                <p className="collection-name">{selected.collectionDisplay}</p>
                <dl>
                  <dt>Mint number</dt>
                  <dd>{mintLabel(selected)}</dd>
                  {selected.rarity && (
                    <>
                      <dt>Rarity</dt>
                      <dd>{selected.rarity}</dd>
                    </>
                  )}
                  <dt>Collection</dt>
                  <dd>{selected.collectionDisplay}</dd>
                  {selected.set && (
                    <>
                      <dt>Set</dt>
                      <dd>{selected.set}</dd>
                    </>
                  )}
                  <dt>Asset ID</dt>
                  <dd className="asset-id">{selected.assetId}</dd>
                  {selected.year && (
                    <>
                      <dt>Year released</dt>
                      <dd>{selected.year}</dd>
                    </>
                  )}
                  {selected.make && (
                    <>
                      <dt>Make</dt>
                      <dd>{selected.make}</dd>
                    </>
                  )}
                  {selected.designer && (
                    <>
                      <dt>Designer</dt>
                      <dd>{selected.designer}</dd>
                    </>
                  )}
                </dl>
              </div>
              <a
                className="record-link"
                href={`https://wax.atomichub.io/explorer/asset/wax-mainnet/${selected.assetId}`}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} />
                View on AtomicHub
              </a>
            </aside>
          </div>
          <section className="quick-switch" aria-label="Quick switch">
            <div className="switch-label">
              <strong>Quick switch</strong>
              <span>{assets.length} collectibles</span>
            </div>
            <div className="switch-list" ref={railRef}>
              {assets.map((asset, index) => (
                <button
                  key={asset.assetId}
                  className={`switch-item${selectedIndex === index ? " is-selected" : ""}`}
                  onClick={() => {
                    select(index);
                    showRoom();
                  }}
                  aria-pressed={selectedIndex === index}
                  aria-label={`Feature ${asset.name}, mint ${asset.mint}`}
                  title={asset.name}
                >
                  <div className="switch-art">
                    <AssetMedia asset={asset} />
                  </div>
                  <span className="switch-copy">
                    <strong>{asset.name}</strong>
                    <span>{mintLabel(asset)}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>
          <footer className="showroom-footer">
            <span>
              Artwork and metadata from the collection’s public records.
            </span>
            <span>COLLECT · DISPLAY · EXPLORE</span>
          </footer>
        </>
      ) : null}
    </main>
  );
}
