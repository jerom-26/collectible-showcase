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
  ctx.fillStyle = wall ? "#342a21" : "#f6f1e9";
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

function pedestalLabelTexture(title: string, subtitle: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 360;
  const ctx = canvas.getContext("2d")!;
  const background = ctx.createLinearGradient(0, 0, 0, canvas.height);
  background.addColorStop(0, "#3b3025");
  background.addColorStop(1, "#211a14");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "#8e7252";
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff8ec";
  ctx.shadowColor = "rgba(0, 0, 0, .55)";
  ctx.shadowBlur = 8;
  ctx.font = "700 76px Arial";
  const words = title.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > 900 && line) { lines.push(line); line = word; }
    else line = next;
  }
  lines.push(line);
  const visibleLines = lines.slice(0, 2);
  const startY = visibleLines.length === 1 ? 125 : 88;
  visibleLines.forEach((value, index) => ctx.fillText(value, 512, startY + index * 72, 920));
  ctx.shadowBlur = 0;
  ctx.fillStyle = "#d7bd96";
  ctx.font = "600 58px Arial";
  ctx.fillText(subtitle, 512, 286, 900);
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
    scene.background = new THREE.Color("#a99a89");
    scene.fog = new THREE.Fog("#a99a89", 34, 58);
    const camera = new THREE.PerspectiveCamera(40, 1, .1, 70);
    const target = new THREE.Vector3(0, 2.45, -.2);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
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

    scene.add(new THREE.HemisphereLight("#fff5e6", "#62584f", 1.45));
    scene.add(new THREE.AmbientLight("#f0dfc8", .28));
    const light = new THREE.DirectionalLight("#fff1dd", 1.65);
    light.position.set(1, 10, 7);
    light.castShadow = true;
    light.shadow.mapSize.set(2048, 2048);
    Object.assign(light.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    light.shadow.bias = -.001;
    scene.add(light);
    const glow = new THREE.PointLight("#f2d1a6", 24, 20, 2);
    glow.position.set(0, 5.4, -3.2);
    scene.add(glow);

    const centerLight = new THREE.SpotLight("#ffe5c2", 68, 24, Math.PI * .23, .76, 1.45);
    centerLight.position.set(0, 7.25, 3.8);
    centerLight.target.position.set(0, .4, .65);
    centerLight.castShadow = true;
    centerLight.shadow.mapSize.set(1024, 1024);
    centerLight.shadow.bias = -.001;
    scene.add(centerLight, centerLight.target);

    const wallWashLeft = new THREE.PointLight("#e7c69d", 14, 13, 2);
    wallWashLeft.position.set(-7.7, 5.8, -4.7);
    const wallWashRight = wallWashLeft.clone();
    wallWashRight.position.x = 7.7;
    scene.add(wallWashLeft, wallWashRight);

    const cornerFillLeft = new THREE.PointLight("#c9b397", 15, 12, 2);
    cornerFillLeft.position.set(-8.7, 2.8, 1.3);
    const cornerFillRight = cornerFillLeft.clone();
    cornerFillRight.position.x = 8.7;
    scene.add(cornerFillLeft, cornerFillRight);

    const surfaceTexture = (base: number, variation: number, repeatX: number, repeatY: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = 128;
      canvas.height = 128;
      const context = canvas.getContext("2d")!;
      const pixels = context.createImageData(canvas.width, canvas.height);
      for (let index = 0; index < pixels.data.length; index += 4) {
        const grain = base + (Math.random() - .5) * variation;
        pixels.data[index] = grain;
        pixels.data[index + 1] = grain;
        pixels.data[index + 2] = grain;
        pixels.data[index + 3] = 255;
      }
      context.putImageData(pixels, 0, 0);
      const texture = new THREE.CanvasTexture(canvas);
      texture.wrapS = THREE.RepeatWrapping;
      texture.wrapT = THREE.RepeatWrapping;
      texture.repeat.set(repeatX, repeatY);
      texture.colorSpace = THREE.NoColorSpace;
      textures.add(texture);
      return texture;
    };
    const wallVariation = surfaceTexture(154, 18, 7, 4);
    const floorVariation = surfaceTexture(142, 16, 9, 9);
    const woodVariation = surfaceTexture(132, 22, 2, 8);
    const wallMat = new THREE.MeshStandardMaterial({
      color: "#968673",
      roughness: .76,
      metalness: .02,
      roughnessMap: wallVariation,
      bumpMap: wallVariation,
      bumpScale: .014,
    });
    const featureWallMat = new THREE.MeshStandardMaterial({ color: "#ad9c87", roughness: .72, metalness: .02, roughnessMap: wallVariation });
    const ceilingMat = new THREE.MeshStandardMaterial({ color: "#b9aa96", roughness: .8, metalness: .01 });
    const woodMat = new THREE.MeshStandardMaterial({ color: "#74543b", roughness: .62, metalness: .04, roughnessMap: woodVariation, bumpMap: woodVariation, bumpScale: .018 });
    const baseMat = new THREE.MeshStandardMaterial({ color: "#403225", metalness: .48, roughness: .4, roughnessMap: wallVariation });
    const topMat = new THREE.MeshStandardMaterial({ color: "#6a563f", metalness: .58, roughness: .34 });
    const trimMat = new THREE.MeshStandardMaterial({ color: "#a7845d", emissive: "#60462c", emissiveIntensity: .16, metalness: .66, roughness: .38 });
    const frameMat = new THREE.MeshStandardMaterial({ color: "#5c4a39", metalness: .56, roughness: .42 });
    const labelBackingMat = new THREE.MeshStandardMaterial({ color: "#211a14", metalness: .35, roughness: .48 });
    const downlightMat = new THREE.MeshStandardMaterial({ color: "#e8d3b5", emissive: "#ffe3ba", emissiveIntensity: 1.2, roughness: .5 });
    [wallMat, featureWallMat, ceilingMat, woodMat, baseMat, topMat, trimMat, frameMat, labelBackingMat, downlightMat].forEach(m => materials.add(m));
    function box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    }
    const floorMat = new THREE.MeshPhysicalMaterial({
      color: "#716961",
      roughness: .34,
      metalness: .16,
      clearcoat: .3,
      clearcoatRoughness: .5,
      roughnessMap: floorVariation,
      bumpMap: floorVariation,
      bumpScale: .009,
    });
    materials.add(floorMat);
    box(28, .2, 28, 0, -.12, 0, floorMat);
    box(20, 8, .25, 0, 3.9, -5.8, wallMat);
    box(.25, 8, 15, -9.6, 3.9, 1.5, wallMat);
    box(.25, 8, 15, 9.6, 3.9, 1.5, wallMat);
    box(20, .2, 18, 0, 7.9, 2, ceilingMat);
    box(10.8, 6.55, .1, 0, 3.55, -5.61, featureWallMat);
    [-7.25, 7.25].forEach(x => box(2.15, 6.6, .12, x, 3.55, -5.55, woodMat));
    [-8.1, -7.55, -7, -6.45, 6.45, 7, 7.55, 8.1].forEach(x => box(.035, 6.25, .04, x, 3.55, -5.46, frameMat));
    box(18, .035, .075, 0, 6.88, -5.46, trimMat);
    box(18, .02, .075, 0, .28, -5.46, trimMat);
    [-5.55, 5.55].forEach(x => box(.045, 6.35, .05, x, 3.55, -5.5, trimMat));
    [-8.65, 8.65].forEach(x => box(.055, 6.5, .055, x, 3.6, -5.36, downlightMat));
    [-6.5, -2.2, 2.2, 6.5].forEach(x => box(2.8, .035, .09, x, 7.72, -2.9, downlightMat));

    const displaySlots = [[0, .65], ...surrounding];
    displaySlots.forEach(([x, z], index) => {
      const spot = new THREE.SpotLight("#ffe7c5", index === 0 ? 26 : 13, 14, Math.PI * .14, .84, 1.5);
      spot.position.set(x, 7.35, z + .25);
      spot.target.position.set(x, .7, z);
      scene.add(spot, spot.target);
      const fixture = new THREE.Mesh(new THREE.CylinderGeometry(.11, .11, .035, 24), downlightMat);
      fixture.position.set(x, 7.73, z + .25);
      scene.add(fixture);
    });
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
    const displays: { group: THREE.Group; card: THREE.Group; cardBaseY: number; index: number; target: THREE.Vector3; size: number }[] = [];
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
      const pedestalHeight = [.8, .68, .86, .72, .82, .7, .76][index % 7];
      const footHeight = .1;
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(1.18, 1.2, footHeight, 64), baseMat);
      foot.position.y = footHeight / 2;
      foot.castShadow = true;
      foot.receiveShadow = true;
      group.add(foot);
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.17, pedestalHeight, 64), baseMat);
      pedestal.position.y = footHeight + pedestalHeight / 2;
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      group.add(pedestal);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(1.13, 1.13, .045, 64), topMat);
      cap.position.y = footHeight + pedestalHeight + .0225;
      group.add(cap);
      [footHeight + .012, footHeight + pedestalHeight + .045].forEach(y => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(1.13, .014, 6, 64), trimMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y;
        group.add(ring);
      });
      const plaqueTexture = pedestalLabelTexture(asset.name, mintLabel(asset));
      textures.add(plaqueTexture);
      const plaqueMat = new THREE.MeshStandardMaterial({ map: plaqueTexture, roughness: .5, metalness: .16 });
      materials.add(plaqueMat);
      const plaqueBacking = new THREE.Mesh(new THREE.BoxGeometry(1.9, .64, .035), labelBackingMat);
      plaqueBacking.position.set(0, footHeight + pedestalHeight * .5, 1.145);
      group.add(plaqueBacking);
      const plaque = new THREE.Mesh(new THREE.PlaneGeometry(1.8, .56), plaqueMat);
      plaque.position.set(0, footHeight + pedestalHeight * .5, 1.166);
      group.add(plaque);
      const card = makeCard();
      const cardBaseY = footHeight + pedestalHeight + 1.28;
      card.position.y = cardBaseY;
      group.add(card);
      scene.add(group);
      displays.push({ group, card, cardBaseY, index, target: new THREE.Vector3(), size: 1 });

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
        display.card.position.y = display.cardBaseY + (mediaQuery.matches ? 0 : Math.sin(time * .0008 + display.index) * .035);
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
