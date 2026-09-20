"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mintLabel, type ShowcaseAsset } from "@/lib/collection";

// Six display positions leave a clear sightline to the featured piece.
const surrounding = [[-3.1, -1.9], [3.1, -1.9], [-5.25, .6], [5.25, .6], [-3.35, 3.2], [3.35, 3.2]];

function labelTexture(title: string, subtitle = "", wall = false) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = wall ? 128 : 256;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.fillStyle = wall ? "#e0cfb1" : "#f6f1e9";
  ctx.font = wall ? "500 52px Arial" : "500 68px Arial";
  const words = title.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > 940 && line) { lines.push(line); line = word; }
    else line = next;
  }
  lines.push(line);
  lines.forEach((value, i) => ctx.fillText(value, 512, wall ? 80 : 76 + i * 68, 960));
  if (subtitle) {
    ctx.fillStyle = "#c8b48f";
    ctx.font = "54px Arial";
    ctx.fillText(subtitle, 512, 235, 960);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export default function CollectorRoom({ assets, selectedIndex, onSelect }: {
  assets: ShowcaseAsset[];
  selectedIndex: number;
  onSelect: (index: number) => void;
}) {
  const mountRef = useRef<HTMLDivElement>(null);
  const selectedRef = useRef(selectedIndex);
  const onSelectRef = useRef(onSelect);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => { selectedRef.current = selectedIndex; }, [selectedIndex]);
  useEffect(() => { onSelectRef.current = onSelect; }, [onSelect]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !assets.length) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    } catch {
      setUnavailable(true);
      return;
    }
    setUnavailable(false);
    let disposed = false;
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const textures = new Set<THREE.Texture>();
    const videos: HTMLVideoElement[] = [];
    const materials = new Set<THREE.Material>();
    const scene = new THREE.Scene();
    scene.background = new THREE.Color("#161a1e");
    scene.fog = new THREE.Fog("#161a1e", 25, 48);
    const camera = new THREE.PerspectiveCamera(40, 1, .1, 70);
    const target = new THREE.Vector3(0, 2.45, -.2);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.domElement.setAttribute("aria-label", "3D collector room. Use Quick switch below to select a collectible.");
    mount.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minAzimuthAngle = -.22;
    controls.maxAzimuthAngle = .22;
    controls.minPolarAngle = 1.17;
    controls.maxPolarAngle = 1.43;
    controls.enableZoom = false;

    scene.add(new THREE.HemisphereLight("#e2e8ef", "#584c3b", 2));
    const light = new THREE.DirectionalLight("#ffecd4", 3.3);
    light.position.set(1, 10, 7);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    light.shadow.bias = -.001;
    scene.add(light);
    const glow = new THREE.PointLight("#efbe7a", 90, 20, 2);
    glow.position.set(0, 5, -3);
    scene.add(glow);

    const wallMat = new THREE.MeshStandardMaterial({ color: "#24282b", roughness: .85 });
    const baseMat = new THREE.MeshStandardMaterial({ color: "#24272a", metalness: .5, roughness: .42 });
    const topMat = new THREE.MeshStandardMaterial({ color: "#45423c", metalness: .65, roughness: .32 });
    const trimMat = new THREE.MeshStandardMaterial({ color: "#e0b47b", emissive: "#dc9e4e", emissiveIntensity: .8, roughness: .5 });
    const frameMat = new THREE.MeshStandardMaterial({ color: "#3a3b3a", metalness: .65, roughness: .45 });
    [wallMat, baseMat, topMat, trimMat, frameMat].forEach(m => materials.add(m));
    function box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    }
    const floorMat = new THREE.MeshStandardMaterial({ color: "#363738", roughness: .62, metalness: .25 });
    materials.add(floorMat);
    box(28, .2, 28, 0, -.12, 0, floorMat);
    box(20, 8, .25, 0, 3.9, -5.8, wallMat);
    box(.25, 8, 15, -9.6, 3.9, 1.5, wallMat);
    box(.25, 8, 15, 9.6, 3.9, 1.5, wallMat);
    box(20, .2, 18, 0, 7.9, 2, wallMat);
    box(18, .045, .08, 0, 6.85, -5.6, trimMat);
    box(18, .025, .08, 0, .25, -5.6, trimMat);
    [-7.5, -5.7, 5.7, 7.5].forEach(x => box(.055, 6.4, .06, x, 3.5, -5.61, frameMat));
    const wallTitle = labelTexture("MY HOT WHEELS NFTS", "", true);
    textures.add(wallTitle);
    const titleMat = new THREE.MeshBasicMaterial({ map: wallTitle, transparent: true, toneMapped: false });
    materials.add(titleMat);
    const title = new THREE.Mesh(new THREE.PlaneGeometry(7.2, .9), titleMat);
    title.position.set(0, 6.08, -5.52);
    scene.add(title);

    const loader = new THREE.TextureLoader();
    loader.setCrossOrigin("anonymous");
    const clickable: THREE.Object3D[] = [];
    const displays: { group: THREE.Group; card: THREE.Group; index: number; target: THREE.Vector3; size: number }[] = [];
    assets.forEach((asset, index) => {
      const placeholder = labelTexture(asset.name, "Loading artwork");
      textures.add(placeholder);
      const artMat = new THREE.MeshBasicMaterial({ map: placeholder, toneMapped: false, side: THREE.DoubleSide });
      materials.add(artMat);
      const planes: THREE.Mesh[] = [];
      const frames: THREE.Mesh[] = [];
      const updateRatio = (width: number, height: number) => {
        const ratio = width > 0 && height > 0 ? width / height : .7;
        const cardWidth = Math.min(1.6, 2.2 * ratio);
        const cardHeight = Math.min(2.2, 1.6 / ratio);
        planes.forEach(p => p.scale.set(cardWidth, cardHeight, 1));
        frames.forEach(f => f.scale.set(cardWidth + .045, cardHeight + .045, 1));
      };
      const applyTexture = (texture: THREE.Texture) => {
        if (disposed) { texture.dispose(); return; }
        textures.add(texture);
        texture.colorSpace = THREE.SRGBColorSpace;
        artMat.map = texture;
        artMat.needsUpdate = true;
      };
      const failed = () => {
        if (disposed) return;
        applyTexture(labelTexture(asset.name, "Artwork unavailable"));
      };
      const loadImage = () => {
        if (!asset.imageUrl) { failed(); return; }
        loader.load(asset.imageUrl, texture => {
          if (!disposed) updateRatio(texture.image.width, texture.image.height);
          applyTexture(texture);
        }, undefined, failed);
      };
      const makeCard = () => {
        const group = new THREE.Group();
        const frame = new THREE.Mesh(new THREE.BoxGeometry(1, 1, .065), frameMat);
        frame.position.z = -.042;
        frame.castShadow = true;
        group.add(frame);
        frames.push(frame);
        const art = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), artMat);
        group.add(art);
        planes.push(art);
        group.traverse(child => { child.userData.assetIndex = index; });
        clickable.push(group);
        return group;
      };
      const group = new THREE.Group();
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.16, .62, 64), baseMat);
      pedestal.position.y = .31;
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      group.add(pedestal);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.13, 1.13, .045, 64), topMat);
      cap.position.y = .635;
      group.add(cap);
      [.055, .65].forEach(y => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.12, .012, 6, 64), trimMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y;
        group.add(ring);
      });
      const plaqueTexture = labelTexture(asset.name, mintLabel(asset));
      textures.add(plaqueTexture);
      const plaqueMat = new THREE.MeshBasicMaterial({ map: plaqueTexture, transparent: true, toneMapped: false });
      materials.add(plaqueMat);
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.83, .46), plaqueMat);
      plaque.position.set(0, .33, 1.18);
      group.add(plaque);
      const card = makeCard();
      card.position.y = 1.98;
      group.add(card);
      scene.add(group);
      displays.push({ group, card, index, target: new THREE.Vector3(), size: 1 });

      // Three quieter, repeated highlights; these are not additional owned NFTs.
      if (index < 3) {
        const wallCard = makeCard();
        wallCard.position.set((index - 1) * 2.2, 4.48, -5.45);
        wallCard.scale.setScalar(.7);
        scene.add(wallCard);
      }
      updateRatio(7, 10);
      if (asset.videoUrl) {
        const video = document.createElement("video");
        video.crossOrigin = "anonymous";
        video.muted = true;
        video.loop = true;
        video.playsInline = true;
        video.preload = "auto";
        video.onloadeddata = () => {
          if (disposed) return;
          updateRatio(video.videoWidth, video.videoHeight);
          applyTexture(new THREE.VideoTexture(video));
          if (!mediaQuery.matches && !document.hidden) void video.play().catch(() => undefined);
        };
        video.onerror = loadImage;
        videos.push(video);
        video.src = asset.videoUrl;
        video.load();
      } else loadImage();
    });
    let lastSelection = -1;
    function layout() {
      const selected = selectedRef.current;
      if (lastSelection === selected) return;
      let slot = 0;
      displays.forEach(display => {
        const featured = display.index === selected;
        // Accounts larger than seven retain every item in Quick switch; the
        // room displays the selected item and the first six other collectibles.
        const position = featured ? [0, .65] : surrounding[slot++];
        display.group.visible = !!position;
        if (position) {
          display.target.set(position[0], 0, position[1]);
          display.size = featured ? 1.42 : .9;
          if (lastSelection === -1 || mediaQuery.matches) {
            display.group.position.copy(display.target);
            display.group.scale.setScalar(display.size);
          }
        }
      });
      mount!.dataset.featuredAsset = assets[selected]?.assetId ?? "";
      lastSelection = selected;
    }
    const syncPlayback = () => videos.forEach(video => {
      if (mediaQuery.matches || document.hidden) video.pause();
      else if (video.readyState >= 2) void video.play().catch(() => undefined);
    });
    mediaQuery.addEventListener("change", syncPlayback);
    document.addEventListener("visibilitychange", syncPlayback);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let startX = 0, startY = 0;
    const down = (event: PointerEvent) => { startX = event.clientX; startY = event.clientY; };
    const up = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - startX, event.clientY - startY) > 5) return;
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(clickable, true).find(item => {
        let object: THREE.Object3D | null = item.object;
        while (object) { if (!object.visible) return false; object = object.parent; }
        return true;
      });
      if (hit) onSelectRef.current(hit.object.userData.assetIndex);
    };
    renderer.domElement.addEventListener("pointerdown", down);
    renderer.domElement.addEventListener("pointerup", up);
    const lost = (event: Event) => { event.preventDefault(); setUnavailable(true); };
    renderer.domElement.addEventListener("webglcontextlost", lost);
    const resize = () => {
      const width = Math.max(mount.clientWidth, 1), height = Math.max(mount.clientHeight, 1);
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      const distance = Math.max(14.5, 18 / camera.aspect + 1);
      camera.position.set(0, 2.45 + distance * .22, distance);
      camera.updateProjectionMatrix();
      controls.update();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();
    let frameId = 0, previousTime = 0;
    const animate = (time: number) => {
      const delta = Math.min((time - previousTime) / 1000, .05);
      previousTime = time;
      layout();
      displays.forEach(display => {
        if (!display.group.visible) return;
        const amount = mediaQuery.matches ? 1 : 1 - Math.exp(-delta * 8);
        display.group.position.lerp(display.target, amount);
        display.group.scale.lerp(new THREE.Vector3(display.size, display.size, display.size), amount);
        display.card.position.y = 1.98 + (mediaQuery.matches ? 0 : Math.sin(time * .0008 + display.index) * .035);
      });
      controls.update();
      if (!document.hidden) renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    frameId = requestAnimationFrame(animate);
    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      controls.dispose();
      mediaQuery.removeEventListener("change", syncPlayback);
      document.removeEventListener("visibilitychange", syncPlayback);
      renderer.domElement.removeEventListener("pointerdown", down);
      renderer.domElement.removeEventListener("pointerup", up);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      videos.forEach(video => { video.onloadeddata = null; video.onerror = null; video.pause(); video.removeAttribute("src"); video.load(); });
      scene.traverse(object => { if (object instanceof THREE.Mesh) object.geometry.dispose(); });
      textures.forEach(texture => texture.dispose());
      materials.forEach(material => material.dispose());
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [assets]);

  return <div className="room-canvas" ref={mountRef}>
    {unavailable && <p className="room-unavailable" role="status">3D viewing is unavailable in this browser. You can still explore every NFT using Quick switch and My Collection.</p>}
  </div>;
}
