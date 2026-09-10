import * as THREE from './vendor/three.module.js';
import { createBoat } from './models.js';

// One offscreen context serves every card. Only PNGs stay in the interface;
// opening the shop does not create a fleet of competing WebGL contexts.
const thumbnails = new Map();
let studio;
let unavailable = false;

function makeStudio() {
  if (unavailable) return null;
  if (studio) return studio;
  try {
    const canvas = document.createElement('canvas');
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(1);
    renderer.setSize(660, 420, false);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x092331, 0);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(30, 660 / 420, .1, 80);
    camera.position.set(6.5, 5.2, 8.2);
    camera.lookAt(0, .82, 0);
    scene.add(new THREE.HemisphereLight(0xd4efff, 0x526874, 1.85));

    const sunlight = new THREE.DirectionalLight(0xffe3b2, 3.8);
    sunlight.position.set(-3, 9, 5);
    sunlight.castShadow = true;
    sunlight.shadow.mapSize.set(1024, 1024);
    sunlight.shadow.camera.left = -6;
    sunlight.shadow.camera.right = 6;
    sunlight.shadow.camera.top = 6;
    sunlight.shadow.camera.bottom = -6;
    sunlight.shadow.camera.near = .5;
    sunlight.shadow.camera.far = 25;
    sunlight.shadow.camera.updateProjectionMatrix();
    sunlight.shadow.normalBias = .035;
    sunlight.shadow.bias = -.0002;
    sunlight.shadow.radius = 4;
    scene.add(sunlight);

    const rim = new THREE.DirectionalLight(0x97d9ff, 2.4);
    rim.position.set(2, 4, -6);
    scene.add(rim);
    const fill = new THREE.DirectionalLight(0xffffff, 1);
    fill.position.set(5, 2, 7);
    scene.add(fill);

    const platform = new THREE.Mesh(
      new THREE.CircleGeometry(4.5, 96),
      new THREE.ShadowMaterial({ color: 0x000914, opacity: .22 }),
    );
    platform.rotation.x = -Math.PI / 2;
    platform.position.y = -.73;
    platform.receiveShadow = true;
    scene.add(platform);

    // A faint elliptical berth grounds the object without masking the hull.
    const berth = new THREE.Mesh(
      new THREE.RingGeometry(3.68, 3.7, 96),
      new THREE.MeshBasicMaterial({ color: 0xaccdd1, transparent: true, opacity: .13, side: THREE.DoubleSide }),
    );
    berth.rotation.x = -Math.PI / 2;
    berth.position.y = -.74;
    berth.scale.y = .72;
    scene.add(berth);
    canvas.addEventListener('webglcontextlost', event => {
      event.preventDefault();
      unavailable = true;
      studio = null;
    });
    studio = { renderer, scene, camera };
    return studio;
  } catch {
    unavailable = true;
    return null;
  }
}

function disposeBoat(boat) {
  const geometries = new Set();
  const materials = new Set();
  boat.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
}

/** Render a shared, actual 3D boat model as an economical, cached card image. */
export function renderBoatPreview(boatId, color, livery = 'plain') {
  const key = `${boatId}:${color}:${livery}`;
  if (thumbnails.has(key)) return thumbnails.get(key);
  const context = makeStudio();
  if (!context) return null;
  let boat;
  try {
    boat = createBoat({ boat: boatId, color, livery });
    boat.rotation.y = -.1;
    if (boat.userData.turret) boat.userData.turret.rotation.y = -.12;
    context.scene.add(boat);
    context.renderer.render(context.scene, context.camera);
    const image = context.renderer.domElement.toDataURL('image/png');
    thumbnails.set(key, image);
    if (thumbnails.size > 64) thumbnails.delete(thumbnails.keys().next().value);
    return image;
  } catch {
    return null;
  } finally {
    if (boat) {
      context.scene.remove(boat);
      disposeBoat(boat);
    }
  }
}
