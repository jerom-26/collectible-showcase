"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Box, ChevronLeft, ChevronRight, LoaderCircle, Search, WalletCards } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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

export type ShowcaseAsset = {
  assetId: string;
  name: string;
  collectionName: string;
  collectionDisplay: string;
  schemaName: string;
  templateId: string | null;
  mint: string | null;
  rarity: string | null;
  imageUrl: string | null;
  backImageUrl: string | null;
  videoUrl: string | null;
};

const MAX_ROOM_ASSETS = 8;

function createTextTexture(title: string, subtitle: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 640;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.Texture();

  context.fillStyle = "#11161d";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = "#a77b40";
  context.lineWidth = 8;
  context.strokeRect(26, 26, canvas.width - 52, canvas.height - 52);
  context.fillStyle = "#f3eadc";
  context.textAlign = "center";
  context.font = "600 54px Arial";
  context.fillText(title.slice(0, 28), canvas.width / 2, 280);
  context.fillStyle = "#9da7b5";
  context.font = "32px Arial";
  context.fillText(subtitle.slice(0, 46), canvas.width / 2, 350);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function assetPosition(index: number) {
  const row = Math.floor(index / 4);
  const column = index % 4;
  return new THREE.Vector3((column - 1.5) * 2.55, row === 0 ? 2.9 : 0.9, -2.25);
}

function Showroom({ assets, onSelect }: { assets: ShowcaseAsset[]; onSelect: (index: number) => void }) {
  const mountRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef(onSelect);

  useEffect(() => {
    selectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#080b10");
    scene.fog = new THREE.Fog("#080b10", 12, 28);

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 3.4, 11.6);

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 6.5;
    controls.maxDistance = 16;
    controls.minPolarAngle = Math.PI * 0.29;
    controls.maxPolarAngle = Math.PI * 0.53;
    controls.target.set(0, 2.05, -1.7);

    scene.add(new THREE.HemisphereLight("#cad9ef", "#2e2115", 2.2));
    const keyLight = new THREE.DirectionalLight("#fff1d6", 4.2);
    keyLight.position.set(4, 8, 7);
    scene.add(keyLight);
    const amberLight = new THREE.PointLight("#d79b50", 34, 16, 2);
    amberLight.position.set(-5, 4, 2);
    scene.add(amberLight);

    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(28, 22),
      new THREE.MeshStandardMaterial({ color: "#16191d", roughness: 0.72, metalness: 0.18 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.66;
    scene.add(floor);

    const backWall = new THREE.Mesh(
      new THREE.PlaneGeometry(18, 9),
      new THREE.MeshStandardMaterial({ color: "#10151c", roughness: 0.82, metalness: 0.08 }),
    );
    backWall.position.set(0, 3.6, -3.35);
    scene.add(backWall);

    const ceilingTrim = new THREE.Mesh(
      new THREE.BoxGeometry(12, 0.14, 0.18),
      new THREE.MeshStandardMaterial({ color: "#a77b40", emissive: "#5b3716", emissiveIntensity: 1.2 }),
    );
    ceilingTrim.position.set(0, 5.3, -3.05);
    scene.add(ceilingTrim);

    const mediaDisposables: Array<THREE.Texture | HTMLVideoElement> = [];
    const roomAssets = assets.slice(0, MAX_ROOM_ASSETS);
    const cardMaterial = new THREE.MeshStandardMaterial({ color: "#f1e7d7", roughness: 0.7 });
    const frameMaterial = new THREE.MeshStandardMaterial({ color: "#252b32", metalness: 0.72, roughness: 0.25 });
    const pedestalMaterial = new THREE.MeshStandardMaterial({ color: "#181c22", metalness: 0.58, roughness: 0.32 });
    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");

    const addDisplay = (asset: ShowcaseAsset, index: number) => {
      const group = new THREE.Group();
      group.position.copy(assetPosition(index));
      group.userData.assetIndex = index;

      const frame = new THREE.Mesh(new THREE.BoxGeometry(2.14, 1.48, 0.14), frameMaterial);
      frame.position.z = -0.08;
      group.add(frame);

      const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.92, 1.22), cardMaterial.clone());
      plane.position.z = 0.015;
      group.add(plane);

      const source = asset.videoUrl ?? asset.imageUrl ?? asset.backImageUrl;
      if (source && asset.videoUrl) {
        const video = document.createElement("video");
        video.src = source;
        video.crossOrigin = "anonymous";
        video.loop = true;
        video.muted = true;
        video.playsInline = true;
        video.preload = "metadata";
        video.play().catch(() => undefined);
        const texture = new THREE.VideoTexture(video);
        texture.colorSpace = THREE.SRGBColorSpace;
        plane.material.map = texture;
        plane.material.color.set("#ffffff");
        plane.material.needsUpdate = true;
        mediaDisposables.push(video, texture);
      } else if (source) {
        loader.load(
          source,
          (texture) => {
            texture.colorSpace = THREE.SRGBColorSpace;
            plane.material.map = texture;
            plane.material.color.set("#ffffff");
            plane.material.needsUpdate = true;
            mediaDisposables.push(texture);
          },
          undefined,
          () => {
            const fallback = createTextTexture(asset.name, "Media unavailable");
            plane.material.map = fallback;
            plane.material.color.set("#ffffff");
            plane.material.needsUpdate = true;
            mediaDisposables.push(fallback);
          },
        );
      } else {
        const fallback = createTextTexture(asset.name, "No display media");
        plane.material.map = fallback;
        plane.material.color.set("#ffffff");
        plane.material.needsUpdate = true;
        mediaDisposables.push(fallback);
      }

      const pedestal = new THREE.Mesh(new THREE.BoxGeometry(2.22, 0.14, 0.8), pedestalMaterial);
      pedestal.position.set(0, -0.84, 0.12);
      group.add(pedestal);

      group.traverse((child) => {
        child.userData.assetIndex = index;
      });
      scene.add(group);
    };

    if (roomAssets.length) {
      roomAssets.forEach(addDisplay);
    } else {
      const texture = createTextTexture("Your collection", "Enter a WAX account to begin");
      mediaDisposables.push(texture);
      const material = new THREE.MeshStandardMaterial({ map: texture, color: "#ffffff", roughness: 0.62 });
      const welcome = new THREE.Mesh(new THREE.PlaneGeometry(4.7, 2.94), material);
      welcome.position.set(0, 2.05, -2.9);
      scene.add(welcome);
    }

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const handlePointer = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
      pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(scene.children, true).find((item) => Number.isInteger(item.object.userData.assetIndex));
      if (hit) selectRef.current(hit.object.userData.assetIndex);
    };
    renderer.domElement.addEventListener("pointerdown", handlePointer);

    const resize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    let animationFrame = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", handlePointer);
      controls.dispose();
      scene.traverse((object) => {
        if (object instanceof THREE.Mesh) {
          object.geometry.dispose();
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      mediaDisposables.forEach((item) => {
        if (item instanceof HTMLVideoElement) {
          item.pause();
          item.removeAttribute("src");
          item.load();
        } else {
          item.dispose();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [assets]);

  return <div ref={mountRef} className="absolute inset-0" aria-label="Interactive 3D collectible showroom" />;
}

export function ShowcaseExperience() {
  const [account, setAccount] = useState("");
  const [loadedAccount, setLoadedAccount] = useState("");
  const [assets, setAssets] = useState<ShowcaseAsset[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("Enter a WAX account to open its Hot Wheels collection.");
  const [error, setError] = useState("");

  const loadAccount = useCallback(async (waxAccount: string) => {
    const normalized = waxAccount.trim().toLowerCase();
    if (!/^[a-z1-5.]{1,12}$/.test(normalized)) {
      setError("Enter a valid WAX account name.");
      throw new Error("Enter a valid WAX account name.");
    }

    setLoading(true);
    setError("");
    setMessage("Reading the public WAX collection…");
    try {
      const response = await fetch(`/api/wax-assets?account=${encodeURIComponent(normalized)}`);
      const payload = (await response.json()) as { assets?: ShowcaseAsset[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "The collection could not be loaded.");

      const nextAssets = payload.assets ?? [];
      setAssets(nextAssets);
      setLoadedAccount(normalized);
      setSelectedIndex(0);
      setMessage(
        nextAssets.length
          ? `${nextAssets.length} collectible${nextAssets.length === 1 ? "" : "s"} found. Drag to explore the room.`
          : "No supported Hot Wheels NFTs were found in this account.",
      );
      const url = new URL(window.location.href);
      url.searchParams.set("account", normalized);
      window.history.replaceState({}, "", url);
      return {
        account: normalized,
        collectibleCount: nextAssets.length,
        displayedInRoom: Math.min(nextAssets.length, MAX_ROOM_ASSETS),
      };
    } catch (reason) {
      setAssets([]);
      setLoadedAccount("");
      setMessage("Enter a WAX account to try again.");
      const failure = reason instanceof Error ? reason : new Error("The collection could not be loaded.");
      setError(failure.message);
      throw failure;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initialAccount = new URLSearchParams(window.location.search).get("account");
    if (initialAccount) {
      setAccount(initialAccount);
      void loadAccount(initialAccount).catch(() => undefined);
    }
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
          description: "Load a public WAX account's supported Hot Wheels NFTs into the visible 3D showroom.",
          inputSchema: {
            type: "object",
            properties: {
              account: { type: "string", description: "WAX account name, up to 12 characters." },
            },
            required: ["account"],
            additionalProperties: false,
          },
          annotations: { readOnlyHint: true, untrustedContentHint: true },
          async execute(input) {
            const candidate = input && typeof input === "object" ? (input as { account?: unknown }).account : null;
            if (typeof candidate !== "string") throw new Error("A WAX account name is required.");
            setAccount(candidate);
            return loadAccount(candidate);
          },
        },
        { signal: lifecycle.signal },
      ),
    ).catch(() => undefined);

    return () => lifecycle.abort();
  }, [loadAccount]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    void loadAccount(account).catch(() => undefined);
  };

  const selected = assets[selectedIndex] ?? null;
  const moveSelection = (delta: number) => {
    if (!assets.length) return;
    setSelectedIndex((current) => (current + delta + assets.length) % assets.length);
  };

  return (
    <main className="showcase-shell">
      <section className="showroom-stage">
        <Showroom assets={assets} onSelect={setSelectedIndex} />
        <div className="stage-vignette" aria-hidden="true" />

        <header className="brand-bar">
          <div className="brand-mark" aria-hidden="true"><Box size={19} strokeWidth={1.7} /></div>
          <div>
            <p className="brand-name">Collectible Showcase</p>
            <p className="brand-context">WAX collection room</p>
          </div>
        </header>

        <section className="account-panel" aria-labelledby="collection-heading">
          <div className="panel-kicker"><WalletCards size={15} /> Public collection lookup</div>
          <h1 id="collection-heading">Open a WAX collection</h1>
          <form onSubmit={submit} className="account-form">
            <Input
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              placeholder="WAX account name"
              aria-label="WAX account name"
              autoComplete="off"
              spellCheck={false}
            />
            <Button type="submit" disabled={loading}>
              {loading ? <LoaderCircle className="animate-spin" /> : <Search />}
              {loading ? "Loading" : "Load"}
            </Button>
          </form>
          <p className={error ? "panel-message panel-error" : "panel-message"} role="status">{error || message}</p>
          <p className="verification-note">Public preview only. Entering an account does not prove wallet ownership.</p>
        </section>

        <div className="room-hint" aria-hidden="true">Drag to look · Scroll to zoom · Select a display</div>

        {selected && (
          <aside className="asset-detail" aria-live="polite">
            <p className="asset-count">{selectedIndex + 1} / {assets.length}</p>
            <h2>{selected.name}</h2>
            <p className="collection-name">{selected.collectionDisplay}</p>
            <dl>
              {selected.rarity && <><dt>Rarity</dt><dd>{selected.rarity}</dd></>}
              {selected.mint && <><dt>Mint</dt><dd>#{selected.mint}</dd></>}
              <dt>Asset</dt><dd>{selected.assetId}</dd>
            </dl>
            <div className="detail-actions">
              <Button variant="outline" size="icon" onClick={() => moveSelection(-1)} aria-label="Previous collectible"><ChevronLeft /></Button>
              <Button variant="outline" size="icon" onClick={() => moveSelection(1)} aria-label="Next collectible"><ChevronRight /></Button>
              <a href={`https://wax.atomichub.io/explorer/asset/wax-mainnet/${selected.assetId}`} target="_blank" rel="noreferrer">View record</a>
            </div>
          </aside>
        )}
      </section>

      <footer className="collection-rail">
        <div className="rail-summary">
          <span>{loadedAccount || "No account loaded"}</span>
          <strong>{assets.length ? `${Math.min(assets.length, MAX_ROOM_ASSETS)} displayed in room` : "Collection waiting"}</strong>
        </div>
        <div className="rail-assets" aria-label="Loaded collectibles">
          {assets.map((asset, index) => (
            <button
              type="button"
              key={asset.assetId}
              className={index === selectedIndex ? "rail-card is-selected" : "rail-card"}
              onClick={() => setSelectedIndex(index)}
              aria-pressed={index === selectedIndex}
            >
              {asset.backImageUrl || asset.imageUrl ? (
                <img src={asset.backImageUrl || asset.imageUrl || ""} alt="" />
              ) : (
                <span className="rail-placeholder"><Box size={18} /></span>
              )}
              <span><strong>{asset.name}</strong><small>{asset.rarity || `Asset ${asset.assetId}`}</small></span>
            </button>
          ))}
        </div>
      </footer>
    </main>
  );
}
