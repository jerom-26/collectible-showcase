"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { mintLabel, type ShowcaseAsset } from "@/lib/collection";

// Six display positions leave a clear sightline to the featured piece.
const surrounding = [[-2.35, -2], [2.35, -2], [-5.9, -.5], [5.9, -.5], [-3.6, 1], [3.6, 1]];

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
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "#fff8ec";
  ctx.shadowColor = "rgba(0, 0, 0, .55)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = -3;
  ctx.font = "800 94px Arial";
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
  ctx.font = "700 76px Arial";
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
    const camera = new THREE.PerspectiveCamera(34, 1, .1, 70);
    const target = new THREE.Vector3(0, 2.8, -.8);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute("aria-label", "3D collector room. Use Quick switch below to select a collectible.");
    mount.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.copy(target);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minAzimuthAngle = -.22;
    controls.maxAzimuthAngle = .22;
    controls.minPolarAngle = 1.42;
    controls.maxPolarAngle = 1.56;
    controls.enableZoom = false;

    scene.add(new THREE.HemisphereLight("#fff5e6", "#62584f", 1.7));
    scene.add(new THREE.AmbientLight("#f0dfc8", .28));
    const light = new THREE.DirectionalLight("#fff1dd", 1.1);
    light.position.set(1, 10, 7);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    Object.assign(light.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
    light.shadow.bias = -.001;
    scene.add(light);
    const glow = new THREE.PointLight("#f2d1a6", 14, 24, 2);
    glow.position.set(0, 8.2, -5);
    scene.add(glow);

    const centerLight = new THREE.SpotLight("#ffe5c2", 48, 24, Math.PI * .26, 1, 1.45);
    centerLight.position.set(0, 6.15, 3.4);
    centerLight.target.position.set(0, 1.2, -1);
    centerLight.castShadow = true;
    centerLight.shadow.mapSize.set(1024, 1024);
    centerLight.shadow.bias = -.001;
    scene.add(centerLight, centerLight.target);

    const wallWashLeft = new THREE.PointLight("#e7c69d", 8, 18, 2);
    wallWashLeft.position.set(-9.5, 7.8, -8.5);
    const wallWashRight = wallWashLeft.clone();
    wallWashRight.position.x = 9.5;
    scene.add(wallWashLeft, wallWashRight);

    const cornerFillLeft = new THREE.PointLight("#c9b397", 6, 16, 2);
    cornerFillLeft.position.set(-10.5, 5.5, -.8);
    const cornerFillRight = cornerFillLeft.clone();
    cornerFillRight.position.x = 10.5;
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
    const wallVariation = surfaceTexture(230, 4, 7, 4);
    const floorVariation = surfaceTexture(228, 6, 6, 6);
    const woodCanvas = document.createElement("canvas");
    woodCanvas.width = woodCanvas.height = 256;
    const woodContext = woodCanvas.getContext("2d")!;
    woodContext.fillStyle = "#eeeeee";
    woodContext.fillRect(0, 0, 256, 256);
    for (let x = 0; x < 256; x += 2) {
      woodContext.strokeStyle = `rgba(95,85,70,${.035 + (Math.sin(x * 1.73) + 1) * .02})`;
      woodContext.lineWidth = .6;
      woodContext.beginPath();
      woodContext.moveTo(x, 0);
      woodContext.bezierCurveTo(x + Math.sin(x) * 3, 85, x - 2, 170, x + 1, 256);
      woodContext.stroke();
    }
    const woodVariation = new THREE.CanvasTexture(woodCanvas);
    woodVariation.colorSpace = THREE.NoColorSpace;
    textures.add(woodVariation);
    // Broad, low-contrast plaster variation under fine grain, generated once.
    const plasterCanvas = document.createElement("canvas");
    plasterCanvas.width = plasterCanvas.height = 512;
    const plasterContext = plasterCanvas.getContext("2d")!;
    plasterContext.fillStyle = "#eeeae4";
    plasterContext.fillRect(0, 0, 512, 512);
    let plasterSeed = 37;
    const plasterRandom = () => {
      plasterSeed = (Math.imul(plasterSeed, 1664525) + 1013904223) >>> 0;
      return plasterSeed / 4294967296;
    };
    for (let i = 0; i < 90; i++) {
      const x = plasterRandom() * 512, y = plasterRandom() * 512;
      const radius = 25 + plasterRandom() * 100;
      const wash = plasterContext.createRadialGradient(x, y, 0, x, y, radius);
      wash.addColorStop(0, i % 2 ? "rgba(105,98,87,.018)" : "rgba(255,255,255,.03)");
      wash.addColorStop(1, "rgba(160,150,135,0)");
      plasterContext.fillStyle = wash;
      plasterContext.fillRect(0, 0, 512, 512);
    }
    const plasterPixels = plasterContext.getImageData(0, 0, 512, 512);
    for (let i = 0; i < plasterPixels.data.length; i += 4) {
      const grain = (plasterRandom() - .5) * 2;
      for (let channel = 0; channel < 3; channel++) plasterPixels.data[i + channel] += grain;
    }
    plasterContext.putImageData(plasterPixels, 0, 0);
    const plasterMap = new THREE.CanvasTexture(plasterCanvas);
    plasterMap.colorSpace = THREE.SRGBColorSpace;
    const plasterBump = plasterMap.clone();
    plasterBump.colorSpace = THREE.NoColorSpace;
    textures.add(plasterMap);
    textures.add(plasterBump);
    const wallMat = new THREE.MeshStandardMaterial({
      color: "#968673",
      roughness: .88,
      metalness: 0,
      map: plasterMap,
      bumpMap: plasterBump,
      bumpScale: .016,
    });
    const featureWallMat = new THREE.MeshStandardMaterial({ color: "#ad9c87", roughness: .84, metalness: 0, map: plasterMap, bumpMap: plasterBump, bumpScale: .025 });
    const ceilingMat = new THREE.MeshStandardMaterial({ color: "#b9aa96", roughness: .8, metalness: .01 });
    const woodMat = new THREE.MeshStandardMaterial({ color: "#74543b", roughness: .68, metalness: 0, roughnessMap: woodVariation, bumpMap: woodVariation, bumpScale: .012 });
    const baseMat = new THREE.MeshStandardMaterial({ color: "#403225", metalness: .65, roughness: .48, roughnessMap: wallVariation });
    const recessMat = new THREE.MeshStandardMaterial({ color: "#9b8c79", roughness: .9, metalness: 0, map: plasterMap, bumpMap: plasterBump, bumpScale: .012 });
    materials.add(recessMat);
    const topMat = new THREE.MeshStandardMaterial({ color: "#6a563f", metalness: .58, roughness: .34 });
    const trimMat = new THREE.MeshStandardMaterial({ color: "#a7845d", emissive: "#60462c", emissiveIntensity: .16, metalness: .66, roughness: .38 });
    const frameMat = new THREE.MeshStandardMaterial({ color: "#5c4a39", metalness: .56, roughness: .42 });
    const downlightMat = new THREE.MeshStandardMaterial({ color: "#e8d3b5", emissive: "#ffe3ba", emissiveIntensity: 1.2, roughness: .5 });
    const wallStripMat = downlightMat.clone();
    wallStripMat.emissiveIntensity = .12;
    materials.add(wallStripMat);
    [wallMat, featureWallMat, ceilingMat, woodMat, baseMat, topMat, trimMat, frameMat, downlightMat].forEach(m => materials.add(m));
    function box(w: number, h: number, d: number, x: number, y: number, z: number, material: THREE.Material) {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
      mesh.position.set(x, y, z);
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    }
    const floorMat = new THREE.MeshPhysicalMaterial({
      color: "#716961",
      roughness: .58,
      metalness: 0,
      clearcoat: .12,
      clearcoatRoughness: .65,
      roughnessMap: floorVariation,
      bumpMap: floorVariation,
      bumpScale: .004,
    });
    materials.add(floorMat);
    box(30, .2, 29, 0, -.12, -1.5, floorMat);
    box(26, 9.4, .25, 0, 4.55, -12, wallMat);
    box(.25, 9.4, 25, -13, 4.55, .5, wallMat);
    box(.25, 9.4, 25, 13, 4.55, .5, wallMat);
    box(26, .2, 25, 0, 9.25, .5, ceilingMat);
    // The wall is built around an opening, with a recessed back and plaster returns.
    box(14, 4.8, .34, 0, 3.1, -11.82, featureWallMat);
    box(14, .25, .34, 0, 8.125, -11.82, featureWallMat);
    [-5.65, 5.65].forEach(x => box(2.7, 2.5, .34, x, 6.75, -11.82, featureWallMat));
    box(8.6, 2.5, .025, 0, 6.75, -11.85, recessMat);
    [-4.3, 4.3].forEach(x => box(.09, 2.5, .5, x, 6.75, -11.62, featureWallMat));
    box(8.6, .09, .5, 0, 8, -11.62, featureWallMat);
    const exhibitSill = box(8.9, .12, .58, 0, 5.5, -11.6, featureWallMat);
    exhibitSill.castShadow = true;
    [-10.2, 10.2].forEach(x => box(2.25, 7.7, .2, x, 4.4, -11.68, woodMat));
    [-11, -10.45, -9.9, -9.35, 9.35, 9.9, 10.45, 11].forEach(x => box(.035, 7.35, .04, x, 4.4, -11.55, frameMat));
    box(23.4, .035, .075, 0, 8.4, -11.54, trimMat);
    box(23.4, .02, .075, 0, .38, -11.54, trimMat);
    [-7, 7].forEach(x => box(.045, 7.4, .05, x, 4.4, -11.62, trimMat));
    [-12, 12].forEach(x => box(.022, 7.7, .025, x, 4.45, -11.58, wallStripMat));
    box(18, .18, 1.05, 0, 9.08, -11.05, ceilingMat);
    [-11.5, 11.5].forEach(x => box(.18, .16, 22, x, 9.08, .5, ceilingMat));
    [-8.4, -2.8, 2.8, 8.4].forEach(x => box(2.45, .035, .09, x, 9.05, -7.5, downlightMat));

    const displaySlots = [[0, -1], ...surrounding];
    displaySlots.forEach(([x, z], index) => {
      const spot = new THREE.SpotLight("#ffe7c5", index === 0 ? 26 : 13, 14, Math.PI * .14, .84, 1.5);
      spot.position.set(x, 7.1, z + .2);
      spot.target.position.set(x, 1.05, z);
      scene.add(spot, spot.target);
      const fixture = new THREE.Mesh(new THREE.CylinderGeometry(.11, .11, .035, 24), downlightMat);
      fixture.position.set(x, 9.1, z + .2);
      scene.add(fixture);
    });
    const wallTitle = labelTexture("MY HOT WHEELS NFTS", "", true);
    textures.add(wallTitle);
    const titleMat = new THREE.MeshBasicMaterial({ map: wallTitle, transparent: true, toneMapped: false });
    materials.add(titleMat);
    const title = new THREE.Mesh(new THREE.PlaneGeometry(7.2, .9), titleMat);
    title.position.set(0, 7.6, -11.42);
    scene.add(title);

    const loader = new THREE.TextureLoader();
    const shadowCanvas = document.createElement("canvas");
    shadowCanvas.width = shadowCanvas.height = 128;
    const shadowContext = shadowCanvas.getContext("2d")!;
    const shadowGradient = shadowContext.createRadialGradient(64, 64, 8, 64, 64, 64);
    shadowGradient.addColorStop(0, "rgba(0,0,0,.48)");
    shadowGradient.addColorStop(.5, "rgba(0,0,0,.22)");
    shadowGradient.addColorStop(1, "rgba(0,0,0,0)");
    shadowContext.fillStyle = shadowGradient;
    shadowContext.fillRect(0, 0, 128, 128);
    const contactTexture = new THREE.CanvasTexture(shadowCanvas);
    textures.add(contactTexture);
    const contactMat = new THREE.MeshBasicMaterial({ map: contactTexture, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
    materials.add(contactMat);
    loader.setCrossOrigin("anonymous");
    const clickable: THREE.Object3D[] = [];
    const displays: { group: THREE.Group; card: THREE.Group; cardBaseY: number; index: number; target: THREE.Vector3; size: number }[] = [];
    assets.forEach((asset, index) => {
      const placeholder = labelTexture(asset.name, "Loading artwork");
      textures.add(placeholder);
      const artMat = new THREE.MeshBasicMaterial({ map: placeholder, toneMapped: false, side: THREE.DoubleSide });
      materials.add(artMat);
      const reflectionMat = new THREE.MeshBasicMaterial({ map: placeholder, transparent: true, opacity: .075, depthWrite: false, toneMapped: false });
      materials.add(reflectionMat);
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
        reflectionMat.map = texture;
        reflectionMat.needsUpdate = true;
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
      const originalHeight = [.9, .84, .98, .88, .95, .86, .92][index % 7];
      const pedestalHeight = originalHeight - .06;
      const footHeight = .06;
      const foot = new THREE.Mesh(new THREE.CylinderGeometry(.86, .88, footHeight, 64), baseMat);
      foot.position.y = footHeight / 2;
      foot.castShadow = true;
      foot.receiveShadow = true;
      group.add(foot);
      const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(.9, .9, pedestalHeight, 96), baseMat);
      pedestal.position.y = footHeight + pedestalHeight / 2;
      pedestal.castShadow = true;
      pedestal.receiveShadow = true;
      group.add(pedestal);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(.915, .915, .025, 96), topMat);
      cap.position.y = footHeight + pedestalHeight + .0125;
      cap.receiveShadow = true;
      group.add(cap);
      [footHeight + .012, footHeight + pedestalHeight + .025].forEach(y => {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(.908, .008, 6, 96), trimMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.y = y;
        group.add(ring);
      });
      const plaqueTexture = pedestalLabelTexture(asset.name, mintLabel(asset));
      textures.add(plaqueTexture);
      plaqueTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      const plaqueMat = new THREE.MeshStandardMaterial({ map: plaqueTexture, transparent: true, roughness: .65, metalness: .1, emissiveMap: plaqueTexture, emissive: "#fff8ec", emissiveIntensity: .25, depthWrite: false });
      materials.add(plaqueMat);
      // Lettering hugs the cylinder rather than projecting on a separate plaque.
      const plaque = new THREE.Mesh(new THREE.CylinderGeometry(.902, .902, pedestalHeight * .88, 64, 1, true, -1.05, 2.1), plaqueMat);
      plaque.position.set(0, footHeight + pedestalHeight * .5, 0);
      group.add(plaque);
      const capY = footHeight + pedestalHeight + .025;
      const contact = new THREE.Mesh(new THREE.PlaneGeometry(1.55, .8), contactMat);
      contact.rotation.x = -Math.PI / 2;
      contact.position.set(0, capY + .003, 0);
      group.add(contact);
      const reflection = new THREE.Mesh(new THREE.PlaneGeometry(1.15, .5), reflectionMat);
      reflection.rotation.x = -Math.PI / 2;
      reflection.position.set(0, capY + .005, .25);
      group.add(reflection);
      const groundContact = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.3), contactMat);
      groundContact.rotation.x = -Math.PI / 2;
      groundContact.position.y = .002;
      groundContact.scale.setScalar(1.12);
      group.add(groundContact);
      const card = makeCard();
      const cardBaseY = .1 + originalHeight + 1.28;
      card.position.y = cardBaseY;
      group.add(card);
      scene.add(group);
      displays.push({ group, card, cardBaseY, index, target: new THREE.Vector3(), size: 1 });

      // Three quieter, repeated highlights; these are not additional owned NFTs.
      if (index < 3) {
        const wallCard = makeCard();
        wallCard.position.set((index - 1) * 2.25, 6.45, -11.38);
        wallCard.scale.setScalar(.7);
        wallCard.traverse(child => { child.castShadow = false; });
        const wallContact = new THREE.Mesh(new THREE.PlaneGeometry(1.35, 1.85), contactMat);
        wallContact.position.set(wallCard.position.x, wallCard.position.y, -11.83);
        scene.add(wallContact);
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
        const position = featured ? [0, -1] : surrounding[slot++];
        display.group.visible = !!position;
        if (position) {
          display.target.set(position[0], 0, position[1]);
          display.size = featured ? 1.2 : .78;
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
      // Fit the outer displays with a margin even in a narrower browser pane.
      const distance = Math.max(12.5, 6.9 / (Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect));
      camera.position.set(0, 3, distance);
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
        const featuredLift = display.index === selectedRef.current ? .035 : 0;
        display.card.position.y = display.cardBaseY + featuredLift + (mediaQuery.matches ? 0 : Math.sin(time * .00065 + display.index) * .045);
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
