import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { FXAAPass } from 'three/addons/postprocessing/FXAAPass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Octree } from 'three/addons/math/Octree.js';
import { standardRaceTracks } from '../race-courses.js';
import { usernameError } from '../username-policy.js';
import flagCountryCatalog from 'flag-icons/country.json';

const root = document.querySelector('.app-shell');
const mount = document.querySelector('#world');
let worldLoadFailureActive = false;

function showWorldLoadFailure(message) {
  worldLoadFailureActive = true;
  root.classList.remove('has-rendered-world');
  const screen = document.querySelector('.world-loading-screen');
  if (!screen) return;
  screen.setAttribute('aria-label', 'The flight world could not start');
  screen.querySelector('strong').textContent = 'The world could not start';
  screen.querySelector('p').textContent = message;
  screen.querySelector('.world-loading-progress').hidden = true;
  screen.querySelector('#worldLoadingRetry').hidden = false;
}

function resetWorldLoadScreen() {
  worldLoadFailureActive = false;
  const screen = document.querySelector('.world-loading-screen');
  if (!screen) return;
  screen.setAttribute('aria-label', 'Preparing the flight world');
  screen.querySelector('strong').textContent = 'Preparing your flight';
  screen.querySelector('p').textContent = 'Loading the world';
  screen.querySelector('.world-loading-progress').hidden = false;
  screen.querySelector('#worldLoadingRetry').hidden = true;
}

const scene = new THREE.Scene();
scene.background = new THREE.Color('#080d1d');
scene.fog = new THREE.Fog('#080d1d', 92, 235);

const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 5000);
camera.position.set(39, 26, 42);
camera.lookAt(-2, 3, 0);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
let gateModelLoader = null;
const gateModelCache = new Map();
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.92;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor('#080d1d', 1);
renderer.domElement.setAttribute('aria-label', 'Interactive 3D neon FPV flight world');
mount.appendChild(renderer.domElement);
renderer.domElement.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  showWorldLoadFailure('Graphics were interrupted. Reload the world to restore rendering.');
});
renderer.domElement.addEventListener('webglcontextrestored', resetWorldLoadScreen);

const pmremGenerator = new THREE.PMREMGenerator(renderer);
const studioEnvironment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04);
scene.environment = studioEnvironment.texture;
scene.environmentIntensity = 0.16;
pmremGenerator.dispose();

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.target.set(-2, 3, 0);
orbit.enableDamping = true;
orbit.dampingFactor = 0.055;
orbit.enablePan = false;
orbit.rotateSpeed = 0.44;
orbit.zoomSpeed = 0.75;
orbit.minDistance = 22;
orbit.maxDistance = 85;
orbit.minPolarAngle = 0.26;
orbit.maxPolarAngle = Math.PI * 0.48;
orbit.enabled = false;

const hemi = new THREE.HemisphereLight(0x7184b8, 0x0a101a, 0.58);
scene.add(hemi);
const menuAmbientRoot = new THREE.Group();
menuAmbientRoot.name = 'Menu hangar ambient bounce';
const menuAmbientSky = new THREE.HemisphereLight(0x91c7e0, 0x182637, 0.19);
const menuCyanBounce = new THREE.PointLight(0x45dcff, 58, 104, 2);
const menuPinkBounce = new THREE.PointLight(0xff55bd, 44, 96, 2);
menuCyanBounce.position.set(-17, 13, -2);
menuPinkBounce.position.set(18, 16, -13);
const menuKeyLight = new THREE.DirectionalLight(0xa9c5e2, 0.32);
menuKeyLight.position.set(-22, 35, 30);
const menuRimLight = new THREE.DirectionalLight(0x55dfff, 0.32);
menuRimLight.position.set(30, 24, -72);
const menuWarmBounce = new THREE.PointLight(0xffb078, 19, 64, 2);
menuWarmBounce.position.set(3, 9, 17);
menuAmbientRoot.add(menuAmbientSky, menuCyanBounce, menuPinkBounce, menuKeyLight, menuRimLight, menuWarmBounce);
const moon = new THREE.DirectionalLight(0x8fa9ff, 0.9);
moon.position.set(-32, 58, 25);
moon.target.position.set(0, 0, -20);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
moon.shadow.camera.left = -118;
moon.shadow.camera.right = 118;
moon.shadow.camera.top = 92;
moon.shadow.camera.bottom = -92;
moon.shadow.camera.near = 0.5;
moon.shadow.camera.far = 250;
moon.shadow.camera.updateProjectionMatrix();
moon.shadow.bias = -0.00018;
moon.shadow.normalBias = 0.035;
moon.shadow.radius = 3;
scene.add(moon);
scene.add(moon.target);
const fill = new THREE.DirectionalLight(0x526bff, 0.34);
fill.position.set(35, 25, -42);
scene.add(fill);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.82, 0.72, 0.58);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());
composer.addPass(new FXAAPass());
const starPositions = new Float32Array(900 * 3);
let starSeed = 43721;
const nextStarRandom = () => {
  starSeed = (starSeed * 16807) % 2147483647;
  return starSeed / 2147483647;
};
for (let i = 0; i < starPositions.length; i += 3) {
  const angle = nextStarRandom() * Math.PI * 2;
  const vertical = 0.05 + nextStarRandom() * 0.9;
  const horizontal = Math.sqrt(1 - vertical * vertical);
  const distance = 2200 + nextStarRandom() * 1000;
  starPositions[i] = Math.cos(angle) * horizontal * distance;
  starPositions[i + 1] = vertical * distance;
  starPositions[i + 2] = Math.sin(angle) * horizontal * distance;
}
const starGeometry = new THREE.BufferGeometry();
starGeometry.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xb4d7ff, size: 1.05, sizeAttenuation: false, transparent: true, opacity: 0.82, fog: false }));
stars.name = 'Night sky stars';
scene.add(stars);

const colors = {
  asphalt: 0x151b31,
  concrete: 0x303951,
  light: 0x59637f,
  dark: 0x11172b,
  roof: 0x222b45,
  rust: 0x643856,
  rust2: 0x49334f,
  ochre: 0x8c5a43,
  cream: 0x8892a9,
  pipe: 0x526078,
  lime: 0x9aff4a,
  coral: 0xff4eb8,
  blue: 0x45dfff,
  cyan: 0x45e8ff,
  violet: 0xa779ff,
  ice: 0x82dfff,
  ember: 0xff6338,
  pine: 0x142b2b,
  orange: 0xff7900,
  steel: 0x6f8799,
  metal: 0xb8c8d0,
  deck: 0x8da0b0,
  grid: 0x4e667a,
};

const boxGeometry = new THREE.BoxGeometry(1, 1, 1);
const reflectiveMaterialNames = new Set(['pipe', 'steel', 'metal']);
const coatedMaterialNames = new Set(['light', 'cream', 'blue', 'cyan', 'violet', 'ice', 'coral', 'ember', 'orange']);
const sharedMaterials = Object.fromEntries(Object.entries(colors).map(([name, color]) => [
  name,
  new THREE.MeshStandardMaterial({
    color,
    roughness: reflectiveMaterialNames.has(name) ? 0.58 : coatedMaterialNames.has(name) ? 0.64 : 0.84,
    metalness: reflectiveMaterialNames.has(name) ? 0.28 : coatedMaterialNames.has(name) ? 0.06 : 0.02,
  }),
]));
const asphaltTextureCanvas = document.createElement('canvas');
asphaltTextureCanvas.width = 512;
asphaltTextureCanvas.height = 512;
const asphaltTextureContext = asphaltTextureCanvas.getContext('2d');
asphaltTextureContext.fillStyle = '#d5d4d1';
asphaltTextureContext.fillRect(0, 0, asphaltTextureCanvas.width, asphaltTextureCanvas.height);
let asphaltTextureSeed = 0x1c4d82;
const nextAsphaltRandom = () => {
  asphaltTextureSeed = (Math.imul(asphaltTextureSeed, 1664525) + 1013904223) >>> 0;
  return asphaltTextureSeed / 4294967296;
};
for (let speckle = 0; speckle < 7800; speckle += 1) {
  const shade = nextAsphaltRandom() > 0.53 ? 18 : 248;
  const alpha = 0.025 + nextAsphaltRandom() * 0.075;
  const size = 0.45 + nextAsphaltRandom() * 1.7;
  asphaltTextureContext.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${alpha})`;
  asphaltTextureContext.fillRect(nextAsphaltRandom() * 512, nextAsphaltRandom() * 512, size, size);
}
for (let crack = 0; crack < 34; crack += 1) {
  let x = nextAsphaltRandom() * 512;
  let y = nextAsphaltRandom() * 512;
  asphaltTextureContext.beginPath();
  asphaltTextureContext.moveTo(x, y);
  asphaltTextureContext.strokeStyle = `rgba(25, 28, 34, ${0.08 + nextAsphaltRandom() * 0.08})`;
  asphaltTextureContext.lineWidth = 0.6 + nextAsphaltRandom() * 1.4;
  for (let bend = 0; bend < 5; bend += 1) {
    x += (nextAsphaltRandom() - 0.5) * 25;
    y += 4 + nextAsphaltRandom() * 18;
    asphaltTextureContext.lineTo(x, y);
  }
  asphaltTextureContext.stroke();
}
const asphaltTexture = new THREE.CanvasTexture(asphaltTextureCanvas);
asphaltTexture.colorSpace = THREE.SRGBColorSpace;
asphaltTexture.wrapS = THREE.RepeatWrapping;
asphaltTexture.wrapT = THREE.RepeatWrapping;
asphaltTexture.repeat.set(84, 84);
asphaltTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
sharedMaterials.asphalt.map = asphaltTexture;
sharedMaterials.asphalt.color.setHex(colors.asphalt);
sharedMaterials.asphalt.roughness = 0.96;
sharedMaterials.asphalt.needsUpdate = true;
const docksRoadTexture = asphaltTexture.clone();
docksRoadTexture.repeat.set(1, 1);
docksRoadTexture.needsUpdate = true;
const docksConcreteCanvas = document.createElement('canvas');
docksConcreteCanvas.width = 512;
docksConcreteCanvas.height = 512;
const docksConcreteContext = docksConcreteCanvas.getContext('2d');
docksConcreteContext.fillStyle = '#a6a8a4';
docksConcreteContext.fillRect(0, 0, 512, 512);
let concreteTextureSeed = 0x73b51d;
const nextConcreteRandom = () => {
  concreteTextureSeed = (Math.imul(concreteTextureSeed, 1664525) + 1013904223) >>> 0;
  return concreteTextureSeed / 4294967296;
};
for (let fleck = 0; fleck < 11500; fleck += 1) {
  const shade = nextConcreteRandom() > 0.5 ? 255 : 50;
  const alpha = 0.018 + nextConcreteRandom() * 0.055;
  const size = 0.35 + nextConcreteRandom() * 1.4;
  docksConcreteContext.fillStyle = `rgba(${shade}, ${shade}, ${shade}, ${alpha})`;
  docksConcreteContext.fillRect(nextConcreteRandom() * 512, nextConcreteRandom() * 512, size, size);
}
docksConcreteContext.strokeStyle = 'rgba(37, 42, 42, 0.17)';
docksConcreteContext.lineWidth = 1.5;
for (let joint = 0; joint <= 512; joint += 128) {
  docksConcreteContext.beginPath();
  docksConcreteContext.moveTo(joint, 0);
  docksConcreteContext.lineTo(joint, 512);
  docksConcreteContext.moveTo(0, joint);
  docksConcreteContext.lineTo(512, joint);
  docksConcreteContext.stroke();
}
const docksGroundTexture = new THREE.CanvasTexture(docksConcreteCanvas);
docksGroundTexture.colorSpace = THREE.SRGBColorSpace;
docksGroundTexture.wrapS = THREE.RepeatWrapping;
docksGroundTexture.wrapT = THREE.RepeatWrapping;
docksGroundTexture.repeat.set(28, 28);
docksGroundTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
const docksGrassGroundCanvas = document.createElement('canvas');
docksGrassGroundCanvas.width = 512;
docksGrassGroundCanvas.height = 512;
const docksGrassGroundContext = docksGrassGroundCanvas.getContext('2d');
docksGrassGroundContext.fillStyle = '#526448';
docksGrassGroundContext.fillRect(0, 0, 512, 512);
let docksGrassSeed = 0x6d2b79;
const nextDocksGrassRandom = () => {
  docksGrassSeed = (Math.imul(docksGrassSeed, 1664525) + 1013904223) >>> 0;
  return docksGrassSeed / 4294967296;
};
for (let blade = 0; blade < 10000; blade += 1) {
  const x = nextDocksGrassRandom() * 512;
  const y = nextDocksGrassRandom() * 512;
  const length = 1.2 + nextDocksGrassRandom() * 3.6;
  const lean = (nextDocksGrassRandom() - 0.5) * 2.8;
  const bright = nextDocksGrassRandom() > 0.52;
  docksGrassGroundContext.strokeStyle = bright ? 'rgba(151, 167, 102, 0.28)' : 'rgba(25, 48, 34, 0.32)';
  docksGrassGroundContext.lineWidth = 0.55 + nextDocksGrassRandom() * 0.75;
  const drawGrassStroke = (offsetX, offsetY) => {
    docksGrassGroundContext.beginPath();
    docksGrassGroundContext.moveTo(x + offsetX, y + offsetY);
    docksGrassGroundContext.lineTo(x + lean + offsetX, y - length + offsetY);
    docksGrassGroundContext.stroke();
  };
  drawGrassStroke(0, 0);
  if (x < 5) drawGrassStroke(512, 0);
  else if (x > 507) drawGrassStroke(-512, 0);
  if (y < 5) drawGrassStroke(0, 512);
  else if (y > 507) drawGrassStroke(0, -512);
}
const docksGrassGroundTexture = new THREE.CanvasTexture(docksGrassGroundCanvas);
docksGrassGroundTexture.colorSpace = THREE.SRGBColorSpace;
docksGrassGroundTexture.wrapS = THREE.RepeatWrapping;
docksGrassGroundTexture.wrapT = THREE.RepeatWrapping;
docksGrassGroundTexture.repeat.set(110, 110);
docksGrassGroundTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
sharedMaterials.neonDocksRoad = new THREE.MeshPhysicalMaterial({ map: docksRoadTexture, color: 0x3a4650, roughness: 0.24, metalness: 0.18, clearcoat: 0.9, clearcoatRoughness: 0.13 });
sharedMaterials.neonDocksGround = new THREE.MeshPhysicalMaterial({ map: docksGroundTexture, color: 0x77818a, roughness: 0.28, metalness: 0.12, clearcoat: 0.94, clearcoatRoughness: 0.16, emissive: 0x080e17, emissiveIntensity: 0.34 });
sharedMaterials.neonDocksGrassGround = new THREE.MeshStandardMaterial({ map: docksGrassGroundTexture, color: 0xffffff, roughness: 0.98, metalness: 0, emissive: 0x10190b, emissiveIntensity: 0.22 });
sharedMaterials.neonDocksRoadRepair = new THREE.MeshPhysicalMaterial({ map: docksRoadTexture, color: 0x46515a, roughness: 0.2, metalness: 0.18, clearcoat: 0.92, clearcoatRoughness: 0.12 });
const docksGravelCanvas = document.createElement('canvas');
docksGravelCanvas.width = 256;
docksGravelCanvas.height = 256;
const docksGravelContext = docksGravelCanvas.getContext('2d');
docksGravelContext.fillStyle = '#77766f';
docksGravelContext.fillRect(0, 0, 256, 256);
let docksGravelSeed = 0x8cb154;
for (let pebble = 0; pebble < 4200; pebble += 1) {
  docksGravelSeed = (Math.imul(docksGravelSeed, 1664525) + 1013904223) >>> 0;
  const x = docksGravelSeed / 4294967296 * 256;
  docksGravelSeed = (Math.imul(docksGravelSeed, 1664525) + 1013904223) >>> 0;
  const y = docksGravelSeed / 4294967296 * 256;
  const size = 0.6 + (docksGravelSeed & 7) * 0.18;
  const shade = 105 + (docksGravelSeed & 63);
  docksGravelContext.fillStyle = `rgba(${shade}, ${shade}, ${shade - 5}, 0.42)`;
  docksGravelContext.fillRect(x, y, size, size * 0.7);
}
const docksGravelTexture = new THREE.CanvasTexture(docksGravelCanvas);
docksGravelTexture.colorSpace = THREE.SRGBColorSpace;
docksGravelTexture.wrapS = THREE.RepeatWrapping;
docksGravelTexture.wrapT = THREE.RepeatWrapping;
docksGravelTexture.repeat.set(10, 7);
docksGravelTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
sharedMaterials.neonDocksGravel = new THREE.MeshStandardMaterial({ map: docksGravelTexture, color: 0x9b9788, roughness: 0.96, metalness: 0.015, flatShading: true });
const docksSlabTexture = docksGroundTexture.clone();
docksSlabTexture.repeat.set(1.2, 1.2);
docksSlabTexture.needsUpdate = true;
const docksDirtTexture = docksGravelTexture.clone();
docksDirtTexture.repeat.set(2.8, 2.2);
docksDirtTexture.needsUpdate = true;
sharedMaterials.neonDocksSlab = new THREE.MeshPhysicalMaterial({ map: docksSlabTexture, color: 0x9ba3a5, roughness: 0.48, metalness: 0.08, clearcoat: 0.3, clearcoatRoughness: 0.34 });
sharedMaterials.neonDocksDirt = new THREE.MeshStandardMaterial({ map: docksDirtTexture, color: 0x997253, roughness: 0.98, metalness: 0, flatShading: true });
sharedMaterials.neonDocksDrain = new THREE.MeshStandardMaterial({ color: 0x343c40, roughness: 0.86, metalness: 0.32 });
sharedMaterials.neonDocksRoadEdge = new THREE.MeshStandardMaterial({ color: 0x888078, roughness: 0.92, emissive: 0x15120e, emissiveIntensity: 0.14 });
sharedMaterials.neonDocksRoadCenter = new THREE.MeshStandardMaterial({ color: 0xb9a878, roughness: 0.88, emissive: 0x242015, emissiveIntensity: 0.12 });
sharedMaterials.neonDocksParkingStripe = new THREE.MeshStandardMaterial({ color: 0xd5c98d, roughness: 0.9, emissive: 0x201b10, emissiveIntensity: 0.1 });
sharedMaterials.neonDocksWater = new THREE.MeshPhysicalMaterial({ color: 0x0b4658, roughness: 0.17, metalness: 0.28, clearcoat: 1, clearcoatRoughness: 0.08, emissive: 0x01141c, emissiveIntensity: 0.2, side: THREE.DoubleSide });
sharedMaterials.neonDocksQuay = new THREE.MeshStandardMaterial({ color: 0x697780, roughness: 0.94, metalness: 0.08 });
sharedMaterials.neonDocksWaterMark = new THREE.MeshBasicMaterial({ color: 0x78eaff, transparent: true, opacity: 0.36, toneMapped: false });
sharedMaterials.neonDocksMountain = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, emissive: 0x111b2a, emissiveIntensity: 0.55 });
const DEFAULT_DRONE_NEON_COLOR = '#52e8ff';
const DEFAULT_DRONE_BODY_COLOR = '#45dfff';
const DEFAULT_DRONE_PROP_COLOR = '#45dfff';
const droneCountryCatalog = flagCountryCatalog.filter((country) => country.iso && /^[a-z]{2}$/.test(country.code));
const droneCountryByCode = new Map(droneCountryCatalog.map((country) => [country.code, country]));
function readSavedDroneColor(key, fallback) {
  try {
    const value = JSON.parse(localStorage.getItem('aerframe-settings') || '{}')[key];
    return typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
  } catch {
    return fallback;
  }
}
function readSavedDroneSkin() {
  try {
    const savedSkin = JSON.parse(localStorage.getItem('aerframe-settings') || '{}').droneSkin;
    if (savedSkin === 'usa-flag') return 'country:us';
    const countryCode = /^country:([a-z]{2})$/.exec(savedSkin || '')?.[1];
    return countryCode && droneCountryByCode.has(countryCode) ? `country:${countryCode}` : 'standard';
  } catch {
    return 'standard';
  }
}
function readSavedDroneCountryCode() {
  try {
    const settings = JSON.parse(localStorage.getItem('aerframe-settings') || '{}');
    if (droneCountryByCode.has(settings.droneCountryFlagCode)) return settings.droneCountryFlagCode;
    const skinCode = /^country:([a-z]{2})$/.exec(settings.droneSkin || '')?.[1];
    return skinCode && droneCountryByCode.has(skinCode) ? skinCode : 'us';
  } catch {
    return 'us';
  }
}
let droneSkinId = readSavedDroneSkin();
let droneCountryFlagCode = readSavedDroneCountryCode();
let droneCountryFlagTexture = null;
let droneCountryFlagLoadId = 0;
const droneUsaFlagCanvas = document.createElement('canvas');
droneUsaFlagCanvas.width = 1024;
droneUsaFlagCanvas.height = 540;
const droneUsaFlagContext = droneUsaFlagCanvas.getContext('2d');
droneUsaFlagContext.fillStyle = '#b22234';
droneUsaFlagContext.fillRect(0, 0, 1024, 540);
for (let stripe = 1; stripe < 13; stripe += 2) {
  droneUsaFlagContext.fillStyle = '#ffffff';
  droneUsaFlagContext.fillRect(0, stripe * (540 / 13), 1024, 540 / 13);
}
droneUsaFlagContext.fillStyle = '#3c3b6e';
droneUsaFlagContext.fillRect(0, 0, 410, 291);
droneUsaFlagContext.fillStyle = '#ffffff';
for (let row = 0; row < 9; row += 1) {
  const starCount = row % 2 === 0 ? 6 : 5;
  const starY = (row + 0.5) * (291 / 9);
  for (let column = 0; column < starCount; column += 1) {
    const starX = ((column + 0.5) / starCount) * 410;
    const outerRadius = 10;
    const innerRadius = 4.2;
    droneUsaFlagContext.beginPath();
    for (let point = 0; point < 10; point += 1) {
      const angle = -Math.PI / 2 + point * Math.PI / 5;
      const radius = point % 2 === 0 ? outerRadius : innerRadius;
      const x = starX + Math.cos(angle) * radius;
      const y = starY + Math.sin(angle) * radius;
      if (point === 0) droneUsaFlagContext.moveTo(x, y);
      else droneUsaFlagContext.lineTo(x, y);
    }
    droneUsaFlagContext.closePath();
    droneUsaFlagContext.fill();
  }
}
const droneUsaFlagTexture = new THREE.CanvasTexture(droneUsaFlagCanvas);
droneUsaFlagTexture.colorSpace = THREE.SRGBColorSpace;
droneUsaFlagTexture.wrapS = THREE.ClampToEdgeWrapping;
droneUsaFlagTexture.wrapT = THREE.ClampToEdgeWrapping;
droneUsaFlagTexture.needsUpdate = true;
droneCountryFlagTexture = droneUsaFlagTexture;
let droneNeonColor = (() => {
  return readSavedDroneColor('droneNeonColor', DEFAULT_DRONE_NEON_COLOR);
})();
let droneBodyColor = readSavedDroneColor('droneBodyColor', DEFAULT_DRONE_BODY_COLOR);
let dronePropColor = readSavedDroneColor('dronePropColor', DEFAULT_DRONE_PROP_COLOR);
const droneArmGlowMaterial = new THREE.MeshStandardMaterial({
  color: droneNeonColor,
  emissive: droneNeonColor,
  emissiveIntensity: 3.1,
  roughness: 0.3,
  metalness: 0.08,
  toneMapped: false,
});
const droneBodyColorMaterial = new THREE.MeshStandardMaterial({ color: droneBodyColor, roughness: 0.35, metalness: 0.12 });
const droneBodyPaintMaterial = new THREE.MeshStandardMaterial({ color: droneBodyColor, roughness: 0.35, metalness: 0.12, vertexColors: true });
const droneUsaBodySkinMaterial = new THREE.MeshStandardMaterial({ color: droneBodyColor, roughness: 0.55, metalness: 0.04, side: THREE.DoubleSide, vertexColors: true });
droneUsaBodySkinMaterial.onBeforeCompile = (shader) => {
  const flagUniform = { value: droneCountryFlagTexture || droneUsaFlagTexture };
  shader.uniforms.droneUsaFlagMap = flagUniform;
  droneUsaBodySkinMaterial.userData.droneFlagUniform = flagUniform;
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec2 droneSkinUv;\nattribute float droneSkinTopMask;\nvarying vec2 vDroneSkinUv;\nvarying float vDroneSkinTopMask;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDroneSkinUv = droneSkinUv;\nvDroneSkinTopMask = droneSkinTopMask;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', '#include <common>\nuniform sampler2D droneUsaFlagMap;\nvarying vec2 vDroneSkinUv;\nvarying float vDroneSkinTopMask;')
    .replace('#include <map_fragment>', '#include <map_fragment>\nvec4 droneUsaFlagColor = texture2D(droneUsaFlagMap, vDroneSkinUv);\ndiffuseColor.rgb = mix(diffuseColor.rgb, droneUsaFlagColor.rgb, vDroneSkinTopMask);');
};
droneUsaBodySkinMaterial.customProgramCacheKey = () => 'drone-usa-top-flag-v1';
async function loadDroneCountryFlagTexture(countryCode) {
  const country = droneCountryByCode.get(countryCode);
  if (!country) return;
  const loadId = ++droneCountryFlagLoadId;
  const flagUrl = new URL(`flags/4x3/${countryCode}.svg`, document.baseURI).href;
  const image = new Image();
  image.decoding = 'async';
  image.src = flagUrl;
  await image.decode();
  if (loadId !== droneCountryFlagLoadId) return;
  droneUsaFlagContext.clearRect(0, 0, droneUsaFlagCanvas.width, droneUsaFlagCanvas.height);
  droneUsaFlagContext.drawImage(image, 0, 0, droneUsaFlagCanvas.width, droneUsaFlagCanvas.height);
  droneUsaFlagTexture.needsUpdate = true;
  droneCountryFlagTexture = droneUsaFlagTexture;
  const flagUniform = droneUsaBodySkinMaterial.userData.droneFlagUniform;
  if (flagUniform) flagUniform.value = droneUsaFlagTexture;
}
const dronePropColorMaterial = new THREE.MeshStandardMaterial({
  color: dronePropColor,
  roughness: 0.42,
  metalness: 0.08,
  side: THREE.DoubleSide,
});
const warmLightMaterial = new THREE.MeshStandardMaterial({ color: 0xffb36d, emissive: 0xa64c16, emissiveIntensity: 0.85, roughness: 0.4 });
const world = new THREE.Group();
world.name = 'Neon Flight Worlds';
scene.add(world);
const flightCollisionOctree = new Octree();
const flightCollisionRadius = 0.62;
const flightCollisionStepDistance = 0.1;
const flightCollisionExtent = 1.8;
let flightDroneGroundSupportOffsets = Array.from({ length: 8 }, (_, corner) => new THREE.Vector3(
  (corner & 1 ? 1 : -1) * 1.5,
  (corner & 2 ? 1 : -1) * 0.3,
  (corner & 4 ? 1 : -1) * 1.5,
));
const flightCollisionRestitution = 0.24;
const flightCollisionTangentialRetention = 0.78;
const flightCollisionInverseInertia = 0.42;
const flightCollisionStepOrientation = new THREE.Quaternion();
const flightCollisionArm = new THREE.Vector3();
const flightCollisionImpulse = new THREE.Vector3();
const flightCollisionTorque = new THREE.Vector3();
const flightCollisionTangentVelocity = new THREE.Vector3();
const flightCollisionAngularAxis = new THREE.Vector3();
const flightCollisionAngularStep = new THREE.Quaternion();
const flightGroundSupportOffset = new THREE.Vector3();
const flightGroundUpLocal = new THREE.Vector3();
const flightGroundContactPoint = new THREE.Vector3();
const flightGroundContactTorque = new THREE.Vector3();
const flightGroundProbeBounds = new THREE.Box3();
const flightDebrisGroundBounds = new THREE.Box3();
const flightGroundContactNormal = new THREE.Vector3(0, 1, 0);
const flightCollisionMotorOffsets = [
  [-1.28, -0.84],
  [-1.28, 0.84],
  [1.28, -0.84],
  [1.28, 0.84],
];
const flightPilotCollisionRestitution = 0.34;
const flightPilotCollisionTangentialRetention = 0.94;
const flightCollisionBodySpheres = [
  { part: 'body', motorIndex: -1, offset: new THREE.Vector3(0, 0, 0), radius: 0.3, sphere: new THREE.Sphere() },
  ...flightCollisionMotorOffsets.flatMap(([x, z], motorIndex) => [
    { part: 'arm', motorIndex, offset: new THREE.Vector3(x * 0.5, 0, z * 0.5), radius: 0.22, sphere: new THREE.Sphere() },
    { part: 'prop', motorIndex, offset: new THREE.Vector3(x, 0, z), radius: 0.22, sphere: new THREE.Sphere() },
  ]),
];
const flightPilotRemoteSpheres = flightCollisionBodySpheres.map(({ part, motorIndex, offset, radius }) => ({
  part, motorIndex, offset, radius, sphere: new THREE.Sphere(),
}));
const flightPilotPosition = new THREE.Vector3();
const flightPilotNormal = new THREE.Vector3();
const flightPilotRelativeVelocity = new THREE.Vector3();
const flightPilotTangentialVelocity = new THREE.Vector3();
const flightPilotImpulse = new THREE.Vector3();
const flightPilotTorque = new THREE.Vector3();
const flightPilotRemoteQuaternion = new THREE.Quaternion();
const environmentRoot = new THREE.Group();
const gateRoot = new THREE.Group();
const trackRoot = new THREE.Group();
trackRoot.name = 'Biome track gates';
const communityPropRoot = new THREE.Group();
communityPropRoot.name = 'Community track environment objects';
const builderPropRoot = new THREE.Group();
builderPropRoot.name = 'User placed environment objects';
const builderRaceLineRoot = new THREE.Group();
builderRaceLineRoot.name = 'Transparent track builder race line';
builderRaceLineRoot.visible = false;
const builderRaceLinePathRoot = new THREE.Group();
builderRaceLinePathRoot.name = 'Race line path tubes';
const builderRaceLineHandleRoot = new THREE.Group();
builderRaceLineHandleRoot.name = 'Movable race line control points';
builderRaceLineRoot.add(builderRaceLinePathRoot, builderRaceLineHandleRoot);
const flightRaceLineRoot = new THREE.Group();
flightRaceLineRoot.name = 'Transparent in-flight race line';
flightRaceLineRoot.visible = false;
const flightDebrisRoot = new THREE.Group();
flightDebrisRoot.name = 'Broken drone parts';
const flightDamageEffectsRoot = new THREE.Group();
flightDamageEffectsRoot.name = 'Drone smoke and fire';
const flightDamageMinimumImpactSpeed = 4.8;
const flightPropellerBreakImpactSpeed = 7.2;
const flightArmBreakImpactSpeed = 10.5;
const flightFireCrashImpactSpeed = 18;
const flightSmokeDamageThreshold = 62;
const flightDamageState = {
  damage: 0,
  brokenProps: Array(4).fill(false),
  brokenArms: Array(4).fill(false),
  burning: false,
  crashed: false,
  lastImpactAt: 0,
  smokeSpawnTime: 0,
  fireSpawnTime: 0,
};
const flightArmDamageMeshes = [];
const flightDebris = [];
const flightDamageParticles = [];
let destroyedFlightWasGrounded = false;
let flightSmokeTexture = null;
let flightFireTexture = null;
let builderRaceLineGenerated = false;
let builderRaceLinePoints = [];
let builderRaceLineHandles = [];
let builderRaceLineGateRefs = [];
let selectedBuilderRaceLinePointIndex = null;
const builderEnvironmentBuildings = [];
let selectedEnvironmentBuildingId = null;
const builderGhostRoot = new THREE.Group();
builderGhostRoot.name = 'Transparent placement preview';
builderGhostRoot.visible = false;
const builderFlightRoot = new THREE.Group();
builderFlightRoot.name = 'Track test start and finish';
builderFlightRoot.visible = false;
const biomeLightRoot = new THREE.Group();
const menuBackdropRoot = new THREE.Group();
menuBackdropRoot.name = 'Menu plaza and hangar backdrop';
const menuPlanetsRoot = new THREE.Group();
menuPlanetsRoot.name = 'World anchored planets around the sky platform';
menuBackdropRoot.add(menuPlanetsRoot);
const menuStreetLampRoot = new THREE.Group();
menuStreetLampRoot.name = 'Menu street lamps';
menuBackdropRoot.add(menuStreetLampRoot);
const menuPlatformCollisionRoot = new THREE.Group();
menuPlatformCollisionRoot.name = 'Invisible sky platform flight collider';
menuPlatformCollisionRoot.visible = false;
let menuGrassWindUniform = null;
let menuStarTimeUniform = null;
let menuStarMusicUniforms = null;
let menuStarField = null;
let menuMoonGroup = null;
let menuMoonOrbit = null;
let menuPlanetMotionTime = 0;
const menuPlanetVisuals = [];
const menuCityRoot = new THREE.Group();
menuCityRoot.name = 'Menu cyber city skyline';
menuCityRoot.visible = true;
const menuStageRoot = new THREE.Group();
menuStageRoot.name = 'Menu quad podiums';
const menuInfoBannerRoot = new THREE.Group();
menuInfoBannerRoot.name = 'Menu tournament and rankings billboard';
const menuDronePadPositions = [[-6, -5], [-24, -32], [6, -5], [24, -32]];
const menuDroneBaseY = 3.48;
const REQUIRED_TRACK_PODIUM_COUNT = 8;
const RELAY_STATION_COUNT = 4;
const RELAY_GATE_PODIUM_DISTANCE = 8;
const RELAY_PODIUM_STAGE_FORWARD_OFFSET = 2.6;
const RELAY_PODIUM_STAGE_SIDE_OFFSET = 6.8;
const RED_RACE_PODIUM_TOP_Y = 3.1325;
const RED_RACE_PODIUM_HEADING_OFFSET = Math.PI / 2;
const RED_RACE_PODIUM_DRONE_LEFT_TURN = Math.PI / 2;
const menuFlybys = [];
const menuGrassWindMeshes = [];
const environmentGrassWindMeshes = [];
let neonDocksWaterAnimation = null;
const menuLooseWindMeshes = [];
const menuPodiumLabels = [];
let competitiveBannerCanvases = null;
let competitiveBannerData = { leaders: [], teams: [], nextTournament: null };
let competitiveBannerSlide = 0;
let citySignTextures = null;
let playgroundGateStructures = null;
world.add(environmentRoot, gateRoot, trackRoot, communityPropRoot, builderPropRoot, builderRaceLineRoot, flightRaceLineRoot, flightDebrisRoot, flightDamageEffectsRoot, builderGhostRoot, builderFlightRoot, biomeLightRoot, menuBackdropRoot, menuPlatformCollisionRoot, menuCityRoot, menuStageRoot, menuAmbientRoot, menuInfoBannerRoot);
const flightCollisionTarget = new THREE.Vector3();
const flightCollisionDelta = new THREE.Vector3();
const flightCollisionMatrix = new THREE.Matrix4();
const flightCollisionInstanceMatrix = new THREE.Matrix4();
const flightCollisionBounds = new THREE.Box3();
const flightCollisionSize = new THREE.Vector3();
const flightCollisionCenter = new THREE.Vector3();
const flightCollisionProxyMaterial = new THREE.MeshBasicMaterial();

function addInstancedCollisionProxies(mesh, collisionWorld) {
  const geometry = mesh.geometry;
  geometry.computeBoundingBox();
  if (!geometry.boundingBox) return;
  for (let index = 0; index < mesh.count; index += 1) {
    mesh.getMatrixAt(index, flightCollisionInstanceMatrix);
    flightCollisionMatrix.multiplyMatrices(mesh.matrixWorld, flightCollisionInstanceMatrix);
    flightCollisionBounds.copy(geometry.boundingBox).applyMatrix4(flightCollisionMatrix);
    flightCollisionBounds.getSize(flightCollisionSize);
    if (flightCollisionSize.lengthSq() < 0.0001) continue;
    const horizontalPadding = Math.max(0, Number(mesh.userData.flightCollisionHorizontalPadding) || 0);
    if (horizontalPadding) {
      flightCollisionBounds.min.x -= horizontalPadding;
      flightCollisionBounds.max.x += horizontalPadding;
      flightCollisionBounds.min.z -= horizontalPadding;
      flightCollisionBounds.max.z += horizontalPadding;
    }
    const collisionHeight = Math.max(0, Number(mesh.userData.flightCollisionHeight) || 0);
    if (collisionHeight) {
      const geometryHeight = geometry.boundingBox.max.y - geometry.boundingBox.min.y;
      const instanceHeightScale = flightCollisionSize.y / Math.max(0.0001, geometryHeight);
      flightCollisionBounds.max.y = Math.max(flightCollisionBounds.max.y, flightCollisionBounds.min.y + collisionHeight * instanceHeightScale);
    }
    flightCollisionBounds.getSize(flightCollisionSize);
    const proxy = new THREE.Mesh(boxGeometry, flightCollisionProxyMaterial);
    flightCollisionBounds.getCenter(flightCollisionCenter);
    proxy.position.copy(flightCollisionCenter);
    proxy.scale.copy(flightCollisionSize);
    collisionWorld.add(proxy);
  }
}

function buildFlightCollisionWorld() {
  const collisionWorld = new THREE.Group();
  for (const sourceRoot of [environmentRoot, gateRoot, trackRoot, communityPropRoot, builderPropRoot, builderFlightRoot, menuPlatformCollisionRoot]) {
    if (!sourceRoot.visible) continue;
    const rootCopy = sourceRoot.clone(true);
    collisionWorld.add(rootCopy);
  }
  collisionWorld.updateMatrixWorld(true);
  let hasCollisionGeometry = false;
  collisionWorld.traverse((object) => {
    if (!object.isMesh) return;
    let ancestor = object;
    while (ancestor && ancestor !== collisionWorld) {
      if (!ancestor.visible) {
        object.layers.set(31);
        return;
      }
      ancestor = ancestor.parent;
    }
    if (object.userData.skipFlightCollision) {
      object.layers.set(31);
      return;
    }
    if (object.userData.flightGroundSurface) {
      object.layers.set(31);
      return;
    }
    if (object.isInstancedMesh) {
      object.layers.set(31);
      addInstancedCollisionProxies(object, collisionWorld);
    }
    hasCollisionGeometry = true;
  });
  collisionWorld.updateMatrixWorld(true);
  flightCollisionOctree.clear();
  if (!hasCollisionGeometry) return;
  flightCollisionOctree.fromGraphNode(collisionWorld);
}

function resolveFlightWorldCollision() {
  flightCollisionTarget.copy(flight.position);
  flightCollisionDelta.subVectors(flightCollisionTarget, previousFlightPosition);
  const travelDistance = flightCollisionDelta.length();
  const orientationDot = THREE.MathUtils.clamp(Math.abs(previousFlightOrientation.dot(flight.orientation)), 0, 1);
  const rotationDistance = 2 * Math.acos(orientationDot) * flightCollisionExtent;
  const stepCount = Math.max(1, Math.ceil((travelDistance + rotationDistance) / flightCollisionStepDistance));
  let collided = false;
  let strongestImpact = null;
  for (let step = 1; step <= stepCount; step += 1) {
    flight.position.copy(previousFlightPosition).addScaledVector(flightCollisionDelta, step / stepCount);
    flightCollisionStepOrientation.copy(previousFlightOrientation)
      .slerp(flight.orientation, step / stepCount)
      .multiply(flightDroneFacingCorrection);
    flightCollisionBodySpheres.forEach(({ offset, radius, sphere }) => {
      sphere.center.copy(offset).applyQuaternion(flightCollisionStepOrientation).add(flight.position);
      sphere.radius = radius;
    });
    for (let iteration = 0; iteration < 5; iteration += 1) {
      let contact = null;
      let contactSphere = null;
      for (const bodySphere of flightCollisionBodySpheres) {
        if ((bodySphere.part === 'prop' && flightDamageState.brokenProps[bodySphere.motorIndex])
          || (bodySphere.part === 'arm' && flightDamageState.brokenArms[bodySphere.motorIndex])) continue;
        const sphereContact = flightCollisionOctree.sphereIntersect(bodySphere.sphere);
        if (sphereContact && (!contact || sphereContact.depth > contact.depth)) {
          contact = sphereContact;
          contactSphere = bodySphere;
        }
      }
      if (!contact) break;
      const normal = contact.normal;
      if (normal.lengthSq() < 0.5) break;
      const correction = contact.depth + 0.002;
      flightCollisionArm.copy(contactSphere.sphere.center)
        .addScaledVector(normal, -contactSphere.sphere.radius)
        .sub(flight.position);
      flightCollisionBodySpheres.forEach(({ sphere }) => sphere.center.addScaledVector(normal, correction));
      flight.position.addScaledVector(normal, correction);
      const intoSurface = flight.velocity.dot(normal);
      if (intoSurface < 0) {
        const impactSpeed = -intoSurface;
        if (!strongestImpact || impactSpeed > strongestImpact.speed) {
          strongestImpact = {
            speed: impactSpeed,
            part: contactSphere.part,
            motorIndex: contactSphere.motorIndex,
            normal: normal.clone(),
          };
        }
        const normalImpulse = -(1 + flightCollisionRestitution) * intoSurface;
        flightCollisionImpulse.copy(normal).multiplyScalar(normalImpulse);
        flight.velocity.add(flightCollisionImpulse);
        flightCollisionTangentVelocity.copy(flight.velocity)
          .addScaledVector(normal, -flight.velocity.dot(normal));
        flight.velocity.addScaledVector(flightCollisionTangentVelocity, flightCollisionTangentialRetention - 1);
        flightCollisionTorque.crossVectors(flightCollisionArm, flightCollisionImpulse)
          .multiplyScalar(flightCollisionInverseInertia);
        flight.impactAngularVelocity.add(flightCollisionTorque);
        if (flight.impactAngularVelocity.length() > 8) flight.impactAngularVelocity.setLength(8);
      }
      collided = true;
    }
    if (collided) break;
  }
  if (collided) flight.velocity.multiplyScalar(0.985);
  return strongestImpact;
}

function resolveFlightPilotCollisions() {
  if (!flying || !partyLobby || !partyFlightSnapshots.size) return null;
  const now = performance.now();
  let strongestImpact = null;
  const activeLocalSpheres = flightCollisionBodySpheres.filter(({ part, motorIndex }) =>
    !((part === 'prop' && flightDamageState.brokenProps[motorIndex])
      || (part === 'arm' && flightDamageState.brokenArms[motorIndex])));

  for (const state of partyFlightSnapshots.values()) {
    const stateAge = now - state.receivedAt;
    if (stateAge > 750) continue;
    flightPilotPosition.copy(state.position).addScaledVector(state.velocity, Math.min(0.18, Math.max(0, stateAge / 1000)));
    flightPilotRemoteQuaternion.copy(state.orientation).multiply(flightDroneFacingCorrection);
    flightPilotRemoteSpheres.forEach(({ offset, radius, sphere }) => {
      sphere.center.copy(offset).applyQuaternion(flightPilotRemoteQuaternion).add(flightPilotPosition);
      sphere.radius = radius;
    });

    for (let iteration = 0; iteration < 4; iteration += 1) {
      let contact = null;
      let contactLocalSphere = null;
      let contactRemoteSphere = null;
      activeLocalSpheres.forEach(({ offset, radius, sphere }) => {
        flightCollisionStepOrientation.copy(flight.orientation).multiply(flightDroneFacingCorrection);
        sphere.center.copy(offset).applyQuaternion(flightCollisionStepOrientation).add(flight.position);
        sphere.radius = radius;
      });
      for (const localSphere of activeLocalSpheres) {
        for (const remoteSphere of flightPilotRemoteSpheres) {
          const distance = localSphere.sphere.center.distanceTo(remoteSphere.sphere.center);
          const depth = localSphere.sphere.radius + remoteSphere.sphere.radius - distance;
          if (depth > 0 && (!contact || depth > contact.depth)) {
            contact = { depth, distance };
            contactLocalSphere = localSphere;
            contactRemoteSphere = remoteSphere;
          }
        }
      }
      if (!contact) break;

      flightPilotNormal.subVectors(contactLocalSphere.sphere.center, contactRemoteSphere.sphere.center);
      if (contact.distance > 0.0001) flightPilotNormal.multiplyScalar(1 / contact.distance);
      else if (flight.velocity.lengthSq() > 0.01) flightPilotNormal.copy(flight.velocity).normalize().negate();
      else flightPilotNormal.set(1, 0, 0);
      flightCollisionArm.copy(contactLocalSphere.sphere.center).sub(flight.position);
      flight.position.addScaledVector(flightPilotNormal, Math.min(1.25, contact.depth + 0.002));

      flightPilotRelativeVelocity.subVectors(flight.velocity, state.velocity);
      const intoContact = flightPilotRelativeVelocity.dot(flightPilotNormal);
      if (intoContact < 0) {
        const impactSpeed = -intoContact;
        if (!strongestImpact || impactSpeed > strongestImpact.speed) {
          strongestImpact = {
            speed: impactSpeed,
            part: contactLocalSphere.part,
            motorIndex: contactLocalSphere.motorIndex,
            normal: flightPilotNormal.clone(),
          };
        }
        const impulseMagnitude = -(1 + flightPilotCollisionRestitution) * intoContact * 0.5;
        flightPilotImpulse.copy(flightPilotNormal).multiplyScalar(impulseMagnitude);
        flight.velocity.add(flightPilotImpulse);
        flightPilotTangentialVelocity.copy(flightPilotRelativeVelocity)
          .addScaledVector(flightPilotNormal, -intoContact);
        flight.velocity.addScaledVector(flightPilotTangentialVelocity, (flightPilotCollisionTangentialRetention - 1) * 0.5);
        flightPilotTorque.crossVectors(flightCollisionArm, flightPilotImpulse)
          .multiplyScalar(flightCollisionInverseInertia);
        flight.impactAngularVelocity.add(flightPilotTorque);
        if (flight.impactAngularVelocity.length() > 8) flight.impactAngularVelocity.setLength(8);
      }
    }
  }
  return strongestImpact;
}

const builderSelectionHelper = new THREE.BoxHelper(new THREE.Object3D(), 0xff8a1d);
builderSelectionHelper.visible = false;
scene.add(builderSelectionHelper);
const builderTransformControls = new TransformControls(camera, renderer.domElement);
const builderTransformHelper = builderTransformControls.getHelper();
builderTransformHelper.visible = false;
scene.add(builderTransformHelper);
let builderTransformMode = 'translate';
let builderTransformAxis = 'all';
let builderTransformSpace = 'world';
let builderTransformChanged = false;
builderTransformControls.setMode(builderTransformMode);
builderTransformControls.setSpace(builderTransformSpace);
builderTransformControls.setSize(0.72);
builderTransformControls.addEventListener('dragging-changed', (event) => {
  orbit.enabled = currentPage === 'builder' && !event.value;
  if (!event.value && builderTransformChanged) {
    builderTransformChanged = false;
    invalidateBuilderTrackPicture();
    saveBuilderEnvironmentBuildings();
    updateBuilderDisplay();
  }
});
builderTransformControls.addEventListener('objectChange', () => {
  const object = builderTransformControls.object;
  if (!object) return;
  if (object.userData.isBuilderRaceLineHandle) {
    const pointIndex = object.userData.raceLinePointIndex;
    if (!Number.isInteger(pointIndex) || !builderRaceLinePoints[pointIndex]) return;
    builderRaceLinePoints[pointIndex].copy(object.position);
    builderTransformChanged = true;
    refreshBuilderRaceLineGeometry();
    return;
  }
  const prop = builderProps.find((item) => item.id === selectedBuilderPropId);
  if (prop && object.userData.propId === prop.id) {
    prop.x = THREE.MathUtils.clamp(object.position.x, -320, 320);
    prop.y = THREE.MathUtils.clamp(object.position.y, -15, 60);
    prop.z = THREE.MathUtils.clamp(object.position.z, -320, 320);
    object.position.set(prop.x, prop.y, prop.z);
    prop.rotationX = THREE.MathUtils.radToDeg(object.rotation.x);
    prop.rotationY = THREE.MathUtils.radToDeg(object.rotation.y);
    prop.rotationZ = THREE.MathUtils.radToDeg(object.rotation.z);
    prop.rotation = prop.rotationY;
    prop.scaleX = THREE.MathUtils.clamp(object.scale.x, 0.5, 2);
    prop.scaleY = THREE.MathUtils.clamp(object.scale.y, 0.5, 2);
    prop.scaleZ = THREE.MathUtils.clamp(object.scale.z, 0.5, 2);
    object.scale.set(prop.scaleX, prop.scaleY, prop.scaleZ);
    prop.scale = (prop.scaleX + prop.scaleY + prop.scaleZ) / 3;
  } else {
    const gate = builderGates.find((item) => item.id === selectedGateId);
    if (!gate || object.userData.gateId !== gate.id) {
      const building = builderEnvironmentBuildings.find((item) => item.id === selectedEnvironmentBuildingId);
      if (!building || object.userData.environmentBuildingId !== building.id) return;
      object.position.set(
        THREE.MathUtils.clamp(object.position.x, -1200, 1200),
        THREE.MathUtils.clamp(object.position.y, -100, 200),
        THREE.MathUtils.clamp(object.position.z, -1200, 1200),
      );
      object.scale.set(
        THREE.MathUtils.clamp(object.scale.x, 0.25, 3),
        THREE.MathUtils.clamp(object.scale.y, 0.25, 3),
        THREE.MathUtils.clamp(object.scale.z, 0.25, 3),
      );
      builderTransformChanged = true;
      builderSelectionHelper.update();
      return;
    }
    gate.x = THREE.MathUtils.clamp(object.position.x, -320, 320);
    gate.y = THREE.MathUtils.clamp(object.position.y, -15, 60);
    gate.z = THREE.MathUtils.clamp(object.position.z, -320, 320);
    object.position.set(gate.x, gate.y, gate.z);
    gate.rotationX = THREE.MathUtils.radToDeg(object.rotation.x);
    gate.rotationZ = THREE.MathUtils.radToDeg(object.rotation.z);
    gate.rotation = ((THREE.MathUtils.radToDeg(object.rotation.y) % 360) + 360) % 360;
    gate.scaleX = THREE.MathUtils.clamp(object.scale.x, 0.5, 2);
    gate.scaleY = THREE.MathUtils.clamp(object.scale.y, 0.5, 2);
    gate.scaleZ = THREE.MathUtils.clamp(object.scale.z, 0.5, 2);
    object.scale.set(gate.scaleX, gate.scaleY, gate.scaleZ);
    gate.scale = (gate.scaleX + gate.scaleY + gate.scaleZ) / 3;
  }
  updateBuilderRelayPodiumGateIndicators();
  builderTransformChanged = true;
  builderSelectionHelper.update();
});

function box(parent, size, position, materialOrColor, rotation = 0) {
  const mat = typeof materialOrColor === 'string' ? sharedMaterials[materialOrColor] : materialOrColor;
  const mesh = new THREE.Mesh(boxGeometry, mat);
  mesh.scale.set(size[0], size[1], size[2]);
  mesh.position.set(position[0], position[1], position[2]);
  mesh.rotation.y = rotation;
  parent.add(mesh);
  return mesh;
}

function enableShadowParticipation(root) {
  root.traverse((node) => {
    if (!node.isMesh) return;
    if (node.userData.skipShadows) {
      node.castShadow = false;
      node.receiveShadow = false;
      return;
    }
    node.castShadow = true;
    node.receiveShadow = true;
  });
}

function drawMenuPodiumLabel(canvas, pilotName) {
  const context = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  context.clearRect(0, 0, width, height);
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#07121d');
  background.addColorStop(0.5, '#101c29');
  background.addColorStop(1, '#07121d');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = '#50e8ff';
  context.lineWidth = 10;
  context.strokeRect(12, 12, width - 24, height - 24);
  context.fillStyle = '#f3f8ff';
  context.shadowColor = '#50e8ff';
  context.shadowBlur = 20;
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  const label = String(pilotName || '').trim().toLocaleUpperCase();
  if (!label) {
    context.shadowBlur = 0;
    return;
  }
  const maxTextWidth = width - 100;
  let fontSize = 190;
  context.font = `900 ${fontSize}px Arial, sans-serif`;
  while (context.measureText(label).width > maxTextWidth && fontSize > 52) {
    fontSize -= 4;
    context.font = `900 ${fontSize}px Arial, sans-serif`;
  }
  context.fillText(label, width / 2, height / 2, maxTextWidth);
  context.shadowBlur = 0;
}

function createMenuPodiumLabel(index) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const label = '';
  drawMenuPodiumLabel(canvas, label);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  menuPodiumLabels[index] = { canvas, texture, label };
  return new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });
}

const redRacePodiumMaterials = {
  standRed: new THREE.MeshStandardMaterial({ color: 0xa91f2d, roughness: 0.7, metalness: 0.12, flatShading: true, side: THREE.DoubleSide }),
  redEdge: new THREE.MeshStandardMaterial({ color: 0x5d101c, roughness: 0.72, metalness: 0.16, flatShading: true }),
  deck: new THREE.MeshStandardMaterial({ color: 0x991c29, roughness: 0.78, metalness: 0.08, flatShading: true }),
  nameplate: new THREE.MeshStandardMaterial({ color: 0x171b22, roughness: 0.56, metalness: 0.28 }),
  holeTrim: new THREE.MeshStandardMaterial({ color: 0xc85a5e, roughness: 0.68, metalness: 0.14 }),
};
Object.assign(sharedMaterials, Object.fromEntries(Object.entries(redRacePodiumMaterials).map(([name, material]) => [`racePodium${name}`, material])));

function createRedRacePodiumSidePlateGeometry() {
  const profile = new THREE.Shape();
  profile.moveTo(-3.65, 0.12);
  profile.lineTo(3.65, 0.12);
  profile.lineTo(2.55, 0.5);
  profile.lineTo(1.62, 2.28);
  profile.lineTo(2.55, 2.28);
  profile.lineTo(2.55, 2.68);
  profile.lineTo(-2.55, 2.68);
  profile.lineTo(-2.55, 2.28);
  profile.lineTo(-1.62, 2.28);
  profile.lineTo(-2.55, 0.5);
  profile.closePath();

  const centerCutout = new THREE.Path();
  centerCutout.moveTo(-1.86, 0.56);
  centerCutout.lineTo(-0.96, 2.02);
  centerCutout.lineTo(0.96, 2.02);
  centerCutout.lineTo(1.86, 0.56);
  centerCutout.closePath();
  profile.holes.push(centerCutout);

  for (let index = 0; index < 10; index += 1) {
    const hole = new THREE.Path();
    hole.absellipse(-2.95 + index * 0.655, 0.31, 0.115, 0.115, 0, Math.PI * 2, true, 0);
    profile.holes.push(hole);
  }
  for (let index = 0; index < 7; index += 1) {
    const hole = new THREE.Path();
    hole.absellipse(-1.36 + index * 0.455, 2.48, 0.12, 0.12, 0, Math.PI * 2, true, 0);
    profile.holes.push(hole);
  }

  const geometry = new THREE.ExtrudeGeometry(profile, { depth: 0.2, bevelEnabled: true, bevelSegments: 1, bevelSize: 0.035, bevelThickness: 0.025, curveSegments: 8 });
  geometry.computeVertexNormals();
  return geometry;
}

let builderRacePodiumLabelMaterial = null;
function getBuilderRacePodiumLabelMaterial() {
  if (builderRacePodiumLabelMaterial) return builderRacePodiumLabelMaterial;
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  drawMenuPodiumLabel(canvas, 'RACE GRID');
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  builderRacePodiumLabelMaterial = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false });
  sharedMaterials.racePodiumLabel = builderRacePodiumLabelMaterial;
  return builderRacePodiumLabelMaterial;
}

function createRedRacePodium(labelFace = null) {
  const stand = new THREE.Group();
  stand.name = 'Red XSPEC race podium';
  stand.scale.x = 0.84;
  stand.rotation.y = RED_RACE_PODIUM_HEADING_OFFSET;
  stand.userData.isRedRacePodiumModel = true;
  stand.userData.launchHeadingOffset = RED_RACE_PODIUM_HEADING_OFFSET;
  const podiumStructure = new THREE.Group();
  podiumStructure.scale.set(0.52, 1, 0.65);
  stand.add(podiumStructure);

  box(stand, [3.8, 0.34, 2.45], [0, 0.2, 0], redRacePodiumMaterials.redEdge);
  box(stand, [3.625, 0.17, 2.325], [0, 0.45, 0], redRacePodiumMaterials.standRed);
  for (const z of [1.52, -1.72]) {
    const plate = new THREE.Mesh(createRedRacePodiumSidePlateGeometry(), redRacePodiumMaterials.standRed);
    plate.position.set(0, 0.48, z);
    podiumStructure.add(plate);
  }
  box(podiumStructure, [5.7, 0.32, 3.75], [0, 2.88, 0], redRacePodiumMaterials.deck);
  box(podiumStructure, [5.45, 0.055, 3.52], [0, 3.07, 0], redRacePodiumMaterials.redEdge);
  box(podiumStructure, [5.2, 0.035, 3.26], [0, 3.115, 0], redRacePodiumMaterials.standRed);
  const frontSide = -1;
  box(podiumStructure, [0.12, 0.58, 3.6], [frontSide * 2.91, 2.85, 0], redRacePodiumMaterials.nameplate);
  if (labelFace) {
    const plateText = new THREE.Mesh(new THREE.PlaneGeometry(3.45, 0.52), labelFace);
    plateText.position.set(frontSide * 2.985, 2.85, 0);
    plateText.rotation.y = frontSide * Math.PI / 2;
    plateText.userData.isPodiumNameplateText = true;
    podiumStructure.add(plateText);
  }
  for (const side of [-1, 1]) {
    box(podiumStructure, [0.16, 0.18, 3.5], [side * 3.46, 0.45, 0], redRacePodiumMaterials.holeTrim);
    const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), redRacePodiumMaterials.redEdge);
    bolt.position.set(side * 3.38, 0.54, 1.64);
    podiumStructure.add(bolt);
  }
  return stand;
}

function setRacePodiumUsername(podium, pilotName) {
  const username = String(pilotName || '').trim();
  podium?.traverse((object) => {
    if (!object.userData.isPodiumNameplateText || object.userData.podiumUsername === username) return;
    let canvas = object.userData.podiumUsernameCanvas;
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = 1024;
      canvas.height = 256;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
      const material = new THREE.MeshBasicMaterial({ map: texture, toneMapped: false, side: THREE.DoubleSide });
      object.userData.podiumUsernameCanvas = canvas;
      object.userData.podiumUsernameTexture = texture;
      object.userData.podiumUsernameMaterial = material;
      object.material = material;
    }
    drawMenuPodiumLabel(canvas, username);
    object.userData.podiumUsernameTexture.needsUpdate = true;
    object.userData.podiumUsername = username;
  });
}

function buildMenuDronePads() {
  const lampMetal = new THREE.MeshStandardMaterial({ color: 0x263746, roughness: 0.34, metalness: 0.78 });
  const lampHousing = new THREE.MeshStandardMaterial({ color: 0x172431, roughness: 0.4, metalness: 0.62 });
  const lampLens = new THREE.MeshStandardMaterial({
    color: 0xffedce,
    emissive: 0xffd89e,
    emissiveIntensity: 1.35,
    roughness: 0.62,
    metalness: 0.08,
    toneMapped: false,
  });

  const addStreetLamp = ({ x, z, targetX, targetZ, intensity = 560, range = 62 }) => {
    const poleHeight = 13.8;
    const group = new THREE.Group();
    group.position.set(x, 0, z);
    menuStreetLampRoot.add(group);

    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.58, 0.3, 12), lampMetal);
    base.position.y = 0.02;
    group.add(base);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, poleHeight, 12), lampMetal);
    pole.position.y = poleHeight / 2;
    group.add(pole);

    const horizontal = new THREE.Vector3(targetX - x, 0, targetZ - z).normalize();
    const headPosition = new THREE.Vector3(horizontal.x * 1.05, poleHeight + 0.05, horizontal.z * 1.05);
    const armStart = new THREE.Vector3(0, poleHeight - 0.05, 0);
    const armEnd = headPosition.clone();
    const armDirection = armEnd.clone().sub(armStart);
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, armDirection.length(), 10), lampMetal);
    arm.position.copy(armStart).add(armEnd).multiplyScalar(0.5);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), armDirection.normalize());
    group.add(arm);

    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.2, 0.64), lampHousing);
    hood.position.copy(headPosition).addScaledVector(horizontal, 0.32);
    group.add(hood);
    const diffuser = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.045, 0.42), lampLens);
    diffuser.position.set(hood.position.x, hood.position.y - 0.125, hood.position.z);
    group.add(diffuser);

    const light = new THREE.SpotLight(0xffd09a, intensity, range, Math.PI / 4, 0.88, 2);
    light.position.set(x + hood.position.x, hood.position.y - 0.06, z + hood.position.z);
    light.target.position.set(targetX, 0.08, targetZ);
    light.castShadow = true;
    light.shadow.mapSize.set(512, 512);
    light.shadow.camera.near = 0.5;
    light.shadow.camera.far = range - 4;
    light.shadow.bias = -0.00012;
    light.shadow.normalBias = 0.025;
    light.shadow.radius = 3;
    menuStreetLampRoot.add(light, light.target);
  };

  [
    { x: -35, z: -42, targetX: -24, targetZ: -31 },
    { x: 0, z: 37, targetX: 0, targetZ: -6, intensity: 5000, range: 72 },
    { x: 35, z: -42, targetX: 24, targetZ: -31 },
  ].forEach(addStreetLamp);

  menuDronePadPositions.forEach(([x, z], index) => {
    const stand = createRedRacePodium(createMenuPodiumLabel(index));
    stand.position.set(x, 0, z);
    menuStageRoot.add(stand);
  });
}

const menuPlatformSize = 600;
const menuPlatformHalfSize = menuPlatformSize / 2;
const menuPlatformCenterZ = 95;
const menuPlatformThickness = 4;
const menuPlatformCenterY = -2.05;
const menuPlatformBottomY = menuPlatformCenterY - menuPlatformThickness / 2;
const menuPlatformSurfaceY = -0.042;
const menuSponsorSlotCount = 8;
const menuSponsorLogoSources = [];

function createSponsorBoardFallbackTexture(index, aspectRatio) {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = Math.round(canvas.width / aspectRatio);
  const context = canvas.getContext('2d');
  const accents = ['#55e8ff', '#ff64bd'];
  const accent = accents[index % accents.length];
  context.fillStyle = '#091522';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = accent;
  context.fillRect(0, 0, 8, canvas.height);
  context.fillRect(canvas.width - 8, 0, 8, canvas.height);
  context.strokeStyle = '#294354';
  context.lineWidth = 2;
  context.strokeRect(14, 8, canvas.width - 28, canvas.height - 16);
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.fillStyle = '#f1f8ff';
  context.font = '800 84px Arial, sans-serif';
  context.fillText('XSPEC', canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return texture;
}

function buildMenuSponsorBoards() {
  const panelCount = 32;
  const panelSpan = (menuPlatformSize - 26) / panelCount;
  const panelHeight = 1.55;
  const panelWidth = panelSpan - 0.12;
  const panelTextureAspect = panelWidth / (panelHeight - 0.2);
  const fallbackTextures = Array.from({ length: menuSponsorSlotCount }, (_, index) => createSponsorBoardFallbackTexture(index, panelTextureAspect));
  const materials = fallbackTextures.map((texture) => new THREE.MeshBasicMaterial({
    map: texture,
    side: THREE.DoubleSide,
    toneMapped: false,
  }));
  const loader = new THREE.TextureLoader();
  menuSponsorLogoSources.forEach((source, index) => {
    loader.load(source, (loaded) => {
      loaded.colorSpace = THREE.SRGBColorSpace;
      loaded.anisotropy = renderer.capabilities.getMaxAnisotropy();
      materials[index].map = loaded;
      materials[index].needsUpdate = true;
    }, undefined, () => {});
  });

  const sides = [
    { axis: 'x', coordinate: 0, z: menuPlatformCenterZ - menuPlatformHalfSize + 1.8, angle: 0, offset: 0 },
    { axis: 'x', coordinate: 0, z: menuPlatformCenterZ + menuPlatformHalfSize - 1.8, angle: Math.PI, offset: 2 },
    { axis: 'z', coordinate: -menuPlatformHalfSize + 1.8, z: menuPlatformCenterZ, angle: Math.PI / 2, offset: 4 },
    { axis: 'z', coordinate: menuPlatformHalfSize - 1.8, z: menuPlatformCenterZ, angle: -Math.PI / 2, offset: 6 },
  ];
  const boardY = menuPlatformSurfaceY + panelHeight / 2 + 0.12;
  const railMaterial = new THREE.MeshStandardMaterial({ color: 0x142131, roughness: 0.62, metalness: 0.38 });
  const railGlow = new THREE.MeshBasicMaterial({ color: 0x50e8ff, toneMapped: false });
  const addBoardPart = (size, position, material) => {
    const part = box(menuBackdropRoot, size, position, material);
    part.userData.skipShadows = true;
    part.userData.skipBuilderSelection = true;
  };

  sides.forEach((side, sideIndex) => {
    for (let panelIndex = 0; panelIndex < panelCount; panelIndex += 1) {
      const along = -((panelCount - 1) * panelSpan) / 2 + panelIndex * panelSpan;
      const x = side.axis === 'x' ? along : side.coordinate;
      const z = side.axis === 'x' ? side.z : side.z + along;
      const width = panelWidth;
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(width, panelHeight - 0.2), materials[(panelIndex + side.offset) % materials.length]);
      panel.position.set(x, boardY, z);
      panel.rotation.y = side.angle;
      panel.name = `Menu sponsor board ${sideIndex + 1}-${panelIndex + 1}`;
      panel.userData.skipBuilderSelection = true;
      panel.userData.skipShadows = true;
      menuBackdropRoot.add(panel);

      if (side.axis === 'x') {
        addBoardPart([width, 0.12, 0.24], [x, boardY - panelHeight / 2, z], railMaterial);
        addBoardPart([width, 0.1, 0.24], [x, boardY + panelHeight / 2, z], railGlow);
        addBoardPart([0.1, panelHeight, 0.24], [x - width / 2, boardY, z], railMaterial);
        addBoardPart([0.1, panelHeight, 0.24], [x + width / 2, boardY, z], railMaterial);
      } else {
        addBoardPart([0.24, 0.12, width], [x, boardY - panelHeight / 2, z], railMaterial);
        addBoardPart([0.24, 0.1, width], [x, boardY + panelHeight / 2, z], railGlow);
        addBoardPart([0.24, panelHeight, 0.1], [x, boardY, z - width / 2], railMaterial);
        addBoardPart([0.24, panelHeight, 0.1], [x, boardY, z + width / 2], railMaterial);
      }
    }
  });
}

function buildMenuSkyPlatform() {
  const platformZ = menuPlatformCenterZ;
  const platformMaterial = new THREE.MeshStandardMaterial({ color: 0x172332, roughness: 0.76, metalness: 0.32, emissive: 0x050b13, emissiveIntensity: 0.28 });
  const edgeCyan = new THREE.MeshBasicMaterial({ color: 0x4de5ff, toneMapped: false });
  const edgePink = new THREE.MeshBasicMaterial({ color: 0xff56bb, toneMapped: false });

  // The platform is 600 by 600 scene feet, with the existing menu stage near its far edge.
  box(menuBackdropRoot, [menuPlatformSize, menuPlatformThickness, menuPlatformSize], [0, menuPlatformCenterY, platformZ], platformMaterial);
  const platformCollision = new THREE.Mesh(
    new THREE.BoxGeometry(menuPlatformSize, menuPlatformThickness, menuPlatformSize),
    new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, transparent: true, opacity: 0, side: THREE.DoubleSide }),
  );
  platformCollision.name = 'Invisible solid flight deck';
  platformCollision.position.set(0, menuPlatformCenterY, platformZ);
  menuPlatformCollisionRoot.add(platformCollision);
  const grassTexture = docksGrassGroundTexture.clone();
  grassTexture.repeat.set(menuPlatformSize / 20, menuPlatformSize / 20);
  grassTexture.needsUpdate = true;
  const grassMaterial = new THREE.MeshStandardMaterial({
    map: grassTexture,
    color: 0xffffff,
    roughness: 0.98,
    metalness: 0,
    emissive: 0x10190b,
    emissiveIntensity: 0.22,
  });
  const grassGround = new THREE.Mesh(new THREE.PlaneGeometry(menuPlatformSize - 0.2, menuPlatformSize - 0.2), grassMaterial);
  grassGround.name = 'Continuous textured grass on the sky platform';
  grassGround.rotation.x = -Math.PI / 2;
  grassGround.position.set(0, menuPlatformSurfaceY + 0.035, platformZ);
  grassGround.receiveShadow = true;
  grassGround.userData.flightGroundSurface = true;
  grassGround.userData.skipBuilderSelection = true;
  menuBackdropRoot.add(grassGround);
  const bladeGeometry = new THREE.BufferGeometry();
  bladeGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
    -0.07, 0, 0, 0.07, 0, 0, 0.012, 0.62, 0,
  ], 3));
  bladeGeometry.setIndex([0, 2, 1]);
  bladeGeometry.computeVertexNormals();
  const bladeMaterial = new THREE.MeshStandardMaterial({
    color: 0x5e9a48,
    roughness: 0.92,
    metalness: 0,
    emissive: 0x123012,
    emissiveIntensity: 0.22,
    side: THREE.DoubleSide,
  });
  bladeMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uGrassWindTime = { value: 0 };
    menuGrassWindUniform = shader.uniforms.uGrassWindTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uGrassWindTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float grassWindPhase = uGrassWindTime + instanceMatrix[3][0] * 0.075 + instanceMatrix[3][2] * 0.061;
          transformed.x += sin(grassWindPhase) * transformed.y * 0.24;
          transformed.z += cos(grassWindPhase * 0.83) * transformed.y * 0.13;
        #endif`);
  };
  const grassBladeCount = 14000;
  const grassBlades = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, grassBladeCount);
  grassBlades.name = 'Wind-swaying grass blades across the platform';
  grassBlades.frustumCulled = false;
  grassBlades.userData.skipBuilderSelection = true;
  grassBlades.userData.flightGroundSurface = true;
  const bladeTransform = new THREE.Object3D();
  let bladeSeed = 0x38c451;
  const nextBladeRandom = () => {
    bladeSeed = (Math.imul(bladeSeed, 1664525) + 1013904223) >>> 0;
    return bladeSeed / 4294967296;
  };
  const bladeColors = [new THREE.Color(0x4e8d3d), new THREE.Color(0x6ca85a), new THREE.Color(0x3d7a31), new THREE.Color(0x86bc5d)];
  const grassBladeSpread = menuPlatformSize - 24;
  for (let index = 0; index < grassBladeCount; index += 1) {
    bladeTransform.position.set(
      (nextBladeRandom() - 0.5) * grassBladeSpread,
      menuPlatformSurfaceY + 0.14,
      menuPlatformCenterZ + (nextBladeRandom() - 0.5) * grassBladeSpread,
    );
    bladeTransform.rotation.set(0, nextBladeRandom() * Math.PI * 2, 0);
    const heightScale = 0.46 + nextBladeRandom() * 0.9;
    bladeTransform.scale.set(0.55 + nextBladeRandom() * 0.8, heightScale, 0.65 + nextBladeRandom() * 0.65);
    bladeTransform.updateMatrix();
    grassBlades.setMatrixAt(index, bladeTransform.matrix);
    grassBlades.setColorAt(index, bladeColors[Math.floor(nextBladeRandom() * bladeColors.length)]);
  }
  grassBlades.instanceMatrix.needsUpdate = true;
  if (grassBlades.instanceColor) grassBlades.instanceColor.needsUpdate = true;
  menuBackdropRoot.add(grassBlades);
  const edgeZ = menuPlatformHalfSize;
  const edgeX = menuPlatformHalfSize;
  box(menuBackdropRoot, [menuPlatformSize, 0.08, 0.16], [0, 0.01, platformZ - edgeZ], edgeCyan);
  box(menuBackdropRoot, [menuPlatformSize, 0.08, 0.16], [0, 0.01, platformZ + edgeZ], edgePink);
  for (const side of [-1, 1]) {
    box(menuBackdropRoot, [0.16, 0.08, menuPlatformSize], [side * edgeX, 0.01, platformZ], side < 0 ? edgePink : edgeCyan);
  }
  const undersideY = menuPlatformBottomY - 0.045;
  const addUndersideLightBar = (size, position, material) => {
    const bar = box(menuBackdropRoot, size, position, material);
    bar.userData.skipShadows = true;
    bar.userData.skipBuilderSelection = true;
  };
  addUndersideLightBar([menuPlatformSize - 2, 0.1, 0.22], [0, undersideY, platformZ - edgeZ + 1], edgeCyan);
  addUndersideLightBar([menuPlatformSize - 2, 0.1, 0.22], [0, undersideY, platformZ + edgeZ - 1], edgePink);
  for (const side of [-1, 1]) {
    addUndersideLightBar([0.22, 0.1, menuPlatformSize - 2], [side * (edgeX - 1), undersideY, platformZ], side < 0 ? edgePink : edgeCyan);
  }
  const undersideGrassTexture = docksGrassGroundTexture.clone();
  undersideGrassTexture.repeat.set(menuPlatformSize / 20, menuPlatformSize / 20);
  undersideGrassTexture.needsUpdate = true;
  const undersidePanel = new THREE.Mesh(
    new THREE.PlaneGeometry(menuPlatformSize - 18, menuPlatformSize - 18),
    new THREE.MeshStandardMaterial({
      map: undersideGrassTexture,
      color: 0x9db67a,
      roughness: 0.98,
      metalness: 0,
      emissive: 0x15220d,
      emissiveIntensity: 0.36,
      side: THREE.DoubleSide,
    }),
  );
  undersidePanel.name = 'Textured grass on the illuminated platform underside';
  undersidePanel.rotation.x = Math.PI / 2;
  undersidePanel.position.set(0, menuPlatformBottomY - 0.012, platformZ);
  undersidePanel.userData.skipShadows = true;
  undersidePanel.userData.skipBuilderSelection = true;
  menuBackdropRoot.add(undersidePanel);
  const undersideRibMaterial = new THREE.MeshBasicMaterial({ color: 0x27869b, toneMapped: false });
  for (const offset of [-75, -25, 25, 75]) {
    addUndersideLightBar([menuPlatformSize - 34, 0.04, 0.08], [0, menuPlatformBottomY - 0.04, platformZ + offset], undersideRibMaterial);
    addUndersideLightBar([0.08, 0.04, menuPlatformSize - 34], [offset, menuPlatformBottomY - 0.04, platformZ], undersideRibMaterial);
  }
  for (const x of [-112, 112]) {
    for (const z of [platformZ - 112, platformZ + 112]) {
      const underlight = new THREE.PointLight(x < 0 ? 0x50e8ff : 0xff68c4, 95, 74, 2);
      underlight.position.set(x, menuPlatformBottomY - 0.16, z);
      underlight.castShadow = false;
      menuBackdropRoot.add(underlight);
    }
  }
  buildMenuSponsorBoards();

  const starCount = 24000;
  const positions = new Float32Array(starCount * 3);
  const starSizes = new Float32Array(starCount);
  const starColors = new Float32Array(starCount * 3);
  const starTwinkles = new Float32Array(starCount);
  let seed = 0x192bf3;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const starPalette = [
    new THREE.Color(0xe7f2ff),
    new THREE.Color(0xb6d8ff),
    new THREE.Color(0x9ceaff),
    new THREE.Color(0xffdfb3),
  ];
  for (let index = 0; index < starCount; index += 1) {
    const angle = random() * Math.PI * 2;
    const vertical = random() * 2 - 1;
    const horizontal = Math.sqrt(1 - vertical * vertical);
    const distance = 900 + random() * 1500;
    positions[index * 3] = Math.cos(angle) * horizontal * distance;
    positions[index * 3 + 1] = 32 + vertical * distance;
    positions[index * 3 + 2] = Math.sin(angle) * horizontal * distance + platformZ;
    const brightStar = random() > 0.965;
    starSizes[index] = brightStar ? 15 + random() * 8 : 4.5 + random() * 8;
    starTwinkles[index] = random();
    const color = starPalette[Math.floor(random() * starPalette.length)];
    starColors[index * 3] = color.r;
    starColors[index * 3 + 1] = color.g;
    starColors[index * 3 + 2] = color.b;
  }
  const starGeometry = new THREE.BufferGeometry();
  starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  starGeometry.setAttribute('aSize', new THREE.BufferAttribute(starSizes, 1));
  starGeometry.setAttribute('aColor', new THREE.BufferAttribute(starColors, 3));
  starGeometry.setAttribute('aTwinkle', new THREE.BufferAttribute(starTwinkles, 1));
  const starMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uMusicEnergy: { value: 0 },
      uMusicBass: { value: 0 },
      uMusicMids: { value: 0 },
      uMusicHigh: { value: 0 },
      uMusicHue: { value: 0 },
    },
    vertexShader: `
      attribute float aSize;
      attribute vec3 aColor;
      attribute float aTwinkle;
      uniform float uTime;
      uniform float uMusicEnergy;
      uniform float uMusicHue;
      varying vec3 vStarColor;
      varying float vStarAlpha;
      varying float vStarTwinkle;
      void main() {
        float hueOffset = uMusicHue + aTwinkle * 0.19;
        vec3 spectrum = 0.5 + 0.5 * cos(6.28318 * (hueOffset + vec3(0.0, 0.33, 0.67)));
        float colorMix = clamp(uMusicEnergy * 1.8, 0.0, 0.88);
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vStarColor = mix(aColor, spectrum, colorMix);
        vStarAlpha = 0.48 + aTwinkle * 0.48;
        vStarTwinkle = aTwinkle;
        gl_PointSize = max(1.3, aSize * (420.0 / max(1.0, -viewPosition.z)));
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      varying vec3 vStarColor;
      varying float vStarAlpha;
      varying float vStarTwinkle;
      void main() {
        float radius = length(gl_PointCoord - vec2(0.5)) * 2.0;
        float core = 1.0 - smoothstep(0.04, 0.22, radius);
        float halo = 1.0 - smoothstep(0.12, 1.0, radius);
        float shimmer = 0.88 + 0.12 * sin(uTime * (0.7 + vStarTwinkle) + vStarTwinkle * 31.0);
        float alpha = (core * 0.95 + halo * 0.22) * vStarAlpha * shimmer;
        if (alpha < 0.012) discard;
        gl_FragColor = vec4(vStarColor * (core * 1.35 + halo * 0.42), alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  });
  menuStarTimeUniform = starMaterial.uniforms.uTime;
  menuStarMusicUniforms = {
    energy: starMaterial.uniforms.uMusicEnergy,
    bass: starMaterial.uniforms.uMusicBass,
    mids: starMaterial.uniforms.uMusicMids,
    high: starMaterial.uniforms.uMusicHigh,
    hue: starMaterial.uniforms.uMusicHue,
  };
  menuStarField = new THREE.Points(starGeometry, starMaterial);
  menuStarField.name = 'Dense high detail starfield around the sky platform';
  menuStarField.renderOrder = -1;
  menuBackdropRoot.add(menuStarField);

  const moonCanvas = document.createElement('canvas');
  moonCanvas.width = 1024;
  moonCanvas.height = 512;
  const moonContext = moonCanvas.getContext('2d');
  const moonBase = moonContext.createLinearGradient(0, 0, 0, moonCanvas.height);
  moonBase.addColorStop(0, '#d5ddeb');
  moonBase.addColorStop(0.5, '#aebdd2');
  moonBase.addColorStop(1, '#7f91ac');
  moonContext.fillStyle = moonBase;
  moonContext.fillRect(0, 0, moonCanvas.width, moonCanvas.height);
  for (let crater = 0; crater < 145; crater += 1) {
    const x = random() * moonCanvas.width;
    const y = random() * moonCanvas.height;
    const radius = 3 + Math.pow(random(), 2.3) * 52;
    const craterGradient = moonContext.createRadialGradient(x - radius * 0.28, y - radius * 0.34, radius * 0.08, x, y, radius);
    craterGradient.addColorStop(0, 'rgba(239,245,252,0.11)');
    craterGradient.addColorStop(0.62, 'rgba(154,171,194,0.08)');
    craterGradient.addColorStop(0.82, 'rgba(58,76,103,0.30)');
    craterGradient.addColorStop(1, 'rgba(223,232,244,0.22)');
    moonContext.fillStyle = craterGradient;
    moonContext.beginPath();
    moonContext.arc(x, y, radius, 0, Math.PI * 2);
    moonContext.fill();
  }
  for (let speck = 0; speck < 5200; speck += 1) {
    const shade = random() > 0.5 ? 255 : 30;
    moonContext.fillStyle = `rgba(${shade},${shade},${shade},${0.015 + random() * 0.05})`;
    moonContext.fillRect(random() * moonCanvas.width, random() * moonCanvas.height, 1 + random() * 2, 1 + random() * 2);
  }
  const moonTexture = new THREE.CanvasTexture(moonCanvas);
  moonTexture.colorSpace = THREE.SRGBColorSpace;
  moonTexture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const moonMaterial = new THREE.MeshBasicMaterial({ map: moonTexture, color: 0xa9bad4, toneMapped: false, fog: false });
  const moonMesh = new THREE.Mesh(new THREE.SphereGeometry(46, 64, 48), moonMaterial);
  moonMesh.name = 'Textured moon behind the sky platform';
  menuMoonGroup = new THREE.Group();
  menuMoonGroup.name = 'World orbiting moon';
  menuMoonGroup.add(moonMesh);
  menuMoonOrbit = {
    phase: Math.random() * Math.PI * 2,
    radiusX: 3100 + Math.random() * 180,
    radiusZ: 3100 + Math.random() * 180,
    height: 650 + Math.random() * 220,
    heightAmplitude: 160 + Math.random() * 110,
    pathWobble: [30 + Math.random() * 45, 30 + Math.random() * 45],
    pathPhase: Math.random() * Math.PI * 2,
    pathFrequency: [2 + Math.floor(Math.random() * 2), 2 + Math.floor(Math.random() * 2)],
    verticalPhase: Math.random() * Math.PI * 2,
    speed: 0.035 + Math.random() * 0.012,
  };
  const moonStartAngle = menuMoonOrbit.phase;
  menuMoonGroup.position.set(
    Math.cos(moonStartAngle) * menuMoonOrbit.radiusX
      + Math.sin(moonStartAngle * menuMoonOrbit.pathFrequency[0] + menuMoonOrbit.pathPhase) * menuMoonOrbit.pathWobble[0],
    menuMoonOrbit.height + Math.sin(moonStartAngle * 0.72 + menuMoonOrbit.verticalPhase) * menuMoonOrbit.heightAmplitude,
    menuPlatformCenterZ + Math.sin(moonStartAngle) * menuMoonOrbit.radiusZ
      + Math.cos(moonStartAngle * menuMoonOrbit.pathFrequency[1] + menuMoonOrbit.pathPhase * 0.73) * menuMoonOrbit.pathWobble[1],
  );

  const createMusicPlanetTexture = (definition) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const context = canvas.getContext('2d');
    const base = context.createLinearGradient(0, 0, 0, canvas.height);
    base.addColorStop(0, '#080d20');
    base.addColorStop(0.22, definition.base);
    base.addColorStop(0.55, definition.bands[0]);
    base.addColorStop(0.82, definition.bands[1]);
    base.addColorStop(1, '#050918');
    context.fillStyle = base;
    context.fillRect(0, 0, canvas.width, canvas.height);

    if (definition.style === 'gas') {
      for (let band = 0; band < 38; band += 1) {
        const y = band * canvas.height / 38;
        const height = 3 + random() * 14;
        const amplitude = 4 + random() * 26;
        const phase = random() * Math.PI * 2;
        context.globalAlpha = 0.12 + random() * 0.22;
        context.fillStyle = definition.bands[Math.floor(random() * definition.bands.length)];
        context.beginPath();
        context.moveTo(0, y);
        for (let x = 0; x <= canvas.width; x += 48) {
          const wave = Math.sin(x * 0.006 + phase) * amplitude + Math.sin(x * 0.017 + phase * 0.63) * amplitude * 0.32;
          context.lineTo(x, y + wave);
        }
        for (let x = canvas.width; x >= 0; x -= 48) {
          const wave = Math.sin(x * 0.006 + phase) * amplitude + Math.sin(x * 0.017 + phase * 0.63) * amplitude * 0.32;
          context.lineTo(x, y + height + wave);
        }
        context.closePath();
        context.fill();
      }
      for (let storm = 0; storm < 12; storm += 1) {
        const x = random() * canvas.width;
        const y = random() * canvas.height;
        const radiusX = 18 + random() * 72;
        const radiusY = 7 + random() * 28;
        const stormGlow = context.createRadialGradient(x, y, 1, x, y, radiusX);
        stormGlow.addColorStop(0, 'rgba(241,249,255,0.66)');
        stormGlow.addColorStop(0.28, 'rgba(194,224,255,0.34)');
        stormGlow.addColorStop(0.72, 'rgba(128,91,255,0.2)');
        stormGlow.addColorStop(1, 'rgba(8,13,32,0)');
        context.save();
        context.translate(x, y);
        context.rotate((random() - 0.5) * 0.35);
        context.scale(1, radiusY / radiusX);
        context.fillStyle = stormGlow;
        context.beginPath();
        context.arc(0, 0, radiusX, 0, Math.PI * 2);
        context.fill();
        context.restore();
      }
    } else if (definition.style === 'marbled') {
      // Broad, curled cloud swirls keep this surface colorful without dark crater pits.
      for (let vortex = 0; vortex < 10; vortex += 1) {
        const x = random() * canvas.width;
        const y = random() * canvas.height;
        const radiusX = 34 + random() * 96;
        const radiusY = 12 + random() * 40;
        const rotation = (random() - 0.5) * 0.8;
        context.save();
        context.translate(x, y);
        context.rotate(rotation);
        const cloudGlow = context.createRadialGradient(0, 0, 1, 0, 0, radiusX);
        cloudGlow.addColorStop(0, definition.bands[0]);
        cloudGlow.addColorStop(0.46, definition.bands[1]);
        cloudGlow.addColorStop(1, 'rgba(8,13,32,0)');
        context.globalAlpha = 0.24 + random() * 0.22;
        context.fillStyle = cloudGlow;
        context.beginPath();
        context.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
        context.fill();
        for (let curl = 0; curl < 4; curl += 1) {
          context.strokeStyle = definition.bands[curl % definition.bands.length];
          context.globalAlpha = 0.2 + random() * 0.25;
          context.lineWidth = 2 + random() * 5;
          context.beginPath();
          context.ellipse(0, 0, radiusX * (0.34 + curl * 0.14), radiusY * (0.32 + curl * 0.15), 0, -0.45, Math.PI * 1.55);
          context.stroke();
        }
        context.restore();
      }
    } else if (definition.style === 'ocean') {
      // Large broken landmasses and bright coastlines give this world a clear ocean look.
      for (let landmass = 0; landmass < 13; landmass += 1) {
        const x = random() * canvas.width;
        const y = 45 + random() * (canvas.height - 90);
        const width = 35 + random() * 115;
        const height = 18 + random() * 50;
        context.save();
        context.translate(x, y);
        context.rotate((random() - 0.5) * 0.6);
        context.fillStyle = definition.bands[1];
        context.globalAlpha = 0.3 + random() * 0.28;
        context.beginPath();
        context.moveTo(-width * 0.55, -height * 0.12);
        context.bezierCurveTo(-width * 0.45, -height * 0.78, -width * 0.04, -height * 0.55, width * 0.08, -height * 0.72);
        context.bezierCurveTo(width * 0.7, -height * 0.52, width * 0.36, -height * 0.08, width * 0.58, height * 0.2);
        context.bezierCurveTo(width * 0.24, height * 0.78, -width * 0.12, height * 0.32, -width * 0.38, height * 0.55);
        context.bezierCurveTo(-width * 0.76, height * 0.24, -width * 0.3, height * 0.06, -width * 0.55, -height * 0.12);
        context.closePath();
        context.fill();
        context.strokeStyle = definition.bands[0];
        context.globalAlpha = 0.42;
        context.lineWidth = 2 + random() * 5;
        context.stroke();
        context.restore();
      }
      for (let cloud = 0; cloud < 70; cloud += 1) {
        const x = random() * canvas.width;
        const y = random() * canvas.height;
        context.strokeStyle = definition.bands[0];
        context.globalAlpha = 0.1 + random() * 0.18;
        context.lineWidth = 1 + random() * 5;
        context.beginPath();
        context.ellipse(x, y, 8 + random() * 45, 2 + random() * 8, random() * 0.5, 0, Math.PI * 2);
        context.stroke();
      }
    } else if (definition.style === 'craters') {
      // Rim-lit craters and uneven color patches make this smaller world rocky.
      for (let patch = 0; patch < 120; patch += 1) {
        const x = random() * canvas.width;
        const y = random() * canvas.height;
        const radius = 12 + random() * 72;
        const patchGlow = context.createRadialGradient(x - radius * 0.3, y - radius * 0.35, 1, x, y, radius);
        patchGlow.addColorStop(0, 'rgba(255,226,207,0.18)');
        patchGlow.addColorStop(0.58, 'rgba(255,105,153,0.07)');
        patchGlow.addColorStop(1, 'rgba(8,13,32,0)');
        context.fillStyle = patchGlow;
        context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      }
      for (let crater = 0; crater < 180; crater += 1) {
        const x = random() * canvas.width;
        const y = random() * canvas.height;
        const radius = 2 + Math.pow(random(), 2.2) * 31;
        const craterShade = context.createRadialGradient(x - radius * 0.35, y - radius * 0.38, radius * 0.08, x, y, radius);
        craterShade.addColorStop(0, 'rgba(255,230,229,0.18)');
        craterShade.addColorStop(0.68, 'rgba(25,15,37,0.05)');
        craterShade.addColorStop(0.82, 'rgba(12,8,23,0.48)');
        craterShade.addColorStop(1, 'rgba(255,135,193,0.24)');
        context.fillStyle = craterShade;
        context.beginPath();
        context.arc(x, y, radius, 0, Math.PI * 2);
        context.fill();
      }
    } else if (definition.style === 'fractured') {
      // Angular glowing fissures create a volcanic, glassy surface.
      for (let plate = 0; plate < 95; plate += 1) {
        const x = random() * canvas.width;
        const y = random() * canvas.height;
        const width = 18 + random() * 85;
        const height = 8 + random() * 38;
        context.globalAlpha = 0.08 + random() * 0.16;
        context.fillStyle = definition.bands[Math.floor(random() * definition.bands.length)];
        context.beginPath();
        context.moveTo(x - width, y - height * 0.2);
        context.lineTo(x - width * 0.25, y - height);
        context.lineTo(x + width, y - height * 0.45);
        context.lineTo(x + width * 0.35, y + height);
        context.lineTo(x - width * 0.8, y + height * 0.55);
        context.closePath();
        context.fill();
      }
      for (let crack = 0; crack < 82; crack += 1) {
        let x = random() * canvas.width;
        let y = random() * canvas.height;
        const length = 40 + random() * 190;
        context.strokeStyle = definition.bands[0];
        context.globalAlpha = 0.18 + random() * 0.48;
        context.lineWidth = 0.8 + random() * 2.3;
        context.beginPath();
        context.moveTo(x, y);
        for (let step = 0; step < 5; step += 1) {
          x += (random() - 0.5) * 42;
          y += length / 5;
          context.lineTo(x, y);
        }
        context.stroke();
      }
    }
    context.globalAlpha = 1;

    const surfacePixels = context.getImageData(0, 0, canvas.width, canvas.height);
    for (let pixel = 0; pixel < surfacePixels.data.length; pixel += 4) {
      const luminance = surfacePixels.data[pixel] * 0.2126
        + surfacePixels.data[pixel + 1] * 0.7152
        + surfacePixels.data[pixel + 2] * 0.0722;
      const gray = Math.min(255, 12 + luminance * 0.9);
      surfacePixels.data[pixel] = gray;
      surfacePixels.data[pixel + 1] = gray;
      surfacePixels.data[pixel + 2] = gray;
    }
    context.putImageData(surfacePixels, 0, 0);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  };

  const musicPlanets = [
    { radius: 168, base: '#102450', bands: ['#1bd6ec', '#5867ff', '#b84ce6'], hue: 0.53, rotationSpeed: 0.024, style: 'gas', ring: 0x7adfff, ringTilt: 1.02 },
    { radius: 132, base: '#26113e', bands: ['#ff56bb', '#7550ee', '#49b8e6'], hue: 0.83, rotationSpeed: -0.018, style: 'marbled', ring: 0xff9dde, ringTilt: 0.82 },
    { radius: 96, base: '#123740', bands: ['#43f2bc', '#45a8e9', '#b3f06a'], hue: 0.39, rotationSpeed: 0.033, style: 'ocean', ring: 0x8dffc9, ringTilt: 1.14 },
    { radius: 72, base: '#3a1f22', bands: ['#ff8d55', '#de4fa1', '#f2cf72'], hue: 0.06, rotationSpeed: -0.027, style: 'fractured', ring: 0xffc17d, ringTilt: 0.94 },
  ];
  const orbitStartPhase = Math.random() * Math.PI * 2;
  const sharedOrbitSpeed = 0.045 + Math.random() * 0.02;
  musicPlanets.forEach((definition, index) => {
    const planet = new THREE.Group();
    const orbitPhase = orbitStartPhase + index * Math.PI / 2;
    const orbitRadiusX = 2100 + Math.random() * 280;
    const orbitRadiusZ = 2100 + Math.random() * 280;
    const pathWobble = [35 + Math.random() * 65, 35 + Math.random() * 65];
    const pathPhase = Math.random() * Math.PI * 2;
    const pathFrequency = [2 + Math.floor(Math.random() * 2), 2 + Math.floor(Math.random() * 2)];
    const heightCenter = 400 + Math.random() * 350;
    const heightAmplitude = 120 + Math.random() * 180;
    const verticalPhase = Math.random() * Math.PI * 2;
    const startX = Math.cos(orbitPhase) * orbitRadiusX
      + Math.sin(orbitPhase * pathFrequency[0] + pathPhase) * pathWobble[0];
    const startY = heightCenter + Math.sin(orbitPhase * 0.72 + verticalPhase) * heightAmplitude;
    const startZ = menuPlatformCenterZ + Math.sin(orbitPhase) * orbitRadiusZ
      + Math.cos(orbitPhase * pathFrequency[1] + pathPhase * 0.73) * pathWobble[1];
    planet.position.set(startX, startY, startZ);
    const sphere = new THREE.SphereGeometry(definition.radius, 64, 48);
    const texture = createMusicPlanetTexture(definition);
    const surface = new THREE.Mesh(sphere, new THREE.MeshBasicMaterial({ map: texture, color: 0xc9cdd4, toneMapped: false, fog: false }));
    planet.add(surface);
    const rings = [];
    if (definition.ring) {
      const outerRing = new THREE.Mesh(
        new THREE.RingGeometry(definition.radius * 1.08, definition.radius * 1.82, 128),
        new THREE.MeshBasicMaterial({ color: definition.ring, transparent: true, opacity: 0.19, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }),
      );
      outerRing.rotation.set(definition.ringTilt, 0.12 + index * 0.08, 0.16);
      rings.push({ mesh: outerRing, baseOpacity: 0.19, hueOffset: 0.1, musicBand: 'bass', pulseAmount: 0.07, spinSpeed: 0.012 + index * 0.002 });
      planet.add(outerRing);
      const innerRing = new THREE.Mesh(
        new THREE.RingGeometry(definition.radius * 1.015, definition.radius * 1.1, 128),
        new THREE.MeshBasicMaterial({ color: definition.ring, transparent: true, opacity: 0.28, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false, fog: false }),
      );
      innerRing.rotation.copy(outerRing.rotation);
      rings.push({ mesh: innerRing, baseOpacity: 0.28, hueOffset: 0.24, musicBand: 'mids', pulseAmount: 0.04, spinSpeed: -0.02 - index * 0.003 });
      planet.add(innerRing);
    }
    menuPlanetsRoot.add(planet);
    menuPlanetVisuals.push({
      root: planet,
      basePosition: new THREE.Vector3(0, heightCenter, menuPlatformCenterZ),
      surface,
      rings,
      hueOffset: definition.hue,
      rotationSpeed: definition.rotationSpeed,
      orbitPhase,
      orbitRadiusX,
      orbitRadiusZ,
      pathWobble,
      pathSpeed: sharedOrbitSpeed,
      pathPhase,
      pathFrequency,
      heightAmplitude,
      verticalPhase,
    });
  });
  menuBackdropRoot.add(menuMoonGroup);
}

function buildMenuGroundAndHangar() {
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x374353, roughness: 0.98, metalness: 0.015, flatShading: true });
  const padPavement = new THREE.MeshStandardMaterial({ color: 0x566271, roughness: 0.88, metalness: 0.035 });
  const sidewalkMaterial = new THREE.MeshStandardMaterial({ color: 0x505c6a, roughness: 0.9, metalness: 0.025 });
  const roadMaterial = new THREE.MeshStandardMaterial({ color: 0x101723, roughness: 0.97, metalness: 0 });
  const plazaMaterial = new THREE.MeshStandardMaterial({ color: 0x303a45, roughness: 0.96, metalness: 0.01 });
  const curbMaterial = new THREE.MeshStandardMaterial({ color: 0x515d68, roughness: 0.94, metalness: 0.015 });
  const jointMaterial = new THREE.MeshStandardMaterial({ color: 0x3a4652, roughness: 0.97, metalness: 0 });
  const drainMaterial = new THREE.MeshStandardMaterial({ color: 0x202a34, roughness: 0.94, metalness: 0.08 });
  const centerLineMaterial = new THREE.MeshStandardMaterial({ color: 0x867a5d, roughness: 0.92, metalness: 0 });
  const edgeLineMaterial = new THREE.MeshStandardMaterial({ color: 0x81898a, roughness: 0.93, metalness: 0 });
  const grassMaterial = new THREE.MeshStandardMaterial({ color: 0x173d35, roughness: 0.96, metalness: 0.01 });
  const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0x38a76d, roughness: 0.92, vertexColors: true, side: THREE.DoubleSide });
  const stepMaterial = new THREE.MeshStandardMaterial({ color: 0x75818e, roughness: 0.84, metalness: 0.045 });
  const buildingMaterial = new THREE.MeshStandardMaterial({ color: 0x182536, roughness: 0.84, metalness: 0.08, flatShading: true });
  const facadeMaterial = new THREE.MeshStandardMaterial({ color: 0x101f30, roughness: 0.82, metalness: 0.1, emissive: 0x061321, emissiveIntensity: 0.52 });
  const glassMaterial = new THREE.MeshStandardMaterial({ color: 0x17415a, roughness: 0.46, metalness: 0.12, emissive: 0x0b526a, emissiveIntensity: 0.28 });
  const cyanTrim = new THREE.MeshStandardMaterial({ color: 0x4de4ff, roughness: 0.28, emissive: 0x20bddd, emissiveIntensity: 1.5, toneMapped: false });
  const pinkTrim = new THREE.MeshStandardMaterial({ color: 0xff4aaf, roughness: 0.28, emissive: 0xbd1b78, emissiveIntensity: 1.25, toneMapped: false });
  const doorGlass = new THREE.MeshStandardMaterial({ color: 0x1b586b, roughness: 0.58, metalness: 0.04, emissive: 0x0c394c, emissiveIntensity: 0.32, transparent: true, opacity: 0.86 });
  const doorFrame = new THREE.MeshStandardMaterial({ color: 0x101a28, roughness: 0.78, metalness: 0.12 });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x253248, roughness: 0.86, metalness: 0.08, flatShading: true });

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), groundMaterial);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.2, -20);
  ground.receiveShadow = true;
  menuBackdropRoot.add(ground);

  const lot = new THREE.Mesh(new THREE.PlaneGeometry(102, 82), grassMaterial);
  lot.rotation.x = -Math.PI / 2;
  lot.position.set(0, -0.14, -7);
  lot.receiveShadow = true;
  menuBackdropRoot.add(lot);

  // A broad concrete apron gives the podiums a finished setting while leaving grass visible around it.
  const podiumApron = new THREE.Mesh(new THREE.PlaneGeometry(76, 50), plazaMaterial);
  podiumApron.rotation.x = -Math.PI / 2;
  podiumApron.position.set(0, -0.105, -18.5);
  podiumApron.receiveShadow = true;
  menuBackdropRoot.add(podiumApron);
  const apronCurbY = -0.045;
  const apronDrivewayGap = 15;
  const apronSideLength = (76 - apronDrivewayGap) / 2;
  for (const side of [-1, 1]) {
    box(menuBackdropRoot, [0.22, 0.12, 50.25], [side * 38, apronCurbY, -18.5], curbMaterial);
    box(menuBackdropRoot, [apronSideLength, 0.12, 0.22], [side * (apronDrivewayGap / 2 + apronSideLength / 2), apronCurbY, -43.5], curbMaterial);
  }
  box(menuBackdropRoot, [76.25, 0.12, 0.22], [0, apronCurbY, 6.5], curbMaterial);

  // Concrete pads ground each drone stand and catch the neon spill around the podiums.
  menuDronePadPositions.forEach(([x, z], index) => {
    box(menuBackdropRoot, [11.5, 0.18, 8.2], [x, -0.03, z], padPavement);
    const glow = index % 2 ? pinkTrim : cyanTrim;
    box(menuBackdropRoot, [10.8, 0.026, 0.075], [x, 0.071, z - 3.85], glow);
    box(menuBackdropRoot, [10.8, 0.026, 0.075], [x, 0.071, z + 3.85], index % 2 ? cyanTrim : pinkTrim);
    for (const side of [-1, 1]) box(menuBackdropRoot, [0.075, 0.026, 7.7], [x + side * 5.35, 0.071, z], glow);
  });

  // A two-lane street joins the podium plaza to the hangar access walk.
  const streetWidth = 280;
  const streetDepth = 20;
  const streetZ = -67;
  const street = new THREE.Mesh(new THREE.PlaneGeometry(streetWidth, streetDepth), roadMaterial);
  street.rotation.x = -Math.PI / 2;
  street.position.set(0, -0.085, streetZ);
  street.receiveShadow = true;
  menuBackdropRoot.add(street);

  // A short approach lane carries traffic from the flight plaza to the cross street.
  const accessLane = new THREE.Mesh(new THREE.PlaneGeometry(14.4, 14.8), roadMaterial);
  accessLane.rotation.x = -Math.PI / 2;
  accessLane.position.set(0, -0.081, -50.2);
  accessLane.receiveShadow = true;
  menuBackdropRoot.add(accessLane);
  for (const side of [-1, 1]) {
    box(menuBackdropRoot, [0.18, 0.14, 14.5], [side * 7.2, -0.045, -50.15], curbMaterial);
    box(menuBackdropRoot, [0.1, 0.006, 13.8], [side * 6.55, -0.077, -50.2], edgeLineMaterial);
  }

  // Quiet painted lane lines and a crosswalk make the asphalt read as a real street.
  for (const offset of [-0.13, 0.13]) {
    box(menuBackdropRoot, [streetWidth - 2, 0.008, 0.075], [0, -0.079, streetZ + offset], centerLineMaterial);
  }
  for (const offset of [-8.9, 8.9]) {
    box(menuBackdropRoot, [streetWidth - 2, 0.008, 0.095], [0, -0.079, streetZ + offset], edgeLineMaterial);
  }
  for (let stripe = -3; stripe <= 3; stripe += 1) {
    box(menuBackdropRoot, [0.42, 0.008, streetDepth - 1.1], [stripe * 0.68, -0.079, streetZ], edgeLineMaterial);
  }

  // Low curbs frame both edges of the street, with an opening at the plaza entrance.
  const roadEdgeZ = streetDepth / 2;
  const curbGap = 15;
  const curbSegmentLength = (streetWidth - curbGap) / 2;
  for (const side of [-1, 1]) {
    const segmentX = side * (curbGap / 2 + curbSegmentLength / 2);
    box(menuBackdropRoot, [curbSegmentLength, 0.14, 0.24], [segmentX, -0.015, streetZ + roadEdgeZ], curbMaterial);
  }

  // Drain grates sit just inside the curb where runoff would collect.
  for (const x of [-32, 32]) {
    box(menuBackdropRoot, [2.35, 0.012, 0.36], [x, -0.079, streetZ + roadEdgeZ - 0.55], drainMaterial);
    for (let slot = -4; slot <= 4; slot += 1) {
      box(menuBackdropRoot, [0.045, 0.006, 0.28], [x + slot * 0.22, -0.07, streetZ + roadEdgeZ - 0.55], curbMaterial);
    }
  }

  // A curb cut and short walk join the far-side crosswalk to the hangar sidewalk.
  const farCurbGap = 4.8;
  const farCurbSegmentLength = (streetWidth - farCurbGap) / 2;
  for (const side of [-1, 1]) {
    const segmentX = side * (farCurbGap / 2 + farCurbSegmentLength / 2);
    box(menuBackdropRoot, [farCurbSegmentLength, 0.14, 0.24], [segmentX, -0.015, streetZ - roadEdgeZ], curbMaterial);
  }
  const pedestrianPath = new THREE.Mesh(new THREE.PlaneGeometry(4.8, 4.25), sidewalkMaterial);
  pedestrianPath.rotation.x = -Math.PI / 2;
  pedestrianPath.position.set(0, -0.048, -79.12);
  pedestrianPath.receiveShadow = true;
  menuBackdropRoot.add(pedestrianPath);

  // A clear pedestrian walk sits on the hangar side; planted verges soften the curb edges.
  const entryWalk = new THREE.Mesh(new THREE.PlaneGeometry(streetWidth, 8), sidewalkMaterial);
  entryWalk.rotation.x = -Math.PI / 2;
  entryWalk.position.set(0, -0.105, -85.2);
  entryWalk.receiveShadow = true;
  menuBackdropRoot.add(entryWalk);
  box(menuBackdropRoot, [streetWidth, 0.12, 0.2], [0, -0.05, -81.1], curbMaterial);

  const grassPatches = [
    { x: 0, z: -55.8, width: streetWidth - 40, depth: 2.2 },
    { x: 0, z: -79.4, width: streetWidth - 50, depth: 2.4 },
  ];
  for (const patch of grassPatches) {
    const openingWidth = patch.z < -70 ? 4.8 : 14.4;
    const openingLength = (patch.width - openingWidth) / 2;
    for (const side of [-1, 1]) {
      const segmentX = side * (openingWidth / 2 + openingLength / 2);
      const turf = new THREE.Mesh(new THREE.PlaneGeometry(openingLength, patch.depth), grassMaterial);
      turf.rotation.x = -Math.PI / 2;
      turf.position.set(segmentX, -0.058, patch.z);
      turf.receiveShadow = true;
      menuBackdropRoot.add(turf);
    }
    for (const edgeZ of [patch.z - patch.depth / 2, patch.z + patch.depth / 2]) {
      for (const side of [-1, 1]) {
        const edgeX = side * (openingWidth / 2 + openingLength / 2);
        box(menuBackdropRoot, [openingLength, 0.12, 0.18], [edgeX, -0.005, edgeZ], doorFrame);
      }
    }
  }
  // Expansion joints give the long concrete walk believable panel spacing.
  for (let x = -132; x <= 132; x += 8) {
    box(menuBackdropRoot, [0.045, 0.004, 7.7], [x, -0.103, -85.2], jointMaterial);
  }
  const grassBlades = new THREE.InstancedMesh(new THREE.ConeGeometry(0.14, 1, 4), bladeMaterial, 390);
  grassBlades.userData.menuGrass = true;
  grassBlades.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const grassWindState = new Float32Array(grassBlades.count * 8);
  const bladeMatrix = new THREE.Matrix4();
  const bladePosition = new THREE.Vector3();
  const bladeRotation = new THREE.Quaternion();
  const bladeScale = new THREE.Vector3();
  const bladeColor = new THREE.Color();
  let grassSeed = 13579;
  const grassRandom = () => { grassSeed = (grassSeed * 16807) % 2147483647; return (grassSeed - 1) / 2147483646; };
  let vergeBladeCount = 0;
  while (vergeBladeCount < 390) {
    const patch = grassPatches[vergeBladeCount % grassPatches.length];
    const x = patch.x + (grassRandom() - 0.5) * (patch.width - 1);
    if (Math.abs(x) < (patch.z < -70 ? 2.8 : 7.6)) continue;
    const height = 0.18 + grassRandom() * 0.32;
    bladePosition.set(x, -0.05 + height / 2, patch.z + (grassRandom() - 0.5) * (patch.depth - 0.35));
    const yaw = grassRandom() * Math.PI;
    bladeRotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    bladeScale.set(0.55 + grassRandom() * 0.65, height, 0.55 + grassRandom() * 0.65);
    bladeMatrix.compose(bladePosition, bladeRotation, bladeScale);
    grassBlades.setMatrixAt(vergeBladeCount, bladeMatrix);
    grassWindState.set([bladePosition.x, bladePosition.y, bladePosition.z, yaw, bladeScale.x, height, bladeScale.z, grassRandom() * Math.PI * 2], vergeBladeCount * 8);
    grassBlades.setColorAt(vergeBladeCount, new THREE.Color().setHSL(0.34 + grassRandom() * 0.08, 0.45 + grassRandom() * 0.2, 0.28 + grassRandom() * 0.18));
    vergeBladeCount += 1;
  }
  grassBlades.instanceMatrix.needsUpdate = true;
  if (grassBlades.instanceColor) grassBlades.instanceColor.needsUpdate = true;
  grassBlades.castShadow = true;
  grassBlades.receiveShadow = true;
  menuBackdropRoot.add(grassBlades);
  menuGrassWindMeshes.push({ mesh: grassBlades, state: grassWindState });
  // Add grass tufts across the lawn, leaving the four concrete podium pads clear.
  const lawnBlades = new THREE.InstancedMesh(new THREE.ConeGeometry(0.13, 1, 4), bladeMaterial, 1100);
  lawnBlades.userData.menuGrass = true;
  lawnBlades.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const lawnWindState = new Float32Array(lawnBlades.count * 8);
  let lawnBladeCount = 0;
  while (lawnBladeCount < lawnBlades.instanceMatrix.count) {
    const x = (grassRandom() - 0.5) * 98;
    const z = -7 + (grassRandom() - 0.5) * 78;
    const overlapsPad = menuDronePadPositions.some(([padX, padZ]) => Math.abs(x - padX) < 6.1 && Math.abs(z - padZ) < 4.5);
    const overlapsApron = Math.abs(x) < 38 && z > -43.5 && z < 6.5;
    const overlapsAccessLane = Math.abs(x) < 7.5 && z > -57.6 && z < -42.8;
    if (overlapsPad || overlapsApron || overlapsAccessLane) continue;
    const height = 0.16 + grassRandom() * 0.28;
    bladePosition.set(x, -0.14 + height / 2, z);
    const yaw = grassRandom() * Math.PI;
    bladeRotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    bladeScale.set(0.45 + grassRandom() * 0.6, height, 0.45 + grassRandom() * 0.6);
    bladeMatrix.compose(bladePosition, bladeRotation, bladeScale);
    lawnBlades.setMatrixAt(lawnBladeCount, bladeMatrix);
    lawnWindState.set([bladePosition.x, bladePosition.y, bladePosition.z, yaw, bladeScale.x, height, bladeScale.z, grassRandom() * Math.PI * 2], lawnBladeCount * 8);
    lawnBlades.setColorAt(lawnBladeCount, new THREE.Color().setHSL(0.34 + grassRandom() * 0.07, 0.4 + grassRandom() * 0.2, 0.25 + grassRandom() * 0.15));
    lawnBladeCount += 1;
  }
  lawnBlades.instanceMatrix.needsUpdate = true;
  if (lawnBlades.instanceColor) lawnBlades.instanceColor.needsUpdate = true;
  lawnBlades.castShadow = true;
  lawnBlades.receiveShadow = true;
  menuBackdropRoot.add(lawnBlades);
  menuGrassWindMeshes.push({ mesh: lawnBlades, state: lawnWindState });

  // Small scattered ground details make the plaza feel used without cluttering the podiums.
  let debrisSeed = 51827;
  const debrisRandom = () => { debrisSeed = (debrisSeed * 16807) % 2147483647; return (debrisSeed - 1) / 2147483646; };
  const sampleMenuGround = () => {
    for (let attempt = 0; attempt < 48; attempt += 1) {
      const zone = debrisRandom();
      let x;
      let z;
      let groundY;
      if (zone < 0.58) {
        x = (debrisRandom() - 0.5) * 73;
        z = -18.5 + (debrisRandom() - 0.5) * 47;
        groundY = -0.095;
      } else if (zone < 0.84) {
        x = (debrisRandom() - 0.5) * 98;
        z = -7 + (debrisRandom() - 0.5) * 78;
        if (Math.abs(x) < 38 && z > -43.5 && z < 6.5) continue;
        groundY = -0.13;
      } else {
        x = (debrisRandom() - 0.5) * 226;
        z = -67 + (debrisRandom() - 0.5) * 17;
        groundY = -0.073;
      }
      if (menuDronePadPositions.some(([padX, padZ]) => Math.abs(x - padX) < 6.7 && Math.abs(z - padZ) < 5.1)) continue;
      return [x, groundY, z];
    }
    return [42, -0.13, 12];
  };
  const makeLeafShape = () => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.58, 0);
    shape.quadraticCurveTo(-0.14, 0.39, 0.28, 0.25);
    shape.quadraticCurveTo(0.47, 0.17, 0.58, 0);
    shape.quadraticCurveTo(0.16, -0.34, -0.26, -0.23);
    shape.quadraticCurveTo(-0.48, -0.13, -0.58, 0);
    return shape;
  };
  const buildLooseInstancedMesh = ({ geometry, count, colors, type, size, groundOffset }) => {
    const material = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: type === 'can' ? 0.7 : 0.96, metalness: type === 'can' ? 0.32 : 0, side: THREE.DoubleSide });
    const mesh = new THREE.InstancedMesh(geometry, material, count);
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const windState = new Float32Array(count * 8);
    for (let index = 0; index < count; index += 1) {
      const [x, groundY, z] = sampleMenuGround();
      const scaleX = size[0] * (0.72 + debrisRandom() * 0.56);
      const scaleY = size[1] * (0.78 + debrisRandom() * 0.42);
      const scaleZ = size[2] * (0.72 + debrisRandom() * 0.56);
      const yaw = debrisRandom() * Math.PI * 2;
      const position = new THREE.Vector3(x, groundY + groundOffset, z);
      const rotation = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const scale = new THREE.Vector3(scaleX, scaleY, scaleZ);
      const matrix = new THREE.Matrix4().compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, new THREE.Color(colors[Math.floor(debrisRandom() * colors.length)]));
      windState.set([x, groundY + groundOffset, z, yaw, scaleX, scaleY, scaleZ, debrisRandom() * Math.PI * 2], index * 8);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.skipShadows = true;
    mesh.userData.menuLooseType = type;
    menuBackdropRoot.add(mesh);
    menuLooseWindMeshes.push({ mesh, state: windState });
  };

  const leafGeometry = new THREE.ShapeGeometry(makeLeafShape(), 5);
  leafGeometry.rotateX(-Math.PI / 2);
  buildLooseInstancedMesh({
    geometry: leafGeometry,
    count: 82,
    colors: [0x876340, 0xa16a3b, 0x6e7048, 0x745349, 0x9a7843],
    type: 'leaf',
    size: [0.36, 1, 0.25],
    groundOffset: 0.009,
  });

  const paperShape = new THREE.Shape();
  paperShape.moveTo(-0.5, -0.21);
  paperShape.lineTo(-0.22, -0.31);
  paperShape.lineTo(0.03, -0.19);
  paperShape.lineTo(0.35, -0.25);
  paperShape.lineTo(0.5, 0.08);
  paperShape.lineTo(0.19, 0.29);
  paperShape.lineTo(-0.12, 0.19);
  paperShape.lineTo(-0.42, 0.27);
  paperShape.closePath();
  const paperGeometry = new THREE.ShapeGeometry(paperShape);
  paperGeometry.rotateX(-Math.PI / 2);
  buildLooseInstancedMesh({
    geometry: paperGeometry,
    count: 23,
    colors: [0x7a8790, 0x958d80, 0x536e76, 0xb0a18a],
    type: 'paper',
    size: [0.38, 1, 0.34],
    groundOffset: 0.012,
  });

  const canGeometry = new THREE.CylinderGeometry(0.075, 0.075, 0.27, 8, 1);
  canGeometry.rotateX(Math.PI / 2);
  buildLooseInstancedMesh({
    geometry: canGeometry,
    count: 9,
    colors: [0x536b73, 0x806d59, 0x66727a],
    type: 'can',
    size: [0.9, 0.9, 0.9],
    groundOffset: 0.078,
  });

  const hangar = new THREE.Group();
  hangar.position.set(0, 0, -108);
  menuBackdropRoot.add(hangar);
  box(hangar, [124, 26, 22], [0, 13, 0], buildingMaterial);
  box(hangar, [128, 1.25, 25], [0, 26.3, -0.4], roofMaterial);
  box(hangar, [129, 0.28, 0.55], [0, 25.55, 11.08], cyanTrim);
  box(hangar, [127, 0.23, 0.5], [0, 0.75, 11.08], pinkTrim);
  box(hangar, [121, 19.2, 0.36], [0, 13.2, 11.18], facadeMaterial);
  for (let bay = 0; bay < 5; bay += 1) {
    const bayX = -48 + bay * 24;
    box(hangar, [21.2, 15.4, 0.24], [bayX, 14.6, 11.4], glassMaterial);
    for (const divider of [-8.3, -4.15, 0, 4.15, 8.3]) {
      box(hangar, [0.14, 15.4, 0.18], [bayX + divider, 14.6, 11.58], buildingMaterial);
    }
    box(hangar, [21.4, 0.22, 0.2], [bayX, 7.1, 11.6], cyanTrim);
    box(hangar, [21.4, 0.2, 0.2], [bayX, 21.7, 11.6], pinkTrim);
  }
  for (const x of [-61, -37, -13, 13, 37, 61]) {
    box(hangar, [0.4, 20.6, 0.48], [x, 13.1, 11.72], buildingMaterial);
    box(hangar, [0.13, 17.2, 0.12], [x, 13.2, 11.98], cyanTrim);
  }

  // Layered facade bands and mullions break the large glass wall into believable floors.
  const facadeFrame = new THREE.MeshStandardMaterial({ color: 0x26384a, roughness: 0.72, metalness: 0.2 });
  const ventMaterial = new THREE.MeshStandardMaterial({ color: 0x111c2a, roughness: 0.56, metalness: 0.58 });
  const roofUnitMaterial = new THREE.MeshStandardMaterial({ color: 0x344556, roughness: 0.72, metalness: 0.2 });
  for (const y of [4.25, 8.35, 12.45, 16.55, 20.65, 23.15]) {
    box(hangar, [122, 0.2, 0.26], [0, y, 11.92], facadeFrame);
  }
  for (let bay = 0; bay < 5; bay += 1) {
    const bayX = -48 + bay * 24;
    for (const y of [10.4, 13.55, 16.7, 19.85]) {
      box(hangar, [20.8, 0.09, 0.12], [bayX, y, 11.83], facadeFrame);
    }
    for (const xOffset of [-6.2, 0, 6.2]) {
      box(hangar, [0.075, 14.8, 0.11], [bayX + xOffset, 14.6, 11.84], facadeFrame);
    }
  }
  // Two sectional loading doors sit beneath the glass bays, with visible slats and tracks.
  for (const x of [-48, 48]) {
    box(hangar, [10.8, 6.2, 0.22], [x, 3.45, 11.96], ventMaterial);
    for (let slat = 0; slat < 11; slat += 1) {
      const y = 0.72 + slat * 0.51;
      box(hangar, [10.35, 0.075, 0.08], [x, y, 12.1], facadeFrame);
    }
    for (const side of [-1, 1]) {
      box(hangar, [0.16, 6.6, 0.24], [x + side * 5.55, 3.45, 12.08], roofMaterial);
      box(hangar, [0.09, 5.9, 0.08], [x + side * 5.35, 3.5, 12.22], side < 0 ? cyanTrim : pinkTrim);
    }
    box(hangar, [11.3, 0.25, 0.34], [x, 6.83, 12.08], roofMaterial);
  }
  // Roof plant, ducts, access rails, and warning beacons give the silhouette detail.
  const roofRailY = 27.45;
  for (const z of [-11.2, 10.6]) {
    box(hangar, [120, 0.13, 0.13], [0, roofRailY, z], facadeFrame);
    for (let x = -58; x <= 58; x += 8) box(hangar, [0.1, 1.05, 0.1], [x, 26.95, z], facadeFrame);
  }
  for (const x of [-61, 61]) {
    box(hangar, [0.13, 0.13, 21], [x, roofRailY, 0], facadeFrame);
    for (let z = -9; z <= 9; z += 6) box(hangar, [0.1, 1.05, 0.1], [x, 26.95, z], facadeFrame);
  }
  for (const x of [-50, -34, -18, 18, 34, 50]) {
    box(hangar, [9.2, 2.35, 5.8], [x, 28.15, -1.8], roofUnitMaterial);
    box(hangar, [8.3, 0.16, 5.05], [x, 29.42, -1.8], ventMaterial);
    for (const grille of [-3, -1.5, 0, 1.5, 3]) {
      box(hangar, [0.12, 1.45, 0.12], [x + grille, 28.25, 1.18], facadeFrame);
    }
    const fan = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 0.12, 12), ventMaterial);
    fan.position.set(x, 29.55, -1.8);
    hangar.add(fan);
  }
  for (const x of [-57, -29, 0, 29, 57]) {
    box(hangar, [1.4, 3.2, 1.4], [x, 28.9, 7], roofUnitMaterial);
    box(hangar, [1.65, 0.18, 1.65], [x, 30.58, 7], x % 2 ? pinkTrim : cyanTrim);
  }
  // Exposed downpipes and wall-mounted access lights add scale to the outer piers.
  for (const x of [-61.8, 61.8]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 23, 8), roofUnitMaterial);
    pipe.position.set(x, 12.9, 12.08);
    hangar.add(pipe);
    for (const y of [2.1, 8.5, 15, 21.5]) {
      box(hangar, [0.64, 0.28, 0.28], [x + (x < 0 ? 0.42 : -0.42), y, 12.05], ventMaterial);
      box(hangar, [0.18, 0.12, 0.08], [x + (x < 0 ? 0.78 : -0.78), y - 0.2, 12.22], warmLightMaterial);
    }
  }

  // Low wings carry the hangar across the horizon while keeping the pads in front clear.
  for (const side of [-1, 1]) {
    const wing = new THREE.Group();
    wing.position.set(side * 82, 0, -94);
    menuBackdropRoot.add(wing);
    box(wing, [38, 17, 24], [0, 8.5, 0], buildingMaterial);
    box(wing, [39, 0.9, 25], [0, 17.3, -0.2], facadeMaterial);
    for (let windowIndex = 0; windowIndex < 5; windowIndex += 1) {
      const x = -14 + windowIndex * 7;
      box(wing, [4.8, 9.8, 0.22], [x, 9.6, 12.18], glassMaterial);
      box(wing, [4.7, 0.15, 0.16], [x, 4.8, 12.34], cyanTrim);
      box(wing, [0.1, 9.5, 0.12], [x - 1.58, 9.6, 12.35], facadeFrame);
      box(wing, [0.1, 9.5, 0.12], [x + 1.58, 9.6, 12.35], facadeFrame);
      for (const y of [7.3, 9.6, 11.9]) box(wing, [4.7, 0.085, 0.12], [x, y, 12.35], facadeFrame);
    }
    box(wing, [39, 0.22, 0.5], [0, 16.1, 12.2], pinkTrim);
    box(wing, [39.2, 0.28, 0.32], [0, 3.65, 12.34], facadeFrame);
    box(wing, [39.2, 0.28, 0.32], [0, 15.3, 12.34], facadeFrame);
    for (const x of [-18, 18]) {
      box(wing, [0.32, 16.3, 0.42], [x, 8.5, 12.45], roofUnitMaterial);
      box(wing, [0.09, 13.5, 0.08], [x, 8.3, 12.68], side < 0 ? cyanTrim : pinkTrim);
    }
    for (const x of [-13, 0, 13]) {
      box(wing, [5.5, 1.2, 4.8], [x, 18.15, -2.5], roofUnitMaterial);
      box(wing, [4.8, 0.12, 4.1], [x, 18.82, -2.5], ventMaterial);
      for (let grille = -1; grille <= 1; grille += 1) box(wing, [0.12, 0.7, 3.7], [x + grille * 1.3, 18.2, -2.5], facadeFrame);
    }
  }

  const addEntrance = (x, wallFrontZ, width, stairCount, accent) => {
    const doorZ = wallFrontZ + 0.42;
    const doorHeight = 4.8;
    const doorBottom = 1.02;
    const doorCenterY = doorBottom + doorHeight / 2;
    const openingWidth = width - 1.45;
    const leafWidth = openingWidth / 2 - 0.08;

    box(menuBackdropRoot, [width + 1.6, 0.38, 2.45], [x, 6.35, doorZ + 1.1], doorFrame);
    box(menuBackdropRoot, [width + 1.72, 0.075, 2.5], [x, 6.13, doorZ + 1.1], accent);
    box(menuBackdropRoot, [width + 0.45, 0.24, 0.32], [x, 6.08, doorZ + 0.15], doorFrame);
    box(menuBackdropRoot, [0.34, 5.65, 0.5], [x - width / 2, 3.62, doorZ + 0.12], doorFrame);
    box(menuBackdropRoot, [0.34, 5.65, 0.5], [x + width / 2, 3.62, doorZ + 0.12], doorFrame);
    box(menuBackdropRoot, [0.09, 5.45, 0.12], [x - width / 2 + 0.2, 3.62, doorZ + 0.4], accent);
    box(menuBackdropRoot, [0.09, 5.45, 0.12], [x + width / 2 - 0.2, 3.62, doorZ + 0.4], pinkTrim);

    for (const side of [-1, 1]) {
      const leafX = x + side * (leafWidth / 2 + 0.02);
      box(menuBackdropRoot, [leafWidth, doorHeight, 0.16], [leafX, doorCenterY, doorZ + 0.36], doorGlass);
      box(menuBackdropRoot, [leafWidth - 0.36, 0.12, 0.08], [leafX, doorBottom + 1.35, doorZ + 0.46], accent);
      box(menuBackdropRoot, [leafWidth - 0.36, 0.1, 0.08], [leafX, doorBottom + 3.2, doorZ + 0.46], cyanTrim);
      box(menuBackdropRoot, [0.07, 0.74, 0.09], [leafX - side * 0.35, doorCenterY - 0.08, doorZ + 0.51], roofMaterial);
      box(menuBackdropRoot, [0.08, 0.82, 0.12], [x + side * 0.17, doorCenterY - 0.12, doorZ + 0.53], accent);
    }
    box(menuBackdropRoot, [0.12, doorHeight + 0.28, 0.2], [x, doorCenterY, doorZ + 0.52], pinkTrim);
    box(menuBackdropRoot, [width - 0.15, 0.28, 0.26], [x, doorBottom + doorHeight + 0.18, doorZ + 0.38], accent);

    const landingWidth = width + 4.2;
    box(menuBackdropRoot, [landingWidth, 0.2, 2.5], [x, 0.91, wallFrontZ + 1.45], stepMaterial);
    box(menuBackdropRoot, [landingWidth - 0.4, 0.035, 0.08], [x, 1.025, wallFrontZ + 2.55], accent);
    const stairWidth = width + 3.4;
    for (let index = 0; index < stairCount; index += 1) {
      const top = 0.22 * (stairCount - index);
      const depth = stairCount > 3 ? 1.52 : 1.42;
      const stepZ = wallFrontZ + 2.78 + index * depth;
      box(menuBackdropRoot, [stairWidth, top, depth + 0.1], [x, top / 2, stepZ], stepMaterial);
      box(menuBackdropRoot, [stairWidth - 0.34, 0.035, 0.07], [x, top + 0.02, stepZ + depth * 0.46], accent);
      box(menuBackdropRoot, [0.16, 0.08, depth], [x - stairWidth / 2 + 0.13, top + 0.04, stepZ], doorFrame);
      box(menuBackdropRoot, [0.16, 0.08, depth], [x + stairWidth / 2 - 0.13, top + 0.04, stepZ], doorFrame);
    }
    const landingLight = new THREE.PointLight(0x53dfff, width > 8 ? 20 : 11, 31, 2);
    landingLight.position.set(x - width * 0.34, 4.5, wallFrontZ + 3.4);
    menuAmbientRoot.add(landingLight);
    const warmDoorLight = new THREE.PointLight(0xff8acb, width > 8 ? 12 : 7, 22, 2);
    warmDoorLight.position.set(x + width * 0.3, 3.3, wallFrontZ + 1.8);
    menuAmbientRoot.add(warmDoorLight);
  };

  addEntrance(0, -96.55, 10.8, 4, cyanTrim);
  addEntrance(-82, -81.78, 6.8, 3, pinkTrim);
  addEntrance(82, -81.78, 6.8, 3, cyanTrim);

  // Low neon posts make the street edge and landscaped walk read clearly at night.
  const bollardBody = new THREE.MeshStandardMaterial({ color: 0x172536, roughness: 0.64, metalness: 0.24 });
  for (let index = 0; index < 8; index += 1) {
    const x = -70 + index * 20;
    const side = index % 2 ? 1 : -1;
    const z = side < 0 ? -58.2 : -75.8;
    box(menuBackdropRoot, [0.42, 1.55, 0.42], [x, 0.72, z], bollardBody);
    box(menuBackdropRoot, [0.12, 1.18, 0.12], [x, 0.78, z + 0.22], index % 2 ? pinkTrim : cyanTrim);
    box(menuBackdropRoot, [0.82, 0.12, 0.82], [x, 0.1, z], doorFrame);
  }
}

function buildMenuSupportDistrict() {
  const shellMaterial = new THREE.MeshStandardMaterial({ color: 0x1a2939, roughness: 0.86, metalness: 0.08, flatShading: true });
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x29384a, roughness: 0.82, metalness: 0.16 });
  const facadeMaterial = new THREE.MeshStandardMaterial({ color: 0x26384a, roughness: 0.76, metalness: 0.18 });
  const shadowMaterial = new THREE.MeshStandardMaterial({ color: 0x101c2a, roughness: 0.68, metalness: 0.2 });
  const windowMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x427588, emissive: 0x123543, emissiveIntensity: 0.58, roughness: 0.42, metalness: 0.12 }),
    new THREE.MeshStandardMaterial({ color: 0x92754d, emissive: 0x3e2812, emissiveIntensity: 0.46, roughness: 0.48, metalness: 0.1 }),
  ];
  const trimMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x318094, emissive: 0x0e4657, emissiveIntensity: 0.62, roughness: 0.34, metalness: 0.16 }),
    new THREE.MeshStandardMaterial({ color: 0x9d4979, emissive: 0x4b1837, emissiveIntensity: 0.52, roughness: 0.38, metalness: 0.14 }),
  ];
  const districts = [
    { x: -121, z: -99, width: 34, depth: 31, height: 31, rotation: Math.PI / 2, accent: 0 },
    { x: 121, z: -103, width: 38, depth: 35, height: 38, rotation: -Math.PI / 2, accent: 1 },
    { x: -46, z: -145, width: 43, depth: 29, height: 35, rotation: 0, accent: 1 },
    { x: 54, z: -151, width: 48, depth: 32, height: 42, rotation: 0, accent: 0 },
  ];
  const windowMeshes = windowMaterials.map((material) => new THREE.InstancedMesh(boxGeometry, material, 180));
  const windowTransform = new THREE.Object3D();
  const windowCounts = [0, 0];
  const worldUp = new THREE.Vector3(0, 1, 0);

  districts.forEach((building, buildingIndex) => {
    const { x, z, width, depth, height, rotation, accent } = building;
    const block = new THREE.Group();
    block.position.set(x, 0, z);
    block.rotation.y = rotation;
    menuBackdropRoot.add(block);

    box(block, [width, height, depth], [0, height / 2, 0], shellMaterial);
    box(block, [width + 1.2, 0.72, depth + 1.2], [0, height + 0.36, 0], roofMaterial);
    const frontZ = depth / 2 + 0.13;
    const floorCount = Math.max(4, Math.floor((height - 4) / 5.2));
    const floorSpacing = (height - 10) / (floorCount - 1);
    const columnCount = Math.max(4, Math.floor(width / 5.2));

    for (let column = 0; column < columnCount; column += 1) {
      const localX = -width / 2 + ((column + 1) / (columnCount + 1)) * width;
      for (let floor = 0; floor < floorCount; floor += 1) {
        const localY = 4.8 + floor * floorSpacing;
        const materialIndex = (column + floor * 2 + buildingIndex) % 5 === 0 ? 1 : 0;
        const worldPosition = new THREE.Vector3(localX, localY, frontZ)
          .applyAxisAngle(worldUp, rotation)
          .add(new THREE.Vector3(x, 0, z));
        windowTransform.position.copy(worldPosition);
        windowTransform.rotation.set(0, rotation, 0);
        windowTransform.scale.set(2.35, 2.35, 0.1);
        windowTransform.updateMatrix();
        windowMeshes[materialIndex].setMatrixAt(windowCounts[materialIndex]++, windowTransform.matrix);
      }
    }

    for (let floor = 0; floor < floorCount; floor += 1) {
      const bandY = 2.6 + floor * floorSpacing;
      box(block, [width + 0.2, 0.13, 0.16], [0, bandY, frontZ], facadeMaterial);
    }
    for (const side of [-1, 1]) {
      box(block, [0.3, height - 1.2, 0.34], [side * (width / 2 - 0.28), height / 2, frontZ], facadeMaterial);
      box(block, [0.12, height - 2.4, 0.08], [side * (width / 2 - 0.28), height / 2, frontZ + 0.2], trimMaterials[accent]);
    }

    const dockWidth = Math.min(9.2, width * 0.3);
    box(block, [dockWidth, 6.2, 0.2], [0, 3.5, frontZ + 0.02], shadowMaterial);
    for (let slat = 0; slat < 7; slat += 1) {
      box(block, [dockWidth - 0.45, 0.08, 0.06], [0, 1.2 + slat * 0.76, frontZ + 0.17], facadeMaterial);
    }
    box(block, [dockWidth + 0.8, 0.18, 0.24], [0, 6.85, frontZ + 0.12], trimMaterials[accent]);

    const unitCount = width > 40 ? 3 : 2;
    for (let unit = 0; unit < unitCount; unit += 1) {
      const unitX = (unit - (unitCount - 1) / 2) * (width * 0.24);
      box(block, [5.6, 1.8, 4.2], [unitX, height + 1.62, -depth * 0.12], facadeMaterial);
      box(block, [4.8, 0.16, 3.4], [unitX, height + 2.6, -depth * 0.12], shadowMaterial);
      for (let grille = -1; grille <= 1; grille += 1) {
        box(block, [0.12, 1.15, 3.1], [unitX + grille * 1.35, height + 1.72, -depth * 0.12], roofMaterial);
      }
    }

    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.16, 5.8, 7), roofMaterial);
    mast.position.set(width * 0.34, height + 3.25, depth * 0.22);
    block.add(mast);
    box(block, [1.1, 0.16, 0.16], [width * 0.34, height + 5.9, depth * 0.22], trimMaterials[accent]);
  });

  windowMeshes.forEach((windows, index) => {
    windows.count = windowCounts[index];
    windows.userData.menuSupportWindows = true;
    windows.instanceMatrix.needsUpdate = true;
    windows.computeBoundingSphere();
    windows.castShadow = false;
    windows.receiveShadow = false;
    menuBackdropRoot.add(windows);
  });

  // Short light poles and service crates give the new blocks a grounded street edge.
  for (const side of [-1, 1]) {
    const x = side * 108;
    const z = -82;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.22, 9.5, 8), roofMaterial);
    pole.position.set(x, 4.75, z);
    menuBackdropRoot.add(pole);
    box(menuBackdropRoot, [1.35, 0.24, 0.72], [x, 9.2, z + 0.12], trimMaterials[side < 0 ? 0 : 1]);
    box(menuBackdropRoot, [7.5, 3.4, 5.8], [side * 111, 1.7, -145], shellMaterial);
    for (let rib = -3; rib <= 3; rib += 1) {
      box(menuBackdropRoot, [0.12, 3.1, 0.08], [side * 111 + rib * 0.92, 1.72, -142.05], roofMaterial);
    }
  }
}

function buildMenuInfoBanners() {
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const bannerZ = -40.2;
  const bannerWidth = 26;
  const bannerHeight = 14.625;
  const bannerBottomY = 3.6;
  const bannerCenterY = bannerBottomY + bannerHeight / 2;
  const panel = new THREE.Mesh(
    new THREE.PlaneGeometry(bannerWidth, bannerHeight),
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
  );
  panel.position.set(0, bannerCenterY, bannerZ);
  panel.name = 'Rotating tournament and rankings banner';
  menuInfoBannerRoot.add(panel);

  const trim = new THREE.MeshBasicMaterial({ color: 0x50e8ff, toneMapped: false });
  const frame = new THREE.MeshStandardMaterial({ color: 0x142131, roughness: 0.66, metalness: 0.3 });
  const railX = bannerWidth / 2 + 0.14;
  box(menuInfoBannerRoot, [0.2, bannerHeight + 0.12, 0.24], [-railX, bannerCenterY, bannerZ + 0.12], trim);
  box(menuInfoBannerRoot, [0.2, bannerHeight + 0.12, 0.24], [railX, bannerCenterY, bannerZ + 0.12], trim);
  box(menuInfoBannerRoot, [bannerWidth + 0.48, 0.2, 0.24], [0, bannerBottomY + bannerHeight + 0.12, bannerZ + 0.12], trim);
  for (const side of [-1, 1]) {
    const supportX = side * (bannerWidth / 2 - 0.4);
    box(menuInfoBannerRoot, [0.3, bannerBottomY + bannerHeight + 0.12, 0.26], [supportX, (bannerBottomY + bannerHeight) / 2, bannerZ - 0.15], frame);
    box(menuInfoBannerRoot, [0.42, 0.3, 0.38], [supportX, 0.15, bannerZ - 0.15], trim);
  }
  box(menuInfoBannerRoot, [bannerWidth * 0.55, 0.2, 1.1], [0, 0.1, bannerZ - 0.15], frame);

  const createLogoBanner = (x, accent, logoZ = -12.5) => {
    const logoCanvas = document.createElement('canvas');
    logoCanvas.width = 768;
    logoCanvas.height = 960;
    const context = logoCanvas.getContext('2d');
    const background = context.createLinearGradient(0, 0, logoCanvas.width, logoCanvas.height);
    background.addColorStop(0, '#091725');
    background.addColorStop(0.56, '#101b2c');
    background.addColorStop(1, '#080f1b');
    context.fillStyle = background;
    context.fillRect(0, 0, logoCanvas.width, logoCanvas.height);
    context.strokeStyle = '#e7f5ff';
    context.lineWidth = 12;
    context.strokeRect(22, 22, logoCanvas.width - 44, logoCanvas.height - 44);
    context.strokeStyle = accent;
    context.lineWidth = 8;
    context.strokeRect(42, 42, logoCanvas.width - 84, logoCanvas.height - 84);
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillStyle = accent;
    context.font = '700 42px Arial, sans-serif';
    context.fillText('FPV  /  RACING', logoCanvas.width / 2, 168);
    context.font = '700 300px Arial, sans-serif';
    context.fillText('X', logoCanvas.width / 2, 432);
    context.fillStyle = '#f3f8ff';
    context.font = '800 106px Arial, sans-serif';
    context.fillText('XSPEC', logoCanvas.width / 2, 650);
    context.fillStyle = '#9eb3c7';
    context.font = '600 34px Arial, sans-serif';
    context.fillText('FLIGHT SYSTEMS', logoCanvas.width / 2, 744);
    const logoTexture = new THREE.CanvasTexture(logoCanvas);
    logoTexture.colorSpace = THREE.SRGBColorSpace;
    logoTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    const banner = new THREE.Group();
    banner.position.set(x, 0, logoZ);
    banner.rotation.y = Math.atan2(-x, 31 - logoZ);
    banner.name = 'XSPEC ground logo banner';
    menuInfoBannerRoot.add(banner);
    const logoPanel = new THREE.Mesh(
      new THREE.PlaneGeometry(3.25, 3.8),
      new THREE.MeshBasicMaterial({ map: logoTexture, toneMapped: false }),
    );
    logoPanel.position.set(0, 2.85, 0);
    logoPanel.name = 'XSPEC ground logo banner';
    banner.add(logoPanel);
    const logoFrame = new THREE.MeshStandardMaterial({ color: 0x142131, roughness: 0.62, metalness: 0.36 });
    const logoTrim = new THREE.MeshBasicMaterial({ color: accent, toneMapped: false });
    for (const side of [-1, 1]) {
      box(banner, [0.13, 4.95, 0.16], [side * 1.76, 2.475, -0.12], logoFrame);
      box(banner, [0.055, 3.78, 0.035], [side * 1.65, 2.85, 0.035], logoTrim);
      box(banner, [0.2, 0.2, 0.22], [side * 1.76, 0.12, -0.12], logoTrim);
    }
    box(banner, [3.72, 0.14, 0.18], [0, 4.95, -0.12], logoFrame);
    box(banner, [2.9, 0.18, 0.9], [0, 0.1, -0.16], logoFrame);
  };
  createLogoBanner(-19, '#50e8ff', -5);
  createLogoBanner(19, '#ff68c4', -5);
  createLogoBanner(-33, '#50e8ff');
  createLogoBanner(33, '#ff68c4');

  competitiveBannerCanvases = { canvas, texture };
  drawCompetitiveBanners();
}

function drawCompetitiveBanners(data = {}) {
  if (!competitiveBannerCanvases) return;
  competitiveBannerData = { ...competitiveBannerData, ...data };
  const leaders = Array.isArray(competitiveBannerData.leaders) ? competitiveBannerData.leaders : [];
  const teams = Array.isArray(competitiveBannerData.teams) ? competitiveBannerData.teams : [];
  const tournament = competitiveBannerData.nextTournament || null;
  const slides = [
    { type: 'tournament', accent: '#ff68c4' },
    { type: 'pilot', accent: '#50e8ff' },
    { type: 'team', accent: '#7be3b5' },
  ];
  const slide = slides[competitiveBannerSlide % slides.length];
  const { canvas, texture } = competitiveBannerCanvases;
  const context = canvas.getContext('2d');
  if (!context) return;
  const { width, height } = canvas;
  const background = context.createLinearGradient(0, 0, width, height);
  background.addColorStop(0, '#071321');
  background.addColorStop(0.52, '#102b40');
  background.addColorStop(1, '#10172b');
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.strokeStyle = 'rgba(119,213,237,.5)';
  context.lineWidth = 8;
  context.strokeRect(14, 14, width - 28, height - 28);
  context.fillStyle = slide.accent;
  context.fillRect(14, 14, 22, height - 28);
  context.strokeStyle = 'rgba(160,213,232,.1)';
  context.lineWidth = 2;
  for (let x = 100; x < width; x += 100) {
    context.beginPath(); context.moveTo(x, 24); context.lineTo(x, height - 24); context.stroke();
  }
  for (let y = 100; y < height; y += 100) {
    context.beginPath(); context.moveTo(24, y); context.lineTo(width - 24, y); context.stroke();
  }

  const label = (text, x, y, color = 'rgba(190,220,235,.72)', size = 34) => {
    context.textAlign = 'left';
    context.font = `700 ${size}px ui-monospace, SFMono-Regular, Consolas, monospace`;
    context.letterSpacing = '4px';
    context.fillStyle = color;
    context.fillText(text, x, y, width - x - 120);
  };
  const fitValue = (text, x, y, maxWidth, size = 130, color = '#f1fbff') => {
    let fontSize = size;
    context.textAlign = 'left';
    context.letterSpacing = '0px';
    do {
      context.font = `800 ${fontSize}px system-ui, Segoe UI, sans-serif`;
      fontSize -= 4;
    } while (context.measureText(text).width > maxWidth && fontSize > 52);
    context.fillStyle = color;
    context.fillText(text, x, y, maxWidth);
  };
  context.strokeStyle = `${slide.accent}88`;
  context.lineWidth = 3;
  context.beginPath(); context.moveTo(120, 190); context.lineTo(width - 120, 190); context.stroke();

  if (slide.type === 'tournament') {
    const startDate = tournament?.startsAt ? new Date(tournament.startsAt) : null;
    const startLabel = startDate && Number.isFinite(startDate.getTime())
      ? new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(startDate)
      : 'NOT SCHEDULED';
    label('RACE SERIES', 120, 330, slide.accent, 36);
    fitValue(tournament?.title || 'NO EVENT SCHEDULED', 120, 565, 1640, 142);
    if (tournament) label(`NEXT RACE  ·  ${startLabel.toUpperCase()}`, 120, 850, 'rgba(190,220,235,.78)', 38);
  } else if (slide.type === 'pilot') {
    const pilot = leaders[0];
    label('TOP PILOT', 120, 330, slide.accent, 36);
    fitValue(pilot?.username || 'NO PILOTS YET', 120, 565, 1640, 142);
    label(pilot ? `#1 WORLDWIDE  ·  ${(Number(pilot.xp) || 0).toLocaleString()} XP` : 'RACE TO CLAIM #1', 120, 850, 'rgba(190,220,235,.78)', 38);
  } else {
    const team = teams[0];
    label('TOP TEAM', 120, 330, slide.accent, 36);
    fitValue(team?.name || 'NO TEAMS YET', 120, 565, 1640, 142);
    label(team ? `#1 WORLDWIDE  ·  ${(Number(team.xp) || 0).toLocaleString()} XP` : 'RACE TO CLAIM #1', 120, 850, 'rgba(190,220,235,.78)', 38);
  }

  texture.needsUpdate = true;
}

function buildMenuCityBackdrop() {
  const towerMaterial = new THREE.MeshStandardMaterial({ color: 0x101a31, roughness: 0.84, metalness: 0.08, flatShading: true });
  const towerLightMaterial = new THREE.MeshStandardMaterial({ color: 0x70eaff, emissive: 0x1684a9, emissiveIntensity: 1.15, roughness: 0.34 });
  const pinkLightMaterial = new THREE.MeshStandardMaterial({ color: 0xff76cf, emissive: 0x9d236f, emissiveIntensity: 1.1, roughness: 0.36 });
  const skylineCyanWindowMaterial = new THREE.MeshStandardMaterial({ color: 0x75b9cc, emissive: 0x1e6178, emissiveIntensity: 0.72, roughness: 0.42, metalness: 0.16 });
  const skylineWarmWindowMaterial = new THREE.MeshStandardMaterial({ color: 0xc9955b, emissive: 0x70451e, emissiveIntensity: 0.64, roughness: 0.46, metalness: 0.12 });
  const skylineCyanWindows = new THREE.InstancedMesh(boxGeometry, skylineCyanWindowMaterial, 7200);
  const skylineWarmWindows = new THREE.InstancedMesh(boxGeometry, skylineWarmWindowMaterial, 7200);
  skylineCyanWindows.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  skylineWarmWindows.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  const windowTransform = new THREE.Object3D();
  let cyanWindowCount = 0;
  let warmWindowCount = 0;

  // A deterministic skyline keeps the distant city varied without changing between menu visits.
  let seed = 7519;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const towerCount = 46;
  for (let index = 0; index < towerCount; index += 1) {
    const angle = (index / towerCount) * Math.PI * 2 + (random() - 0.5) * 0.075;
    const radius = 176 + random() * 48;
    const width = 8 + random() * 10;
    const depth = 8 + random() * 12;
    const height = 22 + Math.pow(random(), 0.72) * 65;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    box(menuCityRoot, [width, height, depth], [x, height / 2 - 1, z], towerMaterial, -angle);
    box(menuCityRoot, [width + 0.65, 0.42, depth + 0.65], [x, height - 0.78, z], towerMaterial, -angle);

    const facing = angle + Math.PI;
    const facadeX = x + Math.cos(facing) * (depth * 0.51);
    const facadeZ = z + Math.sin(facing) * (depth * 0.51);
    const accentMaterial = random() > 0.55 ? towerLightMaterial : pinkLightMaterial;
    box(menuCityRoot, [0.28, height * (0.52 + random() * 0.34), 0.22], [facadeX, height * 0.45, facadeZ], accentMaterial, -angle);
    const windowRows = Math.max(3, Math.floor(height / 5.2));
    const windowColumns = Math.max(2, Math.floor(depth / 2.4));
    const windowHeight = Math.min(1.55, (height - 5) / (windowRows + 1) * 0.58);
    const windowWidth = Math.min(1.18, depth / (windowColumns + 1) * 0.66);
    for (let row = 0; row < windowRows; row += 1) {
      for (let column = 0; column < windowColumns; column += 1) {
        const pattern = (index * 17 + row * 5 + column * 3) % 13;
        if (pattern > 9) continue;
        const localX = -width / 2 - 0.12;
        const localZ = -depth / 2 + ((column + 1) / (windowColumns + 1)) * depth;
        const localY = -1 + ((row + 1) / (windowRows + 1)) * height;
        windowTransform.position.set(
          x + localX * Math.cos(-angle) + localZ * Math.sin(-angle),
          localY,
          z - localX * Math.sin(-angle) + localZ * Math.cos(-angle),
        );
        windowTransform.rotation.set(0, -angle, 0);
        windowTransform.scale.set(0.1, windowHeight, windowWidth);
        windowTransform.updateMatrix();
        if (pattern % 4 === 0) skylineWarmWindows.setMatrixAt(warmWindowCount++, windowTransform.matrix);
        else skylineCyanWindows.setMatrixAt(cyanWindowCount++, windowTransform.matrix);
      }
    }
    if (random() > 0.48) {
      const bands = 2 + Math.floor(random() * 4);
      for (let band = 0; band < bands; band += 1) {
        const y = 4 + ((band + 1) / (bands + 1)) * (height - 8);
        const bandX = x + Math.cos(facing) * (depth * 0.515);
        const bandZ = z + Math.sin(facing) * (depth * 0.515);
        box(menuCityRoot, [width * (0.35 + random() * 0.45), 0.16, 0.18], [bandX, y, bandZ], random() > 0.73 ? warmLightMaterial : accentMaterial, -angle);
      }
    }
    if (height > 58 && random() > 0.42) {
      box(menuCityRoot, [0.22, 6 + random() * 8, 0.22], [x, height + 2, z], accentMaterial);
    }
    if (index % 5 === 0) {
      box(menuCityRoot, [width * 0.38, 2.2, depth * 0.46], [x, height + 0.45, z], towerMaterial, -angle);
      box(menuCityRoot, [width * 0.26, 0.16, depth * 0.32], [x, height + 1.62, z], accentMaterial, -angle);
    }
  }

  skylineCyanWindows.count = cyanWindowCount;
  skylineWarmWindows.count = warmWindowCount;
  skylineCyanWindows.instanceMatrix.needsUpdate = true;
  skylineWarmWindows.instanceMatrix.needsUpdate = true;
  skylineCyanWindows.computeBoundingSphere();
  skylineWarmWindows.computeBoundingSphere();
  skylineCyanWindows.castShadow = false;
  skylineWarmWindows.castShadow = false;
  menuCityRoot.add(skylineCyanWindows, skylineWarmWindows);
}

function buildMenuFlybys() {
  const hull = new THREE.MeshStandardMaterial({ color: 0x1b293b, roughness: 0.52, metalness: 0.34, emissive: 0x071321, emissiveIntensity: 0.56 });
  const canopy = new THREE.MeshStandardMaterial({ color: 0x23617b, roughness: 0.38, metalness: 0.18, emissive: 0x0b4158, emissiveIntensity: 0.78 });
  const quadRed = new THREE.MeshStandardMaterial({ color: 0xd62937, roughness: 0.34, metalness: 0.22, emissive: 0x260408, emissiveIntensity: 0.12 });
  const quadBlack = new THREE.MeshStandardMaterial({ color: 0x12171d, roughness: 0.7, metalness: 0.16 });
  const quadGlass = new THREE.MeshPhysicalMaterial({ color: 0x0a1118, roughness: 0.16, metalness: 0.44, clearcoat: 0.95, clearcoatRoughness: 0.08 });
  const cyanGlow = new THREE.MeshBasicMaterial({ color: 0x65edff, toneMapped: false });
  const pinkGlow = new THREE.MeshBasicMaterial({ color: 0xff67c7, toneMapped: false });
  const amberGlow = new THREE.MeshBasicMaterial({ color: 0xffbc72, toneMapped: false });

  // Keep the visible pass moving left-to-right. Each craft loops back behind the skyline,
  // where the turn is out of the main menu's focal area.
  const createCruiseRoute = (baseY, baseZ, lane = 0) => new THREE.CatmullRomCurve3([
    new THREE.Vector3(-94, baseY, baseZ + lane),
    new THREE.Vector3(-62, baseY + 0.6, baseZ + lane + 3),
    new THREE.Vector3(-12, baseY + 0.1, baseZ + lane + 5),
    new THREE.Vector3(42, baseY - 0.45, baseZ + lane + 3),
    new THREE.Vector3(88, baseY + 0.45, baseZ + lane),
    new THREE.Vector3(112, baseY + 9, baseZ + lane - 19),
    new THREE.Vector3(100, baseY + 22, baseZ + lane - 49),
    new THREE.Vector3(48, baseY + 29, baseZ + lane - 67),
    new THREE.Vector3(-38, baseY + 28, baseZ + lane - 66),
    new THREE.Vector3(-100, baseY + 20, baseZ + lane - 49),
    new THREE.Vector3(-114, baseY + 9, baseZ + lane - 19),
  ], true, 'centripetal');

  const addFlyby = (object, motion) => {
    const progress = ((motion.phase || 0) / (Math.PI * 2) + 1) % 1;
    const route = createCruiseRoute(motion.baseY, motion.baseZ, motion.lane || 0);
    object.position.copy(route.getPointAt(progress));
    menuBackdropRoot.add(object);
    menuFlybys.push({ object, rotors: [], ...motion, route, progress });
    return menuFlybys[menuFlybys.length - 1];
  };

  const shuttle = new THREE.Group();
  const wingShape = new THREE.Shape();
  wingShape.moveTo(-2.45, -3.3); wingShape.lineTo(-0.85, -2.75); wingShape.lineTo(1.15, -1.12);
  wingShape.lineTo(3.2, 0); wingShape.lineTo(1.15, 1.12); wingShape.lineTo(-0.85, 2.75); wingShape.lineTo(-2.45, 3.3); wingShape.lineTo(-1.55, 0); wingShape.closePath();
  const wingGeometry = new THREE.ExtrudeGeometry(wingShape, { depth: 0.16, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.055, bevelThickness: 0.04 });
  wingGeometry.rotateX(-Math.PI / 2);
  const wings = new THREE.Mesh(wingGeometry, hull);
  wings.position.y = 0.03;
  shuttle.add(wings);
  const fuselage = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 20), hull);
  fuselage.scale.set(2.42, 0.39, 0.72);
  shuttle.add(fuselage);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.49, 1.38, 16), hull);
  nose.rotation.z = -Math.PI / 2;
  nose.position.x = 2.58;
  shuttle.add(nose);
  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), canopy);
  cockpit.scale.set(1.17, 0.43, 0.48);
  cockpit.position.set(0.15, 0.46, 0);
  shuttle.add(cockpit);
  const engine = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.42, 0.62, 18), canopy);
  engine.rotation.z = Math.PI / 2;
  engine.position.x = -2.18;
  shuttle.add(engine);
  const engineRim = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.055, 8, 24), cyanGlow);
  engineRim.rotation.y = Math.PI / 2;
  engineRim.position.x = -2.5;
  shuttle.add(engineRim);
  for (const side of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), hull);
    pod.scale.set(0.83, 0.25, 0.32);
    pod.position.set(-1.68, -0.02, side * 2.25);
    shuttle.add(pod);
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), side < 0 ? cyanGlow : pinkGlow);
    nav.position.set(0.8, 0.13, side * 2.58);
    shuttle.add(nav);
  }
  box(shuttle, [3.3, 0.06, 0.1], [0.05, 0.13, 1.12], cyanGlow);
  box(shuttle, [3.3, 0.06, 0.1], [0.05, 0.13, -1.12], pinkGlow);
  addFlyby(shuttle, { kind: 'shuttle', baseY: 15, baseZ: -53, lane: 0, bob: 0.3, speed: 0.022, phase: 0.4 });

  const airship = new THREE.Group();
  const balloon = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 24), new THREE.MeshStandardMaterial({ color: 0x27354b, roughness: 0.58, metalness: 0.18, emissive: 0x0b273b, emissiveIntensity: 0.62 }));
  balloon.scale.set(3.4, 1.15, 1.35);
  airship.add(balloon);
  const airshipBand = new THREE.Mesh(new THREE.TorusGeometry(1.23, 0.055, 6, 32), cyanGlow);
  airshipBand.rotation.y = Math.PI / 2;
  airshipBand.position.x = -0.9;
  airshipBand.scale.set(1.2, 1.15, 1.15);
  airship.add(airshipBand);
  const gondola = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), hull);
  gondola.scale.set(0.9, 0.27, 0.5);
  gondola.position.set(0, -1.2, 0);
  airship.add(gondola);
  box(airship, [1.7, 0.1, 0.16], [0, -1.02, 0.48], pinkGlow);
  box(airship, [1.4, 0.2, 0.46], [3.12, -0.1, 0], hull);
  box(airship, [0.82, 0.12, 1.18], [3.65, -0.08, 0], cyanGlow);
  for (let port = -2; port <= 2; port += 1) {
    const window = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), port % 2 ? cyanGlow : pinkGlow);
    window.position.set(port * 0.84, -0.42, 0.63);
    airship.add(window);
  }
  addFlyby(airship, { kind: 'airship', baseY: 22, baseZ: -82, lane: -8, bob: 0.45, speed: 0.014, phase: 2.1 });

  const surveyDrone = new THREE.Group();
  const droneBody = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 18), quadRed);
  droneBody.scale.set(0.72, 0.28, 0.63);
  surveyDrone.add(droneBody);
  const droneCanopy = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), quadGlass);
  droneCanopy.scale.set(0.38, 0.18, 0.35);
  droneCanopy.position.y = 0.23;
  surveyDrone.add(droneCanopy);
  const cameraHousing = new THREE.Mesh(new THREE.SphereGeometry(0.2, 16, 12), quadBlack);
  cameraHousing.position.set(0, -0.08, 0.58);
  surveyDrone.add(cameraHousing);
  const cameraLens = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), quadGlass);
  cameraLens.position.set(0, -0.08, 0.75);
  surveyDrone.add(cameraLens);
  const rotors = [];
  for (const [x, z] of [[-1.65, -1.2], [1.65, -1.2], [-1.65, 1.2], [1.65, 1.2]]) {
    const armEnd = new THREE.Vector3(x * 0.88, 0, z * 0.88);
    const armDirection = armEnd.clone().normalize();
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.12, armEnd.length(), 12), quadBlack);
    arm.position.copy(armEnd).multiplyScalar(0.5);
    arm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), armDirection);
    surveyDrone.add(arm);
    if (z > 0) {
      const neonStrip = new THREE.Mesh(new THREE.CylinderGeometry(0.026, 0.026, armEnd.length() * 0.84, 8), droneArmGlowMaterial);
      neonStrip.position.copy(armEnd).multiplyScalar(0.53);
      neonStrip.position.y += 0.085;
      neonStrip.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), armDirection);
      surveyDrone.add(neonStrip);
    }
    const rotor = new THREE.Group();
    rotor.position.set(x, 0.15, z);
    const motor = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.3, 0.2, 16), quadBlack);
    motor.position.y = -0.06;
    rotor.add(motor);
    const bladeA = box(rotor, [1.12, 0.045, 0.12], [0, 0, 0], quadBlack);
    const bladeB = box(rotor, [1.12, 0.045, 0.12], [0, 0, 0], quadBlack);
    bladeB.rotation.y = Math.PI / 2;
    const hub = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 6), quadBlack);
    rotor.add(hub);
    surveyDrone.add(rotor);
    rotors.push(rotor);
  }
  const droneFlyby = addFlyby(surveyDrone, { kind: 'survey-drone', baseY: 11.5, baseZ: -41, lane: 7, bob: 0.55, speed: 0.031, phase: 1.25 });
  droneFlyby.rotors = rotors;

}

function updateMenuFlybys(now, deltaSeconds) {
  const time = now * 0.001;
  for (const flyby of menuFlybys) {
    flyby.progress = (flyby.progress + deltaSeconds * flyby.speed) % 1;
    const point = flyby.route.getPointAt(flyby.progress);
    const tangent = flyby.route.getTangentAt(flyby.progress);
    const phase = time * flyby.speed * Math.PI * 2 + flyby.phase;
    const horizontalSpeed = Math.max(0.001, Math.hypot(tangent.x, tangent.z));
    flyby.object.position.copy(point);
    flyby.object.position.y += Math.sin(phase * 1.3) * flyby.bob;
    if (flyby.kind === 'shuttle' || flyby.kind === 'airship') {
      flyby.object.rotation.y = Math.atan2(-tangent.z, tangent.x);
      flyby.object.rotation.z = Math.atan2(tangent.y, horizontalSpeed);
      flyby.object.rotation.x = Math.sin(phase * 0.45) * 0.035;
    } else if (flyby.kind === 'survey-drone') {
      flyby.object.rotation.y = Math.atan2(-tangent.z, tangent.x) + Math.sin(phase * 0.65) * 0.08;
      flyby.object.rotation.z = Math.sin(phase * 0.9) * 0.045;
      flyby.rotors.forEach((rotor, index) => { rotor.rotation.y += deltaSeconds * (index % 2 ? -42 : 42); });
    }
  }
}

const menuGrassWindMatrix = new THREE.Matrix4();
const menuGrassWindPosition = new THREE.Vector3();
const menuGrassWindQuaternion = new THREE.Quaternion();
const menuGrassWindEuler = new THREE.Euler();
const menuGrassWindScale = new THREE.Vector3();
const menuGrassWindOffset = new THREE.Vector3();
const propwashVisual = { x: 0, z: 0, strength: 0, radius: 6 };
function updateGrassWindMeshes(meshes, time) {
  for (const { mesh, state } of meshes) {
    for (let index = 0; index < mesh.count; index += 1) {
      const offset = index * 8;
      const x = state[offset];
      const centerY = state[offset + 1];
      const z = state[offset + 2];
      const yaw = state[offset + 3];
      const height = state[offset + 5];
      const phase = time * 0.72 + x * 0.014 + z * 0.021 + state[offset + 7] * 0.18;
      let swayX = Math.sin(phase) * 0.08 + Math.sin(phase * 0.43 + 1.2) * 0.022;
      let swayZ = Math.cos(phase * 0.82) * 0.055;
      if (propwashVisual.strength > 0) {
        const dx = x - propwashVisual.x;
        const dz = z - propwashVisual.z;
        const distance = Math.hypot(dx, dz);
        const falloff = Math.max(0, 1 - distance / propwashVisual.radius);
        const gust = propwashVisual.strength * falloff * falloff;
        if (distance > 0.01 && gust > 0) {
          swayX += (dx / distance) * gust * 0.46;
          swayZ += (dz / distance) * gust * 0.46;
        }
      }

      menuGrassWindEuler.set(swayZ, yaw, -swayX, 'XYZ');
      menuGrassWindQuaternion.setFromEuler(menuGrassWindEuler);
      menuGrassWindOffset.set(0, height * 0.5, 0).applyQuaternion(menuGrassWindQuaternion);
      menuGrassWindPosition.set(x + menuGrassWindOffset.x, centerY - height * 0.5 + menuGrassWindOffset.y, z + menuGrassWindOffset.z);
      menuGrassWindScale.set(state[offset + 4], height, state[offset + 6]);
      menuGrassWindMatrix.compose(menuGrassWindPosition, menuGrassWindQuaternion, menuGrassWindScale);
      mesh.setMatrixAt(index, menuGrassWindMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}

function updateMenuGrassWind(time) {
  propwashVisual.strength = 0;
  updateGrassWindMeshes(menuGrassWindMeshes, time);
}

function updateMenuLooseWind(time) {
  for (const { mesh, state } of menuLooseWindMeshes) {
    const type = mesh.userData.menuLooseType;
    const drift = type === 'paper' ? 0.14 : type === 'leaf' ? 0.095 : 0.014;
    const bob = type === 'paper' ? 0.014 : type === 'leaf' ? 0.007 : 0.001;
    const tilt = type === 'paper' ? 0.16 : type === 'leaf' ? 0.075 : 0.012;
    const turn = type === 'paper' ? 0.42 : type === 'leaf' ? 0.25 : 0.035;
    for (let index = 0; index < mesh.count; index += 1) {
      const offset = index * 8;
      const x = state[offset];
      const y = state[offset + 1];
      const z = state[offset + 2];
      const yaw = state[offset + 3];
      const phase = state[offset + 7];
      const breeze = time * 0.24 + phase;
      const flutter = time * (type === 'paper' ? 1.35 : 0.9) + phase * 1.7;
      menuGrassWindPosition.set(
        x + Math.sin(breeze) * drift,
        y + Math.max(0, Math.sin(flutter)) * bob,
        z + Math.cos(breeze * 0.83) * drift * 0.46,
      );
      menuGrassWindEuler.set(
        Math.sin(flutter) * tilt,
        yaw + Math.sin(breeze * 0.72) * turn,
        Math.cos(flutter * 0.91) * tilt * 0.72,
        'YXZ',
      );
      menuGrassWindQuaternion.setFromEuler(menuGrassWindEuler);
      menuGrassWindScale.set(state[offset + 4], state[offset + 5], state[offset + 6]);
      menuGrassWindMatrix.compose(menuGrassWindPosition, menuGrassWindQuaternion, menuGrassWindScale);
      mesh.setMatrixAt(index, menuGrassWindMatrix);
    }
    mesh.instanceMatrix.needsUpdate = true;
  }
}

const menuBuildSteps = [
  ['sky platform and stars', buildMenuSkyPlatform],
  ['leaderboard banners', buildMenuInfoBanners],
  ['drone podiums', buildMenuDronePads],
];
for (const [label, buildStep] of menuBuildSteps) {
  try { buildStep(); }
  catch (error) { console.error(`Menu ${label} could not be built; continuing with the remaining scene.`, error); }
}
try { enableShadowParticipation(menuBackdropRoot); }
catch (error) { console.warn('Menu backdrop shadow setup was skipped.', error); }
try { enableShadowParticipation(menuStageRoot); }
catch (error) { console.warn('Menu podium shadow setup was skipped.', error); }
// Dense ground details do not need to redraw in every menu shadow map.
menuBackdropRoot.traverse((node) => {
  if (!node.isInstancedMesh || (!node.userData.menuGrass && !node.userData.menuSupportWindows)) return;
  node.castShadow = false;
  node.receiveShadow = false;
});

function cylinder(parent, radiusTop, radiusBottom, height, position, materialKey, segments = 8, axis = 'y') {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
    typeof materialKey === 'string' ? sharedMaterials[materialKey] : materialKey,
  );
  mesh.position.set(position[0], position[1], position[2]);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  parent.add(mesh);
  return mesh;
}

function makeContainer(parent, x, z, color, { length = 22, height = 4.1, level = 0, accent = 'cream', groundOffset = 0 } = {}) {
  const group = new THREE.Group();
  group.position.set(x, 0.25 + groundOffset + level * (height + 0.16), z);
  parent.add(group);
  box(group, [length, height, 5.4], [0, height / 2, 0], color);
  box(group, [length + 0.2, 0.14, 5.58], [0, height + 0.04, 0], 'dark');

  const ribs = new THREE.InstancedMesh(
    boxGeometry,
    new THREE.MeshStandardMaterial({ color: new THREE.Color(colors[color] ?? colors.steel).multiplyScalar(0.78), roughness: 0.88, metalness: 0.12, flatShading: true }),
    Math.floor(length / 0.72),
  );
  const dummy = new THREE.Object3D();
  for (let i = 0; i < ribs.count; i += 1) {
    dummy.position.set(-length / 2 + 0.45 + i * 0.72, height / 2, 0);
    dummy.scale.set(0.095, height - 0.24, 5.48);
    dummy.updateMatrix();
    ribs.setMatrixAt(i, dummy.matrix);
  }
  ribs.instanceMatrix.needsUpdate = true;
  ribs.userData.skipFlightCollision = true;
  ribs.userData.skipShadows = true;
  group.add(ribs);
  box(group, [0.22, height - 0.18, 0.16], [-length / 2 + 0.2, height / 2, 2.78], accent);
  box(group, [0.22, height - 0.18, 0.16], [length / 2 - 0.2, height / 2, 2.78], accent);
  box(group, [length - 0.4, 0.16, 0.12], [0, 0.38, 2.78], 'dark');
  box(group, [0.18, 0.9, 0.12], [-0.08, 0.94, 2.86], 'steel');
  box(group, [0.18, 0.9, 0.12], [0.08, 0.94, 2.86], 'steel');
  return group;
}

function addContainerYards(biomeId, yards) {
  yards.forEach((yardSpec, yardIndex) => {
    const { x, z, rotation = 0, accent = 'cyan', containers } = yardSpec;
    const yard = new THREE.Group();
    const yardGroundY = terrainSurfaceYAt(biomeId, x, z);
    yard.position.set(x, yardGroundY, z);
    yard.rotation.y = rotation;
    environmentRoot.add(yard);
    registerBuilderEnvironmentBuilding(yard, `${biomeId}-container-yard-${yardIndex + 1}`, `Container yard ${yardIndex + 1}`);

    const yardPadGeometry = new THREE.PlaneGeometry(62, 46, 12, 10);
    const yardPadPositions = yardPadGeometry.attributes.position;
    const cosine = Math.cos(rotation);
    const sine = Math.sin(rotation);
    for (let vertex = 0; vertex < yardPadPositions.count; vertex += 1) {
      const localX = yardPadPositions.getX(vertex);
      const localPlaneY = yardPadPositions.getY(vertex);
      const worldX = x + cosine * localX - sine * localPlaneY;
      const worldZ = z - (sine * localX + cosine * localPlaneY);
      yardPadPositions.setZ(vertex, terrainHeightAt(biomeId, worldX, worldZ) - terrainHeightAt(biomeId, x, z) + 0.25);
    }
    yardPadPositions.needsUpdate = true;
    yardPadGeometry.rotateX(-Math.PI / 2);
    yardPadGeometry.computeVertexNormals();
    const yardPad = new THREE.Mesh(yardPadGeometry, sharedMaterials[biomeId === 'pine-basin' ? 'pine' : 'dark']);
    yardPad.name = 'Terrain-following container yard pad';
    yardPad.receiveShadow = true;
    yardPad.userData.skipFlightCollision = true;
    yard.add(yardPad);
    box(yard, [61, 0.06, 0.24], [0, 0.29, -22.5], accent);
    box(yard, [61, 0.06, 0.24], [0, 0.29, 22.5], accent);
    box(yard, [0.24, 0.06, 44], [-30.5, 0.29, 0], accent);
    box(yard, [0.24, 0.06, 44], [30.5, 0.29, 0], accent);

    for (const spec of containers) {
      const containerOffset = new THREE.Vector3(spec.x, 0, spec.z).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotation);
      const containerGroundY = terrainSurfaceYAt(biomeId, x + containerOffset.x, z + containerOffset.z);
      makeContainer(yard, spec.x, spec.z, spec.color, {
        length: spec.length || 22,
        height: spec.height || 4.1,
        level: spec.level || 0,
        accent: spec.accent || accent,
        groundOffset: containerGroundY - yardGroundY,
      });
    }
  });
}

function readBuilderEnvironmentBuildingStates() {
  try {
    const saved = JSON.parse(localStorage.getItem(`aerframe-buildings-${activeBiome}`) || '{}');
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  }
  catch { return {}; }
}

function registerBuilderEnvironmentBuilding(object, id, label) {
  object.userData.environmentBuildingId = id;
  object.userData.environmentBuildingLabel = label;
  builderEnvironmentBuildings.push({ id, label, object });
  const saved = readBuilderEnvironmentBuildingStates()[id];
  if (saved) {
    if (Array.isArray(saved.position)) object.position.fromArray(saved.position);
    if (Array.isArray(saved.rotation)) object.rotation.set(...saved.rotation);
    if (Array.isArray(saved.scale)) object.scale.fromArray(saved.scale);
    object.visible = saved.visible !== false;
  }
  updateBuilderBuildingRestoreButton();
  return object;
}

function updateBuilderBuildingRestoreButton() {
  const button = document.querySelector('#restoreEnvironmentBuildings');
  if (button) button.hidden = !builderEnvironmentBuildings.some((item) => !item.object.visible);
}

function saveBuilderEnvironmentBuildings() {
  try {
    const saved = readBuilderEnvironmentBuildingStates();
    for (const { id, label, object } of builderEnvironmentBuildings) {
      saved[id] = {
        label,
        position: object.position.toArray(),
        rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
        scale: object.scale.toArray(),
        visible: object.visible,
      };
    }
    localStorage.setItem(`aerframe-buildings-${activeBiome}`, JSON.stringify(saved));
    return true;
  } catch { return false; }
}

function builderEnvironmentObjectPath(object) {
  const indices = [];
  let current = object;
  while (current && current !== environmentRoot) {
    const parent = current.parent;
    if (!parent) return null;
    indices.push(parent.children.indexOf(current));
    current = parent;
  }
  return current === environmentRoot ? indices.reverse().join('.') : null;
}

function builderEnvironmentObjectAtPath(path) {
  let current = environmentRoot;
  for (const index of String(path).split('.').map(Number)) {
    current = current?.children[index];
    if (!current) return null;
  }
  return current === environmentRoot ? null : current;
}

function hideBuilderEnvironmentInstance(mesh, instanceId) {
  if (!mesh?.isInstancedMesh || instanceId < 0 || instanceId >= mesh.count) return;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  mesh.getMatrixAt(instanceId, matrix);
  matrix.decompose(position, quaternion, scale);
  scale.setScalar(0);
  matrix.compose(position, quaternion, scale);
  mesh.setMatrixAt(instanceId, matrix);
  mesh.instanceMatrix.needsUpdate = true;
  mesh.computeBoundingSphere();
}

function createBuilderEnvironmentInstance(mesh, instanceId, id, label, savedState = null) {
  if (!mesh?.isInstancedMesh || instanceId < 0 || instanceId >= mesh.count) return null;
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  mesh.getMatrixAt(instanceId, matrix);
  matrix.decompose(position, quaternion, scale);
  if (savedState) {
    if (Array.isArray(savedState.position)) position.fromArray(savedState.position);
    if (Array.isArray(savedState.rotation)) quaternion.setFromEuler(new THREE.Euler(...savedState.rotation));
    if (Array.isArray(savedState.scale)) scale.fromArray(savedState.scale);
  }
  const material = Array.isArray(mesh.material) ? mesh.material.map((item) => item.clone()) : mesh.material.clone();
  if (mesh.instanceColor) {
    const instanceColor = new THREE.Color();
    mesh.getColorAt(instanceId, instanceColor);
    (Array.isArray(material) ? material : [material]).forEach((item) => item.color?.multiply(instanceColor));
  }
  const editable = new THREE.Mesh(mesh.geometry, material);
  editable.name = label;
  editable.position.copy(position);
  editable.quaternion.copy(quaternion);
  editable.scale.copy(scale);
  editable.castShadow = mesh.castShadow;
  editable.receiveShadow = mesh.receiveShadow;
  editable.userData.environmentBuildingId = id;
  editable.userData.environmentBuildingLabel = label;
  editable.userData.builderInstanceSource = { path: builderEnvironmentObjectPath(mesh), instanceId };
  mesh.parent.add(editable);
  hideBuilderEnvironmentInstance(mesh, instanceId);
  if (!builderEnvironmentBuildings.some((item) => item.id === id)) builderEnvironmentBuildings.push({ id, label, object: editable });
  return editable;
}

function applyBuilderEnvironmentObjectStates() {
  const saved = readBuilderEnvironmentBuildingStates();
  const entries = Object.entries(saved)
    .filter(([id]) => id.startsWith('scene-v2:'))
    .sort(([a], [b]) => a.split('.').length - b.split('.').length);
  for (const [id, state] of entries) {
    const instanceMatch = id.match(/^scene-v2:(.+):instance:(\d+)$/);
    if (instanceMatch) {
      const [, path, instanceNumber] = instanceMatch;
      const mesh = builderEnvironmentObjectAtPath(path);
      if (!mesh?.isInstancedMesh) continue;
      const instanceId = Number(instanceNumber);
      const label = state.label || `${mesh.name || 'Environment object'} ${instanceId + 1}`;
      const editable = createBuilderEnvironmentInstance(mesh, instanceId, id, label, state);
      if (editable && state.visible === false) editable.visible = false;
      continue;
    }
    const path = id.slice('scene-v2:'.length);
    const object = builderEnvironmentObjectAtPath(path);
    if (!object) continue;
    if (Array.isArray(state.position)) object.position.fromArray(state.position);
    if (Array.isArray(state.rotation)) object.rotation.set(...state.rotation);
    if (Array.isArray(state.scale)) object.scale.fromArray(state.scale);
    object.visible = state.visible !== false;
    object.userData.environmentBuildingId = id;
    object.userData.environmentBuildingLabel = state.label || object.name || 'Environment object';
    if (!builderEnvironmentBuildings.some((item) => item.id === id)) {
      builderEnvironmentBuildings.push({ id, label: object.userData.environmentBuildingLabel, object });
    }
  }
  updateBuilderBuildingRestoreButton();
}

function registerBuilderSceneObject(object) {
  if (!object) return null;
  const path = builderEnvironmentObjectPath(object);
  if (!path) return null;
  const id = `scene-v2:${path}`;
  const existing = builderEnvironmentBuildings.find((item) => item.id === id);
  if (existing) return existing;
  const label = object.name || (object.isInstancedMesh ? 'Environment object group' : 'Environment object');
  object.userData.environmentBuildingId = id;
  object.userData.environmentBuildingLabel = label;
  const item = { id, label, object };
  builderEnvironmentBuildings.push(item);
  return item;
}

function addGate(x, y, z, hue = 'lime', radius = 2.25, rotation = 0, custom = false, parent = gateRoot) {
  const gateGroup = new THREE.Group();
  gateGroup.position.set(x, y, z);
  gateGroup.rotation.y = rotation;
  gateGroup.userData.customGate = custom;
  const accent = colors[hue] ?? colors.lime;
  const gateMat = new THREE.MeshStandardMaterial({ color: accent, roughness: 0.42, metalness: 0.08, emissive: accent, emissiveIntensity: 1.7, toneMapped: false });
  const rail = 0.18;
  const postHeight = y + radius;
  const postCenterY = (radius - y) / 2;
  box(gateGroup, [rail, postHeight, rail], [-radius, postCenterY, 0], gateMat);
  box(gateGroup, [rail, postHeight, rail], [radius, postCenterY, 0], gateMat);
  box(gateGroup, [radius * 2 + rail, rail, rail], [0, radius, 0], gateMat);
  box(gateGroup, [radius * 2 + rail, rail, rail], [0, -radius, 0], gateMat);
  parent.add(gateGroup);
  return gateGroup;
}

function createGateIndicator(gate) {
  const beams = [-1, 1].map((direction) => {
    const geometry = new THREE.BoxGeometry(1.28, 0.1, 0.12);
    geometry.rotateZ(direction * Math.PI / 4);
    return geometry;
  });
  const geometry = new THREE.BufferGeometry();
  for (const [name, itemSize] of [['position', 3], ['normal', 3], ['uv', 2]]) {
    const attributeLength = beams.reduce((total, beam) => total + beam.getAttribute(name).array.length, 0);
    const values = new Float32Array(attributeLength);
    let offset = 0;
    for (const beam of beams) {
      const attribute = beam.getAttribute(name).array;
      values.set(attribute, offset);
      offset += attribute.length;
    }
    geometry.setAttribute(name, new THREE.BufferAttribute(values, itemSize));
  }
  const indices = [];
  let vertexOffset = 0;
  for (const beam of beams) {
    for (const index of beam.index.array) indices.push(index + vertexOffset);
    vertexOffset += beam.getAttribute('position').count;
    beam.dispose();
  }
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  const material = new THREE.MeshBasicMaterial({ color: 0x73ff8a, transparent: true, opacity: 0.42, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const indicator = new THREE.Mesh(geometry, material);
  indicator.position.z = 0.22;
  indicator.renderOrder = 4;
  indicator.userData.courseIndicator = true;
  indicator.userData.skipFlightCollision = true;
  gate.add(indicator);
  return indicator;
}

const importedNeonGateScale = 0.408575;
const importedNeonGateEmissiveIntensity = 0.75;
const gateGlowReferenceColor = new THREE.Color(colors.cyan);
const gateGlowReferenceLuminance = gateGlowReferenceColor.r * 0.2126 + gateGlowReferenceColor.g * 0.7152 + gateGlowReferenceColor.b * 0.0722;
const gateGlowReferenceBoost = 2;
function gateGlowIntensityForColor(color, baseIntensity) {
  const linearColor = new THREE.Color(color);
  const luminance = linearColor.r * 0.2126 + linearColor.g * 0.7152 + linearColor.b * 0.0722;
  const luminanceBoost = Math.pow(gateGlowReferenceLuminance / Math.max(luminance, 0.001), 2);
  const referenceBoost = linearColor.equals(gateGlowReferenceColor) ? gateGlowReferenceBoost : 1;
  return baseIntensity * Math.max(referenceBoost, luminanceBoost);
}

const gateTypes = {
  'neon-square': { name: 'Neon Square', model: '/models/gates/neon-square.glb', raceAsset: true },
  'neon-ladder': { name: 'Neon Ladder', model: '/models/gates/neon-ladder.glb', raceAsset: true },
  'neon-flag': { name: 'Neon Flag', model: '/models/gates/neon-flag.glb', raceAsset: true },
  'neon-hurdle': { name: 'Neon Hurdle', model: '/models/gates/neon-hurdle.glb', raceAsset: true, glowMultiplier: 0.78 },
  'neon-dive': { name: 'Neon Dive', model: '/models/gates/neon-dive.glb', raceAsset: true, modelScale: 0.0489 },
};

const gatePassBoundaryOpenings = {
  'neon-square': [{ width: 18, height: 14.6, centerY: 7.3, z: 0 }],
  'neon-ladder': [
    { width: 17.7, height: 14.1, centerY: 7.4, z: 0 },
    { width: 17.7, height: 14.1, centerY: 22.2, z: 0 },
  ],
  'neon-flag': [{ width: 45, height: 32, centerX: 19.5, centerY: 14, z: 0 }],
  'neon-hurdle': [{ width: 18.8, height: 17, centerY: 21.5, z: 0 }],
  'neon-dive': [
    { width: 14.2, height: 14.2, centerX: -9.2, centerY: 7.5, z: 0, rotationY: Math.PI / 2 },
    { width: 14.2, height: 14.2, centerX: 9.2, centerY: 7.5, z: 0, rotationY: -Math.PI / 2 },
    { width: 18, height: 14.2, centerX: 0, centerY: 14.95, z: 0, rotationX: -Math.PI / 2 },
    { width: 18, height: 14.2, centerY: 7.5, z: -7.3 },
    { width: 18, height: 14.2, centerY: 7.5, z: 7.3 },
  ],
};
const gateBoundaryCorrectColor = 0x4cff88;
const gateBoundaryWrongColor = 0xff4b65;
const builderGateSelectionPadding = 4;

function updateGatePassBoundaryDirection(gate) {
  const boundary = gate.userData.gatePassBoundary;
  const data = gate.userData.gateData;
  if (!boundary || !data) return;
  const directions = data.entryDirections;
  boundary.traverse((object) => {
    const openingIndex = object.userData.gateBoundaryIndex;
    const direction = directions?.[openingIndex] ?? data.entryDirection;
    if (object.userData.gateBoundaryFace === 'front' || object.userData.gateBoundaryFace === 'back') {
      const positiveNormalIsCorrect = direction !== -1;
      const positiveZFace = object.userData.gateBoundaryFace === 'front';
      const correctSide = positiveZFace === positiveNormalIsCorrect;
      object.material.color.setHex(correctSide ? gateBoundaryCorrectColor : gateBoundaryWrongColor);
      object.material.opacity = direction === 0 ? 0 : 0.3;
    } else if (object.userData.isGatePassBoundaryOutline) {
      object.visible = direction !== 0;
    }
  });
  updateBuilderGateBadgeVisibility(gate);
}

function createGatePassBoundary(gate, data) {
  const openings = gatePassBoundaryOpenings[data.type];
  if (!openings) return;
  const boundary = new THREE.Group();
  boundary.name = 'Builder-only gate pass boundary';
  boundary.userData.isBuilderGateBoundary = true;
  boundary.visible = currentPage === 'builder' && !flying;
  data.entryDirection = data.entryDirection === -1 ? -1 : data.entryDirection === 0 ? 0 : 1;
  if (!Array.isArray(data.entryDirections) || data.entryDirections.length !== openings.length) {
    data.entryDirections = openings.map(() => data.entryDirection);
  } else {
    data.entryDirections = data.entryDirections.map((direction) => direction === 0 ? 0 : direction === -1 ? -1 : 1);
  }
  gate.userData.passBoundaryOpenings = openings;
  gate.userData.gatePassBoundary = boundary;
  gate.userData.gatePassPlanes = openings.map((opening) => {
    const rotation = new THREE.Euler(opening.rotationX || 0, opening.rotationY || 0, 0);
    return {
      point: new THREE.Vector3(opening.centerX || 0, opening.centerY, opening.z),
      normal: new THREE.Vector3(0, 0, 1).applyEuler(rotation).normalize(),
      widthAxis: new THREE.Vector3(1, 0, 0).applyEuler(rotation).normalize(),
      heightAxis: new THREE.Vector3(0, 1, 0).applyEuler(rotation).normalize(),
      width: opening.width,
      height: opening.height,
      circle: opening.circle === true,
    };
  });
  gate.userData.gatePassPlane = gate.userData.gatePassPlanes.find((plane) => plane.normal.z > 0.99) || gate.userData.gatePassPlanes[0];

  for (const [openingIndex, opening] of openings.entries()) {
    const geometry = opening.circle
      ? new THREE.CircleGeometry(opening.width / 2, 48)
      : new THREE.PlaneGeometry(opening.width, opening.height);
    for (const [face, side] of [['front', THREE.FrontSide], ['back', THREE.BackSide]]) {
      const faceMesh = new THREE.Mesh(geometry.clone(), new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.22,
        depthWrite: false,
        depthTest: false,
        side,
      }));
      faceMesh.position.set(opening.centerX || 0, opening.centerY, opening.z);
      faceMesh.rotation.set(opening.rotationX || 0, opening.rotationY || 0, 0);
      faceMesh.renderOrder = 8;
      faceMesh.userData.gateBoundaryFace = face;
      faceMesh.userData.gateBoundaryIndex = openingIndex;
      faceMesh.userData.isGatePassBoundarySurface = true;
      boundary.add(faceMesh);
    }
    const selectionGeometry = opening.circle
      ? new THREE.CircleGeometry(opening.width / 2 + builderGateSelectionPadding / 2, 48)
      : new THREE.PlaneGeometry(
        opening.width + builderGateSelectionPadding,
        opening.height + builderGateSelectionPadding,
      );
    const selectionSurface = new THREE.Mesh(selectionGeometry, new THREE.MeshBasicMaterial({
      transparent: true,
      opacity: 0,
      colorWrite: false,
      depthWrite: false,
      depthTest: false,
      side: THREE.DoubleSide,
    }));
    selectionSurface.position.set(opening.centerX || 0, opening.centerY, opening.z);
    selectionSurface.rotation.set(opening.rotationX || 0, opening.rotationY || 0, 0);
    selectionSurface.renderOrder = 7;
    selectionSurface.userData.gateBoundaryIndex = openingIndex;
    selectionSurface.userData.isGatePassBoundarySurface = true;
    boundary.add(selectionSurface);
    const outline = new THREE.LineSegments(
      new THREE.EdgesGeometry(geometry),
      new THREE.LineBasicMaterial({ color: 0x9cefff, transparent: true, opacity: 0.8, depthTest: false }),
    );
    geometry.dispose();
    outline.position.set(opening.centerX || 0, opening.centerY, opening.z);
    outline.rotation.set(opening.rotationX || 0, opening.rotationY || 0, 0);
    outline.renderOrder = 9;
    outline.userData.gateBoundaryIndex = openingIndex;
    outline.userData.isGatePassBoundaryOutline = true;
    boundary.add(outline);
  }

  gate.add(boundary);
  data.entryDirection = data.entryDirections[0];
  updateGatePassBoundaryDirection(gate);
}

function createProceduralGate(type, hue = 'cyan') {
  const group = new THREE.Group();
  const accent = colors[hue] ?? colors.cyan;
  const led = new THREE.MeshStandardMaterial({
    color: accent,
    roughness: 0.35,
    metalness: 0.16,
    emissive: accent,
    emissiveIntensity: gateGlowIntensityForColor(accent, 0.8 * (gateTypes[type]?.glowMultiplier ?? 1)),
    toneMapped: false,
  });
  const ring = (parent, radius, position, rotation = [0, 0, 0], material = led) => {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.14, 8, 36), material);
    mesh.position.set(...position); mesh.rotation.set(...rotation); parent.add(mesh); return mesh;
  };

  if (type === 'neon-square') {
    const frameMaterial = led;
    const frameWidth = 9;
    const frameHeight = 7;
    const barSize = 0.2;
    const addFrameBar = (width, height, x, y) => {
      const frameBar = new THREE.Mesh(new THREE.BoxGeometry(width, height, 0.22), frameMaterial);
      frameBar.position.set(x, y, 0);
      frameBar.castShadow = true;
      frameBar.receiveShadow = true;
      frameBar.userData.isGateLed = true;
      group.add(frameBar);
    };
    addFrameBar(barSize, frameHeight, -frameWidth / 2, frameHeight / 2);
    addFrameBar(barSize, frameHeight, frameWidth / 2, frameHeight / 2);
    addFrameBar(frameWidth + barSize, barSize, 0, frameHeight);
    addFrameBar(frameWidth + barSize, barSize, 0, 0);
  } else if (type === 'neon-ladder') {
    for (const x of [-1.55, 1.55]) box(group, [0.18, 0.18, 7.2], [x, 2.1, 0], led);
    for (let i = 0; i < 5; i += 1) {
      const z = -3 + i * 1.5; const y = 0.95 + i * 0.58;
      box(group, [3.35, 0.13, 0.16], [0, y, z], led);
      ring(group, 1.05, [0, y + 0.72, z], [0, 0, 0]);
    }
  } else if (type === 'neon-flag') {
    box(group, [0.16, 6.0, 0.16], [-3.0, 3.0, 0], led);
    box(group, [0.16, 6.0, 0.16], [3.0, 3.0, 0], led);
    box(group, [6.2, 0.16, 0.16], [0, 5.85, 0], led);
    box(group, [4.5, 0.12, 0.12], [-0.55, 3.83, 0.08], led);
    box(group, [0.12, 1.8, 0.12], [-2.8, 4.75, 0.08], led);
    box(group, [0.12, 1.8, 0.12], [1.7, 4.75, 0.08], led);
  } else if (type === 'neon-hurdle') {
    box(group, [0.24, 2.35, 0.24], [-2.7, 1.175, 0], led);
    box(group, [0.24, 2.35, 0.24], [2.7, 1.175, 0], led);
    box(group, [5.55, 0.34, 0.42], [0, 2.12, 0], led);
    for (let i = 0; i < 7; i += 1) box(group, [0.14, 0.36, 0.46], [-2.35 + i * 0.78, 2.12, 0.02], led);
  } else if (type === 'neon-dive') {
    const frame = new THREE.Mesh(new THREE.TorusGeometry(3.2, 0.16, 10, 48), led);
    frame.rotation.y = Math.PI / 2;
    frame.rotation.x = -Math.PI / 5;
    frame.position.y = 3.2;
    frame.userData.isGateLed = true;
    group.add(frame);
    box(group, [0.18, 3.2, 0.18], [-2.8, 1.6, 0], led);
    box(group, [0.18, 3.2, 0.18], [2.8, 1.6, 0], led);
  }
  group.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  group.userData.proceduralGate = true;
  return group;
}

const builderEnvironmentCategories = [
  {
    label: 'Buildings & Structures', form: 'building', items: [
      ['house', 'House', 'Small home'], ['warehouse', 'Warehouse', 'Large freight building'], ['office', 'Office', 'Glass-front offices'], ['shop', 'Shop', 'Street retail'], ['hangar', 'Hangar', 'Wide aircraft bay'], ['apartment', 'Apartment', 'Multi-storey block'], ['tower', 'Tower', 'Open-frame tower'],
      ['factory', 'Factory', 'Industrial plant'], ['motel', 'Motel', 'Low roadside lodging'], ['diner', 'Diner', 'Roadside restaurant'], ['gasStation', 'Fuel Station', 'Canopy and pumps'], ['waterTower', 'Water Tower', 'Elevated water tank'], ['parkingGarage', 'Parking Garage', 'Multi-level parking'], ['maintenanceShed', 'Service Shed', 'Small utility building'], ['loadingOffice', 'Loading Office', 'Dockside dispatch office'],
      ['controlTower', 'Control Tower', 'Glazed port lookout'], ['fireStation', 'Fire Station', 'Emergency vehicle bays'], ['greenhouse', 'Greenhouse', 'Ribbed glass growing hall'], ['lighthouse', 'Lighthouse', 'Harbor navigation tower'], ['pavilion', 'Pavilion', 'Open-sided covered shelter'],
    ],
  },
  {
    label: 'Port & Industry', form: 'industrial', items: [
      ['container', 'Container', 'Freight obstacle'], ['gantryCrane', 'Gantry Crane', 'Container handling frame'], ['forklift', 'Forklift', 'Yard lift truck'], ['pipeRack', 'Pipe Rack', 'Stacked steel pipe'], ['generator', 'Generator', 'Mobile power unit'], ['transformer', 'Transformer', 'Substation equipment'], ['conveyor', 'Conveyor', 'Raised belt section'], ['cableReel', 'Cable Reel', 'Heavy cable spool'], ['palletStack', 'Pallet Stack', 'Timber freight pallets'], ['drumCluster', 'Drum Cluster', 'Industrial barrels'], ['cargoCrate', 'Cargo Crate', 'Timber shipping crate'], ['bollardRow', 'Bollard Row', 'Quay safety posts'], ['winch', 'Mooring Winch', 'Dockside cable winch'],
      ['oilTank', 'Oil Tank', 'Horizontal storage vessel'], ['silo', 'Bulk Silo', 'Tall grain and powder hopper'], ['loadingRamp', 'Loading Ramp', 'Raised vehicle access ramp'], ['mooringPost', 'Mooring Post', 'Heavy harbor tie-off'], ['railCar', 'Freight Railcar', 'Short industrial wagon'], ['cargoNet', 'Cargo Net', 'Freight secured under netting'],
    ],
  },
  {
    label: 'Street & Safety', form: 'street', items: [
      ['barrier', 'Barrier', 'Low obstacle'], ['trafficSignal', 'Traffic Signal', 'Three-light signal'], ['roadSign', 'Road Sign', 'Directional signpost'], ['fireHydrant', 'Fire Hydrant', 'Roadside hydrant'], ['bench', 'Bench', 'Street seating'], ['busShelter', 'Bus Shelter', 'Covered waiting area'], ['utilityBox', 'Utility Cabinet', 'Electrical service box'], ['dumpster', 'Dumpster', 'Industrial waste bin'], ['loadingSign', 'Loading Sign', 'Dock route marker'], ['trashCan', 'Trash Can', 'Public waste bin'],
      ['parkingMeter', 'Parking Meter', 'Curbside pay station'], ['roadCone', 'Road Cone', 'Reflective lane marker'], ['securityGate', 'Security Gate', 'Rising access barrier'], ['streetKiosk', 'Street Kiosk', 'Compact staffed booth'],
    ],
  },
  {
    label: 'Lighting', form: 'lighting', items: [
      ['streetLamp', 'Street Lamp', 'Single overhead roadway light'], ['twinStreetLamp', 'Twin Street Lamp', 'Two-sided road light'], ['floodlightTower', 'Floodlight Tower', 'Multi-head area light'], ['bollardLight', 'Bollard Light', 'Low walkway and dock light'], ['lanternPost', 'Lantern Post', 'Warm industrial path light'],
    ],
  },
  {
    label: 'Vehicles', form: 'vehicle', items: [
      ['compactCar', 'Compact Car', 'Small passenger car'], ['pickupTruck', 'Pickup Truck', 'Open-bed utility truck'], ['cargoVan', 'Cargo Van', 'Delivery vehicle'], ['boxTruck', 'Box Truck', 'Medium freight truck'], ['semiTruck', 'Semi Truck', 'Tractor and trailer'], ['shuttleBus', 'Shuttle Bus', 'Airport shuttle'], ['scooter', 'Scooter', 'Small two-wheel vehicle'], ['yardTug', 'Yard Tug', 'Port tractor'],
    ],
  },
  {
    label: 'Landscape', form: 'landscape', items: [
      ['pineTree', 'Pine Tree', 'Low-poly evergreen'], ['deciduousTree', 'Broadleaf Tree', 'Wide leafy canopy'], ['palmTree', 'Palm Tree', 'Port-side palm'], ['shrub', 'Shrub', 'Low planting'], ['rockCluster', 'Rock Cluster', 'Rough ground rocks'], ['planter', 'Concrete Planter', 'Raised planting bed'],
      ['flowerBed', 'Flower Bed', 'Colorful low planting'], ['hedge', 'Hedge', 'Trimmed green boundary'], ['boulder', 'Boulder', 'Single large angular rock'], ['deadTree', 'Dead Tree', 'Bare branching trunk'],
    ],
  },
  {
    label: 'Course Props', form: 'course', items: [
      ['landingPad', 'Landing Pad', 'Marked drone pad'], ['targetDisc', 'Target Disc', 'Ground scoring target'], ['windsock', 'Windsock', 'Wind direction marker'], ['hoopObstacle', 'Practice Hoop', 'Low circular obstacle'], ['checkpointPylon', 'Checkpoint Pylon', 'Tall route marker'], ['beacon', 'Beacon', 'Flashing course marker'],
      ['slalomGate', 'Slalom Gate', 'Paired flexible course poles'], ['droneDock', 'Drone Dock', 'Elevated charging platform'], ['tunnelArch', 'Tunnel Arch', 'Low flight-through frame'], ['lightArch', 'Light Arch', 'Neon checkpoint arch'],
    ],
  },
];
const BUILDER_EXISTING_PROP_TYPES = new Set(['house', 'warehouse', 'office', 'shop', 'hangar', 'apartment', 'tower', 'container', 'barrier']);
const builderEnvironmentCatalog = builderEnvironmentCategories.flatMap((category) => category.items.map(([type, label, description]) => ({
  type, label, description, category: category.label, form: category.form, useCatalogModel: !BUILDER_EXISTING_PROP_TYPES.has(type),
})));
const builderEnvironmentCatalogByType = new Map(builderEnvironmentCatalog.map((item) => [item.type, item]));
const builderPropTypes = Object.fromEntries([
  ['podium', 'Podium'],
  ['relay-podium-gate', 'Relay Podium Gate'],
  ...builderEnvironmentCatalog.map(({ type, label }) => [type, label]),
]);

function renderBuilderEnvironmentCatalog() {
  const host = document.querySelector('#builderEnvironmentCatalog');
  if (!host) return;
  host.replaceChildren();
  for (const category of builderEnvironmentCategories) {
    const section = document.createElement('section');
    section.className = 'builder-environment-category';
    const heading = document.createElement('h4');
    heading.className = 'builder-environment-category-title';
    heading.textContent = category.label;
    const library = document.createElement('div');
    library.className = 'gate-library builder-prop-library';
    library.setAttribute('role', 'group');
    library.setAttribute('aria-label', category.label);
    for (const [type, label, description] of category.items) {
      const button = document.createElement('button');
      button.className = 'gate-type';
      button.type = 'button';
      button.dataset.builderProp = type;
      const canvas = document.createElement('canvas');
      canvas.className = 'gate-icon builder-model-preview';
      canvas.dataset.modelPreview = `prop:${type}`;
      canvas.setAttribute('aria-hidden', 'true');
      const copy = document.createElement('span');
      const title = document.createElement('b');
      title.textContent = label;
      const detail = document.createElement('small');
      detail.textContent = description;
      copy.append(title, detail);
      button.append(canvas, copy);
      library.append(button);
    }
    section.append(heading, library);
    host.append(section);
  }
}
renderBuilderEnvironmentCatalog();
const BUILDER_ENVIRONMENT_OBJECT_SCALE = 5;

function createCatalogEnvironmentModel(group, asset) {
  const addBox = (size, position, material = 'steel', yaw = 0) => box(group, size, position, material, yaw);
  const addCylinder = (top, bottom, height, position, material = 'steel', segments = 8, axis = 'y') => cylinder(group, top, bottom, height, position, material, segments, axis);
  const addCone = (radius, height, position, material, segments = 7) => {
    const mesh = new THREE.Mesh(new THREE.ConeGeometry(radius, height, segments), sharedMaterials[material]);
    mesh.position.set(...position);
    group.add(mesh);
    return mesh;
  };
  const addRock = (position, scale, color = 'concrete') => {
    const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), sharedMaterials[color]);
    rock.position.set(...position);
    rock.scale.set(...scale);
    group.add(rock);
    return rock;
  };
  const type = asset.type;

  if (asset.form === 'building') {
    if (type === 'controlTower') {
      addBox([2.5, 3.6, 2.5], [0, 1.8, 0], 'concrete');
      addBox([3.25, 1.15, 3.25], [0, 4.1, 0], 'cyan');
      addBox([3.55, 0.18, 3.55], [0, 4.78, 0], 'steel');
      for (const x of [-1.55, 1.55]) addBox([0.12, 0.82, 0.12], [x, 4.05, 0], 'dark');
      addBox([2.4, 0.3, 2.4], [0, 5.02, 0], 'dark');
      addCone(1.25, 0.5, [0, 5.38, 0], 'orange', 8);
    } else if (type === 'fireStation') {
      addBox([4.5, 2.7, 3.3], [0, 1.35, 0], 'coral');
      addBox([4.7, 0.2, 3.5], [0, 2.78, 0], 'roof');
      for (const x of [-1.15, 1.15]) {
        addBox([1.45, 2.05, 0.14], [x, 1.12, 1.72], 'dark');
        for (let bar = 0; bar < 4; bar += 1) addBox([0.09, 1.92, 0.08], [x - 0.52 + bar * 0.35, 1.12, 1.82], 'steel');
      }
      addBox([1.05, 0.55, 0.12], [0, 2.12, 1.72], 'cyan');
      addBox([1.25, 0.16, 0.2], [0, 2.98, 0], 'orange');
    } else if (type === 'greenhouse') {
      addBox([4.4, 0.2, 3.0], [0, 0.1, 0], 'steel');
      for (const x of [-2.0, -1.0, 0, 1.0, 2.0]) addBox([0.1, 2.2, 0.1], [x, 1.2, 0], 'steel');
      for (const z of [-1.4, 0, 1.4]) addBox([4.2, 0.08, 0.08], [0, 2.22, z], 'cyan');
      for (const x of [-1.0, 1.0]) { const roof = addBox([0.1, 1.2, 3.0], [x, 2.75, 0], 'cyan'); roof.rotation.z = x < 0 ? 0.55 : -0.55; }
      addBox([0.12, 1.65, 0.12], [0, 0.95, 1.48], 'dark');
    } else if (type === 'lighthouse') {
      addCylinder(0.78, 1.15, 4.4, [0, 2.2, 0], 'cream', 8);
      for (let level = 0; level < 3; level += 1) addBox([1.55 - level * 0.15, 0.16, 0.08], [0, 1.0 + level * 1.15, 0.82 - level * 0.06], 'coral');
      addCylinder(0.92, 0.92, 0.18, [0, 4.43, 0], 'dark', 8);
      addCylinder(0.7, 0.7, 0.65, [0, 4.83, 0], 'cyan', 8);
      addCone(1.0, 0.72, [0, 5.48, 0], 'coral', 8);
    } else if (type === 'pavilion') {
      for (const x of [-1.65, 1.65]) for (const z of [-1.1, 1.1]) addBox([0.16, 2.55, 0.16], [x, 1.28, z], 'steel');
      addBox([4.0, 0.2, 2.9], [0, 2.62, 0], 'orange');
      addBox([3.65, 0.16, 2.65], [0, 2.78, 0], 'cyan');
      addBox([2.2, 0.18, 0.65], [0, 0.55, 0.4], 'ochre');
      addBox([0.16, 0.65, 0.16], [-0.9, 0.3, 0.4], 'dark'); addBox([0.16, 0.65, 0.16], [0.9, 0.3, 0.4], 'dark');
    } else if (type === 'waterTower') {
      for (const x of [-0.8, 0.8]) for (const z of [-0.8, 0.8]) addBox([0.16, 3.1, 0.16], [x, 1.55, z], 'steel');
      addCylinder(1.15, 1.25, 1.45, [0, 3.3, 0], 'blue', 9);
      addCylinder(1.2, 1.2, 0.16, [0, 4.08, 0], 'metal', 9);
      addCone(1.18, 0.6, [0, 4.98, 0], 'roof', 9);
    } else if (type === 'gasStation') {
      for (const x of [-1.45, 1.45]) for (const z of [-1.05, 1.05]) addBox([0.16, 2.15, 0.16], [x, 1.08, z], 'steel');
      addBox([4.2, 0.28, 3.3], [0, 2.28, 0], 'orange');
      addBox([3.8, 0.18, 2.9], [0, 2.48, 0], 'cyan');
      for (const x of [-1.2, 0, 1.2]) { addBox([0.42, 0.9, 0.48], [x, 0.48, -1.55], 'cream'); addBox([0.34, 0.18, 0.08], [x, 0.73, -1.8], 'coral'); }
    } else if (type === 'parkingGarage') {
      addBox([4.6, 3.4, 3.2], [0, 1.7, 0], 'concrete');
      for (let floor = 0; floor < 3; floor += 1) {
        const y = 0.7 + floor * 1.05;
        addBox([4.66, 0.15, 3.28], [0, y, 0], 'dark');
        addBox([4.55, 0.16, 0.12], [0, y + 0.35, 1.62], 'cyan');
      }
      for (const x of [-1.7, 0, 1.7]) addBox([0.13, 3.2, 0.18], [x, 1.62, 1.66], 'steel');
    } else if (type === 'maintenanceShed') {
      addBox([2.8, 1.8, 2.4], [0, 0.9, 0], 'rust');
      addBox([3.05, 0.18, 2.65], [0, 1.88, 0], 'roof');
      addBox([1.1, 1.35, 0.12], [0, 0.74, 1.22], 'dark');
      addBox([0.12, 1.25, 0.1], [-0.4, 0.78, 1.3], 'orange');
      addBox([0.12, 1.25, 0.1], [0.4, 0.78, 1.3], 'orange');
    } else if (type === 'loadingOffice' || type === 'diner' || type === 'motel') {
      const width = type === 'motel' ? 4.2 : type === 'diner' ? 3.6 : 3.3;
      const height = type === 'motel' ? 2.4 : 2.15;
      addBox([width, height, 2.7], [0, height / 2, 0], type === 'diner' ? 'cream' : 'concrete');
      addBox([width + 0.24, 0.25, 2.95], [0, height + 0.1, 0], type === 'diner' ? 'coral' : 'roof');
      for (let x = -width * 0.32; x <= width * 0.32; x += width * 0.32) addBox([0.68, 0.78, 0.09], [x, 1.2, 1.37], type === 'loadingOffice' ? 'cyan' : 'blue');
      if (type === 'motel') for (const x of [-1.3, 0, 1.3]) addBox([1, 0.2, 0.22], [x, 2.05, 1.52], 'orange');
      if (type === 'diner') addBox([3.75, 0.2, 0.12], [0, 1.75, 1.42], 'cyan');
    } else if (type === 'factory') {
      addBox([4.3, 2.7, 3.2], [0, 1.35, 0], 'steel');
      addBox([4.45, 0.18, 3.35], [0, 2.78, 0], 'roof');
      addBox([1.15, 3.2, 1.15], [1.35, 4.35, -0.72], 'concrete');
      addCylinder(0.6, 0.72, 1.6, [-1.3, 3.1, -0.6], 'rust', 7);
      for (const x of [-1.4, -0.45, 0.5, 1.45]) addBox([0.24, 2.35, 0.14], [x, 1.28, 1.62], 'orange');
    } else {
      const width = type === 'apartment' ? 3.8 : type === 'hangar' ? 4.3 : 3.2;
      const height = type === 'apartment' ? 4.4 : type === 'hangar' ? 2.9 : type === 'tower' ? 4.7 : 2.6;
      addBox([width, height, 3.0], [0, height / 2, 0], 'concrete');
      addBox([width + 0.28, 0.22, 3.25], [0, height + 0.1, 0], type === 'shop' ? 'orange' : 'roof');
      if (type === 'tower') {
        for (const x of [-1.25, 1.25]) for (const z of [-1.1, 1.1]) addBox([0.16, height + 0.2, 0.16], [x, height / 2, z], 'steel');
      } else {
        for (let floor = 0; floor < Math.max(1, Math.floor(height / 1.1)); floor += 1) {
          for (const x of [-width * 0.28, width * 0.28]) addBox([0.62, 0.52, 0.1], [x, 0.8 + floor * 1.05, 1.54], type === 'office' || type === 'apartment' ? 'cyan' : 'blue');
        }
        if (type === 'hangar' || type === 'warehouse') addBox([width * 0.5, height * 0.66, 0.12], [0, height * 0.34, 1.56], 'dark');
        if (type === 'house') addCone(2.15, 1.55, [0, height + 0.95, 0], 'orange', 4);
      }
    }
  } else if (asset.form === 'industrial') {
    if (type === 'oilTank') {
      addCylinder(1.05, 1.05, 2.55, [0, 1.42, 0], 'steel', 10, 'z');
      for (const z of [-1.18, 1.18]) addCylinder(1.05, 1.05, 0.14, [0, 1.42, z], 'metal', 10, 'z');
      addBox([2.0, 0.16, 0.16], [0, 2.72, 0], 'orange');
      addBox([0.18, 0.68, 0.18], [0.75, 3.05, -0.75], 'steel');
      for (const x of [-0.7, 0.7]) addBox([0.18, 0.4, 0.18], [x, 0.25, 0], 'dark');
    } else if (type === 'silo') {
      addCylinder(0.9, 1.15, 2.9, [0, 2.0, 0], 'concrete', 9);
      addCone(1.15, 0.85, [0, 3.88, 0], 'metal', 9);
      addCone(0.48, 1.0, [0, 0.52, 0], 'steel', 8);
      for (const y of [1.05, 2.1, 3.1]) addCylinder(0.93, 0.93, 0.1, [0, y, 0], 'dark', 9);
      addBox([0.5, 1.0, 0.12], [0, 1.65, 0.95], 'orange');
    } else if (type === 'loadingRamp') {
      addBox([3.4, 0.35, 2.1], [0, 0.2, -0.55], 'dark');
      const ramp = addBox([3.0, 0.3, 3.3], [0, 0.72, 0.95], 'steel'); ramp.rotation.x = -0.34;
      for (const x of [-1.25, 1.25]) { addBox([0.12, 0.55, 0.12], [x, 0.42, -0.3], 'orange'); addBox([0.12, 0.8, 0.12], [x, 0.88, 1.55], 'orange'); }
      for (let stripe = -1; stripe <= 1; stripe += 1) addBox([0.1, 0.08, 2.5], [stripe * 0.62, 0.96, 1.0], 'cyan');
    } else if (type === 'mooringPost') {
      addBox([1.5, 0.28, 1.2], [0, 0.14, 0], 'dark');
      addCylinder(0.48, 0.62, 1.0, [0, 0.78, 0], 'steel', 8);
      addCylinder(0.72, 0.72, 0.22, [0, 1.38, 0], 'metal', 8);
      addCylinder(0.25, 0.25, 1.15, [0, 1.95, 0], 'steel', 8);
      addCylinder(0.68, 0.68, 0.22, [0, 2.52, 0], 'metal', 8);
      addBox([0.12, 0.12, 0.8], [0, 2.68, 0], 'orange');
    } else if (type === 'railCar') {
      addBox([4.4, 0.42, 1.8], [0, 1.12, 0], 'rust');
      addBox([4.25, 1.12, 1.62], [0, 1.82, 0], 'ochre');
      addBox([4.5, 0.18, 1.9], [0, 2.48, 0], 'steel');
      for (const x of [-1.55, 1.55]) for (const z of [-0.95, 0.95]) addCylinder(0.48, 0.48, 0.22, [x, 0.48, z], 'dark', 8, 'z');
      for (const x of [-1.8, -0.9, 0, 0.9, 1.8]) addBox([0.12, 0.78, 0.08], [x, 1.82, 0.84], 'orange');
    } else if (type === 'cargoNet') {
      addBox([2.8, 1.6, 1.9], [0, 0.85, 0], 'ochre');
      addBox([3.0, 0.12, 2.1], [0, 1.68, 0], 'dark');
      for (let i = -2; i <= 2; i += 1) {
        addBox([0.06, 1.65, 0.06], [i * 0.5, 0.88, 1.0], 'orange');
        addBox([2.85, 0.06, 0.06], [0, 0.35 + i * 0.3, 1.0], 'orange');
      }
      addBox([0.06, 1.65, 0.06], [0, 0.88, -1.0], 'orange');
    } else if (type === 'gantryCrane') {
      for (const x of [-1.7, 1.7]) { addBox([0.2, 3.8, 0.2], [x, 1.9, 0], 'steel'); addBox([0.48, 0.16, 0.48], [x, 0.08, 0], 'dark'); }
      addBox([4.0, 0.24, 0.28], [0, 3.85, 0], 'orange');
      addBox([0.14, 1.65, 0.14], [0, 2.95, 0], 'dark');
      addBox([0.9, 0.3, 0.72], [0, 2.05, 0], 'cyan');
    } else if (type === 'forklift') {
      addBox([2.1, 0.72, 1.25], [0, 0.58, 0], 'orange');
      addBox([0.95, 1.05, 1.05], [-0.3, 1.38, -0.02], 'steel');
      addBox([0.12, 2.35, 0.12], [0.85, 1.3, 0.48], 'dark');
      addBox([0.18, 0.14, 1.05], [1.18, 0.2, 0], 'metal');
      for (const x of [-0.65, 0.65]) for (const z of [-0.62, 0.62]) addCylinder(0.35, 0.35, 0.22, [x, 0.36, z], 'dark', 8, 'z');
      addBox([0.95, 0.08, 0.1], [-0.3, 2.0, 0.58], 'cyan');
    } else if (type === 'pipeRack') {
      for (const x of [-1.65, 1.65]) { addBox([0.16, 2.1, 0.18], [x, 1.05, 0], 'steel'); addBox([0.55, 0.12, 0.45], [x, 0.12, 0], 'dark'); }
      for (let y = 0.65; y <= 1.8; y += 0.55) addCylinder(0.2, 0.2, 3.35, [0, y, 0], 'metal', 8, 'x');
    } else if (type === 'cableReel' || type === 'winch') {
      addBox([2.1, 0.24, 1.2], [0, 0.12, 0], 'dark');
      addCylinder(type === 'winch' ? 0.62 : 0.9, type === 'winch' ? 0.62 : 0.9, 1.0, [0, 1.0, 0], 'rust', 10, 'z');
      addCylinder(0.22, 0.22, 1.12, [0, 1.0, 0], 'metal', 8, 'z');
      if (type === 'winch') addBox([1.45, 0.4, 1.05], [0, 0.5, 0], 'steel');
    } else if (type === 'palletStack') {
      for (let level = 0; level < 3; level += 1) {
        const y = 0.12 + level * 0.55;
        addBox([1.8, 0.12, 1.2], [0, y, 0], 'ochre');
        for (const x of [-0.65, 0, 0.65]) addBox([0.16, 0.32, 1.05], [x, y - 0.21, 0], 'rust');
      }
    } else if (type === 'drumCluster') {
      for (const [x, z] of [[-0.6, -0.45], [0.6, -0.45], [-0.6, 0.55], [0.6, 0.55]]) { addCylinder(0.38, 0.38, 1.05, [x, 0.54, z], 'rust', 9); addCylinder(0.4, 0.4, 0.1, [x, 1.09, z], 'metal', 9); }
    } else if (type === 'bollardRow') {
      for (let index = -2; index <= 2; index += 1) { addCylinder(0.18, 0.24, 0.9, [index * 0.78, 0.48, 0], 'dark', 8); addCylinder(0.19, 0.19, 0.12, [index * 0.78, 0.93, 0], 'cyan', 8); }
    } else {
      const colorsForEquipment = type === 'generator' ? ['steel', 'dark'] : type === 'transformer' ? ['concrete', 'cyan'] : ['rust', 'metal'];
      addBox([2.35, 1.35, 1.4], [0, 0.75, 0], colorsForEquipment[0]);
      addBox([2.45, 0.16, 1.5], [0, 1.48, 0], colorsForEquipment[1]);
      if (type === 'conveyor') {
        const belt = addBox([3.3, 0.2, 1.15], [0, 1.35, 0], 'dark'); belt.rotation.z = -0.22;
        for (const x of [-1.45, 1.45]) { addBox([0.16, 1.1, 0.16], [x, 0.55, 0], 'steel'); addCylinder(0.22, 0.22, 1.15, [x, 0.96, 0], 'dark', 8, 'z'); }
      } else if (type === 'cargoCrate') {
        addBox([2.15, 1.25, 1.35], [0, 1.4, 0], 'ochre');
        for (const x of [-0.8, 0, 0.8]) addBox([0.1, 1.28, 1.42], [x, 1.4, 0], 'rust');
        addBox([2.2, 0.12, 1.42], [0, 2.06, 0], 'rust');
      } else {
        for (const x of [-0.75, 0, 0.75]) addBox([0.12, 1.1, 0.08], [x, 0.77, 0.72], type === 'transformer' ? 'orange' : 'metal');
        for (const x of [-0.8, 0.8]) addCylinder(0.16, 0.16, 0.8, [x, 1.85, -0.2], 'dark', 7);
      }
    }
  } else if (asset.form === 'street') {
    if (type === 'parkingMeter') {
      addCylinder(0.09, 0.14, 1.35, [0, 0.72, 0], 'steel', 7);
      addBox([0.46, 0.55, 0.3], [0, 1.62, 0], 'blue');
      addBox([0.28, 0.08, 0.08], [0, 1.72, 0.17], 'cyan');
      addBox([0.22, 0.12, 0.08], [0, 1.49, 0.17], 'orange');
      addBox([0.48, 0.12, 0.48], [0, 0.08, 0], 'dark');
    } else if (type === 'roadCone') {
      addBox([0.9, 0.12, 0.9], [0, 0.06, 0], 'dark');
      addCone(0.43, 1.05, [0, 0.64, 0], 'orange', 6);
      addCylinder(0.25, 0.3, 0.16, [0, 0.7, 0], 'cream', 6);
      addCylinder(0.11, 0.16, 0.5, [0, 0.43, 0], 'orange', 6);
    } else if (type === 'securityGate') {
      addBox([0.9, 0.95, 0.9], [-1.6, 0.48, 0], 'steel');
      addBox([0.52, 0.62, 0.52], [-1.6, 1.26, 0], 'cyan');
      const arm = addBox([3.8, 0.15, 0.16], [0.4, 1.12, 0], 'cream'); arm.rotation.z = -0.08;
      for (let stripe = -1; stripe <= 2; stripe += 1) addBox([0.32, 0.17, 0.18], [stripe * 0.9, 1.12, 0.1], 'coral');
      addCylinder(0.26, 0.26, 0.18, [-1.6, 1.6, 0], 'orange', 8);
    } else if (type === 'streetKiosk') {
      addBox([1.8, 2.0, 1.45], [0, 1.0, 0], 'coral');
      addBox([2.0, 0.18, 1.6], [0, 2.08, 0], 'dark');
      addBox([1.25, 0.72, 0.1], [0, 1.45, 0.78], 'cyan');
      addBox([0.72, 0.68, 0.12], [-0.55, 0.48, 0.78], 'steel');
      addBox([1.9, 0.14, 0.12], [0, 2.22, 0.76], 'orange');
    } else if (type === 'streetLamp' || type === 'trafficSignal' || type === 'roadSign' || type === 'loadingSign') {
      addCylinder(0.1, 0.16, type === 'streetLamp' ? 4.5 : 3.0, [0, type === 'streetLamp' ? 2.25 : 1.5, 0], 'steel', 7);
      addBox([0.48, 0.14, 0.48], [0, 0.08, 0], 'dark');
      if (type === 'streetLamp') {
        addBox([1.35, 0.12, 0.12], [0.56, 4.35, 0], 'steel'); addBox([0.48, 0.16, 0.42], [1.05, 4.25, 0], 'cyan');
      } else if (type === 'trafficSignal') {
        addBox([0.72, 1.35, 0.42], [0.52, 2.35, 0], 'dark');
        for (let i = 0; i < 3; i += 1) addCylinder(0.17, 0.17, 0.08, [0.52, 2.8 - i * 0.42, 0.24], ['coral', 'orange', 'lime'][i], 8, 'z');
      } else {
        addBox([1.35, 0.82, 0.12], [0.62, 2.3, 0], type === 'loadingSign' ? 'orange' : 'blue');
        addBox([0.72, 0.08, 0.14], [0.62, 2.3, 0.09], 'cream');
      }
    } else if (type === 'fireHydrant') {
      addCylinder(0.38, 0.48, 0.92, [0, 0.54, 0], 'coral', 8); addCylinder(0.48, 0.48, 0.18, [0, 1.08, 0], 'orange', 8);
      for (const side of [-1, 1]) addCylinder(0.2, 0.22, 0.32, [side * 0.42, 0.62, 0], 'coral', 8, 'x');
    } else if (type === 'bench') {
      for (const z of [-0.48, 0.48]) addBox([0.12, 0.65, 0.12], [0, 0.35, z], 'steel');
      for (let index = 0; index < 4; index += 1) addBox([2.0, 0.13, 0.2], [0, 0.72 + index * 0.23, -0.3 + index * 0.25], 'ochre');
    } else if (type === 'busShelter') {
      for (const x of [-1.35, 1.35]) for (const z of [-0.75, 0.75]) addBox([0.12, 2.1, 0.12], [x, 1.05, z], 'steel');
      addBox([3.0, 0.16, 1.9], [0, 2.15, 0], 'roof'); addBox([2.7, 1.45, 0.08], [0, 1.1, -0.72], 'cyan'); addBox([1.8, 0.16, 0.56], [0, 0.55, 0.25], 'steel');
    } else if (type === 'utilityBox') {
      addBox([1.1, 1.45, 0.8], [0, 0.75, 0], 'steel');
      for (const x of [-0.32, 0, 0.32]) addBox([0.12, 1.1, 0.06], [x, 0.75, 0.43], 'dark');
      addBox([1.16, 0.1, 0.86], [0, 1.52, 0], 'cyan');
    } else if (type === 'dumpster' || type === 'trashCan') {
      if (type === 'dumpster') { addBox([2.1, 1.45, 1.3], [0, 0.82, 0], 'lime'); addBox([2.25, 0.16, 1.4], [0, 1.62, 0], 'dark'); }
      else { addCylinder(0.52, 0.62, 1.05, [0, 0.56, 0], 'steel', 9); addCylinder(0.6, 0.6, 0.13, [0, 1.1, 0], 'dark', 9); }
    }
  } else if (asset.form === 'lighting') {
    const glow = type === 'lanternPost' ? 'orange' : type === 'floodlightTower' ? 'cream' : 'cyan';
    if (type === 'bollardLight') {
      addCylinder(0.22, 0.3, 0.9, [0, 0.53, 0], 'steel', 8);
      addCylinder(0.32, 0.32, 0.12, [0, 0.12, 0], 'dark', 8);
      addCylinder(0.24, 0.24, 0.16, [0, 0.98, 0], glow, 8);
      addCylinder(0.38, 0.38, 0.14, [0, 1.08, 0], 'dark', 8);
    } else if (type === 'lanternPost') {
      addCylinder(0.13, 0.22, 3.5, [0, 1.85, 0], 'steel', 8);
      addCylinder(0.42, 0.42, 0.12, [0, 0.12, 0], 'dark', 8);
      addBox([0.94, 0.18, 0.94], [0, 3.68, 0], 'dark');
      addBox([0.58, 0.78, 0.58], [0, 4.15, 0], glow);
      addBox([1.08, 0.16, 1.08], [0, 4.62, 0], 'steel');
      addCone(0.72, 0.48, [0, 4.96, 0], 'dark', 4);
    } else if (type === 'floodlightTower') {
      addCylinder(0.14, 0.26, 6.4, [0, 3.28, 0], 'steel', 8);
      addCylinder(0.48, 0.56, 0.2, [0, 0.12, 0], 'dark', 8);
      addBox([2.9, 0.2, 0.2], [0, 6.35, 0], 'steel');
      for (let index = -1; index <= 1; index += 1) {
        addBox([0.78, 0.62, 0.18], [index * 0.92, 6.0, 0.12], 'dark');
        addBox([0.56, 0.38, 0.08], [index * 0.92, 6.0, 0.24], glow);
      }
      for (const side of [-1, 1]) {
        const brace = addBox([0.12, 3.0, 0.12], [side * 1.05, 1.65, 0], 'steel');
        brace.rotation.z = side * -0.3;
      }
    } else {
      addCylinder(0.13, 0.22, 6.2, [0, 3.18, 0], 'steel', 8);
      addCylinder(0.45, 0.54, 0.2, [0, 0.12, 0], 'dark', 8);
      const headOffsets = type === 'twinStreetLamp' ? [-1, 1] : [1];
      headOffsets.forEach((side) => {
        addBox([2.45, 0.14, 0.14], [side * 0.88, 6.12, 0], 'steel');
        addBox([0.86, 0.2, 0.72], [side * 1.9, 6.0, 0], 'dark');
        addBox([0.68, 0.08, 0.52], [side * 1.9, 5.87, 0], glow);
      });
    }
  } else if (asset.form === 'vehicle') {
    const long = type === 'semiTruck' ? 5.6 : type === 'shuttleBus' || type === 'boxTruck' ? 4.8 : type === 'cargoVan' ? 3.7 : 3.2;
    const bodyY = type === 'scooter' ? 0.68 : 0.86;
    addBox([long, type === 'semiTruck' ? 0.82 : 0.72, 1.6], [0, bodyY, 0], type === 'pickupTruck' ? 'orange' : type === 'shuttleBus' ? 'cyan' : 'steel');
    if (type === 'semiTruck') {
      addBox([3.6, 1.75, 1.8], [-0.75, 2.05, 0], 'cream');
      addBox([1.9, 1.45, 1.7], [2.75, 1.75, 0], 'rust');
      addBox([0.9, 0.58, 0.08], [-0.75, 2.12, 0.92], 'blue');
    } else if (type === 'boxTruck' || type === 'cargoVan' || type === 'shuttleBus') {
      const cabinLength = type === 'boxTruck' ? 2.4 : long * 0.75;
      addBox([cabinLength, type === 'shuttleBus' ? 1.5 : 1.35, 1.5], [-0.05, 1.85, 0], type === 'boxTruck' ? 'cream' : 'steel');
      for (let x = -cabinLength * 0.32; x <= cabinLength * 0.33; x += cabinLength * 0.32) addBox([0.52, 0.5, 0.06], [x, 2.05, 0.77], 'blue');
    } else if (type === 'pickupTruck') {
      addBox([1.55, 0.85, 1.48], [-0.45, 1.55, 0], 'steel');
      addBox([1.25, 0.18, 1.55], [1.25, 1.0, 0], 'dark');
      addBox([0.12, 0.45, 1.55], [0.55, 1.18, 0], 'steel');
    } else if (type === 'scooter') {
      addCylinder(0.38, 0.38, 0.22, [-0.9, 0.4, 0], 'dark', 8, 'z'); addCylinder(0.38, 0.38, 0.22, [0.9, 0.4, 0], 'dark', 8, 'z');
      addBox([1.45, 0.16, 0.38], [0, 0.82, 0], 'coral'); addBox([0.12, 0.85, 0.12], [0.75, 1.08, 0], 'steel');
    } else {
      addBox([1.8, 0.85, 1.5], [-0.25, 1.52, 0], 'steel');
      addBox([1.3, 0.55, 0.08], [-0.25, 1.65, 0.79], 'blue');
    }
    if (type !== 'scooter') {
      const wheelX = long * 0.36;
      for (const x of [-wheelX, wheelX]) for (const z of [-0.83, 0.83]) addCylinder(0.39, 0.39, 0.24, [x, 0.42, z], 'dark', 8, 'z');
      addBox([0.24, 0.16, 0.08], [long * 0.47, 0.9, 0.84], 'orange');
    }
  } else if (asset.form === 'landscape') {
    if (type === 'flowerBed') {
      addBox([3.0, 0.32, 1.5], [0, 0.16, 0], 'concrete');
      addBox([2.75, 0.12, 1.25], [0, 0.37, 0], 'dark');
      for (let row = 0; row < 2; row += 1) for (let col = 0; col < 5; col += 1) {
        addCone(0.19, 0.42, [-1.05 + col * 0.52, 0.64, row * 0.48 - 0.24], ['coral', 'orange', 'violet', 'lime', 'cyan'][(col + row) % 5], 5);
      }
    } else if (type === 'hedge') {
      addBox([3.4, 0.9, 1.0], [0, 0.63, 0], 'pine');
      for (const x of [-1.35, -0.45, 0.45, 1.35]) addRock([x, 1.02, 0], [0.58, 0.48, 0.58], 'lime');
      addBox([3.5, 0.12, 1.1], [0, 0.12, 0], 'concrete');
    } else if (type === 'boulder') {
      addRock([0, 0.72, 0], [1.2, 0.88, 1.05], 'concrete');
      addRock([-0.28, 0.9, 0.08], [0.72, 0.62, 0.78], 'steel');
      addBox([0.7, 0.08, 0.7], [0, 0.08, 0], 'dark');
    } else if (type === 'deadTree') {
      addCylinder(0.2, 0.38, 2.5, [0, 1.25, 0], 'rust', 6);
      for (const [x, y, z, yaw] of [[-0.45, 1.75, 0, 0.42], [0.48, 2.0, 0, -0.5], [-0.72, 2.35, 0, -0.62], [0.75, 2.65, 0, 0.54]]) {
        const limb = addBox([0.16, 1.25, 0.16], [x, y, z], 'rust'); limb.rotation.z = yaw;
      }
      addBox([1.0, 0.12, 0.85], [0, 0.08, 0], 'dark');
    } else if (type === 'pineTree') {
      addCylinder(0.16, 0.24, 1.55, [0, 0.78, 0], 'rust', 6);
      for (let level = 0; level < 3; level += 1) addCone(1.05 - level * 0.2, 1.55, [0, 1.7 + level * 0.85, 0], 'pine', 7);
    } else if (type === 'palmTree') {
      addCylinder(0.12, 0.28, 3.4, [0, 1.7, 0], 'ochre', 7);
      for (let leaf = 0; leaf < 6; leaf += 1) { const angle = leaf / 6 * Math.PI * 2; const frond = addBox([1.8, 0.13, 0.34], [Math.cos(angle) * 0.8, 3.5, Math.sin(angle) * 0.8], 'lime', -angle); frond.rotation.z = (leaf % 2 ? -1 : 1) * 0.32; }
    } else if (type === 'deciduousTree') {
      addCylinder(0.2, 0.34, 1.8, [0, 0.9, 0], 'rust', 6);
      addRock([0, 2.2, 0], [1.35, 1.25, 1.3], 'lime'); addRock([-0.75, 2.05, 0.1], [0.85, 0.8, 0.9], 'pine'); addRock([0.7, 2.0, -0.1], [0.9, 0.84, 0.92], 'lime');
    } else if (type === 'shrub') {
      for (const [x, z] of [[-0.5, 0], [0.3, -0.35], [0.55, 0.35]]) addRock([x, 0.45, z], [0.72, 0.58, 0.68], 'pine');
    } else if (type === 'planter') {
      addBox([2.4, 0.58, 1.5], [0, 0.3, 0], 'concrete'); addBox([2.1, 0.15, 1.2], [0, 0.63, 0], 'pine');
      for (let index = 0; index < 4; index += 1) addCone(0.38, 0.78, [-0.75 + index * 0.5, 1.08, 0], 'lime', 5);
    } else {
      for (const [x, y, z, s] of [[-0.65, 0.46, 0, 0.72], [0.15, 0.65, -0.2, 1], [0.78, 0.38, 0.22, 0.58], [-0.1, 0.32, 0.5, 0.5]]) addRock([x, y, z], [s, s * 0.72, s * 0.9], 'concrete');
    }
  } else if (asset.form === 'course') {
    if (type === 'slalomGate') {
      addBox([3.2, 0.12, 0.65], [0, 0.06, 0], 'dark');
      for (const x of [-1.2, 1.2]) {
        addCylinder(0.08, 0.13, 2.15, [x, 1.1, 0], 'cyan', 7);
        addCone(0.2, 0.34, [x, 2.3, 0], 'orange', 6);
        addBox([0.2, 0.08, 0.08], [x, 0.8, 0.08], 'coral');
      }
      addBox([3.0, 0.12, 0.12], [0, 2.0, 0], 'violet');
    } else if (type === 'droneDock') {
      addBox([2.2, 0.32, 2.2], [0, 0.85, 0], 'steel');
      for (const x of [-0.82, 0.82]) for (const z of [-0.82, 0.82]) addBox([0.22, 0.72, 0.22], [x, 0.38, z], 'dark');
      addBox([2.35, 0.15, 2.35], [0, 1.08, 0], 'cyan');
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.72, 0.07, 5, 16), sharedMaterials.orange); ring.rotation.x = Math.PI / 2; ring.position.y = 1.18; group.add(ring);
      addBox([0.12, 0.04, 0.8], [0, 1.18, 0], 'cream'); addBox([0.8, 0.04, 0.12], [0, 1.18, 0], 'cream');
    } else if (type === 'tunnelArch') {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.16, 6, 16), sharedMaterials.orange); hoop.rotation.x = Math.PI / 2; hoop.position.y = 1.72; hoop.scale.set(1.35, 1, 1); group.add(hoop);
      addBox([4.0, 0.14, 2.5], [0, 0.08, 0], 'dark');
      for (const z of [-0.95, 0, 0.95]) addBox([0.1, 2.8, 0.12], [0, 1.55, z], 'cyan');
      for (const x of [-2.0, 2.0]) addBox([0.18, 0.3, 0.18], [x, 0.18, 0], 'steel');
    } else if (type === 'lightArch') {
      for (const x of [-2.1, 2.1]) addBox([0.22, 3.2, 0.22], [x, 1.6, 0], 'steel');
      addBox([4.4, 0.24, 0.24], [0, 3.18, 0], 'violet');
      for (let i = 0; i < 7; i += 1) addBox([0.35, 0.34, 0.34], [-1.8 + i * 0.6, 3.18, 0], ['cyan', 'violet', 'coral'][i % 3]);
      addBox([4.8, 0.12, 0.9], [0, 0.08, 0], 'dark');
    } else if (type === 'landingPad') {
      addCylinder(1.55, 1.7, 0.16, [0, 0.08, 0], 'dark', 8);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(1.12, 0.09, 5, 20), sharedMaterials.cyan); ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; group.add(ring);
      addBox([0.12, 0.03, 0.9], [0, 0.21, 0], 'cream'); addBox([0.9, 0.03, 0.12], [0, 0.21, 0], 'cream');
    } else if (type === 'targetDisc') {
      for (const [radius, color] of [[1.35, 'coral'], [0.9, 'cream'], [0.46, 'cyan']]) { const disc = new THREE.Mesh(new THREE.CircleGeometry(radius, 12), sharedMaterials[color]); disc.rotation.x = -Math.PI / 2; disc.position.y = 0.04; group.add(disc); }
    } else if (type === 'windsock') {
      addCylinder(0.08, 0.12, 3.7, [0, 1.85, 0], 'steel', 7);
      const sock = addCone(0.45, 1.7, [0.7, 3.25, 0], 'orange', 8); sock.rotation.z = -Math.PI / 2;
      addBox([0.75, 0.12, 0.12], [0.42, 4.05, 0], 'metal');
    } else if (type === 'hoopObstacle') {
      const hoop = new THREE.Mesh(new THREE.TorusGeometry(1.05, 0.12, 6, 18), sharedMaterials.orange); hoop.rotation.x = Math.PI / 2; hoop.position.y = 1.35; group.add(hoop);
      for (const x of [-1.15, 1.15]) addBox([0.12, 1.35, 0.12], [x, 0.68, 0], 'steel');
      addBox([2.6, 0.1, 0.55], [0, 0.08, 0], 'dark');
    } else if (type === 'checkpointPylon') {
      addBox([0.7, 0.16, 0.7], [0, 0.08, 0], 'dark'); addBox([0.34, 2.35, 0.34], [0, 1.28, 0], 'orange'); addBox([0.52, 0.18, 0.52], [0, 2.55, 0], 'cyan');
    } else {
      addCylinder(0.3, 0.42, 0.62, [0, 0.31, 0], 'dark', 8); addCylinder(0.3, 0.3, 1.3, [0, 1.2, 0], 'steel', 8); addCone(0.58, 0.72, [0, 2.12, 0], 'coral', 8);
    }
  }
}

function createBuilderPropModel(type) {
  const group = new THREE.Group();
  const glass = sharedMaterials.cyan;
  const catalogAsset = builderEnvironmentCatalogByType.get(type);
  if (catalogAsset?.useCatalogModel) {
    createCatalogEnvironmentModel(group, catalogAsset);
  } else if (type === 'podium') {
    group.add(createRedRacePodium(getBuilderRacePodiumLabelMaterial()));
  } else if (type === 'relay-podium-gate') {
    for (const side of [-1, 1]) {
      const podium = createRedRacePodium(getBuilderRacePodiumLabelMaterial());
      podium.position.set(side * RELAY_PODIUM_STAGE_SIDE_OFFSET, 0, RELAY_PODIUM_STAGE_FORWARD_OFFSET);
      podium.userData.relayPodiumSide = side;
      group.add(podium);
    }
    const neon = new THREE.MeshStandardMaterial({
      color: 0x45dfff,
      emissive: 0x45dfff,
      emissiveIntensity: 2.6,
      roughness: 0.28,
      metalness: 0.12,
      toneMapped: false,
    });
    const frameWidth = 18.8;
    const frameHeight = 15;
    const frameDepth = 0.3;
    for (const x of [-frameWidth / 2, frameWidth / 2]) {
      const upright = new THREE.Mesh(new THREE.BoxGeometry(frameDepth, frameHeight, frameDepth), neon);
      upright.position.set(x, frameHeight / 2, 0);
      group.add(upright);
    }
    for (const y of [3.4, frameHeight]) {
      const crossbar = new THREE.Mesh(new THREE.BoxGeometry(frameWidth, frameDepth, frameDepth), neon);
      crossbar.position.set(0, y, 0);
      group.add(crossbar);
    }
  } else if (type === 'house') {
    box(group, [5.4, 3.3, 4.6], [0, 1.65, 0], 'cream');
    const roof = new THREE.Mesh(new THREE.ConeGeometry(4.25, 2.45, 4), sharedMaterials.orange);
    roof.position.set(0, 4.48, 0);
    roof.rotation.y = Math.PI / 4;
    roof.userData.ownedBuilderGeometry = true;
    group.add(roof);
    box(group, [1.05, 2.15, 0.16], [0, 1.08, 2.38], 'steel');
    box(group, [1.05, 0.9, 0.15], [-1.65, 2.12, 2.38], glass);
    box(group, [1.05, 0.9, 0.15], [1.65, 2.12, 2.38], glass);
    box(group, [5.8, 0.32, 4.9], [0, 0.16, 0], 'metal');
  } else if (type === 'warehouse') {
    box(group, [11, 4.8, 8], [0, 2.4, 0], 'steel');
    box(group, [11.5, 0.45, 8.5], [0, 4.95, 0], 'metal');
    box(group, [4.8, 3.5, 0.2], [-2.7, 1.9, 4.08], 'dark');
    box(group, [4.8, 3.5, 0.2], [2.7, 1.9, 4.08], 'dark');
    for (let index = -3; index <= 3; index += 1) box(group, [0.12, 3.25, 0.09], [index * 0.52, 1.9, 4.2], 'orange');
    box(group, [2.2, 0.38, 0.18], [0, 4.45, 4.1], 'cyan');
  } else if (type === 'office') {
    box(group, [9.5, 12, 8], [0, 6, 0], 'steel');
    box(group, [10, 0.5, 8.5], [0, 12.2, 0], 'cyan');
    for (let floor = 0; floor < 4; floor += 1) {
      box(group, [9.65, 0.22, 8.12], [0, 1.9 + floor * 2.7, 0], 'dark');
      for (let panel = -2; panel <= 2; panel += 1) box(group, [1.05, 1.25, 0.14], [panel * 1.65, 1.35 + floor * 2.7, 4.08], 'cyan');
    }
    box(group, [3, 1.2, 0.22], [0, 12.95, 4.25], 'orange');
  } else if (type === 'shop') {
    box(group, [9.5, 4.2, 7], [0, 2.1, 0], 'cream');
    box(group, [10.2, 0.55, 7.8], [0, 4.45, 0], 'orange');
    box(group, [7.7, 2.15, 0.18], [0, 2.45, 3.58], glass);
    box(group, [2.1, 3.2, 0.24], [0, 1.7, 3.72], 'steel');
    box(group, [6.5, 0.75, 0.5], [0, 5.1, 3.7], 'dark');
    box(group, [5.8, 0.14, 0.16], [0, 5.12, 3.98], 'cyan');
  } else if (type === 'hangar') {
    box(group, [15, 7, 13], [0, 3.5, 0], 'steel');
    box(group, [15.8, 0.55, 13.8], [0, 7.15, 0], 'dark');
    box(group, [12, 5.8, 0.28], [0, 3.1, 6.65], 'blue');
    for (let panel = -4; panel <= 4; panel += 1) box(group, [0.12, 5.4, 0.12], [panel * 1.4, 3.1, 6.82], 'cyan');
    box(group, [15.2, 0.35, 0.35], [0, 6.25, 6.8], 'orange');
    for (const side of [-1, 1]) box(group, [0.5, 7.4, 14], [side * 7.4, 3.7, 0], 'orange');
  } else if (type === 'apartment') {
    box(group, [10, 15, 9], [0, 7.5, 0], 'concrete');
    box(group, [10.6, 0.5, 9.6], [0, 15.25, 0], 'roof');
    for (let floor = 0; floor < 5; floor += 1) {
      box(group, [10.15, 0.18, 9.15], [0, 1.2 + floor * 2.7, 0], 'dark');
      for (const panel of [-1, 0, 1]) box(group, [1.55, 1.55, 0.16], [panel * 2.65, 1.95 + floor * 2.7, 4.57], glass);
    }
    box(group, [0.5, 15.3, 0.5], [-4.8, 7.65, 0], 'cyan');
    box(group, [0.5, 15.3, 0.5], [4.8, 7.65, 0], 'orange');
  } else if (type === 'tower') {
    for (const x of [-1.45, 1.45]) for (const z of [-1.45, 1.45]) box(group, [0.32, 9, 0.32], [x, 4.5, z], 'steel');
    for (const y of [1.2, 3.5, 5.8, 8.1]) {
      box(group, [3.4, 0.22, 3.4], [0, y, 0], 'metal');
      box(group, [3.15, 0.12, 0.18], [0, y + 0.8, 0], 'orange');
      box(group, [0.18, 0.12, 3.15], [0, y + 0.8, 0], 'cyan');
    }
    box(group, [4.3, 0.55, 4.3], [0, 9.05, 0], 'orange');
  } else if (type === 'container') {
    box(group, [8.6, 3.2, 3.2], [0, 1.6, 0], 'blue');
    box(group, [8.8, 0.18, 3.35], [0, 0.16, 0], 'metal');
    box(group, [8.8, 0.18, 3.35], [0, 3.04, 0], 'metal');
    for (let index = -4; index <= 4; index += 1) box(group, [0.09, 2.55, 0.08], [index * 0.94, 1.6, 1.64], 'cyan');
    box(group, [0.14, 2.6, 0.15], [-4.2, 1.6, 1.7], 'orange');
    box(group, [0.14, 2.6, 0.15], [4.2, 1.6, 1.7], 'orange');
  } else if (type === 'barrier') {
    box(group, [5.8, 0.72, 0.45], [0, 1.05, 0], 'cream');
    box(group, [6.15, 0.2, 0.65], [0, 0.22, 0], 'steel');
    for (let index = -2; index <= 2; index += 1) {
      const stripe = box(group, [0.38, 0.74, 0.48], [index * 1.08, 1.05, 0.06], index % 2 ? 'dark' : 'orange');
      stripe.rotation.z = -0.5;
    }
  }
  if (type !== 'podium' && type !== 'relay-podium-gate') {
    const baseY = new THREE.Box3().setFromObject(group).min.y;
    group.scale.setScalar(BUILDER_ENVIRONMENT_OBJECT_SCALE);
    group.position.y = -baseY * (BUILDER_ENVIRONMENT_OBJECT_SCALE - 1);
  }
  group.traverse((node) => { if (node.isMesh) { node.castShadow = true; node.receiveShadow = true; } });
  group.userData.builderPropType = type;
  return group;
}

function createRelayPodiumGateIndicators(propObject) {
  const indicator = new THREE.Group();
  indicator.name = 'Builder relay gate entrance indicator';
  indicator.userData.isRelayPodiumGateIndicator = true;
  indicator.userData.showInBuilder = false;
  indicator.visible = false;

  const openingWidth = 18.4;
  const openingHeight = 11.35;
  const openingCenterY = 9.075;
  const panelGeometry = new THREE.PlaneGeometry(openingWidth, openingHeight);
  const frontPanel = new THREE.Mesh(panelGeometry, new THREE.MeshBasicMaterial({
    color: gateBoundaryCorrectColor,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  }));
  frontPanel.position.set(0, openingCenterY, 0.17);
  frontPanel.renderOrder = 8;
  frontPanel.userData.isRelayPodiumGateIndicatorGeometry = true;
  indicator.add(frontPanel);

  const backPanel = new THREE.Mesh(panelGeometry.clone(), new THREE.MeshBasicMaterial({
    color: gateBoundaryWrongColor,
    transparent: true,
    opacity: 0.3,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
  }));
  backPanel.position.set(0, openingCenterY, -0.17);
  backPanel.rotation.y = Math.PI;
  backPanel.renderOrder = 8;
  backPanel.userData.isRelayPodiumGateIndicatorGeometry = true;
  indicator.add(backPanel);

  const badges = [];
  for (const [side, z, rotationY] of [['front', 0.22, 0], ['back', -0.22, Math.PI]]) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 280;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const badge = new THREE.Mesh(new THREE.PlaneGeometry(10.4, 5.2), new THREE.MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    }));
    badge.position.set(0, openingCenterY, z);
    badge.rotation.y = rotationY;
    badge.renderOrder = 10;
    badge.userData.isRelayPodiumGateNumberBadge = true;
    badge.userData.badgeCanvas = canvas;
    badge.userData.badgeSide = side;
    drawRelayPodiumGateNumberBadge(badge, '01', side === 'front');
    badge.userData.displayLabel = '01';
    badge.userData.isEntrySide = side === 'front';
    badges.push(badge);
    indicator.add(badge);
  }
  indicator.userData.frontPanel = frontPanel;
  indicator.userData.backPanel = backPanel;
  indicator.userData.numberBadges = badges;
  propObject.userData.relayPodiumGateIndicator = indicator;
  propObject.add(indicator);
}

function drawRelayPodiumGateNumberBadge(badge, label, isEntrySide) {
  const context = badge.userData.badgeCanvas.getContext('2d');
  if (!context) return;
  const accent = isEntrySide ? '#4cff88' : '#ff4b65';
  context.clearRect(0, 0, 512, 280);
  context.fillStyle = isEntrySide ? 'rgba(9, 39, 29, 0.9)' : 'rgba(44, 14, 22, 0.9)';
  context.strokeStyle = accent;
  context.lineWidth = 8;
  context.beginPath();
  context.roundRect(12, 12, 488, 256, 30);
  context.fill();
  context.stroke();
  context.fillStyle = isEntrySide ? '#caffdd' : '#ffd4da';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = `800 ${label === 'S / F' ? 112 : 142}px system-ui, sans-serif`;
  context.fillText(label, 256, 126);
  context.fillStyle = accent;
  context.font = '800 40px system-ui, sans-serif';
  context.fillText(isEntrySide ? 'ENTRY' : 'EXIT', 256, 222);
  badge.material.map.needsUpdate = true;
}

function createBuilderPropObject(data, parent = builderPropRoot) {
  const object = new THREE.Group();
  object.userData.isBuilderProp = true;
  object.userData.propId = data.id;
  object.userData.propType = data.type;
  object.userData.isLaunchPodium = data.isLaunchPodium === true;
  object.position.set(data.x, data.y, data.z);
  object.rotation.set(
    THREE.MathUtils.degToRad(data.rotationX || 0),
    THREE.MathUtils.degToRad(data.rotation || data.rotationY || 0),
    THREE.MathUtils.degToRad(data.rotationZ || 0),
  );
  object.scale.set(
    data.scaleX ?? data.scale ?? 1,
    data.scaleY ?? data.scale ?? 1,
    data.scaleZ ?? data.scale ?? 1,
  );
  object.add(createBuilderPropModel(data.type));
  if (data.type === 'relay-podium-gate') createRelayPodiumGateIndicators(object);
  parent.add(object);
  return object;
}

function clearCommunityTrackProps() {
  for (const object of [...communityPropRoot.children]) {
    communityPropRoot.remove(object);
    object.traverse((node) => {
      if (node.userData.ownedBuilderGeometry) node.geometry?.dispose();
      if (node.userData.isRelayPodiumGateIndicatorGeometry || node.userData.isRelayPodiumGateNumberBadge) {
        node.geometry?.dispose();
        if (node.userData.isRelayPodiumGateNumberBadge) node.material.map?.dispose();
        node.material?.dispose();
      }
    });
  }
}

function loadCommunityTrackProps(track) {
  clearCommunityTrackProps();
  if (!track?.id?.startsWith('community-') || !Array.isArray(track.objects)) return;
  track.objects.slice(0, 100).forEach((object, index) => {
    if (!builderPropTypes[object?.type]) return;
    const x = THREE.MathUtils.clamp(Number(object.x) || 0, -320, 320);
    const z = THREE.MathUtils.clamp(Number(object.z) || 0, -320, 320);
    createBuilderPropObject({
      id: `community-prop-${track.id}-${index}`,
      type: object.type,
      x,
      y: Number.isFinite(Number(object.y)) ? Number(object.y) : terrainSurfaceYAt(activeBiome, x, z),
      z,
      rotation: Number(object.rotation) || 0,
      rotationX: Number(object.rotationX) || 0,
      rotationY: Number(object.rotationY) || Number(object.rotation) || 0,
      rotationZ: Number(object.rotationZ) || 0,
      scale: THREE.MathUtils.clamp(Number(object.scale) || 1, 0.5, 2),
      scaleX: THREE.MathUtils.clamp(Number(object.scaleX) || Number(object.scale) || 1, 0.5, 2),
      scaleY: THREE.MathUtils.clamp(Number(object.scaleY) || Number(object.scale) || 1, 0.5, 2),
      scaleZ: THREE.MathUtils.clamp(Number(object.scaleZ) || Number(object.scale) || 1, 0.5, 2),
      isLaunchPodium: object.type === 'podium' && object.isLaunchPodium === true,
    }, communityPropRoot);
  });
}

let builderPreviewRenderer = null;
const BUILDER_PREVIEW_WIDTH = 384;
const BUILDER_PREVIEW_HEIGHT = 222;
const builderPreviewScene = new THREE.Scene();
const builderPreviewCamera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
builderPreviewScene.add(new THREE.HemisphereLight(0xc6edff, 0x111a29, 2.2));
const builderPreviewKey = new THREE.DirectionalLight(0xffffff, 2.4);
builderPreviewKey.position.set(4, 7, 5);
builderPreviewScene.add(builderPreviewKey);

function drawFallbackBuilderPreview(canvas, type) {
  const context = canvas.getContext('2d');
  if (!context) return;
  canvas.width = BUILDER_PREVIEW_WIDTH;
  canvas.height = BUILDER_PREVIEW_HEIGHT;
  context.scale(BUILDER_PREVIEW_WIDTH / 128, BUILDER_PREVIEW_HEIGHT / 74);
  context.clearRect(0, 0, 128, 74);
  context.fillStyle = '#0d1827';
  context.fillRect(0, 0, 128, 74);
  context.strokeStyle = '#64efff';
  context.lineWidth = 3;
  context.shadowColor = '#64efff';
  context.shadowBlur = 8;
  const propType = type.slice(5);
  context.fillStyle = propType === 'podium' ? '#ff8a1d' : '#617d93';
  context.fillRect(37, 38, 54, 23);
  if (propType === 'relay-podium-gate') {
    context.strokeStyle = '#45dfff';
    context.lineWidth = 4;
    context.strokeRect(40, 8, 48, 53);
    context.fillStyle = '#a91f2d';
    context.fillRect(43, 46, 17, 10);
    context.fillRect(68, 46, 17, 10);
  }
  if (propType === 'house') { context.beginPath(); context.moveTo(34, 39); context.lineTo(64, 15); context.lineTo(94, 39); context.closePath(); context.fill(); }
  if (propType === 'tower') context.fillRect(54, 10, 20, 52);
}

function renderBuilderModelToCanvas(canvas, model) {
  const context = canvas.getContext('2d');
  if (!context) throw new Error(`Could not create a 2D preview context for ${model.userData.builderPropType || 'builder object'}.`);
  const bounds = new THREE.Box3().setFromObject(model);
  if (bounds.isEmpty()) throw new Error(`No visible geometry for ${model.userData.builderPropType || 'builder object'} preview.`);
  const size = bounds.getSize(new THREE.Vector3());
  const largest = Math.max(size.x, size.y, size.z, 0.001);
  model.scale.multiplyScalar(4.1 / largest);
  model.updateWorldMatrix(true, true);
  bounds.setFromObject(model);
  model.position.sub(bounds.getCenter(new THREE.Vector3()));
  model.updateWorldMatrix(true, true);
  const fittedBounds = new THREE.Box3().setFromObject(model);
  const radius = Math.max(fittedBounds.getBoundingSphere(new THREE.Sphere()).radius, 0.1);
  const viewDirection = new THREE.Vector3(6, 4.6, 7.2).normalize();
  const distance = radius / Math.sin(THREE.MathUtils.degToRad(builderPreviewCamera.fov / 2)) * 1.16;

  builderPreviewScene.add(model);
  builderPreviewCamera.aspect = BUILDER_PREVIEW_WIDTH / BUILDER_PREVIEW_HEIGHT;
  builderPreviewCamera.near = Math.max(0.01, distance - radius * 1.5);
  builderPreviewCamera.far = distance + radius * 2.5;
  builderPreviewCamera.position.copy(viewDirection).multiplyScalar(distance);
  builderPreviewCamera.lookAt(0, 0, 0);
  builderPreviewCamera.updateProjectionMatrix();
  builderPreviewRenderer.setClearColor(0x000000, 0);
  builderPreviewRenderer.render(builderPreviewScene, builderPreviewCamera);
  canvas.width = BUILDER_PREVIEW_WIDTH;
  canvas.height = BUILDER_PREVIEW_HEIGHT;
  const background = context.createLinearGradient(0, 0, 0, canvas.height);
  background.addColorStop(0, '#152638');
  background.addColorStop(1, '#09131f');
  context.fillStyle = background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.drawImage(builderPreviewRenderer.domElement, 0, 0, canvas.width, canvas.height);
  builderPreviewScene.remove(model);
  disposeBuilderVisual(model);
}

function renderBuilderModelPreviews() {
  const canvases = [...document.querySelectorAll('[data-model-preview]')];
  if (!canvases.length) return;
  try {
    if (!builderPreviewRenderer) {
      builderPreviewRenderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'low-power' });
      builderPreviewRenderer.setPixelRatio(1);
      builderPreviewRenderer.setSize(BUILDER_PREVIEW_WIDTH, BUILDER_PREVIEW_HEIGHT, false);
      builderPreviewRenderer.outputColorSpace = THREE.SRGBColorSpace;
    }
    for (const canvas of canvases) {
      const [, type] = canvas.dataset.modelPreview.split(':');
      let model = null;
      try {
        model = createBuilderPropModel(type);
        renderBuilderModelToCanvas(canvas, model);
      } catch (error) {
        console.error(`Failed to render builder preview for "${type}".`, error);
        if (model) {
          builderPreviewScene.remove(model);
          disposeBuilderVisual(model);
        }
        drawFallbackBuilderPreview(canvas, `prop:${type}`);
      }
    }
  } catch (error) {
    console.error('Failed to initialize the builder preview renderer.', error);
    canvases.forEach((canvas) => drawFallbackBuilderPreview(canvas, canvas.dataset.modelPreview || 'prop:podium'));
  }
}

function loadGateModel(type) {
  if (!gateModelCache.has(type)) {
    const config = gateTypes[type];
    const promise = fetch(config.model, { method: 'HEAD' }).then(async (response) => {
      if (!response.ok) return null;
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
      gateModelLoader ??= new GLTFLoader();
      return new Promise((resolve) => gateModelLoader.load(config.model, (gltf) => {
        const bounds = new THREE.Box3().setFromObject(gltf.scene);
        if (bounds.isEmpty()) {
          resolve(null);
          return;
        }
        const center = bounds.getCenter(new THREE.Vector3());
        const modelScale = config.modelScale ?? importedNeonGateScale;
        const normalized = new THREE.Group();
        normalized.position.set(-center.x * modelScale, -bounds.min.y * modelScale, -center.z * modelScale);
        normalized.scale.setScalar(modelScale);
        normalized.add(gltf.scene);
        normalized.userData.importedGate = true;
        normalized.userData.gateType = type;
        normalized.traverse((node) => {
          if (!node.isMesh) return;
          node.material = new THREE.MeshStandardMaterial({
            color: 0x52eaff,
            emissive: 0x0aa9c4,
            emissiveIntensity: importedNeonGateEmissiveIntensity,
            metalness: 0.24,
            roughness: 0.34,
            toneMapped: false,
            side: THREE.DoubleSide,
          });
          node.userData.isGateLed = true;
        });
        resolve(normalized);
      }, undefined, () => resolve(null)));
    }).catch(() => null);
    gateModelCache.set(type, promise);
  }
  return gateModelCache.get(type);
}

function cloneGateModel(source) {
  const model = source.clone(true);
  model.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry = node.geometry.clone();
    node.material = Array.isArray(node.material) ? node.material.map((material) => material.clone()) : node.material.clone();
    node.castShadow = true; node.receiveShadow = true;
  });
  return model;
}

function createGateModelStatusSign(type, label = 'LOADING GATE MODEL') {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sign = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    toneMapped: false,
  }));
  const openings = gatePassBoundaryOpenings[type] || [];
  const top = openings.reduce((maxY, opening) => Math.max(maxY, opening.centerY + opening.height / 2), 7.3);
  sign.position.set(0, top + 1.2, 0);
  sign.scale.set(7.4, 1.85, 1);
  sign.renderOrder = 11;
  sign.userData.isGateModelStatusSign = true;
  sign.userData.statusCanvas = canvas;
  setGateModelStatusSignText(sign, label);
  return sign;
}

function setGateModelStatusSignText(sign, label) {
  const canvas = sign?.userData.statusCanvas;
  const context = canvas?.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = label === 'GATE MODEL UNAVAILABLE' ? 'rgba(45, 16, 27, 0.94)' : 'rgba(5, 20, 31, 0.94)';
  context.strokeStyle = label === 'GATE MODEL UNAVAILABLE' ? '#ff728b' : '#65eaff';
  context.lineWidth = 6;
  context.beginPath();
  context.roundRect(7, 7, canvas.width - 14, canvas.height - 14, 25);
  context.fill();
  context.stroke();
  context.fillStyle = label === 'GATE MODEL UNAVAILABLE' ? '#ffd2da' : '#dffbff';
  context.textAlign = 'center';
  context.textBaseline = 'middle';
  context.font = '800 31px system-ui, sans-serif';
  context.fillText(label, canvas.width / 2, canvas.height / 2);
  sign.material.map.needsUpdate = true;
}

function disposeGateModelStatusSign(sign) {
  if (!sign) return;
  sign.parent?.remove(sign);
  sign.material.map?.dispose();
  sign.material.dispose();
}

function applyGateLedColor(group, hue = 'cyan') {
  const color = new THREE.Color(colors[hue] ?? colors.cyan);
  const baseIntensity = importedNeonGateEmissiveIntensity * (gateTypes[group.userData.gateType]?.glowMultiplier ?? 1);
  group.traverse((node) => {
    if (!node.isMesh || !node.userData.isGateLed) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      if (!material?.color) return;
      material.color.copy(color);
      material.emissive?.copy(color);
      material.emissiveIntensity = gateGlowIntensityForColor(color, baseIntensity);
    });
  });
}

function builderGateRouteOpeningCount(gate) {
  const type = typeof gate === 'string' ? gate : gate?.type;
  return gatePassBoundaryOpenings[type]?.length || 1;
}

function builderGateOpeningLabel(gate, openingIndex) {
  if (gate?.type === 'neon-ladder') return openingIndex === 1 ? 'Top opening' : 'Bottom opening';
  if (gate?.type === 'neon-dive') return `Entrance ${openingIndex + 1}`;
  return `Opening ${openingIndex + 1}`;
}

function builderGateRouteSlots() {
  return builderGates.flatMap((gate) => {
    const openingCount = builderGateRouteOpeningCount(gate);
    if (openingCount > 1 && (!Array.isArray(gate.entryRouteOrders) || gate.entryRouteOrders.length !== openingCount)) {
      const baseOrder = Number(gate.routeOrder) || 0;
      gate.entryRouteOrders = Array.from({ length: openingCount }, (_, openingIndex) => {
        const direction = gate.entryDirections?.[openingIndex] ?? 1;
        if (direction === 0 || (openingIndex === 0 && gate.isStartFinish) || (baseOrder === 0 && !gate.isStartFinish)) return 0;
        return baseOrder + openingIndex / 100;
      });
      gate.routeOrder = gate.entryRouteOrders[0];
    }
    if (openingCount > 1 && (!Array.isArray(gate.entryStartFinish) || gate.entryStartFinish.length !== openingCount)) {
      gate.entryStartFinish = Array.from({ length: openingCount }, (_, openingIndex) =>
        openingIndex === 0 && gate.isStartFinish === true);
    }
    return Array.from({ length: openingCount }, (_, openingIndex) => {
      const routeOrder = openingCount > 1 ? Number(gate.entryRouteOrders[openingIndex]) || 0 : Number(gate.routeOrder) || 0;
      const direction = gate.entryDirections?.[openingIndex] ?? gate.entryDirection ?? 1;
      const isStartFinish = openingCount > 1
        ? gate.entryStartFinish[openingIndex] === true
        : gate.isStartFinish === true;
      if (direction === 0 && !isStartFinish) {
        if (openingCount > 1) gate.entryRouteOrders[openingIndex] = 0;
        else gate.routeOrder = 0;
      }
      return {
        ...gate,
        gate,
        openingIndex: openingCount > 1 ? openingIndex : null,
        isStartFinish,
        routeOrder: direction === 0 && !isStartFinish
          ? 0
          : routeOrder,
      };
    });
  });
}

function setBuilderGateRouteSlotOrder(slot, routeOrder) {
  if (slot.openingIndex === null) slot.gate.routeOrder = routeOrder;
  else {
    slot.gate.entryRouteOrders[slot.openingIndex] = routeOrder;
    if (slot.openingIndex === 0) slot.gate.routeOrder = routeOrder;
  }
}

function updateBuilderGateBadge(gate, data) {
  if (builderGateRouteOpeningCount(data) > 1) builderGateRouteSlots();
  const previousBadges = gate.userData.gateNumberBadges
    || (gate.userData.gateNumberBadge ? [gate.userData.gateNumberBadge] : []);
  previousBadges.forEach((previous) => {
    gate.remove(previous);
    previous.geometry.dispose();
    previous.material.map?.dispose();
    previous.material.dispose();
  });
  const openings = gate.userData.passBoundaryOpenings || [{ centerY: 7.35, z: 0 }];
  const badges = openings.flatMap((opening, openingIndex) => {
    const { centerX = 0, centerY = 7.35, z = 0, width = 18, height = 14.6, rotationX = 0, rotationY = 0 } = opening;
    const hasMultipleOpenings = builderGateRouteOpeningCount(data) > 1;
    const routeSlot = builderGateRouteSlots().find((slot) => slot.gate.id === data.id
      && slot.openingIndex === (hasMultipleOpenings ? openingIndex : null));
    const isStartFinish = routeSlot?.isStartFinish ?? data.isStartFinish === true;
    const routeOrder = hasMultipleOpenings
      ? Number(data.entryRouteOrders?.[openingIndex]) || 0
      : Number.isSafeInteger(data.routeOrder) ? data.routeOrder : 0;
    const label = isStartFinish ? 'S / F' : routeOrder === 0 ? 'N/A' : String(routeOrder).padStart(2, '0');
    const direction = data.entryDirections?.[openingIndex] ?? data.entryDirection ?? 1;
    const baseRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(rotationX, rotationY, 0));
    const planeNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(baseRotation);
    const badgeWidth = Math.min(10.4, width * 0.72);
    const badgeHeight = Math.min(5.2, height * 0.64);
    return [['front', 1], ['back', -1]].map(([side, sideDirection]) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 280;
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const badge = new THREE.Mesh(new THREE.PlaneGeometry(badgeWidth, badgeHeight), new THREE.MeshBasicMaterial({
        map: texture,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }));
      const isEntrySide = direction !== 0 && (sideDirection > 0 ? direction === 1 : direction === -1);
      badge.userData.badgeCanvas = canvas;
      drawRelayPodiumGateNumberBadge(badge, direction === 0 ? 'N/A' : label, isEntrySide);
      badge.position.set(centerX, centerY, z).addScaledVector(planeNormal, sideDirection * 0.24);
      badge.quaternion.copy(baseRotation);
      if (sideDirection < 0) badge.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI));
      badge.renderOrder = 10;
      badge.userData.isBuilderGateBadge = true;
      badge.userData.gateBadgeOpeningIndex = openingIndex;
      badge.userData.badgeSide = side;
      badge.userData.displayLabel = direction === 0 ? 'N/A' : label;
      badge.userData.isEntrySide = isEntrySide;
      badge.visible = currentPage === 'builder' && !flying && direction !== 0;
      gate.add(badge);
      return badge;
    });
  });
  gate.userData.gateNumberBadges = badges;
  gate.userData.gateNumberBadge = badges[0] || null;
  updateBuilderGateBadgeVisibility(gate);
}

function updateBuilderGateBadgeVisibility(gate) {
  const data = gate.userData.gateData;
  const badges = gate.userData.gateNumberBadges || [];
  badges.forEach((badge, index) => {
    const openingIndex = badge.userData.gateBadgeOpeningIndex ?? index;
    const direction = data?.entryDirections?.[openingIndex] ?? data?.entryDirection ?? 1;
    const hasMultipleOpenings = builderGateRouteOpeningCount(data) > 1;
    const routeSlot = builderGateRouteSlots().find((slot) => slot.gate.id === data?.id
      && slot.openingIndex === (hasMultipleOpenings ? openingIndex : null));
    const routeOrder = hasMultipleOpenings
      ? Number(data?.entryRouteOrders?.[openingIndex]) || 0
      : Number.isSafeInteger(data?.routeOrder) ? data.routeOrder : 0;
    const isStartFinish = routeSlot?.isStartFinish ?? (data?.isStartFinish === true);
    const label = isStartFinish
      ? 'S / F'
      : routeOrder === 0 ? 'N/A' : String(routeOrder).padStart(2, '0');
    const displayLabel = direction === 0 ? 'N/A' : label;
    const isEntrySide = direction !== 0 && (badge.userData.badgeSide === 'front' ? direction === 1 : direction === -1);
    if (badge.userData.displayLabel !== displayLabel || badge.userData.isEntrySide !== isEntrySide) {
      drawRelayPodiumGateNumberBadge(badge, displayLabel, isEntrySide);
      badge.userData.displayLabel = displayLabel;
      badge.userData.isEntrySide = isEntrySide;
    }
    badge.visible = currentPage === 'builder' && !flying && direction !== 0;
  });
}

function createBuilderGate(data) {
  const gate = new THREE.Group();
  gate.userData.isBuilderGate = true;
  gate.userData.gateId = data.id;
  gate.userData.gateType = data.type;
  gate.userData.gateData = data;
  createGatePassBoundary(gate, data);
  gate.position.set(data.x, data.y, data.z);
  gate.rotation.set(
    THREE.MathUtils.degToRad(data.rotationX || 0),
    THREE.MathUtils.degToRad(data.rotation || 0),
    THREE.MathUtils.degToRad(data.rotationZ || 0),
  );
  gate.scale.set(data.scaleX ?? data.scale ?? 1, data.scaleY ?? data.scale ?? 1, data.scaleZ ?? data.scale ?? 1);
  gate.visible = currentPage === 'builder';
  gate.userData.gateModelStatusSign = createGateModelStatusSign(data.type);
  gate.add(gate.userData.gateModelStatusSign);
  updateBuilderGateBadge(gate, data);
  gateRoot.add(gate);
  loadGateModel(data.type).then((source) => {
    if (gate.parent !== gateRoot) return;
    if (!source) {
      setGateModelStatusSignText(gate.userData.gateModelStatusSign, 'GATE MODEL UNAVAILABLE');
      return;
    }
    disposeGateModelStatusSign(gate.userData.gateModelStatusSign);
    gate.userData.gateModelStatusSign = null;
    const model = cloneGateModel(source);
    applyGateLedColor(model, data.color);
    gate.add(model);
    gate.userData.loadedModel = true;
  });
  return gate;
}

const biomes = {
  'neon-docks': { name: 'Sky Platform', region: 'SKY PLATFORM', description: 'A grass flight deck beneath a field of stars', colors: ['cyan', 'coral', 'lime', 'violet'], sky: '#030714', ground: 'grass' },
};
const environmentLightProfiles = {
  'neon-docks': { skyFill: 0x465873, groundFill: 0x0c1219, moon: 0x8298c2, accent: 0x55c7df, fog: 0x0b1420, ambient: 0.26, moonIntensity: 0.38, fillIntensity: 0.11, environment: 0.08, exposure: 0.9 },
};
const trackCatalog = standardRaceTracks;
const soloTrackLeaderboardStorageKey = 'aerframe-solo-track-leaderboards';
let soloTrackLeaderboardData = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(soloTrackLeaderboardStorageKey) || '{}');
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return {};
    const cleaned = Object.fromEntries(Object.entries(saved).filter(([trackKey]) => !trackKey.endsWith(':guest')).map(([trackKey, runs]) => [
      trackKey,
      (Array.isArray(runs) ? runs : [])
        .filter((run) => run && Number.isFinite(run.timeMs) && run.timeMs > 0 && run.timeMs <= 24 * 60 * 60 * 1000)
        .map((run) => ({
          username: typeof run.username === 'string' ? run.username.slice(0, 24) : 'YOU',
          timeMs: Math.round(run.timeMs),
          completedAt: Number.isFinite(run.completedAt) ? run.completedAt : 0,
        }))
        .filter((run) => run.username !== 'YOU' && run.username !== 'Guest Pilot')
        .sort((a, b) => a.timeMs - b.timeMs || a.completedAt - b.completedAt)
        .slice(0, 10),
    ]));
    try { localStorage.setItem(soloTrackLeaderboardStorageKey, JSON.stringify(cleaned)); } catch { /* Keep guest entries out of this session if storage is unavailable. */ }
    return cleaned;
  } catch {
    return {};
  }
})();
let publishedCommunityTracks = [];
const communityFavoritesStorageKey = 'aerframe-community-favorites';
let communityFavoriteTrackIds = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(communityFavoritesStorageKey) || '[]');
    return new Set(Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : []);
  } catch {
    return new Set();
  }
})();
let communityTrackTab = 'all';

function saveCommunityFavorites() {
  try { localStorage.setItem(communityFavoritesStorageKey, JSON.stringify([...communityFavoriteTrackIds])); } catch { /* Favorites remain available for this session. */ }
}

function allCommunityTracks() {
  return [...publishedCommunityTracks].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0));
}

async function refreshCommunityTracks() {
  try {
    const response = await fetch('/api/community-tracks', { credentials: 'same-origin' });
    if (!response.ok) return;
    const result = await response.json();
    publishedCommunityTracks = (Array.isArray(result.tracks) ? result.tracks : []).flatMap((track) => {
      const environmentId = trackEnvironmentId(track);
      if (!environmentId || !Array.isArray(track.points) || !track.imageDataUrl) return [];
      const gameMode = Object.hasOwn(builderGameModeLabels, track.gameMode) ? track.gameMode : '4v4';
      return [{ ...track, gameMode, biomeId: environmentId, environmentId, biomeName: biomes[environmentId].name }];
    });
    publishedCommunityTracks.forEach((track) => {
      if (!trackCatalog[track.biomeId].some((candidate) => candidate.id === track.id)) trackCatalog[track.biomeId].unshift(track);
    });
    const savedTrackId = readStored('aerframe-selected-tracks', {})[activeBiome];
    if (savedTrackId && activeTrack?.id !== savedTrackId && trackCatalog[activeBiome].some((track) => track.id === savedTrackId)) {
      applyTrackSelection(savedTrackId, false);
    }
    if (currentPage === 'communityTracks') renderCommunityTrackPicker();
    renderServerTrackChoices();
  } catch { /* Keep uploads already loaded in this session if the community service goes offline. */ }
}

function trackEnvironmentId(track, fallbackId = null) {
  const postedEnvironment = track?.environment && typeof track.environment === 'object'
    ? track.environment.id || track.environment.biomeId
    : track?.environment;
  const candidates = [track?.environmentId, postedEnvironment, track?.biomeId];
  for (const candidate of candidates) {
    if (biomes[candidate]) return candidate;
    const byName = Object.entries(biomes).find(([, biome]) => biome.name.toLowerCase() === String(candidate || '').toLowerCase());
    if (byName) return byName[0];
  }
  return biomes[fallbackId] ? fallbackId : null;
}

function loadTrackWithEnvironment(track, persist = true) {
  const environmentId = trackEnvironmentId(track);
  if (!track || !environmentId) return false;
  const loadedBiome = safeApplyBiome(environmentId, persist);
  if (loadedBiome?.id !== environmentId) return false;
  if (!trackCatalog[environmentId].some((candidate) => candidate.id === track.id)) trackCatalog[environmentId].unshift(track);
  applyTrackSelection(track.id, persist);
  return true;
}

function trackGameMode(track) {
  return Object.hasOwn(builderGameModeLabels, track?.gameMode) ? track.gameMode : '4v4';
}

function trackSupportsMultiplayerMode(track, mode) {
  const requestedMode = mode === 'competitive-4v4' ? '4v4' : mode;
  return trackGameMode(track) === requestedMode;
}

function isCommunityTrack(track) {
  return typeof track?.id === 'string' && track.id.startsWith('community-');
}

function trackSourceFor(track) {
  return isCommunityTrack(track) ? 'community' : 'game';
}

function allTrackChoices() {
  return Object.entries(trackCatalog).filter(([biomeId]) => biomes[biomeId]).flatMap(([biomeId, tracks]) => tracks.map((track) => ({
    ...track,
    biomeId,
    environmentId: biomeId,
    biomeName: biomes[biomeId].name,
  })));
}

function compatibleTrackForMode(mode) {
  const choices = allTrackChoices().filter((track) => trackSupportsMultiplayerMode(track, mode));
  return choices.find((track) => track.biomeId === activeBiome && track.id === activeTrack?.id) || choices[0] || null;
}

function missingModeTrackMessage(mode) {
  const label = multiplayerModes[mode] || mode;
  return 'No ' + label + ' tracks are available yet. Build and publish a ' + label + ' track in Track Builder before queuing.';
}

function prepareTrackForMode(mode) {
  const track = compatibleTrackForMode(mode);
  if (!track) {
    setLobbyMessage(missingModeTrackMessage(mode), true);
    return null;
  }
  if (activeBiome !== track.biomeId || activeTrack?.id !== track.id) loadTrackWithEnvironment(track);
  return { track, trackSource: trackSourceFor(track) };
}

function renderCommunityTrackPicker() {
  const list = document.querySelector('#communityTrackGrid');
  if (!list) return;
  list.replaceChildren();
  const allTab = document.querySelector('#communityAllTracksTab');
  const favoritesTab = document.querySelector('#communityFavoriteTracksTab');
  const search = document.querySelector('#communityTrackSearch').value.trim().toLocaleLowerCase();
  const environment = document.querySelector('#communityTrackEnvironment').value;
  const selectedMode = document.querySelector('#communityTrackMode').value;
  const tracks = allCommunityTracks();
  const favoritesCount = tracks.filter((track) => communityFavoriteTrackIds.has(track.id)).length;
  const visibleTracks = tracks.filter((track) => {
    const mode = trackGameMode(track);
    const environmentId = trackEnvironmentId(track);
    const searchable = `${track.name || ''} ${biomes[environmentId]?.name || ''} ${track.ownerName || ''} ${builderGameModeLabels[mode] || mode}`.toLocaleLowerCase();
    return (communityTrackTab !== 'favorites' || communityFavoriteTrackIds.has(track.id))
      && (!search || searchable.includes(search))
      && (environment === 'all' || environmentId === environment)
      && (selectedMode === 'all' || mode === selectedMode);
  });
  allTab.classList.toggle('is-active', communityTrackTab === 'all');
  allTab.setAttribute('aria-selected', String(communityTrackTab === 'all'));
  favoritesTab.classList.toggle('is-active', communityTrackTab === 'favorites');
  favoritesTab.setAttribute('aria-selected', String(communityTrackTab === 'favorites'));
  document.querySelector('#communityFavoriteCount').textContent = String(favoritesCount);
  document.querySelector('#communityTrackCount').textContent = communityTrackTab === 'all'
    ? `${String(visibleTracks.length).padStart(2, '0')} COURSES`
    : `${String(visibleTracks.length).padStart(2, '0')} FAVORITES`;
  const empty = document.querySelector('#communityTrackEmpty');
  empty.hidden = visibleTracks.length > 0;
  empty.textContent = tracks.length === 0
    ? 'No community tracks are available yet.'
    : communityTrackTab === 'favorites' && !tracks.some((track) => communityFavoriteTrackIds.has(track.id))
      ? 'No favorites yet. Star a track to save it here.'
      : 'No community tracks match these filters.';
  visibleTracks.forEach((track) => {
    const environmentId = trackEnvironmentId(track);
    const mode = trackGameMode(track);
    const card = document.createElement('article');
    const current = activeBiome === environmentId && activeTrack?.id === track.id;
    card.className = `community-track-card${track.imageDataUrl ? ' has-upload-image' : ''}${current ? ' is-current' : ''}`;
    const select = document.createElement('button');
    select.type = 'button';
    select.className = 'community-track-select';
    select.setAttribute('aria-label', `Select ${track.name || 'community track'} in ${biomes[environmentId]?.name || 'unknown environment'}`);
    const art = document.createElement('span');
    art.className = `community-track-art community-track-art-${environmentId}${track.imageDataUrl ? ' community-track-art-has-image' : ''}`;
    art.setAttribute('aria-hidden', 'true');
    if (track.imageDataUrl) {
      const image = document.createElement('img');
      image.className = 'community-track-upload-image';
      image.src = track.imageDataUrl;
      image.alt = '';
      image.loading = 'lazy';
      art.append(image);
    } else {
      const route = document.createElement('span');
      route.className = 'community-track-art-route';
      [1, 2, 3, 4].forEach((index) => {
        const gate = document.createElement('i');
        gate.className = `community-track-gate community-track-gate-${index}`;
        route.append(gate);
      });
      art.append(route);
    }
    const details = document.createElement('span');
    details.className = 'community-track-details';
    const title = document.createElement('strong');
    title.textContent = track.name || 'Community track';
    const trackMode = document.createElement('small');
    trackMode.className = 'community-track-mode';
    trackMode.textContent = builderGameModeLabels[mode] || mode;
    const metadata = document.createElement('small');
    const pointCount = Array.isArray(track.points) ? track.points.length : 0;
    metadata.textContent = `${biomes[environmentId]?.name || 'Unknown environment'} · ${pointCount} checkpoints${track.ownerName ? ` · ${track.ownerName}` : ''}`;
    details.append(title, trackMode, metadata);
    if (track.createdAt) {
      const uploadedDate = document.createElement('small');
      uploadedDate.className = 'community-track-upload-date';
      const created = new Date(track.createdAt);
      uploadedDate.textContent = Number.isNaN(created.getTime()) ? '' : `UPLOADED ${created.toLocaleDateString()}`;
      if (uploadedDate.textContent) details.append(uploadedDate);
    }
    const arrow = document.createElement('span');
    arrow.className = 'community-track-arrow';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '›';
    select.append(art, details, arrow);
    select.addEventListener('click', () => {
      if (!loadTrackWithEnvironment(track)) {
        showToast('This community track could not be loaded.');
        return;
      }
      setPage('trackPicker');
      showToast(`${track.name || 'Community track'} selected.`);
    });
    const favorite = document.createElement('button');
    const isFavorite = communityFavoriteTrackIds.has(track.id);
    favorite.type = 'button';
    favorite.className = 'community-track-favorite';
    favorite.classList.toggle('is-favorite', isFavorite);
    favorite.setAttribute('aria-pressed', String(isFavorite));
    favorite.setAttribute('aria-label', `${isFavorite ? 'Remove' : 'Add'} ${track.name || 'track'} ${isFavorite ? 'from' : 'to'} favorites`);
    favorite.title = isFavorite ? 'Remove from favorites' : 'Add to favorites';
    favorite.textContent = isFavorite ? '★' : '☆';
    favorite.addEventListener('click', () => {
      if (communityFavoriteTrackIds.has(track.id)) communityFavoriteTrackIds.delete(track.id);
      else communityFavoriteTrackIds.add(track.id);
      saveCommunityFavorites();
      renderCommunityTrackPicker();
    });
    card.append(select, favorite);
    list.append(card);
  });
}

document.querySelector('#communityAllTracksTab').addEventListener('click', () => {
  communityTrackTab = 'all';
  renderCommunityTrackPicker();
});
document.querySelector('#communityFavoriteTracksTab').addEventListener('click', () => {
  communityTrackTab = 'favorites';
  renderCommunityTrackPicker();
});
['#communityTrackSearch', '#communityTrackEnvironment', '#communityTrackMode'].forEach((selector) => {
  const eventName = selector === '#communityTrackSearch' ? 'input' : 'change';
  document.querySelector(selector).addEventListener(eventName, renderCommunityTrackPicker);
});

let defaultGateObjects = [];
let activeBiome = 'neon-docks';
let builtBiomeId = null;
let activeTrack = null;
let trackGateEntries = [];
let repeatCourseIndicators = [];
let routeProgress = 0;
let flightCourseLapCount = 1;
let showDroneBaseY = 8.2;
let environmentState = { time: 14, fogDistance: 560, weather: 'clear', brightness: 1 };

function updateTrackPickerPreview() {
  const name = document.querySelector('#trackPreviewName');
  const gateCount = document.querySelector('#trackPreviewGateCount');
  const canvas = document.querySelector('#trackPreviewCanvas');
  const track = activeTrack;
  const storedPoints = Array.isArray(track?.points)
    ? track.points.map((point) => [Number(point[0]) || 0, Number(point[2]) || 0])
    : [];
  const savedStartIndex = Number(track?.startFinishIndex);
  const startIndex = Number.isSafeInteger(savedStartIndex) && savedStartIndex >= 0 && savedStartIndex < storedPoints.length ? savedStartIndex : 0;
  const routeIndices = storedPoints.map((_, index) => index).filter((index) => index !== startIndex);
  const points = storedPoints.length ? [storedPoints[startIndex], ...routeIndices.map((index) => storedPoints[index])] : [];

  if (name) name.textContent = track?.name || 'No track selected';
  if (gateCount) gateCount.textContent = track ? `${points.length} GATES / ${Math.max(1, Number(track.laps) || 1)} ${Number(track.laps) === 1 || !track.laps ? 'LAP' : 'LAPS'}` : 'NO ROUTE AVAILABLE';
  const tracks = trackCatalog[activeBiome] || [];
  const trackIndex = tracks.findIndex((candidate) => candidate.id === track?.id);
  const trackMark = document.querySelector('#trackPickerMark');
  if (trackMark) trackMark.innerHTML = `${trackIndex >= 0 ? String(trackIndex + 1).padStart(2, '0') : '00'} <i>/ ${String(tracks.length).padStart(2, '0')}</i>`;
  const emptyMessage = document.querySelector('#trackPickerEmptyMessage');
  if (emptyMessage) emptyMessage.hidden = Boolean(track);
  const startButton = document.querySelector('#trackPickerDone');
  if (startButton) startButton.disabled = !track;
  const leaderboardButton = document.querySelector('#trackLeaderboardButton');
  if (leaderboardButton) leaderboardButton.disabled = !track;
  const trackSelect = document.querySelector('#trackSelect');
  if (trackSelect) trackSelect.disabled = !tracks.length;
  if (!canvas) return;
  const environmentLabel = currentPage === 'trackPicker' ? 'Sky Platform' : (biomes[activeBiome]?.name || 'Flight');
  canvas.setAttribute('aria-label', `${environmentLabel} environment, ${track?.name || 'no track selected'}, ${points.length} gates`);

  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) return;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const canvasWidth = Math.round(bounds.width * pixelRatio);
  const canvasHeight = Math.round(bounds.height * pixelRatio);
  if (canvas.width !== canvasWidth || canvas.height !== canvasHeight) {
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
  }

  const context = canvas.getContext('2d');
  if (!context) return;
  context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  context.clearRect(0, 0, bounds.width, bounds.height);
  if (points.length < 2) return;

  const padding = Math.max(13, Math.min(bounds.width, bounds.height) * 0.14);
  const minX = Math.min(...points.map(([x]) => x));
  const maxX = Math.max(...points.map(([x]) => x));
  const minZ = Math.min(...points.map(([, z]) => z));
  const maxZ = Math.max(...points.map(([, z]) => z));
  const spanX = Math.max(1, maxX - minX);
  const spanZ = Math.max(1, maxZ - minZ);
  const scale = Math.min((bounds.width - padding * 2) / spanX, (bounds.height - padding * 2) / spanZ);
  const offsetX = (bounds.width - spanX * scale) / 2;
  const offsetY = (bounds.height - spanZ * scale) / 2;
  const route = points.map(([x, z]) => ({
    x: offsetX + (x - minX) * scale,
    y: bounds.height - offsetY - (z - minZ) * scale,
  }));
  const accentName = biomes[activeBiome]?.colors?.[1];
  const accentHex = colors[accentName];
  const accent = typeof accentHex === 'number' ? `#${accentHex.toString(16).padStart(6, '0')}` : '#56e8ff';

  context.beginPath();
  route.forEach((point, index) => {
    if (index === 0) context.moveTo(point.x, point.y);
    else context.lineTo(point.x, point.y);
  });
  context.lineJoin = 'round';
  context.lineCap = 'round';
  context.strokeStyle = accent;
  context.lineWidth = 2.5;
  context.shadowColor = accent;
  context.shadowBlur = 8;
  context.stroke();
  context.shadowBlur = 0;

  route.forEach((point, index) => {
    const isStart = index === 0;
    const radius = isStart ? 5.5 : 3.5;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fillStyle = isStart ? '#75f1c2' : '#f2fbff';
    context.fill();
    context.lineWidth = 1.5;
    context.strokeStyle = '#071321';
    context.stroke();
  });

  context.font = '700 7px ui-monospace, SFMono-Regular, Consolas, monospace';
  context.textBaseline = 'middle';
  context.lineWidth = 2.5;
  context.strokeStyle = 'rgba(5,15,27,.9)';
  context.fillStyle = '#eafaff';
  route.forEach((point, index) => {
    const label = index === 0 ? 'S/F' : String(index).padStart(2, '0');
    context.textAlign = point.x > bounds.width * 0.68 ? 'right' : 'left';
    const labelOffset = context.textAlign === 'right' ? -7 : 7;
    const labelY = point.y > bounds.height * 0.7 ? point.y - 8 : point.y + 8;
    context.strokeText(label, point.x + labelOffset, labelY);
    context.fillText(label, point.x + labelOffset, labelY);
  });
}

function createCommunityTrackFlightGate(data) {
  const gate = new THREE.Group();
  gate.userData.isCommunityTrackGate = true;
  gate.userData.gateId = data.id;
  gate.userData.gateType = data.type;
  gate.userData.gateData = data;
  gate.position.set(data.x, data.y, data.z);
  gate.rotation.set(
    THREE.MathUtils.degToRad(data.rotationX || 0),
    THREE.MathUtils.degToRad(data.rotation || 0),
    THREE.MathUtils.degToRad(data.rotationZ || 0),
  );
  gate.scale.set(data.scaleX ?? data.scale ?? 1, data.scaleY ?? data.scale ?? 1, data.scaleZ ?? data.scale ?? 1);
  createGatePassBoundary(gate, data);

  const statusSign = createGateModelStatusSign(data.type);
  gate.add(statusSign);
  trackRoot.add(gate);
  loadGateModel(data.type).then((source) => {
    if (gate.parent !== trackRoot) return;
    if (!source) {
      setGateModelStatusSignText(statusSign, 'GATE MODEL UNAVAILABLE');
      return;
    }
    disposeGateModelStatusSign(statusSign);
    const model = cloneGateModel(source);
    applyGateLedColor(model, data.color);
    gate.add(model);
    gate.userData.loadedModel = true;
  });
  return gate;
}

function applyTrackSelection(trackId, persist = true) {
  const tracks = trackCatalog[activeBiome] || [];
  const saved = readStored('aerframe-selected-tracks', {});
  activeTrack = tracks.find((track) => track.id === trackId)
    || tracks.find((track) => track.id === saved[activeBiome])
    || tracks[0]
    || null;
  if (!activeTrack) {
    clearRepeatCourseIndicators();
    clearChildren(trackRoot);
    clearCommunityTrackProps();
    trackGateEntries = [];
    generatedTrackLaunchPodium = null;
    launchPadState = null;
    raceTimerEnabled = false;
    raceTimerStartedAt = 0;
    raceTimerFinishedAt = 0;
    const select = document.querySelector('#trackSelect');
    select.replaceChildren(new Option('No tracks available', ''));
    select.value = '';
    updateTrackPickerPreview();
    return;
  }
  loadCommunityTrackProps(activeTrack);
  const select = document.querySelector('#trackSelect');
  select.replaceChildren(...tracks.map((track) => {
    const option = document.createElement('option');
    option.value = track.id;
    option.textContent = track.name;
    return option;
  }));
  select.value = activeTrack.id;
  updateTrackPickerPreview();
  if (persist) {
    saved[activeBiome] = activeTrack.id;
    try { localStorage.setItem('aerframe-selected-tracks', JSON.stringify(saved)); } catch { /* Storage is optional. */ }
  }

  clearChildren(trackRoot);
  generatedTrackLaunchPodium = null;
  launchPadState = null;
  const trackSpread = activeTrack.id.startsWith('community-') ? 1 : 1.7;
  const expandedPoints = activeTrack.points.map(([x, y, z]) => [x * trackSpread, y, z * trackSpread]);
  const requestedStartIndex = Number(activeTrack.startFinishIndex);
  const startFinishIndex = Number.isSafeInteger(requestedStartIndex) && requestedStartIndex >= 0 && requestedStartIndex < expandedPoints.length ? requestedStartIndex : 0;
  const routePointIndices = [startFinishIndex, ...expandedPoints.map((_, index) => index).filter((index) => index !== startFinishIndex)];
  const savedRotations = Array.isArray(activeTrack.gateRotations) ? activeTrack.gateRotations : [];
  const savedRotationsX = Array.isArray(activeTrack.gateRotationsX) ? activeTrack.gateRotationsX : [];
  const savedRotationsZ = Array.isArray(activeTrack.gateRotationsZ) ? activeTrack.gateRotationsZ : [];
  const savedScales = Array.isArray(activeTrack.gateScales) ? activeTrack.gateScales : [];
  const savedScalesX = Array.isArray(activeTrack.gateScalesX) ? activeTrack.gateScalesX : [];
  const savedScalesY = Array.isArray(activeTrack.gateScalesY) ? activeTrack.gateScalesY : [];
  const savedScalesZ = Array.isArray(activeTrack.gateScalesZ) ? activeTrack.gateScalesZ : [];
  const savedGateTypes = Array.isArray(activeTrack.gateTypes) ? activeTrack.gateTypes : [];
  const savedGateColors = Array.isArray(activeTrack.gateColors) ? activeTrack.gateColors : [];
  const savedGateIds = Array.isArray(activeTrack.gateIds) ? activeTrack.gateIds : [];
  const savedGateOpeningIndices = Array.isArray(activeTrack.gateOpeningIndices) ? activeTrack.gateOpeningIndices : [];
  const savedEntryDirections = Array.isArray(activeTrack.gateEntryDirections) ? activeTrack.gateEntryDirections : [];
  const hasSavedGateModels = activeTrack.id.startsWith('community-')
    && savedGateTypes.length === expandedPoints.length
    && savedGateTypes.every((type) => gateTypes[type]?.raceAsset);
  const communityGateObjects = new Map();

  const communityGateKey = (pointIndex) => {
    const id = savedGateIds.length === expandedPoints.length ? savedGateIds[pointIndex] : '';
    return id ? `${savedGateTypes[pointIndex]}:${id}` : `${savedGateTypes[pointIndex]}:point-${pointIndex}`;
  };
  const communityEntryDirections = (pointIndex) => {
    const type = savedGateTypes[pointIndex];
    const openingCount = gatePassBoundaryOpenings[type]?.length || 1;
    const entryDirections = Array(openingCount).fill(1);
    const id = savedGateIds.length === expandedPoints.length ? savedGateIds[pointIndex] : null;
    for (let index = 0; index < expandedPoints.length; index += 1) {
      const sameGate = id ? savedGateIds[index] === id : index === pointIndex;
      if (!sameGate || savedGateTypes[index] !== type) continue;
      const openingIndex = Number(savedGateOpeningIndices[index] ?? -1);
      const rawDirections = savedEntryDirections[index];
      const values = Array.isArray(rawDirections) ? rawDirections : [rawDirections];
      const normalizeDirection = (direction) => direction === 0 ? 0 : direction === -1 ? -1 : 1;
      if (openingIndex >= 0 && openingIndex < openingCount) {
        entryDirections[openingIndex] = normalizeDirection(values[0]);
      } else if (values.length === openingCount) {
        values.forEach((direction, directionIndex) => { entryDirections[directionIndex] = normalizeDirection(direction); });
      } else if (openingCount === 1 && values.length) {
        entryDirections[0] = normalizeDirection(values[0]);
      }
    }
    return entryDirections;
  };

  trackGateEntries = routePointIndices.map((pointIndex, routeIndex) => {
    const point = expandedPoints[pointIndex];
    const isStartFinish = routeIndex === 0;
    const previousIndex = isStartFinish
      ? routePointIndices[1]
      : routePointIndices[routeIndex - 1];
    const previous = expandedPoints[previousIndex] || point;
    const direction = isStartFinish ? -1 : 1;
    const towardPrevious = new THREE.Vector3((previous[0] - point[0]) * direction, 0, (previous[2] - point[2]) * direction);
    if (towardPrevious.lengthSq() < 0.001) towardPrevious.set(0, 0, 1);
    towardPrevious.normalize();
    const hasSavedRotation = Number.isFinite(Number(savedRotations[pointIndex]));
    const yaw = hasSavedRotation ? THREE.MathUtils.degToRad(Number(savedRotations[pointIndex])) : Math.atan2(towardPrevious.x, towardPrevious.z);
    const hue = isStartFinish ? 'orange' : biomes[activeBiome].colors[routeIndex % biomes[activeBiome].colors.length];
    const savedGateType = hasSavedGateModels ? savedGateTypes[pointIndex] : null;
    const savedOpeningIndex = Number(savedGateOpeningIndices[pointIndex] ?? -1);
    let gate;
    if (savedGateType) {
      const key = communityGateKey(pointIndex);
      gate = communityGateObjects.get(key);
      if (!gate) {
        const scaleValue = (axisValues, axisIndex) => {
          const value = Number(axisValues[axisIndex] ?? savedScales[axisIndex] ?? 1);
          return THREE.MathUtils.clamp(Number.isFinite(value) ? value : 1, 0.5, 2);
        };
        const gateData = {
          id: savedGateIds.length === expandedPoints.length ? savedGateIds[pointIndex] : `community-gate-${pointIndex}`,
          type: savedGateType,
          x: point[0],
          y: point[1] - builderGateFlightCenterY,
          z: point[2],
          rotation: hasSavedRotation ? Number(savedRotations[pointIndex]) : THREE.MathUtils.radToDeg(yaw),
          rotationX: Number(savedRotationsX[pointIndex]) || 0,
          rotationZ: Number(savedRotationsZ[pointIndex]) || 0,
          scale: THREE.MathUtils.clamp(Number(savedScales[pointIndex]) || 1, 0.5, 2),
          scaleX: scaleValue(savedScalesX, pointIndex),
          scaleY: scaleValue(savedScalesY, pointIndex),
          scaleZ: scaleValue(savedScalesZ, pointIndex),
          color: savedGateColors[pointIndex] || hue,
          entryDirections: communityEntryDirections(pointIndex),
        };
        gateData.entryDirection = gateData.entryDirections[0] ?? 1;
        gate = createCommunityTrackFlightGate(gateData);
        communityGateObjects.set(key, gate);
      }
    } else {
      gate = addGate(point[0], point[1], point[2], hue, 2.35, yaw, false, trackRoot);
      gate.rotation.x = THREE.MathUtils.degToRad(Number(savedRotationsX[pointIndex]) || 0);
      gate.rotation.z = THREE.MathUtils.degToRad(Number(savedRotationsZ[pointIndex]) || 0);
    }
    const directions = savedEntryDirections[pointIndex];
    const entryDirections = Array.isArray(directions)
      ? directions.map((direction) => direction === 0 ? 0 : direction === -1 ? -1 : 1)
      : [directions === 0 ? 0 : directions === -1 ? -1 : 1];
    if (!savedGateType) {
      gate.userData.gateData = { entryDirections, entryDirection: entryDirections[0] };
      gate.scale.set(
        THREE.MathUtils.clamp(Number(savedScalesX[pointIndex] ?? savedScales[pointIndex]) || 1, 0.5, 2),
        THREE.MathUtils.clamp(Number(savedScalesY[pointIndex] ?? savedScales[pointIndex]) || 1, 0.5, 2),
        THREE.MathUtils.clamp(Number(savedScalesZ[pointIndex] ?? savedScales[pointIndex]) || 1, 0.5, 2),
      );
    }
    const indicator = createGateIndicator(gate);
    if (savedGateType) {
      const requestedOpeningIndex = savedOpeningIndex >= 0 ? savedOpeningIndex : 0;
      const plane = gate.userData.gatePassPlanes?.[requestedOpeningIndex] || gate.userData.gatePassPlanes?.[0];
      if (plane) {
        indicator.position.copy(plane.point);
        indicator.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), plane.normal);
      } else {
        indicator.position.y = builderGateFlightCenterY;
      }
    }
    const routeNumber = isStartFinish ? 0 : routeIndex;
    if (!savedGateType) updateBuilderGateBadge(gate, { isStartFinish, routeOrder: routeNumber });
    const role = isStartFinish ? 'START / FINISH' : `GATE ${routeNumber}`;
    if (!gate.userData.isCommunityTrackGate) {
      gate.userData.trackGateIndex = routeIndex;
      gate.userData.trackGateRole = role;
    }
    const entry = makeFlightGateEntry(gate, role, 2.05, indicator, 0, routeNumber, isStartFinish);
    entry.planeIndex = savedGateType && savedOpeningIndex >= 0 ? savedOpeningIndex : null;
    return entry;
  });
  trackRoot.visible = flying || currentPage === 'trackPicker';
  if (currentPage === 'trackPicker') setTrackOverviewCamera();
  updateCourseProgress(0);
}

function defaultEnvironment() {
  return { time: 22, fogDistance: 560, weather: 'clear', brightness: 1 };
}

function readBiomeEnvironment(biomeId) {
  const saved = readStored(`aerframe-environment-${biomeId}`, defaultEnvironment(biomeId));
  return {
    time: THREE.MathUtils.clamp(Number(saved.time) || 0, 0, 23),
    fogDistance: THREE.MathUtils.clamp(Number(saved.fogDistance) || 560, 100, 800),
    weather: ['clear', 'mist', 'dust'].includes(saved.weather) ? saved.weather : 'clear',
    brightness: THREE.MathUtils.clamp(Number(saved.brightness) || 1, 0.5, 1.5),
  };
}

function readBuilderBiomeEnvironment(biomeId) {
  const saved = readStored(`aerframe-builder-environment-${biomeId}`, readBiomeEnvironment(biomeId));
  return {
    time: THREE.MathUtils.clamp(Number(saved.time) || 0, 0, 23),
    fogDistance: THREE.MathUtils.clamp(Number(saved.fogDistance) || 560, 100, 800),
    weather: ['clear', 'mist', 'dust'].includes(saved.weather) ? saved.weather : 'clear',
    brightness: THREE.MathUtils.clamp(Number(saved.brightness) || 1, 0.5, 1.5),
  };
}

function saveBiomeEnvironment() {
  try { localStorage.setItem(`aerframe-environment-${activeBiome}`, JSON.stringify(environmentState)); } catch { /* Storage is optional. */ }
}

function saveBuilderBiomeEnvironment() {
  try { localStorage.setItem(`aerframe-builder-environment-${activeBiome}`, JSON.stringify(environmentState)); } catch { /* Storage is optional. */ }
}

function getEnvironmentDaylight() {
  const visualTime = currentPage === 'builder' ? environmentState.time : 22;
  const sun = Math.max(0, Math.sin(((visualTime - 6) / 12) * Math.PI));
  return Math.pow(sun, 0.72) * 0.18;
}

function updateWorldLightBalance(day = getEnvironmentDaylight()) {
  const menuScene = !flying && currentPage !== 'builder';
  const brightness = environmentState.brightness;
  const communityTrackFlight = flying && currentPage !== 'builder' && isCommunityTrack(activeTrack);
  const flightVisibilityBoost = communityTrackFlight ? 1.6 : 1;
  const worldBrightness = brightness * flightVisibilityBoost;
  const profile = environmentLightProfiles[activeBiome] || environmentLightProfiles['neon-docks'];
  hemi.intensity = menuScene
    ? (0.62 + day * 0.45) * brightness * 0.37
    : (profile.ambient + day * 0.14) * worldBrightness;
  moon.intensity = menuScene
    ? (0.92 + day * 0.4) * brightness * 0.34
    : (profile.moonIntensity + day * 0.12) * worldBrightness;
  fill.intensity = menuScene
    ? (0.32 + day * 0.25) * brightness * 0.34
    : (profile.fillIntensity + day * 0.05) * worldBrightness;
  scene.environmentIntensity = menuScene
    ? (0.12 + day * 0.02) * brightness * 0.55
    : profile.environment * worldBrightness;
  const platformGrass = menuBackdropRoot.getObjectByName('Continuous textured grass on the sky platform');
  if (platformGrass?.material) platformGrass.material.emissiveIntensity = 0.22 * flightVisibilityBoost;
}

function applyEnvironmentToScene() {
  const biome = biomes[activeBiome];
  const lightProfile = environmentLightProfiles[activeBiome] || environmentLightProfiles['neon-docks'];
  const menuBackdrop = true;
  const visualTime = currentPage === 'builder' ? environmentState.time : 22;
  const day = getEnvironmentDaylight();
  const nightSky = biome.sky;
  const daySky = '#9bbbd0';
  const sky = new THREE.Color(nightSky).lerp(new THREE.Color(daySky), day);
  if (menuBackdrop) sky.set('#030714');
  const far = environmentState.fogDistance * ({ clear: 1, mist: 0.48, dust: 0.68 }[environmentState.weather] || 1);
  const fogColor = sky.clone().lerp(new THREE.Color(lightProfile.fog), 0.14);
  if (environmentState.weather === 'dust') fogColor.lerp(new THREE.Color('#b78865'), 0.22);
  if (environmentState.weather === 'mist') fogColor.lerp(new THREE.Color('#b5c4cb'), 0.22);
  scene.background.copy(sky);
  scene.fog.color.copy(fogColor);
  const horizonFogFar = biome.id === 'neon-docks' ? 980 + far : far;
  scene.fog.near = Math.max(14, biome.id === 'neon-docks' ? horizonFogFar * 0.52 : far * 0.28);
  scene.fog.far = Math.max(scene.fog.near + 10, horizonFogFar);
  hemi.color.setHex(lightProfile.skyFill).lerp(new THREE.Color('#c5e9f7'), day);
  hemi.groundColor.setHex(lightProfile.groundFill);
  moon.color.setHex(lightProfile.moon).lerp(new THREE.Color('#ffe6cf'), day);
  fill.color.setHex(lightProfile.accent);
  updateWorldLightBalance(day);
  biomeLightRoot.traverse((node) => { if ((node.isPointLight || node.isSpotLight) && node.userData.baseIntensity) node.intensity = node.userData.baseIntensity * environmentState.brightness; });
  renderer.toneMappingExposure = lightProfile.exposure + day * 0.025;
  stars.visible = currentPage === 'trackPicker' || (day < 0.2 && !menuBackdrop);
  renderer.domElement.setAttribute('aria-label', `Interactive 3D ${biome.name} FPV flight world`);
  const timeInput = document.querySelector('#environmentTime');
  if (!timeInput) return;
  timeInput.value = String(environmentState.time);
  document.querySelector('#environmentTimeValue').textContent = `${String(environmentState.time).padStart(2, '0')}:00`;
  document.querySelector('#environmentFog').value = String(environmentState.fogDistance);
  document.querySelector('#environmentFogValue').textContent = `${environmentState.fogDistance} m`;
  document.querySelector('#environmentWeather').value = environmentState.weather;
  document.querySelector('#environmentBrightness').value = String(Math.round(environmentState.brightness * 100));
  document.querySelector('#environmentBrightnessValue').textContent = `${Math.round(environmentState.brightness * 100)}%`;
}

function makeTube(points, radius, material, segments = 48) {
  const curve = new THREE.CatmullRomCurve3(points.map((point) => new THREE.Vector3(...point)));
  return new THREE.Mesh(new THREE.TubeGeometry(curve, segments, radius, 8, false), material);
}

function smoothTerrainBlend(start, end, value) {
  const t = THREE.MathUtils.clamp((value - start) / (end - start), 0, 1);
  return t * t * (3 - 2 * t);
}

function neonDocksRawHeightAt(x, z) {
  const rolling = 0.48 * Math.sin(x * 0.027 + 0.6) * Math.cos(z * 0.031 - 0.3)
    + 0.32 * Math.sin((x + z) * 0.018 + 1.1)
    + 0.2 * Math.cos((x - z) * 0.041 - 0.8);
  const distance = Math.hypot(x, z + 8);
  const scenicBlend = smoothTerrainBlend(190, 390, distance);
  const distantHills = (9 * Math.sin(x * 0.0048 + Math.cos(z * 0.0032) * 0.7)
    + 5 * Math.cos(z * 0.006 - x * 0.0024)
    + 3 * Math.sin((x + z) * 0.0036)) * scenicBlend;
  const apronX = Math.max(Math.abs(x) - 82, 0);
  const apronZ = Math.max(Math.abs(z) - 70, 0);
  const apronBlend = smoothTerrainBlend(0, 56, Math.hypot(apronX, apronZ));
  return rolling * (0.8 + 2.8 * apronBlend) * apronBlend + distantHills;
}

const neonDocksTerrainZones = [
  [128, -82, 55, 82], [-142, -88, 55, 82], [122, 126, 55, 82], [-158, 128, 55, 82],
  [-230, -188, 30, 52], [230, -218, 30, 52],
  ...Array.from({ length: 4 }, (_, index) => {
    const angle = index * Math.PI / 2 + Math.PI / 4;
    return [Math.cos(angle) * 500, Math.sin(angle) * 500, 70, 104];
  }),
  ...Array.from({ length: 12 }, (_, index) => {
    const angle = index / 12 * Math.PI * 2 + Math.PI / 12;
    return [Math.cos(angle) * 310, Math.sin(angle) * 310, 32, 58];
  }),
].map(([x, z, flatRadius, blendRadius]) => ({ x, z, flatRadius, blendRadius, height: neonDocksRawHeightAt(x, z) }));
const neonDocksCanalPath = [
  [-850, -30], [-700, -12], [-540, 12], [-380, 20], [-220, 4], [-60, -18],
  [100, -12], [260, 12], [420, 20], [580, 4], [740, -18], [850, -8],
];
const neonDocksCanalWaterLevel = (progress) => -0.55 + progress * 0.3;

function neonDocksCanalProjection(x, z) {
  let nearestDistanceSquared = Infinity;
  let progress = 0;
  for (let index = 0; index < neonDocksCanalPath.length - 1; index += 1) {
    const [startX, startZ] = neonDocksCanalPath[index];
    const [endX, endZ] = neonDocksCanalPath[index + 1];
    const segmentX = endX - startX;
    const segmentZ = endZ - startZ;
    const segmentLengthSquared = segmentX * segmentX + segmentZ * segmentZ;
    const along = THREE.MathUtils.clamp(((x - startX) * segmentX + (z - startZ) * segmentZ) / segmentLengthSquared, 0, 1);
    const deltaX = x - (startX + segmentX * along);
    const deltaZ = z - (startZ + segmentZ * along);
    const distanceSquared = deltaX * deltaX + deltaZ * deltaZ;
    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared;
      progress = (index + along) / (neonDocksCanalPath.length - 1);
    }
  }
  return { distance: Math.sqrt(nearestDistanceSquared), progress };
}

function terrainHeightAt(biomeId, x, z) {
  return 0;
}

function terrainSurfaceYAt(biomeId, x, z) {
  return menuPlatformSurfaceY;
}

function builderSurfaceYAt(x, z) {
  return currentPage === 'builder' || currentPage === 'trackPicker' ? menuPlatformSurfaceY : terrainSurfaceYAt(activeBiome, x, z);
}

function flightGroundYAt(x, z, flightY) {
  if (currentPage === 'builder' || currentPage === 'trackPicker') {
    const overPlatform = Math.abs(x) <= menuPlatformHalfSize && Math.abs(z - menuPlatformCenterZ) <= menuPlatformHalfSize;
    if (!overPlatform || flightY < menuPlatformBottomY + flightCollisionRadius) return -10000;
    return menuPlatformSurfaceY;
  }
  return terrainSurfaceYAt(activeBiome, x, z);
}

function flightDebrisGroundYAt(x, z) {
  if (currentPage === 'builder' || currentPage === 'trackPicker') {
    const overPlatform = Math.abs(x) <= menuPlatformHalfSize && Math.abs(z - menuPlatformCenterZ) <= menuPlatformHalfSize;
    return overPlatform ? menuPlatformSurfaceY : -10000;
  }
  return terrainSurfaceYAt(activeBiome, x, z);
}

function flightGroundClearance(orientation = flight.orientation) {
  flightDroneInverseOrientation.copy(orientation).invert();
  flightGroundUpLocal.copy(axisY).applyQuaternion(flightDroneInverseOrientation);
  let lowestModelPoint = 0;
  for (const supportOffset of flightDroneGroundSupportOffsets) {
    const projectedY = supportOffset.x * showDrone.scale.x * flightGroundUpLocal.x
      + supportOffset.y * showDrone.scale.y * flightGroundUpLocal.y
      + supportOffset.z * showDrone.scale.z * flightGroundUpLocal.z;
    lowestModelPoint = Math.min(lowestModelPoint, projectedY);
  }
  return Math.max(0.005, -lowestModelPoint + 0.035);
}

function refreshFlightGroundSupportOffsets() {
  const supportOffsets = [];
  const supportKeys = new Set();
  showDrone.updateMatrixWorld(true);
  const inverseShowDroneMatrix = showDrone.matrixWorld.clone().invert();
  const addPoint = (point) => {
    const key = `${Math.round(point.x * 10000)}:${Math.round(point.y * 10000)}:${Math.round(point.z * 10000)}`;
    if (supportKeys.has(key)) return;
    supportKeys.add(key);
    supportOffsets.push(point.clone());
  };
  showDrone.traverse((node) => {
    if (!node.isMesh || !node.geometry?.attributes?.position) return;
    if (node.userData.isCustomDroneArm && flightDamageState.brokenArms[node.userData.flightMotorIndex]) return;
    let ancestor = node.parent;
    while (ancestor && ancestor !== showDrone && !ancestor.userData.isPartyRotor) ancestor = ancestor.parent;
    if (ancestor?.userData.isPartyRotor) return;
    const positions = node.geometry.attributes.position;
    const stride = Math.max(1, Math.ceil(positions.count / 1800));
    const extrema = Array.from({ length: 6 }, () => ({ value: 0, point: new THREE.Vector3() }));
    extrema[0].value = Infinity;
    extrema[1].value = -Infinity;
    extrema[2].value = Infinity;
    extrema[3].value = -Infinity;
    extrema[4].value = Infinity;
    extrema[5].value = -Infinity;
    for (let index = 0; index < positions.count; index += 1) {
      flightGroundSupportOffset.fromBufferAttribute(positions, index)
        .applyMatrix4(node.matrixWorld)
        .applyMatrix4(inverseShowDroneMatrix);
      if (index % stride === 0) addPoint(flightGroundSupportOffset);
      for (let axis = 0; axis < 3; axis += 1) {
        const coordinate = axis === 0 ? flightGroundSupportOffset.x : axis === 1 ? flightGroundSupportOffset.y : flightGroundSupportOffset.z;
        const minSlot = axis * 2;
        const maxSlot = minSlot + 1;
        if (coordinate < extrema[minSlot].value) {
          extrema[minSlot].value = coordinate;
          extrema[minSlot].point.copy(flightGroundSupportOffset);
        }
        if (coordinate > extrema[maxSlot].value) {
          extrema[maxSlot].value = coordinate;
          extrema[maxSlot].point.copy(flightGroundSupportOffset);
        }
      }
    }
    extrema.forEach(({ point }) => addPoint(point));
  });
  if (supportOffsets.length) flightDroneGroundSupportOffsets = supportOffsets;
}

function flightGroundContactOffset(orientation = flight.orientation, travelVelocity = null) {
  flightDroneInverseOrientation.copy(orientation).invert();
  flightGroundUpLocal.copy(axisY).applyQuaternion(flightDroneInverseOrientation);
  const hasTravelDirection = travelVelocity && Math.hypot(travelVelocity.x, travelVelocity.z) > 0.5;
  let lowestY = Infinity;
  for (const supportOffset of flightDroneGroundSupportOffsets) {
    const projectedY = supportOffset.x * showDrone.scale.x * flightGroundUpLocal.x
      + supportOffset.y * showDrone.scale.y * flightGroundUpLocal.y
      + supportOffset.z * showDrone.scale.z * flightGroundUpLocal.z;
    lowestY = Math.min(lowestY, projectedY);
  }
  flightGroundContactPoint.set(0, 0, 0);
  let contactCount = 0;
  let leadingContactScore = -Infinity;
  for (const supportOffset of flightDroneGroundSupportOffsets) {
    const projectedY = supportOffset.x * showDrone.scale.x * flightGroundUpLocal.x
      + supportOffset.y * showDrone.scale.y * flightGroundUpLocal.y
      + supportOffset.z * showDrone.scale.z * flightGroundUpLocal.z;
    if (projectedY > lowestY + 0.015) continue;
    flightGroundSupportOffset.set(
      supportOffset.x * showDrone.scale.x,
      supportOffset.y * showDrone.scale.y,
      supportOffset.z * showDrone.scale.z,
    ).applyQuaternion(orientation);
    if (hasTravelDirection) {
      const leadingScore = flightGroundSupportOffset.x * travelVelocity.x
        + flightGroundSupportOffset.z * travelVelocity.z;
      if (leadingScore > leadingContactScore) {
        leadingContactScore = leadingScore;
        flightGroundContactPoint.copy(flightGroundSupportOffset);
      }
    } else {
      flightGroundContactPoint.add(flightGroundSupportOffset);
      contactCount += 1;
    }
  }
  if (!hasTravelDirection && contactCount) flightGroundContactPoint.multiplyScalar(1 / contactCount);
  return flightGroundContactPoint;
}

function applyFlightGroundContactPhysics(dt, groundY, groundClearance) {
  if (groundY <= -9990 || flight.position.y > groundY + groundClearance + 0.02) return false;
  if (flight.velocity.y < -0.6) flight.velocity.y *= -0.14;
  else if (flight.velocity.y < 0) flight.velocity.y = 0;
  const groundFriction = Math.exp(-(flightDamageState.crashed || flightDamageState.brokenProps.some(Boolean) ? 2.4 : 0.35) * dt);
  flight.velocity.x *= groundFriction;
  flight.velocity.z *= groundFriction;

  if (flightDamageState.crashed || flightDamageState.brokenProps.some(Boolean)) {
    flightGroundContactTorque.crossVectors(flightGroundContactOffset(), axisY);
    flight.impactAngularVelocity.addScaledVector(
      flightGroundContactTorque,
      9.81 * flightCollisionInverseInertia * dt,
    );
    const rotationDamping = Math.exp(-2.4 * dt);
    flight.impactAngularVelocity.multiplyScalar(rotationDamping);
    flight.bodyAngularVelocity.multiplyScalar(rotationDamping);
  }
  return true;
}

function breakFlightPropsOnGroundContact(groundY) {
  if (groundY <= -9990 || !propellers.length) return;
  if (flight.position.y > groundY + 4) return;
  const downwardImpactSpeed = Math.max(0, -flight.velocity.y);
  const horizontalGroundSpeed = Math.hypot(flight.velocity.x, flight.velocity.z);
  if (downwardImpactSpeed < 1.5 && horizontalGroundSpeed < flightPropellerBreakImpactSpeed) return;
  syncFlightDroneModelTransform();
  showDrone.updateMatrixWorld(true);
  const touchedMotors = [];
  propellers.forEach((rotor) => {
    if (!rotor.visible) return;
    rotor.updateWorldMatrix(true, true);
    flightGroundProbeBounds.setFromObject(rotor);
    if (flightGroundProbeBounds.min.y > groundY + 0.006) return;
    const motorIndex = rotor.userData.flightMotorIndex;
    if (!Number.isInteger(motorIndex)) return;
    if (!flightDamageState.brokenProps[motorIndex] && !touchedMotors.includes(motorIndex)) touchedMotors.push(motorIndex);
  });
  if (!touchedMotors.length) return;
  touchedMotors.forEach((motorIndex) => breakFlightPropeller(motorIndex, flightGroundContactNormal));
  updateFlightDamageIndicator();
}

function breakFlightArmsOnGroundContact(groundY) {
  if (groundY <= -9990 || !flightArmDamageMeshes.length) return;
  if (flight.position.y > groundY + 4) return;
  const impactSpeed = Math.hypot(flight.velocity.x, Math.max(0, -flight.velocity.y), flight.velocity.z);
  if (impactSpeed < flightArmBreakImpactSpeed) return;
  syncFlightDroneModelTransform();
  showDrone.updateMatrixWorld(true);
  const touchedArms = new Set();
  flightArmDamageMeshes.forEach(({ mesh, arms }) => {
    mesh.updateWorldMatrix(true, false);
    flightGroundProbeBounds.setFromObject(mesh);
    if (flightGroundProbeBounds.min.y > groundY + 0.006) return;
    arms.forEach((arm) => {
      if (!flightDamageState.brokenArms[arm.motorIndex]) touchedArms.add(arm.motorIndex);
    });
  });
  if (!touchedArms.size) return;
  touchedArms.forEach((motorIndex) => breakFlightArm(motorIndex, flightGroundContactNormal));
  updateFlightDamageIndicator();
}

function addOpenField() {
  const fieldMaterial = new THREE.MeshStandardMaterial({ color: 0x315438, roughness: 0.96, metalness: 0 });
  const field = new THREE.Mesh(new THREE.PlaneGeometry(1200, 1200), fieldMaterial);
  field.name = 'Open Field flat ground';
  field.rotation.x = -Math.PI / 2;
  field.position.y = -0.12;
  field.receiveShadow = true;
  field.userData.flightGroundSurface = true;
  environmentRoot.add(field);
}

function createReliefSurface(width, depth, material, { biomeId = activeBiome, x = 0, z = 0, y = -0.12, segments = 144 } = {}) {
  const geometry = new THREE.PlaneGeometry(width, depth, segments, segments);
  const positions = geometry.attributes.position;
  for (let index = 0; index < positions.count; index += 1) {
    const worldX = x + positions.getX(index);
    const worldZ = z - positions.getY(index);
    positions.setZ(index, terrainHeightAt(biomeId, worldX, worldZ));
  }
  positions.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  const ground = new THREE.Mesh(geometry, material);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(x, y, z);
  ground.receiveShadow = true;
  ground.userData.flightGroundSurface = true;
  return ground;
}

function addPlayground() {
  const concrete = new THREE.MeshStandardMaterial({ color: 0x98aab8, roughness: 0.78, metalness: 0.08, flatShading: true });
  const steel = new THREE.MeshStandardMaterial({ color: 0x70899e, roughness: 0.68, metalness: 0.12, flatShading: true });
  const white = new THREE.MeshStandardMaterial({ color: 0xd9e2e5, roughness: 0.42, metalness: 0.12, flatShading: true });
  const orange = new THREE.MeshStandardMaterial({ color: colors.orange, roughness: 0.38, metalness: 0.12, emissive: 0x8d3900, emissiveIntensity: 0.55 });
  const orangeLed = new THREE.MeshStandardMaterial({ color: colors.orange, roughness: 0.28, emissive: colors.orange, emissiveIntensity: 1.7, toneMapped: false });
  const cyanLed = new THREE.MeshStandardMaterial({ color: colors.cyan, roughness: 0.24, emissive: colors.cyan, emissiveIntensity: 1.3, toneMapped: false });
  const parkGlass = new THREE.MeshStandardMaterial({ color: 0x253d50, roughness: 0.32, metalness: 0.28, emissive: 0x0b1d2a, emissiveIntensity: 0.5 });
  const floor = createReliefSurface(1160, 1160, concrete, { biomeId: 'playground', z: -28, y: -0.12, segments: 220 });
  environmentRoot.add(floor);
  for (let x = -110; x <= 110; x += 10) box(environmentRoot, [0.12, 0.025, 210], [x, -0.08, -28], 'grid');
  for (let z = -128; z <= 72; z += 10) box(environmentRoot, [230, 0.025, 0.12], [0, -0.08, z], 'grid');

  const podiumBase = new THREE.Mesh(new THREE.CylinderGeometry(12.2, 12.8, 1.2, 8), steel);
  podiumBase.position.set(1.7, 0.5, -1.5); environmentRoot.add(podiumBase);
  const podiumTop = new THREE.Mesh(new THREE.CylinderGeometry(11.8, 12.2, 0.22, 8), white);
  podiumTop.position.set(1.7, 1.2, -1.5); environmentRoot.add(podiumTop);
  const podiumRing = new THREE.Mesh(new THREE.TorusGeometry(8.8, 0.22, 6, 48), orangeLed);
  podiumRing.rotation.x = Math.PI / 2; podiumRing.position.set(1.7, 1.34, -1.5); environmentRoot.add(podiumRing);
  for (const [x, z] of [[-28, 5], [31, 3], [-27, -46], [31, -47]]) {
    const foot = new THREE.Mesh(new THREE.CylinderGeometry(6.4, 6.8, 0.84, 8), steel); foot.position.set(x, 0.3, z); environmentRoot.add(foot);
    const top = new THREE.Mesh(new THREE.CylinderGeometry(6.1, 6.4, 0.18, 8), white); top.position.set(x, 0.81, z); environmentRoot.add(top);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(4.4, 0.12, 5, 40), x < 0 ? cyanLed : orangeLed); ring.rotation.x = Math.PI / 2; ring.position.set(x, 0.93, z); environmentRoot.add(ring);
  }

  // Keep the arches grouped so the menu's builder artwork can show the park without course gates.
  playgroundGateStructures = new THREE.Group();
  playgroundGateStructures.name = 'Playground arch course structures';
  environmentRoot.add(playgroundGateStructures);
  for (const x of [-45, -30, 30, 45]) {
    for (const z of [-91, -58, -25, 8]) {
      const height = 22 + ((Math.round(x + z) % 3) + 3) % 3 * 2;
      box(playgroundGateStructures, [1.5, height, 1.5], [x, height / 2, z], 'steel');
      box(playgroundGateStructures, [3.1, 0.65, 3.1], [x, 0.32, z], 'dark');
      box(playgroundGateStructures, [1.8, 0.18, 1.8], [x, height - 0.4, z], 'metal');
    }
  }
  for (let i = 0; i < 8; i += 1) {
    const z = 25 - i * 18;
    const width = 8.5 + (i % 3) * 2;
    const arch = makeTube([
      [-width, 0.2, z], [-width, 5, z], [-width * 0.84, 9, z], [-width * 0.45, 12.1, z], [0, 13.4 + (i % 2) * 1.1, z], [width * 0.45, 12.1, z], [width * 0.84, 9, z], [width, 5, z], [width, 0.2, z],
    ], 0.72, orange, 52);
    playgroundGateStructures.add(arch);
    const inner = makeTube([
      [-width + 0.9, 0.3, z - 0.18], [-width + 0.9, 5, z - 0.18], [-width * 0.75, 9.2, z - 0.18], [0, 12.6 + (i % 2) * 1.1, z - 0.18], [width * 0.75, 9.2, z - 0.18], [width - 0.9, 5, z - 0.18], [width - 0.9, 0.3, z - 0.18],
    ], 0.12, orangeLed, 44);
    playgroundGateStructures.add(inner);
    box(playgroundGateStructures, [width * 2 + 2, 0.55, 0.55], [0, 14.2 + (i % 2) * 1.1, z], 'steel');
  }

  const railBlue = new THREE.MeshStandardMaterial({ color: 0x435c71, roughness: 0.66, metalness: 0.22 });
  const railOrange = new THREE.MeshStandardMaterial({ color: 0xb7511e, roughness: 0.68, metalness: 0.18 });
  for (const side of [-1, 1]) {
    const points = [[side * 34, 17, 28], [side * 34, 23, 10], [side * 26, 26, -10], [side * 16, 22, -26], [side * 22, 18, -46], [side * 35, 26, -62], [side * 39, 27, -85], [side * 25, 18, -107]];
    environmentRoot.add(makeTube(points, 0.38, railBlue, 76));
    environmentRoot.add(makeTube(points.map(([x, y, z]) => [x + side * 1.2, y, z]), 0.21, railOrange, 76));
  }
  for (let i = 0; i < 10; i += 1) {
    const z = 20 - i * 14;
    for (const x of [-34, 34]) {
      const h = i % 2 ? 18 : 23;
      box(environmentRoot, [0.55, h, 0.55], [x, h / 2, z], 'orange');
      box(environmentRoot, [0.24, h, 0.24], [x + (x < 0 ? 0.8 : -0.8), h / 2, z], 'steel');
    }
  }
  // Distant hangar frames add depth behind the loops.
  for (let i = 0; i < 9; i += 1) {
    const z = -113 - i * 4;
    const h = 18 + (i % 3) * 4;
    box(environmentRoot, [1.25, h, 1.25], [-62, h / 2, z], 'steel');
    box(environmentRoot, [1.25, h, 1.25], [62, h / 2, z], 'steel');
    box(environmentRoot, [126, 0.85, 1.2], [0, h, z], 'steel');
    box(environmentRoot, [0.28, 0.22, 125], [0, h - 0.7, z], 'cyan');
  }
  for (const [x, z] of [[-48, -5], [48, -32], [-50, -73], [50, -93]]) {
    const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.48, 10, 8), new THREE.MeshBasicMaterial({ color: colors.orange }));
    lamp.position.set(x, 18, z); environmentRoot.add(lamp);
    const light = new THREE.PointLight(colors.orange, 44, 56, 2); light.userData.baseIntensity = 44; light.position.copy(lamp.position); biomeLightRoot.add(light);
  }
  // Sparse perimeter pylons make the park feel larger without crowding its flight lanes.
  for (const [x, z, height, hue] of [[-94, 18, 31, 'cyan'], [94, 18, 31, 'orange'], [-94, -105, 36, 'orange'], [94, -105, 36, 'cyan']]) {
    box(environmentRoot, [4.2, 0.8, 4.2], [x, 0.4, z], 'dark');
    box(environmentRoot, [0.65, height, 0.65], [x, height / 2, z], 'steel');
    box(environmentRoot, [1.2, 0.2, 1.2], [x, height - 0.5, z], hue);
    box(environmentRoot, [3.6, 0.45, 3.6], [x, height + 0.15, z], 'steel');
  }

  // Covered spectator stands and a race-control tower make the park feel like a venue.
  for (const side of [-1, 1]) {
    const groundY = terrainSurfaceYAt('playground', side * 132, -52);
    const stand = new THREE.Group();
    stand.position.set(side * 132, groundY, -52);
    stand.rotation.y = side < 0 ? Math.PI / 2 : -Math.PI / 2;
    environmentRoot.add(stand);
    const steps = new THREE.InstancedMesh(boxGeometry, concrete, 7);
    const seats = new THREE.InstancedMesh(boxGeometry, side < 0 ? orange : cyanLed, 140);
    const seatBacks = new THREE.InstancedMesh(boxGeometry, steel, 140);
    const seatingStamp = new THREE.Object3D();
    for (let row = 0; row < 7; row += 1) {
      const stepY = 0.65 + row * 0.92;
      const rowZ = -13 + row * 1.9;
      seatingStamp.position.set(0, stepY, rowZ);
      seatingStamp.scale.set(52, 0.42, 1.9);
      seatingStamp.updateMatrix();
      steps.setMatrixAt(row, seatingStamp.matrix);
      for (let column = 0; column < 20; column += 1) {
        const seatIndex = row * 20 + column;
        const seatX = -23.4 + column * 2.4;
        seatingStamp.position.set(seatX, stepY + 0.62, rowZ + 0.15);
        seatingStamp.scale.set(1.9, 0.34, 0.9);
        seatingStamp.updateMatrix();
        seats.setMatrixAt(seatIndex, seatingStamp.matrix);
        seatingStamp.position.set(seatX, stepY + 1.12, rowZ - 0.32);
        seatingStamp.scale.set(1.9, 0.86, 0.22);
        seatingStamp.updateMatrix();
        seatBacks.setMatrixAt(seatIndex, seatingStamp.matrix);
      }
    }
    steps.instanceMatrix.needsUpdate = true;
    seats.instanceMatrix.needsUpdate = true;
    seatBacks.instanceMatrix.needsUpdate = true;
    seats.userData.skipShadows = true;
    seatBacks.userData.skipShadows = true;
    stand.add(steps, seats, seatBacks);
    box(stand, [56, 1.2, 23], [0, 9.3, -5], steel);
    box(stand, [58, 0.22, 0.45], [0, 9.98, -5], side < 0 ? orangeLed : cyanLed);
    box(stand, [0.85, 8.9, 1.1], [-26, 4.5, -5], steel);
    box(stand, [0.85, 8.9, 1.1], [26, 4.5, -5], steel);
    box(stand, [55, 0.5, 1.0], [0, 8.55, 6], 'dark');
    for (const x of [-24, -12, 0, 12, 24]) box(stand, [0.18, 0.3, 22], [x, 9.9, -5], 'dark');
    for (const x of [-22, 22]) {
      box(stand, [0.22, 6.4, 0.22], [x, 5.9, 7.4], side < 0 ? orange : cyan);
      box(stand, [0.22, 6.4, 0.22], [x, 5.9, -17.4], side < 0 ? orange : cyan);
    }
    box(stand, [22, 3.4, 0.42], [0, 12.1, 6], 'dark');
    box(stand, [20, 2.5, 0.18], [0, 12.1, 6.25], side < 0 ? orangeLed : cyanLed);
  }
  const controlTower = new THREE.Group();
  controlTower.position.set(152, terrainSurfaceYAt('playground', 152, 92), 92);
  environmentRoot.add(controlTower);
  box(controlTower, [26, 2.2, 24], [0, 1.1, 0], steel);
  box(controlTower, [17, 19, 17], [0, 11.7, 0], concrete);
  for (const y of [5, 10, 15, 20]) {
    box(controlTower, [18, 0.26, 18], [0, y, 0], 'dark');
    for (const side of [-1, 1]) {
      box(controlTower, [7, 3.2, 0.2], [side * 4.3, y - 2.1, 8.7], side < 0 ? cyanLed : orangeLed);
      box(controlTower, [0.2, 3.2, 7], [8.7, y - 2.1, side * 4.3], side < 0 ? cyanLed : orangeLed);
    }
  }
  box(controlTower, [25, 6.2, 24], [0, 24.2, 0], 'dark');
  box(controlTower, [23, 3.8, 0.24], [0, 24.3, 12.15], parkGlass);
  box(controlTower, [0.24, 3.8, 23], [11.9, 24.3, 0], parkGlass);
  box(controlTower, [27, 0.8, 26], [0, 27.7, 0], white);
  for (const x of [-8, -4, 0, 4, 8]) box(controlTower, [0.14, 3.9, 0.3], [x, 24.2, 12.32], steel);
  cylinder(controlTower, 0.18, 0.35, 12, [0, 34, 0], 'steel', 8);
  box(controlTower, [4.2, 0.25, 4.2], [0, 40.2, 0], orangeLed);

  // A ring of service hangars and timing pylons carries the test park out to the horizon.
  const hangarParts = [
    [new THREE.InstancedMesh(boxGeometry, steel, 16), 16],
    [new THREE.InstancedMesh(boxGeometry, concrete, 16), 16],
    [new THREE.InstancedMesh(boxGeometry, parkGlass, 16), 16],
    [new THREE.InstancedMesh(boxGeometry, white, 16), 16],
    [new THREE.InstancedMesh(boxGeometry, orangeLed, 16), 16],
    [new THREE.InstancedMesh(boxGeometry, steel, 32), 32],
    [new THREE.InstancedMesh(boxGeometry, steel, 144), 144],
    [new THREE.InstancedMesh(new THREE.CylinderGeometry(1.15, 1.15, 0.35, 10), sharedMaterials.dark, 48), 48],
    [new THREE.InstancedMesh(boxGeometry, cyanLed, 48), 48],
  ];
  const hangarDummies = hangarParts.map(() => new THREE.Object3D());
  const hangarCounts = hangarParts.map(() => 0);
  const addHangarPart = (partIndex, position, size, centerX, centerZ, groundY, angle, rotation = 0) => {
    const stamp = hangarDummies[partIndex];
    const world = new THREE.Vector3(position[0], 0, position[2]).applyAxisAngle(new THREE.Vector3(0, 1, 0), angle + Math.PI / 2);
    stamp.position.set(centerX + world.x, groundY + position[1], centerZ + world.z);
    stamp.rotation.set(0, angle + Math.PI / 2 + rotation, 0);
    stamp.scale.set(size[0], size[1], size[2]);
    stamp.updateMatrix();
    hangarParts[partIndex][0].setMatrixAt(hangarCounts[partIndex]++, stamp.matrix);
  };
  for (let index = 0; index < 16; index += 1) {
    const angle = index / 16 * Math.PI * 2;
    const x = Math.cos(angle) * 248;
    const z = Math.sin(angle) * 248 - 28;
    const groundY = terrainSurfaceYAt('playground', x, z);
    addHangarPart(0, [0, 0.42, 0], [48, 0.85, 22], x, z, groundY, angle);
    addHangarPart(1, [0, 4.95, -0.2], [44, 8.2, 17], x, z, groundY, angle);
    addHangarPart(2, [0, 4.6, 8.45], [44.5, 4.1, 0.34], x, z, groundY, angle);
    addHangarPart(3, [0, 9.35, 0], [48, 0.95, 22], x, z, groundY, angle);
    addHangarPart(index % 2 ? 8 : 4, [0, 9.88, 0], [49, 0.22, 0.55], x, z, groundY, angle);
    for (const side of [-1, 1]) {
      addHangarPart(5, [side * 22.2, 4.7, 0], [0.65, 9.4, 18], x, z, groundY, angle);
      addHangarPart(6, [side * 11, 4.6, 8.67], [0.18, 4.1, 0.38], x, z, groundY, angle);
    }
    for (let pane = 0; pane < 9; pane += 1) addHangarPart(6, [-19 + pane * 4.75, 4.6, 8.67], [0.14, 4.1, 0.3], x, z, groundY, angle);
    for (const fanX of [-13, 0, 13]) {
      addHangarPart(7, [fanX, 10, -1], [1, 1, 1], x, z, groundY, angle);
      addHangarPart(8, [fanX, 10.24, -1], [0.22, 0.1, 1.8], x, z, groundY, angle);
    }
  }
  hangarParts.forEach(([mesh], index) => {
    mesh.count = hangarCounts[index];
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.userData.skipShadows = true;
  });
  environmentRoot.add(...hangarParts.map(([mesh]) => mesh));
  const timingPosts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.55, 22, 7), steel, 48);
  const timingCaps = new THREE.InstancedMesh(boxGeometry, orangeLed, 48);
  const timingStamp = new THREE.Object3D();
  for (let index = 0; index < timingPosts.count; index += 1) {
    const angle = index / timingPosts.count * Math.PI * 2;
    const radius = 326 + (index % 2) * 8;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius - 28;
    const groundY = terrainSurfaceYAt('playground', x, z);
    timingStamp.position.set(x, groundY + 11, z);
    timingStamp.rotation.set(0, angle, 0);
    timingStamp.scale.setScalar(1);
    timingStamp.updateMatrix();
    timingPosts.setMatrixAt(index, timingStamp.matrix);
    timingStamp.position.y = groundY + 22.2;
    timingStamp.scale.set(1.55, 0.42, 1.55);
    timingStamp.updateMatrix();
    timingCaps.setMatrixAt(index, timingStamp.matrix);
  }
  timingPosts.instanceMatrix.needsUpdate = true;
  timingCaps.instanceMatrix.needsUpdate = true;
  timingCaps.userData.skipShadows = true;
  environmentRoot.add(timingPosts, timingCaps);
}

function addGround(colorKey = 'asphalt', size = 4200) {
  const ground = createReliefSurface(size, size, sharedMaterials[colorKey], { biomeId: activeBiome, y: -0.12, segments: 320 });
  environmentRoot.add(ground);
  return ground;
}

function addNeonDocksSurfacePatches() {
  const patches = [
    { x: -538, z: 160, width: 76, depth: 54, yaw: -0.08, material: sharedMaterials.neonDocksGravel, name: 'West freight gravel yard' },
    { x: 0, z: 545, width: 82, depth: 58, yaw: 0.06, material: sharedMaterials.neonDocksGravel, name: 'North bulk materials yard' },
    { x: 0, z: -545, width: 70, depth: 52, yaw: -0.05, material: sharedMaterials.neonDocksGravel, name: 'South equipment staging yard' },
    { x: -770, z: 160, width: 62, depth: 44, yaw: -0.14, material: sharedMaterials.neonDocksDirt, name: 'West earthworks laydown' },
    { x: 0, z: 770, width: 58, depth: 42, yaw: 0.12, material: sharedMaterials.neonDocksDirt, name: 'North soil service yard' },
    { x: -265, z: 150, width: 52, depth: 40, yaw: Math.PI / 2, material: sharedMaterials.neonDocksSlab, name: 'West concrete service apron' },
    { x: 205, z: 192, width: 44, depth: 32, yaw: -0.2, material: sharedMaterials.neonDocksSlab, name: 'East quay maintenance pad' },
  ];
  for (const patch of patches) {
    const geometry = new THREE.PlaneGeometry(patch.width, patch.depth, 16, 12);
    const positions = geometry.attributes.position;
    const cosine = Math.cos(patch.yaw);
    const sine = Math.sin(patch.yaw);
    for (let index = 0; index < positions.count; index += 1) {
      const localX = positions.getX(index);
      const localPlaneY = positions.getY(index);
      const worldX = patch.x + cosine * localX - sine * localPlaneY;
      const worldZ = patch.z - (sine * localX + cosine * localPlaneY);
      positions.setZ(index, terrainHeightAt('neon-docks', worldX, worldZ) + 0.055);
    }
    positions.needsUpdate = true;
    geometry.rotateX(-Math.PI / 2);
    geometry.computeVertexNormals();
    const surface = new THREE.Mesh(geometry, patch.material);
    surface.position.set(patch.x, -0.12, patch.z);
    surface.rotation.y = patch.yaw;
    surface.name = patch.name;
    surface.receiveShadow = true;
    surface.userData.skipFlightCollision = true;
    environmentRoot.add(surface);
  }
}

function addNeonDocksServiceVehicles() {
  const parkingLots = [
    [128, -82, 56, 36, 0.06], [-142, -88, 62, 38, Math.PI / 2],
    [122, 126, 48, 34, Math.PI / 2], [-158, 128, 54, 38, 0],
  ];
  const vehicles = [];
  parkingLots.forEach(([x, z, width, depth, yaw], lotIndex) => {
    const lotOffset = new THREE.Vector3(0, 0, depth / 2 + 16).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
    const lotX = x + lotOffset.x;
    const lotZ = z + lotOffset.z;
    const lotWidth = width - 10;
    const slotCount = Math.max(4, Math.floor(lotWidth / 6));
    const usedSlots = lotIndex % 2 ? [0, 2, slotCount - 1] : [1, slotCount - 2];
    usedSlots.forEach((slot, index) => {
      const localX = -lotWidth / 2 + (slot + 0.5) * (lotWidth / slotCount);
      const side = index % 2 ? 1 : -1;
      const localZ = side * (4.2 + ((lotIndex + index) % 2) * 1.5);
      const offset = new THREE.Vector3(localX, 0, localZ).applyAxisAngle(new THREE.Vector3(0, 1, 0), yaw);
      const vehicleYaw = yaw + (lotIndex % 2 ? Math.PI : 0);
      vehicles.push({
        x: lotX + offset.x,
        z: lotZ + offset.z,
        yaw: vehicleYaw,
        color: [0x8e9aa0, 0xc8753d, 0x4d8296, 0xaca48a][(lotIndex + index) % 4],
        groundY: terrainSurfaceYAt('neon-docks', lotX + offset.x, lotZ + offset.z),
      });
    });
  });

  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.62, metalness: 0.14 });
  const cabinMaterial = new THREE.MeshStandardMaterial({ color: 0x384652, roughness: 0.48, metalness: 0.2 });
  const windowMaterial = new THREE.MeshStandardMaterial({ color: 0x18303c, roughness: 0.25, metalness: 0.3, emissive: 0x06151b, emissiveIntensity: 0.4 });
  const tireMaterial = new THREE.MeshStandardMaterial({ color: 0x161b20, roughness: 0.94, metalness: 0.02 });
  const body = new THREE.InstancedMesh(boxGeometry, bodyMaterial, vehicles.length);
  const cabin = new THREE.InstancedMesh(boxGeometry, cabinMaterial, vehicles.length);
  const glass = new THREE.InstancedMesh(boxGeometry, windowMaterial, vehicles.length);
  const wheels = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.43, 0.43, 0.28, 8), tireMaterial, vehicles.length * 4);
  const vehicleRoot = new THREE.Object3D();
  const part = new THREE.Object3D();
  const combined = new THREE.Matrix4();
  let wheelIndex = 0;
  vehicles.forEach((vehicle, index) => {
    vehicleRoot.position.set(vehicle.x, vehicle.groundY, vehicle.z);
    vehicleRoot.rotation.set(0, vehicle.yaw, 0);
    vehicleRoot.updateMatrix();
    const setPart = (mesh, offset, size, rotation = [0, 0, 0]) => {
      part.position.set(...offset);
      part.rotation.set(...rotation);
      part.scale.set(...size);
      part.updateMatrix();
      combined.multiplyMatrices(vehicleRoot.matrix, part.matrix);
      mesh.setMatrixAt(index, combined);
    };
    setPart(body, [0, 0.9, 0], [4.7, 0.9, 2.15]);
    setPart(cabin, [-0.2, 1.62, 0], [2.35, 0.78, 1.78]);
    setPart(glass, [-0.2, 1.68, 0], [2.0, 0.45, 1.84]);
    body.setColorAt(index, new THREE.Color(vehicle.color));
    const wheelPart = new THREE.Object3D();
    for (const localX of [-1.45, 1.45]) {
      for (const localZ of [-1.06, 1.06]) {
        wheelPart.position.set(localX, 0.48, localZ);
        wheelPart.rotation.set(0, 0, Math.PI / 2);
        wheelPart.scale.set(1, 1, 1);
        wheelPart.updateMatrix();
        combined.multiplyMatrices(vehicleRoot.matrix, wheelPart.matrix);
        wheels.setMatrixAt(wheelIndex++, combined);
      }
    }
  });
  body.instanceMatrix.needsUpdate = true;
  cabin.instanceMatrix.needsUpdate = true;
  glass.instanceMatrix.needsUpdate = true;
  wheels.instanceMatrix.needsUpdate = true;
  if (body.instanceColor) body.instanceColor.needsUpdate = true;
  for (const mesh of [body, cabin, glass, wheels]) {
    mesh.userData.skipFlightCollision = true;
    mesh.userData.skipShadows = true;
  }
  environmentRoot.add(body, cabin, glass, wheels);
}

function addNeonDocksGrassPatches() {
  let randomSeed = 0x58a1c3;
  const random = () => {
    randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0;
    return randomSeed / 4294967296;
  };
  const patches = [];
  const hardSurfaces = [
    [-538, 160, 76, 54, -0.08], [0, 545, 82, 58, 0.06], [0, -545, 70, 52, -0.05],
    [-770, 160, 62, 44, -0.14], [0, 770, 58, 42, 0.12], [-265, 150, 52, 40, Math.PI / 2], [205, 192, 44, 32, -0.2],
  ];
  const nearHardSurface = (x, z, margin) => hardSurfaces.some(([surfaceX, surfaceZ, width, depth, yaw]) => {
    const dx = x - surfaceX;
    const dz = z - surfaceZ;
    const localX = Math.cos(yaw) * dx + Math.sin(yaw) * dz;
    const localZ = -Math.sin(yaw) * dx + Math.cos(yaw) * dz;
    return Math.abs(localX) < width / 2 + margin && Math.abs(localZ) < depth / 2 + margin;
  });
  const gridSpacing = 48;
  for (let gridX = -21; gridX <= 21; gridX += 1) {
    for (let gridZ = -21; gridZ <= 21; gridZ += 1) {
      if (random() > 0.48) continue;
      const x = gridX * gridSpacing + (random() - 0.5) * 20;
      const z = gridZ * gridSpacing + (random() - 0.5) * 20;
      const distanceFromCenter = Math.hypot(x, z);
      if (distanceFromCenter < 145 || distanceFromCenter > 1010) continue;
      const patch = { x, z, width: 28 + random() * 20, depth: 24 + random() * 18, yaw: random() * Math.PI };
      const canalDistance = neonDocksCanalProjection(x, z).distance;
      // Keep turf off the water, quay slabs, canal roads, and paved yards.
      if (canalDistance < 61 || Math.abs(canalDistance - 79) < patch.depth * 0.55 + 11) continue;
      if (nearHardSurface(x, z, Math.max(patch.width, patch.depth) * 0.52 + 5)) continue;
      patches.push(patch);
    }
  }

  // One merged terrain-conforming mesh keeps broad grass coverage inexpensive.
  const patchSegments = 6;
  const verticesPerPatch = (patchSegments + 1) ** 2;
  const positions = new Float32Array(patches.length * verticesPerPatch * 3);
  const uvs = new Float32Array(patches.length * verticesPerPatch * 2);
  const indices = [];
  patches.forEach((patch, patchIndex) => {
    const cosine = Math.cos(patch.yaw);
    const sine = Math.sin(patch.yaw);
    const vertexStart = patchIndex * verticesPerPatch;
    for (let row = 0; row <= patchSegments; row += 1) {
      for (let column = 0; column <= patchSegments; column += 1) {
        const localX = (column / patchSegments - 0.5) * patch.width;
        const localPlaneY = (row / patchSegments - 0.5) * patch.depth;
        const worldX = patch.x + cosine * localX - sine * localPlaneY;
        const worldZ = patch.z - (sine * localX + cosine * localPlaneY);
        const vertexIndex = vertexStart + row * (patchSegments + 1) + column;
        const vertexOffset = vertexIndex * 3;
        positions[vertexOffset] = worldX;
        positions[vertexOffset + 1] = terrainSurfaceYAt('neon-docks', worldX, worldZ) + 0.025;
        positions[vertexOffset + 2] = worldZ;
        const uvOffset = vertexIndex * 2;
        uvs[uvOffset] = column / patchSegments;
        uvs[uvOffset + 1] = row / patchSegments;
        if (column < patchSegments && row < patchSegments) {
          const a = vertexIndex;
          const b = a + 1;
          const c = a + patchSegments + 1;
          const d = c + 1;
          indices.push(a, b, c, b, d, c);
        }
      }
    }
  });
  if (!patches.length) return;
  const grassGeometry = new THREE.BufferGeometry();
  grassGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  grassGeometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  grassGeometry.setIndex(indices);
  grassGeometry.computeVertexNormals();
  grassGeometry.computeBoundingSphere();
  const grassSurface = new THREE.Mesh(grassGeometry, sharedMaterials.neonDocksGrassPatch);
  grassSurface.name = 'Neon Docks terrain-following grass islands';
  grassSurface.renderOrder = 1;
  grassSurface.userData.skipFlightCollision = true;
  grassSurface.castShadow = false;
  grassSurface.receiveShadow = false;
  environmentRoot.add(grassSurface);

  const bladeCount = patches.length * 5;
  if (!bladeCount) return;
  const bladeGeometry = new THREE.ConeGeometry(0.12, 1, 4);
  const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0x8caf58, roughness: 0.96, emissive: 0x273d18, emissiveIntensity: 0.32, side: THREE.DoubleSide });
  const blades = new THREE.InstancedMesh(bladeGeometry, bladeMaterial, bladeCount);
  blades.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  blades.castShadow = false;
  blades.receiveShadow = false;
  blades.userData.skipFlightCollision = true;
  const windState = new Float32Array(bladeCount * 8);
  const stamp = new THREE.Object3D();
  let bladeIndex = 0;
  for (const patch of patches) {
    for (let blade = 0; blade < 5; blade += 1) {
      const radius = Math.sqrt(random()) * 0.42;
      const angle = random() * Math.PI * 2;
      const x = patch.x + Math.cos(angle) * patch.width * radius * 0.5;
      const z = patch.z + Math.sin(angle) * patch.depth * radius * 0.5;
      const height = 0.2 + random() * 0.22;
      const yaw = random() * Math.PI;
      const scaleX = 0.6 + random() * 0.55;
      const scaleZ = 0.6 + random() * 0.55;
      const centerY = terrainSurfaceYAt('neon-docks', x, z) + height * 0.5;
      stamp.position.set(x, centerY, z);
      stamp.rotation.set(0, yaw, 0);
      stamp.scale.set(scaleX, height, scaleZ);
      stamp.updateMatrix();
      blades.setMatrixAt(bladeIndex, stamp.matrix);
      blades.setColorAt(bladeIndex, new THREE.Color().setHSL(0.25 + random() * 0.07, 0.36 + random() * 0.18, 0.32 + random() * 0.16));
      windState.set([x, centerY, z, yaw, scaleX, height, scaleZ, random() * Math.PI * 2], bladeIndex * 8);
      bladeIndex += 1;
    }
  }
  blades.count = bladeIndex;
  blades.instanceMatrix.needsUpdate = true;
  if (blades.instanceColor) blades.instanceColor.needsUpdate = true;
  environmentRoot.add(blades);
  environmentGrassWindMeshes.push({ mesh: blades, state: windState });
}

function addTerrainRoad(points, width, material, closed = false) {
  const curve = new THREE.CatmullRomCurve3(points.map(([x, z]) => new THREE.Vector3(x, 0, z)), closed, 'centripetal');
  const length = curve.getLength();
  const segments = Math.max(2, Math.ceil(length / 4));
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const uvs = new Float32Array((segments + 1) * 2 * 2);
  const indices = [];
  const center = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  for (let segment = 0; segment <= segments; segment += 1) {
    const t = segment / segments;
    curve.getPointAt(t, center);
    curve.getTangentAt(t, tangent).normalize();
    const sideX = tangent.z;
    const sideZ = -tangent.x;
    const distance = t * length;
    for (let side = 0; side < 2; side += 1) {
      const direction = side === 0 ? 1 : -1;
      const x = center.x + sideX * width * 0.5 * direction;
      const z = center.z + sideZ * width * 0.5 * direction;
      const offset = (segment * 2 + side) * 3;
      positions[offset] = x;
      positions[offset + 1] = terrainSurfaceYAt('neon-docks', x, z) + 0.28;
      positions[offset + 2] = z;
      const uvOffset = (segment * 2 + side) * 2;
      uvs[uvOffset] = side;
      uvs[uvOffset + 1] = distance / width;
    }
    if (segment < segments) {
      const left = segment * 2;
      const right = left + 1;
      const nextLeft = left + 2;
      const nextRight = left + 3;
      indices.push(left, right, nextLeft, right, nextRight, nextLeft);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const road = new THREE.Mesh(geometry, material);
  road.receiveShadow = true;
  road.userData.skipFlightCollision = true;
  environmentRoot.add(road);
  return road;
}

function addNeonDocksOuterRoads() {
  const roadMaterial = sharedMaterials.neonDocksRoad;
  const ringMaterial = sharedMaterials.neonDocksRoadEdge;
  const centerMaterial = sharedMaterials.neonDocksRoadCenter;
  const spokeAngles = Array.from({ length: 8 }, (_, index) => index / 8 * Math.PI * 2 + Math.PI / 8);
  const roadRings = [320, 650];
  const ringPoints = (radius) => Array.from({ length: 192 }, (_, index) => {
    const angle = index / 192 * Math.PI * 2;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius];
  });

  roadRings.forEach((radius) => {
    addTerrainRoad(ringPoints(radius), radius < 1000 ? 20 : 16, roadMaterial, true);
    for (const edgeOffset of [-1, 1]) {
      addTerrainRoad(ringPoints(radius + edgeOffset * (radius < 1000 ? 9.25 : 7.25)), 0.38, ringMaterial, true);
    }
  });

  const dashGeometry = boxGeometry;
  const centerDashes = new THREE.InstancedMesh(dashGeometry, centerMaterial, 8 * 24);
  const reflectors = new THREE.InstancedMesh(dashGeometry, sharedMaterials.cyan, 8 * 5 * 2);
  const stamp = new THREE.Object3D();
  let dashCount = 0;
  let reflectorCount = 0;
  spokeAngles.forEach((angle) => {
    const directionX = Math.cos(angle);
    const directionZ = Math.sin(angle);
    const roadPoints = [230, 320, 650, 880].map((radius) => [directionX * radius, directionZ * radius]);
    addTerrainRoad(roadPoints, 16, roadMaterial);
    for (let radius = 250; radius < 874; radius += 26) {
      const x = directionX * radius;
      const z = directionZ * radius;
      stamp.position.set(x, terrainSurfaceYAt('neon-docks', x, z) + 0.31, z);
      stamp.rotation.set(0, Math.PI / 2 - angle, 0);
      stamp.scale.set(0.18, 0.035, 4.8);
      stamp.updateMatrix();
      centerDashes.setMatrixAt(dashCount++, stamp.matrix);
    }
    for (const radius of [360, 450, 540, 650, 780]) {
      for (const side of [-1, 1]) {
        const x = directionX * radius + directionZ * side * 9.8;
        const z = directionZ * radius - directionX * side * 9.8;
        stamp.position.set(x, terrainSurfaceYAt('neon-docks', x, z) + 0.35, z);
        stamp.rotation.set(0, Math.PI / 2 - angle, 0);
        stamp.scale.set(0.22, 0.08, 0.32);
        stamp.updateMatrix();
        reflectors.setMatrixAt(reflectorCount++, stamp.matrix);
      }
    }
  });
  centerDashes.count = dashCount;
  centerDashes.instanceMatrix.needsUpdate = true;
  centerDashes.userData.skipFlightCollision = true;
  reflectors.count = reflectorCount;
  reflectors.instanceMatrix.needsUpdate = true;
  reflectors.userData.skipFlightCollision = true;
  environmentRoot.add(centerDashes, reflectors);
}

function addNeonDocksRoadsideDetails() {
  const repairs = new THREE.InstancedMesh(boxGeometry, sharedMaterials.neonDocksRoadRepair, 112);
  const drains = new THREE.InstancedMesh(boxGeometry, sharedMaterials.neonDocksDrain, 32);
  const stamp = new THREE.Object3D();
  let repairIndex = 0;
  let drainIndex = 0;
  const addRepair = (x, z, yaw, length, width) => {
    stamp.position.set(x, terrainSurfaceYAt('neon-docks', x, z) + 0.292, z);
    stamp.rotation.set(0, yaw, 0);
    stamp.scale.set(length, 0.018, width);
    stamp.updateMatrix();
    repairs.setMatrixAt(repairIndex, stamp.matrix);
    repairs.setColorAt(repairIndex, new THREE.Color().setHSL(0.48, 0.035, 0.49 + (repairIndex % 4) * 0.035));
    repairIndex += 1;
  };

  for (const radius of [320, 650]) {
    for (let index = 0; index < 24; index += 1) {
      const angle = (index + 0.38) / 24 * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      addRepair(x, z, angle + Math.PI / 2, 2.8 + index % 3, 0.62 + index % 2 * 0.2);
      if (index % 3 === 0) {
        for (const side of [-1, 1]) {
          const grateRadius = radius + side * 8.6;
          const grateX = Math.cos(angle) * grateRadius;
          const grateZ = Math.sin(angle) * grateRadius;
          stamp.position.set(grateX, terrainSurfaceYAt('neon-docks', grateX, grateZ) + 0.3, grateZ);
          stamp.rotation.set(0, angle, 0);
          stamp.scale.set(2.2, 0.045, 0.68);
          stamp.updateMatrix();
          drains.setMatrixAt(drainIndex++, stamp.matrix);
        }
      }
    }
  }

  const spokeAngles = Array.from({ length: 8 }, (_, index) => index / 8 * Math.PI * 2 + Math.PI / 8);
  for (let spoke = 0; spoke < spokeAngles.length; spoke += 1) {
    const angle = spokeAngles[spoke];
    for (const radius of [370, 470, 560, 730, 820]) {
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      addRepair(x, z, angle, 2.7 + (spoke % 3) * 0.6, 0.52 + (spoke % 2) * 0.18);
    }
  }
  repairs.count = repairIndex;
  drains.count = drainIndex;
  repairs.instanceMatrix.needsUpdate = true;
  if (repairs.instanceColor) repairs.instanceColor.needsUpdate = true;
  drains.instanceMatrix.needsUpdate = true;
  repairs.userData.skipFlightCollision = true;
  drains.userData.skipFlightCollision = true;
  repairs.userData.skipShadows = true;
  drains.userData.skipShadows = true;
  environmentRoot.add(repairs, drains);

  // Compact work spots add signs of port activity in open areas between roads.
  const clusterAngles = Array.from({ length: 8 }, (_, index) => Math.PI / 8 + index * Math.PI / 4);
  clusterAngles.forEach((angle, sector) => {
    for (const radius of [390, 560]) {
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius;
      const groundY = terrainSurfaceYAt('neon-docks', x, z);
      const workSpot = new THREE.Group();
      workSpot.position.set(x, groundY, z);
      workSpot.rotation.y = angle + (sector % 2 ? 0.18 : -0.14);
      environmentRoot.add(workSpot);
      box(workSpot, [3.2, 0.22, 2.2], [-1.4, 0.13, 0.4], 'roof');
      box(workSpot, [2.9, 0.18, 0.28], [-1.4, 0.33, -0.42], 'ochre');
      box(workSpot, [2.9, 0.18, 0.28], [-1.4, 0.33, 0.78], 'ochre');
      box(workSpot, [0.22, 0.18, 1.2], [-2.72, 0.33, 0.18], 'ochre');
      box(workSpot, [0.22, 0.18, 1.2], [-0.08, 0.33, 0.18], 'ochre');
      const barrel = cylinder(workSpot, 0.46, 0.48, 1.2, [2, 0.6, -0.4], sector % 2 ? 'rust' : 'ochre', 9);
      barrel.userData.skipShadows = true;
      box(workSpot, [1.1, 1.05, 1.1], [2.1, 0.53, 1.3], 'concrete');
      const rock = new THREE.Mesh(new THREE.IcosahedronGeometry(0.75, 0), sharedMaterials.steel);
      rock.position.set(-3.1, 0.46, 1.7);
      rock.scale.set(1.35, 0.72, 1.1);
      rock.rotation.set(sector * 0.11, sector * 0.48, 0.08);
      rock.userData.skipShadows = true;
      workSpot.add(rock);
      workSpot.traverse((node) => { if (node.isMesh) node.userData.skipShadows = true; });
    }
  });
}

function addNeonDocksMountains() {
  const peakGeometry = new THREE.ConeGeometry(1, 1, 7, 2);
  const peakCount = 36;
  const peaks = new THREE.InstancedMesh(peakGeometry, sharedMaterials.neonDocksMountain, peakCount);
  const stamp = new THREE.Object3D();
  let seed = 0x19c0ffee;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let index = 0; index < peakCount; index += 1) {
    const angle = index / peakCount * Math.PI * 2 + (random() - 0.5) * 0.075;
    const centerRadius = 900 + random() * 95;
    const radius = 78 + random() * 62;
    const height = 130 + random() * 145;
    const x = Math.cos(angle) * centerRadius;
    const z = Math.sin(angle) * centerRadius;
    let baseY = terrainSurfaceYAt('neon-docks', x, z);
    for (let sample = 0; sample < 10; sample += 1) {
      const sampleAngle = sample / 10 * Math.PI * 2;
      const sampleX = x + Math.cos(sampleAngle) * radius * 0.9;
      const sampleZ = z + Math.sin(sampleAngle) * radius * 0.9;
      baseY = Math.min(baseY, terrainSurfaceYAt('neon-docks', sampleX, sampleZ));
    }
    const mountainBaseY = baseY - 4;
    stamp.position.set(x, mountainBaseY + height / 2, z);
    stamp.rotation.set((random() - 0.5) * 0.08, random() * Math.PI * 2, (random() - 0.5) * 0.08);
    stamp.scale.set(radius, height, radius * (0.72 + random() * 0.42));
    stamp.updateMatrix();
    peaks.setMatrixAt(index, stamp.matrix);
    peaks.setColorAt(index, new THREE.Color().setHSL(0.60 + random() * 0.025, 0.22 + random() * 0.14, 0.18 + random() * 0.09));
  }
  peaks.instanceMatrix.needsUpdate = true;
  if (peaks.instanceColor) peaks.instanceColor.needsUpdate = true;
  peaks.userData.skipShadows = true;
  peaks.name = 'Neon Docks distant mountain range';
  environmentRoot.add(peaks);
}

function addNeonDocksWetPatches() {
  const wetMaterial = new THREE.MeshPhysicalMaterial({
    color: 0x536976,
    roughness: 0.12,
    metalness: 0.24,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
    side: THREE.DoubleSide,
  });
  const puddles = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20), wetMaterial, 18);
  const stamp = new THREE.Object3D();
  const locations = [
    [-64, -58, 9, 3.2, -0.25], [-26, -72, 6.5, 2.5, 0.4], [44, -66, 10, 3.4, 0.18],
    [78, -28, 7.5, 2.8, -0.55], [-82, -18, 8, 3, 0.32], [-48, 24, 5.8, 2.1, -0.4],
    [64, 22, 9.5, 2.8, 0.3], [18, 67, 8.5, 3.1, -0.2], [-110, 48, 10, 3.6, 0.45],
    [118, -54, 9, 2.8, -0.3], [-132, -68, 7, 2.7, 0.2], [138, 92, 10, 3.2, -0.4],
    [-22, 124, 8, 2.6, 0.25], [74, 142, 9.5, 3.3, -0.3], [-160, 22, 8.5, 2.8, 0.5],
    [166, -126, 11, 3.8, -0.15], [190, 52, 8, 2.5, 0.35], [-182, -148, 9, 3.1, -0.45],
  ];
  const clearOfCanal = locations.filter(([x, z]) => neonDocksCanalProjection(x, z).distance > 40);
  clearOfCanal.forEach(([x, z, width, depth, yaw], index) => {
    stamp.position.set(x, Math.max(terrainSurfaceYAt('neon-docks', x, z), -0.045) + 0.018, z);
    stamp.rotation.set(-Math.PI / 2, yaw, 0);
    stamp.scale.set(width, depth, 1);
    stamp.updateMatrix();
    puddles.setMatrixAt(index, stamp.matrix);
    puddles.setColorAt(index, new THREE.Color().setHSL(0.54 + (index % 3) * 0.018, 0.17 + (index % 2) * 0.05, 0.36 + (index % 4) * 0.025));
  });
  puddles.count = clearOfCanal.length;
  puddles.instanceMatrix.needsUpdate = true;
  if (puddles.instanceColor) puddles.instanceColor.needsUpdate = true;
  puddles.userData.skipFlightCollision = true;
  puddles.userData.skipShadows = true;
  environmentRoot.add(puddles);
}

function addNeonDocksCanal() {
  const canalCurve = new THREE.CatmullRomCurve3(neonDocksCanalPath.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  const canalLength = canalCurve.getLength();
  const segments = 180;
  const addCanalRibbon = (width, material, lateralOffset, surfaceHeight) => {
    const positions = new Float32Array((segments + 1) * 2 * 3);
    const uvs = new Float32Array((segments + 1) * 2 * 2);
    const indices = [];
    const center = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    for (let segment = 0; segment <= segments; segment += 1) {
      const t = segment / segments;
      canalCurve.getPointAt(t, center);
      canalCurve.getTangentAt(t, tangent).normalize();
      const sideX = tangent.z;
      const sideZ = -tangent.x;
      for (let side = 0; side < 2; side += 1) {
        const direction = side === 0 ? 1 : -1;
        const x = center.x + sideX * (lateralOffset + width * 0.5 * direction);
        const z = center.z + sideZ * (lateralOffset + width * 0.5 * direction);
        const offset = (segment * 2 + side) * 3;
        positions[offset] = x;
        positions[offset + 1] = surfaceHeight(x, z, t);
        positions[offset + 2] = z;
        const uvOffset = (segment * 2 + side) * 2;
        uvs[uvOffset] = side;
        uvs[uvOffset + 1] = t * canalLength / width;
      }
      if (segment < segments) {
        const left = segment * 2;
        const right = left + 1;
        indices.push(left, right, left + 2, right, right + 2, left + 2);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    const ribbon = new THREE.Mesh(geometry, material);
    ribbon.receiveShadow = true;
    ribbon.userData.skipFlightCollision = true;
    environmentRoot.add(ribbon);
    return ribbon;
  };

  addCanalRibbon(54.8, sharedMaterials.neonDocksWater, 0, (_x, _z, t) => neonDocksCanalWaterLevel(t));
  for (const side of [-1, 1]) {
    addCanalRibbon(9, sharedMaterials.neonDocksQuay, side * 53, (x, z) => terrainSurfaceYAt('neon-docks', x, z) + 0.07);
  }

  // Retaining walls give the lowered channel a clear edge and keep the water
  // visually connected to its banks instead of reading as a floating strip.
  for (const side of [-1, 1]) {
    const wallPositions = new Float32Array((segments + 1) * 2 * 3);
    const wallUvs = new Float32Array((segments + 1) * 2 * 2);
    const wallIndices = [];
    const wallOffset = side * 27.4;
    const bankOffset = side * 48;
    const center = new THREE.Vector3();
    const tangent = new THREE.Vector3();
    for (let segment = 0; segment <= segments; segment += 1) {
      const t = segment / segments;
      canalCurve.getPointAt(t, center);
      canalCurve.getTangentAt(t, tangent).normalize();
      const sideX = tangent.z;
      const sideZ = -tangent.x;
      const lowerX = center.x + sideX * wallOffset;
      const lowerZ = center.z + sideZ * wallOffset;
      const upperX = lowerX;
      const upperZ = lowerZ;
      const bottomY = neonDocksCanalWaterLevel(t) - 0.86;
      const bankX = center.x + sideX * bankOffset;
      const bankZ = center.z + sideZ * bankOffset;
      const topY = Math.max(bottomY + 0.25, terrainSurfaceYAt('neon-docks', bankX, bankZ));
      const offset = segment * 6;
      wallPositions[offset] = lowerX;
      wallPositions[offset + 1] = bottomY;
      wallPositions[offset + 2] = lowerZ;
      wallPositions[offset + 3] = upperX;
      wallPositions[offset + 4] = topY;
      wallPositions[offset + 5] = upperZ;
      wallUvs[segment * 4] = 0;
      wallUvs[segment * 4 + 1] = t * canalLength / 8;
      wallUvs[segment * 4 + 2] = 1;
      wallUvs[segment * 4 + 3] = t * canalLength / 8;
      if (segment < segments) {
        const lower = segment * 2;
        const upper = lower + 1;
        if (side > 0) wallIndices.push(lower, lower + 2, upper, upper, lower + 2, upper + 2);
        else wallIndices.push(lower, upper, lower + 2, upper, upper + 2, lower + 2);
      }
    }
    const wallGeometry = new THREE.BufferGeometry();
    wallGeometry.setAttribute('position', new THREE.BufferAttribute(wallPositions, 3));
    wallGeometry.setAttribute('uv', new THREE.BufferAttribute(wallUvs, 2));
    wallGeometry.setIndex(wallIndices);
    wallGeometry.computeVertexNormals();
    const wall = new THREE.Mesh(wallGeometry, sharedMaterials.neonDocksQuay);
    wall.name = `Canal retaining wall ${side < 0 ? 'south' : 'north'} bank`;
    wall.receiveShadow = true;
    environmentRoot.add(wall);

    addCanalRibbon(1.35, sharedMaterials.neonDocksQuay, side * 27.4, (_x, _z, t) => {
      canalCurve.getPointAt(t, center);
      canalCurve.getTangentAt(t, tangent).normalize();
      const bankX = center.x + tangent.z * side * 48;
      const bankZ = center.z - tangent.x * side * 48;
      return Math.max(neonDocksCanalWaterLevel(t) + 0.22, terrainSurfaceYAt('neon-docks', bankX, bankZ)) + 0.07;
    });
  }

  const glints = new THREE.InstancedMesh(boxGeometry, sharedMaterials.neonDocksWaterMark, 80);
  const glintStamp = new THREE.Object3D();
  for (let index = 0; index < glints.count; index += 1) {
    const t = (index + 0.5) / glints.count;
    const point = canalCurve.getPointAt(t);
    const tangent = canalCurve.getTangentAt(t).normalize();
    const lateral = ((index * 17) % 31 - 15) * 0.86;
    const x = point.x + tangent.z * lateral;
    const z = point.z - tangent.x * lateral;
    glintStamp.position.set(x, neonDocksCanalWaterLevel(t) + 0.025, z);
    glintStamp.rotation.set(0, Math.atan2(-tangent.z, tangent.x), 0);
    glintStamp.scale.set(1.4 + (index % 5) * 0.58, 0.009, 0.055);
    glintStamp.updateMatrix();
    glints.setMatrixAt(index, glintStamp.matrix);
  }
  glints.instanceMatrix.needsUpdate = true;
  glints.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  glints.userData.skipFlightCollision = true;
  environmentRoot.add(glints);
  neonDocksWaterAnimation = { mesh: glints, curve: canalCurve, count: glints.count };
}

function addNeonDocksCanalBridges() {
  const canalZAtX = (x) => {
    for (let index = 0; index < neonDocksCanalPath.length - 1; index += 1) {
      const [startX, startZ] = neonDocksCanalPath[index];
      const [endX, endZ] = neonDocksCanalPath[index + 1];
      if (x < startX || x > endX) continue;
      const t = (x - startX) / (endX - startX);
      return THREE.MathUtils.lerp(startZ, endZ, t);
    }
    return 0;
  };
  const offsets = [-72, -58, -44, -22, 0, 22, 44, 58, 72];
  for (const radius of [320, 650]) {
    for (const side of [-1, 1]) {
      const x = side * radius;
      const centerZ = canalZAtX(x);
      const bankY = (terrainSurfaceYAt('neon-docks', x, centerZ - 72) + terrainSurfaceYAt('neon-docks', x, centerZ + 72)) * 0.5 + 0.28;
      const bridgeTopY = bankY + 0.55;
      const positions = new Float32Array(offsets.length * 2 * 3);
      const uvs = new Float32Array(offsets.length * 2 * 2);
      const indices = [];
      offsets.forEach((offset, row) => {
        const distance = Math.abs(offset);
        const ramp = THREE.MathUtils.clamp((distance - 44) / 28, 0, 1);
        const y = THREE.MathUtils.lerp(bridgeTopY, bankY, ramp);
        for (let edge = 0; edge < 2; edge += 1) {
          const vertex = row * 2 + edge;
          const vertexOffset = vertex * 3;
          positions[vertexOffset] = x + (edge === 0 ? -14 : 14);
          positions[vertexOffset + 1] = y;
          positions[vertexOffset + 2] = centerZ + offset;
          const uvOffset = vertex * 2;
          uvs[uvOffset] = edge;
          uvs[uvOffset + 1] = row / (offsets.length - 1) * 7;
        }
        if (row < offsets.length - 1) {
          const left = row * 2;
          indices.push(left, left + 2, left + 1, left + 1, left + 2, left + 3);
        }
      });
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      geometry.setIndex(indices);
      geometry.computeVertexNormals();
      const deck = new THREE.Mesh(geometry, sharedMaterials.neonDocksRoad);
      deck.name = `Canal road bridge ${side < 0 ? 'west' : 'east'} / ${radius}`;
      deck.receiveShadow = true;
      environmentRoot.add(deck);

      for (const railSide of [-1, 1]) {
        const rail = box(environmentRoot, [0.2, 0.72, 82], [x + railSide * 13.45, bridgeTopY + 0.38, centerZ], 'steel');
        rail.userData.skipFlightCollision = true;
        rail.userData.skipShadows = true;
        for (const offset of [-34, -12, 12, 34]) {
          const post = box(environmentRoot, [0.22, 0.9, 0.22], [x + railSide * 13.45, bridgeTopY + 0.4, centerZ + offset], 'cyan');
          post.userData.skipFlightCollision = true;
          post.userData.skipShadows = true;
        }
      }
      for (const offset of [-20, 20]) {
        const pier = box(environmentRoot, [1.3, 1.6, 1.3], [x, bridgeTopY - 1.1, centerZ + offset], 'concrete');
        pier.userData.skipFlightCollision = true;
        pier.userData.skipShadows = true;
      }
    }
  }
}

function updateNeonDocksWaterAnimation(time) {
  const state = neonDocksWaterAnimation;
  if (!state?.mesh?.visible) return;
  const stamp = new THREE.Object3D();
  for (let index = 0; index < state.count; index += 1) {
    const flow = (index / state.count + time * 0.018) % 1;
    const point = state.curve.getPointAt(flow);
    const tangent = state.curve.getTangentAt(flow).normalize();
    const lateral = ((index * 17) % 31 - 15) * 0.86 + Math.sin(time * 0.7 + index * 1.8) * 0.35;
    const x = point.x + tangent.z * lateral;
    const z = point.z - tangent.x * lateral;
    stamp.position.set(x, neonDocksCanalWaterLevel(flow) + 0.025 + Math.sin(time * 1.6 + index) * 0.012, z);
    stamp.rotation.set(0, Math.atan2(-tangent.z, tangent.x), 0);
    stamp.scale.set(1.8 + (index % 4) * 0.65, 0.012, 0.075);
    stamp.updateMatrix();
    state.mesh.setMatrixAt(index, stamp.matrix);
  }
  state.mesh.instanceMatrix.needsUpdate = true;
}

function addNeonDocksCanalServiceRoads() {
  const canalCurve = new THREE.CatmullRomCurve3(neonDocksCanalPath.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
  for (const side of [-1, 1]) {
    const roadPoints = [];
    for (let index = 0; index <= 24; index += 1) {
      const point = canalCurve.getPointAt(index / 24);
      const tangent = canalCurve.getTangentAt(index / 24).normalize();
      const offset = side * 79;
      roadPoints.push([point.x + tangent.z * offset, point.z - tangent.x * offset]);
    }
    addTerrainRoad(roadPoints, 12, sharedMaterials.neonDocksRoad);
  }
}

function addNeonDocks() {
  addGround('neonDocksGrassGround', 2200);
  addNeonDocksCanal();
  addNeonDocksCanalServiceRoads();
  addNeonDocksMountains();
}
function addNeonCity() {
  const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x202d39, roughness: 0.98, metalness: 0.04, flatShading: true });
  const streetMaterial = new THREE.MeshStandardMaterial({ color: 0x111a24, roughness: 0.94, metalness: 0.08 });
  const markingMaterial = new THREE.MeshStandardMaterial({ color: 0xc4b995, roughness: 0.86, emissive: 0x282216, emissiveIntensity: 0.22 });
  const shellMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x1b2d3f, roughness: 0.84, metalness: 0.14, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x29394a, roughness: 0.78, metalness: 0.18, flatShading: true }),
    new THREE.MeshStandardMaterial({ color: 0x354456, roughness: 0.72, metalness: 0.2, flatShading: true }),
  ];
  const capMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x314156, roughness: 0.72, metalness: 0.2 }),
    new THREE.MeshStandardMaterial({ color: 0x374457, roughness: 0.7, metalness: 0.22 }),
    new THREE.MeshStandardMaterial({ color: 0x3e4a5b, roughness: 0.68, metalness: 0.24 }),
  ];
  const roofUnitMaterial = new THREE.MeshStandardMaterial({ color: 0x111d2a, roughness: 0.62, metalness: 0.38 });
  const windowMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x4b9bb1, emissive: 0x174654, emissiveIntensity: 0.72, roughness: 0.38, metalness: 0.14 }),
    new THREE.MeshStandardMaterial({ color: 0xb28b55, emissive: 0x4e3215, emissiveIntensity: 0.62, roughness: 0.44, metalness: 0.12 }),
    new THREE.MeshStandardMaterial({ color: 0xa95384, emissive: 0x501c3d, emissiveIntensity: 0.58, roughness: 0.4, metalness: 0.12 }),
  ];
  const accentMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x4bd8e9, emissive: 0x158198, emissiveIntensity: 0.92, roughness: 0.36, metalness: 0.12 }),
    new THREE.MeshStandardMaterial({ color: 0xee62b5, emissive: 0x781d55, emissiveIntensity: 0.78, roughness: 0.38, metalness: 0.12 }),
  ];
  const windowFrameMaterial = new THREE.MeshStandardMaterial({ color: 0x111d2c, roughness: 0.56, metalness: 0.3 });
  const storefrontMaterial = new THREE.MeshStandardMaterial({ color: 0x326b7a, emissive: 0x0b2b34, emissiveIntensity: 0.55, roughness: 0.24, metalness: 0.26 });
  if (!citySignTextures) {
    citySignTextures = [
      ['NOVA', 'HOTEL 08', '#58e5ff'],
      ['KAIRO', 'MARKET', '#ff69bb'],
      ['AERO', 'FINANCIAL', '#ffcb72'],
      ['VYPR', 'NIGHT CAFE', '#b9ff78'],
    ].map(([brand, subtitle, accent]) => {
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 160;
      const context = canvas.getContext('2d');
      const background = context.createLinearGradient(0, 0, 512, 160);
      background.addColorStop(0, '#0b1424');
      background.addColorStop(1, '#1c2a3d');
      context.fillStyle = background;
      context.fillRect(0, 0, 512, 160);
      context.strokeStyle = accent;
      context.lineWidth = 7;
      context.strokeRect(9, 9, 494, 142);
      context.fillStyle = accent;
      context.font = '700 52px Arial, sans-serif';
      context.textAlign = 'left';
      context.textBaseline = 'middle';
      context.fillText(brand, 30, 66);
      context.fillStyle = '#dcecf1';
      context.font = '700 24px Arial, sans-serif';
      context.fillText(subtitle, 32, 119);
      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
      return texture;
    });
  }
  const billboardMeshes = citySignTextures.map((texture) => new THREE.InstancedMesh(
    boxGeometry,
    new THREE.MeshBasicMaterial({ map: texture, toneMapped: false }),
    120,
  ));
  const cityGround = createReliefSurface(4200, 4200, groundMaterial, { biomeId: 'neon-city', y: -0.055, segments: 320 });
  environmentRoot.add(cityGround);

  const roads = new THREE.InstancedMesh(boxGeometry, streetMaterial, 14);
  const laneDashes = new THREE.InstancedMesh(boxGeometry, markingMaterial, 320);
  const stamp = new THREE.Object3D();
  const roadLines = [-180, -120, -60, 0, 60, 120, 180];
  let roadIndex = 0;
  let dashIndex = 0;
  roadLines.forEach((line) => {
    stamp.position.set(0, -0.07, line);
    stamp.scale.set(420, 0.1, 18);
    stamp.rotation.set(0, 0, 0);
    stamp.updateMatrix();
    roads.setMatrixAt(roadIndex++, stamp.matrix);
    stamp.position.set(line, -0.07, 0);
    stamp.scale.set(18, 0.1, 420);
    stamp.updateMatrix();
    roads.setMatrixAt(roadIndex++, stamp.matrix);

    for (let position = -190; position <= 190; position += 22) {
      stamp.position.set(position, -0.005, line);
      stamp.scale.set(3.8, 0.035, 0.14);
      stamp.rotation.set(0, 0, 0);
      stamp.updateMatrix();
      laneDashes.setMatrixAt(dashIndex++, stamp.matrix);
      stamp.position.set(line, -0.005, position);
      stamp.scale.set(0.14, 0.035, 3.8);
      stamp.updateMatrix();
      laneDashes.setMatrixAt(dashIndex++, stamp.matrix);
    }
  });
  roads.instanceMatrix.needsUpdate = true;
  laneDashes.count = dashIndex;
  laneDashes.instanceMatrix.needsUpdate = true;
  environmentRoot.add(roads, laneDashes);
  const outerRoad = new THREE.Mesh(new THREE.RingGeometry(184, 202, 256), streetMaterial);
  outerRoad.rotation.x = -Math.PI / 2;
  outerRoad.position.y = -0.005;
  environmentRoot.add(outerRoad);
  for (const radius of [184.8, 201.2]) {
    const edge = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.12, 5, 256), markingMaterial);
    edge.rotation.x = Math.PI / 2;
    edge.position.y = 0.04;
    environmentRoot.add(edge);
  }

  const blockCenters = [-150, -90, -30, 30, 90, 150];

  const curbMeshes = new THREE.InstancedMesh(boxGeometry, capMaterials[0], 144);
  const crossingMaterial = new THREE.MeshStandardMaterial({ color: 0xc5d2d4, roughness: 0.72, emissive: 0x182329, emissiveIntensity: 0.18 });
  const crosswalkBars = new THREE.InstancedMesh(boxGeometry, crossingMaterial, 800);
  let curbIndex = 0, crossingIndex = 0;
  roadLines.forEach((streetX) => roadLines.forEach((streetZ) => {
    const mainAvenueCrossing = streetX === 0 || streetZ === 0;
    const districtCrossing = Math.abs(streetX) === 120 && Math.abs(streetZ) === 120;
    if (!mainAvenueCrossing && !districtCrossing) return;
    for (const side of [-1, 1]) {
      for (let stripe = -3; stripe <= 3; stripe += 1) {
        stamp.position.set(streetX + side * 10.2 + stripe * 0.94, 0.025, streetZ);
        stamp.scale.set(0.62, 0.055, 14.5);
        stamp.rotation.set(0, 0, 0);
        stamp.updateMatrix();
        crosswalkBars.setMatrixAt(crossingIndex++, stamp.matrix);
        stamp.position.set(streetX, 0.025, streetZ + side * 10.2 + stripe * 0.94);
        stamp.scale.set(14.5, 0.055, 0.62);
        stamp.updateMatrix();
        crosswalkBars.setMatrixAt(crossingIndex++, stamp.matrix);
      }
    }
  }));
  for (const z of blockCenters) {
    for (const x of blockCenters) {
      for (const side of [-1, 1]) {
        stamp.position.set(x, 0.075, z + side * 21.5);
        stamp.scale.set(43, 0.22, 0.42);
        stamp.rotation.set(0, 0, 0);
        stamp.updateMatrix();
        curbMeshes.setMatrixAt(curbIndex++, stamp.matrix);
        stamp.position.set(x + side * 21.5, 0.075, z);
        stamp.scale.set(0.42, 0.22, 43);
        stamp.updateMatrix();
        curbMeshes.setMatrixAt(curbIndex++, stamp.matrix);
      }
    }
  }
  curbMeshes.instanceMatrix.needsUpdate = true;
  crosswalkBars.count = crossingIndex;
  crosswalkBars.instanceMatrix.needsUpdate = true;
  curbMeshes.userData.skipShadows = true;
  crosswalkBars.userData.skipShadows = true;
  environmentRoot.add(curbMeshes, crosswalkBars);

  // Keep the city streets and a small set of trees, but leave its blocks open
  // for the user's own course props and buildings.
  const cityTreeTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.22, 0.3, 3.4, 7), new THREE.MeshStandardMaterial({ color: 0x594b43, roughness: 0.94 }), 16);
  const cityTreeCanopies = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.1, 1), new THREE.MeshStandardMaterial({ color: 0x286a60, roughness: 0.88, flatShading: true }), 16);
  const treeStamp = new THREE.Object3D();
  const treeCenters = [-90, 90].flatMap((x) => [-90, 90].map((z) => [x, z]));
  treeCenters.forEach(([x, z], parkIndex) => {
    const groundY = terrainSurfaceYAt('neon-city', x, z);
    for (const dx of [-9, 9]) {
      for (const dz of [-9, 9]) {
        const treeIndex = parkIndex * 4 + (dx > 0 ? 2 : 0) + (dz > 0 ? 1 : 0);
        treeStamp.position.set(x + dx, groundY + 1.7, z + dz);
        treeStamp.scale.set(1, 1, 1);
        treeStamp.updateMatrix();
        cityTreeTrunks.setMatrixAt(treeIndex, treeStamp.matrix);
        treeStamp.position.y = groundY + 4.35;
        treeStamp.updateMatrix();
        cityTreeCanopies.setMatrixAt(treeIndex, treeStamp.matrix);
      }
    }
  });
  cityTreeTrunks.instanceMatrix.needsUpdate = cityTreeCanopies.instanceMatrix.needsUpdate = true;
  cityTreeTrunks.userData.flightCollisionHorizontalPadding = 2.7;
  cityTreeTrunks.userData.flightCollisionHeight = 8;
  cityTreeCanopies.userData.skipFlightCollision = true;
  cityTreeTrunks.userData.skipShadows = cityTreeCanopies.userData.skipShadows = true;
  environmentRoot.add(cityTreeTrunks, cityTreeCanopies);
  return;

  const buildingCapacity = 180;
  const bodyMeshes = shellMaterials.map((material) => new THREE.InstancedMesh(boxGeometry, material, buildingCapacity));
  const upperMeshes = shellMaterials.map((material) => new THREE.InstancedMesh(boxGeometry, material, buildingCapacity));
  const capMeshes = capMaterials.map((material) => new THREE.InstancedMesh(boxGeometry, material, buildingCapacity));
  const roofUnits = new THREE.InstancedMesh(boxGeometry, roofUnitMaterial, buildingCapacity * 5);
  const signs = accentMaterials.map((material) => new THREE.InstancedMesh(boxGeometry, material, buildingCapacity));
  const windowMeshes = windowMaterials.map((material) => new THREE.InstancedMesh(boxGeometry, material, 16000));
  const buildingDetails = [
    new THREE.InstancedMesh(boxGeometry, capMaterials[0], 12000),
    new THREE.InstancedMesh(boxGeometry, capMaterials[2], 2400),
    new THREE.InstancedMesh(boxGeometry, windowFrameMaterial, 18000),
    new THREE.InstancedMesh(boxGeometry, storefrontMaterial, 720),
    new THREE.InstancedMesh(boxGeometry, windowFrameMaterial, 2500),
    ...accentMaterials.map((material) => new THREE.InstancedMesh(boxGeometry, material, 500)),
    new THREE.InstancedMesh(boxGeometry, roofUnitMaterial, 220),
    new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.2, 6, 6), capMaterials[1], 400),
    new THREE.InstancedMesh(boxGeometry, new THREE.MeshStandardMaterial({ color: 0xa9c2c8, roughness: 0.78, emissive: 0x263c40, emissiveIntensity: 0.32 }), 900),
    ...billboardMeshes,
    new THREE.InstancedMesh(boxGeometry, capMaterials[1], 900),
    new THREE.InstancedMesh(boxGeometry, capMaterials[0], 2600),
  ];
  const distantGlassMaterial = new THREE.MeshStandardMaterial({ color: 0x70cde2, emissive: 0x174d61, emissiveIntensity: 0.78, roughness: 0.24, metalness: 0.28 });
  const skylineGlass = new THREE.InstancedMesh(boxGeometry, distantGlassMaterial, 6000);
  const skylineFins = new THREE.InstancedMesh(boxGeometry, capMaterials[1], 5000);
  const skylineBands = accentMaterials.map((material) => new THREE.InstancedMesh(boxGeometry, material, 2400));
  const skylineCrowns = new THREE.InstancedMesh(boxGeometry, roofUnitMaterial, 800);
  const skylineSpires = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.08, 0.44, 1, 8), accentMaterials[0], 240);
  const skylineFeatureMeshes = [skylineGlass, skylineFins, ...skylineBands, skylineCrowns, skylineSpires];
  const skylineFeatureCounts = new Map(skylineFeatureMeshes.map((mesh) => [mesh, 0]));
  const buildingDetailCounts = new Map(buildingDetails.map((mesh) => [mesh, 0]));
  const bodyCounts = [0, 0, 0];
  const upperCounts = [0, 0, 0];
  const capCounts = [0, 0, 0];
  const signCounts = [0, 0];
  const windowCounts = [0, 0, 0];
  const roofUnitCount = { value: 0 };
  const worldUp = new THREE.Vector3(0, 1, 0);
  const localPoint = new THREE.Vector3();
  const cityRandomSeed = { value: 28741 };
  const random = () => {
    cityRandomSeed.value = (cityRandomSeed.value * 16807) % 2147483647;
    return (cityRandomSeed.value - 1) / 2147483646;
  };
  const addBuildingDetail = (mesh, position, size, yaw = 0) => {
    const count = buildingDetailCounts.get(mesh) || 0;
    stamp.position.set(position[0], position[1], position[2]);
    stamp.rotation.set(0, yaw, 0);
    stamp.scale.set(size[0], size[1], size[2]);
    stamp.updateMatrix();
    mesh.setMatrixAt(count, stamp.matrix);
    buildingDetailCounts.set(mesh, count + 1);
  };
  const addSkylineFeature = (mesh, position, size, yaw = 0) => {
    const count = skylineFeatureCounts.get(mesh) || 0;
    stamp.position.set(position[0], position[1], position[2]);
    stamp.rotation.set(0, yaw, 0);
    stamp.scale.set(size[0], size[1], size[2]);
    stamp.updateMatrix();
    mesh.setMatrixAt(count, stamp.matrix);
    skylineFeatureCounts.set(mesh, count + 1);
  };
  const addBuilding = (x, z, width, depth, height, rotation = 0, detailed = true) => {
    width *= 1.35;
    depth *= 1.35;
    height *= 1.25;
    const groundY = terrainSurfaceYAt('neon-city', x, z);
    const style = Math.floor(random() * shellMaterials.length);
    const baseHeight = detailed ? height * (0.62 + random() * 0.1) : height * 0.72;
    const upperHeight = height - baseHeight;
    const upperWidth = width * (0.58 + random() * 0.24);
    const upperDepth = depth * (0.58 + random() * 0.24);
    const offsetX = (random() - 0.5) * width * 0.12;
    const offsetZ = (random() - 0.5) * depth * 0.12;
    const rotateLocal = (localX, localZ) => {
      localPoint.set(localX, 0, localZ).applyAxisAngle(worldUp, rotation);
      return [x + localPoint.x, z + localPoint.z];
    };
    const addLocalDetail = (mesh, localX, localY, localZ, size, yawOffset = 0) => {
      const position = rotateLocal(localX, localZ);
      addBuildingDetail(mesh, [position[0], groundY + localY, position[1]], size, rotation + yawOffset);
    };
    const addSkylineLocal = (mesh, localX, localY, localZ, size, yawOffset = 0) => {
      const position = rotateLocal(localX, localZ);
      addSkylineFeature(mesh, [position[0], groundY + localY, position[1]], size, rotation + yawOffset);
    };

    const bodyIndex = bodyCounts[style]++;
    stamp.position.set(x, groundY + baseHeight / 2, z);
    stamp.rotation.set(0, rotation, 0);
    stamp.scale.set(width, baseHeight, depth);
    stamp.updateMatrix();
    bodyMeshes[style].setMatrixAt(bodyIndex, stamp.matrix);

    const upperPosition = rotateLocal(offsetX, offsetZ);
    stamp.position.set(upperPosition[0], groundY + baseHeight + upperHeight / 2, upperPosition[1]);
    stamp.rotation.set(0, rotation, 0);
    stamp.scale.set(upperWidth, upperHeight, upperDepth);
    stamp.updateMatrix();
    upperMeshes[style].setMatrixAt(upperCounts[style]++, stamp.matrix);

    stamp.position.set(upperPosition[0], groundY + height + 0.28, upperPosition[1]);
    stamp.scale.set(upperWidth + 0.8, 0.56, upperDepth + 0.8);
    stamp.updateMatrix();
    capMeshes[style].setMatrixAt(capCounts[style]++, stamp.matrix);

    const rooftopPosition = rotateLocal(offsetX, offsetZ);
    stamp.position.set(rooftopPosition[0], groundY + height + 1.08, rooftopPosition[1]);
    stamp.scale.set(Math.min(3.8, width * 0.26), 1.05, Math.min(3.2, depth * 0.22));
    stamp.updateMatrix();
    roofUnits.setMatrixAt(roofUnitCount.value++, stamp.matrix);

    if (random() > 0.76) {
      const signFace = Math.floor(random() * 4);
      const signY = groundY + height * (0.32 + random() * 0.18);
      let localX = 0, localZ = 0, faceRotation = 0;
      if (signFace === 0) { localX = width / 2 + 0.12; localZ = (random() - 0.5) * depth * 0.52; faceRotation = Math.PI / 2; }
      else if (signFace === 1) { localX = -width / 2 - 0.12; localZ = (random() - 0.5) * depth * 0.52; faceRotation = -Math.PI / 2; }
      else if (signFace === 2) { localX = (random() - 0.5) * width * 0.52; localZ = depth / 2 + 0.12; }
      else { localX = (random() - 0.5) * width * 0.52; localZ = -depth / 2 - 0.12; faceRotation = Math.PI; }
      const signPosition = rotateLocal(localX, localZ);
      const signIndex = Math.floor(random() * signs.length);
      stamp.position.set(signPosition[0], signY, signPosition[1]);
      stamp.rotation.set(0, rotation + faceRotation, 0);
      stamp.scale.set(0.22, Math.min(12, height * 0.42), 0.12);
      stamp.updateMatrix();
      signs[signIndex].setMatrixAt(signCounts[signIndex]++, stamp.matrix);
      if (detailed && random() > 0.54) {
        const billboard = billboardMeshes[Math.floor(random() * billboardMeshes.length)];
        addBuildingDetail(billboard, [signPosition[0], signY, signPosition[1]], [5.6, 1.75, 0.34], rotation + faceRotation);
      }
    }

    if (!detailed) {
      const accentBand = skylineBands[random() > 0.72 ? 1 : 0];
      const frontFaces = [-1, 1];
      const upperBaseY = baseHeight + upperHeight * 0.5;
      const buildingCorners = [
        [-1, -1], [-1, 1], [1, -1], [1, 1],
      ];

      // Tall horizon towers get a glazed center, strong corner structure, and lit floor bands.
      frontFaces.forEach((side) => {
        for (const panel of [-0.3, 0, 0.3]) {
          addSkylineLocal(skylineGlass, panel * width, baseHeight * 0.5, side * (depth / 2 + 0.12), [width * 0.12, baseHeight * 0.72, 0.14]);
          addSkylineLocal(skylineGlass, offsetX + panel * upperWidth, upperBaseY, offsetZ + side * (upperDepth / 2 + 0.12), [upperWidth * 0.13, upperHeight * 0.72, 0.14]);
        }
        for (const bandY of [baseHeight * 0.28, baseHeight * 0.68, baseHeight - 0.4, height - 0.5]) {
          const upperTier = bandY > baseHeight;
          const faceWidth = upperTier ? upperWidth : width;
          const faceDepth = upperTier ? upperDepth : depth;
          const faceX = upperTier ? offsetX : 0;
          const faceZ = upperTier ? offsetZ : 0;
          addSkylineLocal(accentBand, faceX, bandY, faceZ + side * (faceDepth / 2 + 0.18), [faceWidth + 0.45, 0.16, 0.24]);
          addSkylineLocal(accentBand, faceX + side * (faceWidth / 2 + 0.18), bandY, faceZ, [faceDepth + 0.45, 0.16, 0.24], Math.PI / 2);
        }
      });

      buildingCorners.forEach(([sideX, sideZ]) => {
        addSkylineLocal(skylineFins, sideX * (width / 2 - 0.22), baseHeight * 0.5, sideZ * (depth / 2 - 0.22), [0.44, baseHeight + 0.3, 0.44]);
        addSkylineLocal(skylineFins, offsetX + sideX * (upperWidth / 2 - 0.18), upperBaseY, offsetZ + sideZ * (upperDepth / 2 - 0.18), [0.36, upperHeight + 0.2, 0.36]);
      });

      addSkylineLocal(skylineCrowns, offsetX, height + 0.74, offsetZ, [upperWidth * 0.9, 0.48, upperDepth * 0.9]);
      if (random() > 0.38) {
        const spireHeight = 8 + random() * 24;
        addSkylineLocal(skylineSpires, offsetX, height + spireHeight * 0.5 + 0.8, offsetZ, [1, spireHeight, 1]);
      }
      if (random() > 0.82) {
        const face = Math.floor(random() * 4);
        const faceRotation = face === 0 ? 0 : face === 1 ? Math.PI : face === 2 ? Math.PI / 2 : -Math.PI / 2;
        const localX = face === 2 ? width / 2 + 0.2 : face === 3 ? -width / 2 - 0.2 : 0;
        const localZ = face === 0 ? depth / 2 + 0.2 : face === 1 ? -depth / 2 - 0.2 : 0;
        const signPosition = rotateLocal(localX, localZ);
        const billboard = billboardMeshes[Math.floor(random() * billboardMeshes.length)];
        addBuildingDetail(billboard, [signPosition[0], groundY + baseHeight * 0.58, signPosition[1]], [Math.min(8, width * 0.44), 2.2, 0.36], rotation + faceRotation);
      }
      return;
    }

    const baseTrim = buildingDetails[0];
    const facadeFin = buildingDetails[1];
    const storeGlass = buildingDetails[3];
    const storeMullion = buildingDetails[4];
    const canopy = buildingDetails[5 + Math.floor(random() * 2)];
    const door = buildingDetails[7];
    const roofMast = buildingDetails[8];
    for (const side of [-1, 1]) {
      addLocalDetail(baseTrim, 0, 0.48, side * (depth / 2 + 0.11), [width + 0.45, 0.38, 0.22]);
      addLocalDetail(baseTrim, side * (width / 2 + 0.11), 0.48, 0, [0.22, 0.38, depth + 0.45]);
      addLocalDetail(baseTrim, 0, baseHeight - 0.18, side * (depth / 2 + 0.13), [width + 0.5, 0.3, 0.26]);
      addLocalDetail(baseTrim, side * (width / 2 + 0.13), baseHeight - 0.18, 0, [0.26, 0.3, depth + 0.5]);
      for (const end of [-1, 1]) {
        addLocalDetail(facadeFin, end * (width / 2 - 0.24), baseHeight / 2, side * (depth / 2 - 0.24), [0.32, baseHeight - 1, 0.32]);
        addLocalDetail(facadeFin, offsetX + end * (upperWidth / 2 - 0.2), baseHeight + upperHeight / 2, offsetZ + side * (upperDepth / 2 - 0.2), [0.26, Math.max(2, upperHeight - 0.8), 0.26]);
      }
    }

    const shopFaces = [
      { x: 0, z: depth / 2 + 0.11, length: width, face: 0, normalX: 0, normalZ: 1 },
      { x: 0, z: -depth / 2 - 0.11, length: width, face: 1, normalX: 0, normalZ: -1 },
      { x: width / 2 + 0.11, z: 0, length: depth, face: 2, normalX: 1, normalZ: 0 },
      { x: -width / 2 - 0.11, z: 0, length: depth, face: 3, normalX: -1, normalZ: 0 },
    ];
    shopFaces.forEach((face) => {
      const sideFacing = face.face >= 2;
      const glassSize = sideFacing ? [0.15, 2.25, face.length * 0.76] : [face.length * 0.76, 2.25, 0.15];
      const canopySize = sideFacing ? [1.1, 0.3, face.length * 0.86] : [face.length * 0.86, 0.3, 1.1];
      const doorSize = sideFacing ? [0.22, 2.3, 1.35] : [1.35, 2.3, 0.22];
      const mullionSize = sideFacing ? [0.2, 2.25, 0.16] : [0.16, 2.25, 0.2];
      addLocalDetail(storeGlass, face.x, 1.42, face.z, glassSize, face.face === 1 ? Math.PI : face.face === 2 ? Math.PI / 2 : face.face === 3 ? -Math.PI / 2 : 0);
      addLocalDetail(canopy, face.x + face.normalX * 0.46, 2.72, face.z + face.normalZ * 0.46, canopySize, face.face === 1 ? Math.PI : face.face === 2 ? Math.PI / 2 : face.face === 3 ? -Math.PI / 2 : 0);
      addLocalDetail(door, face.x + face.normalX * 0.045, 1.35, face.z + face.normalZ * 0.045, doorSize, face.face === 1 ? Math.PI : face.face === 2 ? Math.PI / 2 : face.face === 3 ? -Math.PI / 2 : 0);
      for (const along of [-0.27, 0, 0.27]) {
        addLocalDetail(storeMullion, face.x + (sideFacing ? 0 : along * face.length), 1.42, face.z + (sideFacing ? along * face.length : 0), mullionSize, face.face === 1 ? Math.PI : face.face === 2 ? Math.PI / 2 : face.face === 3 ? -Math.PI / 2 : 0);
      }
    });

    for (const mastOffset of [-1, 1]) {
      const mastPosition = rotateLocal(offsetX + mastOffset * upperWidth * 0.42, offsetZ + upperDepth * 0.36);
      addBuildingDetail(roofMast, [mastPosition[0], groundY + height + 3.1, mastPosition[1]], [1, 1, 1], rotation);
    }

    // Selected towers get a clear rooftop helipad marking that reads from above.
    if (height > 30 && random() > 0.5) {
      const padX = offsetX;
      const padZ = offsetZ - upperDepth * 0.34;
      const padY = height + 0.62;
      addLocalDetail(buildingDetails[9], padX - 0.72, padY, padZ, [0.42, 0.12, 2.55]);
      addLocalDetail(buildingDetails[9], padX + 0.72, padY, padZ, [0.42, 0.12, 2.55]);
      addLocalDetail(buildingDetails[9], padX, padY, padZ, [1.86, 0.12, 0.42]);
    }

    const floorCount = Math.max(3, Math.floor((height - 5) / 4.5) + 1);
    const floorSpacing = (height - 6) / Math.max(1, floorCount - 1);
    for (let floor = 0; floor < floorCount; floor += 1) {
      const windowY = groundY + 4.8 + floor * floorSpacing;
      const onUpperTier = windowY > groundY + baseHeight + 1.4;
      const facadeWidth = onUpperTier ? upperWidth : width;
      const facadeDepth = onUpperTier ? upperDepth : depth;
      const facadeX = onUpperTier ? offsetX : 0;
      const facadeZ = onUpperTier ? offsetZ : 0;
      const addWindowRow = (horizontalLength, face) => {
        const columns = Math.max(2, Math.floor(horizontalLength / 3.8));
        for (let column = 0; column < columns; column += 1) {
          if (random() > 0.55) continue;
          const along = -horizontalLength / 2 + ((column + 0.5) / columns) * horizontalLength;
          let localX = 0, localZ = 0, faceRotation = 0;
          if (face === 0) { localX = facadeX + along; localZ = facadeZ + facadeDepth / 2 + 0.09; }
          else if (face === 1) { localX = facadeX + along; localZ = facadeZ - facadeDepth / 2 - 0.09; faceRotation = Math.PI; }
          else if (face === 2) { localX = facadeX + facadeWidth / 2 + 0.09; localZ = facadeZ + along; faceRotation = Math.PI / 2; }
          else { localX = facadeX - facadeWidth / 2 - 0.09; localZ = facadeZ + along; faceRotation = -Math.PI / 2; }
          const windowPosition = rotateLocal(localX, localZ);
          const windowRoll = random();
          const materialIndex = windowRoll > 0.86 ? 2 : windowRoll > 0.70 ? 1 : 0;
          const windows = windowMeshes[materialIndex];
          const windowCount = windowCounts[materialIndex]++;
          const windowNormal = localPoint.set(0, 0, 1).applyAxisAngle(worldUp, rotation + faceRotation);
          addBuildingDetail(buildingDetails[2], [windowPosition[0] - windowNormal.x * 0.04, windowY, windowPosition[1] - windowNormal.z * 0.04], [1.98, 2.35, 0.16], rotation + faceRotation);
          stamp.position.set(windowPosition[0] + windowNormal.x * 0.08, windowY, windowPosition[1] + windowNormal.z * 0.08);
          stamp.rotation.set(0, rotation + faceRotation, 0);
          stamp.scale.set(1.66, 2.04, 0.08);
          stamp.updateMatrix();
          windows.setMatrixAt(windowCount, stamp.matrix);
        }
      };
      addWindowRow(onUpperTier ? facadeWidth : width, 0);
      addWindowRow(onUpperTier ? facadeWidth : width, 1);
      addWindowRow(onUpperTier ? facadeDepth : depth, 2);
      addWindowRow(onUpperTier ? facadeDepth : depth, 3);
      if (floor < floorCount - 1) {
        addLocalDetail(baseTrim, facadeX, windowY + 2.35, facadeZ + (onUpperTier ? facadeDepth / 2 + 0.14 : depth / 2 + 0.14), [facadeWidth + 0.4, 0.18, 0.32]);
        addLocalDetail(baseTrim, facadeX, windowY + 2.35, facadeZ - (onUpperTier ? facadeDepth / 2 + 0.14 : depth / 2 + 0.14), [facadeWidth + 0.4, 0.18, 0.32], Math.PI);
        addLocalDetail(baseTrim, facadeX + (onUpperTier ? facadeWidth / 2 + 0.14 : width / 2 + 0.14), windowY + 2.35, facadeZ, [0.32, 0.18, facadeDepth + 0.4], Math.PI / 2);
        addLocalDetail(baseTrim, facadeX - (onUpperTier ? facadeWidth / 2 + 0.14 : width / 2 + 0.14), windowY + 2.35, facadeZ, [0.32, 0.18, facadeDepth + 0.4], -Math.PI / 2);
      }
    }
    if (height > 28 && random() > 0.62) {
      const balconyDeck = buildingDetails[buildingDetails.length - 2];
      const balconyRail = buildingDetails[buildingDetails.length - 1];
      const useSide = random() > 0.5;
      for (let floor = 1; floor < floorCount - 1; floor += 2) {
        if (random() > 0.8) continue;
        const windowY = groundY + 4.8 + floor * floorSpacing;
        const onUpperTier = windowY > groundY + baseHeight + 1.4;
        const facadeWidth = onUpperTier ? upperWidth : width;
        const facadeDepth = onUpperTier ? upperDepth : depth;
        const facadeX = onUpperTier ? offsetX : 0;
        const facadeZ = onUpperTier ? offsetZ : 0;
        const along = (random() - 0.5) * facadeWidth * 0.34;
        if (!useSide) {
          const deckZ = facadeZ + facadeDepth / 2 + 0.8;
          addLocalDetail(balconyDeck, facadeX + along, windowY - 1.15, deckZ, [4.8, 0.22, 1.55]);
          addLocalDetail(balconyRail, facadeX + along, windowY - 0.46, facadeZ + facadeDepth / 2 + 1.5, [4.8, 1.12, 0.16]);
          for (const side of [-1, 1]) addLocalDetail(balconyRail, facadeX + along + side * 2.34, windowY - 0.46, deckZ, [0.16, 1.12, 1.45]);
        } else {
          const deckX = facadeX + facadeWidth / 2 + 0.8;
          addLocalDetail(balconyDeck, deckX, windowY - 1.15, facadeZ + along, [1.55, 0.22, 4.8]);
          addLocalDetail(balconyRail, facadeX + facadeWidth / 2 + 1.5, windowY - 0.46, facadeZ + along, [0.16, 1.12, 4.8]);
          for (const side of [-1, 1]) addLocalDetail(balconyRail, deckX, windowY - 0.46, facadeZ + along + side * 2.34, [1.45, 1.12, 0.16]);
        }
      }
    }
  };

  // Four planted courtyards break up the hard grid without interrupting flight lanes.
  const parkLawnMaterial = new THREE.MeshStandardMaterial({ color: 0x28524c, roughness: 0.96, emissive: 0x071815, emissiveIntensity: 0.28 });
  const parkPathMaterial = new THREE.MeshStandardMaterial({ color: 0x66717a, roughness: 0.86, metalness: 0.08 });
  const parkBasinMaterial = new THREE.MeshStandardMaterial({ color: 0x1b5868, roughness: 0.28, metalness: 0.42, emissive: 0x0c4855, emissiveIntensity: 0.62 });
  const parkTrunkMaterial = new THREE.MeshStandardMaterial({ color: 0x594b43, roughness: 0.94 });
  const parkCrownMaterial = new THREE.MeshStandardMaterial({ color: 0x286a60, roughness: 0.88, emissive: 0x0b2824, emissiveIntensity: 0.25, flatShading: true });
  const parkLampMaterial = new THREE.MeshStandardMaterial({ color: 0x374c59, roughness: 0.52, metalness: 0.48 });
  const parkLampGlowMaterial = new THREE.MeshBasicMaterial({ color: 0x9af5ed, toneMapped: false });
  const parkLawns = new THREE.InstancedMesh(boxGeometry, parkLawnMaterial, 4);
  const parkPaths = new THREE.InstancedMesh(boxGeometry, parkPathMaterial, 8);
  const parkBasins = new THREE.InstancedMesh(boxGeometry, capMaterials[0], 4);
  const parkWater = new THREE.InstancedMesh(boxGeometry, parkBasinMaterial, 4);
  const parkTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.24, 0.34, 3.8, 7), parkTrunkMaterial, 16);
  const parkCanopies = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(2.45, 1), parkCrownMaterial, 16);
  const parkLamps = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.1, 0.16, 1.6, 7), parkLampMaterial, 16);
  const parkLampHeads = new THREE.InstancedMesh(boxGeometry, parkLampGlowMaterial, 16);
  const parkCenters = [-90, 90].flatMap((x) => [-90, 90].map((z) => [x, z]));
  parkCenters.forEach(([x, z], parkIndex) => {
    const groundY = terrainSurfaceYAt('neon-city', x, z);
    stamp.position.set(x, groundY + 0.13, z);
    stamp.scale.set(34, 0.14, 34);
    stamp.rotation.set(0, 0, 0);
    stamp.updateMatrix();
    parkLawns.setMatrixAt(parkIndex, stamp.matrix);
    stamp.position.set(x, groundY + 0.2, z);
    stamp.scale.set(34, 0.1, 2.5);
    stamp.updateMatrix();
    parkPaths.setMatrixAt(parkIndex * 2, stamp.matrix);
    stamp.scale.set(2.5, 0.1, 34);
    stamp.updateMatrix();
    parkPaths.setMatrixAt(parkIndex * 2 + 1, stamp.matrix);
    stamp.position.set(x, groundY + 0.28, z);
    stamp.scale.set(7, 0.32, 7);
    stamp.updateMatrix();
    parkBasins.setMatrixAt(parkIndex, stamp.matrix);
    stamp.position.y = groundY + 0.47;
    stamp.scale.set(5.8, 0.08, 5.8);
    stamp.updateMatrix();
    parkWater.setMatrixAt(parkIndex, stamp.matrix);

    for (const dx of [-9.5, 9.5]) {
      for (const dz of [-9.5, 9.5]) {
        const treeIndex = parkIndex * 4 + (dx > 0 ? 2 : 0) + (dz > 0 ? 1 : 0);
        stamp.position.set(x + dx, groundY + 2.02, z + dz);
        stamp.scale.set(1, 1, 1);
        stamp.updateMatrix();
        parkTrunks.setMatrixAt(treeIndex, stamp.matrix);
        stamp.position.y = groundY + 5.05;
        stamp.scale.set(1, 0.92 + (treeIndex % 3) * 0.06, 1);
        stamp.updateMatrix();
        parkCanopies.setMatrixAt(treeIndex, stamp.matrix);
      }
    }
    for (let lamp = 0; lamp < 4; lamp += 1) {
      const angle = lamp / 4 * Math.PI * 2;
      const lampIndex = parkIndex * 4 + lamp;
      stamp.position.set(x + Math.cos(angle) * 14, groundY + 1, z + Math.sin(angle) * 14);
      stamp.scale.setScalar(1);
      stamp.updateMatrix();
      parkLamps.setMatrixAt(lampIndex, stamp.matrix);
      stamp.position.y = groundY + 1.86;
      stamp.scale.set(0.48, 0.16, 0.48);
      stamp.updateMatrix();
      parkLampHeads.setMatrixAt(lampIndex, stamp.matrix);
    }
  });
  [parkLawns, parkPaths, parkBasins, parkWater, parkTrunks, parkCanopies, parkLamps, parkLampHeads].forEach((mesh) => {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.userData.skipShadows = true;
  });
  environmentRoot.add(parkLawns, parkPaths, parkBasins, parkWater, parkTrunks, parkCanopies, parkLamps, parkLampHeads);

  // Mixed-use blocks follow a parcel pattern, with a broad civic square at the center.
  const parkBlockKeys = new Set(parkCenters.map(([x, z]) => `${x},${z}`));
  for (const z of blockCenters) {
    for (const x of blockCenters) {
      const radial = Math.hypot(x, z);
      if (radial < 70 || parkBlockKeys.has(`${x},${z}`)) continue;
      const rotation = (Math.round((x + 180) / 60) + Math.round((z + 180) / 60)) % 2 ? Math.PI / 2 : 0;
      const slots = rotation === 0 ? [[-11.5, 0], [11.5, 0]] : [[0, -11.5], [0, 11.5]];
      slots.forEach(([offsetX, offsetZ], slotIndex) => {
        const position = new THREE.Vector3(offsetX, 0, offsetZ).applyAxisAngle(worldUp, rotation);
        const buildingWidth = 13.2 + random() * 3.1;
        const buildingDepth = 15.2 + random() * 3.7;
        const height = radial < 125
          ? 39 + random() * 22 + (slotIndex === 0 ? 7 : 0)
          : radial < 185 ? 25 + random() * 14 : 19 + random() * 12;
        addBuilding(x + position.x, z + position.z, buildingWidth, buildingDepth, height, rotation, true);
      });
    }
  }

  // A measured mid-rise ring transitions from the neighborhood grid to the towers.
  for (let index = 0; index < 24; index += 1) {
    const angle = index / 24 * Math.PI * 2 + (random() - 0.5) * 0.025;
    const radius = 239 + random() * 12;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    addBuilding(x, z, 17 + random() * 6, 18 + random() * 7, 19 + random() * 18, angle + Math.PI / 2, true);
  }

  // Setback glass towers frame the playable skyline in an even, readable ring.
  for (let index = 0; index < 48; index += 1) {
    const angle = index / 48 * Math.PI * 2 + (random() - 0.5) * 0.035;
    const radius = 302 + random() * 54;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const districtRise = (Math.sin(angle * 4 + 0.35) + 1) * 0.5;
    const height = 38 + districtRise * 28 + random() * 28;
    addBuilding(x, z, 16 + random() * 9, 18 + random() * 10, height, angle + Math.PI / 2, false);
  }

  // Taller outer districts form a varied 360-degree horizon, with clustered heights.
  for (let index = 0; index < 72; index += 1) {
    const angle = index / 72 * Math.PI * 2 + (random() - 0.5) * 0.025;
    const radius = 430 + random() * 112;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    const districtRise = (Math.sin(angle * 3 + 0.7) + 1) * 0.5;
    const height = 46 + districtRise * 58 + random() * 36;
    addBuilding(x, z, 18 + random() * 11, 20 + random() * 12, height, angle + Math.PI / 2, false);
  }

  bodyMeshes.forEach((mesh, index) => {
    mesh.count = bodyCounts[index];
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  });
  upperMeshes.forEach((mesh, index) => {
    mesh.count = upperCounts[index];
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  });
  capMeshes.forEach((mesh, index) => {
    mesh.count = capCounts[index];
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  });
  roofUnits.count = roofUnitCount.value;
  roofUnits.instanceMatrix.needsUpdate = true;
  signs.forEach((mesh, index) => {
    mesh.count = signCounts[index];
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  });
  windowMeshes.forEach((mesh, index) => {
    mesh.count = windowCounts[index];
    mesh.userData.skipShadows = true;
    mesh.userData.skipFlightCollision = true;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  });
  buildingDetails.forEach((mesh) => {
    mesh.count = buildingDetailCounts.get(mesh) || 0;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.userData.skipShadows = true;
    mesh.userData.skipFlightCollision = true;
  });
  skylineFeatureMeshes.forEach((mesh) => {
    mesh.count = skylineFeatureCounts.get(mesh) || 0;
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.userData.skipShadows = true;
    mesh.userData.skipFlightCollision = true;
  });
  roofUnits.userData.skipFlightCollision = true;
  signs.forEach((mesh) => { mesh.userData.skipFlightCollision = true; });
  environmentRoot.add(...bodyMeshes, ...upperMeshes, ...capMeshes, roofUnits, ...signs, ...windowMeshes, ...buildingDetails, ...skylineFeatureMeshes);

  // A continuous elevated rail loop and its stations give the skyline a second readable layer.
  const transitDeckMaterial = new THREE.MeshStandardMaterial({ color: 0x172535, roughness: 0.68, metalness: 0.34 });
  const transitRailMaterial = new THREE.MeshStandardMaterial({ color: 0x4fcfe0, emissive: 0x16758a, emissiveIntensity: 0.72, roughness: 0.34, metalness: 0.22 });
  const transitDeck = new THREE.Mesh(new THREE.RingGeometry(220, 228, 256), transitDeckMaterial);
  transitDeck.rotation.x = -Math.PI / 2;
  transitDeck.position.y = 22;
  environmentRoot.add(transitDeck);
  for (const radius of [220.6, 227.4]) {
    const rail = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.28, 6, 256), transitRailMaterial);
    rail.rotation.x = Math.PI / 2;
    rail.position.y = 22.4;
    environmentRoot.add(rail);
  }
  const transitSupports = new THREE.InstancedMesh(boxGeometry, capMaterials[0], 24);
  for (let index = 0; index < transitSupports.count; index += 1) {
    const angle = index / transitSupports.count * Math.PI * 2;
    stamp.position.set(Math.cos(angle) * 224, 10.9, Math.sin(angle) * 224);
    stamp.scale.set(1.25, 21.8, 1.25);
    stamp.rotation.set(0, angle, 0);
    stamp.updateMatrix();
    transitSupports.setMatrixAt(index, stamp.matrix);
  }
  transitSupports.instanceMatrix.needsUpdate = true;
  environmentRoot.add(transitSupports);

  const station = new THREE.Group();
  station.position.set(0, 0, -224);
  environmentRoot.add(station);
  registerBuilderEnvironmentBuilding(station, 'neon-city-transit-station', 'Transit station');
  box(station, [37, 5.8, 18], [0, 18.3, 0], capMaterials[1]);
  box(station, [39, 0.45, 19], [0, 21.45, 0], accentMaterials[0]);
  box(station, [30, 2.8, 0.24], [0, 18.4, 9.2], windowMaterials[0]);
  for (const x of [-12, -6, 0, 6, 12]) box(station, [0.18, 3, 0.3], [x, 18.4, 9.42], roofUnitMaterial);
  for (const angle of [0.55, 2.65, 4.5]) {
    const train = new THREE.Group();
    const radius = 224;
    train.position.set(Math.cos(angle) * radius, 22.9, Math.sin(angle) * radius);
    train.rotation.y = angle + Math.PI / 2;
    environmentRoot.add(train);
    box(train, [2.8, 2.5, 13], [0, 0, 0], shellMaterials[1]);
    box(train, [2.5, 1.25, 8.8], [0, 0.2, 0], windowMaterials[0]);
    box(train, [2.9, 0.18, 13.2], [0, 1.34, 0], transitRailMaterial);
  }

  // A civic tower, plaza, and planted pocket parks anchor the middle of the grid.
  const civicCenter = new THREE.Group();
  const plaza = new THREE.Mesh(new THREE.CircleGeometry(36, 96), new THREE.MeshStandardMaterial({ color: 0x3c4b58, roughness: 0.82, metalness: 0.08 }));
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.015, 0);
  civicCenter.add(plaza);
  const plazaRing = new THREE.Mesh(new THREE.TorusGeometry(36.5, 0.2, 8, 128), new THREE.MeshStandardMaterial({ color: 0x4bd8e9, emissive: 0x126376, emissiveIntensity: 0.52, roughness: 0.4, metalness: 0.16 }));
  plazaRing.rotation.x = Math.PI / 2;
  plazaRing.position.y = 0.13;
  civicCenter.add(plazaRing);
  const civicBase = new THREE.Mesh(new THREE.CylinderGeometry(16, 19, 2.2, 12), capMaterials[0]);
  civicBase.position.set(0, 1.1, 0);
  civicCenter.add(civicBase);
  const civicSteps = new THREE.Mesh(new THREE.CylinderGeometry(13.8, 16.4, 0.72, 12), capMaterials[1]);
  civicSteps.position.set(0, 2.45, 0);
  civicCenter.add(civicSteps);
  const civicTower = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 10.5, 39, 10), shellMaterials[0]);
  civicTower.position.set(0, 21.2, 0);
  civicTower.rotation.y = 0.18;
  civicCenter.add(civicTower);
  const civicCrown = new THREE.Mesh(new THREE.TorusGeometry(8.5, 0.58, 8, 40), accentMaterials[0]);
  civicCrown.rotation.x = Math.PI / 2;
  civicCrown.position.set(0, 41.5, 0);
  civicCenter.add(civicCrown);
  const civicWindows = new THREE.InstancedMesh(boxGeometry, windowMaterials[0], 50);
  const civicFins = new THREE.InstancedMesh(boxGeometry, capMaterials[1], 10);
  for (let level = 0; level < 5; level += 1) {
    for (let panel = 0; panel < 10; panel += 1) {
      const angle = panel / 10 * Math.PI * 2;
      stamp.position.set(Math.cos(angle) * 7.25, 7 + level * 6.6, Math.sin(angle) * 7.25);
      stamp.rotation.set(0, Math.PI / 2 - angle, 0);
      stamp.scale.set(1.8, 3.7, 0.12);
      stamp.updateMatrix();
      civicWindows.setMatrixAt(level * 10 + panel, stamp.matrix);
    }
  }
  for (let panel = 0; panel < 10; panel += 1) {
    const angle = panel / 10 * Math.PI * 2;
    stamp.position.set(Math.cos(angle) * 6.8, 21, Math.sin(angle) * 6.8);
    stamp.rotation.set(0, Math.PI / 2 - angle, 0);
    stamp.scale.set(0.24, 36, 0.26);
    stamp.updateMatrix();
    civicFins.setMatrixAt(panel, stamp.matrix);
  }
  civicWindows.instanceMatrix.needsUpdate = true;
  civicFins.instanceMatrix.needsUpdate = true;
  civicWindows.userData.skipShadows = true;
  civicFins.userData.skipShadows = true;
  civicCenter.add(civicWindows, civicFins);
  const civicSpire = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.85, 19, 8), capMaterials[1]);
  civicSpire.position.set(0, 51, 0);
  civicCenter.add(civicSpire);
  const civicLight = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), new THREE.MeshBasicMaterial({ color: 0xff6fc6, toneMapped: false }));
  civicLight.position.set(0, 61, 0);
  civicCenter.add(civicLight);
  environmentRoot.add(civicCenter);
  registerBuilderEnvironmentBuilding(civicCenter, 'neon-city-civic-center', 'Civic tower and plaza');
  for (let index = 0; index < 8; index += 1) {
    const angle = index / 8 * Math.PI * 2;
    const x = Math.cos(angle) * 29;
    const z = Math.sin(angle) * 29;
    const tree = new THREE.Group();
    tree.position.set(x, 0, z);
    environmentRoot.add(tree);
    cylinder(tree, 0.28, 0.42, 3.2, [0, 1.6, 0], 'rust2', 6);
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(2.3, 1), new THREE.MeshStandardMaterial({ color: 0x1d5b51, roughness: 0.92, flatShading: true }));
    crown.position.y = 4;
    tree.add(crown);
  }

  // Street furniture repeats across the grid; window panes remain instanced on all four faces.
  const streetLampMaterial = new THREE.MeshStandardMaterial({ color: 0x354657, roughness: 0.55, metalness: 0.5 });
  const lampHeadMaterial = new THREE.MeshBasicMaterial({ color: 0x8ef2f2, toneMapped: false });
  const lampPoles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.2, 8.2, 7), streetLampMaterial, 180);
  const lampHeads = new THREE.InstancedMesh(boxGeometry, lampHeadMaterial, 180);
  let lampIndex = 0;
  for (const line of roadLines) {
    for (const along of [-150, -90, -30, 30, 90, 150]) {
      for (const side of [-1, 1]) {
        stamp.position.set(along, 4.05, line + side * 7.7);
        stamp.scale.setScalar(1);
        stamp.rotation.set(0, 0, 0);
        stamp.updateMatrix();
        lampPoles.setMatrixAt(lampIndex, stamp.matrix);
        stamp.position.set(along, 8.25, line + side * 7.7 + 0.42);
        stamp.scale.set(0.78, 0.14, 0.34);
        stamp.updateMatrix();
        lampHeads.setMatrixAt(lampIndex, stamp.matrix);

        stamp.position.set(line + side * 7.7, 4.05, along);
        stamp.scale.setScalar(1);
        stamp.rotation.set(0, 0, 0);
        stamp.updateMatrix();
        lampPoles.setMatrixAt(lampIndex + 1, stamp.matrix);
        stamp.position.set(line + side * 7.7 + 0.42, 8.25, along);
        stamp.scale.set(0.34, 0.14, 0.78);
        stamp.updateMatrix();
        lampHeads.setMatrixAt(lampIndex + 1, stamp.matrix);
        lampIndex += 2;
      }
    }
  }
  lampPoles.count = lampIndex;
  lampHeads.count = lampIndex;
  lampPoles.instanceMatrix.needsUpdate = true;
  lampHeads.instanceMatrix.needsUpdate = true;
  lampHeads.userData.skipShadows = true;
  environmentRoot.add(lampPoles, lampHeads);

  // Parked and queued vehicles add scale to streets throughout the grid.
  const carBodyMaterials = [
    new THREE.MeshStandardMaterial({ color: 0x273545, roughness: 0.48, metalness: 0.36 }),
    new THREE.MeshStandardMaterial({ color: 0x536172, roughness: 0.46, metalness: 0.3 }),
    new THREE.MeshStandardMaterial({ color: 0x56394d, roughness: 0.48, metalness: 0.24 }),
  ];
  const carGlassMaterial = new THREE.MeshStandardMaterial({ color: 0x347589, emissive: 0x123440, emissiveIntensity: 0.52, roughness: 0.3, metalness: 0.24 });
  const carTailMaterial = new THREE.MeshBasicMaterial({ color: 0xff5e8e, toneMapped: false });
  const cars = carBodyMaterials.map((material) => new THREE.InstancedMesh(boxGeometry, material, 112));
  const carWindows = new THREE.InstancedMesh(boxGeometry, carGlassMaterial, 112);
  const tailLights = new THREE.InstancedMesh(boxGeometry, carTailMaterial, 112);
  const carCounts = [0, 0, 0];
  let carIndex = 0;
  const addCar = (x, z, rotation) => {
    const style = Math.floor(random() * cars.length);
    stamp.position.set(x, 0.42, z);
    stamp.rotation.set(0, rotation, 0);
    stamp.scale.set(2.05, 0.74, 4.4);
    stamp.updateMatrix();
    cars[style].setMatrixAt(carCounts[style]++, stamp.matrix);
    stamp.position.set(x, 0.91, z);
    stamp.scale.set(1.58, 0.62, 2.45);
    stamp.updateMatrix();
    carWindows.setMatrixAt(carIndex, stamp.matrix);
    stamp.position.set(x - Math.sin(rotation) * 2.22, 0.35, z - Math.cos(rotation) * 2.22);
    stamp.scale.set(1.6, 0.1, 0.12);
    stamp.updateMatrix();
    tailLights.setMatrixAt(carIndex++, stamp.matrix);
  };
  for (const line of roadLines) {
    for (const along of [-150, -90, -30, 30, 90, 150]) {
      if (Math.abs(line) < 40 && Math.abs(along) < 40) continue;
      addCar(along, line - 5.4, Math.PI / 2);
      addCar(line + 5.4, along, 0);
    }
  }
  cars.forEach((mesh, index) => {
    mesh.count = carCounts[index];
    mesh.instanceMatrix.needsUpdate = true;
  });
  carWindows.count = carIndex;
  tailLights.count = carIndex;
  carWindows.instanceMatrix.needsUpdate = true;
  tailLights.instanceMatrix.needsUpdate = true;
  carWindows.userData.skipShadows = true;
  tailLights.userData.skipShadows = true;
  environmentRoot.add(...cars, carWindows, tailLights);

  const cityGlowPoints = [[-66, 15, -66, 0x52dff0], [66, 18, -66, 0xff65bb], [-66, 16, 66, 0xffbd76], [66, 20, 66, 0x6de7ff], [0, 26, -216, 0x52dff0], [0, 63, 0, 0xff65bb]];
  cityGlowPoints.forEach(([x, y, z, color]) => {
    const light = new THREE.PointLight(color, 26, 74, 2);
    light.position.set(x, y, z);
    light.userData.baseIntensity = 26;
    biomeLightRoot.add(light);
  });
  addContainerYards('neon-city', [
    { x: 0, z: -222, rotation: 0, accent: 'cyan', containers: [
      { x: -14, z: -8, color: 'steel', length: 26 }, { x: 14, z: -8, color: 'light', length: 26 },
      { x: -14, z: -8, color: 'dark', level: 1, length: 18 }, { x: 12, z: 8, color: 'steel', length: 22 },
    ] },
    { x: 222, z: 0, rotation: Math.PI / 2, accent: 'coral', containers: [
      { x: -12, z: -8, color: 'light', length: 22 }, { x: 12, z: -8, color: 'steel', length: 22 },
      { x: -12, z: 1, color: 'dark', length: 22 }, { x: 12, z: -8, color: 'blue', level: 1, length: 22 },
    ] },
    { x: 0, z: 222, rotation: Math.PI, accent: 'violet', containers: [
      { x: -14, z: -8, color: 'blue', length: 26 }, { x: 14, z: -8, color: 'steel', length: 26 },
      { x: 14, z: -8, color: 'light', level: 1, length: 22 },
    ] },
    { x: -222, z: 0, rotation: -Math.PI / 2, accent: 'lime', containers: [
      { x: -12, z: -8, color: 'dark', length: 20 }, { x: 12, z: -8, color: 'steel', length: 20 },
      { x: -12, z: -8, color: 'blue', level: 1, length: 20 }, { x: 12, z: 8, color: 'light', length: 20 },
    ] },
  ]);
}

function addPineBasin() {
  addGround('pine');
  const forestFloor = createReliefSurface(4200, 4200, new THREE.MeshStandardMaterial({ color: 0x122d27, roughness: 1 }), { biomeId: 'pine-basin', z: -8, y: -0.035, segments: 320 }); environmentRoot.add(forestFloor);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x403244, roughness: 1, flatShading: true });
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x123d3a, roughness: 1, flatShading: true });
  const tipMat = new THREE.MeshStandardMaterial({ color: 0x205653, roughness: 0.94, flatShading: true });
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.32, 0.48, 5, 5), trunkMat, 50);
  const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(3.1, 7, 6), crownMat, 50);
  const tops = new THREE.InstancedMesh(new THREE.ConeGeometry(2.4, 6, 6), tipMat, 50);
  const d = new THREE.Object3D();
  for (let i = 0; i < 50; i += 1) { const angle = i * 2.399, radius = 62 + (i % 6) * 8; const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius - 3; const treeScale = 0.8 + (i % 5) * 0.15, groundY = terrainSurfaceYAt('pine-basin', x, z); d.position.set(x, groundY + 2.5 * treeScale, z); d.scale.setScalar(treeScale); d.rotation.y = angle; d.updateMatrix(); trunks.setMatrixAt(i, d.matrix); d.position.y = groundY + 6 * treeScale; d.updateMatrix(); crowns.setMatrixAt(i, d.matrix); d.position.y = groundY + 10.8 * treeScale; d.scale.setScalar(treeScale * 0.82); d.updateMatrix(); tops.setMatrixAt(i, d.matrix); }
  trunks.userData.flightCollisionHorizontalPadding = 3.2;
  trunks.userData.flightCollisionHeight = 15;
  crowns.userData.skipFlightCollision = true;
  tops.userData.skipFlightCollision = true;
  trunks.instanceMatrix.needsUpdate = crowns.instanceMatrix.needsUpdate = tops.instanceMatrix.needsUpdate = true; environmentRoot.add(trunks, crowns, tops);
  // An outer tree belt gives the basin a wooded horizon while preserving a broad clearing.
  const outerCount = 126;
  const outerTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.38, 0.58, 6.3, 5), trunkMat.clone(), outerCount);
  const outerCrowns = new THREE.InstancedMesh(new THREE.ConeGeometry(4.1, 9, 6), crownMat.clone(), outerCount);
  const outerTops = new THREE.InstancedMesh(new THREE.ConeGeometry(3.1, 7.2, 6), tipMat.clone(), outerCount);
  for (let i = 0; i < outerCount; i += 1) {
    const angle = i * 2.399 + 0.16;
    const radius = 138 + (i % 9) * 8.8;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius - 5;
    const scale = 0.78 + (i % 6) * 0.11;
    const groundY = terrainSurfaceYAt('pine-basin', x, z);
    d.position.set(x, groundY + 3.15 * scale, z); d.scale.setScalar(scale); d.rotation.y = angle; d.updateMatrix(); outerTrunks.setMatrixAt(i, d.matrix);
    d.position.y = groundY + 7.1 * scale; d.updateMatrix(); outerCrowns.setMatrixAt(i, d.matrix);
    d.position.y = groundY + 12.8 * scale; d.scale.setScalar(scale * 0.82); d.updateMatrix(); outerTops.setMatrixAt(i, d.matrix);
  }
  outerTrunks.userData.flightCollisionHorizontalPadding = 4.1;
  outerTrunks.userData.flightCollisionHeight = 18;
  outerCrowns.userData.skipFlightCollision = true;
  outerTops.userData.skipFlightCollision = true;
  outerTrunks.instanceMatrix.needsUpdate = outerCrowns.instanceMatrix.needsUpdate = outerTops.instanceMatrix.needsUpdate = true;
  environmentRoot.add(outerTrunks, outerCrowns, outerTops);

  // A taller 360-degree treeline fills the horizon, with smaller firs between the basin and ridge.
  const horizonCount = 2160;
  const horizonTrunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.68, 7.4, 5), trunkMat.clone(), horizonCount);
  const horizonCrowns = new THREE.InstancedMesh(new THREE.ConeGeometry(4.8, 12.5, 6), crownMat.clone(), horizonCount);
  const horizonTops = new THREE.InstancedMesh(new THREE.ConeGeometry(3.6, 10.2, 6), tipMat.clone(), horizonCount);
  for (let i = 0; i < horizonCount; i += 1) {
    const ring = Math.floor(i / 180);
    const point = i % 180;
    const angle = point / 180 * Math.PI * 2 + ring * 0.017;
    const radius = 245 + ring * 21.5;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius - 8;
    const scale = 0.86 + ((i * 7) % 11) * 0.075;
    const groundY = terrainSurfaceYAt('pine-basin', x, z);
    d.position.set(x, groundY + 3.7 * scale, z); d.scale.setScalar(scale); d.rotation.y = angle; d.updateMatrix(); horizonTrunks.setMatrixAt(i, d.matrix);
    d.position.y = groundY + 9.2 * scale; d.updateMatrix(); horizonCrowns.setMatrixAt(i, d.matrix);
    d.position.y = groundY + 18.4 * scale; d.scale.setScalar(scale * 0.84); d.updateMatrix(); horizonTops.setMatrixAt(i, d.matrix);
  }
  horizonTrunks.instanceMatrix.needsUpdate = horizonCrowns.instanceMatrix.needsUpdate = horizonTops.instanceMatrix.needsUpdate = true;
  horizonTrunks.userData.flightCollisionHorizontalPadding = 5;
  horizonTrunks.userData.flightCollisionHeight = 24;
  horizonCrowns.userData.skipFlightCollision = true;
  horizonTops.userData.skipFlightCollision = true;
  horizonTrunks.userData.skipShadows = true;
  horizonCrowns.userData.skipShadows = true;
  horizonTops.userData.skipShadows = true;
  environmentRoot.add(horizonTrunks, horizonCrowns, horizonTops);

  // Keep the forest and terrain, and leave the trailhead clear of structures.
  return;

  // A timber trail lodge and two bunk cabins give the basin a believable trailhead.
  const lodgeWood = new THREE.MeshStandardMaterial({ color: 0x52614c, roughness: 0.88, flatShading: true });
  const lodgeTimber = new THREE.MeshStandardMaterial({ color: 0x805d43, roughness: 0.92, flatShading: true });
  const lodgeStone = new THREE.MeshStandardMaterial({ color: 0x444f49, roughness: 0.96, flatShading: true });
  const lodgeGlass = new THREE.MeshStandardMaterial({ color: 0x6bb6ad, emissive: 0x183d38, emissiveIntensity: 0.62, roughness: 0.28, metalness: 0.12 });
  const lodgeRoof = new THREE.MeshStandardMaterial({ color: 0x273a34, roughness: 0.84, metalness: 0.08, flatShading: true });
  const addTrailLodge = (x, z, width, depth, height, rotation, main = false, buildingId = 'pine-basin-lodge') => {
    const lodge = new THREE.Group();
    lodge.position.set(x, terrainSurfaceYAt('pine-basin', x, z), z);
    lodge.rotation.y = rotation;
    environmentRoot.add(lodge);
    registerBuilderEnvironmentBuilding(lodge, buildingId, main ? 'Trailhead lodge' : 'Trail cabin');
    box(lodge, [width + 2.8, 1.2, depth + 2.8], [0, 0.6, 0], lodgeStone);
    box(lodge, [width, height, depth], [0, height / 2 + 1.1, 0], lodgeWood);
    const logRows = Math.floor(height / 1.05);
    const logs = new THREE.InstancedMesh(boxGeometry, lodgeTimber, logRows * 4);
    const logStamp = new THREE.Object3D();
    let logIndex = 0;
    for (let row = 0; row < logRows; row += 1) {
      const y = 1.55 + row * 1.05;
      for (const side of [-1, 1]) {
        logStamp.position.set(0, y, side * (depth / 2 + 0.08));
        logStamp.scale.set(width + 0.25, 0.18, 0.22);
        logStamp.updateMatrix(); logs.setMatrixAt(logIndex++, logStamp.matrix);
        logStamp.position.set(side * (width / 2 + 0.08), y, 0);
        logStamp.scale.set(0.22, 0.18, depth + 0.25);
        logStamp.updateMatrix(); logs.setMatrixAt(logIndex++, logStamp.matrix);
      }
    }
    logs.count = logIndex;
    logs.instanceMatrix.needsUpdate = true;
    logs.userData.skipShadows = true;
    lodge.add(logs);
    for (const side of [-1, 1]) {
      box(lodge, [width + 1.1, 0.55, 0.7], [0, height + 1.3, side * (depth / 2 + 0.08)], lodgeStone);
      for (const pane of [-1, 1]) {
        box(lodge, [width * 0.23, 2.5, 0.18], [pane * width * 0.27, height * 0.52, side * (depth / 2 + 0.19)], lodgeGlass);
        box(lodge, [width * 0.25, 0.18, 0.28], [pane * width * 0.27, height * 0.52, side * (depth / 2 + 0.3)], lodgeTimber);
      }
    }
    box(lodge, [1.8, 3.2, 0.24], [0, 2.7, depth / 2 + 0.2], lodgeTimber);
    box(lodge, [1.4, 2.5, 0.16], [0, 2.7, depth / 2 + 0.36], lodgeGlass);
    box(lodge, [width + 5.5, 0.65, depth / 2 + 2.4], [0, height + 4.5, depth / 4 + 1.2], lodgeRoof).rotation.x = 0.5;
    box(lodge, [width + 5.5, 0.65, depth / 2 + 2.4], [0, height + 4.5, -depth / 4 - 1.2], lodgeRoof).rotation.x = -0.5;
    box(lodge, [width + 6.5, 0.45, 0.72], [0, height + 8.1, 0], lodgeTimber);
    const gableShape = new THREE.Shape();
    gableShape.moveTo(-width / 2, 0); gableShape.lineTo(width / 2, 0); gableShape.lineTo(0, 6.2); gableShape.closePath();
    const gableGeometry = new THREE.ShapeGeometry(gableShape);
    const gableMaterial = lodgeWood.clone();
    gableMaterial.side = THREE.DoubleSide;
    const frontGable = new THREE.Mesh(gableGeometry, gableMaterial);
    frontGable.position.set(0, height + 1.1, depth / 2 + 0.03);
    lodge.add(frontGable);
    const backGable = new THREE.Mesh(new THREE.ShapeGeometry(gableShape), gableMaterial);
    backGable.position.set(0, height + 1.1, -depth / 2 - 0.03);
    backGable.rotation.y = Math.PI;
    lodge.add(backGable);
    box(lodge, [width * 0.66, 0.65, 8.2], [0, 0.65, depth / 2 + 5.3], lodgeTimber);
    for (const xPost of [-width * 0.3, 0, width * 0.3]) {
      box(lodge, [0.38, 4.3, 0.38], [xPost, 2.75, depth / 2 + 8.7], lodgeTimber);
      box(lodge, [0.38, 0.35, 9.2], [xPost, 4.7, depth / 2 + 5.4], lodgeTimber);
    }
    box(lodge, [width * 0.63, 0.18, 0.22], [0, 1.55, depth / 2 + 9], lodgeStone);
    for (let step = 0; step < 4; step += 1) box(lodge, [width * 0.42, 0.32, 1.3], [0, 0.16 + step * 0.38, depth / 2 + 1.1 + step * 1.05], lodgeStone);
    const chimney = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.55, 8.5, 7), lodgeStone);
    chimney.position.set(width * 0.31, height + 5.3, -depth * 0.22);
    lodge.add(chimney);
    for (const lampX of [-width * 0.3, width * 0.3]) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color: colors.lime, toneMapped: false }));
      lamp.position.set(lampX, 4.2, depth / 2 + 9.2);
      lodge.add(lamp);
    }
    if (main) {
      for (let panel = 0; panel < 4; panel += 1) {
        const solar = box(lodge, [5.2, 0.2, 4.6], [-width * 0.34 + panel * 5.8, height + 5.15, -depth * 0.28], 'blue');
        solar.rotation.x = -0.5;
      }
      box(lodge, [width * 0.76, 0.24, 0.28], [0, height + 2.5, depth / 2 + 0.22], 'lime');
      box(lodge, [8.2, 1.2, 0.35], [0, height + 2.55, depth / 2 + 0.42], 'dark');
    }
  };
}

function addCinderQuarry() {
  addGround('dark');
  const quarry = createReliefSurface(4200, 4200, new THREE.MeshStandardMaterial({ color: 0x312334, roughness: 0.94, flatShading: true }), { biomeId: 'cinder-quarry', z: -4, y: -0.04, segments: 320 }); environmentRoot.add(quarry);
  const cliffMat = new THREE.MeshStandardMaterial({ color: 0x412c43, roughness: 1, flatShading: true });
  const cliffs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), cliffMat, 48), d = new THREE.Object3D();
  for (let i = 0; i < cliffs.count; i += 1) { const a = i / cliffs.count * Math.PI * 2, r = 78 + (i % 4) * 7, x = Math.cos(a) * r, z = Math.sin(a) * r; d.position.set(x, terrainSurfaceYAt('cinder-quarry', x, z) + 3 + (i % 6) * 1.3, z); d.scale.set(7 + (i % 5) * 2.5, 6 + (i % 6) * 2.4, 9 + (i % 3) * 2.5); d.rotation.set(i * 0.16, a, i * 0.08); d.updateMatrix(); cliffs.setMatrixAt(i, d.matrix); }
  cliffs.instanceMatrix.needsUpdate = true; environmentRoot.add(cliffs);
  // Larger, darker rock forms sit beyond the inner quarry rim as a broken mountain skyline.
  const farRim = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), cliffMat, 108);
  for (let i = 0; i < farRim.count; i += 1) {
    const angle = i / farRim.count * Math.PI * 2;
    const radius = 250 + (i % 9) * 24.2;
    const x = Math.cos(angle) * radius, z = Math.sin(angle) * radius;
    d.position.set(x, terrainSurfaceYAt('cinder-quarry', x, z) + 7 + (i % 5) * 2.2, z);
    d.scale.set(10 + (i % 4) * 3.8, 17 + (i % 6) * 5.1, 17 + (i % 5) * 3.8);
    d.rotation.set(i * 0.09, angle, i * 0.05); d.updateMatrix(); farRim.setMatrixAt(i, d.matrix);
  }
  farRim.instanceMatrix.needsUpdate = true; environmentRoot.add(farRim);
}

function addEnvironmentLamps(biomeId) {
  const lampProfiles = {
    'neon-docks': { color: 0x62dfff, height: 8.5, intensity: 25, range: 54, positions: [] },
    'neon-city': { color: 0x64dfff, height: 7.8, intensity: 23, range: 49, positions: [[-13, -120], [13, -120], [-13, 0], [13, 0], [-120, 13], [120, 13]] },
    'pine-basin': { color: 0xffc782, height: 4.2, intensity: 19, range: 37, lantern: true, positions: [[-28, -170], [28, -170], [-52, -44], [52, -44], [-52, 44], [52, 44]] },
    'cinder-quarry': { color: 0xffa06e, height: 8.6, intensity: 24, range: 52, positions: [[-80, -155], [80, -155], [-112, -28], [112, -28], [-58, 93], [58, 93]] },
  };
  const profile = lampProfiles[biomeId];
  if (!profile) return;

  const placements = biomeId === 'neon-docks'
    ? (() => {
      const roads = [];
      const canalCurve = new THREE.CatmullRomCurve3(neonDocksCanalPath.map(([x, z]) => new THREE.Vector3(x, 0, z)), false, 'centripetal');
      for (let index = 0; index < 13; index += 1) {
        const t = 0.035 + index * 0.0775;
        const point = canalCurve.getPointAt(t);
        const tangent = canalCurve.getTangentAt(t).normalize();
        for (const side of [-1, 1]) {
          const offset = side * 84;
          roads.push({
            x: point.x + tangent.z * offset,
            z: point.z - tangent.x * offset,
            facingX: -side * tangent.z,
            facingZ: side * tangent.x,
            downward: true,
          });
        }
      }
      return roads;
    })()
    : profile.positions.map(([x, z]) => ({
      x,
      z,
      facingX: -x / Math.max(1, Math.hypot(x, z)),
      facingZ: -z / Math.max(1, Math.hypot(x, z)),
    }));

  placements.forEach(({ x, z, facingX, facingZ, downward }, index) => {
    const groundY = terrainSurfaceYAt(biomeId, x, z);
    const lamp = new THREE.Group();
    lamp.position.set(x, groundY, z);
    lamp.rotation.y = Math.atan2(-facingZ, facingX);
    environmentRoot.add(lamp);

    cylinder(lamp, 0.2, 0.38, 0.48, [0, 0.24, 0], 'dark', 8);
    const mastHeight = profile.height - (profile.lantern ? 0.5 : 0.68);
    cylinder(lamp, 0.105, 0.16, mastHeight, [0, mastHeight / 2 + 0.24, 0], 'steel', 8);
    const emitterColor = index % 3 === 1 && biomeId !== 'pine-basin' ? 0xffbd79 : profile.color;
    const emitterMaterial = new THREE.MeshBasicMaterial({ color: emitterColor, toneMapped: false });

    if (profile.lantern) {
      const lanternY = profile.height - 0.22;
      box(lamp, [0.65, 0.72, 0.65], [0, lanternY, 0], 'dark');
      box(lamp, [0.48, 0.56, 0.48], [0, lanternY - 0.02, 0], emitterMaterial);
      box(lamp, [0.88, 0.16, 0.88], [0, lanternY + 0.44, 0], 'steel');
      box(lamp, [0.82, 0.12, 0.82], [0, lanternY - 0.43, 0], 'dark');
    } else {
      const headY = profile.height - 0.44;
      cylinder(lamp, 0.075, 0.075, 1.35, [0.57, headY, 0], 'steel', 7, 'x');
      box(lamp, [1.38, 0.22, 0.56], [1.05, headY, 0], 'dark');
      box(lamp, [0.98, 0.08, 0.34], [1.05, headY - 0.15, 0], emitterMaterial);
      box(lamp, [0.18, 0.3, 0.56], [0.34, headY - 0.08, 0], 'steel');
    }

    lamp.traverse((node) => { if (node.isMesh) node.userData.skipShadows = true; });
    if (downward) {
      const targetX = x + facingX * 20;
      const targetZ = z + facingZ * 20;
      const light = new THREE.SpotLight(emitterColor, 34, 58, Math.PI / 3.2, 0.62, 2);
      light.userData.baseIntensity = light.intensity;
      light.position.set(x + facingX * 0.85, groundY + profile.height - 0.4, z + facingZ * 0.85);
      light.target.position.set(targetX, terrainSurfaceYAt(biomeId, targetX, targetZ) + 0.08, targetZ);
      biomeLightRoot.add(light, light.target);
    } else if (index % 2 === 0) {
      const light = new THREE.PointLight(emitterColor, profile.intensity, profile.range, 2);
      light.userData.baseIntensity = profile.intensity;
      light.position.set(x + (profile.lantern ? 0 : facingX * 0.85), groundY + profile.height - 0.4, z + (profile.lantern ? 0 : facingZ * 0.85));
      biomeLightRoot.add(light);
    }
  });
}

function addBiomeLights(accentColors) {
  const positions = [[-28, 10, -13], [22, 7, 19], [0, 5, -34], [34, 4, 28]];
  positions.forEach((p, i) => {
    const color = colors[accentColors[i % accentColors.length]] ?? colors.cyan;
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.28, 8, 6), new THREE.MeshBasicMaterial({ color })); beacon.position.set(p[0], p[1], p[2]); biomeLightRoot.add(beacon);
    const light = new THREE.PointLight(color, 12, 30, 2); light.userData.baseIntensity = 12; light.position.copy(beacon.position); biomeLightRoot.add(light);
  });
}

function addEnvironmentDressing() {
  const biomeIndex = Object.keys(biomes).indexOf(activeBiome);
  let seed = (0x4f1bbc + Math.max(0, biomeIndex) * 0x9e3779b9) >>> 0;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const randomPosition = () => {
    for (let attempt = 0; attempt < 24; attempt += 1) {
      const radius = Math.sqrt(300 * 300 + random() * (1900 * 1900 - 300 * 300));
      const angle = random() * Math.PI * 2;
      const x = Math.cos(angle) * radius;
      const z = Math.sin(angle) * radius - 8;
      if (activeBiome === 'neon-docks') {
        const canalDistance = neonDocksCanalProjection(x, z).distance;
        if (canalDistance < 68 || Math.abs(canalDistance - 79) < 20) continue;
      }
      return { x, z, y: terrainSurfaceYAt(activeBiome, x, z) };
    }
    return { x: 0, z: 0, y: terrainSurfaceYAt(activeBiome, 0, 0) };
  };
  const grassColors = {
    'neon-docks': 0x56684a,
    'neon-city': 0x4d644b,
    'pine-basin': 0x315a40,
    'cinder-quarry': 0x76624f,
  };
  const rockColors = {
    'neon-docks': 0x59616a,
    'neon-city': 0x4b5964,
    'pine-basin': 0x4e5d53,
    'cinder-quarry': 0x765765,
  };
  const grassMaterial = new THREE.MeshStandardMaterial({ color: grassColors[activeBiome] || 0x56684a, roughness: 1, flatShading: true });
  const grass = new THREE.InstancedMesh(new THREE.ConeGeometry(0.23, 0.9, 4), grassMaterial, 560);
  const rocks = new THREE.InstancedMesh(
    new THREE.IcosahedronGeometry(1, 0),
    new THREE.MeshStandardMaterial({ color: rockColors[activeBiome] || 0x59616a, roughness: 0.98, flatShading: true }),
    128,
  );
  const cans = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.16, 0.14, 0.42, 7),
    new THREE.MeshStandardMaterial({ color: 0x68645b, roughness: 0.76, metalness: 0.18 }),
    activeBiome === 'neon-city' ? 42 : 0,
  );
  const litter = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x625747, roughness: 0.96, flatShading: true }),
    activeBiome === 'neon-city' ? 42 : 0,
  );
  const stamp = new THREE.Object3D();
  for (let index = 0; index < grass.count; index += 1) {
    const point = randomPosition();
    const scale = 0.65 + random() * 0.95;
    stamp.position.set(point.x, point.y + scale * 0.45, point.z);
    stamp.rotation.set((random() - 0.5) * 0.12, random() * Math.PI * 2, (random() - 0.5) * 0.12);
    stamp.scale.set(scale * 0.9, scale, scale * 0.9);
    stamp.updateMatrix();
    grass.setMatrixAt(index, stamp.matrix);
  }
  for (let index = 0; index < rocks.count; index += 1) {
    const point = randomPosition();
    const scale = 0.45 + random() * 1.65;
    const height = scale * (0.5 + random() * 0.45);
    stamp.position.set(point.x, point.y + height * 0.72, point.z);
    stamp.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    stamp.scale.set(scale * (0.8 + random() * 0.45), height, scale * (0.75 + random() * 0.4));
    stamp.updateMatrix();
    rocks.setMatrixAt(index, stamp.matrix);
  }
  for (let index = 0; index < cans.count; index += 1) {
    const point = randomPosition();
    const scale = 0.7 + random() * 0.7;
    stamp.position.set(point.x, point.y + 0.2 * scale, point.z);
    stamp.rotation.set((random() - 0.5) * 0.16, random() * Math.PI * 2, (random() - 0.5) * 0.16);
    stamp.scale.setScalar(scale);
    stamp.updateMatrix();
    cans.setMatrixAt(index, stamp.matrix);
  }
  for (let index = 0; index < litter.count; index += 1) {
    const point = randomPosition();
    const thickness = 0.05 + random() * 0.06;
    stamp.position.set(point.x, point.y + thickness / 2, point.z);
    stamp.rotation.set((random() - 0.5) * 0.08, random() * Math.PI * 2, (random() - 0.5) * 0.08);
    stamp.scale.set(0.32 + random() * 0.8, thickness, 0.25 + random() * 0.65);
    stamp.updateMatrix();
    litter.setMatrixAt(index, stamp.matrix);
  }
  for (const mesh of [grass, rocks, cans, litter]) {
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    mesh.userData.skipShadows = true;
    environmentRoot.add(mesh);
  }
  grass.userData.skipFlightCollision = true;
}

function clearChildren(group) {
  while (group.children.length) {
    const child = group.children[0];
    group.remove(child);
    child.traverse?.((object) => {
      if (object.geometry && object.geometry !== boxGeometry) object.geometry.dispose();
      if (object.userData.isBuilderGateBadge
        || object.userData.isGateModelStatusSign
        || object.userData.isRelayPodiumGateNumberBadge) object.material.map?.dispose();
      if (object.userData.isPodiumNameplateText) object.userData.podiumUsernameTexture?.dispose();
      if (object.material && !Object.values(sharedMaterials).includes(object.material)) {
        (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => material.dispose());
      }
    });
  }
}

function applyBiome(id, persist = true, { buildEnvironment = true } = {}) {
  const biome = { id: 'neon-docks', ...biomes['neon-docks'] };
  activeBiome = biome.id;
  builderEnvironmentBuildings.length = 0;
  selectedEnvironmentBuildingId = null;
  builderTransformControls.detach();
  builderSelectionHelper.visible = false;
  environmentState = currentPage === 'builder'
    ? readBuilderBiomeEnvironment(activeBiome)
    : readBiomeEnvironment(activeBiome);
  environmentGrassWindMeshes.length = 0;
  neonDocksWaterAnimation = null;
  clearChildren(environmentRoot); clearChildren(gateRoot); clearChildren(biomeLightRoot);
  if (buildEnvironment) {
    stars.visible = true;
    applyBuilderEnvironmentObjectStates();
    builtBiomeId = biome.id;
  } else {
    builtBiomeId = null;
  }
  applyEnvironmentToScene();
  const gateRows = [];
  defaultGateObjects = buildEnvironment ? gateRows.map((row) => addGate(...row)) : [];
  defaultGateObjects.forEach((gate) => { gate.visible = flying && currentPage !== 'builder'; });
  if (buildEnvironment) {
    enableShadowParticipation(environmentRoot);
    defaultGateObjects.forEach(enableShadowParticipation);
  }
  showDroneBaseY = 8.2;
  showDrone.position.set(1.7, showDroneBaseY, -1.5);
  fieldSpot.material.color.set(colors[biome.colors[0]] ?? colors.cyan);
  if (currentPage === 'trackPicker') setTrackOverviewCamera();
  else resetMenuCamera();
  orbit.update();
  document.querySelector('#biomeName').textContent = biome.name;
  document.querySelector('#biomeDescription').textContent = biome.description;
  document.querySelector('#biomeOverline').textContent = `${biome.region} / FIELD ${String(Object.keys(biomes).indexOf(biome.id) + 1).padStart(2, '0')}`;
  document.querySelector('#stageLocation').textContent = `${biome.region} / ${biome.name.toUpperCase()}`;
  document.querySelector('#annotationName').textContent = biome.name.toUpperCase();
  document.querySelector('#flightFieldLabel').textContent = biome.name.toUpperCase();
  document.querySelector('#builderBiomeSelect').value = 'neon-docks';
  document.querySelector('#mapThumb').dataset.biome = biome.id;
  document.querySelector('#biomeSelect').value = biome.id;
  document.querySelector('.map-thumb-label').textContent = `AF / ${String(Object.keys(biomes).indexOf(biome.id) + 1).padStart(2, '0')}`;
  applyTrackSelection(undefined, false);
  renderer.domElement.setAttribute('aria-label', `Interactive 3D ${biome.name} FPV flight world`);
  if (currentPage === 'builder') setBuilderCamera();
  updatePartyDroneStage();
  syncWorldMode();
  if (persist) { try { localStorage.setItem('aerframe-biome', biome.id); } catch { /* Storage is optional. */ } }
  return biome;
}

function safeApplyBiome(id, persist = true, options = {}) {
  try { return applyBiome(id, persist, options); }
  catch (error) {
    const requestedName = biomes[id]?.name || 'Selected environment';
    console.error(`${requestedName} could not be built.`, error);
    const errorText = error instanceof Error ? error.message : String(error);
    if (id !== 'neon-docks') {
      try {
        const fallback = applyBiome('neon-docks', persist, options);
        showToast(`${requestedName} could not be built. Sky Platform is ready instead.`);
        return fallback;
      } catch (fallbackError) {
        console.error('The fallback flight world could not be built.', fallbackError);
        const fallbackText = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
        showWorldLoadFailure(`Startup error: ${fallbackText}. Reload to try again.`);
        return null;
      }
    }
    showWorldLoadFailure(`Startup error: ${errorText}. Reload to try again.`);
    return null;
  }
}

function resetMenuCamera() {
  camera.fov = 48;
  camera.position.set(0, 6.8, 31);
  orbit.target.set(0, 9.8, -9);
  camera.updateProjectionMatrix();
  orbit.update();
}

function setTrackOverviewCamera() {
  camera.fov = 54;
  const points = Array.isArray(activeTrack?.points) ? activeTrack.points : [];
  if (points.length) {
    const spread = activeTrack.id?.startsWith('community-') ? 1 : 1.7;
    const xs = points.map((point) => Number(point[0]) * spread || 0);
    const ys = points.map((point) => Number(point[1]) || 0);
    const zs = points.map((point) => Number(point[2]) * spread || 0);
    const centerX = (Math.min(...xs) + Math.max(...xs)) / 2;
    const centerY = (Math.min(...ys) + Math.max(...ys)) / 2;
    const centerZ = (Math.min(...zs) + Math.max(...zs)) / 2;
    const span = Math.max(60, Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...zs) - Math.min(...zs)));
    const distance = Math.min(360, Math.max(140, span * 1.25));
    orbit.target.set(centerX, centerY, centerZ);
    camera.position.set(centerX + distance * 0.42, centerY + distance * 0.75, centerZ + distance * 0.9);
  } else {
    camera.position.set(74, 108, menuPlatformCenterZ + 140);
    orbit.target.set(0, 1.2, menuPlatformCenterZ);
  }
  camera.updateProjectionMatrix();
  orbit.update();
}

function showTrackPickerSkyPlatformLabel() {
  document.querySelector('#biomeOverline').textContent = 'SKY PLATFORM / COURSE DECK';
  document.querySelector('#biomeName').textContent = 'Sky Platform';
  document.querySelector('#biomeDescription').textContent = 'A grass flight deck beneath a field of stars';
  document.querySelector('#stageLocation').textContent = 'SKY PLATFORM';
  document.querySelector('#annotationName').textContent = 'SKY PLATFORM';
  document.querySelector('#flightFieldLabel').textContent = 'SKY PLATFORM';
  document.querySelector('#mapThumb').dataset.biome = 'sky-platform';
  document.querySelector('.map-thumb-label').textContent = 'SKY / 01';
}

// The hangar drone stays empty until the uploaded GLB parts have loaded.
const showDrone = new THREE.Group();
const flightCameraModelOffset = new THREE.Vector3(0, 0.08, 0.46);
showDrone.position.set(1.7, 8.2, -1.5);
showDrone.rotation.y = 0.4;
showDrone.scale.setScalar(1.45);
world.add(showDrone);
const propellers = [];
const savedMenuDroneTransform = {
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  scale: new THREE.Vector3(),
};
let menuDroneTransformSaved = false;
// The uploaded prop meshes have their blade plane perpendicular to model-space Y.
const droneRotorSpinAxis = new THREE.Vector3(0, 1, 0);
const droneRotorSpinStep = new THREE.Quaternion();

function spinDroneRotor(rotor, angle) {
  const base = rotor.userData.spinBaseQuaternion || (rotor.userData.spinBaseQuaternion = rotor.quaternion.clone());
  rotor.userData.spinAngle = (((Number(rotor.userData.spinAngle) || 0) + angle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  droneRotorSpinStep.setFromAxisAngle(droneRotorSpinAxis, rotor.userData.spinAngle);
  rotor.quaternion.copy(base).multiply(droneRotorSpinStep);
}

const partyDroneRoot = new THREE.Group();
partyDroneRoot.name = 'Flight party showcase drones';
world.add(partyDroneRoot);
const partyDroneObjects = Array.from({ length: 3 }, (_, index) => {
  const drone = showDrone.clone(true);
  drone.scale.setScalar(1.08);
  drone.visible = false;
  drone.userData.partySlot = index;
  partyDroneRoot.add(drone);
  return drone;
});
const livePartyDroneObjects = Array.from({ length: 7 }, (_, index) => {
  const drone = showDrone.clone(true);
  drone.scale.setScalar(1.08);
  drone.visible = false;
  drone.userData.livePartySlot = index;
  partyDroneRoot.add(drone);
  return drone;
});
const displayedDroneNeonMeshes = new Set();
const displayedDroneBodyMeshes = new Set();
const displayedDronePropMeshes = new Set();
enableShadowParticipation(showDrone);
partyDroneObjects.forEach(enableShadowParticipation);
livePartyDroneObjects.forEach(enableShadowParticipation);
const partyDroneRotors = partyDroneObjects.map((drone) => {
  const rotors = [];
  drone.traverse((node) => { if (node.userData.isPartyRotor) rotors.push(node); });
  return rotors;
});
const livePartyDroneRotors = livePartyDroneObjects.map((drone) => {
  const rotors = [];
  drone.traverse((node) => { if (node.userData.isPartyRotor) rotors.push(node); });
  return rotors;
});

function applyDroneNeonColor(color) {
  droneArmGlowMaterial.color.set(color);
  droneArmGlowMaterial.emissive.set(color);
  displayedDroneNeonMeshes.forEach((mesh) => {
    if (!mesh.isMesh) return;
    const armMaterialSlots = mesh.userData.droneArmGlowMaterialSlots;
    if (Array.isArray(armMaterialSlots) && Array.isArray(mesh.material)) {
      armMaterialSlots.forEach((slot) => { mesh.material[slot] = droneArmGlowMaterial; });
    } else {
      mesh.material = droneArmGlowMaterial;
    }
  });
}

function applyDroneBodyColor(color) {
  droneBodyColorMaterial.color.set(color);
  droneBodyPaintMaterial.color.set(color);
  droneUsaBodySkinMaterial.color.set(color);
  if (droneSkinId.startsWith('country:')) return;
  displayedDroneBodyMeshes.forEach((mesh) => {
    const slots = mesh.userData.droneBodyColorMaterialSlots;
    if (mesh.userData.isDronePaintedBody) mesh.material = droneBodyPaintMaterial;
    else if (Array.isArray(mesh.material)) slots.forEach((slot) => { mesh.material[slot] = droneBodyColorMaterial; });
    else mesh.material = droneBodyColorMaterial;
  });
}

function applyDronePropColor(color) {
  dronePropColorMaterial.color.set(color);
  displayedDronePropMeshes.forEach((mesh) => { mesh.material = dronePropColorMaterial; });
}

function applyDroneSkin(skinId, selectedCountryCode = droneCountryFlagCode) {
  const requestedCountryCode = skinId === 'usa-flag'
    ? 'us'
    : skinId === 'country-flag'
      ? selectedCountryCode
      : /^country:([a-z]{2})$/.exec(skinId || '')?.[1];
  const countryCode = requestedCountryCode && droneCountryByCode.has(requestedCountryCode) ? requestedCountryCode : null;
  droneSkinId = countryCode ? `country:${countryCode}` : 'standard';
  if (countryCode) {
    droneCountryFlagCode = countryCode;
    void loadDroneCountryFlagTexture(countryCode).catch((error) => console.error('The country flag skin could not be loaded.', error));
  } else {
    droneCountryFlagLoadId += 1;
  }
  displayedDroneBodyMeshes.forEach((mesh) => {
    if (countryCode) {
      mesh.material = droneUsaBodySkinMaterial;
      return;
    }
    const slots = mesh.userData.droneBodyColorMaterialSlots;
    if (mesh.userData.isDronePaintedBody) mesh.material = droneBodyPaintMaterial;
    else if (Array.isArray(mesh.material) && slots) slots.forEach((slot) => { mesh.material[slot] = droneBodyColorMaterial; });
    else mesh.material = droneBodyColorMaterial;
  });
}

function registerFlightArmDamageMesh(mesh) {
  if (!mesh?.geometry?.attributes?.position) return;
  const armSlots = new Set(mesh.userData.droneArmGlowMaterialSlots || []);
  const wholeMeshIsArm = mesh.userData.isDroneArmGlowMaterial === true;
  const isCustomDroneArm = Array.isArray(mesh.userData.droneArmAttachPoint);
  if (!armSlots.size && !wholeMeshIsArm && !isCustomDroneArm) return;
  mesh.geometry = mesh.geometry.clone();
  const geometry = mesh.geometry;
  const positions = geometry.attributes.position;
  const index = geometry.index;
  geometry.computeBoundingBox();
  const origin = isCustomDroneArm
    ? new THREE.Vector3(...mesh.userData.droneArmAttachPoint)
    : geometry.boundingBox.getCenter(new THREE.Vector3());
  const arms = [];

  const wholeGeometry = wholeMeshIsArm || !geometry.groups.length;
  if (isCustomDroneArm) {
    const vertexIndices = [...new Set(Array.from({ length: index ? index.count : positions.count }, (_, cursor) => (
      index ? index.getX(cursor) : cursor
    )))];
    const center = new THREE.Vector3();
    let maxRadius = 0;
    let tipVertex = -1;
    vertexIndices.forEach((vertexIndex) => {
      const x = positions.getX(vertexIndex);
      const y = positions.getY(vertexIndex);
      const z = positions.getZ(vertexIndex);
      center.x += x;
      center.y += y;
      center.z += z;
      const radius = Math.hypot(x - origin.x, z - origin.z);
      if (radius > maxRadius) {
        maxRadius = radius;
        tipVertex = vertexIndex;
      }
    });
    if (vertexIndices.length && maxRadius >= 0.0001) {
      center.multiplyScalar(1 / vertexIndices.length);
      arms.push({ center, maxRadius, vertexIndices, tipVertex, motorIndex: 0 });
    }
  } else if (wholeGeometry) {
    const quadrants = Array.from({ length: 4 }, () => []);
    const seen = new Set();
    const vertexCount = index ? index.count : positions.count;
    for (let cursor = 0; cursor < vertexCount; cursor += 1) {
      const vertexIndex = index ? index.getX(cursor) : cursor;
      if (seen.has(vertexIndex)) continue;
      seen.add(vertexIndex);
      const dx = positions.getX(vertexIndex) - origin.x;
      const dz = positions.getZ(vertexIndex) - origin.z;
      const motorIndex = (dx < 0 ? 0 : 2) + (dz >= 0 ? 1 : 0);
      quadrants[motorIndex].push(vertexIndex);
    }
    quadrants.forEach((vertexIndices, motorIndex) => {
      const center = new THREE.Vector3();
      let maxRadius = 0;
      let tipVertex = -1;
      vertexIndices.forEach((vertexIndex) => {
        const x = positions.getX(vertexIndex);
        const y = positions.getY(vertexIndex);
        const z = positions.getZ(vertexIndex);
        center.x += x;
        center.y += y;
        center.z += z;
        const radius = Math.hypot(x - origin.x, z - origin.z);
        if (radius > maxRadius) {
          maxRadius = radius;
          tipVertex = vertexIndex;
        }
      });
      if (!vertexIndices.length || maxRadius < 0.0001) return;
      center.multiplyScalar(1 / vertexIndices.length);
      arms.push({ center, maxRadius, vertexIndices, tipVertex, motorIndex });
    });
  } else geometry.groups.forEach((group) => {
    if (!armSlots.has(group.materialIndex)) return;
    const first = Math.max(0, group.start);
    const end = Math.min(group.start + group.count, index ? index.count : positions.count);
    const vertexIndices = new Set();
    const center = new THREE.Vector3();
    let maxRadius = 0;
    let tipVertex = -1;
    for (let cursor = first; cursor < end; cursor += 1) {
      const vertexIndex = index ? index.getX(cursor) : cursor;
      if (vertexIndices.has(vertexIndex)) continue;
      vertexIndices.add(vertexIndex);
      const x = positions.getX(vertexIndex);
      const y = positions.getY(vertexIndex);
      const z = positions.getZ(vertexIndex);
      center.x += x;
      center.y += y;
      center.z += z;
      const radius = Math.hypot(x - origin.x, z - origin.z);
      if (radius > maxRadius) {
        maxRadius = radius;
        tipVertex = vertexIndex;
      }
    }
    if (!vertexIndices.size || maxRadius < 0.0001) return;
    center.multiplyScalar(1 / vertexIndices.size);
    arms.push({ center, maxRadius, vertexIndices: [...vertexIndices], tipVertex, motorIndex: 0 });
  });

  if (arms.length) {
    flightArmDamageMeshes.push({
      mesh,
      geometry,
      origin,
      basePositions: new Float32Array(positions.array),
      arms,
    });
  }
}

function assignFlightArmMotors() {
  if (!propellers.length || !flightArmDamageMeshes.length) return;
  showDrone.updateWorldMatrix(true, true);
  const motors = propellers.map((rotor) => {
    const position = rotor.getWorldPosition(new THREE.Vector3());
    return {
      position: showDrone.worldToLocal(position),
      motorIndex: rotor.userData.flightMotorIndex,
    };
  });
  flightArmDamageMeshes.forEach(({ mesh, arms }) => {
    mesh.updateWorldMatrix(true, false);
    arms.forEach((arm) => {
      const armCenter = arm.center.clone().applyMatrix4(mesh.matrixWorld);
      showDrone.worldToLocal(armCenter);
      let nearestMotorIndex = 0;
      let nearestDistance = Infinity;
      motors.forEach(({ position, motorIndex }) => {
        const distance = armCenter.distanceToSquared(position);
        if (distance >= nearestDistance) return;
        nearestDistance = distance;
        nearestMotorIndex = motorIndex;
      });
      arm.motorIndex = nearestMotorIndex;
      mesh.userData.flightMotorIndex = nearestMotorIndex;
    });
  });
}

function deformFlightArmsForDestruction() {
  if (!flightArmDamageMeshes.length) return;
  const verticalBends = [0.62, -0.72, 0.56, -0.66];
  const lateralBends = [-0.42, 0.5, 0.38, -0.46];
  flightArmDamageMeshes.forEach(({ geometry, basePositions }) => {
    geometry.attributes.position.array.set(basePositions);
  });
  propellers.forEach((rotor) => {
    if (rotor.userData.flightArmBasePosition) rotor.position.copy(rotor.userData.flightArmBasePosition);
  });
  flightArmDamageMeshes.forEach(({ mesh, geometry, origin, basePositions, arms }) => {
    const positions = geometry.attributes.position;
    arms.forEach((arm) => {
      if (!flightDamageState.brokenArms[arm.motorIndex]) return;
      const motorIndex = arm.motorIndex % verticalBends.length;
      const maxRadius = Math.max(0.0001, arm.maxRadius);
      arm.vertexIndices.forEach((vertexIndex) => {
        const offset = vertexIndex * 3;
        const x = basePositions[offset];
        const y = basePositions[offset + 1];
        const z = basePositions[offset + 2];
        const dx = x - origin.x;
        const dz = z - origin.z;
        const radius = Math.hypot(dx, dz);
        const alongArm = THREE.MathUtils.clamp((radius / maxRadius - 0.2) / 0.68, 0, 1);
        const bend = alongArm * alongArm * (3 - 2 * alongArm);
        const side = lateralBends[motorIndex] * maxRadius * bend;
        const inverseRadius = radius > 0.001 ? 1 / radius : 0;
        positions.setXYZ(
          vertexIndex,
          x - dz * inverseRadius * side,
          y + verticalBends[motorIndex] * maxRadius * bend,
          z + dx * inverseRadius * side,
        );
      });
      const rotor = propellers.find((candidate) => candidate.userData.flightMotorIndex === arm.motorIndex);
      if (rotor?.parent && arm.tipVertex >= 0) {
        const offset = arm.tipVertex * 3;
        const x = basePositions[offset];
        const y = basePositions[offset + 1];
        const z = basePositions[offset + 2];
        const dx = x - origin.x;
        const dz = z - origin.z;
        const radius = Math.hypot(dx, dz);
        const alongArm = THREE.MathUtils.clamp((radius / maxRadius - 0.2) / 0.68, 0, 1);
        const bend = alongArm * alongArm * (3 - 2 * alongArm);
        const side = lateralBends[motorIndex] * maxRadius * bend;
        const inverseRadius = radius > 0.001 ? 1 / radius : 0;
        flightDroneRotorWorldPosition.set(
          x - dz * inverseRadius * side,
          y + verticalBends[motorIndex] * maxRadius * bend,
          z + dx * inverseRadius * side,
        );
        const bentWorldPosition = flightDroneRotorWorldPosition.clone().applyMatrix4(mesh.matrixWorld);
        const originalWorldPosition = new THREE.Vector3(x, y, z).applyMatrix4(mesh.matrixWorld);
        rotor.parent.updateWorldMatrix(true, false);
        const originalParentPosition = rotor.parent.worldToLocal(originalWorldPosition);
        const bentParentPosition = rotor.parent.worldToLocal(bentWorldPosition);
        if (rotor.userData.flightArmBasePosition) {
          rotor.position.copy(rotor.userData.flightArmBasePosition)
            .add(bentParentPosition.sub(originalParentPosition));
        }
      }
    });
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  });
  refreshFlightGroundSupportOffsets();
}

function resetFlightArmDeformation() {
  flightArmDamageMeshes.forEach(({ geometry, basePositions }) => {
    const positions = geometry.attributes.position;
    positions.array.set(basePositions);
    positions.needsUpdate = true;
    geometry.computeVertexNormals();
    geometry.computeBoundingBox();
    geometry.computeBoundingSphere();
  });
  propellers.forEach((rotor) => {
    if (rotor.userData.flightArmBasePosition) rotor.position.copy(rotor.userData.flightArmBasePosition);
  });
  refreshFlightGroundSupportOffsets();
}

async function loadDroneShowcaseModel() {
  try {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    const loader = new GLTFLoader();
    const loadAsset = (filename) => loader.loadAsync(new URL(`models/drone/${encodeURIComponent(filename)}`, document.baseURI).href);
    const loadDroneAsset = (filename, fallback = null) => {
      const path = new URL(`models/drone/${encodeURIComponent(filename)}`, document.baseURI).href;
      return loader.loadAsync(path).catch((error) => {
        if (!fallback) throw error;
        return loader.loadAsync(new URL(`models/drone/${encodeURIComponent(fallback)}`, document.baseURI).href);
      });
    };
    const [bodyGltf, frArmGltf, brArmGltf, blArmGltf, flArmGltf, frPropGltf, brPropGltf, blPropGltf, flPropGltf] = await Promise.all([
      loadDroneAsset('NeonDroneBody.glb', 'Drone Body.glb'),
      loadDroneAsset('NeonDroneArmFR.glb', null),
      loadDroneAsset('NeonDroneArmBR.glb', null),
      loadDroneAsset('NeonDroneArmBL.glb', null),
      loadDroneAsset('NeonDroneArmFL.glb', null),
      loadAsset('FRProp.glb'),
      loadAsset('BRProp.glb'),
      loadAsset('BLProp.glb'),
      loadAsset('FLProp.glb'),
    ]);

    bodyGltf.scene.updateMatrixWorld(true);
    const bodyBounds = new THREE.Box3().setFromObject(bodyGltf.scene);

    const droneAssembly = new THREE.Group();
    const customArmPositions = new Map();
    const addStyledPart = (source, { neon = false, bodyColor = false, solidBodyColor = false, propColor = false } = {}) => {
      const part = source.clone(true);
      part.traverse((node) => {
        if (!node.isMesh) return;
        node.castShadow = true;
        node.receiveShadow = true;
        const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
        if (solidBodyColor) {
          node.userData.isDroneSolidBodyColor = true;
          node.material = droneBodyColorMaterial;
        }
        if (bodyColor && nodeMaterials.some((material) => material?.name === 'Material.037')) {
          node.userData.isDroneCameraMount = true;
        }
        if (bodyColor) {
          const bodyColorSlots = nodeMaterials.flatMap((material, index) => {
            const color = material?.color;
            if (!color) return [];
            const isBlueBodyPanel = color.b > 0.16 && color.b > color.r * 1.45 && color.b > color.g * 1.12;
            return isBlueBodyPanel ? [index] : [];
          });
          if (bodyColorSlots.length) node.userData.droneBodyColorMaterialSlots = bodyColorSlots;
        }
        if (propColor) node.userData.isDronePropColor = true;
        if (neon) {
          node.userData.isUserDroneNeon = true;
          node.material = droneArmGlowMaterial;
        }
      });
      droneAssembly.add(part);
      return part;
    };
    const requireMesh = (gltf, label) => {
      let mesh = null;
      gltf.scene.traverse((node) => { if (!mesh && node.isMesh) mesh = node; });
      if (!mesh) throw new Error(`${label} contains no mesh.`);
      return mesh;
    };
    const fpvMotorBodyMaterial = new THREE.MeshStandardMaterial({ color: 0x101419, roughness: 0.42, metalness: 0.68 });
    const fpvMotorDetailMaterial = new THREE.MeshStandardMaterial({ color: 0x252b31, roughness: 0.34, metalness: 0.78 });
    const fpvMotorBlackMaterial = new THREE.MeshStandardMaterial({ color: 0x050608, roughness: 0.62, metalness: 0.3 });
    const fpvMotorBellGeometry = new THREE.CylinderGeometry(2, 2.2, 1.35, 24);
    const fpvMotorBaseGeometry = new THREE.CylinderGeometry(2.35, 2.35, 0.28, 24);
    const fpvMotorCapGeometry = new THREE.CylinderGeometry(1.55, 1.7, 0.24, 20);
    const fpvMotorShaftGeometry = new THREE.CylinderGeometry(0.45, 0.5, 0.62, 12);
    const fpvMotorFinGeometry = new THREE.BoxGeometry(0.18, 0.6, 0.14);
    const fpvMotorScrewGeometry = new THREE.CylinderGeometry(0.15, 0.15, 0.06, 8);
    const createFpvMotor = () => {
      const motor = new THREE.Group();
      motor.name = 'Black FPV motor';
      const bell = new THREE.Mesh(fpvMotorBellGeometry, fpvMotorBodyMaterial);
      bell.position.y = -1;
      motor.add(bell);
      const base = new THREE.Mesh(fpvMotorBaseGeometry, fpvMotorBlackMaterial);
      base.position.y = -1.68;
      motor.add(base);
      const cap = new THREE.Mesh(fpvMotorCapGeometry, fpvMotorBlackMaterial);
      cap.position.y = -0.02;
      motor.add(cap);
      const shaft = new THREE.Mesh(fpvMotorShaftGeometry, fpvMotorDetailMaterial);
      shaft.position.y = 0.5;
      motor.add(shaft);
      for (let finIndex = 0; finIndex < 8; finIndex += 1) {
        const angle = (finIndex / 8) * Math.PI * 2;
        const fin = new THREE.Mesh(fpvMotorFinGeometry, fpvMotorBlackMaterial);
        fin.position.set(Math.cos(angle) * 2, -1, Math.sin(angle) * 2);
        fin.rotation.y = -angle;
        motor.add(fin);
      }
      for (const [x, z] of [[-1.15, -1.15], [1.15, -1.15], [-1.15, 1.15], [1.15, 1.15]]) {
        const screw = new THREE.Mesh(fpvMotorScrewGeometry, fpvMotorDetailMaterial);
        screw.position.set(x, 0.16, z);
        motor.add(screw);
      }
      return motor;
    };
    const bodyCenter = bodyBounds.getCenter(new THREE.Vector3());
    const bodyDimensions = bodyBounds.getSize(new THREE.Vector3());
    const bodyCameraPoint = bodyCenter.clone();
    bodyCameraPoint.y -= 0.4;
    bodyCameraPoint.z = bodyBounds.max.z + 0.45;
    const bodyPart = addStyledPart(bodyGltf.scene, { bodyColor: true, solidBodyColor: true });
    bodyPart.updateWorldMatrix(true, true);
    bodyPart.traverse((node) => {
      if (!node.isMesh) return;
      const sourceGeometry = node.geometry;
      const paintedGeometry = sourceGeometry.index ? sourceGeometry.toNonIndexed() : sourceGeometry.clone();
      sourceGeometry.dispose();
      node.geometry = paintedGeometry;
      const positions = paintedGeometry.attributes.position;
      const colors = new Float32Array(positions.count * 3);
      const droneSkinUvs = new Float32Array(positions.count * 2);
      const droneSkinTopMask = new Float32Array(positions.count);
      colors.fill(1);
      node.updateWorldMatrix(true, false);
      const firstVertex = new THREE.Vector3();
      const secondVertex = new THREE.Vector3();
      const thirdVertex = new THREE.Vector3();
      const firstEdge = new THREE.Vector3();
      const secondEdge = new THREE.Vector3();
      const faceNormal = new THREE.Vector3();
      for (let vertex = 0; vertex + 2 < positions.count; vertex += 3) {
        firstVertex.fromBufferAttribute(positions, vertex).applyMatrix4(node.matrixWorld);
        secondVertex.fromBufferAttribute(positions, vertex + 1).applyMatrix4(node.matrixWorld);
        thirdVertex.fromBufferAttribute(positions, vertex + 2).applyMatrix4(node.matrixWorld);
        firstEdge.subVectors(secondVertex, firstVertex);
        secondEdge.subVectors(thirdVertex, firstVertex);
        faceNormal.crossVectors(firstEdge, secondEdge).normalize();
        const centerZ = (firstVertex.z + secondVertex.z + thirdVertex.z) / 3;
        const isWindshieldFace = faceNormal.z > 0.2 && centerZ > bodyCenter.z + 1.8;
        const faceHasTopFlag = faceNormal.y > 0.24;
        for (let corner = 0; corner < 3; corner += 1) {
          const colorOffset = (vertex + corner) * 3;
          const vertexIndex = vertex + corner;
          const skinUvOffset = vertexIndex * 2;
          const point = corner === 0 ? firstVertex : corner === 1 ? secondVertex : thirdVertex;
          droneSkinUvs[skinUvOffset] = THREE.MathUtils.clamp((point.z - bodyBounds.min.z) / bodyDimensions.z, 0, 1);
          droneSkinUvs[skinUvOffset + 1] = 1 - THREE.MathUtils.clamp((point.x - bodyBounds.min.x) / bodyDimensions.x, 0, 1);
          if (isWindshieldFace) {
            colors[colorOffset] = 0.005;
            colors[colorOffset + 1] = 0.005;
            colors[colorOffset + 2] = 0.005;
          } else if (faceHasTopFlag) {
            droneSkinTopMask[vertexIndex] = 1;
          }
        }
      }
      paintedGeometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      paintedGeometry.setAttribute('droneSkinUv', new THREE.BufferAttribute(droneSkinUvs, 2));
      paintedGeometry.setAttribute('droneSkinTopMask', new THREE.BufferAttribute(droneSkinTopMask, 1));
      node.material = droneBodyPaintMaterial;
      node.userData.isDronePaintedBody = true;
    });
    [
      ['FR', frArmGltf, 'NeonDroneArmFR.glb'],
      ['BR', brArmGltf, 'NeonDroneArmBR.glb'],
      ['BL', blArmGltf, 'NeonDroneArmBL.glb'],
      ['FL', flArmGltf, 'NeonDroneArmFL.glb'],
    ].forEach(([side, armGltf, label]) => {
      if (!armGltf) return;
      armGltf.scene.updateMatrixWorld(true);
      const armSource = requireMesh(armGltf, label);
      const armPosition = armSource.getWorldPosition(new THREE.Vector3());
      const armPart = addStyledPart(armSource, { neon: true });
      armPart.position.copy(armPosition);
      armPart.quaternion.copy(armSource.getWorldQuaternion(new THREE.Quaternion()));
      armPart.scale.copy(armSource.getWorldScale(new THREE.Vector3()));
      armPart.userData.isCustomDroneArm = true;
      armPart.userData.droneArmSide = side;
      armPart.updateWorldMatrix(true, false);
      armPart.userData.droneArmAttachPoint = armPart.worldToLocal(bodyBounds.getCenter(new THREE.Vector3())).toArray();
      customArmPositions.set(side, armPosition);
      droneAssembly.add(armPart);
    });
    [
      ['FR', frPropGltf, 'FRProp.glb'],
      ['BR', brPropGltf, 'BRProp.glb'],
      ['BL', blPropGltf, 'BLProp.glb'],
      ['FL', flPropGltf, 'FLProp.glb'],
    ].forEach(([side, gltf, label]) => {
      gltf.scene.updateMatrixWorld(true);
      const source = requireMesh(gltf, label);
      const rotor = new THREE.Group();
      rotor.name = `${label.replace('.glb', '')} rotor`;
      const armPosition = customArmPositions.get(side);
      rotor.position.copy(armPosition || source.getWorldPosition(new THREE.Vector3()));
      if (armPosition) rotor.position.y += 1;
      rotor.userData.isPartyRotor = true;
      rotor.userData.flightMotorIndex = ({ BR: 0, FR: 1, BL: 2, FL: 3 })[side];
      rotor.add(createFpvMotor());
      const propeller = addStyledPart(source, { propColor: true });
      propeller.position.set(0, 0, 0);
      propeller.quaternion.copy(source.getWorldQuaternion(new THREE.Quaternion()));
      propeller.scale.copy(source.getWorldScale(new THREE.Vector3()));
      rotor.add(propeller);
      droneAssembly.add(rotor);
    });

    droneAssembly.updateMatrixWorld(true);
    const droneBounds = new THREE.Box3().setFromObject(droneAssembly);
    if (droneBounds.isEmpty()) throw new Error('The drone GLB has no visible geometry.');
    const droneGroundBounds = new THREE.Box3();
    droneAssembly.traverse((node) => {
      if (!node.isMesh) return;
      let ancestor = node.parent;
      while (ancestor && ancestor !== droneAssembly && !ancestor.userData.isPartyRotor) ancestor = ancestor.parent;
      if (ancestor?.userData.isPartyRotor) return;
      droneGroundBounds.expandByObject(node);
    });
    if (droneGroundBounds.isEmpty()) droneGroundBounds.copy(droneBounds);
    const droneSize = droneBounds.getSize(new THREE.Vector3());
    const droneCenter = droneBounds.getCenter(new THREE.Vector3());
    const modelScale = 3.5 / Math.max(droneSize.x, droneSize.z);
    flightDroneGroundSupportOffsets.forEach((offset, corner) => {
      offset.set(
        corner & 1 ? droneGroundBounds.max.x : droneGroundBounds.min.x,
        corner & 2 ? droneGroundBounds.max.y : droneGroundBounds.min.y,
        corner & 4 ? droneGroundBounds.max.z : droneGroundBounds.min.z,
      ).sub(droneCenter).multiplyScalar(modelScale);
    });
    const normalizedDrone = new THREE.Group();
    normalizedDrone.position.copy(droneCenter).multiplyScalar(-modelScale);
    normalizedDrone.scale.setScalar(modelScale);
    normalizedDrone.add(droneAssembly);
    normalizedDrone.updateMatrixWorld(true);
    flightCameraModelOffset.copy(bodyCameraPoint).sub(droneCenter).multiplyScalar(modelScale);

    const previousGeometries = new Set();
    const previousMaterials = new Set();
    const sharedMaterialSet = new Set([
      ...Object.values(sharedMaterials),
      droneArmGlowMaterial,
      droneBodyColorMaterial,
      droneBodyPaintMaterial,
      dronePropColorMaterial,
    ]);
    [showDrone, ...partyDroneObjects, ...livePartyDroneObjects].forEach((drone) => {
      drone.traverse((node) => {
        if (!node.isMesh) return;
        if (node.geometry !== boxGeometry) previousGeometries.add(node.geometry);
        for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
          if (material && !sharedMaterialSet.has(material)) previousMaterials.add(material);
        }
      });
      drone.clear();
    });
    previousGeometries.forEach((oldGeometry) => oldGeometry.dispose());
    previousMaterials.forEach((oldMaterial) => oldMaterial.dispose());

    const addModel = (drone, rotorList) => {
      const model = normalizedDrone.clone(true);
      model.traverse((node) => {
        const hasDroneArmGlow = node.userData.isDroneArmGlowMaterial || node.userData.droneArmGlowMaterialSlots?.length;
        if (node.isMesh && node.userData.isDroneSolidBodyColor) displayedDroneBodyMeshes.add(node);
        if (node.isMesh && node.userData.droneBodyColorMaterialSlots?.length) {
          node.userData.droneBodyColorMaterialSlots = [...node.userData.droneBodyColorMaterialSlots];
          displayedDroneBodyMeshes.add(node);
        }
        if (drone === showDrone && node.isMesh) {
          const nodeMaterials = Array.isArray(node.material) ? node.material : [node.material];
          const isArmGlowMesh = node.userData.droneArmGlowMaterialSlots?.length
            || node.userData.isDroneArmGlowMaterial
            || nodeMaterials.includes(droneArmGlowMaterial);
          if (isArmGlowMesh) registerFlightArmDamageMesh(node);
        }
        if (node.isMesh && node.userData.isDronePropColor) {
          node.material = dronePropColorMaterial;
          displayedDronePropMeshes.add(node);
        }
        if (node.isMesh && (node.userData.isUserDroneNeon || hasDroneArmGlow)) {
          if (node.userData.droneArmGlowMaterialSlots?.length && Array.isArray(node.material)) {
            node.material = node.material.slice();
            node.userData.droneArmGlowMaterialSlots.forEach((slot) => {
              node.material[slot] = droneArmGlowMaterial;
            });
          } else {
            node.material = droneArmGlowMaterial;
          }
          displayedDroneNeonMeshes.add(node);
        }
        if (!node.userData.isPartyRotor) return;
        node.userData.spinBaseQuaternion = node.quaternion.clone();
        node.userData.spinAngle = 0;
        node.userData.flightArmBasePosition = node.position.clone();
        if (rotorList) rotorList.push(node);
        if (drone === showDrone) propellers.push(node);
      });
      drone.add(model);
    };
    propellers.length = 0;
    flightArmDamageMeshes.length = 0;
    partyDroneRotors.forEach((rotors) => { rotors.length = 0; });
    livePartyDroneRotors.forEach((rotors) => { rotors.length = 0; });
    addModel(showDrone, null);
    partyDroneObjects.forEach((drone, index) => addModel(drone, partyDroneRotors[index]));
    livePartyDroneObjects.forEach((drone, index) => addModel(drone, livePartyDroneRotors[index]));
    assignFlightArmMotors();
    if (flightDamageState.crashed) deformFlightArmsForDestruction();
    applyDroneNeonColor(droneNeonColor);
    applyDroneBodyColor(droneBodyColor);
    applyDronePropColor(dronePropColor);
    applyDroneSkin(droneSkinId);
  } catch (error) {
    console.error('The uploaded showcase drone could not be loaded.', error);
  }
}

void loadDroneShowcaseModel().finally(() => requestAnimationFrame(captureMenuChoiceTiles));

const fieldSpot = new THREE.Mesh(new THREE.CircleGeometry(4.6, 24), new THREE.MeshBasicMaterial({ color: colors.orange, transparent: true, opacity: 0.12, depthWrite: false }));
fieldSpot.rotation.x = -Math.PI / 2;
fieldSpot.position.set(1.7, 0.02, -1.5);
world.add(fieldSpot);

const panels = [...document.querySelectorAll('[data-panel]')];
const navButtons = [...document.querySelectorAll('.page-nav-button')];
const settingsTabs = [...document.querySelectorAll('[data-settings-tab]')];
const settingsPanels = [...document.querySelectorAll('[data-settings-content]')];
const flightMainMenuButton = document.querySelector('#flightMainMenuButton');
const hud = document.querySelector('#flightHud');
const toast = document.querySelector('#toast');
const authModal = document.querySelector('#authModal');
let signedInUser = null;
let partyLobby = null;
const partyFlightSnapshots = new Map();
let partyServerClockOffsetMs = 0;
let gameChatChannel = 'world';
let gameChatCache = { lobby: [], world: [] };
let gameChatLobbyCode = '';
let gameChatUserId = null;
let gameChatSending = false;
let gameChatRequestPending = false;
let gameChatStatusMessage = '';
let gameChatStatusIsError = false;
let lastSettledRaceProgressKey = '';
const multiplayerModes = {
  'competitive-4v4': 'Tournament',
  '4v4': '4v4',
  'relay-race': 'Relay Race',
  'prop-hunt': 'Prop Hunt',
};
const builderGameModeLabels = { '4v4': '4v4', 'relay-race': 'Relay', 'prop-hunt': 'Prop Hunt' };
let builderGameMode = '4v4';
let tournamentModeAvailable = false;
let selectedMultiplayerMode = '4v4';
function setTournamentAvailability(tournament) {
  const startsAt = Date.parse(tournament?.startsAt || '');
  const available = Boolean(tournament?.title && Number.isFinite(startsAt) && startsAt > Date.now());
  const wasAvailable = tournamentModeAvailable;
  tournamentModeAvailable = available;
  const card = document.querySelector('[data-game-mode="competitive-4v4"]');
  if (card) {
    card.disabled = !available;
    card.classList.toggle('is-locked', !available);
    card.setAttribute('aria-disabled', String(!available));
    card.setAttribute('aria-label', available
      ? `Tournament: ${tournament.title}, starts ${new Date(startsAt).toLocaleString()}.`
      : 'Tournament. Locked until an event is scheduled.');
    card.title = available
      ? `${tournament.title} starts ${new Date(startsAt).toLocaleString()}.`
      : 'Tournament mode is locked until a future tournament is scheduled.';
    const status = card.querySelector('.game-mode-card-copy small');
    if (status) status.textContent = available ? 'SCHEDULED EVENT' : 'LOCKED / NO EVENT';
  }
  if (!available && selectedMultiplayerMode === 'competitive-4v4') {
    setSelectedMultiplayerMode('4v4');
  }
  if (wasAvailable !== available && !available && partyLobby && signedInUser && partyLobby.hostId === signedInUser.id && partyLobby.status === 'open') {
    void updatePartyConfig();
  }
  return available;
}
let pendingFlightEntry = false;
let authSessionReady = false;
let authEmailAddress = '';
let authSetupToken = '';
const storedSettings = readStored('aerframe-settings', {});
const flightTuneDefaults = Object.freeze({
  rollP: 12,
  rollI: 1.2,
  rollD: 0.02,
  pitchP: 12,
  pitchI: 1.2,
  pitchD: 0.02,
  yawP: 8,
  yawI: 0.8,
  yawD: 0.01,
  weight: 650,
  wheelbase: 220,
  motorThrust: 563,
  propDiameter: 5,
  motorResponse: 80,
  airDrag: 0.34,
  propwash: 100,
});
const flightTune = flightTuneDefaults;
let currentPage = 'singleplayer';
let pageBeforeSettings = 'singleplayer';
let selectedMode = 'Race';
let flying = false;
function syncGateBadgeVisibility() {
  const visible = currentPage === 'builder' && !flying;
  world.traverse((object) => {
    if (object.userData.isBuilderGateBadge) {
      let gate = object.parent;
      while (gate && !gate.userData.isBuilderGate) gate = gate.parent;
      const openingIndex = object.userData.gateBadgeOpeningIndex ?? 0;
      const data = gate?.userData.gateData;
      const direction = data?.entryDirections?.[openingIndex] ?? data?.entryDirection ?? 1;
      object.visible = visible && direction !== 0;
    }
    if (object.userData.isBuilderGateBoundary) object.visible = visible;
    if (object.userData.isRelayPodiumGateIndicator) {
      object.visible = visible && object.userData.showInBuilder === true;
    }
  });
}
let hudEnabled = storedSettings.hudEnabled !== false;
let reticleEnabled = storedSettings.reticleEnabled !== false;
let firstPersonPropsEnabled = storedSettings.firstPersonPropsEnabled !== false;
let gameChatEnabled = storedSettings.gameChatEnabled !== false;
let vignetteEnabled = storedSettings.vignetteEnabled !== false;
let raceLineEnabled = storedSettings.raceLineEnabled !== false;
let quality = Number(storedSettings.quality) || 1.8;
let cameraAngle = THREE.MathUtils.clamp(Number(storedSettings.cameraAngle) || 45, 5, 60);
let thirdPersonFlightCamera = false;
let soundEnabled = storedSettings.soundEnabled === true;
let lobbyMusicEnabled = storedSettings.lobbyMusicEnabled !== false;
const storedAudioVolume = Number(storedSettings.audioVolume);
let audioVolume = Number.isFinite(storedAudioVolume) ? THREE.MathUtils.clamp(storedAudioVolume, 0, 1) : 1;
let audioContext = null;
let lobbyMusicRun = null;
let motorVoices = [];
let motorGain = null;
let motorLowpass = null;
let motorNoiseFilter = null;
let motorNoiseGain = null;
let motorNoiseSource = null;
let toastTimer = 0;
let builderGates = [];
let customGateObjects = [];
let builderProps = [];
let builderPropObjects = [];
let builderObjectClipboard = null;
let builderClipboardPasteCount = 0;
let builderPlacementHistory = [];
let builderTrackPicture = '';
let publishingBuilderTrack = false;
let selectedGateId = null;
let selectedGateOpeningIndex = null;
let selectedBuilderPropId = null;
let activeGateType = 'neon-square';
let gatePlacementArmed = false;
let activeBuilderAsset = { kind: 'gate', type: 'neon-square' };
let builderGhostAssetKey = '';

function builderPodiumCount() {
  return builderProps.filter((prop) => prop.type === 'podium').length;
}

function builderRelayPodiumGateCount() {
  return builderProps.filter((prop) => prop.type === 'relay-podium-gate').length;
}

function builderRelayStationsArePaired() {
  const routeGates = orderedBuilderGates();
  const availablePodiums = builderProps.filter((prop) => prop.type === 'relay-podium-gate').slice();
  if (routeGates.length !== RELAY_STATION_COUNT || availablePodiums.length !== RELAY_STATION_COUNT) return false;
  return routeGates.every((gate) => {
    let nearestIndex = -1;
    let nearestDistance = Infinity;
    availablePodiums.forEach((podium, index) => {
      const distance = Math.hypot(gate.x - podium.x, gate.z - podium.z);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    if (nearestDistance > RELAY_GATE_PODIUM_DISTANCE || nearestIndex < 0) return false;
    availablePodiums.splice(nearestIndex, 1);
    return true;
  });
}

function builderTrackMissingRequirements() {
  const missing = [];
  const routeSlots = builderGateRouteSlots();
  if (!routeSlots.some((slot) => slot.isStartFinish)) missing.push('a marked start / finish gate');
  const numberedGateCount = routeSlots.filter((slot) => !slot.isStartFinish && slot.routeOrder > 0).length;
  if (builderGameMode === 'relay-race') {
    if (numberedGateCount !== RELAY_STATION_COUNT - 1) missing.push('exactly 3 numbered gates for the four Relay stations');
    if (builderRelayPodiumGateCount() !== RELAY_STATION_COUNT) missing.push(`exactly 4 Relay podium gates (${builderRelayPodiumGateCount()}/4 placed)`);
    else if (!builderRelayStationsArePaired()) missing.push('each Relay podium gate within 8 m of a different route gate');
    if (builderPodiumCount()) missing.push('remove separate podiums and use Relay podium gates instead');
    return missing;
  }
  if (numberedGateCount < 1) missing.push('at least one numbered gate');
  const podiumCount = builderPodiumCount();
  if (podiumCount < REQUIRED_TRACK_PODIUM_COUNT) missing.push(`${REQUIRED_TRACK_PODIUM_COUNT} red podiums (${podiumCount}/${REQUIRED_TRACK_PODIUM_COUNT} placed)`);
  return missing;
}

function builderTrackIsViable() {
  return builderTrackMissingRequirements().length === 0;
}

function builderTrackRequirementsMessage() {
  const missing = builderTrackMissingRequirements();
  if (!missing.length) return '';
  const readableList = missing.length > 1 ? `${missing.slice(0, -1).join(', ')}, and ${missing[missing.length - 1]}` : missing[0];
  return `Track needs ${readableList}.`;
}

let partyPollTimer = 0;
let gameChatPollTimer = 0;
let partyPositionTimer = 0;
let partyPositionRequestPending = false;
let competitiveBannerPollTimer = 0;
let competitiveBannerCycleTimer = 0;
let teamPollTimer = 0;
let activeServerTrackSource = 'game';
let scheduledPartyRaceAt = 0;
let partyRaceFinished = false;
let partyRacePhase = 'lobby';
let partyRaceGridSlot = 0;
let partyRaceGoUntil = 0;
let partyCountdownLabel = '';
let partyCountdownNumber = '';
let crewCheckpointQueue = Promise.resolve();
let localRelayActivationKey = '';
let multiplayerTileCaptureKey = '';
let mainMenuChoiceTilesCaptured = false;
let friendsPollTimer = 0;
let friendsData = { friends: [], incomingRequests: [], outgoingRequests: [], onlineCount: 0 };
let currentTeam = null;

function recentPilotsStorageKey() {
  return signedInUser?.id ? `xspec-recent-pilots-${signedInUser.id}` : '';
}

function getRecentPilots() {
  const key = recentPilotsStorageKey();
  if (!key) return [];
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(saved)
      ? saved.filter((pilot) => pilot && typeof pilot.username === 'string' && pilot.username.trim())
        .slice(0, 8)
      : [];
  } catch {
    return [];
  }
}

function rememberRecentPartyPilots(lobby) {
  const key = recentPilotsStorageKey();
  if (!key || !Array.isArray(lobby?.members)) return;
  const recent = getRecentPilots();
  const previous = JSON.stringify(recent);
  const usernameKey = signedInUser?.username?.toLowerCase();
  const next = lobby.members
    .filter((member) => member.id !== signedInUser?.id && member.username?.toLowerCase() !== usernameKey)
    .map((member) => ({ username: member.username.trim() }))
    .filter((member) => member.username)
    .concat(recent)
    .filter((pilot, index, pilots) => pilots.findIndex((candidate) => candidate.username.toLowerCase() === pilot.username.toLowerCase()) === index)
    .slice(0, 8);
  if (JSON.stringify(next) === previous) return;
  try {
    localStorage.setItem(key, JSON.stringify(next));
    if (!document.querySelector('#friendsPanel').hidden) updateFriendsUI();
  } catch {
    // Recent pilot history is optional and remains available for this session.
  }
}

function syncWorldMode() {
  const menuScene = !flying && currentPage !== 'builder';
  const environmentOverview = menuScene && currentPage === 'trackPicker';
  const menuSetVisible = menuScene && !environmentOverview;
  const platformOnlyScene = flying || currentPage === 'builder' || currentPage === 'trackPicker';
  menuPlatformCollisionRoot.visible = flying;
  environmentRoot.visible = false;
  stars.visible = currentPage === 'trackPicker' || (!menuSetVisible && !platformOnlyScene);
  gateRoot.visible = !menuScene;
  trackRoot.visible = currentPage === 'trackPicker' || (!menuScene && currentPage !== 'builder');
  communityPropRoot.visible = currentPage === 'trackPicker' || (!menuScene && currentPage !== 'builder');
  builderPropRoot.visible = currentPage === 'builder';
  builderRaceLineRoot.visible = currentPage === 'builder' && !flying && builderRaceLineGenerated;
  flightRaceLineRoot.visible = flying && raceLineEnabled && flightRaceLineRoot.children.length > 0
    && (selectedMode === 'Race' || isMultiplayerRaceActive() || builderTestCourse);
  builderGhostRoot.visible = currentPage === 'builder' && !flying && gatePlacementArmed;
  biomeLightRoot.visible = false;
  menuBackdropRoot.visible = menuSetVisible || platformOnlyScene;
  menuStreetLampRoot.visible = !platformOnlyScene;
  menuCityRoot.visible = menuSetVisible;
  menuStageRoot.visible = menuSetVisible;
  menuAmbientRoot.visible = menuSetVisible || (platformOnlyScene && currentPage !== 'builder');
  menuInfoBannerRoot.visible = menuSetVisible;
  builderFlightRoot.visible = flying && currentPage === 'builder' && builderTestCourse;
  defaultGateObjects.forEach((gate) => { gate.visible = !menuScene && currentPage !== 'builder'; });
  customGateObjects.forEach((gate) => { gate.visible = currentPage === 'builder'; });
  showDrone.visible = menuSetVisible;
  partyDroneRoot.visible = flying ? Boolean(partyLobby && partyLobby.members.length > 1) : menuSetVisible;
  fieldSpot.visible = false;
  bloomPass.strength = menuScene ? 0.26 : 0.42;
  updateWorldLightBalance();
  updateGameChatUI();
  syncLobbyMusic();
}

function readStored(key, fallback) {
  try {
    const value = localStorage.getItem(key);
    return value ? { ...fallback, ...JSON.parse(value) } : fallback;
  } catch {
    return fallback;
  }
}

const savedInput = readStored('aerframe-input-settings', {});
const rateProfileVersion = 1;
const shouldMigrateRateProfile = !Number.isInteger(savedInput.rateProfileVersion) || savedInput.rateProfileVersion < rateProfileVersion;
const rateAxes = ['roll', 'pitch', 'yaw'];
const defaultRateProfiles = {
  betaflight: {
    roll: { rate: 0.95, superRate: 0.7, expo: 0 },
    pitch: { rate: 0.8, superRate: 0.7, expo: 0 },
    yaw: { rate: 0.37, superRate: 0.7, expo: 0 },
  },
  actual: {
    roll: { centerRate: 70, maxRate: 670, expo: 0.2 },
    pitch: { centerRate: 70, maxRate: 670, expo: 0.2 },
    yaw: { centerRate: 70, maxRate: 670, expo: 0.2 },
  },
};
const rateRanges = {
  betaflight: { rate: [0, 2.55], superRate: [0, 1], expo: [0, 1] },
  actual: { centerRate: [0, 500], maxRate: [0, 1500], expo: [0, 1] },
};
function loadRateProfile(mode) {
  return Object.fromEntries(rateAxes.map((axis) => {
    const defaults = defaultRateProfiles[mode][axis];
    const stored = savedInput.rates?.[mode]?.[axis] || {};
    const values = Object.fromEntries(Object.entries(defaults).map(([field, fallback]) => {
      const [min, max] = rateRanges[mode][field];
      const value = Number(stored[field]);
      return [field, Number.isFinite(value) ? THREE.MathUtils.clamp(value, min, max) : fallback];
    }));
    return [axis, values];
  }));
}
const inputConfig = {
  gamepadIndex: Number.isInteger(savedInput.gamepadIndex) ? savedInput.gamepadIndex : null,
  restartButton: Number.isInteger(savedInput.restartButton) && savedInput.restartButton >= 0 && savedInput.restartButton < 32 ? savedInput.restartButton : null,
  resetDroneButton: Number.isInteger(savedInput.resetDroneButton) && savedInput.resetDroneButton >= 0 && savedInput.resetDroneButton < 32 ? savedInput.resetDroneButton : null,
  axes: { yaw: 0, throttle: 1, roll: 2, pitch: 3, ...savedInput.axes },
  invert: { yaw: false, throttle: true, roll: true, pitch: true, ...savedInput.invert },
  centers: Array.isArray(savedInput.centers) ? savedInput.centers.slice(0, 8) : Array(8).fill(0),
  axisRanges: Array.from({ length: 8 }, (_, index) => {
    const range = savedInput.axisRanges?.[index];
    return range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.max - range.min >= 0.25
      ? { min: THREE.MathUtils.clamp(range.min, -1, 1), max: THREE.MathUtils.clamp(range.max, -1, 1) }
      : { min: -1, max: 1 };
  }),
  deadzone: Number.isFinite(savedInput.deadzone) ? savedInput.deadzone : 0.06,
  rateType: !shouldMigrateRateProfile && savedInput.rateType === 'actual' ? 'actual' : 'betaflight',
  rateProfileVersion,
  rates: { betaflight: loadRateProfile('betaflight'), actual: loadRateProfile('actual') },
};
if (shouldMigrateRateProfile) {
  inputConfig.rates.betaflight = Object.fromEntries(
    rateAxes.map((axis) => [axis, { ...defaultRateProfiles.betaflight[axis] }]),
  );
}
let visibleGamepads = [];
let gamepadSignature = '';
let lastGamepad = null;
let gamepadInput = null;
let calibration = null;
const transmitterAxisRoles = ['throttle', 'yaw', 'pitch', 'roll'];
const transmitterCalibrationAxisTargetRange = 1.9;
const transmitterCalibrationCenterSampleCount = 30;
let currentInputSource = '';
let restartButtonCaptureUntil = 0;
let resetDroneButtonCaptureUntil = 0;
let previousGamepadButtons = [];
let previousGamepadIndex = null;
let restartPadButtonWasDown = false;
let resetDronePadButtonWasDown = false;

function saveInputSettings() {
  try { localStorage.setItem('aerframe-input-settings', JSON.stringify(inputConfig)); }
  catch { /* Storage is optional. */ }
}

if (shouldMigrateRateProfile) saveInputSettings();

function syncRaceRestartControls(message = '') {
  const restartButton = document.querySelector('#bindRaceRestartButton');
  const resetDroneButton = document.querySelector('#bindResetDroneButton');
  const status = document.querySelector('#restartBindingStatus');
  if (restartButton) {
    restartButton.textContent = restartButtonCaptureUntil
      ? 'PRESS A CONTROLLER BUTTON'
      : inputConfig.restartButton === null ? 'BIND CONTROLLER BUTTON' : `REBIND BUTTON ${inputConfig.restartButton + 1}`;
    restartButton.setAttribute('aria-pressed', String(Boolean(restartButtonCaptureUntil)));
  }
  if (resetDroneButton) {
    resetDroneButton.textContent = resetDroneButtonCaptureUntil
      ? 'PRESS A CONTROLLER BUTTON'
      : inputConfig.resetDroneButton === null ? 'BIND CONTROLLER BUTTON' : `REBIND BUTTON ${inputConfig.resetDroneButton + 1}`;
    resetDroneButton.setAttribute('aria-pressed', String(Boolean(resetDroneButtonCaptureUntil)));
  }
  if (status) {
    const raceBinding = inputConfig.restartButton === null ? 'BUTTON NOT BOUND' : `BUTTON ${inputConfig.restartButton + 1}`;
    const droneBinding = inputConfig.resetDroneButton === null ? 'BUTTON NOT BOUND' : `BUTTON ${inputConfig.resetDroneButton + 1}`;
    status.textContent = message || `R RESTARTS A SOLO RACE / RESTART RACE: ${raceBinding} / RESET DRONE: ${droneBinding}`;
  }
}

function setSettingsTab(name) {
  settingsTabs.forEach((button) => {
    const active = button.dataset.settingsTab === name;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-selected', String(active));
  });
  settingsPanels.forEach((panel) => {
    const active = panel.dataset.settingsContent === name;
    panel.hidden = !active;
    panel.classList.toggle('is-active', active);
  });
}

settingsTabs.forEach((button) => button.addEventListener('click', () => setSettingsTab(button.dataset.settingsTab)));

document.querySelector('#toggleStickSetup').addEventListener('click', (event) => {
  const button = event.currentTarget;
  const panel = document.querySelector('#stickSetupPanel');
  const expanded = button.getAttribute('aria-expanded') !== 'true';
  button.setAttribute('aria-expanded', String(expanded));
  panel.hidden = !expanded;
  button.querySelector('b').textContent = expanded ? '−' : '+';
});

function syncAxisMapOptions(pad) {
  if (!pad?.axes.length) return;
  const labels = ['Axis 1 · Left X', 'Axis 2 · Left Y', 'Axis 3 · Right X', 'Axis 4 · Right Y'];
  let changed = false;
  document.querySelectorAll('[data-axis-map]').forEach((select) => {
    const role = select.dataset.axisMap;
    let selectedAxis = Number(inputConfig.axes[role]);
    if (!Number.isInteger(selectedAxis) || selectedAxis < 0 || selectedAxis >= pad.axes.length) {
      const defaults = { yaw: 0, throttle: 1, roll: 2, pitch: 3 };
      selectedAxis = Math.min(defaults[role] ?? 0, pad.axes.length - 1);
      inputConfig.axes[role] = selectedAxis;
      changed = true;
    }
    select.replaceChildren(...Array.from({ length: pad.axes.length }, (_, index) => (
      new Option(labels[index] || `Axis ${index + 1}`, String(index))
    )));
    select.value = String(selectedAxis);
  });
  if (changed) saveInputSettings();
}

function syncInputControls() {
  document.querySelectorAll('[data-axis-map]').forEach((select) => {
    select.value = String(inputConfig.axes[select.dataset.axisMap]);
  });
  document.querySelectorAll('[data-axis-invert]').forEach((checkbox) => {
    checkbox.checked = Boolean(inputConfig.invert[checkbox.dataset.axisInvert]);
  });
  syncRaceRestartControls();
}

syncInputControls();
refreshGamepadList();

document.querySelector('#scanGamepads').addEventListener('click', () => {
  const pad = refreshGamepadList(true);
  if (!pad) showToast('Connect the controller, then press a button or move a stick once.');
});
document.querySelector('#gamepadSelect').addEventListener('change', (event) => {
  inputConfig.gamepadIndex = event.currentTarget.value === '' ? null : Number(event.currentTarget.value);
  saveInputSettings();
  refreshGamepadList();
  refreshInputSource();
});
function beginControllerButtonCapture(action) {
  const pad = visibleGamepads.find((candidate) => candidate.index === inputConfig.gamepadIndex);
  if (!pad) {
    showToast('Connect and select a controller before binding a race control.');
    return false;
  }
  restartButtonCaptureUntil = action === 'restart' ? performance.now() + 12_000 : 0;
  resetDroneButtonCaptureUntil = action === 'resetDrone' ? performance.now() + 12_000 : 0;
  previousGamepadButtons = pad.buttons.map((button) => Boolean(button.pressed));
  syncRaceRestartControls('PRESS A BUTTON ON THE SELECTED CONTROLLER WITHIN 12 SECONDS.');
  return true;
}
document.querySelector('#bindRaceRestartButton').addEventListener('click', () => beginControllerButtonCapture('restart'));
document.querySelector('#bindResetDroneButton').addEventListener('click', () => beginControllerButtonCapture('resetDrone'));
window.addEventListener('gamepadconnected', (event) => {
  if (inputConfig.gamepadIndex === null) inputConfig.gamepadIndex = event.gamepad.index;
  refreshGamepadList(true);
  saveInputSettings();
  refreshInputSource();
});
window.addEventListener('gamepaddisconnected', (event) => {
  if (inputConfig.gamepadIndex === event.gamepad.index) inputConfig.gamepadIndex = null;
  refreshGamepadList();
  refreshInputSource();
});

document.querySelectorAll('[data-axis-map]').forEach((select) => select.addEventListener('change', (event) => {
  inputConfig.axes[event.currentTarget.dataset.axisMap] = Number(event.currentTarget.value);
  saveInputSettings();
}));
document.querySelectorAll('[data-axis-invert]').forEach((checkbox) => checkbox.addEventListener('change', (event) => {
  inputConfig.invert[event.currentTarget.dataset.axisInvert] = event.currentTarget.checked;
  saveInputSettings();
}));
document.querySelector('#rateTypeSelect').addEventListener('change', (event) => {
  inputConfig.rateType = event.currentTarget.value === 'actual' ? 'actual' : 'betaflight';
  syncRateControls();
  saveInputSettings();
});
document.querySelectorAll('[data-rate-input]').forEach((input) => input.addEventListener('input', (event) => {
  const control = event.currentTarget;
  const card = control.closest('[data-rate-axis]');
  const mode = inputConfig.rateType;
  const controlName = control.dataset.rateInput;
  const controlDefinition = rateControlFields[mode][controlName];
  const rawValue = control.valueAsNumber;
  if (!Number.isFinite(rawValue)) return;
  const field = controlDefinition.field;
  const axisSettings = inputConfig.rates[mode][card.dataset.rateAxis];
  axisSettings[field] = THREE.MathUtils.clamp(rawValue, controlDefinition.min, controlDefinition.max);
  if (mode === 'actual' && field === 'centerRate') axisSettings.maxRate = Math.max(axisSettings.maxRate, axisSettings.centerRate);
  if (mode === 'actual' && field === 'maxRate') axisSettings.centerRate = Math.min(axisSettings.centerRate, axisSettings.maxRate);
  syncRateControls();
  saveInputSettings();
}));
document.querySelector('#resetRates').addEventListener('click', () => {
  const mode = inputConfig.rateType;
  inputConfig.rates[mode] = Object.fromEntries(rateAxes.map((axis) => [axis, { ...defaultRateProfiles[mode][axis] }]));
  syncRateControls();
  saveInputSettings();
  showToast(`${mode === 'actual' ? 'Actual' : 'Betaflight'} rates reset to the default profile.`);
});
document.querySelector('#calibrateSticks').addEventListener('click', () => {
  if (!lastGamepad) {
    showToast('Connect and select a gamepad before setting up its axes and buttons.');
    return;
  }
  restartButtonCaptureUntil = 0;
  resetDroneButtonCaptureUntil = 0;
  calibration = {
    stage: 'center',
    gamepadIndex: lastGamepad.index,
    frames: 0,
    centerSamples: [],
    neutralCenters: [],
    minimums: Array(lastGamepad.axes.length).fill(Infinity),
    maximums: Array(lastGamepad.axes.length).fill(-Infinity),
    roleIndex: 0,
    axisCandidate: null,
    buttonTarget: 'restart',
    awaitButtonRelease: true,
    message: '',
    original: {
      axes: { ...inputConfig.axes },
      invert: { ...inputConfig.invert },
      centers: [...inputConfig.centers],
      axisRanges: inputConfig.axisRanges.map((range) => ({ ...range })),
      restartButton: inputConfig.restartButton,
      resetDroneButton: inputConfig.resetDroneButton,
    },
  };
  syncTransmitterCalibrationDialog();
  document.querySelector('#transmitterCalibrationDialog').showModal();
});

function startTransmitterAxisScan() {
  if (!calibration) return;
  calibration.stage = 'axis-scan';
  calibration.frames = 0;
  calibration.axisCandidate = null;
  calibration.minimums.fill(Infinity);
  calibration.maximums.fill(-Infinity);
  calibration.message = '';
  syncTransmitterCalibrationDialog();
}

function mapDetectedTransmitterAxis() {
  if (!calibration) return;
  if (!calibration.axisCandidate) {
    startTransmitterAxisScan();
    return;
  }
  const role = transmitterAxisRoles[calibration.roleIndex];
  const { index, min, max } = calibration.axisCandidate;
  inputConfig.axes[role] = index;
  inputConfig.centers[index] = calibration.neutralCenters[index] ?? 0;
  inputConfig.axisRanges[index] = { min, max };
  if (role === 'throttle') {
    const lowThrottle = inputConfig.centers[index];
    inputConfig.invert.throttle = Math.abs(lowThrottle - max) < Math.abs(lowThrottle - min);
  }
  syncInputControls();
  calibration.roleIndex += 1;
  if (calibration.roleIndex < transmitterAxisRoles.length) {
    startTransmitterAxisScan();
    return;
  }
  calibration.stage = 'button';
  calibration.buttonTarget = 'restart';
  calibration.awaitButtonRelease = true;
  calibration.message = '';
  syncTransmitterCalibrationDialog();
}

function syncTransmitterCalibrationDialog() {
  if (!calibration) return;
  const step = document.querySelector('#transmitterCalibrationStep');
  const title = document.querySelector('#transmitterCalibrationTitle');
  const instructions = document.querySelector('#transmitterCalibrationInstructions');
  const progress = document.querySelector('#transmitterCalibrationProgress');
  const status = document.querySelector('#transmitterCalibrationStatus');
  const action = document.querySelector('#calibrationAction');
  let stepNumber = 1;
  if (calibration.stage === 'axis-scan' || calibration.stage === 'axis-result') stepNumber = calibration.roleIndex + 2;
  else if (calibration.stage === 'button') stepNumber = calibration.buttonTarget === 'restart' ? 6 : 7;
  step.textContent = 'STEP ' + stepNumber + ' OF 7';
  const scanningRange = calibration.axisCandidate?.range || 0;
  progress.max = calibration.stage === 'center' ? transmitterCalibrationCenterSampleCount : transmitterCalibrationAxisTargetRange;
  progress.value = calibration.stage === 'center'
    ? Math.min(calibration.centerSamples.length, progress.max)
    : calibration.stage === 'axis-scan' ? Math.min(scanningRange, progress.max)
      : calibration.stage === 'axis-result' ? progress.max : 0;

  if (calibration.stage === 'center') {
    title.textContent = 'Center controls';
    instructions.textContent = 'Center sticks. Throttle at minimum.';
    status.textContent = 'Click Ready when set.';
    action.disabled = false;
    action.textContent = 'READY';
    return;
  }

  if (calibration.stage === 'axis-scan' || calibration.stage === 'axis-result') {
    const role = transmitterAxisRoles[calibration.roleIndex];
    const label = role.toUpperCase();
    const prompts = {
      throttle: 'Sweep throttle from minimum to maximum and back. Keep sticks centered.',
      yaw: 'Sweep yaw fully left and right. Keep other controls centered.',
      pitch: 'Sweep pitch fully forward and back. Keep other controls centered.',
      roll: 'Sweep roll fully left and right. Keep other controls centered.',
    };
    title.textContent = 'Map ' + label;
    instructions.textContent = prompts[role];
    if (calibration.stage === 'axis-scan') {
      const progressPercent = Math.min(200, Math.round(scanningRange / transmitterCalibrationAxisTargetRange * 200));
      status.textContent = 'Travel: ' + progressPercent + '% / 200%.';
      action.disabled = scanningRange < 0.55;
      action.textContent = action.disabled ? 'MOVE TO 200%' : 'USE AXIS';
      return;
    }
    if (calibration.axisCandidate) {
      status.textContent = 'Axis ' + (calibration.axisCandidate.index + 1) + ' detected.';
      action.disabled = false;
      action.textContent = 'USE AXIS ' + (calibration.axisCandidate.index + 1);
    } else {
      status.textContent = 'No axis detected. Try again.';
      action.disabled = false;
      action.textContent = 'RETRY';
    }
    return;
  }

  title.textContent = calibration.buttonTarget === 'restart' ? 'Bind race restart' : 'Bind drone reset';
  instructions.textContent = 'Release all buttons, then press one to bind.';
  status.textContent = calibration.message || 'Release all buttons.';
  action.disabled = true;
  action.textContent = 'PRESS BUTTON';
}

function cancelTransmitterCalibration(message = '') {
  if (calibration?.original) {
    inputConfig.axes = { ...calibration.original.axes };
    inputConfig.invert = { ...calibration.original.invert };
    inputConfig.centers = [...calibration.original.centers];
    inputConfig.axisRanges = calibration.original.axisRanges.map((range) => ({ ...range }));
    inputConfig.restartButton = calibration.original.restartButton;
    inputConfig.resetDroneButton = calibration.original.resetDroneButton;
    saveInputSettings();
    syncInputControls();
  }
  calibration = null;
  const dialog = document.querySelector('#transmitterCalibrationDialog');
  if (dialog.open) dialog.close();
  if (message) showToast(message);
}

function finishCalibration() {
  if (!calibration) return;
  calibration = null;
  saveInputSettings();
  syncInputControls();
  const dialog = document.querySelector('#transmitterCalibrationDialog');
  if (dialog.open) dialog.close();
  showToast('Transmitter setup saved. Throttle, yaw, pitch, roll, and buttons are ready.');
}

document.querySelector('#calibrationCancel').addEventListener('click', cancelTransmitterCalibration);
document.querySelector('#transmitterCalibrationDialog').addEventListener('cancel', (event) => {
  event.preventDefault();
  cancelTransmitterCalibration();
});
document.querySelector('#calibrationAction').addEventListener('click', () => {
  if (calibration?.stage === 'center') {
    const samples = calibration.centerSamples;
    const fallbackAxes = lastGamepad?.axes || [];
    calibration.neutralCenters = Array.from({ length: fallbackAxes.length }, (_, index) => {
      if (!samples.length) return Number(fallbackAxes[index]) || 0;
      return samples.reduce((sum, sample) => sum + (Number(sample[index]) || 0), 0) / samples.length;
    });
    calibration.roleIndex = 0;
    startTransmitterAxisScan();
  } else if (calibration?.stage === 'axis-scan' && calibration.axisCandidate?.range >= 0.55) {
    calibration.stage = 'axis-result';
    mapDetectedTransmitterAxis();
  } else if (calibration?.stage === 'axis-result') mapDetectedTransmitterAxis();
});

function shapeStick(value) {
  const sign = Math.sign(value);
  const magnitude = Math.abs(THREE.MathUtils.clamp(value, -1, 1));
  if (magnitude <= inputConfig.deadzone) return 0;
  const normalized = (magnitude - inputConfig.deadzone) / (1 - inputConfig.deadzone);
  return normalized * sign;
}

const rateControlFields = {
  betaflight: {
    primary: { field: 'rate', label: 'RC RATE', min: 0, max: 2.55, step: 0.05 },
    secondary: { field: 'superRate', label: 'SUPER RATE', min: 0, max: 1, step: 0.05 },
    expo: { field: 'expo', label: 'EXPO', min: 0, max: 1, step: 0.05 },
    help: 'Classic Betaflight RC rate, super rate and expo. Default style for keyboard, gamepad and transmitter input.',
  },
  actual: {
    primary: { field: 'centerRate', label: 'CENTER °/S', min: 0, max: 500, step: 5 },
    secondary: { field: 'maxRate', label: 'MAX °/S', min: 0, max: 1500, step: 10 },
    expo: { field: 'expo', label: 'EXPO', min: 0, max: 1, step: 0.05 },
    help: 'Set center sensitivity and maximum rotation in degrees per second for all input devices.',
  },
};

function rateToDegrees(axis, input) {
  const command = THREE.MathUtils.clamp(Number(input) || 0, -1, 1);
  const magnitude = Math.abs(command);
  if (magnitude === 0) return 0;
  const settings = inputConfig.rates[inputConfig.rateType][axis];
  let degreesPerSecond;
  if (inputConfig.rateType === 'actual') {
    const expo = settings.expo;
    const centerSensitivity = settings.centerRate;
    const stickMovement = Math.max(0, settings.maxRate - centerSensitivity);
    const expoCurve = magnitude * (magnitude ** 5 * expo + magnitude * (1 - expo));
    degreesPerSecond = command * centerSensitivity + Math.sign(command) * stickMovement * expoCurve;
  } else {
    const expo = settings.expo;
    const curvedCommand = command * (magnitude ** 3 * expo + 1 - expo);
    let rcRate = settings.rate;
    if (rcRate > 2) rcRate += 14.54 * (rcRate - 2);
    const superFactor = 1 / THREE.MathUtils.clamp(1 - magnitude * settings.superRate, 0.01, 1);
    degreesPerSecond = 200 * rcRate * curvedCommand * superFactor;
  }
  return THREE.MathUtils.clamp(degreesPerSecond, -1998, 1998);
}

const ratePreviewColors = { roll: '#68dff7', pitch: '#86e7b2', yaw: '#ffbd72' };

function renderRatePreview() {
  const canvas = document.querySelector('#ratePreviewCanvas');
  if (!canvas) return;
  const width = canvas.clientWidth;
  if (!width) return;
  const height = canvas.clientHeight || 190;
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * pixelRatio);
  canvas.height = Math.round(height * pixelRatio);
  const context = canvas.getContext('2d');
  if (!context) {
    console.error('Unable to render the rates preview because its canvas context is unavailable.');
    return;
  }
  context.scale(pixelRatio, pixelRatio);
  context.clearRect(0, 0, width, height);
  context.fillStyle = 'rgba(4, 14, 28, .72)';
  context.fillRect(0, 0, width, height);

  const plot = { left: 39, right: width - 12, top: 18, bottom: height - 18 };
  const plotWidth = plot.right - plot.left;
  const plotHeight = plot.bottom - plot.top;
  const maxVelocity = Math.max(...rateAxes.map((axis) => Math.abs(rateToDegrees(axis, 1))), 100);
  const scale = Math.ceil(maxVelocity / 100) * 100;
  const scaleLabel = document.querySelector('#ratePreviewScale');
  if (scaleLabel) scaleLabel.textContent = `±${scale} DEG/S`;

  context.font = '9px monospace';
  context.textAlign = 'right';
  context.textBaseline = 'middle';
  for (let tick = -2; tick <= 2; tick += 1) {
    const y = plot.top + ((2 - tick) / 4) * plotHeight;
    context.beginPath();
    context.strokeStyle = tick === 0 ? 'rgba(179, 215, 232, .4)' : 'rgba(146, 190, 210, .12)';
    context.lineWidth = tick === 0 ? 1.2 : 1;
    context.moveTo(plot.left, y);
    context.lineTo(plot.right, y);
    context.stroke();
    context.fillStyle = 'rgba(190, 216, 230, .65)';
    context.fillText(String(Math.round(scale * tick / 2)), plot.left - 7, y);
  }
  for (let tick = -2; tick <= 2; tick += 1) {
    const x = plot.left + ((tick + 2) / 4) * plotWidth;
    context.beginPath();
    context.strokeStyle = tick === 0 ? 'rgba(179, 215, 232, .4)' : 'rgba(146, 190, 210, .12)';
    context.lineWidth = tick === 0 ? 1.2 : 1;
    context.moveTo(x, plot.top);
    context.lineTo(x, plot.bottom);
    context.stroke();
    context.fillStyle = 'rgba(190, 216, 230, .55)';
    context.textAlign = tick === -2 ? 'left' : tick === 2 ? 'right' : 'center';
    context.textBaseline = 'top';
    context.fillText(`${tick * 50}%`, x, plot.bottom + 5);
  }

  for (const axis of rateAxes) {
    context.beginPath();
    context.strokeStyle = ratePreviewColors[axis];
    context.lineWidth = 2;
    context.lineJoin = 'round';
    for (let sample = 0; sample <= 100; sample += 1) {
      const command = sample / 50 - 1;
      const velocity = rateToDegrees(axis, command);
      const x = plot.left + (sample / 100) * plotWidth;
      const y = plot.top + ((scale - velocity) / (2 * scale)) * plotHeight;
      if (sample === 0) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
}

function syncRateControls() {
  const mode = inputConfig.rateType;
  const definition = rateControlFields[mode];
  const modeSelect = document.querySelector('#rateTypeSelect');
  modeSelect.value = mode;
  document.querySelector('#rateModeHelp').textContent = definition.help;
  document.querySelectorAll('[data-rate-column]').forEach((column) => {
    column.textContent = definition[column.dataset.rateColumn].label;
  });
  document.querySelectorAll('.rate-table-row[data-rate-axis]').forEach((row) => {
    const axis = row.dataset.rateAxis;
    for (const controlName of ['primary', 'secondary', 'expo']) {
      const controlDefinition = definition[controlName];
      const field = controlDefinition.field;
      const value = inputConfig.rates[mode][axis][field];
      const input = row.querySelector(`[data-rate-input="${controlName}"]`);
      const label = row.querySelector(`[data-rate-label="${controlName}"]`);
      input.min = String(controlDefinition.min);
      input.max = String(controlDefinition.max);
      input.step = String(controlDefinition.step);
      input.value = String(value);
      if (label) label.textContent = `${axis} ${controlDefinition.label.toLowerCase()}`;
    }
    if (mode === 'actual') {
      row.querySelector('[data-rate-input="primary"]').max = String(inputConfig.rates.actual[axis].maxRate);
      row.querySelector('[data-rate-input="secondary"]').min = String(inputConfig.rates.actual[axis].centerRate);
    }
    const maxRate = rateToDegrees(axis, 1);
    row.querySelector(`[data-rate-summary="${axis}"]`).textContent = String(Math.round(maxRate));
  });
  renderRatePreview();
}
syncRateControls();
function syncFlightTuneControls() {
  document.querySelectorAll('[data-flight-tune]').forEach((input) => {
    const field = input.dataset.flightTune;
    const value = flightTune[field];
    input.value = String(value);
    input.readOnly = true;
    input.setAttribute('aria-readonly', 'true');
  });
  document.querySelectorAll('[data-flight-pid]').forEach((input) => {
    input.value = String(flightTune[input.dataset.flightPid]);
    input.readOnly = true;
    input.setAttribute('aria-readonly', 'true');
  });
  const resetButton = document.querySelector('#resetFlightTune');
  resetButton.disabled = true;
  resetButton.title = 'The standard flight tune is locked for every pilot.';
}
syncFlightTuneControls();
window.addEventListener('resize', renderRatePreview);
if ('ResizeObserver' in window) {
  new ResizeObserver(renderRatePreview).observe(document.querySelector('#ratePreviewCanvas'));
}

function normalizedGamepadAxis(raw, index) {
  const center = Number(inputConfig.centers[index]) || 0;
  const difference = raw - center;
  const calibratedRange = inputConfig.axisRanges[index] || { min: -1, max: 1 };
  const range = difference < 0 ? center - calibratedRange.min : calibratedRange.max - center;
  return THREE.MathUtils.clamp(difference / Math.max(range, 0.15), -1, 1);
}

function normalizedThrottleAxis(raw, index) {
  const range = inputConfig.axisRanges[index] || { min: -1, max: 1 };
  const value = THREE.MathUtils.clamp((raw - range.min) / Math.max(range.max - range.min, 0.15), 0, 1);
  return inputConfig.invert.throttle ? 1 - value : value;
}

function readGamepadList() {
  try { return [...(navigator.getGamepads?.() || [])].filter(Boolean); }
  catch { return []; }
}

function refreshGamepadList(notify = false) {
  visibleGamepads = readGamepadList();
  const signature = visibleGamepads.map((pad) => `${pad.index}:${pad.id}:${pad.axes.length}`).join('|');
  const changed = signature !== gamepadSignature;
  gamepadSignature = signature;
  if (!visibleGamepads.some((pad) => pad.index === inputConfig.gamepadIndex)) {
    inputConfig.gamepadIndex = visibleGamepads[0]?.index ?? null;
  }

  if (changed) {
    const select = document.querySelector('#gamepadSelect');
    select.replaceChildren();
    if (!visibleGamepads.length) {
      const option = new Option('No controller detected', '');
      select.add(option);
    } else {
      for (const pad of visibleGamepads) {
        const option = new Option(`${pad.id || `Controller ${pad.index + 1}`} · ${pad.axes.length} axes`, String(pad.index));
        select.add(option);
      }
    }
    saveInputSettings();
  }

  const select = document.querySelector('#gamepadSelect');
  select.value = inputConfig.gamepadIndex === null ? '' : String(inputConfig.gamepadIndex);
  const activePad = visibleGamepads.find((pad) => pad.index === inputConfig.gamepadIndex) || null;
  lastGamepad = activePad;
  syncAxisMapOptions(activePad);
  const led = document.querySelector('#gamepadLed');
  const status = document.querySelector('#gamepadStatus');
  const detail = document.querySelector('#gamepadDetail');
  led.classList.toggle('is-connected', Boolean(activePad));
  status.textContent = activePad ? 'CONNECTED' : 'SEARCHING';
  detail.textContent = activePad
    ? `${activePad.id || 'Controller'} · ${activePad.axes.length} axes · ${activePad.buttons.length} buttons`
    : 'Connect a controller, then move a stick or press a button.';
  if (notify && activePad) showToast(`${activePad.id || 'Controller'} connected. Check the stick map below.`);
  return activePad;
}

function pollRestartGamepadButtons(pad) {
  if (restartButtonCaptureUntil && performance.now() >= restartButtonCaptureUntil) {
    restartButtonCaptureUntil = 0;
    syncRaceRestartControls('RACE RESTART BINDING TIMED OUT. R IS ALWAYS AVAILABLE.');
  }
  if (resetDroneButtonCaptureUntil && performance.now() >= resetDroneButtonCaptureUntil) {
    resetDroneButtonCaptureUntil = 0;
    syncRaceRestartControls('RESET DRONE BINDING TIMED OUT.');
  }
  if (!pad) {
    previousGamepadButtons = [];
    previousGamepadIndex = null;
    restartPadButtonWasDown = false;
    resetDronePadButtonWasDown = false;
    return;
  }
  if (previousGamepadIndex !== pad.index) {
    previousGamepadButtons = [];
    previousGamepadIndex = pad.index;
    restartPadButtonWasDown = false;
    resetDronePadButtonWasDown = false;
  }

  const buttonStates = pad.buttons.map((button) => Boolean(button.pressed));
  if (calibration) {
    if (calibration.stage === 'button') {
      if (calibration.awaitButtonRelease) {
        if (!buttonStates.some(Boolean)) {
          calibration.awaitButtonRelease = false;
          calibration.message = 'Press a button.';
          syncTransmitterCalibrationDialog();
        }
      } else {
        const pressedIndex = buttonStates.findIndex((pressed, index) => pressed && !previousGamepadButtons[index]);
        if (pressedIndex >= 0) {
          if (calibration.buttonTarget === 'resetDrone' && inputConfig.restartButton === pressedIndex) {
            calibration.message = 'Already used. Press another.';
            syncTransmitterCalibrationDialog();
          } else if (calibration.buttonTarget === 'restart') {
            inputConfig.restartButton = pressedIndex;
            if (inputConfig.resetDroneButton === pressedIndex) inputConfig.resetDroneButton = null;
            calibration.buttonTarget = 'resetDrone';
            calibration.awaitButtonRelease = true;
            calibration.message = 'Restart: button ' + (pressedIndex + 1) + '. Release to continue.';
            syncTransmitterCalibrationDialog();
          } else {
            inputConfig.resetDroneButton = pressedIndex;
            finishCalibration();
          }
        }
      }
    }
    restartPadButtonWasDown = inputConfig.restartButton !== null && Boolean(buttonStates[inputConfig.restartButton]);
    resetDronePadButtonWasDown = inputConfig.resetDroneButton !== null && Boolean(buttonStates[inputConfig.resetDroneButton]);
    previousGamepadButtons = buttonStates;
    return;
  }

  let justBound = false;
  if (restartButtonCaptureUntil || resetDroneButtonCaptureUntil) {
    const pressedIndex = buttonStates.findIndex((pressed, index) => pressed && !previousGamepadButtons[index]);
    if (pressedIndex >= 0) {
      if (restartButtonCaptureUntil) {
        inputConfig.restartButton = pressedIndex;
        if (inputConfig.resetDroneButton === pressedIndex) inputConfig.resetDroneButton = null;
        restartButtonCaptureUntil = 0;
        restartPadButtonWasDown = true;
        syncRaceRestartControls(`CONTROLLER BUTTON ${pressedIndex + 1} BOUND TO RESTART RACE.`);
      } else {
        inputConfig.resetDroneButton = pressedIndex;
        if (inputConfig.restartButton === pressedIndex) inputConfig.restartButton = null;
        resetDroneButtonCaptureUntil = 0;
        resetDronePadButtonWasDown = true;
        syncRaceRestartControls(`CONTROLLER BUTTON ${pressedIndex + 1} BOUND TO RESET DRONE.`);
      }
      justBound = true;
      saveInputSettings();
    }
  }

  const restartButtonDown = inputConfig.restartButton !== null && Boolean(buttonStates[inputConfig.restartButton]);
  const resetDroneButtonDown = inputConfig.resetDroneButton !== null && Boolean(buttonStates[inputConfig.resetDroneButton]);
  if (!justBound && restartButtonDown && !restartPadButtonWasDown) restartLocalRace('controller');
  if (!justBound && resetDroneButtonDown && !resetDronePadButtonWasDown) resetDrone();
  restartPadButtonWasDown = restartButtonDown;
  resetDronePadButtonWasDown = resetDroneButtonDown;
  previousGamepadButtons = buttonStates;
}

function refreshInputSource() {
  const source = lastGamepad ? 'GAMEPAD / TRANSMITTER' : 'KEYBOARD';
  if (source === currentInputSource) return;
  currentInputSource = source;
  document.querySelector('#inputSourceLabel').textContent = `ACTIVE INPUT / ${source}`;
  document.querySelector('#flightInputLabel').textContent = source;
  document.querySelector('#statusText').textContent = flying ? `FLIGHT // ${source}` : 'READY';
}

function sampleGamepad() {
  const pads = readGamepadList();
  if (inputConfig.gamepadIndex === null && pads.length) {
    inputConfig.gamepadIndex = pads[0].index;
    refreshGamepadList(true);
    saveInputSettings();
  }
  let pad = pads.find((candidate) => candidate.index === inputConfig.gamepadIndex) || null;
  if (!pad && pads.length) {
    pad = pads[0];
    inputConfig.gamepadIndex = pad.index;
    refreshGamepadList();
    saveInputSettings();
  }
  if ((pad?.index ?? null) !== (lastGamepad?.index ?? null)) {
    refreshGamepadList();
  }
  lastGamepad = pad;
  gamepadInput = null;
  pollRestartGamepadButtons(pad);
  if (!pad) {
    if (calibration) cancelTransmitterCalibration('Controller disconnected. Reconnect it and start setup again.');
    return;
  }

  if (calibration) {
    if (pad.index !== calibration.gamepadIndex) {
      cancelTransmitterCalibration('The active controller changed. Start transmitter setup again.');
    } else if (calibration.stage === 'center') {
      calibration.centerSamples.push(Array.from(pad.axes, (value) => Number(value) || 0));
      if (calibration.centerSamples.length > transmitterCalibrationCenterSampleCount) calibration.centerSamples.shift();
      syncTransmitterCalibrationDialog();
    } else if (calibration.stage === 'axis-scan') {
      for (let index = 0; index < Math.min(pad.axes.length, calibration.minimums.length); index += 1) {
        const value = Number(pad.axes[index]) || 0;
        calibration.minimums[index] = Math.min(calibration.minimums[index], value);
        calibration.maximums[index] = Math.max(calibration.maximums[index], value);
      }
      calibration.frames += 1;
      const usedAxes = new Set(transmitterAxisRoles.slice(0, calibration.roleIndex)
        .map((role) => Number(inputConfig.axes[role])));
      let best = null;
      for (let index = 0; index < calibration.minimums.length; index += 1) {
        if (usedAxes.has(index)) continue;
        const min = calibration.minimums[index];
        const max = calibration.maximums[index];
        const range = max - min;
        if (!Number.isFinite(range) || range < 0.55) continue;
        if (!best || range > best.range) best = { index, min, max, range };
      }
      calibration.axisCandidate = best;
      if (best && best.range >= transmitterCalibrationAxisTargetRange) mapDetectedTransmitterAxis();
      else syncTransmitterCalibrationDialog();
    }
  }

  const centered = {};
  const live = {};
  for (const role of ['yaw', 'pitch', 'roll']) {
    const axisIndex = Number(inputConfig.axes[role]);
    const raw = Number(pad.axes[axisIndex]) || 0;
    const value = shapeStick(normalizedGamepadAxis(raw, axisIndex)) * (inputConfig.invert[role] ? -1 : 1);
    centered[role] = value;
    live[role] = value;
  }
  const throttleAxis = Number(inputConfig.axes.throttle);
  const throttleRaw = Number(pad.axes[throttleAxis]) || 0;
  live.throttle = normalizedThrottleAxis(throttleRaw, throttleAxis);
  gamepadInput = { ...centered, throttle: live.throttle, source: 'GAMEPAD / TRANSMITTER' };

  for (const role of ['yaw', 'pitch', 'roll']) {
    const meter = document.querySelector(`[data-axis-meter="${role}"]`);
    if (meter) meter.style.transform = `translateX(${Math.round(live[role] * 20)}px)`;
  }
  const throttleMeter = document.querySelector('[data-axis-meter="throttle"]');
  if (throttleMeter) throttleMeter.style.transform = `translateX(${Math.round((live.throttle - 0.5) * 40)}px)`;
}

function readKeyboardInput() {
  return {
    pitch: Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown')),
    roll: Number(keys.has('KeyA')) - Number(keys.has('KeyD')),
    yaw: Number(keys.has('KeyE')) - Number(keys.has('KeyQ')),
    throttleDelta: Number(keys.has('Space')) - Number(keys.has('KeyC')),
    source: 'KEYBOARD',
  };
}

function keyboardOverrideActive(input) {
  return input.pitch !== 0 || input.roll !== 0 || input.yaw !== 0 || input.throttleDelta !== 0;
}

function getFlightInput() {
  const keyboard = readKeyboardInput();
  const chosen = keyboardOverrideActive(keyboard) ? keyboard : gamepadInput || keyboard;
  if (chosen.source !== currentInputSource) {
    currentInputSource = chosen.source;
    document.querySelector('#inputSourceLabel').textContent = `ACTIVE INPUT / ${chosen.source}`;
    document.querySelector('#flightInputLabel').textContent = chosen.source;
    document.querySelector('#statusText').textContent = flying ? `FLIGHT // ${chosen.source}` : 'READY';
  }
  return chosen;
}

function saveSettings() {
  try {
    localStorage.setItem('aerframe-settings', JSON.stringify({
      fov: camera.fov,
      cameraAngle,
      quality,
      hudEnabled,
      reticleEnabled,
      firstPersonPropsEnabled,
      gameChatEnabled,
      vignetteEnabled,
      raceLineEnabled,
      droneNeonColor,
      droneBodyColor,
      dronePropColor,
      droneCountryFlagCode,
      droneSkin: droneSkinId,
      soundEnabled,
      lobbyMusicEnabled,
      audioVolume,
    }));
  } catch { /* Private browsing can disable local storage. */ }
}

function showToast(message) {
  if (flying) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 2500);
}

function hideToast() {
  window.clearTimeout(toastTimer);
  toast.classList.remove('is-visible');
}

function setAuthMessage(message = '', isError = false) {
  const node = document.querySelector('#authMessage');
  node.textContent = message;
  node.classList.toggle('is-error', isError);
}

function updateAccountUI() {
  const accountButton = document.querySelector('#accountButton');
  const pilotXp = Math.max(0, Math.floor(Number(signedInUser?.xp) || 0));
  const firstPlaces = Math.max(0, Math.floor(Number(signedInUser?.firstPlaces) || 0));
  const pilotLevel = signedInUser ? Math.floor(pilotXp / 100) + 1 : 0;
  const rankEmblem = document.querySelector('#pilotRankEmblem');
  const rank = pilotLevel >= 20 ? 'elite' : pilotLevel >= 10 ? 'ace' : pilotLevel >= 5 ? 'wing' : pilotLevel > 0 ? 'cadet' : 'unranked';
  document.querySelector('#pilotXp').textContent = pilotXp.toLocaleString();
  document.querySelector('#pilotLevel').textContent = String(pilotLevel);
  document.querySelector('#pilotFirstPlaces').textContent = firstPlaces.toLocaleString();
  document.querySelector('#pilotRankMark').textContent = String(pilotLevel);
  rankEmblem.className = `pilot-rank-emblem rank-${rank}`;
  rankEmblem.setAttribute('aria-label', `${rank.toUpperCase()} pilot rank, level ${pilotLevel}`);
  rankEmblem.title = `${rank.toUpperCase()} PILOT RANK`;
  const badgeName = document.querySelector('#pilotBadgeName');
  const badgeInitial = document.querySelector('#pilotBadgeInitial');
  if (signedInUser?.email) {
    const emailName = signedInUser.email.split('@')[0];
    const pilotName = signedInUser.username || emailName;
    accountButton.textContent = pilotName.length > 13 ? `${pilotName.slice(0, 11)}…` : pilotName.toUpperCase();
    accountButton.title = 'Pilot account settings';
    accountButton.setAttribute('aria-label', 'Open pilot account settings');
    badgeName.textContent = pilotName.toUpperCase();
    badgeInitial.textContent = (pilotName[0] || 'P').toUpperCase();
    document.querySelector('#authSignedInName').textContent = `PILOT / ${pilotName}`;
    document.querySelector('#authSignedInEmail').textContent = signedInUser.email;
  } else {
    accountButton.textContent = 'JOIN FREE';
    accountButton.title = 'Play as a guest, or create a free account to save your pilot profile and join online teams.';
    accountButton.setAttribute('aria-label', 'Sign in or create a free pilot account');
    badgeName.textContent = 'GUEST PILOT';
    badgeInitial.textContent = '•';
  }
  updateGameChatUI();
}

async function authRequest(endpoint, payload) {
  let response;
  try {
    response = await fetch(`/api/auth/${endpoint}`, {
      method: payload ? 'POST' : 'GET',
      headers: payload ? { 'Content-Type': 'application/json' } : undefined,
      body: payload ? JSON.stringify(payload) : undefined,
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('Account service is unavailable. Start the app with npm run dev and configure email delivery.');
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Account service is unavailable. Start the app with npm run dev and configure email delivery.');
  }
  let result = {};
  try { result = await response.json(); } catch { /* A JSON error body is optional. */ }
  if (!response.ok) throw new Error(result.error || 'Could not complete account request. Please try again.');
  return result;
}

function setLobbyMessage(message = '', isError = false) {
  const node = document.querySelector('#lobbyMessage');
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('is-error', isError);
}

async function lobbyRequest(endpoint, payload = {}) {
  let response;
  try {
    response = await fetch(`/api/lobby/${endpoint}`, {
      method: payload === null ? 'GET' : 'POST',
      headers: payload === null ? undefined : { 'Content-Type': 'application/json' },
      body: payload === null ? undefined : JSON.stringify(payload),
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('Flight party service is unavailable. Start the app with npm run dev.');
  }
  let result = {};
  try { result = await response.json(); } catch { /* The service may return an empty body. */ }
  if (!response.ok) throw new Error(result.error || 'Could not update the flight party.');
  return result;
}

async function syncPartyFlightPositions() {
  if (!flying || !partyLobby || !signedInUser?.id || partyLobby.members.length < 2 || partyPositionRequestPending) {
    if (!partyLobby || partyLobby.members.length < 2) partyFlightSnapshots.clear();
    return;
  }
  partyPositionRequestPending = true;
  const lobbyCode = partyLobby.code;
  const userId = signedInUser.id;
  try {
    const result = await lobbyRequest('positions', {
      position: flight.position.toArray(),
      velocity: flight.velocity.toArray(),
      orientation: flight.orientation.toArray(),
    });
    if (!flying || partyLobby?.code !== lobbyCode || signedInUser?.id !== userId) return;
    if (Number.isFinite(result.serverTime)) partyServerClockOffsetMs = result.serverTime - Date.now();
    partyFlightSnapshots.clear();
    for (const state of result.states || []) {
      if (!Array.isArray(state.position) || !Array.isArray(state.velocity) || !Array.isArray(state.orientation)) continue;
      partyFlightSnapshots.set(state.id, {
        position: new THREE.Vector3().fromArray(state.position),
        velocity: new THREE.Vector3().fromArray(state.velocity),
        orientation: new THREE.Quaternion().fromArray(state.orientation).normalize(),
        raceTimeMs: Number.isFinite(state.raceTimeMs) ? Math.max(0, state.raceTimeMs) : null,
        receivedAt: performance.now(),
      });
    }
  } catch {
    // Flight remains responsive if the position service briefly drops an update.
  } finally {
    partyPositionRequestPending = false;
  }
}

function updatePartyDroneFlightVisuals(dt = 0.016) {
  const active = Boolean(flying && partyLobby && partyLobby.members.length > 1);
  const remoteMembers = active ? partyLobby.members.filter((member) => member.id !== signedInUser?.id) : [];
  let visibleCount = 0;
  livePartyDroneObjects.forEach((drone, index) => {
    const member = remoteMembers[index];
    const state = member ? partyFlightSnapshots.get(member.id) : null;
    const stateAge = state ? performance.now() - state.receivedAt : Infinity;
    drone.visible = Boolean(state && stateAge <= 750);
    if (!drone.visible) {
      drone.userData.livePilotId = null;
      return;
    }
    visibleCount += 1;
    const firstFrame = drone.userData.livePilotId !== member.id;
    drone.userData.livePilotId = member.id;
    flightPilotPosition.copy(state.position).addScaledVector(state.velocity, Math.min(0.18, Math.max(0, stateAge / 1000)));
    const blend = firstFrame ? 1 : 1 - Math.exp(-dt * 18);
    drone.position.lerp(flightPilotPosition, blend);
    drone.quaternion.slerp(state.orientation, blend);
  });
  if (flying) partyDroneRoot.visible = visibleCount > 0;
  else if (!active) livePartyDroneObjects.forEach((drone) => { drone.visible = false; });
}

function renderGameChatMessages() {
  const host = document.querySelector('#gameChatMessages');
  if (!host) return;
  host.replaceChildren();
  const messages = gameChatCache[gameChatChannel] || [];
  if (!messages.length) {
    const empty = document.createElement('p');
    empty.className = 'game-chat-empty';
    empty.textContent = 'NO MESSAGES YET';
    host.append(empty);
  }
  for (const message of messages) {
    const row = document.createElement('article');
    row.className = `game-chat-message${message.userId === signedInUser?.id ? ' is-local' : ''}`;
    const heading = document.createElement('div');
    heading.className = 'game-chat-message-heading';
    const name = document.createElement('strong');
    name.textContent = message.username || 'PILOT';
    const time = document.createElement('time');
    const timestamp = Number(message.createdAt);
    if (Number.isFinite(timestamp)) {
      time.dateTime = new Date(timestamp).toISOString();
      time.textContent = new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    heading.append(name, time);
    const text = document.createElement('p');
    text.textContent = message.text || '';
    row.append(heading, text);
    host.append(row);
  }
  host.scrollTop = host.scrollHeight;
}

function setGameChatStatus(message = '', isError = false) {
  gameChatStatusMessage = message;
  gameChatStatusIsError = isError;
  const status = document.querySelector('#gameChatStatus');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('is-error', isError);
}

function isGameChatSurfaceVisible() {
  return flying || (!flying && currentPage === 'singleplayer');
}

function updateGameChatUI() {
  const panel = document.querySelector('#gameChat');
  if (!panel) return;
  panel.hidden = true;
  const nextUserId = signedInUser?.id || null;
  if (gameChatUserId !== nextUserId) {
    gameChatUserId = nextUserId;
    gameChatCache = { lobby: [], world: [] };
    setGameChatStatus('');
    renderGameChatMessages();
  }
  const nextLobbyCode = partyLobby?.code || '';
  if (gameChatLobbyCode !== nextLobbyCode) {
    gameChatLobbyCode = nextLobbyCode;
    gameChatCache.lobby = [];
    setGameChatStatus('');
    renderGameChatMessages();
  }
  if (!partyLobby && gameChatChannel === 'lobby') {
    gameChatChannel = 'world';
    setGameChatStatus('');
    renderGameChatMessages();
  }

  panel.hidden = !gameChatEnabled || !isGameChatSurfaceVisible();
  const lobbyTab = document.querySelector('#gameChatLobbyTab');
  const worldTab = document.querySelector('#gameChatWorldTab');
  const title = document.querySelector('#gameChatChannelTitle');
  const input = document.querySelector('#gameChatInput');
  const send = document.querySelector('#gameChatSend');
  const canSend = Boolean(signedInUser && (gameChatChannel === 'world' || partyLobby));
  lobbyTab.disabled = !partyLobby;
  lobbyTab.setAttribute('aria-pressed', String(gameChatChannel === 'lobby'));
  worldTab.setAttribute('aria-pressed', String(gameChatChannel === 'world'));
  title.textContent = `${gameChatChannel.toUpperCase()} CHAT`;
  input.disabled = !canSend || gameChatSending;
  input.placeholder = !signedInUser ? 'Sign in to chat…' : gameChatChannel === 'lobby' && !partyLobby ? 'Join a lobby to chat…' : 'Message pilots…';
  send.disabled = !canSend || gameChatSending;
  if (!signedInUser) setGameChatStatus('Sign in to send and read chat messages.');
  else if (gameChatChannel === 'lobby' && !partyLobby) setGameChatStatus('Join a lobby to use lobby chat.');
  else setGameChatStatus(gameChatStatusMessage, gameChatStatusIsError);
}

function setGameChatChannel(channel) {
  if (!['lobby', 'world'].includes(channel) || (channel === 'lobby' && !partyLobby)) return;
  if (channel === gameChatChannel) return;
  gameChatChannel = channel;
  setGameChatStatus('');
  renderGameChatMessages();
  updateGameChatUI();
  void refreshGameChat();
}

async function refreshGameChat() {
  if (!gameChatEnabled || !isGameChatSurfaceVisible() || !signedInUser?.id || gameChatRequestPending) return;
  const channel = gameChatChannel;
  const userId = signedInUser.id;
  const lobbyCode = partyLobby?.code || '';
  if (channel === 'lobby' && !lobbyCode) return;
  gameChatRequestPending = true;
  try {
    const result = await lobbyRequest(`chat?channel=${channel}`, null);
    if (gameChatChannel !== channel || signedInUser?.id !== userId || (channel === 'lobby' && partyLobby?.code !== lobbyCode)) return;
    gameChatCache[channel] = Array.isArray(result.messages) ? result.messages.slice(-80) : [];
    setGameChatStatus('');
    renderGameChatMessages();
    updateGameChatUI();
  } catch (error) {
    if (gameChatChannel === channel && signedInUser?.id === userId) setGameChatStatus(error.message, true);
  } finally {
    gameChatRequestPending = false;
  }
}

document.querySelector('#gameChatLobbyTab').addEventListener('click', () => setGameChatChannel('lobby'));
document.querySelector('#gameChatWorldTab').addEventListener('click', () => setGameChatChannel('world'));
document.querySelector('#gameChatForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const input = document.querySelector('#gameChatInput');
  const text = input.value.trim();
  if (!text || !signedInUser?.id || (gameChatChannel === 'lobby' && !partyLobby) || gameChatSending) return;
  gameChatSending = true;
  updateGameChatUI();
  try {
    const result = await lobbyRequest('chat', { channel: gameChatChannel, text });
    gameChatCache[gameChatChannel] = [...(gameChatCache[gameChatChannel] || []), result.message].slice(-80);
    input.value = '';
    setGameChatStatus('');
    renderGameChatMessages();
  } catch (error) {
    setGameChatStatus(error.message, true);
  } finally {
    gameChatSending = false;
    updateGameChatUI();
    input.focus();
  }
});

async function friendsRequest(endpoint = '', payload = null) {
  let response;
  try {
    response = await fetch(`/api/friends${endpoint ? `/${endpoint}` : ''}`, {
      method: payload === null ? 'GET' : 'POST',
      headers: payload === null ? undefined : { 'Content-Type': 'application/json' },
      body: payload === null ? undefined : JSON.stringify(payload),
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('Friends service is unavailable. Start the app with npm run dev.');
  }
  let result = {};
  try { result = await response.json(); } catch { /* The service may return an empty body. */ }
  if (!response.ok) throw new Error(result.error || 'Could not update your friends.');
  return result;
}

async function teamsRequest(endpoint = '', payload = null) {
  let response;
  try {
    response = await fetch(`/api/teams${endpoint ? `/${endpoint}` : ''}`, {
      method: payload === null ? 'GET' : 'POST',
      headers: payload === null ? undefined : { 'Content-Type': 'application/json' },
      body: payload === null ? undefined : JSON.stringify(payload),
      credentials: 'same-origin',
    });
  } catch {
    throw new Error('Team service is unavailable. Start the app with npm run dev.');
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Team service is unavailable. Restart the app with npm run dev.');
  }
  let result = {};
  try { result = await response.json(); } catch { /* The service may return an empty body. */ }
  if (!response.ok) throw new Error(result.error || 'Could not update your team.');
  return result;
}

function setFriendsMessage(message = '', isError = false) {
  const node = document.querySelector('#friendsMessage');
  node.textContent = message;
  node.classList.toggle('is-error', isError);
}

function addFriendsEmpty(list, message) {
  const empty = document.createElement('div');
  empty.className = 'friends-empty';
  empty.textContent = message;
  list.append(empty);
}

function makeFriendsRow(pilot, { online = false, actions = [], statusLabel = '' } = {}) {
  const row = document.createElement('div');
  row.className = `friends-row${online ? '' : ' is-offline'}`;
  const avatar = document.createElement('span');
  avatar.className = 'friends-avatar';
  avatar.textContent = (pilot.username?.[0] || '?').toUpperCase();
  const presence = document.createElement('i');
  presence.setAttribute('aria-label', online ? 'Online' : 'Offline');
  avatar.append(presence);

  const copy = document.createElement('span');
  copy.className = 'friends-row-copy';
  const username = document.createElement('strong');
  username.textContent = pilot.username || 'Pilot';
  const status = document.createElement('small');
  status.textContent = statusLabel || (online ? 'ONLINE NOW' : 'OFFLINE');
  copy.append(username, status);

  row.append(avatar, copy);
  if (actions.length) {
    const actionWrap = document.createElement('span');
    actionWrap.className = actions.length > 1 ? 'friends-row-actions' : '';
    actions.forEach(({ label, endpoint, payload, className = '', onClick }) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `friends-row-action ${className}`.trim();
      button.textContent = label;
      button.addEventListener('click', () => {
        if (onClick) onClick(button);
        else void runFriendsAction(endpoint, payload, button);
      });
      actionWrap.append(button);
    });
    row.append(actionWrap);
  }
  return row;
}

function makeFriendRequestRow(request, direction) {
  return makeFriendsRow(request, {
    online: false,
    actions: direction === 'incoming'
      ? [
        { label: 'ACCEPT', endpoint: 'accept', payload: { requestId: request.requestId }, className: 'is-accept' },
        { label: 'IGNORE', endpoint: 'decline', payload: { requestId: request.requestId } },
      ]
      : [{ label: 'CANCEL', endpoint: 'cancel', payload: { requestId: request.requestId } }],
  });
}

function updateFriendsUI(data = friendsData) {
  friendsData = data || { friends: [], incomingRequests: [], outgoingRequests: [], partyInvites: [], onlineCount: 0 };
  const onlineCount = Number(friendsData.onlineCount) || 0;
  document.querySelector('#onlineFriendCount').textContent = String(onlineCount);
  document.querySelector('#panelOnlineFriendCount').textContent = String(onlineCount);
  document.querySelector('#friendsOnlineSectionCount').textContent = String(onlineCount);
  document.querySelector('#friendsButton').setAttribute('aria-label', `Friends: ${onlineCount} online`);

  const onlineFriends = (friendsData.friends || []).filter((friend) => friend.online);
  const offlineFriends = (friendsData.friends || []).filter((friend) => !friend.online);
  const incomingRequests = friendsData.incomingRequests || [];
  const outgoingRequests = friendsData.outgoingRequests || [];
  const partyInvites = friendsData.partyInvites || [];
  const onlineList = document.querySelector('#onlineFriendList');
  const offlineList = document.querySelector('#offlineFriendList');
  const requestList = document.querySelector('#friendRequestList');
  const outgoingList = document.querySelector('#outgoingFriendList');
  const recentList = document.querySelector('#recentPilotsList');
  const recentPilots = getRecentPilots().filter((pilot) => pilot.username.toLowerCase() !== signedInUser?.username?.toLowerCase());
  const friendNames = new Set((friendsData.friends || []).map((friend) => friend.username.toLowerCase()));
  const pendingNames = new Set(outgoingRequests.map((request) => request.username.toLowerCase()));
  onlineList.replaceChildren();
  offlineList.replaceChildren();
  requestList.replaceChildren();
  outgoingList.replaceChildren();
  recentList.replaceChildren();
  document.querySelector('#partyInviteList').replaceChildren();
  if (onlineFriends.length) onlineFriends.forEach((friend) => onlineList.append(makeFriendsRow(friend, { online: true, actions: [
    { label: 'INVITE', className: 'is-accept', onClick: (button) => { void sendPartyInvite(friend, button); } },
    { label: 'REMOVE', endpoint: 'remove', payload: { friendId: friend.id } },
  ] })));
  else addFriendsEmpty(onlineList, signedInUser ? 'No friends online right now.' : 'Sign in to see your friends online.');
  const nonFriendRecentPilots = recentPilots.filter((pilot) => !friendNames.has(pilot.username.toLowerCase()));
  if (nonFriendRecentPilots.length) {
    nonFriendRecentPilots.forEach((pilot) => {
      const actions = pendingNames.has(pilot.username.toLowerCase())
        ? []
        : [{ label: 'ADD', endpoint: 'request', payload: { username: pilot.username }, className: 'is-accept' }];
      recentList.append(makeFriendsRow(pilot, { statusLabel: 'RECENT PILOT', actions }));
    });
  } else addFriendsEmpty(recentList, 'Pilots you share a party with will appear here.');
  const inviteList = document.querySelector('#partyInviteList');
  inviteList.replaceChildren();
  if (partyInvites.length) {
    partyInvites.forEach((invite) => {
      inviteList.append(makeFriendsRow({ username: invite.inviter, statusLabel: `${invite.lobbyName} / ${invite.gameMode}` }, {
        actions: [
          { label: 'ACCEPT', className: 'is-accept', onClick: (button) => { void respondToPartyInvite(invite.inviteId, true, button); } },
          { label: 'DECLINE', onClick: (button) => { void respondToPartyInvite(invite.inviteId, false, button); } },
        ],
      }));
    });
  } else addFriendsEmpty(inviteList, 'No game invites right now.');
  document.querySelector('#partyInviteSectionCount').textContent = String(partyInvites.length);
  if (offlineFriends.length) offlineFriends.forEach((friend) => offlineList.append(makeFriendsRow(friend, { actions: [
    { label: 'INVITE', className: 'is-accept', onClick: (button) => { void sendPartyInvite(friend, button); } },
    { label: 'REMOVE', endpoint: 'remove', payload: { friendId: friend.id } },
  ] })));
  else addFriendsEmpty(offlineList, signedInUser ? 'No offline friends.' : 'Your friends list will appear here.');
  if (incomingRequests.length) incomingRequests.forEach((request) => requestList.append(makeFriendRequestRow(request, 'incoming')));
  else addFriendsEmpty(requestList, 'No new requests.');
  outgoingRequests.forEach((request) => outgoingList.append(makeFriendRequestRow(request, 'outgoing')));
  document.querySelector('#friendsOfflineSectionCount').textContent = String(offlineFriends.length);
  document.querySelector('#recentPilotsSectionCount').textContent = String(nonFriendRecentPilots.length);
  document.querySelector('#friendsRequestSectionCount').textContent = String(incomingRequests.length);
  document.querySelector('.friends-pending-section').hidden = !signedInUser || outgoingRequests.length === 0;
  document.querySelector('#friendAddForm').hidden = !signedInUser;
  document.querySelector('#friendsSignInNotice').hidden = Boolean(signedInUser);
}

async function refreshFriends() {
  if (!signedInUser?.id) {
    updateFriendsUI({ friends: [], incomingRequests: [], outgoingRequests: [], onlineCount: 0 });
    return;
  }
  try {
    updateFriendsUI(await friendsRequest());
  } catch (error) {
    if (document.querySelector('#friendsPanel').hidden) return;
    setFriendsMessage(error.message, true);
  }
}

function startFriendsPolling() {
  window.clearInterval(friendsPollTimer);
  void refreshFriends();
  friendsPollTimer = window.setInterval(refreshFriends, 12_000);
}

function stopFriendsPolling() {
  window.clearInterval(friendsPollTimer);
  friendsPollTimer = 0;
  updateFriendsUI({ friends: [], incomingRequests: [], outgoingRequests: [], partyInvites: [], onlineCount: 0 });
}

async function runFriendsAction(endpoint, payload, button = null) {
  if (!signedInUser) { openAuthModal('signin'); return; }
  if (button) button.disabled = true;
  setFriendsMessage('Updating friends…');
  try {
    const result = await friendsRequest(endpoint, payload);
    updateFriendsUI(result);
    setFriendsMessage(result.message || 'Friends updated.');
  } catch (error) {
    setFriendsMessage(error.message, true);
  } finally {
    if (button) button.disabled = false;
  }
}

async function sendPartyInvite(friend, button) {
  if (!signedInUser) { openAuthModal('signin'); return; }
  button.disabled = true;
  setFriendsMessage(`Inviting ${friend.username}…`);
  try {
    const result = await lobbyRequest('invite', { friendId: friend.id });
    setFriendsMessage(result.message || `Party invitation sent to ${friend.username}.`);
    await refreshFriends();
  } catch (error) {
    setFriendsMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function respondToPartyInvite(inviteId, accept, button) {
  if (!signedInUser) { openAuthModal('signin'); return; }
  button.disabled = true;
  setFriendsMessage(accept ? 'Joining party…' : 'Declining invitation…');
  try {
    const result = await lobbyRequest(accept ? 'invite/accept' : 'invite/decline', { inviteId });
    if (accept) {
      updatePartyLobby(result.lobby);
      closeFriendsPanel();
      enterPartyWaitingFlight();
    } else {
      await refreshFriends();
      setFriendsMessage(result.message || 'Party invitation declined.');
    }
  } catch (error) {
    setFriendsMessage(error.message, true);
    await refreshFriends();
  } finally {
    button.disabled = false;
  }
}

const friendsButton = document.querySelector('#friendsButton');
const friendsPanel = document.querySelector('#friendsPanel');
function closeFriendsPanel() {
  friendsPanel.hidden = true;
  friendsButton.setAttribute('aria-expanded', 'false');
}
function openFriendsPanel() {
  friendsPanel.hidden = false;
  friendsButton.setAttribute('aria-expanded', 'true');
  setFriendsMessage('');
  if (signedInUser) void refreshFriends();
  else document.querySelector('#friendsSignInButton').focus();
}
friendsButton.addEventListener('click', () => {
  if (friendsPanel.hidden) openFriendsPanel();
  else closeFriendsPanel();
});
document.querySelector('#friendsClose').addEventListener('click', closeFriendsPanel);
document.querySelector('#friendsSignInButton').addEventListener('click', () => openAuthModal('signin'));
document.addEventListener('pointerdown', (event) => {
  if (!friendsPanel.hidden && !friendsPanel.contains(event.target) && !friendsButton.contains(event.target)) closeFriendsPanel();
});
document.querySelector('#friendAddForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!signedInUser) { openAuthModal('signin'); return; }
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  const username = document.querySelector('#friendUsername').value.trim();
  submit.disabled = true;
  setFriendsMessage('Sending request…');
  try {
    const result = await friendsRequest('request', { username });
    updateFriendsUI(result);
    form.reset();
    setFriendsMessage(result.message || 'Friend request sent.');
  } catch (error) {
    setFriendsMessage(error.message, true);
  } finally {
    submit.disabled = false;
  }
});

function buildPartySlot(member, index) {
  const isEmpty = !member;
  const slot = document.createElement(isEmpty ? 'button' : 'div');
  slot.className = `party-slot${isEmpty ? ' is-empty' : ''}`;
  if (isEmpty) {
    slot.type = 'button';
    slot.setAttribute('aria-label', 'Invite a pilot to your party');
    slot.addEventListener('click', () => {
      setPage('multiplayer');
      window.setTimeout(() => document.querySelector('#joinLobbyCode').focus(), 0);
    });
  }

  const icon = document.createElement('span');
  icon.className = 'party-slot-icon';
  icon.textContent = isEmpty ? '+' : member.username.slice(0, 1).toUpperCase();
  const copy = document.createElement('span');
  copy.className = 'party-slot-copy';
  const name = document.createElement('strong');
  name.textContent = isEmpty ? 'OPEN PILOT SLOT' : member.username;
  const detail = document.createElement('small');
  detail.textContent = isEmpty ? 'INVITE A FRIEND' : member.isHost ? 'PARTY LEADER' : 'FLIGHT CREW';
  if (!isEmpty) {
    const statusLabel = member.isLocal ? 'you' : member.finishedAt ? (member.didNotFinish ? 'did not finish' : 'finished') : member.online === false ? 'away' : member.ready ? 'loaded' : 'loading';
    slot.setAttribute('aria-label', `${member.username}, ${statusLabel}${member.isHost ? ', party host' : ''}`);
  }
  copy.append(name, detail);
  const status = document.createElement('span');
  status.className = 'party-slot-status';
  status.textContent = isEmpty ? '＋' : member.finishedAt ? (member.didNotFinish ? 'DNF' : 'DONE') : member.online === false ? 'AWAY' : member.ready ? 'READY' : 'LOADING';
  slot.append(icon, copy, status);
  return slot;
}

function updateMenuPodiumLabels(lobby = partyLobby) {
  const localMember = lobby?.members?.find((member) => member.id === signedInUser?.id);
  const localPilotName = localMember?.username || signedInUser?.username || '';
  const crew = (lobby?.members || []).filter((member) => member.id !== signedInUser?.id);
  const podiumNames = [localPilotName, ...crew.map((member) => member.username || '')];
  menuPodiumLabels.forEach((podium, index) => {
    const label = String(podiumNames[index] || '').trim();
    if (podium.label !== label) {
      drawMenuPodiumLabel(podium.canvas, label);
      podium.texture.needsUpdate = true;
      podium.label = label;
    }
    setRacePodiumUsername(menuStageRoot.children[index], label);
  });
}

function menuDroneFacingCameraYaw(drone) {
  return Math.atan2(camera.position.x - drone.position.x, camera.position.z - drone.position.z);
}

function updatePartyDroneStage(lobby = partyLobby) {
  updateMenuPodiumLabels(lobby);
  const members = lobby?.members || [];
  const others = members.filter((member) => member.id !== signedInUser?.id).slice(0, partyDroneObjects.length);
  const [pilotX, pilotZ] = menuDronePadPositions[0];
  showDrone.position.set(pilotX, menuDroneBaseY, pilotZ);
  showDrone.userData.pilotName = lobby?.members?.find((member) => member.id === signedInUser?.id)?.username || signedInUser?.username || '';
  partyDroneObjects.forEach((drone, index) => {
    const member = others[index];
    drone.visible = Boolean(member) && !flying && currentPage !== 'builder' && currentPage !== 'trackPicker';
    const inviteButton = document.querySelector(`[data-podium-slot="${index + 1}"]`);
    if (inviteButton) inviteButton.hidden = Boolean(member);
    if (!member) return;
    drone.userData.pilotName = member.username;
    const [x, z] = menuDronePadPositions[index + 1];
    drone.position.set(x, menuDroneBaseY, z);
    drone.rotation.y = menuDroneFacingCameraYaw(drone);
  });
  if (!flying) livePartyDroneObjects.forEach((drone) => { drone.visible = false; });
  partyDroneRoot.visible = flying
    ? Boolean(lobby && lobby.members.length > 1)
    : currentPage !== 'builder' && currentPage !== 'trackPicker';
  if (flying) updatePartyDroneFlightVisuals();
}

function updatePodiumInvitePositions() {
  if (flying || currentPage !== 'singleplayer' || !mount.clientWidth || !mount.clientHeight) return;
  camera.updateMatrixWorld();
  partyDroneObjects.forEach((drone, index) => {
    const button = document.querySelector(`[data-podium-slot="${index + 1}"]`);
    if (!button) return;
    const [x, z] = menuDronePadPositions[index + 1];
    const screenPoint = new THREE.Vector3(x, menuDroneBaseY + 2.45, z).project(camera);
    const visible = screenPoint.z > -1 && screenPoint.z < 1 && screenPoint.x > -0.96 && screenPoint.x < 0.96 && screenPoint.y > -0.9 && screenPoint.y < 0.94;
    button.style.left = `${((screenPoint.x + 1) * 0.5) * mount.clientWidth}px`;
    button.style.top = `${((1 - screenPoint.y) * 0.5) * mount.clientHeight}px`;
    button.hidden = drone.visible || !visible;
  });
}

function hasOtherPartyMembers(lobby = partyLobby) {
  return Boolean(lobby && lobby.members.length > 1);
}

function syncMenuChoiceAvailability() {
  const crewInLobby = hasOtherPartyMembers();
  document.querySelectorAll('[data-menu-choice]').forEach((button) => {
    const locked = crewInLobby && button.dataset.menuChoice !== 'multiplayer';
    button.disabled = locked;
    button.setAttribute('aria-disabled', String(locked));
    if (locked) button.title = 'Only Multiplayer is available while other pilots are in your lobby.';
    else button.removeAttribute('title');
  });
}

function minimumOnlineRacePlayers(lobby) {
  return lobby?.gameMode === 'relay-race' ? 8 : 2;
}

function updatePartyUI(lobby = partyLobby) {
  partyLobby = lobby || null;
  syncMenuChoiceAvailability();
  updateFlightMainMenuButton();
  rememberRecentPartyPilots(partyLobby);
  if (!partyLobby || partyLobby.status !== 'open' || !partyLobby.results?.length) {
    lastSettledRaceProgressKey = '';
  } else {
    const resultKey = `${partyLobby.code}:${partyLobby.results.map((result) => `${result.username}:${result.timeMs}:${Number(result.didNotFinish)}`).join('|')}`;
    if (signedInUser && resultKey !== lastSettledRaceProgressKey) {
      lastSettledRaceProgressKey = resultKey;
      void authRequest('me').then((result) => {
        if (result.user?.id !== signedInUser?.id) return;
        signedInUser = result.user;
        updateAccountUI();
      }).catch((error) => console.warn('Pilot progression could not be refreshed after the crew race.', error));
    }
  }
  if (partyLobby?.gameMode && multiplayerModes[partyLobby.gameMode]) {
    setSelectedMultiplayerMode(partyLobby.gameMode);
  }
  const members = partyLobby
    ? partyLobby.members.map((member) => ({ ...member, isLocal: member.id === signedInUser?.id }))
    : [{ id: signedInUser?.id || 'guest', username: signedInUser?.username || signedInUser?.email?.split('@')[0] || 'GUEST PILOT', isHost: true, isLocal: true, online: true }];
  const controlPanel = document.querySelector('#partyControlPanel');
  controlPanel.hidden = !partyLobby;
  const capacity = Math.max(2, Math.min(8, Number(partyLobby?.maxPlayers) || 8));
  document.querySelector('#partyCount').textContent = `${members.length} / ${capacity}`;
  const state = document.querySelector('#partyState');
  const stateLabel = !partyLobby ? (signedInUser ? 'SOLO' : 'GUEST')
    : partyLobby.status === 'starting' ? 'STARTING GRID'
      : partyLobby.status === 'grid' ? 'ON THE GRID'
        : partyLobby.status === 'racing' ? 'RACING'
          : partyLobby.isPublic ? 'LOADING PILOTS' : 'PRIVATE LOBBY';
  state.querySelector('span').textContent = stateLabel;
  if (flying && partyRacePhase === 'waiting' && partyLobby) {
    const loadedCount = partyLobby.members.filter((member) => member.ready).length;
    const minimumPlayers = minimumOnlineRacePlayers(partyLobby);
    document.querySelector('#flightPrompt').textContent = partyLobby.status === 'starting'
      ? `RACE GRID IN ${Math.max(1, Math.ceil((partyLobby.startAt - Date.now()) / 1000))}`
      : `FREE FLIGHT / ${loadedCount} OF ${members.length} READY / MIN ${minimumPlayers}`;
  }
  const roster = document.querySelector('#serverLobbyRoster');
  if (roster) {
    roster.replaceChildren();
    for (let index = 0; index < capacity; index += 1) roster.append(buildPartySlot(members[index] || null, index));
  }
  const codeRow = document.querySelector('#partyCodeRow');
  codeRow.hidden = !partyLobby;
  document.querySelector('#partyInviteCode').textContent = partyLobby?.code || '';
  const settingsInvite = document.querySelector('#settingsPartyInvite');
  settingsInvite.hidden = !partyLobby?.code;
  document.querySelector('#settingsPartyInviteCode').textContent = partyLobby?.code || '';
  document.querySelector('#partyLeaveButton').hidden = !partyLobby;
  setLobbyConnectionStatus(partyLobby ? 'CONNECTED' : 'READY');
  const result = partyLobby?.results?.[0];
  if (result && !flying) setLobbyMessage(result.didNotFinish ? 'Last crew race ended without a finisher.' : `${result.username} won the last crew race in ${(result.timeMs / 1000).toFixed(2)}s.`);
  updatePartyDroneStage(partyLobby);
  syncRelayFlightState();
  updateRaceStartOverlay();
  updateRaceLeaderboard();
  updateRelayRaceTiming();
  updateGameChatUI();
  syncLobbyMusic();
}

function localRelayTeam() {
  const member = partyLobby?.members.find((candidate) => candidate.id === signedInUser?.id);
  return Number.isSafeInteger(member?.relayTeam) ? partyLobby.relayTeams?.[member.relayTeam] || null : null;
}

function isLocalRelayPilotActive() {
  if (partyLobby?.gameMode !== 'relay-race') return true;
  const member = partyLobby.members.find((candidate) => candidate.id === signedInUser?.id);
  const team = localRelayTeam();
  return Boolean(member && team && !team.finishedAt && team.currentPilotId === member.id);
}

function formatRaceDuration(milliseconds) {
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return '--:--.--';
  const minutes = Math.floor(milliseconds / 60_000).toString().padStart(2, '0');
  const seconds = ((milliseconds % 60_000) / 1000).toFixed(2).padStart(5, '0');
  return `${minutes}:${seconds}`;
}

function syncRelayFlightState() {
  if (!flying || partyLobby?.gameMode !== 'relay-race' || !['grid', 'race'].includes(partyRacePhase)) return;
  const member = partyLobby.members.find((candidate) => candidate.id === signedInUser?.id);
  const team = localRelayTeam();
  if (!member || !team) return;
  const nextProgress = Math.min(flightCourseEntries.length, Math.max(0, Number(team.nextGateIndex) - 1));
  if (nextProgress !== routeProgress && flightCourseEntries.length) {
    routeProgress = nextProgress;
    flightCourseEntries.forEach((entry, index) => {
      entry.passed = index < routeProgress;
      entry.indicator.visible = index === routeProgress && !team.finishedAt;
    });
    updateCourseProgress(routeProgress, Boolean(team.finishedAt));
  }
  if (!team.finishedAt && team.currentPilotId === member.id) {
    const activationKey = `${team.teamIndex}:${team.currentLap}:${team.currentStation}`;
    if (activationKey !== localRelayActivationKey && launchPadState) {
      localRelayActivationKey = activationKey;
      flight.position.copy(launchPadState.position);
      flight.velocity.set(0, 0, 0);
      flight.acceleration.set(0, 0, 0);
      resetFlightControllerState();
      flight.orientation.setFromAxisAngle(axisY, launchPadState.heading);
      flight.throttle = 0;
      flight.speed = 0;
      previousFlightPosition.copy(flight.position);
      launchPadState.started = false;
      raceTimerStartedAt = 0;
      raceTimerFinishedAt = 0;
    }
  }
}

function updateRelayRaceTiming() {
  const panel = document.querySelector('#relayRaceTiming');
  const host = document.querySelector('#relayRaceTeams');
  if (!panel || !host) return;
  const relayActive = Boolean(flying && partyLobby?.gameMode === 'relay-race'
    && (['starting', 'grid', 'racing'].includes(partyLobby.status) || ['grid', 'race'].includes(partyRacePhase)));
  panel.hidden = !relayActive;
  if (!relayActive) return;
  host.replaceChildren();
  (partyLobby.relayTeams || []).forEach((team) => {
    const row = document.createElement('div');
    row.className = `relay-team-row${team.teamIndex === localRelayTeam()?.teamIndex ? ' is-local' : ''}`;
    const title = document.createElement('strong');
    title.textContent = `TEAM ${team.teamIndex === 0 ? 'CYAN' : 'CORAL'}`;
    const activePilot = partyLobby.members.find((member) => member.id === team.currentPilotId);
    const detail = document.createElement('span');
    detail.textContent = team.finishedAt
      ? 'FINISHED'
      : `LAP ${Math.min(Number(team.currentLap) || 1, Number(team.lapCount) || 1)} / ${Number(team.lapCount) || 1} · ${activePilot?.username || 'WAITING'}`;
    const lap = document.createElement('b');
    const lapTime = team.lapStartedAt ? Date.now() - team.lapStartedAt : team.lapTimes.at(-1) || 0;
    lap.textContent = formatRaceDuration(lapTime);
    const splitLap = team.splits.some((split) => split.lap === team.currentLap) ? team.currentLap : Math.max(1, team.currentLap - 1);
    const lapSplits = team.splits.filter((split) => split.lap === splitLap).slice(-RELAY_STATION_COUNT);
    const split = document.createElement('small');
    split.textContent = lapSplits.length
      ? lapSplits.map((item) => `S${item.station + 1} ${item.username} ${formatRaceDuration(item.timeMs)}`).join(' · ')
      : 'NO SPLITS YET';
    row.append(title, detail, lap, split);
    host.append(row);
  });
}

function syncPartySetup(lobby) {
  if (!lobby || !signedInUser || lobby.hostId === signedInUser.id) return;
  const lobbyTracks = lobby.trackSource === 'community'
    ? allCommunityTracks()
    : Object.entries(trackCatalog).filter(([biomeId]) => biomes[biomeId]).flatMap(([biomeId, tracks]) => tracks.map((track) => ({ ...track, biomeId, environmentId: biomeId })));
  const lobbyTrack = lobbyTracks.find((track) => track.id === lobby.trackId && trackEnvironmentId(track) === lobby.biome)
    || lobbyTracks.find((track) => track.id === lobby.trackId);
  const environmentId = trackEnvironmentId(lobbyTrack) || lobby.biome;
  if (environmentId !== activeBiome) {
    builderGates = [];
    customGateObjects = [];
    builderProps = [];
    builderPropObjects.forEach((object) => builderPropRoot.remove(object));
    builderPropObjects = [];
        builderPlacementHistory = [];
        detachBuilderPropTransform();
    selectedGateId = null;
    selectedBuilderPropId = null;
    builderSelectionHelper.visible = false;
    safeApplyBiome(environmentId);
    restoreBuilder();
    restoreBuilderProps();
  }
  if (lobbyTrack && (activeBiome !== trackEnvironmentId(lobbyTrack) || activeTrack?.id !== lobbyTrack.id)) {
    loadTrackWithEnvironment(lobbyTrack, false);
  } else if (lobby.trackId && activeTrack?.id !== lobby.trackId) {
    applyTrackSelection(lobby.trackId, false);
  }
  updatePartyDroneStage(lobby);
}

function schedulePartyRace(lobby) {
  if (!lobby || !['starting', 'grid', 'racing'].includes(lobby.status) || !lobby.startAt) return;
  const raceAt = Number(lobby.raceAt) || Number(lobby.startAt) + 5000;
  const scheduleKey = `${lobby.startAt}:${raceAt}`;
  if (scheduledPartyRaceAt === scheduleKey) return;
  scheduledPartyRaceAt = scheduleKey;
  partyRaceFinished = false;
  localRelayActivationKey = '';
  crewCheckpointQueue = Promise.resolve();
  const gridDelay = Math.max(0, Number(lobby.startAt) - Date.now());
  window.setTimeout(() => {
    if (!partyLobby || partyLobby.startAt !== lobby.startAt || scheduledPartyRaceAt !== scheduleKey) return;
    stagePartyRaceGrid(raceAt);
  }, gridDelay);
  const raceDelay = Math.max(0, raceAt - Date.now());
  window.setTimeout(() => {
    if (!partyLobby || partyLobby.startAt !== lobby.startAt || scheduledPartyRaceAt !== scheduleKey) return;
    beginPartyRace(raceAt);
  }, raceDelay);
}

function updatePartyLobby(lobby) {
  if (partyLobby?.code !== lobby?.code) partyFlightSnapshots.clear();
  if (lobby?.status === 'open' && lobby.results?.length && ['grid', 'race'].includes(partyRacePhase)) {
    partyRacePhase = 'lobby';
    partyRaceFinished = true;
    localRelayActivationKey = '';
  }
  const localMember = lobby?.members.find((member) => member.id === signedInUser?.id);
  const localXp = Number(localMember?.xp);
  if (signedInUser && Number.isFinite(localXp) && localXp !== Number(signedInUser.xp)) {
    signedInUser = { ...signedInUser, xp: localXp };
    updateAccountUI();
  }
  updatePartyUI(lobby);
  if (lobby) {
    if (lobby.status === 'open' && partyRacePhase === 'grid' && !lobby.results?.length && flying) {
      partyRacePhase = 'waiting';
      selectedMode = 'Free Flight';
      setPage('singleplayer');
      enterFlight();
      document.querySelector('#flightModeLabel').textContent = 'LOBBY / FREE FLIGHT';
      document.querySelector('#flightPrompt').textContent = `FREE FLIGHT / ${lobby.members.filter((member) => member.ready).length} OF ${lobby.members.length} READY / MIN ${minimumOnlineRacePlayers(lobby)}`;
      updateRaceStartOverlay();
      updateRaceLeaderboard();
    }
    syncPartySetup(lobby);
    schedulePartyRace(lobby);
  } else {
    scheduledPartyRaceAt = 0;
    partyRacePhase = 'lobby';
    setLobbyMessage('');
  }
  syncLobbyMusic();
}

function enterPartyWaitingFlight() {
  if (!partyLobby || !authSessionReady || partyRacePhase === 'grid' || partyRacePhase === 'race') return;
  partyRacePhase = 'waiting';
  selectedMode = 'Free Flight';
  setPage('singleplayer');
  enterFlight();
  document.querySelector('#flightModeLabel').textContent = 'LOBBY / FREE FLIGHT';
  document.querySelector('#flightPrompt').textContent = `FREE FLIGHT / ${partyLobby.members.length} PILOTS / MIN ${minimumOnlineRacePlayers(partyLobby)}`;
  updateRaceStartOverlay();
  void lobbyRequest('ready').then((result) => {
    updatePartyLobby(result.lobby);
    const loaded = result.lobby.members.filter((member) => member.ready).length;
    setLobbyMessage(result.lobby.status === 'starting'
      ? `Race starting with ${loaded} pilots. Free fly for 10 seconds before the grid.`
      : `Lobby loading: ${loaded}/${result.lobby.members.length} connected pilots ready. At least ${minimumOnlineRacePlayers(result.lobby)} are required to start.`);
  }).catch((error) => setLobbyMessage(error.message, true));
}

function updateRaceStartOverlay() {
  const overlay = document.querySelector('#raceStartOverlay');
  const label = document.querySelector('#raceStartLabel');
  const number = document.querySelector('#raceStartNumber');
  const detail = document.querySelector('#raceStartDetail');
  if (!overlay || !label || !number || !detail) return;
  const activeLobby = partyLobby && (['starting', 'grid'].includes(partyLobby.status) || partyRacePhase === 'grid' || partyRacePhase === 'race');
  let nextLabel = '';
  let nextNumber = '';
  let nextDetail = '';
  const now = Date.now();
  if (activeLobby && partyLobby.status === 'starting' && partyLobby.startAt > now) {
    nextLabel = 'RACE GRID IN';
    nextNumber = String(Math.max(1, Math.ceil((partyLobby.startAt - now) / 1000)));
    nextDetail = `${partyLobby.members.length} PILOTS / FREE FLIGHT`;
  } else if (activeLobby && (partyLobby.status === 'grid' || partyRacePhase === 'grid')) {
    const raceAt = Number(partyLobby.raceAt) || Number(partyLobby.startAt) + 5000;
    if (now < raceAt) {
      nextLabel = 'RACE STARTS IN';
      nextNumber = String(Math.max(1, Math.ceil((raceAt - now) / 1000)));
      nextDetail = 'HOLD POSITION ON THE PODIUM';
    }
  }
  if (partyRacePhase === 'race' && now < partyRaceGoUntil) {
    nextLabel = 'RACE';
    nextNumber = 'GO';
    nextDetail = 'FLY THE COURSE';
  }
  if (activeLobby && partyLobby.gameMode === 'relay-race' && partyRacePhase === 'race') {
    const member = partyLobby.members.find((candidate) => candidate.id === signedInUser?.id);
    const team = localRelayTeam();
    if (team?.finishedAt) {
      nextLabel = 'RELAY TEAM COMPLETE';
      nextNumber = 'DONE';
      nextDetail = 'WAIT FOR THE OTHER TEAM';
    } else if (!isLocalRelayPilotActive()) {
      nextLabel = 'RELAY HANDOFF';
      nextNumber = 'WAIT';
      nextDetail = `TEAMMATE AT STATION ${Number(member?.relayStation ?? 0) + 1} / LAP ${team?.currentLap || 1}`;
    } else if (!launchPadState?.started && now < partyRaceGoUntil) {
      nextLabel = 'YOUR RELAY LEG';
      nextNumber = 'GO';
      nextDetail = `PASS THE NEXT GATE / LAP ${team?.currentLap || 1}`;
    } else {
      nextLabel = '';
      nextNumber = '';
      nextDetail = '';
    }
  }
  overlay.hidden = !flying || !nextNumber;
  if (!nextNumber) {
    partyCountdownLabel = '';
    partyCountdownNumber = '';
    return;
  }
  if (nextLabel !== partyCountdownLabel) {
    label.textContent = nextLabel;
    partyCountdownLabel = nextLabel;
  }
  if (nextNumber !== partyCountdownNumber) {
    number.textContent = nextNumber;
    partyCountdownNumber = nextNumber;
  }
  detail.textContent = nextDetail;
}

let raceLeaderboardLastRenderAt = 0;

function updateRaceLeaderboard() {
  const panel = document.querySelector('#raceLeaderboard');
  const rows = document.querySelector('#raceLeaderboardRows');
  if (!panel || !rows) return;
  panel.hidden = true;
  raceLeaderboardLastRenderAt = 0;
  return;
  const now = performance.now();
  if (!wasHidden && now - raceLeaderboardLastRenderAt < 100) return;
  raceLeaderboardLastRenderAt = now;
  const total = Math.max(1, flightCourseEntries.length);
  const members = partyLobby
    ? partyLobby.members
    : [{ id: signedInUser?.id || 'local-pilot', username: signedInUser?.username || 'PILOT', nextGateIndex: routeProgress, finishedAt: raceTimerFinishedAt || null }];
  const ordered = members.map((member) => {
    const isLocal = partyLobby ? member.id === signedInUser?.id : true;
    const localProgress = isLocal ? Math.max(Number(member.nextGateIndex) || 0, routeProgress) : Number(member.nextGateIndex) || 0;
    const syncedTime = partyFlightSnapshots.get(member.id)?.raceTimeMs;
    const startedAt = Number(member.raceStartedAt) || 0;
    const serverTime = Number(member.finishedAt) || (Date.now() + partyServerClockOffsetMs);
    const localRaceTimeMs = raceTimerStartedAt
      ? Math.max(0, (raceTimerFinishedAt || performance.now()) - raceTimerStartedAt)
      : null;
    const raceTimeMs = !partyLobby && isLocal && localRaceTimeMs !== null
      ? localRaceTimeMs
      : Number.isFinite(syncedTime)
        ? syncedTime
        : startedAt
          ? Math.max(0, serverTime - startedAt)
          : isLocal ? localRaceTimeMs : null;
    return { ...member, isLocal, progress: localProgress, raceTimeMs };
  }).sort((a, b) => {
    if (Boolean(a.finishedAt) !== Boolean(b.finishedAt)) return a.finishedAt ? -1 : 1;
    if (a.finishedAt && b.finishedAt) return Number(a.finishedAt) - Number(b.finishedAt);
    if (a.progress !== b.progress) return b.progress - a.progress;
    return Number(b.lastCheckpointAt || 0) - Number(a.lastCheckpointAt || 0);
  });
  const leaderEstablished = Boolean(!partyLobby || ordered[0]?.finishedAt || ordered[0]?.progress > 0);
  rows.replaceChildren();
  ordered.forEach((member, index) => {
    const row = document.createElement('li');
    row.className = `race-leaderboard-row${index === 0 && leaderEstablished ? ' is-leading' : ''}${member.isLocal ? ' is-local' : ''}`;
    const place = document.createElement('b');
    place.className = 'race-leaderboard-place';
    place.textContent = index === 0 ? '1' : String(index + 1);
    const name = document.createElement('span');
    name.className = 'race-leaderboard-name';
    name.textContent = member.username;
    const time = document.createElement('time');
    time.className = 'race-leaderboard-time';
    time.textContent = member.raceTimeMs === null
      ? member.isLocal && !partyLobby ? 'BLOCK' : '--:--.--'
      : formatRaceDuration(member.raceTimeMs);
    const progress = document.createElement('small');
    progress.className = 'race-leaderboard-progress';
    progress.textContent = member.finishedAt ? 'FIN' : `${Math.min(total, member.progress)}/${total}`;
    row.append(place, name, time, progress);
    rows.append(row);
  });
}

function stagePartyRaceGrid(raceAt) {
  if (!partyLobby || !partyLobby.startAt || partyRaceFinished || partyRacePhase === 'grid' || partyRacePhase === 'race') return;
  partyRacePhase = 'grid';
  const memberIndex = Math.max(0, partyLobby.members.findIndex((member) => member.id === signedInUser?.id));
  partyRaceGridSlot = partyLobby.gameMode === 'relay-race'
    ? Number(partyLobby.members[memberIndex]?.relayStation ?? memberIndex % RELAY_STATION_COUNT)
    : memberIndex;
  selectedMode = 'Race';
  setPage('singleplayer');
  enterFlight();
  const seconds = Math.max(1, Math.ceil((raceAt - Date.now()) / 1000));
  document.querySelector('#flightPrompt').textContent = `ON THE GRID / RACE STARTS IN ${seconds}`;
  updateRaceStartOverlay();
  updateRaceLeaderboard();
  syncLobbyMusic();
}

function beginPartyRace(raceAt) {
  if (!partyLobby || partyRaceFinished || partyRacePhase === 'race') return;
  if (partyRacePhase !== 'grid') stagePartyRaceGrid(raceAt);
  partyRacePhase = 'race';
  partyRaceGoUntil = Date.now() + 900;
  if (launchPadState) launchPadState.started = false;
  updateRaceStartOverlay();
  updateRaceLeaderboard();
  syncLobbyMusic();
}

async function refreshPartyLobby() {
  if (!signedInUser?.id) { updatePartyLobby(null); return; }
  try {
    const result = await lobbyRequest('current', null);
    updatePartyLobby(result.lobby);
  } catch (error) {
    setLobbyConnectionStatus('OFFLINE', true);
    setLobbyMessage(error.message, true);
  }
}

function startPartyPolling() {
  window.clearInterval(partyPollTimer);
  window.clearInterval(gameChatPollTimer);
  window.clearInterval(partyPositionTimer);
  void refreshPartyLobby();
  void refreshGameChat();
  partyPollTimer = window.setInterval(refreshPartyLobby, 800);
  gameChatPollTimer = window.setInterval(refreshGameChat, 2200);
  partyPositionTimer = window.setInterval(syncPartyFlightPositions, 120);
}

async function createFlightParty() {
  if (!signedInUser) { openAuthModal('create'); return; }
  const selectedTrack = prepareTrackForMode(selectedMultiplayerMode);
  if (!selectedTrack) return;
  try {
    const result = await lobbyRequest('create', {
      biome: selectedTrack.track.biomeId,
      trackId: selectedTrack.track.id,
      trackSource: selectedTrack.trackSource,
      serverRegion: 'auto',
      gameMode: selectedMultiplayerMode,
    });
    updatePartyLobby(result.lobby);
    setLobbyMessage(`Party created. Share code ${result.lobby.code} with your crew.`);
    showToast(`Private party ready. Invite code: ${result.lobby.code}`);
    enterPartyWaitingFlight();
  } catch (error) { setLobbyMessage(error.message, true); }
}

async function quickMatchParty() {
  if (!signedInUser) { openAuthModal('create'); return; }
  const selectedTrack = prepareTrackForMode(selectedMultiplayerMode);
  if (!selectedTrack) return;
  try {
    const result = await lobbyRequest('matchmake', {
      biome: selectedTrack.track.biomeId,
      trackId: selectedTrack.track.id,
      trackSource: selectedTrack.trackSource,
      serverRegion: 'auto',
      gameMode: selectedMultiplayerMode,
    });
    updatePartyLobby(result.lobby);
    setLobbyMessage(result.message || `Match found. Waiting for at least ${minimumOnlineRacePlayers(result.lobby)} pilots; free fly while everyone loads in.`);
    enterPartyWaitingFlight();
  } catch (error) { setLobbyMessage(error.message, true); }
}

async function joinFlightParty(code) {
  if (!signedInUser) { openAuthModal('create'); return; }
  try {
    const result = await lobbyRequest('join', { code });
    updatePartyLobby(result.lobby);
    setLobbyMessage(`Joined ${result.lobby.members.find((member) => member.isHost)?.username || 'the host'}'s party.`);
    enterPartyWaitingFlight();
  } catch (error) { setLobbyMessage(error.message, true); }
}

function setLobbyConnectionStatus(label, offline = false) {
  const node = document.querySelector('#lobbyConnectionStatus');
  const text = node.querySelector('span');
  if (text) text.textContent = label;
  else node.textContent = label;
  node.classList.toggle('is-offline', offline);
}

function setTeamMessage(message = '', isError = false) {
  const node = document.querySelector('#teamMessage');
  node.textContent = message;
  node.classList.toggle('is-error', isError);
}

function renderTeamLeaderboard(leaders = []) {
  const list = document.querySelector('#teamLeaderboard');
  const count = document.querySelector('#teamLeaderboardCount');
  count.textContent = `${leaders.length} TEAM${leaders.length === 1 ? '' : 'S'}`;
  list.replaceChildren();
  if (!leaders.length) {
    const empty = document.createElement('li');
    empty.className = 'team-rank-empty';
    empty.textContent = 'No teams ranked yet.';
    list.append(empty);
    return;
  }
  leaders.forEach((team) => {
    const row = document.createElement('li');
    row.className = `team-rank-row${team.id === currentTeam?.id ? ' is-local' : ''}`;
    const position = document.createElement('span');
    position.className = 'team-rank-position';
    position.textContent = `#${String(team.rank).padStart(2, '0')}`;
    const copy = document.createElement('span');
    copy.className = 'team-rank-copy';
    const name = document.createElement('strong');
    name.textContent = team.name;
    const members = document.createElement('small');
    members.textContent = `${team.memberCount} PILOT${team.memberCount === 1 ? '' : 'S'}`;
    copy.append(name, members);
    const xp = document.createElement('span');
    xp.className = 'team-rank-xp';
    xp.textContent = `${Math.max(0, Number(team.xp) || 0).toLocaleString()} XP`;
    row.append(position, copy, xp);
    list.append(row);
  });
}

function renderTeamDetails(team) {
  const emptyState = document.querySelector('#teamEmptyState');
  const details = document.querySelector('#teamDetails');
  const signedIn = Boolean(signedInUser);
  emptyState.hidden = Boolean(team);
  details.hidden = !team;
  document.querySelector('#teamSignInNotice').hidden = signedIn;
  document.querySelector('#teamCreateForm').hidden = !signedIn;
  document.querySelector('#teamJoinForm').hidden = !signedIn;
  if (!team) return;

  document.querySelector('#teamName').textContent = team.name;
  document.querySelector('#teamRankBadge').textContent = team.rank ? `RANK #${team.rank}` : 'UNRANKED';
  document.querySelector('#teamMemberCount').textContent = `${team.members.length} / ${team.maxMembers} PILOTS`;
  document.querySelector('#teamXp').textContent = Math.max(0, Number(team.xp) || 0).toLocaleString();
  document.querySelector('#teamInviteCode').textContent = team.code;
  const roster = document.querySelector('#teamRoster');
  roster.replaceChildren();
  team.members.forEach((member) => {
    const row = document.createElement('div');
    row.className = 'team-roster-member';
    const name = document.createElement('strong');
    name.textContent = member.username;
    const xp = document.createElement('small');
    xp.textContent = `${member.isCaptain ? 'CAPTAIN / ' : ''}${Math.max(0, Number(member.xp) || 0).toLocaleString()} XP`;
    row.append(name, xp);
    roster.append(row);
  });
}

function applyTeamResponse(result) {
  currentTeam = result.team || null;
  renderTeamDetails(currentTeam);
  renderTeamLeaderboard(result.leaders || []);
}

async function refreshTeamHub() {
  try {
    const result = await teamsRequest();
    applyTeamResponse(result);
    setTeamMessage('');
  } catch (error) {
    renderTeamDetails(currentTeam);
    setTeamMessage(error.message, true);
  }
}

function startTeamPolling() {
  window.clearInterval(teamPollTimer);
  void refreshTeamHub();
  teamPollTimer = window.setInterval(refreshTeamHub, 30_000);
}

async function submitTeamAction(event, endpoint, payload) {
  event.preventDefault();
  if (!signedInUser) { openAuthModal('signin'); return; }
  const form = event.currentTarget;
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  setTeamMessage(endpoint === 'create' ? 'Creating your team…' : 'Joining team…');
  try {
    const result = await teamsRequest(endpoint, payload);
    applyTeamResponse(result);
    form.reset();
    setTeamMessage(result.message || 'Team updated.');
  } catch (error) {
    setTeamMessage(error.message, true);
  } finally {
    submit.disabled = false;
  }
}

document.querySelector('#teamCreateForm').addEventListener('submit', (event) => {
  const name = document.querySelector('#teamNameInput').value.trim();
  void submitTeamAction(event, 'create', { name });
});
document.querySelector('#teamJoinForm').addEventListener('submit', (event) => {
  const code = document.querySelector('#teamInviteInput').value.trim().toUpperCase();
  void submitTeamAction(event, 'join', { code });
});
document.querySelector('#teamInviteInput').addEventListener('input', (event) => {
  event.currentTarget.value = event.currentTarget.value.toUpperCase();
});
document.querySelector('#teamSignInButton').addEventListener('click', () => openAuthModal('signin'));
document.querySelector('#leaveTeamButton').addEventListener('click', async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  setTeamMessage('Leaving your team…');
  try {
    const result = await teamsRequest('leave', {});
    applyTeamResponse(result);
    setTeamMessage(result.message || 'You left the team.');
  } catch (error) {
    setTeamMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
});
document.querySelector('#copyTeamCode').addEventListener('click', async () => {
  if (!currentTeam?.code) return;
  try {
    await navigator.clipboard.writeText(currentTeam.code);
    setTeamMessage(`Invite code ${currentTeam.code} copied.`);
  } catch {
    setTeamMessage(`Share invite code ${currentTeam.code} with your crew.`);
  }
});
document.querySelector('#friendsTeamDropdown')?.addEventListener('toggle', (event) => {
  if (event.currentTarget.open && signedInUser) void refreshTeamHub();
});

async function refreshCompetitiveBanners() {
  const fetchJson = async (url) => {
    const response = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error(`Request failed: ${url}`);
    return response.json();
  };
  const [leaderboardResult, teamResult] = await Promise.allSettled([
    fetchJson('/api/leaderboard'),
    fetchJson('/api/teams'),
  ]);
  const updatedData = {};
  if (leaderboardResult.status === 'fulfilled') {
    updatedData.leaders = leaderboardResult.value.leaders || [];
  }
  updatedData.nextTournament = leaderboardResult.status === 'fulfilled'
    ? leaderboardResult.value.nextTournament || null
    : null;
  setTournamentAvailability(updatedData.nextTournament);
  if (teamResult.status === 'fulfilled') updatedData.teams = teamResult.value.leaders || [];
  drawCompetitiveBanners(updatedData);
}

void refreshCompetitiveBanners();
void refreshCommunityTracks();
competitiveBannerPollTimer = window.setInterval(refreshCompetitiveBanners, 60_000);
competitiveBannerCycleTimer = window.setInterval(() => {
  if (document.hidden) return;
  competitiveBannerSlide = (competitiveBannerSlide + 1) % 3;
  drawCompetitiveBanners();
}, 8_000);
startTeamPolling();

function serverTrackChoices() {
  const environmentId = document.querySelector('#serverBiomeSelect')?.value || activeBiome;
  const choices = activeServerTrackSource === 'community'
    ? allCommunityTracks()
    : allTrackChoices().filter((track) => !isCommunityTrack(track));
  return choices.filter((track) => trackSupportsMultiplayerMode(track, selectedMultiplayerMode)
    && trackEnvironmentId(track) === environmentId);
}

function updateCustomServerTrackSummary() {
  const selected = document.querySelector('#serverTrackSelect').value;
  const choices = serverTrackChoices();
  const track = choices.find((item) => `${item.biomeId}|${item.id}` === selected);
  const summary = document.querySelector('#customServerTrackSummary');
  const modeLabel = multiplayerModes[selectedMultiplayerMode] || 'Selected mode';
  summary.querySelector('small').textContent = `${activeServerTrackSource === 'community' ? 'COMMUNITY' : 'IN-GAME'} / ${modeLabel.toUpperCase()} / ${(track?.biomeName || '').toUpperCase()}`;
  summary.querySelector('strong').textContent = track?.name || (choices.length ? 'Choose a track' : 'No ' + modeLabel + ' tracks available');
}

function renderServerTrackChoices(preferredValue = '') {
  const select = document.querySelector('#serverTrackSelect');
  const choices = serverTrackChoices();
  select.replaceChildren();
  select.disabled = choices.length === 0;
  if (!choices.length) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No ' + (multiplayerModes[selectedMultiplayerMode] || 'selected mode') + ' tracks available';
    select.append(option);
  }
  choices.forEach((track) => {
    const option = document.createElement('option');
    option.value = `${track.biomeId}|${track.id}`;
    option.textContent = `${track.name} / ${track.biomeName} / ${builderGameModeLabels[trackGameMode(track)]}`;
    select.append(option);
  });
  const selectedEnvironment = document.querySelector('#serverBiomeSelect')?.value || activeBiome;
  const currentChoice = choices.find((track) => track.biomeId === selectedEnvironment && track.id === activeTrack?.id);
  const nextValue = choices.some((track) => `${track.biomeId}|${track.id}` === preferredValue)
    ? preferredValue
    : currentChoice ? `${currentChoice.biomeId}|${currentChoice.id}` : select.options[0]?.value;
  if (nextValue) select.value = nextValue;
  updateCustomServerTrackSummary();
}

function setHostMatchOpen(open) {
  const menu = document.querySelector('#menu');
  const dashboard = document.querySelector('.multiplayer-dashboard');
  const button = document.querySelector('#hostMatchButton');
  menu.classList.toggle('is-server-expanded', open);
  dashboard?.classList.toggle('is-expanded', open);
  if (button) {
    button.setAttribute('aria-expanded', String(open));
    button.textContent = open ? 'CLOSE HOST' : 'HOST MATCH';
  }
  if (open) renderServerTrackChoices();
}

async function createCustomServer(event) {
  event.preventDefault();
  if (!signedInUser) { openAuthModal('create'); return; }
  const isPublic = document.querySelector('#serverVisibility').value === 'public';
  const [biomeId, trackId] = document.querySelector('#serverTrackSelect').value.split('|');
  const track = serverTrackChoices().find((item) => item.biomeId === biomeId && item.id === trackId);
  if (!track) { setLobbyMessage('Choose a valid server track first.', true); return; }
  const button = document.querySelector('#createLobbyButton');
  button.disabled = true;
  setLobbyMessage(`Opening your ${isPublic ? 'public' : 'private'} server...`);
  try {
    const result = await lobbyRequest('create', {
      isPublic,
      serverName: document.querySelector('#customServerName').value.trim(),
      maxPlayers: Number(document.querySelector('#serverCapacity').value),
      serverRegion: 'auto',
      trackSource: activeServerTrackSource,
      biome: trackEnvironmentId(track),
      trackId: track.id,
      gameMode: selectedMultiplayerMode,
    });
    loadTrackWithEnvironment(track);
    updatePartyLobby(result.lobby);
    setLobbyMessage(`${result.lobby.serverName} is ${isPublic ? 'public' : 'private'}. Share code ${result.lobby.code} with your crew.`);
    showToast(`${isPublic ? 'Public' : 'Private'} server ready. Invite code: ${result.lobby.code}`);
    enterPartyWaitingFlight();
  } catch (error) {
    setLobbyMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

async function copyPartyInvite() {
  if (!partyLobby) return createFlightParty();
  try {
    await navigator.clipboard.writeText(partyLobby.code);
    showToast(`Invite code ${partyLobby.code} copied.`);
  } catch {
    showToast(`Share invite code ${partyLobby.code} with your friends.`);
  }
}

async function updatePartyConfig() {
  if (!partyLobby || partyLobby.hostId !== signedInUser?.id || partyLobby.status !== 'open') return;
  const selectedTrack = prepareTrackForMode(selectedMultiplayerMode);
  if (!selectedTrack) return;
  try {
    const result = await lobbyRequest('config', {
      biome: selectedTrack.track.biomeId,
      trackId: selectedTrack.track.id,
      trackSource: selectedTrack.trackSource,
      serverRegion: 'auto',
      gameMode: selectedMultiplayerMode,
    });
    updatePartyUI(result.lobby);
  } catch (error) { setLobbyMessage(error.message, true); }
}

function reportCrewLaunch(raceStartAt, previous, current) {
  const request = crewCheckpointQueue.then(async () => {
    const result = await lobbyRequest('race/launch', { startAt: raceStartAt, previous, current });
    updatePartyLobby(result.lobby);
    return result;
  });
  crewCheckpointQueue = request.catch(() => undefined);
  return request;
}

function reportCrewCheckpoint(gateIndex, raceStartAt, crossing) {
  const request = crewCheckpointQueue.then(async () => {
    const result = await lobbyRequest('race/checkpoint', { gateIndex, startAt: raceStartAt, crossing });
    updatePartyLobby(result.lobby);
    return result;
  });
  crewCheckpointQueue = request.catch(() => undefined);
  return request;
}

async function finishCrewRace(didNotFinish = false, raceStartAt = partyLobby?.startAt) {
  if (partyRaceFinished || !partyLobby || !['starting', 'grid', 'racing'].includes(partyLobby.status)) return;
  partyRaceFinished = true;
  try {
    const result = await lobbyRequest('race/finish', { didNotFinish, startAt: raceStartAt });
    if (result.user?.id === signedInUser?.id) {
      signedInUser = result.user;
      updateAccountUI();
    }
    updatePartyLobby(result.lobby);
    if (!didNotFinish && result.lobby.gameMode !== 'relay-race') refreshRaceFinishLeaderboard();
    if (!didNotFinish) {
      setLobbyMessage(result.teamXpAwarded
        ? 'Race complete. 100 pilot XP and 100 team XP added.'
        : 'Race complete. 100 XP added to your pilot profile.');
      void refreshCompetitiveBanners();
      void refreshTeamHub();
    }
    if (didNotFinish) setLobbyMessage('You left the crew race. Your result is marked DNF.');
  } catch (error) {
    if (!didNotFinish) partyRaceFinished = false;
    setLobbyMessage(error.message, true);
  }
}

document.querySelector('#copyPartyCode').addEventListener('click', copyPartyInvite);
document.querySelector('#copySettingsPartyCode').addEventListener('click', copyPartyInvite);
document.querySelector('#partyLeaveButton').addEventListener('click', async () => {
  try {
    await lobbyRequest('leave');
    updatePartyLobby(null);
    setLobbyMessage('You left the flight party.');
  } catch (error) { setLobbyMessage(error.message, true); }
});
document.querySelector('#quickMatchButton').addEventListener('click', quickMatchParty);
document.querySelector('#hostMatchButton').addEventListener('click', () => {
  setHostMatchOpen(!document.querySelector('#menu').classList.contains('is-server-expanded'));
});
document.querySelector('#closeHostMatch').addEventListener('click', () => setHostMatchOpen(false));
document.querySelector('#serverSetupForm').addEventListener('submit', createCustomServer);
document.querySelector('#serverBiomeSelect').addEventListener('change', () => renderServerTrackChoices());
document.querySelector('#serverTrackSelect').addEventListener('change', updateCustomServerTrackSummary);
document.querySelectorAll('[data-server-track-source]').forEach((button) => button.addEventListener('click', () => {
  activeServerTrackSource = button.dataset.serverTrackSource;
  document.querySelectorAll('[data-server-track-source]').forEach((item) => {
    const active = item === button;
    item.classList.toggle('is-selected', active);
    item.setAttribute('aria-pressed', String(active));
  });
  try { localStorage.setItem('xspec-server-track-source', activeServerTrackSource); } catch { /* Keep the current selection in memory. */ }
  renderServerTrackChoices();
}));
function setSelectedMultiplayerMode(mode) {
  if (!Object.hasOwn(multiplayerModes, mode) || (mode === 'competitive-4v4' && !tournamentModeAvailable)) return false;
  const changed = selectedMultiplayerMode !== mode;
  selectedMultiplayerMode = mode;
  document.querySelectorAll('[data-game-mode]').forEach((button) => {
    const active = button.dataset.gameMode === mode;
    button.classList.toggle('is-selected', active);
    button.setAttribute('aria-pressed', String(active));
  });
  if (changed) {
    try { localStorage.setItem('xspec-multiplayer-mode', mode); } catch { /* Keep the selected mode for this session. */ }
    if (document.querySelector('#serverTrackSelect')) renderServerTrackChoices();
  }
  const capacity = document.querySelector('#serverCapacity');
  const capacityHint = document.querySelector('#serverCapacityHint');
  const minimumPlayersHint = document.querySelector('#serverMinPlayersHint');
  if (capacity) {
    const relayMode = mode === 'relay-race';
    capacity.disabled = relayMode;
    if (relayMode) capacity.value = '8';
    if (capacityHint) capacityHint.hidden = !relayMode;
    if (minimumPlayersHint) minimumPlayersHint.hidden = relayMode;
  }
  return true;
}
function getSavedBuilderGameMode(biomeId) {
  try {
    const savedMode = localStorage.getItem(`aerframe-builder-mode-${biomeId}`);
    if (Object.hasOwn(builderGameModeLabels, savedMode)) return savedMode;
    const metadata = JSON.parse(localStorage.getItem(`aerframe-course-meta-${biomeId}`) || '{}');
    if (Object.hasOwn(builderGameModeLabels, metadata.gameMode)) return metadata.gameMode;
  } catch { /* Fall back to the default build mode. */ }
  return '4v4';
}
function setBuilderGameMode(mode, biomeId = activeBiome, persist = true) {
  if (!Object.hasOwn(builderGameModeLabels, mode)) return false;
  builderGameMode = mode;
  const modeSelect = document.querySelector('#builderLaunchMode');
  if (modeSelect) modeSelect.value = mode;
  const modeSummary = document.querySelector('#builderModeSummary');
  if (modeSummary) modeSummary.textContent = `${builderGameModeLabels[mode].toUpperCase()} MODE`;
  updateBuilderAssetLibrary(mode);
  updateBuilderDisplay();
  if (!publishingBuilderTrack) setBuilderPublishMessage(builderTrackRequirementsMessage());
  if (persist) {
    try { localStorage.setItem(`aerframe-builder-mode-${biomeId}`, mode); } catch { /* Keep the selected mode for this session. */ }
  }
  return true;
}

function updateBuilderAssetLibrary(mode) {
  const raceMode = mode !== 'prop-hunt';
  const raceGateSection = document.querySelector('#builderRaceGateSection');
  const propSection = document.querySelector('#builderPropSection');
  const podiumAsset = document.querySelector('[data-builder-prop="podium"]');
  const relayPodiumGateAsset = document.querySelector('[data-builder-prop="relay-podium-gate"]');
  if (raceGateSection) raceGateSection.hidden = !raceMode;
  if (propSection) propSection.hidden = raceMode;
  if (podiumAsset) podiumAsset.hidden = mode === 'relay-race' || mode === 'prop-hunt';
  if (relayPodiumGateAsset) relayPodiumGateAsset.hidden = mode !== 'relay-race';
  if (currentPage !== 'builder') return;

  const assetIsAvailable = activeBuilderAsset.kind === 'gate'
    ? raceMode && gateTypes[activeBuilderAsset.type]?.raceAsset === true
    : raceMode
      ? mode === 'relay-race'
        ? activeBuilderAsset.type === 'relay-podium-gate'
        : activeBuilderAsset.type === 'podium'
      : activeBuilderAsset.type !== 'podium' && activeBuilderAsset.type !== 'relay-podium-gate';
  if (assetIsAvailable) return;

  selectedGateId = null;
  selectedBuilderPropId = null;
  selectedEnvironmentBuildingId = null;
  gatePlacementArmed = false;
  builderSelectionHelper.visible = false;
  clearBuilderGhost();
  if (raceMode) {
    activeGateType = 'neon-square';
    activeBuilderAsset = { kind: 'gate', type: 'neon-square' };
    document.querySelector('#builderPlacementStatus').textContent = 'SELECT A RACE GATE';
  } else {
    activeBuilderAsset = { kind: 'prop', type: 'container' };
    document.querySelector('#builderPlacementStatus').textContent = 'SELECT A PROP OR ENVIRONMENT OBJECT';
  }
  updateBuilderDisplay();
}
try {
  const savedMode = localStorage.getItem('xspec-multiplayer-mode');
  if (savedMode && Object.hasOwn(multiplayerModes, savedMode) && (savedMode !== 'competitive-4v4' || tournamentModeAvailable)) selectedMultiplayerMode = savedMode;
} catch { /* Use the 4v4 queue when no saved mode is available. */ }
setSelectedMultiplayerMode(selectedMultiplayerMode);
document.querySelectorAll('[data-game-mode]').forEach((button) => button.addEventListener('click', () => {
  if (setSelectedMultiplayerMode(button.dataset.gameMode) && partyLobby?.hostId === signedInUser?.id && partyLobby.status === 'open') {
    void updatePartyConfig();
  }
}));
try {
  const savedTrackSource = localStorage.getItem('xspec-server-track-source');
  if (savedTrackSource === 'community') activeServerTrackSource = 'community';
} catch { /* In-game tracks remain the default without storage. */ }
document.querySelectorAll('[data-server-track-source]').forEach((button) => {
  const active = button.dataset.serverTrackSource === activeServerTrackSource;
  button.classList.toggle('is-selected', active);
  button.setAttribute('aria-pressed', String(active));
});
document.querySelector('#serverBiomeSelect').value = activeBiome;
renderServerTrackChoices();
document.querySelector('#joinLobbyForm').addEventListener('submit', (event) => {
  event.preventDefault();
  void joinFlightParty(document.querySelector('#joinLobbyCode').value.trim().toUpperCase());
});
document.querySelectorAll('[data-podium-slot]').forEach((button) => button.addEventListener('click', () => {
  openFriendsPanel();
}));
updatePartyUI(null);

function openAuthModal(_intent = 'create', forFlight = false) {
  pendingFlightEntry = forFlight;
  authModal.hidden = false;
  authModal.setAttribute('aria-hidden', 'false');
  document.querySelector('#authForms').hidden = Boolean(signedInUser);
  document.querySelector('#authAccountDetails').hidden = !signedInUser;
  document.querySelector('#authEmailForm').hidden = false;
  document.querySelector('#authCodeForm').hidden = true;
  document.querySelector('#authUsernameForm').hidden = true;
  document.querySelector('#authEmail').value = '';
  document.querySelector('#authCode').value = '';
  document.querySelector('#authUsername').value = '';
  document.querySelector('#authHeading').textContent = 'Sign in or create account';
  document.querySelector('#authDescription').textContent = 'Enter your email and we’ll send a secure sign-in code. New pilots choose a username after verifying.';
  authEmailAddress = '';
  authSetupToken = '';
  setAuthMessage('');
  window.setTimeout(() => (signedInUser ? document.querySelector('#authClose') : document.querySelector('#authEmail')).focus(), 0);
}

function closeAuthModal() {
  authModal.hidden = true;
  authModal.setAttribute('aria-hidden', 'true');
  pendingFlightEntry = false;
  authSetupToken = '';
}

async function requestAuthCode() {
  const button = document.querySelector('#sendAuthCode');
  button.disabled = true;
  authSetupToken = '';
  document.querySelector('#authCodeForm').hidden = true;
  document.querySelector('#authUsernameForm').hidden = true;
  setAuthMessage('Sending a secure code…');
  try {
    const result = await authRequest('request-code', { email: authEmailAddress });
    document.querySelector('#authEmailTarget').textContent = authEmailAddress;
    document.querySelector('#authCode').value = '';
    document.querySelector('#authEmailForm').hidden = true;
    document.querySelector('#authCodeForm').hidden = false;
    document.querySelector('#authHeading').textContent = 'Check your email';
    document.querySelector('#authDescription').textContent = 'Enter the secure code to continue to your pilot account.';
    setAuthMessage(result.message || 'Your code is on the way.');
    document.querySelector('#authCode').focus();
  } catch (error) {
    setAuthMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
}

document.querySelector('#authEmailForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  authEmailAddress = document.querySelector('#authEmail').value.trim().toLowerCase();
  await requestAuthCode();
});

function finishAuthSignIn(result) {
  signedInUser = result.user;
  updatePartyDroneStage();
  updateAccountUI();
  startPartyPolling();
  startFriendsPolling();
  startTeamPolling();
  authSetupToken = '';
  authModal.hidden = true;
  authModal.setAttribute('aria-hidden', 'true');
  const shouldLaunch = pendingFlightEntry;
  pendingFlightEntry = false;
  document.querySelector('#authCodeForm').reset();
  document.querySelector('#authUsernameForm').reset();
  if (shouldLaunch) enterFlight();
  else showToast('Pilot account verified. Welcome to Xspec.');
}

document.querySelector('#authCodeForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = document.querySelector('#verifyAuthCode');
  button.disabled = true;
  setAuthMessage('Checking your code…');
  try {
    const result = await authRequest('verify-code', {
      email: authEmailAddress,
      code: document.querySelector('#authCode').value.trim(),
    });
    if (result.needsUsername) {
      authSetupToken = result.setupToken;
      document.querySelector('#authCodeForm').hidden = true;
      document.querySelector('#authUsernameForm').hidden = false;
      document.querySelector('#authHeading').textContent = 'Choose your pilot name';
      document.querySelector('#authDescription').textContent = 'Your email is verified. Set a username to finish creating your account.';
      setAuthMessage(result.message || 'Email verified. Choose a username to finish setup.');
      document.querySelector('#authUsername').focus();
    } else {
      finishAuthSignIn(result);
    }
  } catch (error) {
    setAuthMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#authUsernameForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const usernameInput = document.querySelector('#authUsername');
  const validationError = usernameError(usernameInput.value);
  if (validationError) {
    setAuthMessage(validationError, true);
    usernameInput.focus();
    return;
  }
  const button = document.querySelector('#completeAuthSignup');
  button.disabled = true;
  setAuthMessage('Creating your pilot account…');
  try {
    const result = await authRequest('complete-signup', { setupToken: authSetupToken, username: usernameInput.value.trim() });
    finishAuthSignIn(result);
  } catch (error) {
    setAuthMessage(error.message, true);
  } finally {
    button.disabled = false;
  }
});

document.querySelector('#resendAuthCode').addEventListener('click', requestAuthCode);
function restartAuthFlow() {
  authSetupToken = '';
  document.querySelector('#authCodeForm').hidden = true;
  document.querySelector('#authUsernameForm').hidden = true;
  document.querySelector('#authEmailForm').hidden = false;
  document.querySelector('#authHeading').textContent = 'Sign in or create account';
  document.querySelector('#authDescription').textContent = 'Enter your email and we’ll send a secure sign-in code. New pilots choose a username after verifying.';
  document.querySelector('#authEmail').value = authEmailAddress;
  setAuthMessage('');
  document.querySelector('#authEmail').focus();
}
document.querySelector('#changeAuthEmail').addEventListener('click', restartAuthFlow);
document.querySelector('#backToAuthEmail').addEventListener('click', restartAuthFlow);
document.querySelector('#authClose').addEventListener('click', closeAuthModal);
document.querySelector('#authModal').addEventListener('click', (event) => {
  if (event.target === authModal) closeAuthModal();
});
document.querySelector('#accountButton').addEventListener('click', () => openAuthModal('signin'));
document.querySelector('#signOutButton').addEventListener('click', async () => {
  window.clearInterval(partyPollTimer);
  window.clearInterval(gameChatPollTimer);
  partyPollTimer = 0;
  gameChatPollTimer = 0;
  try { await lobbyRequest('leave'); } catch { /* Account logout also removes this pilot from the party. */ }
  try { await authRequest('logout', {}); } catch { /* Clear the local signed-in state either way. */ }
  signedInUser = null;
  updateGameChatUI();
  stopFriendsPolling();
  closeFriendsPanel();
  updatePartyLobby(null);
  updateAccountUI();
  startTeamPolling();
  closeAuthModal();
  showToast('You have signed out.');
});
async function restoreSignedInUser() {
  try {
    const result = await authRequest('me');
    signedInUser = result.user || null;
  } catch { signedInUser = null; }
  updatePartyDroneStage();
  authSessionReady = true;
  updateAccountUI();
  if (signedInUser) {
    startPartyPolling();
    startFriendsPolling();
    startTeamPolling();
  } else {
    stopFriendsPolling();
    updatePartyLobby(null);
    startTeamPolling();
  }
  if (pendingFlightEntry) {
    pendingFlightEntry = false;
    enterFlight();
  }
}
updateAccountUI();
restoreSignedInUser();

function setPage(page) {
  if (page === 'trackPicker' && activeBiome !== 'neon-docks') {
    const built = safeApplyBiome('neon-docks', false);
    if (!built || built.id !== 'neon-docks') return;
  }
  if ((page === 'builder' || page === 'trackPicker') && builtBiomeId !== activeBiome) {
    const built = safeApplyBiome(activeBiome, false);
    if (!built || built.id !== activeBiome) return;
  }
  if (page !== 'builder') setBuilderSettingsOpen(false);
  currentPage = page;
  document.querySelector('#droneSkinPicker').hidden = true;
  document.querySelector('#droneShopPanel').hidden = true;
  document.querySelector('#hangarTopNav').hidden = flying || page === 'builder' || page === 'settings';
  document.querySelectorAll('[data-hangar-tab]').forEach((button) => button.setAttribute('aria-pressed', 'false'));
  updateGameChatUI();
  if (page === 'singleplayer' && gameChatEnabled) void refreshGameChat();
  updateBuilderRelayPodiumGateIndicators();
  updateFlightMainMenuButton();
  if (page === 'builder') updateBuilderAssetLibrary(builderGameMode);
  environmentState = page === 'builder'
    ? readBuilderBiomeEnvironment(activeBiome)
    : readBiomeEnvironment(activeBiome);
  root.classList.toggle('is-flight-settings', flying && page === 'settings');
  if (page === 'trackPicker') showTrackPickerSkyPlatformLabel();
  syncBuilderTransformToolbar();
  syncGateBadgeVisibility();
  document.querySelector('#menu').classList.remove('is-server-expanded');
  document.querySelector('.multiplayer-dashboard')?.classList.remove('is-expanded');
  const hostMatchButton = document.querySelector('#hostMatchButton');
  if (hostMatchButton) {
    hostMatchButton.setAttribute('aria-expanded', 'false');
    hostMatchButton.textContent = 'HOST MATCH';
  }
  if (page === 'communityTracks') {
    renderCommunityTrackPicker();
    void refreshCommunityTracks();
  }
  menuCityRoot.visible = !flying && page !== 'builder';
  customGateObjects.forEach((gate) => { gate.visible = page === 'builder'; });
  root.classList.toggle('is-main-menu', page === 'singleplayer' || page === 'trackPicker' || page === 'multiplayer' || page === 'builderMenu' || page === 'communityTracks');
  root.classList.toggle('is-building', page === 'builder');
  root.classList.toggle('is-environment-overview', page === 'trackPicker');
  document.querySelector('#menu').dataset.page = page;
  const settingsButton = document.querySelector('#settingsButton');
  const settingsOpen = page === 'settings';
  settingsButton.setAttribute('aria-pressed', String(settingsOpen));
  settingsButton.setAttribute('aria-label', settingsOpen ? 'Close settings' : 'Open settings');
  settingsButton.title = settingsOpen ? 'Close settings' : 'Settings';
  panels.forEach((panel) => {
    const active = panel.dataset.panel === page;
    panel.hidden = !active;
    panel.classList.toggle('is-visible', active);
  });
  if (page === 'trackPicker') requestAnimationFrame(updateTrackPickerPreview);
  navButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.page === page));
  partyDroneRoot.visible = flying ? Boolean(partyLobby && partyLobby.members.length > 1) : page !== 'builder';
  updatePartyDroneStage();
  const stageLabels = {
    singleplayer: 'PILOT // SELECT A FLIGHT',
    trackPicker: 'FLIGHT // CHOOSE YOUR COURSE',
    multiplayer: 'NETWORK // CONNECT YOUR CREW',
    builderMenu: 'DESIGN // BUILD A COURSE',
    communityTracks: 'COMMUNITY // FIND YOUR NEXT COURSE',
    builder: 'DESIGN // PLACE OBJECTS',
    settings: 'CONFIGURE // FIND YOUR FEEL',
  };
  document.querySelector('#stageKicker').textContent = stageLabels[page] || stageLabels.singleplayer;
  const selectedMenuPage = page === 'settings' ? pageBeforeSettings : page === 'builder' ? 'builderMenu' : page;
  document.querySelectorAll('[data-menu-choice]').forEach((button) => {
    const selected = button.dataset.menuChoice === selectedMenuPage;
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
  if (page === 'builder') {
    trackRoot.visible = false;
    builderFlightRoot.visible = false;
    defaultGateObjects.forEach((gate) => { gate.visible = false; });
    document.querySelector('.builder-canvas-hud small').textContent = 'CLICK PLACE · DRAG OBJECT MOVE · DRAG FIELD ORBIT · RIGHT-DRAG PAN · SCROLL ROTATE PREVIEW · SCROLL ZOOM WHEN NOT PLACING · WASD/QE MOVE · DELETE REMOVE';
    showDrone.visible = false;
    fieldSpot.visible = false;
    orbit.enabled = true;
    orbit.enablePan = true;
    orbit.minDistance = 10;
    orbit.maxDistance = 420;
    orbit.maxPolarAngle = Math.PI;
    setBuilderCamera();
    if (selectedGateId) selectBuilderGate(selectedGateId);
    if (gatePlacementArmed) updateBuilderGhostPosition(orbit.target);
  } else {
    trackRoot.visible = flying || page === 'trackPicker';
    builderFlightRoot.visible = false;
    defaultGateObjects.forEach((gate) => { gate.visible = flying; });
    builderSelectionHelper.visible = false;
    if (!flying) { showDrone.visible = true; fieldSpot.visible = true; }
    orbit.minDistance = page === 'trackPicker' ? 40 : 22;
    orbit.maxDistance = page === 'trackPicker' ? 420 : 85;
    orbit.maxPolarAngle = Math.PI * 0.48;
    orbit.enablePan = false;
    orbit.enabled = false;
    if (!flying) {
      if (page === 'trackPicker') setTrackOverviewCamera();
      else resetMenuCamera();
    }
  }
  applyEnvironmentToScene();
  syncWorldMode();
  if (page === 'builderMenu') {
    document.querySelector('#builderLaunchBiome').value = 'neon-docks';
    setBuilderGameMode(getSavedBuilderGameMode('neon-docks'), 'neon-docks', false);
  }
  if (page === 'builder') requestAnimationFrame(renderBuilderModelPreviews);
  if (page === 'multiplayer') {
    document.querySelector('#serverBiomeSelect').value = activeBiome;
    renderServerTrackChoices();
    requestAnimationFrame(captureMultiplayerModeTiles);
  }
}

navButtons.forEach((button) => button.addEventListener('click', () => setPage(button.dataset.page)));
document.querySelectorAll('[data-menu-choice]').forEach((button) => button.addEventListener('click', () => {
  const choice = button.dataset.menuChoice;
  if (hasOtherPartyMembers()) {
    if (choice === 'multiplayer' && currentPage !== 'multiplayer') setPage('multiplayer');
    return;
  }
  setPage(['trackPicker', 'multiplayer', 'builderMenu', 'communityTracks'].includes(choice) && currentPage === choice ? 'singleplayer' : choice);
}));
const droneSkinPicker = document.querySelector('#droneSkinPicker');
const droneShopPanel = document.querySelector('#droneShopPanel');
const droneSkinStatus = document.querySelector('#droneSkinStatus');
const droneSkinChoiceButtons = [...document.querySelectorAll('[data-drone-skin]')];
const hangarTopNav = document.querySelector('#hangarTopNav');
const hangarTabButtons = [...document.querySelectorAll('[data-hangar-tab]')];
const droneCountrySelect = document.querySelector('#droneCountrySelect');
const droneSkinCountryName = document.querySelector('#droneSkinCountryName');
const droneSkinCountryPreview = document.querySelector('#droneSkinCountryPreview');
const droneSkinCategory = document.querySelector('#droneSkinCategory');
const droneSkinFreeCollection = document.querySelector('#droneSkinFreeCollection');
const droneSkinPaidCollection = document.querySelector('#droneSkinPaidCollection');
const updateDroneSkinCategory = () => {
  const showPaidSkins = droneSkinCategory.value === 'paid';
  droneSkinFreeCollection.hidden = showPaidSkins;
  droneSkinPaidCollection.hidden = !showPaidSkins;
};
droneSkinCategory.addEventListener('change', updateDroneSkinCategory);
droneCountryCatalog.slice().sort((left, right) => left.name.localeCompare(right.name, 'en')).forEach((country) => {
  droneCountrySelect.add(new Option(country.name, country.code));
});
const updateDroneCountryPreviews = () => {
  const country = droneCountryByCode.get(droneCountryFlagCode) || droneCountryByCode.get('us');
  const flagUrl = new URL(`flags/4x3/${country.code}.svg`, document.baseURI).href;
  droneSkinCountryName.textContent = `${country.name.toUpperCase()} FLAG`;
  droneSkinCountryPreview.src = flagUrl;
};
droneCountrySelect.value = droneCountryFlagCode;
updateDroneCountryPreviews();
droneCountrySelect.addEventListener('change', () => {
  droneCountryFlagCode = droneCountrySelect.value;
  updateDroneCountryPreviews();
  saveSettings();
});
const updateDroneSkinPicker = () => {
  droneSkinChoiceButtons.forEach((button) => {
    const selected = button.dataset.droneSkin === 'country-flag'
      ? droneSkinId.startsWith('country:')
      : button.dataset.droneSkin === droneSkinId;
    button.setAttribute('aria-pressed', String(selected));
  });
  droneSkinStatus.textContent = droneSkinId.startsWith('country:')
    ? `${droneCountryByCode.get(droneCountryFlagCode)?.name.toUpperCase() || 'COUNTRY'} / TOP BODY / SELECTED`
    : 'STANDARD / SELECTED';
};
droneSkinChoiceButtons.forEach((button) => button.addEventListener('click', () => {
  applyDroneSkin(button.dataset.droneSkin, droneCountrySelect.value);
  updateDroneSkinPicker();
  saveSettings();
}));
document.querySelector('#droneSkinClose').addEventListener('click', () => { droneSkinPicker.hidden = true; });
const openHangarTab = (tab) => {
  const showSkins = tab === 'skins';
  droneSkinPicker.hidden = !showSkins;
  droneShopPanel.hidden = showSkins;
  hangarTabButtons.forEach((button) => {
    button.setAttribute('aria-pressed', String(button.dataset.hangarTab === tab));
  });
  updateDroneSkinPicker();
};
hangarTabButtons.forEach((button) => button.addEventListener('click', () => {
  const selectedTab = button.dataset.hangarTab;
  const panelIsOpen = selectedTab === 'skins' ? !droneSkinPicker.hidden : !droneShopPanel.hidden;
  if (panelIsOpen) {
    droneSkinPicker.hidden = true;
    droneShopPanel.hidden = true;
    button.setAttribute('aria-pressed', 'false');
    return;
  }
  openHangarTab(selectedTab);
}));
document.querySelector('#droneShopClose').addEventListener('click', () => { droneShopPanel.hidden = true; });
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape' || (droneSkinPicker.hidden && droneShopPanel.hidden)) return;
  droneSkinPicker.hidden = true;
  droneShopPanel.hidden = true;
  hangarTabButtons.forEach((button) => button.setAttribute('aria-pressed', 'false'));
});
const menuChoiceStrip = document.querySelector('#menuChoiceStrip');
const menuChoiceDrag = { pointerId: null, startX: 0, startScrollLeft: 0, active: false };
let suppressMenuChoiceClick = false;
menuChoiceStrip.addEventListener('wheel', (event) => {
  if (menuChoiceStrip.scrollWidth <= menuChoiceStrip.clientWidth + 1) return;
  const wheelDelta = event.deltaX || event.deltaY;
  if (!wheelDelta) return;
  event.preventDefault();
  menuChoiceStrip.scrollLeft += wheelDelta;
}, { passive: false });
menuChoiceStrip.addEventListener('pointerdown', (event) => {
  if (!event.isPrimary || event.button !== 0 || event.pointerType === 'touch') return;
  menuChoiceDrag.pointerId = event.pointerId;
  menuChoiceDrag.startX = event.clientX;
  menuChoiceDrag.startScrollLeft = menuChoiceStrip.scrollLeft;
  menuChoiceDrag.active = false;
  menuChoiceStrip.classList.add('is-pointer-down');
});
window.addEventListener('pointermove', (event) => {
  if (event.pointerId !== menuChoiceDrag.pointerId) return;
  const distance = event.clientX - menuChoiceDrag.startX;
  if (!menuChoiceDrag.active && Math.abs(distance) > 5) {
    menuChoiceDrag.active = true;
    suppressMenuChoiceClick = true;
    menuChoiceStrip.classList.add('is-dragging');
  }
  if (!menuChoiceDrag.active) return;
  event.preventDefault();
  menuChoiceStrip.scrollLeft = menuChoiceDrag.startScrollLeft - distance;
}, { passive: false });
function endMenuChoiceDrag(event) {
  if (event.pointerId !== menuChoiceDrag.pointerId) return;
  const didDrag = menuChoiceDrag.active;
  menuChoiceDrag.pointerId = null;
  menuChoiceDrag.active = false;
  menuChoiceStrip.classList.remove('is-pointer-down', 'is-dragging');
  if (didDrag) window.setTimeout(() => { suppressMenuChoiceClick = false; }, 0);
}
window.addEventListener('pointerup', endMenuChoiceDrag);
window.addEventListener('pointercancel', endMenuChoiceDrag);
menuChoiceStrip.addEventListener('click', (event) => {
  if (!suppressMenuChoiceClick || !(event.target instanceof Element) || !event.target.closest('.menu-choice')) return;
  event.preventDefault();
  event.stopImmediatePropagation();
}, true);
menuChoiceStrip.addEventListener('dragstart', (event) => event.preventDefault());
document.querySelector('#trackPickerDone').addEventListener('click', () => {
  if (!activeTrack) {
    showToast('No Sky Platform track is available yet. Build a course or select a community track first.');
    return;
  }
  void updatePartyConfig();
  selectedMode = 'Race';
  enterFlight();
});
document.querySelector('#trackLeaderboardButton').addEventListener('click', () => {
  void openTrackLeaderboard();
});
document.querySelector('#trackLeaderboardPrev').addEventListener('click', () => {
  trackLeaderboardPage = Math.max(0, trackLeaderboardPage - 1);
  renderTrackLeaderboardPage();
});
document.querySelector('#trackLeaderboardNext').addEventListener('click', () => {
  trackLeaderboardPage = Math.min(Math.ceil(trackLeaderboardRecords.length / leaderboardPageSize) - 1, trackLeaderboardPage + 1);
  renderTrackLeaderboardPage();
});
document.querySelector('#raceFinishLeaderboardPrev').addEventListener('click', () => {
  raceFinishLeaderboardPage = Math.max(0, raceFinishLeaderboardPage - 1);
  renderRaceFinishLeaderboardPage();
});
document.querySelector('#raceFinishLeaderboardNext').addEventListener('click', () => {
  raceFinishLeaderboardPage = Math.min(Math.ceil(raceFinishLeaderboardRecords.length / leaderboardPageSize) - 1, raceFinishLeaderboardPage + 1);
  renderRaceFinishLeaderboardPage();
});
document.querySelector('#closeTrackLeaderboard').addEventListener('click', () => {
  document.querySelector('#trackLeaderboardDialog').close();
});
document.querySelector('#trackLeaderboardDialog').addEventListener('click', (event) => {
  if (event.target === event.currentTarget) event.currentTarget.close();
});
document.querySelector('#settingsButton').addEventListener('click', () => {
  if (currentPage === 'settings') {
    setPage(pageBeforeSettings);
    return;
  }
  pageBeforeSettings = currentPage;
  if (flying) setSettingsTab('tune');
  setPage('settings');
});
document.querySelector('#closeSettingsPanel').addEventListener('click', () => setPage(pageBeforeSettings));
document.querySelectorAll('[data-open-builder]').forEach((button) => button.addEventListener('click', () => setPage('builderMenu')));
document.querySelector('#builderLaunchMode').addEventListener('change', (event) => {
  setBuilderGameMode(event.currentTarget.value, document.querySelector('#builderLaunchBiome').value);
});
document.querySelector('#openTrackBuilder').addEventListener('click', () => {
  const nextBiome = 'neon-docks';
  const nextMode = document.querySelector('#builderLaunchMode').value;
  if (!biomes[nextBiome]) return;
  if (!Object.hasOwn(builderGameModeLabels, nextMode)) return;
  detachBuilderPropTransform();
  if (nextBiome !== activeBiome || builtBiomeId !== nextBiome) safeApplyBiome(nextBiome);
  customGateObjects.forEach((object) => gateRoot.remove(object));
  builderPropObjects.forEach((object) => builderPropRoot.remove(object));
  builderGates = [];
  customGateObjects = [];
  builderProps = [];
  builderPropObjects = [];
  builderPlacementHistory = [];
  clearBuilderRaceLine();
  selectedGateId = null;
  selectedBuilderPropId = null;
  selectedEnvironmentBuildingId = null;
  builderSelectionHelper.visible = false;
  document.querySelector('#builderTrackName').value = '';
  document.querySelector('#builderLapCount').value = '1';
  builderTrackPicture = '';
  renderBuilderTrackPicture();
  setBuilderGameMode(nextMode, nextBiome);
  renderSavedBuilderTracks();
  setBuilderSaveMessage('Blank course ready. Save it to keep it on this device.');
  document.querySelector('#builderBiomeSelect').value = 'neon-docks';
  setBuilderCamera();
  setPage('builder');
});
document.querySelector('#builderBack').addEventListener('click', () => setPage('builderMenu'));
function setBuilderSettingsOpen(open) {
  const drawer = document.querySelector('#builderSettingsDrawer');
  const button = document.querySelector('#builderSettingsToggle');
  drawer.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
}
document.querySelector('#builderSettingsToggle').addEventListener('click', (event) => {
  setBuilderSettingsOpen(event.currentTarget.getAttribute('aria-expanded') !== 'true');
});
document.querySelector('#builderSettingsClose').addEventListener('click', () => setBuilderSettingsOpen(false));
document.querySelector('#generateBuilderRaceLine').addEventListener('click', generateBuilderRaceLine);
document.querySelector('#deleteBuilderRaceLine').addEventListener('click', () => {
  if (!builderRaceLineGenerated) return;
  if (selectedBuilderRaceLinePointIndex !== null) detachBuilderPropTransform();
  clearBuilderRaceLine();
  builderRaceLineRoot.visible = false;
  document.querySelector('#builderPlacementStatus').textContent = 'SELECT OR CHOOSE AN OBJECT';
  invalidateBuilderTrackPicture();
  updateBuilderDisplay();
  showToast('Race line deleted.');
});

const keys = new Set();
const previousFlightPosition = new THREE.Vector3();
const previousFlightOrientation = new THREE.Quaternion();
let flightCourseEntries = [];
let activeFlightCourseName = '';
let builderTestCourse = false;
let launchPadState = null;
let generatedTrackLaunchPodium = null;
let raceTimerEnabled = false;
let raceTimerStartedAt = 0;
let raceTimerFinishedAt = 0;
let raceFinishLeaderboardTimeout = 0;
let raceFinishLeaderboardSession = 0;
let raceFinishLeaderboardRecords = [];
let raceFinishCurrentRecord = null;
let raceFinishLeaderboardPage = 0;
let trackLeaderboardRecords = [];
let trackLeaderboardPage = 0;
const leaderboardPageSize = 10;
const flight = {
  position: new THREE.Vector3(0, 5, 20),
  velocity: new THREE.Vector3(),
  acceleration: new THREE.Vector3(),
  orientation: new THREE.Quaternion(),
  impactAngularVelocity: new THREE.Vector3(),
  propwashPhase: 0,
  impactAngularStep: new THREE.Quaternion(),
  impactAngularAxis: new THREE.Vector3(),
  bodyAngularVelocity: new THREE.Vector3(),
  previousBodyAngularVelocity: new THREE.Vector3(),
  angularRateTarget: new THREE.Vector3(),
  angularRateError: new THREE.Vector3(),
  angularRateIntegral: new THREE.Vector3(),
  measuredAngularAcceleration: new THREE.Vector3(),
  filteredAngularAcceleration: new THREE.Vector3(),
  pidAngularAcceleration: new THREE.Vector3(),
  motorAngularAcceleration: new THREE.Vector3(),
  angularStep: new THREE.Quaternion(),
  angularAxis: new THREE.Vector3(),
  motorOutput: 0,
  up: new THREE.Vector3(),
  worldUp: new THREE.Vector3(0, 1, 0),
  throttle: 0.54,
  speed: 0,
};
const flightSpawnPosition = new THREE.Vector3();
const flightSpawnOrientation = new THREE.Quaternion();
const cameraAngleQuat = new THREE.Quaternion();
const axisX = new THREE.Vector3(1, 0, 0);
const axisY = new THREE.Vector3(0, 1, 0);
const axisZ = new THREE.Vector3(0, 0, 1);
const flightCameraWorldOffset = new THREE.Vector3();
const flightCameraForward = new THREE.Vector3();
const flightCameraDesiredPosition = new THREE.Vector3();
const flightCameraLookTarget = new THREE.Vector3();
const flightDroneFacingCorrection = new THREE.Quaternion().setFromAxisAngle(axisY, Math.PI);
const flightDroneInverseOrientation = new THREE.Quaternion();
const flightDroneMotorLocalPosition = new THREE.Vector3();
const flightDroneRotorWorldPosition = new THREE.Vector3();
const flightDroneRotorWorldQuaternion = new THREE.Quaternion();
const flightDroneRotorWorldScale = new THREE.Vector3();
let flightCameraNeedsSnap = true;
const flightPropwashForce = new THREE.Vector3();
const flightDamageTorque = new THREE.Vector3();

function syncFlightDroneModelTransform() {
  showDrone.position.copy(flight.position);
  showDrone.quaternion.copy(flight.orientation).multiply(flightDroneFacingCorrection);
}

function updateFlightCamera(dt = 1 / 60) {
  syncFlightDroneModelTransform();
  if (!thirdPersonFlightCamera) {
    if (firstPersonPropsEnabled) {
      setFlightDroneMeshVisibility(true);
      showDrone.visible = true;
    } else {
      setFlightDroneMeshVisibility(false);
      showDrone.visible = false;
    }
    cameraAngleQuat.setFromAxisAngle(axisX, THREE.MathUtils.degToRad(cameraAngle));
    flightCameraWorldOffset.copy(flightCameraModelOffset)
      .multiplyScalar(showDrone.scale.x)
      .applyQuaternion(showDrone.quaternion);
    camera.position.copy(flight.position).add(flightCameraWorldOffset);
    camera.quaternion.copy(flight.orientation).multiply(cameraAngleQuat);
    flightCameraNeedsSnap = true;
    return;
  }

  setFlightDroneMeshVisibility(false);
  showDrone.visible = true;
  flightCameraForward.set(0, 0, -1).applyQuaternion(flight.orientation);
  flightCameraForward.y = 0;
  if (flightCameraForward.lengthSq() < 0.001) flightCameraForward.set(0, 0, -1);
  flightCameraForward.normalize();
  flightCameraDesiredPosition.copy(flight.position)
    .addScaledVector(flightCameraForward, -9.5)
    .addScaledVector(axisY, 3.8);
  flightCameraLookTarget.copy(flight.position)
    .addScaledVector(flightCameraForward, 1.5)
    .addScaledVector(axisY, 0.45);
  if (flightCameraNeedsSnap) {
    camera.position.copy(flightCameraDesiredPosition);
    flightCameraNeedsSnap = false;
  } else {
    camera.position.lerp(flightCameraDesiredPosition, 1 - Math.exp(-dt * 5.5));
  }
  camera.lookAt(flightCameraLookTarget);
}

function setFlightDroneMeshVisibility(showPropsOnly) {
  showDrone.traverse((node) => {
    if (!node.isMesh) return;
    const armMotorIndex = node.userData.isCustomDroneArm ? node.userData.flightMotorIndex : -1;
    const propMotorIndex = node.userData.isDronePropColor ? node.parent?.userData.flightMotorIndex : -1;
    if (armMotorIndex >= 0 && flightDamageState.brokenArms[armMotorIndex]) {
      node.visible = false;
      return;
    }
    if (propMotorIndex >= 0 && flightDamageState.brokenProps[propMotorIndex]) {
      node.visible = false;
      return;
    }
    node.visible = !showPropsOnly || node.userData.isDronePropColor === true;
  });
}

function resetFlightControllerState() {
  flight.impactAngularVelocity.set(0, 0, 0);
  flight.bodyAngularVelocity.set(0, 0, 0);
  flight.previousBodyAngularVelocity.set(0, 0, 0);
  flight.angularRateTarget.set(0, 0, 0);
  flight.angularRateError.set(0, 0, 0);
  flight.angularRateIntegral.set(0, 0, 0);
  flight.measuredAngularAcceleration.set(0, 0, 0);
  flight.filteredAngularAcceleration.set(0, 0, 0);
  flight.pidAngularAcceleration.set(0, 0, 0);
  flight.motorAngularAcceleration.set(0, 0, 0);
  flight.motorOutput = 0;
  flight.propwashPhase = 0;
}

function makeFlightDamageTexture(kind) {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const gradient = context.createRadialGradient(64, 64, 2, 64, 64, 62);
  if (kind === 'fire') {
    gradient.addColorStop(0, 'rgba(255, 250, 193, 1)');
    gradient.addColorStop(0.18, 'rgba(255, 207, 70, 0.96)');
    gradient.addColorStop(0.46, 'rgba(255, 91, 25, 0.7)');
    gradient.addColorStop(1, 'rgba(146, 22, 10, 0)');
  } else {
    gradient.addColorStop(0, 'rgba(27, 31, 36, 0.82)');
    gradient.addColorStop(0.36, 'rgba(55, 60, 66, 0.58)');
    gradient.addColorStop(0.72, 'rgba(77, 81, 87, 0.24)');
    gradient.addColorStop(1, 'rgba(84, 86, 89, 0)');
  }
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function spawnDetachedDronePart(motorIndex, part, impactNormal = null, includePropeller = true) {
  syncFlightDroneModelTransform();
  showDrone.updateMatrixWorld(true);
  const rotor = propellers.find((candidate) => candidate.userData.flightMotorIndex === motorIndex);
  if (!rotor || (part === 'prop' && !rotor.visible)) return;
  const armRecord = part === 'arm'
    ? flightArmDamageMeshes.find(({ arms }) => arms.some((arm) => arm.motorIndex === motorIndex))
    : null;
  rotor.updateWorldMatrix(true, false);
  rotor.getWorldPosition(flightDroneRotorWorldPosition);
  rotor.getWorldQuaternion(flightDroneRotorWorldQuaternion);
  rotor.getWorldScale(flightDroneRotorWorldScale);
  const debris = new THREE.Group();
  debris.name = part === 'arm' ? 'Detached selected drone motor assembly' : 'Detached selected drone propeller';
  debris.position.copy(flightDroneRotorWorldPosition);
  const detachedRotor = rotor.clone(true);
  detachedRotor.position.set(0, 0, 0);
  detachedRotor.quaternion.copy(flightDroneRotorWorldQuaternion);
  detachedRotor.scale.copy(flightDroneRotorWorldScale);
  detachedRotor.userData.spinBaseQuaternion = detachedRotor.quaternion.clone();
  detachedRotor.userData.spinAngle = 0;
  detachedRotor.visible = true;
  detachedRotor.traverse((node) => {
    if (node.isMesh && node.geometry) node.geometry = node.geometry.clone();
    if (!node.isMesh) return;
    node.visible = part !== 'prop' || node.userData.isDronePropColor === true;
  });
  debris.add(detachedRotor);
  if (armRecord) {
    const armSource = armRecord.mesh;
    armSource.updateWorldMatrix(true, false);
    const detachedArm = armSource.clone(true);
    detachedArm.position.copy(armSource.getWorldPosition(new THREE.Vector3())).sub(debris.position);
    detachedArm.quaternion.copy(armSource.getWorldQuaternion(new THREE.Quaternion()));
    detachedArm.scale.copy(armSource.getWorldScale(new THREE.Vector3()));
    detachedArm.visible = true;
    detachedArm.traverse((node) => {
      if (node.isMesh && node.geometry) node.geometry = node.geometry.clone();
      node.visible = true;
    });
    debris.add(detachedArm);
    armSource.visible = false;
  }
  flightDebrisRoot.add(debris);
  if (part === 'arm') rotor.visible = false;
  else rotor.traverse((node) => {
    if (node.isMesh && node.userData.isDronePropColor) node.visible = false;
  });

  const outward = flightDroneRotorWorldPosition.clone().sub(flight.position);
  outward.y = 0;
  if (outward.lengthSq() > 0.001) outward.normalize();
  if (impactNormal) outward.addScaledVector(impactNormal, 0.3).normalize();
  const impactOffset = flightDroneRotorWorldPosition.clone().sub(flight.position);
  const inheritedSpinVelocity = flight.impactAngularVelocity.clone().cross(impactOffset).multiplyScalar(0.45);
  const velocity = flight.velocity.clone().multiplyScalar(0.82)
    .add(inheritedSpinVelocity)
    .addScaledVector(outward, 2.5 + Math.random() * 1.5);
  velocity.y += 0.9 + Math.random() * 0.9;
  flightDebris.push({
    object: debris,
    rotor: detachedRotor,
    rotorSpinSpeed: motorIndex % 2 ? -15 : 15,
    velocity,
    rotationSpeed: flight.impactAngularVelocity.clone().multiplyScalar(0.55).add(new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 8,
    )),
    settled: false,
    ownsGeometry: true,
  });
}

function breakFlightPropeller(motorIndex, impactNormal) {
  if (motorIndex < 0 || flightDamageState.brokenProps[motorIndex]) return;
  flightDamageState.brokenProps[motorIndex] = true;
  flight.throttle = 0;
  flight.motorOutput = 0;
  spawnDetachedDronePart(motorIndex, 'prop', impactNormal);
  showToast('Propeller snapped off. Flight control is damaged.');
}

function breakFlightArm(motorIndex, impactNormal) {
  if (motorIndex < 0 || flightDamageState.brokenArms[motorIndex]) return;
  const motorAssemblyStillAttached = !flightDamageState.brokenProps[motorIndex];
  flightDamageState.brokenArms[motorIndex] = true;
  flightDamageState.brokenProps[motorIndex] = true;
  flight.throttle = 0;
  flight.motorOutput = 0;
  deformFlightArmsForDestruction();
  spawnDetachedDronePart(motorIndex, 'arm', impactNormal, motorAssemblyStillAttached);
  showToast('Drone arm broke off as a single damaged assembly. Flight control is severely damaged.');
}

function spawnFlightDamageParticle(kind) {
  const texture = kind === 'fire'
    ? (flightFireTexture ||= makeFlightDamageTexture('fire'))
    : (flightSmokeTexture ||= makeFlightDamageTexture('smoke'));
  if (!texture) return;
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(flight.orientation).normalize();
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(flight.orientation).normalize();
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    color: kind === 'fire' ? 0xffb944 : 0xd0d5d9,
    transparent: true,
    opacity: kind === 'fire' ? 0.9 : 0.64,
    depthWrite: false,
    depthTest: false,
    toneMapped: false,
    blending: kind === 'fire' ? THREE.AdditiveBlending : THREE.NormalBlending,
  }));
  const baseScale = kind === 'fire' ? 0.45 + Math.random() * 0.42 : 0.72 + Math.random() * 0.6;
  sprite.position.copy(flight.position)
    .addScaledVector(forward, 3 + Math.random() * 1.2)
    .addScaledVector(right, (Math.random() - 0.5) * 2.2)
    .add(new THREE.Vector3(0, 0.15 + Math.random() * 0.9, 0));
  sprite.scale.setScalar(baseScale);
  sprite.renderOrder = 24;
  flightDamageEffectsRoot.add(sprite);
  flightDamageParticles.push({
    sprite,
    kind,
    velocity: new THREE.Vector3((Math.random() - 0.5) * 0.75, kind === 'fire' ? 1.6 : 0.7, (Math.random() - 0.5) * 0.75),
    age: 0,
    life: kind === 'fire' ? 0.55 + Math.random() * 0.45 : 2.1 + Math.random() * 1.4,
    baseScale,
    baseOpacity: kind === 'fire' ? 0.9 : 0.64,
  });
  if (flightDamageParticles.length > 140) {
    const oldest = flightDamageParticles.shift();
    oldest.sprite.parent?.remove(oldest.sprite);
    oldest.sprite.material.dispose();
  }
}

function beginFlightFireCrash() {
  if (flightDamageState.crashed) return;
  flightDamageState.burning = true;
  flightDamageState.crashed = true;
  destroyedFlightWasGrounded = false;
  flight.throttle = 0;
  flight.motorOutput = 0;
  deformFlightArmsForDestruction();
  for (let index = 0; index < 12; index += 1) spawnFlightDamageParticle('fire');
  for (let index = 0; index < 8; index += 1) spawnFlightDamageParticle('smoke');
  showToast('CRITICAL DAMAGE. Motors shut down; drone is falling apart.');
}

function applyFlightImpactDamage(impact) {
  if (!impact || impact.speed < flightDamageMinimumImpactSpeed || flightDamageState.crashed) return;
  const now = performance.now();
  if (now - flightDamageState.lastImpactAt < 220) return;
  flightDamageState.lastImpactAt = now;
  flightDamageState.damage = Math.min(100, flightDamageState.damage + THREE.MathUtils.clamp((impact.speed - flightDamageMinimumImpactSpeed) * 4.6 + 3, 3, 42));

  if (impact.part === 'prop' && impact.speed >= flightPropellerBreakImpactSpeed && impact.motorIndex >= 0) {
    breakFlightPropeller(impact.motorIndex, impact.normal);
  }
  if ((impact.part === 'arm' || impact.part === 'prop') && impact.speed >= flightArmBreakImpactSpeed && impact.motorIndex >= 0) {
    breakFlightArm(impact.motorIndex, impact.normal);
  }
  if (impact.speed >= flightFireCrashImpactSpeed || flightDamageState.damage >= 100) {
    beginFlightFireCrash();
  } else if (flightDamageState.damage >= flightSmokeDamageThreshold && !flightDamageState.burning) {
    showToast('Drone critically damaged. Smoke is coming from the frame.');
  }
  updateFlightDamageIndicator();
}

function updateFlightDamageEffects(dt) {
  if (flightDamageState.damage >= flightSmokeDamageThreshold || flightDamageState.burning) {
    flightDamageState.smokeSpawnTime += dt;
    while (flightDamageState.smokeSpawnTime >= 0.18) {
      flightDamageState.smokeSpawnTime -= 0.18;
      spawnFlightDamageParticle('smoke');
    }
  }
  if (flightDamageState.burning) {
    flightDamageState.fireSpawnTime += dt;
    while (flightDamageState.fireSpawnTime >= 0.07) {
      flightDamageState.fireSpawnTime -= 0.07;
      spawnFlightDamageParticle('fire');
    }
  }

  for (let index = flightDamageParticles.length - 1; index >= 0; index -= 1) {
    const particle = flightDamageParticles[index];
    particle.age += dt;
    if (particle.age >= particle.life) {
      particle.sprite.parent?.remove(particle.sprite);
      particle.sprite.material.dispose();
      flightDamageParticles.splice(index, 1);
      continue;
    }
    const progress = particle.age / particle.life;
    particle.sprite.position.addScaledVector(particle.velocity, dt);
    particle.velocity.y += (particle.kind === 'fire' ? 0.25 : 0.12) * dt;
    particle.sprite.material.opacity = particle.baseOpacity * (1 - progress) * (particle.kind === 'fire' ? 1 : 0.84);
    particle.sprite.scale.setScalar(particle.baseScale * (particle.kind === 'smoke' ? 1 + progress * 1.6 : 1 - progress * 0.36));
  }

  for (let index = flightDebris.length - 1; index >= 0; index -= 1) {
    const piece = flightDebris[index];
    if (piece.settled) continue;
    piece.velocity.y -= 9.81 * dt;
    piece.velocity.multiplyScalar(Math.exp(-0.045 * dt));
    piece.rotationSpeed.multiplyScalar(Math.exp(-0.12 * dt));
    if (piece.rotor && Math.abs(piece.rotorSpinSpeed) > 0.08) {
      spinDroneRotor(piece.rotor, dt * piece.rotorSpinSpeed);
      piece.rotorSpinSpeed *= Math.exp(-0.42 * dt);
    }
    piece.object.position.addScaledVector(piece.velocity, dt);
    piece.object.rotation.x += piece.rotationSpeed.x * dt;
    piece.object.rotation.y += piece.rotationSpeed.y * dt;
    piece.object.rotation.z += piece.rotationSpeed.z * dt;
    const groundY = flightDebrisGroundYAt(piece.object.position.x, piece.object.position.z);
    if (groundY <= -9990) continue;
    piece.object.updateWorldMatrix(true, true);
    flightDebrisGroundBounds.setFromObject(piece.object);
    if (flightDebrisGroundBounds.min.y <= groundY + 0.005) {
      piece.object.position.y += groundY + 0.006 - flightDebrisGroundBounds.min.y;
      piece.velocity.x *= 0.72;
      piece.velocity.z *= 0.72;
      piece.velocity.y = Math.abs(piece.velocity.y) * 0.24;
      piece.rotationSpeed.multiplyScalar(0.68);
      piece.rotorSpinSpeed *= 0.68;
      if (piece.velocity.lengthSq() < 0.09
        && piece.rotationSpeed.lengthSq() < 0.64
        && Math.abs(piece.rotorSpinSpeed) < 0.5) {
        piece.velocity.set(0, 0, 0);
        piece.rotationSpeed.set(0, 0, 0);
        piece.rotorSpinSpeed = 0;
        piece.settled = true;
      }
    }
  }
}

function clearFlightDamageVisuals() {
  flightDamageParticles.forEach(({ sprite }) => {
    sprite.material.dispose();
    sprite.parent?.remove(sprite);
  });
  flightDamageParticles.length = 0;
  flightDebris.forEach(({ object }) => {
    object.traverse((child) => child.geometry?.dispose());
    object.parent?.remove(object);
  });
  flightDebris.length = 0;
}

function updateFlightDamageIndicator() {
  const panel = document.querySelector('#flightDamageIndicator');
  const list = document.querySelector('#flightDamageStatusList');
  if (!panel || !list) return;
  const damagedArms = flightDamageState.brokenArms.filter(Boolean).length;
  const bentPropellers = flightDamageState.brokenProps.reduce((count, broken, index) =>
    count + (broken && !flightDamageState.brokenArms[index] ? 1 : 0), 0);
  const statuses = [];
  if (bentPropellers || (flightDamageState.damage > 0 && damagedArms === 0 && !flightDamageState.crashed)) {
    statuses.push({
      kind: 'propeller',
      label: 'PROPELLER BENT',
      detail: bentPropellers ? `${bentPropellers} ROTOR${bentPropellers === 1 ? '' : 'S'}` : 'IMPACT DAMAGE',
    });
  }
  if (damagedArms) {
    statuses.push({ kind: 'arm', label: 'ARM CRACKED', detail: `${damagedArms} ARM${damagedArms === 1 ? '' : 'S'}` });
  }
  if (flightDamageState.crashed) statuses.push({ kind: 'critical', label: 'COMPLETE DESTRUCTION', detail: 'MOTORS OFF' });

  const signature = statuses.map(({ kind, label, detail }) => `${kind}:${label}:${detail}`).join('|');
  if (panel.dataset.statusSignature !== signature) {
    list.replaceChildren();
    statuses.forEach(({ kind, label, detail }) => {
      const row = document.createElement('li');
      row.className = 'flight-damage-row';
      row.dataset.kind = kind;
      const marker = document.createElement('i');
      marker.setAttribute('aria-hidden', 'true');
      const name = document.createElement('span');
      name.textContent = label;
      const note = document.createElement('b');
      note.textContent = detail;
      row.append(marker, name, note);
      list.append(row);
    });
    panel.dataset.statusSignature = signature;
  }
  panel.hidden = !flying || statuses.length === 0;
}

function resetFlightDamage() {
  clearFlightDamageVisuals();
  resetFlightArmDeformation();
  flightArmDamageMeshes.forEach(({ mesh }) => { mesh.visible = true; });
  propellers.forEach((rotor) => {
    rotor.visible = true;
    rotor.traverse((node) => {
      if (node.isMesh && node.userData.isDronePropColor) node.visible = true;
    });
  });
  flightDamageState.damage = 0;
  flightDamageState.brokenProps.fill(false);
  flightDamageState.brokenArms.fill(false);
  flightDamageState.burning = false;
  flightDamageState.crashed = false;
  destroyedFlightWasGrounded = false;
  flightDamageState.lastImpactAt = 0;
  flightDamageState.smokeSpawnTime = 0;
  flightDamageState.fireSpawnTime = 0;
  refreshFlightGroundSupportOffsets();
  updateFlightDamageIndicator();
}

function flightAvailableMotorRatio() {
  return flightDamageState.brokenProps.reduce((available, broken) => available + (broken ? 0 : 1), 0) / 4;
}

const builderGateFlightCenterY = 2.1;

function updateCourseProgress(nextIndex, complete = false) {
  routeProgress = nextIndex;
  const panel = document.querySelector('#courseProgress');
  if (!panel) return;
  panel.hidden = !flying || flightCourseEntries.length === 0;
  const completedLaps = flightCourseEntries.slice(0, nextIndex).filter((entry) => entry.isLapFinish).length;
  const currentLap = complete ? flightCourseLapCount : Math.min(flightCourseLapCount, completedLaps + 1);
  document.querySelector('#courseProgressCount').textContent = `Lap: ${currentLap}/${flightCourseLapCount}`;
  if (selectedMode === 'Race' || builderTestCourse) {
    document.querySelector('#flightPrompt').textContent = complete
      ? 'COURSE COMPLETE. NICE LINE.'
      : `FLY THROUGH THE GREEN ${flightCourseEntries[nextIndex]?.role || 'GATE'}.`;
  }
  if (complete && raceTimerEnabled) {
    raceTimerFinishedAt = performance.now();
    updateRaceTimerDisplay(raceTimerFinishedAt);
    showRaceFinishLeaderboard({
      timeMs: Math.max(0, raceTimerFinishedAt - raceTimerStartedAt),
      mode: isMultiplayerRaceActive() ? 'MULTIPLAYER' : 'SOLO',
    });
  }
  updateRaceLeaderboard();
}

function soloTrackLeaderboardKey(track = activeTrack) {
  if (!track?.id) return '';
  return `${activeBiome}:${track.id}:${signedInUser?.id || 'guest'}`;
}

function formatSoloRaceTime(timeMs) {
  const elapsed = Math.max(0, Number(timeMs) || 0);
  const minutes = Math.floor(elapsed / 60_000).toString().padStart(2, '0');
  const seconds = ((elapsed % 60_000) / 1000).toFixed(2).padStart(5, '0');
  return `${minutes}:${seconds}`;
}

function saveSoloTrackRaceTime(timeMs) {
  const key = soloTrackLeaderboardKey();
  if (!signedInUser || builderTestCourse || !key || !Number.isFinite(timeMs) || timeMs <= 0) return null;
  const run = {
    username: signedInUser.username,
    timeMs: Math.round(timeMs),
    completedAt: Date.now(),
  };
  const ranked = [...(soloTrackLeaderboardData[key] || []), run]
    .sort((a, b) => a.timeMs - b.timeMs || a.completedAt - b.completedAt);
  const place = ranked.indexOf(run) + 1;
  soloTrackLeaderboardData[key] = ranked.slice(0, 10);
  let persisted = true;
  try { localStorage.setItem(soloTrackLeaderboardStorageKey, JSON.stringify(soloTrackLeaderboardData)); }
  catch { persisted = false; }
  return { place, persisted };
}

function localTrackLeaderboardRecords(track = activeTrack) {
  if (!signedInUser) return [];
  const runs = soloTrackLeaderboardData[soloTrackLeaderboardKey(track)] || [];
  return runs.map((run) => ({
    username: run.username,
    userId: signedInUser.id,
    timeMs: run.timeMs,
    isLocal: true,
  }));
}

function mergeTrackLeaderboardRecords(...groups) {
  const byPilot = new Map();
  groups.flat().forEach((record) => {
    if (!record || typeof record.username !== 'string' || !Number.isFinite(Number(record.timeMs)) || Number(record.timeMs) <= 0) return;
    const key = record.userId || (record.isLocal && signedInUser?.id)
      || record.username.trim().toLocaleLowerCase();
    if (!key) return;
    const previous = byPilot.get(key);
    const next = { username: record.username.trim(), timeMs: Math.round(Number(record.timeMs)), isLocal: Boolean(record.isLocal) };
    if (!previous || next.timeMs < previous.timeMs) byPilot.set(key, { ...next, isLocal: next.isLocal || Boolean(previous?.isLocal) });
    else if (next.isLocal && !previous.isLocal) byPilot.set(key, { ...previous, isLocal: true });
  });
  return [...byPilot.values()].sort((a, b) => a.timeMs - b.timeMs || a.username.localeCompare(b.username));
}

async function requestTrackLeaderboard(track, submitTimeMs = null) {
  if (!track?.id) return [];
  const biomeId = track.biomeId || track.environmentId || activeBiome;
  const query = new URLSearchParams({ biomeId, trackId: track.id });
  const options = Number.isFinite(submitTimeMs) && signedInUser
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ biomeId, trackId: track.id, timeMs: Math.round(submitTimeMs) }), credentials: 'same-origin' }
    : { method: 'GET', credentials: 'same-origin' };
  const response = await fetch(options.method === 'POST' ? '/api/track-leaderboard' : `/api/track-leaderboard?${query}`, options);
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Track leaderboard is unavailable.');
  return Array.isArray(result.records) ? result.records : [];
}

function renderLeaderboardPage({ records, page, rowsId, emptyId, pagerId, pageId, prevId, nextId }) {
  const rows = document.querySelector(rowsId);
  const empty = document.querySelector(emptyId);
  const pager = document.querySelector(pagerId);
  if (!rows || !empty || !pager) return;
  const pageCount = Math.max(1, Math.ceil(records.length / leaderboardPageSize));
  const safePage = Math.max(0, Math.min(page, pageCount - 1));
  rows.replaceChildren();
  const firstIndex = safePage * leaderboardPageSize;
  records.slice(firstIndex, firstIndex + leaderboardPageSize).forEach((record, index) => {
    const row = document.createElement('li');
    row.className = `race-leaderboard-row${firstIndex + index === 0 ? ' is-leading' : ''}${record.isLocal ? ' is-local' : ''}`;
    const place = document.createElement('b');
    place.className = 'race-leaderboard-place';
    place.textContent = String(firstIndex + index + 1);
    const name = document.createElement('span');
    name.className = 'race-leaderboard-name';
    name.textContent = record.username || 'Pilot';
    const time = document.createElement('small');
    time.className = 'race-leaderboard-progress';
    time.textContent = formatSoloRaceTime(record.timeMs);
    row.append(place, name, time);
    rows.append(row);
  });
  empty.hidden = records.length > 0;
  pager.hidden = pageCount <= 1;
  document.querySelector(pageId).textContent = `PAGE ${safePage + 1} / ${pageCount}`;
  document.querySelector(prevId).disabled = safePage === 0;
  document.querySelector(nextId).disabled = safePage >= pageCount - 1;
}

function renderTrackLeaderboardPage() {
  trackLeaderboardPage = Math.max(0, Math.min(trackLeaderboardPage, Math.ceil(trackLeaderboardRecords.length / leaderboardPageSize) - 1));
  renderLeaderboardPage({
    records: trackLeaderboardRecords,
    page: trackLeaderboardPage,
    rowsId: '#trackLeaderboardRows',
    emptyId: '#trackLeaderboardEmpty',
    pagerId: '#trackLeaderboardPager',
    pageId: '#trackLeaderboardPage',
    prevId: '#trackLeaderboardPrev',
    nextId: '#trackLeaderboardNext',
  });
}

function renderRaceFinishLeaderboardPage() {
  raceFinishLeaderboardPage = Math.max(0, Math.min(raceFinishLeaderboardPage, Math.ceil(raceFinishLeaderboardRecords.length / leaderboardPageSize) - 1));
  renderLeaderboardPage({
    records: raceFinishLeaderboardRecords,
    page: raceFinishLeaderboardPage,
    rowsId: '#raceFinishLeaderboardRows',
    emptyId: '#raceFinishLeaderboardEmpty',
    pagerId: '#raceFinishLeaderboardPager',
    pageId: '#raceFinishLeaderboardPage',
    prevId: '#raceFinishLeaderboardPrev',
    nextId: '#raceFinishLeaderboardNext',
  });
}

async function openTrackLeaderboard() {
  const track = activeTrack;
  if (!track) return;
  document.querySelector('#trackLeaderboardTrackName').textContent = track.name || 'Selected track';
  trackLeaderboardPage = 0;
  trackLeaderboardRecords = mergeTrackLeaderboardRecords(localTrackLeaderboardRecords(track));
  renderTrackLeaderboardPage();
  const dialog = document.querySelector('#trackLeaderboardDialog');
  if (!dialog.open) dialog.showModal();
  try {
    const records = await requestTrackLeaderboard(track);
    if (activeTrack?.id !== track.id || !dialog.open) return;
    trackLeaderboardRecords = mergeTrackLeaderboardRecords(records, localTrackLeaderboardRecords(track));
    trackLeaderboardPage = 0;
    renderTrackLeaderboardPage();
  } catch { /* Keep this device's records available if the online service is offline. */ }
}

function hideRaceFinishLeaderboard() {
  if (raceFinishLeaderboardTimeout) window.clearTimeout(raceFinishLeaderboardTimeout);
  raceFinishLeaderboardTimeout = 0;
  raceFinishLeaderboardSession += 1;
  const panel = document.querySelector('#raceFinishLeaderboard');
  if (panel) panel.hidden = true;
}

function refreshRaceFinishLeaderboard() {
  const panel = document.querySelector('#raceFinishLeaderboard');
  const track = activeTrack;
  const session = raceFinishLeaderboardSession;
  if (!panel || panel.hidden || !track?.id) return;
  void requestTrackLeaderboard(track).then((records) => {
    if (session !== raceFinishLeaderboardSession || panel.hidden) return;
    raceFinishLeaderboardRecords = mergeTrackLeaderboardRecords(records, localTrackLeaderboardRecords(track), raceFinishCurrentRecord ? [raceFinishCurrentRecord] : []);
    renderRaceFinishLeaderboardPage();
  }).catch(() => {});
}

function showRaceFinishLeaderboard({ timeMs, mode }) {
  if (!raceTimerEnabled || !raceTimerStartedAt || !Number.isFinite(timeMs) || timeMs <= 0) return;
  const panel = document.querySelector('#raceFinishLeaderboard');
  if (!panel) return;
  if (raceFinishLeaderboardTimeout) window.clearTimeout(raceFinishLeaderboardTimeout);
  raceFinishLeaderboardSession += 1;
  const session = raceFinishLeaderboardSession;
  raceFinishLeaderboardPage = 0;
  const track = activeTrack;
  const trackName = track?.name || activeFlightCourseName || 'Selected track';
  document.querySelector('#raceFinishLeaderboardHeading').textContent = `${mode} LEADERBOARD`;
  document.querySelector('#raceFinishLeaderboardTrack').textContent = trackName;
  raceFinishCurrentRecord = signedInUser ? {
    username: signedInUser.username,
    userId: signedInUser.id,
    timeMs: Math.round(timeMs),
    isLocal: true,
  } : null;
  if (mode === 'SOLO') saveSoloTrackRaceTime(timeMs);
  const localRecords = localTrackLeaderboardRecords(track);
  raceFinishLeaderboardRecords = mergeTrackLeaderboardRecords(localRecords, [raceFinishCurrentRecord]);
  panel.hidden = false;
  renderRaceFinishLeaderboardPage();
  raceFinishLeaderboardTimeout = window.setTimeout(hideRaceFinishLeaderboard, 5000);
  if (!track?.id) return;
  void requestTrackLeaderboard(track, mode === 'SOLO' ? timeMs : null).then((records) => {
    if (session !== raceFinishLeaderboardSession || panel.hidden) return;
    raceFinishLeaderboardRecords = mergeTrackLeaderboardRecords(records, localRecords, [raceFinishCurrentRecord]);
    renderRaceFinishLeaderboardPage();
  }).catch(() => {});
}

function isMultiplayerRaceActive() {
  const activePhases = ['starting', 'grid', 'race', 'racing'];
  const activeStatuses = ['starting', 'grid', 'racing'];
  return activePhases.includes(partyRacePhase) || activeStatuses.includes(partyLobby?.status);
}

function updateFlightMainMenuButton() {
  flightMainMenuButton.hidden = !(flying && !partyLobby?.code && !hasOtherPartyMembers() && !isMultiplayerRaceActive());
}

function updateRaceTimerDisplay(now = performance.now()) {
  const panel = document.querySelector('#raceTimer');
  if (!panel) return;
  panel.hidden = !flying || !raceTimerEnabled;
  panel.classList.toggle('is-local-race', raceTimerEnabled && !isMultiplayerRaceActive());
  if (panel.hidden) return;
  const label = document.querySelector('#raceTimerLabel');
  const value = document.querySelector('#raceTimerValue');
  if (!raceTimerStartedAt) {
    label.textContent = 'LAUNCH OFF PODIUM TO START';
    value.textContent = 'BLOCK';
    return;
  }
  const stoppedAt = raceTimerFinishedAt || now;
  const elapsed = Math.max(0, stoppedAt - raceTimerStartedAt);
  const minutes = Math.floor(elapsed / 60_000).toString().padStart(2, '0');
  const seconds = ((elapsed % 60_000) / 1000).toFixed(2).padStart(5, '0');
  label.textContent = partyLobby?.gameMode === 'relay-race'
    ? raceTimerFinishedAt ? 'PILOT SPLIT' : 'LEG TIME'
    : raceTimerFinishedAt ? 'FINISH TIME' : 'RACE TIME';
  value.textContent = `${minutes}:${seconds}`;
}

function makeFlightGateEntry(gate, role, radius = 2.05, indicator = null, centerY = 0, routeNumber = null, isStartFinish = false) {
  const marker = indicator || createGateIndicator(gate);
  return {
    object: gate,
    indicator: marker,
    radius,
    centerY,
    role,
    routeNumber,
    isStartFinish,
    passed: false,
  };
}

function getRacePodiumModel(podium, modelIndex = 0) {
  const launchModels = [];
  podium.traverse((object) => {
    if (object.userData.isRedRacePodiumModel) launchModels.push(object);
  });
  return launchModels[modelIndex] || launchModels[0] || podium;
}

function getRacePodiumLaunchYaw(podium, modelIndex = 0) {
  const launchModel = getRacePodiumModel(podium, modelIndex);
  launchModel.updateWorldMatrix(true, false);
  return new THREE.Euler().setFromQuaternion(launchModel.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
}

function orderedRelayStationPodiumObjects(gateEntries, userPodiumObjects) {
  const availablePodiums = userPodiumObjects.filter((object) => object.userData.propType === 'relay-podium-gate').slice();
  const stations = [];
  for (const entry of gateEntries.slice(0, RELAY_STATION_COUNT)) {
    entry.object.updateWorldMatrix(true, false);
    const gatePosition = entry.object.getWorldPosition(new THREE.Vector3());
    let nearestIndex = -1;
    let nearestDistance = Infinity;
    availablePodiums.forEach((podium, index) => {
      podium.updateWorldMatrix(true, false);
      const position = podium.getWorldPosition(new THREE.Vector3());
      const distance = Math.hypot(gatePosition.x - position.x, gatePosition.z - position.z);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    if (nearestIndex < 0 || nearestDistance > RELAY_GATE_PODIUM_DISTANCE) return [];
    const podium = availablePodiums.splice(nearestIndex, 1)[0];
    const planeIndex = Number.isInteger(entry.planeIndex) ? entry.planeIndex : 0;
    const plane = entry.object.userData.gatePassPlanes?.[planeIndex];
    const gateData = entry.object.userData.gateData;
    const entryDirection = gateData?.entryDirections?.[planeIndex] ?? gateData?.entryDirection ?? 1;
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(entry.object.matrixWorld);
    const approachNormal = plane
      ? plane.normal.clone().applyMatrix3(normalMatrix).normalize()
      : new THREE.Vector3(0, 0, 1).applyQuaternion(entry.object.getWorldQuaternion(new THREE.Quaternion()));
    approachNormal.y = 0;
    if (approachNormal.lengthSq() < 0.001) approachNormal.set(0, 0, 1);
    approachNormal.normalize().multiplyScalar(entryDirection === -1 ? -1 : 1);

    const gateFront = plane
      ? plane.point.clone().applyMatrix4(entry.object.matrixWorld)
      : entry.object.getWorldPosition(new THREE.Vector3());
    const podiumWorldPosition = gateFront;
    podiumWorldPosition.y = terrainSurfaceYAt(activeBiome, podiumWorldPosition.x, podiumWorldPosition.z);

    const podiumParent = podium.parent;
    if (podiumParent) {
      podiumParent.updateWorldMatrix(true, false);
      podium.position.copy(podiumParent.worldToLocal(podiumWorldPosition));
      const parentWorldQuaternion = podiumParent.getWorldQuaternion(new THREE.Quaternion());
      const podiumWorldYaw = Math.atan2(approachNormal.x, approachNormal.z);
      const desiredWorldQuaternion = new THREE.Quaternion().setFromAxisAngle(axisY, podiumWorldYaw);
      podium.quaternion.copy(parentWorldQuaternion.invert().multiply(desiredWorldQuaternion));
      podium.updateWorldMatrix(false, true);
    }
    stations.push(podium);
  }
  return stations;
}

function setupRaceLaunchPodium(startEntry, parent, userPodiumObjects = [], gridSlot = 0) {
  if (!startEntry?.object || !parent) return null;
  startEntry.object.updateWorldMatrix(true, false);
  const gatePosition = startEntry.object.getWorldPosition(new THREE.Vector3());
  const gateRotation = startEntry.object.getWorldQuaternion(new THREE.Quaternion());
  const approachNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(gateRotation);
  approachNormal.y = 0;
  if (approachNormal.lengthSq() < 0.001) approachNormal.set(0, 0, 1);
  approachNormal.normalize();

  const podiums = userPodiumObjects.filter((object) =>
    object.userData.propType === 'podium' || object.userData.propType === 'relay-podium-gate')
    .sort((a, b) => Number(b.userData.isLaunchPodium) - Number(a.userData.isLaunchPodium));
  const relayStationPodiumUsernames = partyLobby?.gameMode === 'relay-race'
    ? Array.from({ length: RELAY_STATION_COUNT }, (_, station) => [0, 1].map((teamIndex) => partyLobby.members
      .filter((member) => Number(member.relayStation) === station && Number(member.relayTeam) === teamIndex)
      .map((member) => member.username)
      .filter(Boolean)
      .join(' / ')))
    : null;
  const podiumUsernames = relayStationPodiumUsernames
    ? relayStationPodiumUsernames.map((usernames) => usernames.filter(Boolean).join(' / '))
    : partyLobby?.members?.length
      ? partyLobby.members.map((member) => member.username || '')
      : [signedInUser?.username || ''];
  podiums.forEach((candidate, index) => {
    if (relayStationPodiumUsernames && candidate.userData.propType === 'relay-podium-gate') {
      const relayPodiumModels = [];
      candidate.traverse((object) => {
        if (object.userData.isRedRacePodiumModel) relayPodiumModels.push(object);
      });
      relayPodiumModels.forEach((model, sideIndex) => {
        setRacePodiumUsername(model, relayStationPodiumUsernames[index]?.[sideIndex] || '');
      });
      return;
    }
    setRacePodiumUsername(candidate, podiumUsernames[index] || '');
  });
  const relayTeamIndex = partyLobby?.gameMode === 'relay-race' ? Number(localRelayTeam()?.teamIndex) : 0;
  const launchModelIndex = relayTeamIndex === 1 ? 1 : 0;
  let podium = podiums[gridSlot] || null;
  let center;
  let yaw;
  if (podium) {
    podium.updateWorldMatrix(true, false);
    center = getRacePodiumModel(podium, launchModelIndex).getWorldPosition(new THREE.Vector3());
    yaw = getRacePodiumLaunchYaw(podium, launchModelIndex);
  } else {
    const platform = new THREE.Group();
    platform.name = 'Automatic race launch podium';
    platform.add(createBuilderPropModel('podium'));
    setRacePodiumUsername(platform, signedInUser?.username || '');
    let offsetBase;
    if (podiums.length) {
      offsetBase = podiums[0];
      offsetBase.updateWorldMatrix(true, false);
      center = getRacePodiumModel(offsetBase, launchModelIndex).getWorldPosition(new THREE.Vector3());
      yaw = getRacePodiumLaunchYaw(offsetBase, launchModelIndex);
    } else {
      center = gatePosition.clone().addScaledVector(approachNormal, 12);
      center.y = terrainSurfaceYAt(activeBiome, center.x, center.z);
      yaw = Math.atan2(approachNormal.x, approachNormal.z);
    }
    const extraSlot = podiums.length ? Math.max(0, gridSlot - podiums.length + 1) : Math.max(0, gridSlot);
    if (extraSlot) center.add(new THREE.Vector3(extraSlot * 5.5, 0, 0).applyAxisAngle(axisY, yaw));
    platform.position.copy(center);
    platform.rotation.y = yaw - RED_RACE_PODIUM_HEADING_OFFSET;
    platform.scale.setScalar(0.85);
    parent.add(platform);
    podium = platform;
    if (parent === trackRoot) generatedTrackLaunchPodium = platform;
  }

  const worldScale = podium.getWorldScale(new THREE.Vector3());
  const topY = center.y + RED_RACE_PODIUM_TOP_Y * worldScale.y;
  const heading = yaw + RED_RACE_PODIUM_DRONE_LEFT_TURN;
  const launchOrientation = new THREE.Quaternion().setFromAxisAngle(axisY, heading);
  const startPosition = new THREE.Vector3(center.x, topY + flightGroundClearance(launchOrientation), center.z);
  launchPadState = {
    center: center.clone(),
    position: startPosition,
    topY,
    yaw,
    heading,
    halfWidth: 1.24 * worldScale.x,
    halfDepth: 1.22 * worldScale.z,
    started: false,
  };
  return launchPadState;
}

function prepareBuilderTestCourse() {
  clearChildren(builderFlightRoot);
  launchPadState = null;
  const entries = [];
  for (const slot of orderedBuilderGates()) {
    const data = slot.gate;
    const gate = customGateObjects.find((object) => object.userData.gateId === data.id);
    if (!gate) continue;
    const indicator = createGateIndicator(gate);
    let centerY = builderGateFlightCenterY;
    const openingIndex = slot.openingIndex ?? 0;
    const plane = gate.userData.gatePassPlanes?.[openingIndex] || gate.userData.gatePassPlanes?.[0];
    if (plane) {
      indicator.position.copy(plane.point);
      indicator.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), plane.normal);
      centerY = plane.point.y;
    } else {
      indicator.position.y = centerY;
    }
    gate.userData.flightIndicators ||= [];
    gate.userData.flightIndicators.push(indicator);
    const role = slot.isStartFinish ? 'START / FINISH' : `GATE ${slot.routeOrder}`;
    const entry = makeFlightGateEntry(gate, role, 2.05, indicator, centerY, slot.routeOrder, slot.isStartFinish);
    entry.planeIndex = slot.openingIndex;
    entries.push(entry);
  }
  const startEntry = entries.find((entry) => entry.isStartFinish);
  if (startEntry) setupRaceLaunchPodium(startEntry, builderFlightRoot, builderPropObjects);
  builderFlightRoot.visible = true;
  trackRoot.visible = false;
  return entries;
}

function clearBuilderTestCourse() {
  customGateObjects.forEach((gate) => {
    (gate.userData.flightIndicators || []).forEach((indicator) => {
      gate.remove(indicator);
      indicator.geometry.dispose();
      indicator.material.dispose();
    });
    delete gate.userData.flightIndicators;
  });
  clearChildren(builderFlightRoot);
  builderFlightRoot.visible = false;
  launchPadState = null;
}

function clearRepeatCourseIndicators() {
  repeatCourseIndicators.forEach((indicator) => {
    indicator.parent?.remove(indicator);
    indicator.geometry.dispose();
    indicator.material.dispose();
  });
  repeatCourseIndicators = [];
}

function repeatCourseEntries(baseEntries, lapCount) {
  clearRepeatCourseIndicators();
  if (!baseEntries.length) return [];
  const startEntry = baseEntries.find((entry) => entry.isStartFinish) || baseEntries[0];
  const checkpoints = baseEntries.filter((entry) => entry !== startEntry)
    .sort((a, b) => Number(a.routeNumber) - Number(b.routeNumber));
  const entries = [{ ...startEntry, role: 'START / FINISH', passed: false }];
  startEntry.indicator.visible = true;
  for (let lap = 0; lap < lapCount; lap += 1) {
    checkpoints.forEach((entry, checkpointIndex) => {
      const indicator = lap === 0 ? entry.indicator : createGateIndicator(entry.object);
      if (lap > 0) {
        indicator.position.copy(entry.indicator.position);
        indicator.quaternion.copy(entry.indicator.quaternion);
        indicator.visible = false;
        repeatCourseIndicators.push(indicator);
      } else {
        entry.indicator.visible = false;
      }
      entries.push({ ...entry, role: `GATE ${entry.routeNumber || checkpointIndex + 1} / LAP ${lap + 1}`, indicator, passed: false });
    });
    const finishIndicator = createGateIndicator(startEntry.object);
    finishIndicator.position.copy(startEntry.indicator.position);
    finishIndicator.quaternion.copy(startEntry.indicator.quaternion);
    finishIndicator.visible = false;
    repeatCourseIndicators.push(finishIndicator);
    entries.push({ ...startEntry, role: `START / FINISH / LAP ${lap + 1}`, indicator: finishIndicator, passed: false, isLapFinish: true });
  }
  return entries;
}

function prepareFlightCourse() {
  if (partyRacePhase === 'waiting' && partyLobby) {
    builderTestCourse = false;
    flightCourseLapCount = 1;
    builderFlightRoot.visible = false;
    trackRoot.visible = true;
    flightCourseEntries = [];
    launchPadState = null;
    if (generatedTrackLaunchPodium) {
      trackRoot.remove(generatedTrackLaunchPodium);
      clearChildren(generatedTrackLaunchPodium);
      generatedTrackLaunchPodium = null;
    }
    clearRepeatCourseIndicators();
    raceTimerEnabled = false;
    raceTimerStartedAt = 0;
    raceTimerFinishedAt = 0;
    activeFlightCourseName = activeTrack?.name || 'FLIGHT LOBBY';
    updateCourseProgress(0);
    updateRaceTimerDisplay();
    return;
  }
  builderTestCourse = currentPage === 'builder' && customGateObjects.length > 0;
  let baseEntries;
  if (builderTestCourse) {
    baseEntries = prepareBuilderTestCourse();
  } else {
    builderFlightRoot.visible = false;
    trackRoot.visible = true;
    baseEntries = trackGateEntries;
    if (generatedTrackLaunchPodium) {
      trackRoot.remove(generatedTrackLaunchPodium);
      clearChildren(generatedTrackLaunchPodium);
      generatedTrackLaunchPodium = null;
    }
  }
  const requestedLaps = builderTestCourse
    ? Number(document.querySelector('#builderLapCount').value)
    : Number(activeTrack?.laps);
  const lapCount = THREE.MathUtils.clamp(Number.isFinite(requestedLaps) && requestedLaps > 0 ? Math.floor(requestedLaps) : 1, 1, 5);
  flightCourseLapCount = lapCount;
  flightCourseEntries = repeatCourseEntries(baseEntries, lapCount);
  flightCourseEntries.forEach((entry) => entry.indicator?.scale.setScalar(2.5));
  const relayMatch = !builderTestCourse && partyLobby?.gameMode === 'relay-race' && ['grid', 'race'].includes(partyRacePhase);
  if (relayMatch) {
    flightCourseEntries = flightCourseEntries.slice(1);
    flightCourseEntries.forEach((entry, index) => {
      entry.serverGateIndex = index + 1;
      entry.passed = false;
      entry.indicator.visible = index === 0;
    });
  }
  if (!builderTestCourse && baseEntries.length) {
    const startEntry = baseEntries.find((entry) => entry.isStartFinish) || baseEntries[0];
    const placedPodiums = activeTrack?.id?.startsWith('community-') ? communityPropRoot.children : [];
    const userPodiums = relayMatch ? orderedRelayStationPodiumObjects(baseEntries, placedPodiums) : placedPodiums;
    const gridSlot = ['grid', 'race'].includes(partyRacePhase) ? partyRaceGridSlot : 0;
    setupRaceLaunchPodium(startEntry, trackRoot, userPodiums, gridSlot);
  }
  raceTimerEnabled = (selectedMode === 'Race' || builderTestCourse) && Boolean(launchPadState);
  raceTimerStartedAt = 0;
  raceTimerFinishedAt = 0;
  if (builderTestCourse) {
    activeFlightCourseName = 'CUSTOM COURSE';
  } else {
    activeFlightCourseName = activeTrack?.name || 'FLIGHT COURSE';
  }
  updateCourseProgress(0);
  updateRaceTimerDisplay();
}

function restartLocalRace(source = 'keyboard') {
  if (!flying || !raceTimerEnabled || !launchPadState || !flightCourseEntries.length || isMultiplayerRaceActive()) return false;

  resetFlightDamage();
  hideRaceFinishLeaderboard();
  flightCourseEntries.forEach((entry) => {
    entry.passed = false;
    if (entry.indicator) entry.indicator.visible = false;
  });
  routeProgress = 0;
  launchPadState.started = false;
  flight.position.copy(launchPadState.position);
  flight.velocity.set(0, 0, 0);
  flight.acceleration.set(0, 0, 0);
  resetFlightControllerState();
  flight.orientation.setFromAxisAngle(axisY, launchPadState.heading);
  flight.throttle = 0;
  flight.speed = 0;
  previousFlightPosition.copy(flight.position);
  raceTimerStartedAt = 0;
  raceTimerFinishedAt = 0;
  document.querySelector('#raceStartOverlay').hidden = true;
  updateCourseProgress(0);
  updateTrackIndicators();
  updateRaceTimerDisplay(raceTimerStartedAt);
  updateRaceLeaderboard();
  showToast(source === 'keyboard' ? 'Race restarted.' : 'Race restarted from your controller.');
  return true;
}

function resetDrone() {
  if (!flying) return false;
  resetFlightDamage();
  const levelForward = new THREE.Vector3(0, 0, 1).applyQuaternion(flight.orientation);
  levelForward.y = 0;
  if (levelForward.lengthSq() < 0.0001) {
    levelForward.set(0, 0, 1).applyQuaternion(flightSpawnOrientation);
    levelForward.y = 0;
  }
  const heading = levelForward.lengthSq() > 0.0001 ? Math.atan2(levelForward.x, levelForward.z) : 0;
  flight.velocity.set(0, 0, 0);
  flight.acceleration.set(0, 0, 0);
  resetFlightControllerState();
  flight.orientation.setFromAxisAngle(axisY, heading);
  flight.throttle = 0.54;
  flight.speed = 0;
  previousFlightPosition.copy(flight.position);
  showToast('Drone reset in place.');
  return true;
}

function playGateTone(correct) {
  if (!soundEnabled || audioVolume <= 0) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') audioContext.resume();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();
    const now = audioContext.currentTime;
    oscillator.type = correct ? 'triangle' : 'square';
    oscillator.frequency.setValueAtTime(correct ? 540 : 205, now);
    oscillator.frequency.exponentialRampToValueAtTime(correct ? 960 : 115, now + (correct ? 0.15 : 0.2));
    gain.gain.setValueAtTime((correct ? 0.11 : 0.075) * audioVolume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + (correct ? 0.18 : 0.23));
    oscillator.connect(gain).connect(audioContext.destination);
    oscillator.start(now);
    oscillator.stop(now + (correct ? 0.19 : 0.24));
  } catch { /* Checkpoint sounds are optional if Web Audio is unavailable. */ }
}

function playUiSound(kind = 'click') {
  if (!soundEnabled || audioVolume <= 0) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch(() => { /* Sound remains optional if audio is unavailable. */ });
    }
    const now = audioContext.currentTime;
    const notes = kind === 'navigate'
      ? [{ frequency: 620, delay: 0 }, { frequency: 840, delay: 0.055 }]
      : kind === 'hover'
        ? [{ frequency: 760, delay: 0 }]
        : kind === 'enable'
          ? [{ frequency: 660, delay: 0 }, { frequency: 880, delay: 0.065 }]
          : [{ frequency: 590, delay: 0 }];
    const peak = (kind === 'hover' ? 0.012 : kind === 'click' ? 0.035 : 0.045) * audioVolume;
    for (const note of notes) {
      const start = now + note.delay;
      const oscillator = audioContext.createOscillator();
      const gain = audioContext.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(note.frequency, start);
      oscillator.frequency.exponentialRampToValueAtTime(note.frequency * 0.72, start + 0.075);
      gain.gain.setValueAtTime(peak, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.09);
      oscillator.connect(gain).connect(audioContext.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.095);
    }
  } catch { /* Interface sounds are optional if Web Audio is unavailable. */ }
}

function lobbyMusicMidiFrequency(note) {
  return 440 * (2 ** ((note - 69) / 12));
}

function createLobbyMusicNoiseBuffer(context) {
  const buffer = context.createBuffer(1, Math.floor(context.sampleRate * 0.35), context.sampleRate);
  const channel = buffer.getChannelData(0);
  for (let index = 0; index < channel.length; index += 1) {
    channel[index] = Math.random() * 2 - 1;
  }
  return buffer;
}

function createLobbyMusicImpulse(context) {
  const length = Math.floor(context.sampleRate * 1.35);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channelIndex = 0; channelIndex < impulse.numberOfChannels; channelIndex += 1) {
    const channel = impulse.getChannelData(channelIndex);
    for (let index = 0; index < length; index += 1) {
      const fade = (1 - index / length) ** 2.6;
      channel[index] = (Math.random() * 2 - 1) * fade * 0.24;
    }
  }
  return impulse;
}

function scheduleLobbyMusicNoise(run, time, duration, cutoff, peak, type = 'highpass') {
  const context = audioContext;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  source.buffer = run.noise;
  filter.type = type;
  filter.frequency.setValueAtTime(cutoff, time);
  filter.Q.value = type === 'bandpass' ? 0.8 : 0.6;
  envelope.gain.setValueAtTime(0.0001, time);
  envelope.gain.linearRampToValueAtTime(peak, time + 0.004);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  source.connect(filter).connect(envelope).connect(run.bus);
  source.start(time);
  source.stop(time + duration + 0.01);
}

function scheduleLobbyMusicKick(run, time) {
  const context = audioContext;
  const style = run.style;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(142, time);
  oscillator.frequency.exponentialRampToValueAtTime(43, time + 0.15);
  envelope.gain.setValueAtTime(0.0001, time);
  envelope.gain.linearRampToValueAtTime(style.kickPeak, time + 0.005);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + 0.28);
  oscillator.connect(envelope).connect(run.bus);
  oscillator.start(time);
  oscillator.stop(time + 0.3);
}

function scheduleLobbyMusicBass(run, time, note, duration) {
  const context = audioContext;
  const style = run.style;
  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  oscillator.type = style.bassWaveform;
  oscillator.frequency.setValueAtTime(lobbyMusicMidiFrequency(note), time);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(style.bassFilterStart, time);
  filter.frequency.exponentialRampToValueAtTime(style.bassFilterPeak, time + style.bassFilterAttack);
  filter.frequency.exponentialRampToValueAtTime(style.bassFilterEnd, time + duration);
  filter.Q.value = style.bassFilterQ;
  envelope.gain.setValueAtTime(0.0001, time);
  envelope.gain.linearRampToValueAtTime(style.bassPeak, time + style.bassAttack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration + 0.045);
  oscillator.connect(filter).connect(envelope).connect(run.bus);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.06);
}

function scheduleLobbyMusicLead(run, time, note, duration) {
  const context = audioContext;
  const style = run.style;
  const oscillator = context.createOscillator();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  oscillator.type = style.leadWaveform;
  oscillator.frequency.setValueAtTime(lobbyMusicMidiFrequency(note), time);
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(style.leadFilterStart, time);
  filter.frequency.exponentialRampToValueAtTime(style.leadFilterEnd, time + duration);
  filter.Q.value = style.leadFilterQ;
  envelope.gain.setValueAtTime(0.0001, time);
  envelope.gain.linearRampToValueAtTime(style.leadPeak, time + style.leadAttack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
  oscillator.connect(filter).connect(envelope);
  envelope.connect(run.bus);
  const echoSend = context.createGain();
  echoSend.gain.value = style.leadDelaySend;
  envelope.connect(echoSend).connect(run.delay);
  const reverbSend = context.createGain();
  reverbSend.gain.value = style.leadReverbSend;
  envelope.connect(reverbSend).connect(run.reverb);
  oscillator.start(time);
  oscillator.stop(time + duration + 0.03);
}

function scheduleLobbyMusicChord(run, time, chord, duration) {
  const context = audioContext;
  const style = run.style;
  chord.intervals.forEach((interval, index) => {
    const oscillator = context.createOscillator();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    oscillator.type = style.chordWaveforms[index] || style.chordWaveforms[0];
    oscillator.detune.value = index === 1 ? -style.chordDetune : index === 2 ? style.chordDetune * 0.8 : 0;
    oscillator.frequency.setValueAtTime(lobbyMusicMidiFrequency(chord.root + 24 + interval), time);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(style.chordFilter, time);
    filter.Q.value = style.chordFilterQ;
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.linearRampToValueAtTime(style.chordPeak, time + style.chordAttack);
    envelope.gain.setValueAtTime(style.chordSustain, time + Math.max(style.chordAttack + 0.01, duration - style.chordRelease));
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + duration);
    oscillator.connect(filter).connect(envelope);
    envelope.connect(run.bus);
    const reverbSend = context.createGain();
    reverbSend.gain.value = style.chordReverbSend;
    envelope.connect(reverbSend).connect(run.reverb);
    oscillator.start(time);
    oscillator.stop(time + duration + 0.04);
  });
}

const lobbyEDMBaseSongs = [
  {
    bpm: 124,
    loops: 4,
    chords: [
      { root: 45, intervals: [0, 3, 7, 10] },
      { root: 41, intervals: [0, 4, 7, 11] },
      { root: 48, intervals: [0, 4, 7, 11] },
      { root: 43, intervals: [0, 4, 7, 10] },
    ],
    kickSteps: [0, 4, 8, 12],
    snareSteps: [4, 12],
    hatSteps: [0, 2, 4, 6, 8, 10, 12, 14],
    bassSteps: [0, 6, 8, 11, 14],
    bassFifthSteps: [6, 14],
    leadSteps: [0, 2, 4, 6, 8, 10, 12, 14],
    leadPattern: [0, 2, 1, 2, 3, 2, 1, 2],
  },
  {
    bpm: 126,
    loops: 4,
    chords: [
      { root: 50, intervals: [0, 4, 7, 11] },
      { root: 47, intervals: [0, 3, 7, 10] },
      { root: 43, intervals: [0, 4, 7, 11] },
      { root: 45, intervals: [0, 4, 7, 10] },
    ],
    kickSteps: [0, 4, 8, 12],
    snareSteps: [4, 12],
    hatSteps: [0, 2, 4, 6, 8, 10, 12, 14],
    bassSteps: [0, 4, 7, 8, 12, 14],
    bassFifthSteps: [7, 14],
    leadSteps: [0, 2, 4, 6, 8, 10, 12, 14],
    leadPattern: [0, 2, 3, 2, 1, 3, 2, 1],
  },
  {
    bpm: 120,
    loops: 4,
    chords: [
      { root: 48, intervals: [0, 4, 7, 11] },
      { root: 43, intervals: [0, 4, 7, 10] },
      { root: 45, intervals: [0, 3, 7, 10] },
      { root: 41, intervals: [0, 4, 7, 11] },
    ],
    kickSteps: [0, 4, 8, 12],
    snareSteps: [4, 12],
    hatSteps: [0, 2, 4, 6, 8, 10, 12, 14],
    bassSteps: [0, 4, 8, 12],
    bassFifthSteps: [4, 12],
    leadSteps: [0, 3, 4, 7, 8, 11, 12, 15],
    leadPattern: [0, 1, 2, 1, 3, 2, 1, 0],
  },
  {
    bpm: 128,
    loops: 4,
    chords: [
      { root: 40, intervals: [0, 3, 7, 10] },
      { root: 43, intervals: [0, 4, 7, 11] },
      { root: 45, intervals: [0, 4, 7, 10] },
      { root: 47, intervals: [0, 3, 7, 10] },
    ],
    kickSteps: [0, 4, 8, 12],
    snareSteps: [4, 12],
    hatSteps: [0, 2, 4, 6, 8, 10, 12, 14, 15],
    bassSteps: [0, 3, 6, 8, 11, 14],
    bassFifthSteps: [6, 14],
    leadSteps: [0, 2, 5, 6, 8, 10, 13, 14],
    leadPattern: [0, 2, 1, 3, 2, 1, 3, 2],
  },
];

const lobbyDreamwaveBaseSongs = [
  {
    bpm: 94,
    loops: 3,
    chords: [
      { root: 41, intervals: [0, 4, 7, 11] },
      { root: 45, intervals: [0, 3, 7, 10] },
      { root: 48, intervals: [0, 4, 7, 11] },
      { root: 43, intervals: [0, 2, 7, 10] },
    ],
    kickSteps: [0, 8],
    snareSteps: [12],
    hatSteps: [2, 6, 10, 14],
    bassSteps: [0, 8],
    bassFifthSteps: [8],
    leadSteps: [0, 4, 8, 12],
    leadPattern: [0, 2, 1, 3],
  },
  {
    bpm: 98,
    loops: 3,
    chords: [
      { root: 38, intervals: [0, 3, 7, 10] },
      { root: 46, intervals: [0, 4, 7, 11] },
      { root: 41, intervals: [0, 4, 7, 11] },
      { root: 48, intervals: [0, 4, 7, 11] },
    ],
    kickSteps: [0, 8],
    snareSteps: [12],
    hatSteps: [2, 6, 10, 14],
    bassSteps: [0, 8, 12],
    bassFifthSteps: [8],
    leadSteps: [0, 3, 6, 8, 11, 14],
    leadPattern: [0, 2, 1, 3, 2, 1],
  },
  {
    bpm: 92,
    loops: 3,
    chords: [
      { root: 40, intervals: [0, 3, 7, 10] },
      { root: 43, intervals: [0, 4, 7, 11] },
      { root: 48, intervals: [0, 4, 7, 11] },
      { root: 45, intervals: [0, 3, 7, 10] },
    ],
    kickSteps: [0, 8],
    snareSteps: [12],
    hatSteps: [2, 6, 10, 14],
    bassSteps: [0, 6, 8, 14],
    bassFifthSteps: [6, 14],
    leadSteps: [0, 4, 7, 8, 12, 15],
    leadPattern: [0, 2, 1, 3, 2, 0],
  },
];

const lobbyMusicStyles = {
  edm: {
    masterGain: 0.68,
    delaySteps: 3,
    feedback: 0.17,
    delayReturn: 0.2,
    reverbReturn: 0.16,
    kickPeak: 0.48,
    snareGain: 1,
    hatGain: 1,
    bassWaveform: 'sawtooth',
    bassFilterStart: 190,
    bassFilterPeak: 560,
    bassFilterEnd: 210,
    bassFilterAttack: 0.055,
    bassFilterQ: 1.2,
    bassPeak: 0.16,
    bassAttack: 0.012,
    leadWaveform: 'triangle',
    leadFilterStart: 2600,
    leadFilterEnd: 1150,
    leadFilterQ: 0.8,
    leadPeak: 0.058,
    leadAttack: 0.009,
    leadDelaySend: 0.24,
    leadReverbSend: 0.16,
    chordWaveforms: ['triangle', 'sawtooth', 'sawtooth', 'sawtooth'],
    chordDetune: 5,
    chordFilter: 1250,
    chordFilterQ: 0.5,
    chordPeak: 0.022,
    chordSustain: 0.018,
    chordAttack: 0.12,
    chordRelease: 0.3,
    chordReverbSend: 0.24,
  },
  dreamwave: {
    masterGain: 0.68,
    delaySteps: 4,
    feedback: 0.23,
    delayReturn: 0.24,
    reverbReturn: 0.34,
    kickPeak: 0.22,
    snareGain: 0.62,
    hatGain: 0.48,
    bassWaveform: 'triangle',
    bassFilterStart: 125,
    bassFilterPeak: 290,
    bassFilterEnd: 145,
    bassFilterAttack: 0.11,
    bassFilterQ: 0.65,
    bassPeak: 0.095,
    bassAttack: 0.04,
    leadWaveform: 'sine',
    leadFilterStart: 1700,
    leadFilterEnd: 720,
    leadFilterQ: 0.55,
    leadPeak: 0.034,
    leadAttack: 0.045,
    leadDelaySend: 0.38,
    leadReverbSend: 0.38,
    chordWaveforms: ['triangle', 'triangle', 'triangle', 'triangle'],
    chordDetune: 2,
    chordFilter: 950,
    chordFilterQ: 0.35,
    chordPeak: 0.018,
    chordSustain: 0.014,
    chordAttack: 0.34,
    chordRelease: 0.55,
    chordReverbSend: 0.48,
  },
};

const lobbyEDMRhythmPatterns = [
  {
    kickSteps: [0, 4, 8, 12], snareSteps: [4, 12], hatSteps: [0, 2, 4, 6, 8, 10, 12, 14],
    bassSteps: [0, 6, 8, 11, 14], bassFifthSteps: [6, 14],
    leadSteps: [0, 2, 4, 6, 8, 10, 12, 14], leadPattern: [0, 2, 1, 2, 3, 2, 1, 2],
  },
  {
    kickSteps: [0, 4, 8, 12], snareSteps: [4, 12], hatSteps: [0, 2, 4, 6, 8, 10, 12, 14, 15],
    bassSteps: [0, 4, 6, 8, 12, 14], bassFifthSteps: [6, 14],
    leadSteps: [0, 2, 5, 6, 8, 10, 13, 14], leadPattern: [0, 2, 1, 3, 2, 1, 3, 2],
  },
  {
    kickSteps: [0, 4, 8, 12], snareSteps: [4, 12], hatSteps: [0, 2, 4, 6, 8, 10, 12, 14],
    bassSteps: [0, 3, 6, 8, 11, 14], bassFifthSteps: [6, 14],
    leadSteps: [0, 2, 4, 6, 8, 10, 12, 14], leadPattern: [2, 1, 3, 2, 0, 1, 2, 3],
  },
  {
    kickSteps: [0, 4, 8, 12], snareSteps: [4, 12], hatSteps: [0, 2, 3, 4, 6, 8, 10, 11, 12, 14],
    bassSteps: [0, 4, 7, 8, 12, 14], bassFifthSteps: [7, 14],
    leadSteps: [0, 2, 4, 6, 8, 10, 12, 14], leadPattern: [3, 2, 1, 0, 1, 2, 3, 2],
  },
];

const lobbyDreamwaveRhythmPatterns = [
  {
    kickSteps: [0, 8], snareSteps: [12], hatSteps: [2, 6, 10, 14],
    bassSteps: [0, 8], bassFifthSteps: [8],
    leadSteps: [0, 4, 8, 12], leadPattern: [0, 2, 1, 3],
  },
  {
    kickSteps: [0, 8], snareSteps: [4, 12], hatSteps: [2, 6, 10, 14],
    bassSteps: [0, 4, 8, 12], bassFifthSteps: [4, 12],
    leadSteps: [0, 3, 6, 8, 11, 14], leadPattern: [0, 2, 1, 3, 2, 1],
  },
  {
    kickSteps: [0, 8, 14], snareSteps: [12], hatSteps: [2, 6, 10, 14],
    bassSteps: [0, 6, 8, 14], bassFifthSteps: [6, 14],
    leadSteps: [0, 4, 7, 8, 12, 15], leadPattern: [0, 2, 1, 3, 2, 0],
  },
  {
    kickSteps: [0, 8], snareSteps: [12], hatSteps: [4, 8, 14],
    bassSteps: [0, 8, 12], bassFifthSteps: [8],
    leadSteps: [0, 4, 8, 12], leadPattern: [3, 1, 2, 0],
  },
];

function createLobbyMusicVariations(baseSongs, styleName, count, bpmMin, bpmMax, rhythmPatterns, seed) {
  const transpositions = [0, 2, 3, 5, 7, 9, 10, 12];
  const bpmRange = bpmMax - bpmMin + 1;
  return Array.from({ length: count }, (_, index) => {
    const sourceIndex = index === 0 ? 0 : (index * 2 + Math.floor(index / baseSongs.length) + seed) % baseSongs.length;
    const patternIndex = index === 0 ? 0 : (index * 3 + Math.floor(index / rhythmPatterns.length) + seed) % rhythmPatterns.length;
    const source = baseSongs[sourceIndex];
    const pattern = rhythmPatterns[patternIndex];
    const transpose = index === 0 ? 0 : transpositions[(index * 5 + seed) % transpositions.length];
    const bpm = bpmMin + ((index * 7 + Math.floor(index / 3) * 2 + seed - 1) % bpmRange);
    return {
      style: styleName,
      bpm,
      loops: index < baseSongs.length ? source.loops : 2 + (index % 6 === 0 ? 1 : 0),
      chords: source.chords.map((chord) => ({
        root: chord.root + transpose,
        intervals: [...chord.intervals],
      })),
      kickSteps: [...pattern.kickSteps],
      snareSteps: [...pattern.snareSteps],
      hatSteps: [...pattern.hatSteps],
      bassSteps: [...pattern.bassSteps],
      bassFifthSteps: [...pattern.bassFifthSteps],
      leadSteps: [...pattern.leadSteps],
      leadPattern: [...pattern.leadPattern],
    };
  });
}

const lobbyEDMSongs = createLobbyMusicVariations(
  lobbyEDMBaseSongs, 'edm', 50, 132, 146, lobbyEDMRhythmPatterns, 1,
);
const lobbyDreamwaveSongs = createLobbyMusicVariations(
  lobbyDreamwaveBaseSongs, 'dreamwave', 50, 88, 104, lobbyDreamwaveRhythmPatterns, 6,
);
const lobbyMusicPlaylist = lobbyEDMSongs.flatMap((edmSong, index) => [edmSong, lobbyDreamwaveSongs[index]]);

function scheduleLobbyMusicStep(run, step, time) {
  const stepInBar = step % 16;
  const bar = Math.floor(step / 16);
  const song = run.playlist[run.songIndex];
  const chord = song.chords[bar];
  if (song.kickSteps.includes(stepInBar)) scheduleLobbyMusicKick(run, time);
  if (song.snareSteps.includes(stepInBar)) {
    scheduleLobbyMusicNoise(run, time, 0.18, 1850, 0.095 * run.style.snareGain, 'bandpass');
  }
  if (song.hatSteps.includes(stepInBar)) {
    const accent = stepInBar === 14;
    scheduleLobbyMusicNoise(run, time, accent ? 0.13 : 0.045, accent ? 6700 : 8200, (accent ? 0.05 : 0.024) * run.style.hatGain);
  }
  if (song.bassSteps.includes(stepInBar)) {
    const fifth = song.bassFifthSteps.includes(stepInBar);
    scheduleLobbyMusicBass(run, time, chord.root - 12 + (fifth ? 7 : 0), run.stepDuration * (fifth ? 1.35 : 1.7));
  }
  if (stepInBar === 0) scheduleLobbyMusicChord(run, time, chord, run.stepDuration * 15.6);
  const leadIndex = song.leadSteps.indexOf(stepInBar);
  if (leadIndex >= 0) {
    const intervalIndex = song.leadPattern[leadIndex];
    scheduleLobbyMusicLead(run, time, chord.root + 24 + chord.intervals[intervalIndex], run.stepDuration * 1.45);
  }
}

function startLobbyMusic() {
  if (lobbyMusicRun || !lobbyMusicEnabled) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audioContext.state === 'suspended') {
      void audioContext.resume().catch(() => { /* Browser audio may wait for another user gesture. */ });
    }
    const context = audioContext;
    const firstSong = lobbyMusicPlaylist[0];
    const style = lobbyMusicStyles[firstSong.style];
    const run = {
      playlist: lobbyMusicPlaylist,
      style,
      step: 0,
      songIndex: 0,
      loopsInSong: 0,
      stepDuration: 60 / firstSong.bpm / 4,
      nextTime: context.currentTime + 0.07,
      noise: createLobbyMusicNoiseBuffer(context),
    };
    run.bus = context.createGain();
    run.compressor = context.createDynamicsCompressor();
    run.compressor.threshold.value = -18;
    run.compressor.knee.value = 14;
    run.compressor.ratio.value = 3;
    run.compressor.attack.value = 0.006;
    run.compressor.release.value = 0.2;
    run.bus.gain.setValueAtTime(0.0001, context.currentTime);
    run.bus.gain.linearRampToValueAtTime(style.masterGain * audioVolume, context.currentTime + 0.7);
    run.analyser = context.createAnalyser();
    run.analyser.fftSize = 1024;
    run.analyser.smoothingTimeConstant = 0.68;
    run.analyserData = new Uint8Array(run.analyser.frequencyBinCount);
    run.bus.connect(run.compressor).connect(run.analyser).connect(context.destination);

    run.reverb = context.createConvolver();
    run.reverb.buffer = createLobbyMusicImpulse(context);
    run.reverbReturn = context.createGain();
    run.reverbReturn.gain.value = style.reverbReturn;
    run.reverb.connect(run.reverbReturn).connect(run.bus);

    run.delay = context.createDelay(0.7);
    run.delay.delayTime.value = run.stepDuration * style.delaySteps;
    run.feedback = context.createGain();
    run.feedback.gain.value = style.feedback;
    run.delayReturn = context.createGain();
    run.delayReturn.gain.value = style.delayReturn;
    run.delay.connect(run.feedback);
    run.feedback.connect(run.delay);
    run.delay.connect(run.delayReturn).connect(run.bus);

    lobbyMusicRun = run;
    const tick = () => {
      if (lobbyMusicRun !== run) return;
      const horizon = context.currentTime + 0.13;
      while (run.nextTime < horizon) {
        scheduleLobbyMusicStep(run, run.step, run.nextTime);
        run.nextTime += run.stepDuration;
        run.step += 1;
        if (run.step >= 64) {
          run.step = 0;
          run.loopsInSong += 1;
          const currentSong = run.playlist[run.songIndex];
          if (run.loopsInSong >= currentSong.loops) {
            run.songIndex = (run.songIndex + 1) % run.playlist.length;
            run.loopsInSong = 0;
            const nextSong = run.playlist[run.songIndex];
            run.style = lobbyMusicStyles[nextSong.style];
            run.stepDuration = 60 / nextSong.bpm / 4;
            run.reverbReturn.gain.setTargetAtTime(run.style.reverbReturn, run.nextTime, 0.15);
            run.feedback.gain.setTargetAtTime(run.style.feedback, run.nextTime, 0.15);
            run.delayReturn.gain.setTargetAtTime(run.style.delayReturn, run.nextTime, 0.15);
            run.delay.delayTime.setTargetAtTime(run.stepDuration * run.style.delaySteps, run.nextTime, 0.03);
          }
        }
      }
    };
    tick();
    run.timer = window.setInterval(tick, 25);
  } catch { /* Lobby music is optional when Web Audio is unavailable. */ }
}

function stopLobbyMusic() {
  const run = lobbyMusicRun;
  if (!run) return;
  lobbyMusicRun = null;
  window.clearInterval(run.timer);
  const context = audioContext;
  if (!context) return;
  const now = context.currentTime;
  run.bus.gain.cancelScheduledValues(now);
  run.bus.gain.setValueAtTime(run.bus.gain.value, now);
  run.bus.gain.linearRampToValueAtTime(0.0001, now + 0.38);
  window.setTimeout(() => {
    [run.bus, run.compressor, run.analyser, run.reverb, run.reverbReturn, run.delay, run.feedback, run.delayReturn].forEach((node) => {
      try { node.disconnect(); } catch { /* The audio node may already be disconnected. */ }
    });
  }, 650);
}

function updateLobbyMusicVolume() {
  if (!lobbyMusicRun || !audioContext) return;
  lobbyMusicRun.bus.gain.setTargetAtTime(lobbyMusicRun.style.masterGain * audioVolume, audioContext.currentTime, 0.06);
}

function updateLobbyMusicVisualization(dt) {
  if (!menuStarMusicUniforms) return;
  menuPlanetMotionTime += dt;
  const run = lobbyMusicRun;
  const samples = run?.analyserData;
  let bass = 0;
  let mids = 0;
  let high = 0;
  if (run?.analyser && samples && audioContext?.state === 'running') {
    run.analyser.getByteFrequencyData(samples);
    const averageBand = (start, end) => {
      let total = 0;
      for (let index = start; index <= end; index += 1) total += samples[index] || 0;
      return total / (end - start + 1) / 255;
    };
    bass = averageBand(1, 5);
    mids = averageBand(6, 40);
    high = averageBand(41, 150);
  }
  const energy = THREE.MathUtils.clamp(bass * 2.1 + mids * 1.25 + high * 0.8, 0, 1);
  const smoothing = 1 - Math.exp(-dt * (energy > menuStarMusicUniforms.energy.value ? 11 : 3.2));
  menuStarMusicUniforms.energy.value += (energy - menuStarMusicUniforms.energy.value) * smoothing;
  menuStarMusicUniforms.bass.value += (bass - menuStarMusicUniforms.bass.value) * smoothing;
  menuStarMusicUniforms.mids.value += (mids - menuStarMusicUniforms.mids.value) * smoothing;
  menuStarMusicUniforms.high.value += (high - menuStarMusicUniforms.high.value) * smoothing;
  menuStarMusicUniforms.hue.value = (
    menuStarMusicUniforms.bass.value * 0.52
    + menuStarMusicUniforms.mids.value * 0.34
    + menuStarMusicUniforms.high.value * 0.22
  ) % 1;
  if (menuStarField) {
    menuStarField.rotation.y += dt * 0.0032;
    menuStarField.rotation.x += dt * 0.00045;
  }
  const musicEnergy = menuStarMusicUniforms.energy.value;
  const musicHue = menuStarMusicUniforms.hue.value;
  const musicBands = {
    bass: menuStarMusicUniforms.bass.value,
    mids: menuStarMusicUniforms.mids.value,
    high: menuStarMusicUniforms.high.value,
  };
  if (menuMoonGroup && menuMoonOrbit) {
    const moonAngle = menuPlanetMotionTime * menuMoonOrbit.speed + menuMoonOrbit.phase;
    menuMoonGroup.position.set(
      Math.cos(moonAngle) * menuMoonOrbit.radiusX
        + Math.sin(moonAngle * menuMoonOrbit.pathFrequency[0] + menuMoonOrbit.pathPhase) * menuMoonOrbit.pathWobble[0],
      menuMoonOrbit.height + Math.sin(moonAngle * 0.72 + menuMoonOrbit.verticalPhase) * menuMoonOrbit.heightAmplitude,
      menuPlatformCenterZ + Math.sin(moonAngle) * menuMoonOrbit.radiusZ
        + Math.cos(moonAngle * menuMoonOrbit.pathFrequency[1] + menuMoonOrbit.pathPhase * 0.73) * menuMoonOrbit.pathWobble[1],
    );
    menuMoonGroup.rotation.y = moonAngle * 0.08;
  }
  menuPlanetVisuals.forEach((planet) => {
    const orbit = menuPlanetMotionTime * planet.pathSpeed + planet.orbitPhase;
    planet.root.position.x = Math.cos(orbit) * planet.orbitRadiusX
      + Math.sin(orbit * planet.pathFrequency[0] + planet.pathPhase) * planet.pathWobble[0];
    planet.root.position.y = planet.basePosition.y
      + Math.sin(orbit * 0.72 + planet.verticalPhase) * planet.heightAmplitude;
    planet.root.position.z = planet.basePosition.z
      + Math.sin(orbit) * planet.orbitRadiusZ
      + Math.cos(orbit * planet.pathFrequency[1] + planet.pathPhase * 0.73) * planet.pathWobble[1];
    planet.root.rotation.z = Math.sin(orbit * 0.36) * 0.035;
    planet.root.rotation.x = Math.cos(orbit * 0.29 + planet.orbitPhase) * 0.018;
    planet.rings.forEach((ring) => {
      const band = musicBands[ring.musicBand] ?? musicEnergy;
      const beat = Math.sin(menuPlanetMotionTime * (4.5 + band * 5) + ring.hueOffset * Math.PI * 2);
      const hue = THREE.MathUtils.euclideanModulo(musicHue * 0.65 + planet.hueOffset * 0.18 + ring.hueOffset * 0.16, 1);
      ring.mesh.material.color.setHSL(hue, 0.78, 0.5 + band * 0.12 + musicEnergy * 0.06);
      ring.mesh.material.opacity = THREE.MathUtils.clamp(ring.baseOpacity * (0.62 + band * 0.72 + musicEnergy * 0.28 + Math.max(0, beat) * 0.12), 0.05, 0.52);
      const pulse = 1 + band * ring.pulseAmount + beat * (0.006 + band * 0.012);
      ring.mesh.scale.setScalar(pulse);
      ring.mesh.rotation.z += dt * ring.spinSpeed * (0.8 + band * 0.75);
    });
    planet.surface.rotation.y += dt * planet.rotationSpeed;
    planet.surface.rotation.x += dt * planet.rotationSpeed * 0.12;
  });
}

function syncLobbyMusic() {
  const lobbyPages = new Set(['singleplayer', 'multiplayer', 'trackPicker', 'communityTracks', 'builderMenu', 'builder']);
  const currentLobbyPage = currentPage === 'settings' ? pageBeforeSettings : currentPage;
  const lobbyMenu = !flying && lobbyPages.has(currentLobbyPage);
  const partyLobbyWaiting = Boolean(flying && partyLobby && partyRacePhase === 'waiting' && ['open', 'starting'].includes(partyLobby.status));
  if (!lobbyMusicEnabled || (!lobbyMenu && !partyLobbyWaiting)) {
    stopLobbyMusic();
    return;
  }
  startLobbyMusic();
  updateLobbyMusicVolume();
}

let lastUiHoverSoundAt = 0;
document.addEventListener('pointerover', (event) => {
  const target = event.target instanceof Element ? event.target.closest('.menu-choice, .gate-type') : null;
  if (!target || target.contains(event.relatedTarget)) return;
  const now = performance.now();
  if (now - lastUiHoverSoundAt < 70) return;
  lastUiHoverSoundAt = now;
  playUiSound('hover');
}, true);

document.addEventListener('click', (event) => {
  if (!(event.target instanceof Element)) return;
  const control = event.target.closest('button, a[href], [role="button"], [role="switch"], input[type="color"]');
  if (!control || control.matches(':disabled, [aria-disabled="true"]')) return;
  if (lobbyMusicEnabled) {
    try {
      audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
      if (audioContext.state === 'suspended') void audioContext.resume().catch(() => { /* Audio can wait for another interaction. */ });
    } catch { /* Lobby music is optional when Web Audio is unavailable. */ }
  }
  if (control.id === 'soundToggle' && !soundEnabled) return;
  const navigating = control.matches('.menu-choice, [data-menu-choice], [data-page], #settingsButton, #builderBack');
  playUiSound(navigating ? 'navigate' : 'click');
}, true);

function unlockGateAudio() {
  if (!soundEnabled) return;
  try {
    audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
    if (!motorGain) initializeMotorAudio();
    if (audioContext.state === 'suspended') audioContext.resume();
  } catch { /* Sound is optional if Web Audio is unavailable. */ }
}

function updateTrackIndicators() {
  flightCourseEntries.forEach((entry, index) => {
    if (!entry.indicator) return;
    const isCurrentOrNext = index >= routeProgress && index <= routeProgress + 1;
    entry.indicator.visible = isCurrentOrNext && !entry.passed;
    if (entry.passed || !isCurrentOrNext) return;
    entry.object.updateWorldMatrix(true, false);
    const localDronePosition = entry.object.worldToLocal(flight.position.clone());
    const planes = entry.object.userData.gatePassPlanes;
    const directions = entry.object.userData.gateData?.entryDirections;
    const candidatePlanes = entry.planeIndex === null || entry.planeIndex === undefined
      ? planes
      : [planes?.[entry.planeIndex]].filter(Boolean);
    const plane = candidatePlanes?.reduce((closest, candidate, candidateIndex) => {
      const planeIndex = entry.planeIndex === null || entry.planeIndex === undefined ? candidateIndex : entry.planeIndex;
      if (directions?.[planeIndex] === 0) return closest;
      const distance = Math.abs(localDronePosition.clone().sub(candidate.point).dot(candidate.normal));
      return !closest || distance < closest.distance ? { plane: candidate, distance } : closest;
    }, null)?.plane || (candidatePlanes?.length ? null : entry.object.userData.gatePassPlane);
    if (planes?.length && !plane) return;
    const approachDistance = plane
      ? localDronePosition.clone().sub(plane.point).dot(plane.normal)
      : localDronePosition.z;
    const entryDirection = entry.object.userData.gateData?.entryDirections?.[planes?.indexOf(plane) ?? 0]
      ?? entry.object.userData.gateData?.entryDirection
      ?? 1;
    const correctApproach = entryDirection === 1 ? approachDistance >= 0 : approachDistance < 0;
    entry.indicator.material.color.setHex(correctApproach ? 0x73ff8a : 0xff4b65);
    entry.indicator.material.opacity = index === routeProgress ? 0.36 : 0.14;
  });

  const entry = flightCourseEntries[routeProgress];
  if (!entry || entry.passed || !entry.indicator) return;
  const completedIndex = routeProgress;
  entry.indicator.visible = true;
  entry.object.updateWorldMatrix(true, false);
  const localDronePosition = entry.object.worldToLocal(flight.position.clone());
  const localPreviousPosition = entry.object.worldToLocal(previousFlightPosition.clone());
  const planes = entry.object.userData.gatePassPlanes;
  const crossingPlanes = entry.planeIndex !== null && entry.planeIndex !== undefined
    ? [planes?.[entry.planeIndex]].filter(Boolean)
    : planes?.length
      ? planes
    : [entry.object.userData.gatePassPlane || {
      point: new THREE.Vector3(0, entry.centerY || 0, 0),
      normal: new THREE.Vector3(0, 0, 1),
    }];
  let crossedCorrectly = false;
  for (const [planeIndex, plane] of crossingPlanes.entries()) {
    if (!plane) continue;
    const gateData = entry.object.userData.gateData;
    const gatePlaneIndex = entry.planeIndex !== null && entry.planeIndex !== undefined ? entry.planeIndex : planeIndex;
    const entryDirection = gateData?.entryDirections?.[gatePlaneIndex] ?? gateData?.entryDirection;
    if (entryDirection === 0) continue;
    const droneDistance = localDronePosition.clone().sub(plane.point).dot(plane.normal);
    const previousDistance = localPreviousPosition.clone().sub(plane.point).dot(plane.normal);
    const crossed = (previousDistance > 0 && droneDistance <= 0)
      || (previousDistance < 0 && droneDistance >= 0);
    if (!crossed) continue;
    const amount = previousDistance / (previousDistance - droneDistance);
    const crossingPoint = localPreviousPosition.clone().lerp(localDronePosition, amount);
    const crossingOffset = crossingPoint.sub(plane.point);
    if (plane.width && plane.height) {
      const horizontalOffset = crossingOffset.dot(plane.widthAxis);
      const verticalOffset = crossingOffset.dot(plane.heightAxis);
      const outsideOpening = plane.circle
        ? horizontalOffset * horizontalOffset + verticalOffset * verticalOffset > (plane.width / 2) ** 2
        : Math.abs(horizontalOffset) > plane.width / 2 || Math.abs(verticalOffset) > plane.height / 2;
      if (outsideOpening) continue;
    } else if (crossingOffset.x * crossingOffset.x + crossingOffset.y * crossingOffset.y > entry.radius * entry.radius) {
      continue;
    }

    const repeatedStartFinish = entry.isStartFinish && completedIndex > 0 && entryDirection === undefined;
    const correctDirection = entryDirection === -1 || repeatedStartFinish
      ? previousDistance < 0 && droneDistance >= 0
      : previousDistance > 0 && droneDistance <= 0;
    if (!correctDirection) {
      playGateTone(false);
      entry.indicator.material.color.setHex(0xff4b65);
      return;
    }
    crossedCorrectly = true;
    break;
  }
  if (!crossedCorrectly) return;

  entry.passed = true;
  entry.indicator.visible = false;
  playGateTone(true);
  const nextIndex = routeProgress + 1;
  const finished = nextIndex >= flightCourseEntries.length;
  if (!finished) flightCourseEntries[nextIndex].indicator.visible = true;
  updateCourseProgress(finished ? flightCourseEntries.length - 1 : nextIndex, finished);
  const crewRaceActive = partyLobby && ['starting', 'grid', 'racing'].includes(partyLobby.status);
  const raceStartAt = crewRaceActive ? partyLobby.startAt : null;
  const relayMatch = crewRaceActive && partyLobby.gameMode === 'relay-race';
  const crossing = crewRaceActive
    ? { previous: previousFlightPosition.toArray(), current: flight.position.toArray() }
    : null;
  const checkpointRequest = crewRaceActive
    ? reportCrewCheckpoint(entry.serverGateIndex ?? completedIndex, raceStartAt, crossing)
    : null;
  if (relayMatch) {
    if (checkpointRequest) {
      void checkpointRequest.then((result) => {
        raceTimerFinishedAt = performance.now();
        updateRaceTimerDisplay(raceTimerFinishedAt);
        const localMember = result.lobby.members.find((member) => member.id === signedInUser?.id);
        const team = result.lobby.relayTeams?.[localMember?.relayTeam];
        if (team?.finishedAt) {
          setLobbyMessage(`Relay team ${team.teamIndex === 0 ? 'Cyan' : 'Coral'} finished in ${(team.lapTimes.reduce((total, lapTime) => total + lapTime, 0) / 1000).toFixed(2)}s. 100 pilot XP awarded to each team member.`);
        } else if (result.relayTransition?.lapTimeMs) {
          showToast(`Team lap ${result.relayTransition.currentLap - 1} complete / ${(result.relayTransition.lapTimeMs / 1000).toFixed(2)}s.`);
        } else {
          showToast(`Relay split recorded / ${((result.relayTransition?.timeMs || 0) / 1000).toFixed(2)}s.`);
        }
      }).catch((error) => {
        setLobbyMessage(error.message, true);
      });
    }
    return;
  }
  if (finished) {
    showToast(`${activeFlightCourseName} complete.`);
    if (checkpointRequest) {
      void checkpointRequest
        .then(() => finishCrewRace(false, raceStartAt))
        .catch((error) => {
          partyRaceFinished = false;
          setLobbyMessage(error.message, true);
        });
    } else {
      void finishCrewRace(false, raceStartAt);
    }
  }
}

async function enterFlight() {
  if (!authSessionReady) {
    pendingFlightEntry = true;
    showToast('Checking your pilot account…');
    return;
  }
  if (currentPage === 'builder' && !builderTrackIsViable()) {
    showToast(builderTrackRequirementsMessage());
    return;
  }
  if (currentPage === 'trackPicker' && !activeTrack) {
    showToast('No Sky Platform track is available yet. Build a course or select a community track first.');
    return;
  }
  if (builtBiomeId !== activeBiome) {
    const built = safeApplyBiome(activeBiome, false);
    if (!built || built.id !== activeBiome) return;
  }
  resetFlightDamage();
  hideRaceFinishLeaderboard();
  unlockGateAudio();
  if (currentPage === 'builder') setBuilderSettingsOpen(false);
  savedMenuDroneTransform.position.copy(showDrone.position);
  savedMenuDroneTransform.quaternion.copy(showDrone.quaternion);
  savedMenuDroneTransform.scale.copy(showDrone.scale);
  menuDroneTransformSaved = true;
  flying = true;
  hideToast();
  updateGameChatUI();
  updateFlightMainMenuButton();
  syncBuilderTransformToolbar();
  syncGateBadgeVisibility();
  syncWorldMode();
  menuCityRoot.visible = false;
  partyDroneRoot.visible = Boolean(partyLobby && partyLobby.members.length > 1);
  root.classList.remove('is-building');
  builderSelectionHelper.visible = false;
  root.classList.add('is-flying');
  hud.hidden = false;
  hud.classList.toggle('is-hidden', !hudEnabled);
  flightCameraQuickControls.hidden = true;
  flightCameraPanel.hidden = true;
  flightCameraToggle.setAttribute('aria-expanded', 'false');
  orbit.enabled = false;
  showDrone.visible = false;
  fieldSpot.visible = false;
  prepareFlightCourse();
  refreshFlightRaceLine();
  flight.position.set(0, 5, 20);
  flight.velocity.set(0, 0, 0);
  resetFlightControllerState();
  flight.orientation.identity();
  const firstCourseGate = flightCourseEntries[0];
  if (launchPadState) {
    flight.position.copy(launchPadState.position);
    flight.orientation.setFromAxisAngle(axisY, launchPadState.heading);
  } else if (firstCourseGate) {
    firstCourseGate.object.updateWorldMatrix(true, false);
    const gatePosition = firstCourseGate.object.getWorldPosition(new THREE.Vector3());
    const approachNormal = new THREE.Vector3(0, 0, 1).applyQuaternion(firstCourseGate.object.getWorldQuaternion(new THREE.Quaternion())).normalize();
    flight.position.copy(gatePosition).addScaledVector(approachNormal, 9);
    flight.orientation.setFromAxisAngle(axisY, Math.atan2(approachNormal.x, approachNormal.z));
  }
  flightSpawnPosition.copy(flight.position);
  flightSpawnOrientation.copy(flight.orientation);
  previousFlightPosition.copy(flight.position);
  buildFlightCollisionWorld();
  flight.throttle = raceTimerEnabled ? 0 : 0.54;
  flight.speed = 0;
  setCameraFov(fovRange.value);
  document.querySelector('#flightModeLabel').textContent = selectedMode.toUpperCase();
  const prompts = { 'Free Flight': 'NO CLOCK. FIND YOUR FLOW.', Freestyle: 'PICK A GAP. MAKE IT YOURS.', Race: 'LINK THE GATES. FIND THE LINE.' };
  document.querySelector('#flightPrompt').textContent = prompts[selectedMode];
  updateCourseProgress(0);
  updateRaceTimerDisplay();
  keys.clear();
  window.focus();
  refreshGamepadList();
}

function exitFlight() {
  if (!flying) return;
  hideRaceFinishLeaderboard();
  const leaveWaitingLobby = partyRacePhase === 'waiting' && partyLobby?.status === 'open';
  if (leaveWaitingLobby) {
    partyRaceFinished = true;
    void lobbyRequest('leave').then(() => updatePartyLobby(null)).catch((error) => setLobbyMessage(error.message, true));
  } else {
    void finishCrewRace(true);
  }
  if (menuDroneTransformSaved) {
    showDrone.position.copy(savedMenuDroneTransform.position);
    showDrone.quaternion.copy(savedMenuDroneTransform.quaternion);
    showDrone.scale.copy(savedMenuDroneTransform.scale);
    menuDroneTransformSaved = false;
  }
  showDrone.visible = false;
  flying = false;
  clearFlightRaceLine();
  resetFlightDamage();
  updateGameChatUI();
  updateFlightMainMenuButton();
  syncBuilderTransformToolbar();
  flightCollisionOctree.clear();
  syncGateBadgeVisibility();
  menuCityRoot.visible = currentPage !== 'builder';
  document.querySelector('#courseProgress').hidden = true;
  document.querySelector('#raceTimer').hidden = true;
  if (builderTestCourse) clearBuilderTestCourse();
  clearRepeatCourseIndicators();
  partyRacePhase = 'lobby';
  partyRaceFinished = true;
  partyRaceGoUntil = 0;
  partyCountdownLabel = '';
  partyCountdownNumber = '';
  document.querySelector('#raceStartOverlay').hidden = true;
  document.querySelector('#raceLeaderboard').hidden = true;
  trackGateEntries.forEach((entry) => { entry.passed = false; entry.indicator.scale.setScalar(1); entry.indicator.visible = true; entry.indicator.material.color.setHex(0x73ff8a); entry.indicator.material.opacity = 0.3; });
  flightCourseEntries = [];
  builderTestCourse = false;
  trackRoot.visible = currentPage !== 'builder';
  root.classList.remove('is-flying');
  root.classList.toggle('is-building', currentPage === 'builder');
  hud.hidden = true;
  flightCameraQuickControls.hidden = true;
  flightCameraPanel.hidden = true;
  flightCameraToggle.setAttribute('aria-expanded', 'false');
  orbit.enabled = currentPage === 'builder';
  setFlightDroneMeshVisibility(false);
  showDrone.visible = currentPage !== 'builder';
  updatePartyDroneStage();
  fieldSpot.visible = currentPage !== 'builder';
  keys.clear();
  if (currentPage === 'builder') { setBuilderCamera(); if (selectedGateId) selectBuilderGate(selectedGateId); }
  else if (currentPage === 'trackPicker') setTrackOverviewCamera();
  else resetMenuCamera();
  camera.fov = currentPage === 'builder'
    ? (Number(document.querySelector('#fovRange').value) || 90)
    : currentPage === 'trackPicker' ? 54 : 48;
  camera.updateProjectionMatrix();
  updateMotorAudio({ pitch: 0, roll: 0 });
  syncWorldMode();
}

function activateMenuChoice() {
  if (currentPage === 'multiplayer') {
    void quickMatchParty();
  } else if (currentPage === 'builderMenu') {
    document.querySelector('#openTrackBuilder').click();
  } else if (currentPage === 'trackPicker') {
    selectedMode = 'Race';
    enterFlight();
  } else {
    setPage('trackPicker');
  }
}
document.querySelector('#testTrack').addEventListener('click', () => {
  if (currentPage === 'builder' && !builderTrackIsViable()) {
    showToast(builderTrackRequirementsMessage());
    return;
  }
  selectedMode = 'Race';
  enterFlight();
});
document.querySelector('#exitFlight').addEventListener('click', exitFlight);
flightMainMenuButton.addEventListener('click', () => {
  if (!flying || partyLobby?.code || hasOtherPartyMembers() || isMultiplayerRaceActive()) return;
  exitFlight();
  setPage('singleplayer');
});

function normalizeBuilderGateSequence(startFinishId = null, startFinishOpeningIndex = null) {
  if (!builderGates.length) return;
  const slots = builderGateRouteSlots();
  const previousStartFinish = slots.find((slot) => slot.isStartFinish);
  const requestedStartFinish = startFinishId
    ? slots.find((slot) => slot.gate.id === startFinishId
      && slot.openingIndex === startFinishOpeningIndex)
    : null;
  const startFinish = requestedStartFinish || previousStartFinish || slots[0];
  const checkpoints = slots.filter((slot) => slot !== startFinish
    && (slot.routeOrder > 0 || slot === previousStartFinish));
  checkpoints.sort((a, b) => {
    const aOrder = a === previousStartFinish ? Number.MAX_SAFE_INTEGER : a.routeOrder;
    const bOrder = b === previousStartFinish ? Number.MAX_SAFE_INTEGER : b.routeOrder;
    return aOrder - bOrder;
  });
  checkpoints.forEach((slot, index) => {
    setBuilderGateRouteSlotOrder(slot, index + 1);
  });
  slots.filter((slot) => slot !== startFinish && !checkpoints.includes(slot) && slot.routeOrder <= 0)
    .forEach((slot) => setBuilderGateRouteSlotOrder(slot, 0));
  slots.forEach((slot) => {
    if (slot.openingIndex === null) slot.gate.isStartFinish = slot === startFinish;
    else slot.gate.entryStartFinish[slot.openingIndex] = slot === startFinish;
  });
  if (startFinish) setBuilderGateRouteSlotOrder(startFinish, 0);
  const slotsAfterOrdering = builderGateRouteSlots();
  const firstOrderByGate = new Map();
  slotsAfterOrdering.forEach((slot) => {
    if (slot.routeOrder > 0 && !firstOrderByGate.has(slot.gate.id)) firstOrderByGate.set(slot.gate.id, slot.routeOrder);
  });
  builderGates.sort((a, b) => {
    const aIsStartFinish = startFinish?.gate.id === a.id;
    const bIsStartFinish = startFinish?.gate.id === b.id;
    const aOrder = aIsStartFinish ? 0 : firstOrderByGate.get(a.id) ?? Number.MAX_SAFE_INTEGER;
    const bOrder = bIsStartFinish ? 0 : firstOrderByGate.get(b.id) ?? Number.MAX_SAFE_INTEGER;
    return aOrder - bOrder;
  });
  builderGates.forEach((gate) => {
    const object = customGateObjects.find((item) => item.userData.gateId === gate.id);
    if (object) {
      object.userData.gateData = gate;
      updateBuilderGateBadge(object, gate);
    }
  });
}

function orderedBuilderGates() {
  const slots = builderGateRouteSlots();
  if (!slots.length) return [];
  const startFinish = slots.find((slot) => slot.isStartFinish) || slots[0];
  const checkpoints = slots.filter((slot) => slot !== startFinish && slot.routeOrder > 0)
    .sort((a, b) => a.routeOrder - b.routeOrder);
  return [startFinish, ...checkpoints];
}

function updateRelayPodiumGateIndicator(propObject, routeSlot, gateObject, stationIndex) {
  const indicator = propObject.userData.relayPodiumGateIndicator;
  if (!indicator || !routeSlot || !gateObject) return;
  const openingIndex = Number.isInteger(routeSlot.openingIndex) ? routeSlot.openingIndex : 0;
  const gateData = routeSlot.gate;
  const entryDirection = gateData.entryDirections?.[openingIndex] ?? gateData.entryDirection ?? 1;
  if (entryDirection === 0) {
    indicator.userData.frontPanel.material.color.setHex(gateBoundaryWrongColor);
    indicator.userData.backPanel.material.color.setHex(gateBoundaryWrongColor);
    indicator.userData.paired = true;
    indicator.userData.showInBuilder = currentPage === 'builder' && !flying;
    indicator.visible = indicator.userData.showInBuilder;
    indicator.userData.numberBadges.forEach((badge) => {
      if (badge.userData.displayLabel !== 'N/A' || badge.userData.isEntrySide !== false) {
        drawRelayPodiumGateNumberBadge(badge, 'N/A', false);
        badge.userData.displayLabel = 'N/A';
        badge.userData.isEntrySide = false;
      }
    });
    return;
  }

  gateObject.updateWorldMatrix(true, false);
  propObject.updateWorldMatrix(true, false);
  const plane = gateObject.userData.gatePassPlanes?.[openingIndex];
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(gateObject.matrixWorld);
  const approachNormal = plane
    ? plane.normal.clone().applyMatrix3(normalMatrix).normalize()
    : new THREE.Vector3(0, 0, 1).applyQuaternion(gateObject.getWorldQuaternion(new THREE.Quaternion()));
  approachNormal.y = 0;
  if (approachNormal.lengthSq() < 0.001) approachNormal.set(0, 0, 1);
  approachNormal.normalize().multiplyScalar(entryDirection === -1 ? -1 : 1);

  const propForward = new THREE.Vector3(0, 0, 1)
    .applyQuaternion(propObject.getWorldQuaternion(new THREE.Quaternion()));
  propForward.y = 0;
  if (propForward.lengthSq() < 0.001) propForward.set(0, 0, 1);
  propForward.normalize();
  const frontIsEntry = propForward.dot(approachNormal) >= 0;
  const frontPanel = indicator.userData.frontPanel;
  const backPanel = indicator.userData.backPanel;
  frontPanel.material.color.setHex(frontIsEntry ? gateBoundaryCorrectColor : gateBoundaryWrongColor);
  backPanel.material.color.setHex(frontIsEntry ? gateBoundaryWrongColor : gateBoundaryCorrectColor);

  const label = routeSlot.isStartFinish ? 'S / F' : String(stationIndex).padStart(2, '0');
  for (const badge of indicator.userData.numberBadges) {
    const isEntrySide = badge.userData.badgeSide === 'front' ? frontIsEntry : !frontIsEntry;
    if (badge.userData.displayLabel !== label || badge.userData.isEntrySide !== isEntrySide) {
      drawRelayPodiumGateNumberBadge(badge, label, isEntrySide);
      badge.userData.displayLabel = label;
      badge.userData.isEntrySide = isEntrySide;
    }
  }
  indicator.userData.paired = true;
  indicator.userData.showInBuilder = currentPage === 'builder' && !flying;
  indicator.visible = indicator.userData.showInBuilder;
}

function updateBuilderRelayPodiumGateIndicators() {
  const relayPodiums = builderPropObjects.filter((object) => object.userData.propType === 'relay-podium-gate');
  const showInBuilder = currentPage === 'builder' && !flying;
  relayPodiums.forEach((podium, index) => {
    const indicator = podium.userData.relayPodiumGateIndicator;
    if (indicator) {
      indicator.userData.paired = false;
      indicator.userData.showInBuilder = showInBuilder;
      indicator.visible = showInBuilder;
      const fallbackLabel = String(index + 1).padStart(2, '0');
      indicator.userData.numberBadges.forEach((badge) => {
        const isEntrySide = badge.userData.badgeSide === 'front';
        if (badge.userData.displayLabel !== fallbackLabel || badge.userData.isEntrySide !== isEntrySide) {
          drawRelayPodiumGateNumberBadge(badge, fallbackLabel, isEntrySide);
          badge.userData.displayLabel = fallbackLabel;
          badge.userData.isEntrySide = isEntrySide;
        }
      });
    }
  });
  if (!showInBuilder || !relayPodiums.length) return;

  const availablePodiums = relayPodiums.slice();
  const stations = orderedBuilderGates().slice(0, RELAY_STATION_COUNT);
  stations.forEach((routeSlot, stationIndex) => {
    const gateObject = customGateObjects.find((object) => object.userData.gateId === routeSlot.gate.id);
    if (!gateObject || !availablePodiums.length) return;
    gateObject.updateWorldMatrix(true, false);
    const gatePosition = gateObject.getWorldPosition(new THREE.Vector3());
    let nearestIndex = -1;
    let nearestDistance = Infinity;
    availablePodiums.forEach((podium, index) => {
      podium.updateWorldMatrix(true, false);
      const position = podium.getWorldPosition(new THREE.Vector3());
      const distance = Math.hypot(gatePosition.x - position.x, gatePosition.z - position.z);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = index;
      }
    });
    if (nearestIndex < 0 || nearestDistance > RELAY_GATE_PODIUM_DISTANCE) return;
    const podium = availablePodiums.splice(nearestIndex, 1)[0];
    updateRelayPodiumGateIndicator(podium, routeSlot, gateObject, stationIndex);
  });
}

function clearRaceLineGroup(group) {
  for (const object of [...group.children]) {
    group.remove(object);
    object.geometry?.dispose();
    if (Array.isArray(object.material)) object.material.forEach((material) => material.dispose());
    else object.material?.dispose();
  }
}

function clearFlightRaceLine() {
  clearRaceLineGroup(flightRaceLineRoot);
  flightRaceLineRoot.visible = false;
}

function createRoundedRaceLineTransition(start, end, outgoingDirection, incomingDirection) {
  const offset = end.clone().sub(start);
  const distance = offset.length();
  if (distance < 0.05) return new THREE.LineCurve3(start, end);
  const chordDirection = offset.normalize();
  const outgoing = outgoingDirection.lengthSq() > 1e-6 ? outgoingDirection.clone().normalize() : chordDirection;
  const incoming = incomingDirection.lengthSq() > 1e-6 ? incomingDirection.clone().normalize() : chordDirection;
  const handleLength = Math.min(6, distance * 0.36);
  return new THREE.CubicBezierCurve3(
    start,
    start.clone().addScaledVector(outgoing, handleLength),
    end.clone().addScaledVector(incoming, -handleLength),
    end,
  );
}

function addFlightRaceLineCurve(curve, radius, color, opacity) {
  const length = curve.getLength();
  if (length < 0.05) return;
  const geometry = new THREE.TubeGeometry(curve, THREE.MathUtils.clamp(Math.ceil(length / 1.35), 12, 960), radius, 5, false);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 12;
  mesh.userData.skipFlightCollision = true;
  flightRaceLineRoot.add(mesh);
}

function addFlightRaceLinePath(points, radius, color, opacity) {
  if (points.length < 2) return;
  const curve = points.length > 2
    ? new THREE.CatmullRomCurve3(points, false, 'centripetal')
    : new THREE.LineCurve3(points[0], points[1]);
  addFlightRaceLineCurve(curve, radius, color, opacity);
}

function buildFlightRaceLineFromCourseEntries() {
  const route = [];
  const seenOpenings = new Map();
  for (const entry of flightCourseEntries) {
    const gate = entry?.object;
    if (!gate) continue;
    gate.updateWorldMatrix(true, false);
    const planes = gate.userData.gatePassPlanes || [];
    const gateData = gate.userData.gateData || {};
    const directions = gateData.entryDirections || [];
    const routeOrders = gateData.entryRouteOrders || [];
    const startFinishFlags = gateData.entryStartFinish || [];
    let openingIndex = Number.isInteger(entry.planeIndex) ? entry.planeIndex : -1;
    if (openingIndex < 0 || openingIndex >= planes.length || directions[openingIndex] === 0) {
      openingIndex = planes.findIndex((plane, index) => plane
        && directions[index] !== 0
        && (routeOrders[index] === entry.routeNumber || startFinishFlags[index] === entry.isStartFinish));
    }
    if (openingIndex < 0) openingIndex = planes.findIndex((plane, index) => plane && directions[index] !== 0);
    const plane = planes[openingIndex];
    if (!plane) continue;
    const gateKey = gate.uuid;
    const gateOpenings = seenOpenings.get(gateKey) || new Set();
    if (gateOpenings.has(openingIndex)) continue;
    gateOpenings.add(openingIndex);
    seenOpenings.set(gateKey, gateOpenings);

    const entryDirection = directions[openingIndex] ?? gateData.entryDirection ?? 1;
    if (entryDirection === 0) continue;
    const center = plane.point.clone().applyMatrix4(gate.matrixWorld);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(gate.matrixWorld);
    const travelDirection = plane.normal.clone().applyMatrix3(normalMatrix).normalize()
      .multiplyScalar(entryDirection === -1 ? 1 : -1);
    const widthEdge = plane.point.clone().addScaledVector(plane.widthAxis, plane.width).applyMatrix4(gate.matrixWorld);
    const heightEdge = plane.point.clone().addScaledVector(plane.heightAxis, plane.height).applyMatrix4(gate.matrixWorld);
    const lead = THREE.MathUtils.clamp(Math.min(center.distanceTo(widthEdge), center.distanceTo(heightEdge)) * 0.46, 3, 8);
    route.push({
      approach: center.clone().addScaledVector(travelDirection, -lead),
      center,
      exit: center.clone().addScaledVector(travelDirection, lead),
    });
  }
  return route.flatMap(({ approach, center, exit }) => [approach, center, exit]);
}

function refreshFlightRaceLine() {
  clearFlightRaceLine();
  let points = [];
  if (currentPage === 'builder') {
    if (builderTestCourse && builderRaceLineGenerated) points = builderRaceLinePoints.map((point) => point.clone());
  } else if (Array.isArray(activeTrack?.raceLine)) {
    points = activeTrack.raceLine.slice(0, 240).flatMap((point) => {
      if (!Array.isArray(point) || point.length !== 3 || point.some((value) => !Number.isFinite(Number(value)))) return [];
      return [new THREE.Vector3(Number(point[0]), Number(point[1]), Number(point[2]))];
    });
  }
  if (points.length < 3 || points.length % 3 !== 0) points = buildFlightRaceLineFromCourseEntries();
  if (points.length < 3 || points.length % 3 !== 0) return;

  if (launchPadState?.position) {
    const launch = launchPadState.position.clone();
    const first = points[0];
    const rise = Math.max(1.5, Math.min(4, launch.distanceTo(first) * 0.06));
    const curvePoint = launch.clone().lerp(first, 0.38).add(new THREE.Vector3(0, rise, 0));
    addFlightRaceLinePath([launch, curvePoint, first], 0.055, 0x39ffd0, 0.24);
  }
  const gateCount = points.length / 3;
  for (let gateIndex = 0; gateIndex < gateCount; gateIndex += 1) {
    const pointIndex = gateIndex * 3;
    addFlightRaceLinePath(points.slice(pointIndex, pointIndex + 3), 0.055, 0x39ffd0, 0.24);
    const nextPointIndex = ((gateIndex + 1) % gateCount) * 3;
    addFlightRaceLineCurve(createRoundedRaceLineTransition(
      points[pointIndex + 2],
      points[nextPointIndex],
      points[pointIndex + 2].clone().sub(points[pointIndex + 1]),
      points[nextPointIndex + 1].clone().sub(points[nextPointIndex]),
    ), 0.045, 0x39ffd0, 0.2);
  }
  flightRaceLineRoot.visible = flying && raceLineEnabled
    && (selectedMode === 'Race' || isMultiplayerRaceActive() || builderTestCourse);
}

function clearBuilderRaceLine() {
  clearRaceLineGroup(builderRaceLinePathRoot);
  clearRaceLineGroup(builderRaceLineHandleRoot);
  builderRaceLineRoot.visible = false;
  builderRaceLineHandles = [];
  builderRaceLinePoints = [];
  builderRaceLineGateRefs = [];
  builderRaceLineGenerated = false;
  selectedBuilderRaceLinePointIndex = null;
  document.querySelector('#deleteBuilderRaceLine').disabled = true;
}

function addBuilderRaceLineTube(curve, radius, color, opacity, segments) {
  if (curve.getLength() < 0.05) return;
  const geometry = new THREE.TubeGeometry(curve, segments, radius, 5, false);
  const material = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    depthTest: true,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 12;
  mesh.userData.skipFlightCollision = true;
  builderRaceLinePathRoot.add(mesh);
}

function rebuildBuilderRaceLineHandles() {
  clearRaceLineGroup(builderRaceLineHandleRoot);
  builderRaceLineHandles = builderRaceLinePoints.map((point, index) => {
    const isGateCenter = index % 3 === 1;
    const handle = new THREE.Mesh(
      new THREE.SphereGeometry(0.34, 10, 8),
      new THREE.MeshBasicMaterial({
        color: isGateCenter ? 0x70ff9a : 0x73f6ff,
        transparent: true,
        opacity: 0.58,
        depthWrite: false,
        depthTest: false,
        toneMapped: false,
      }),
    );
    handle.position.copy(point);
    handle.renderOrder = 13;
    handle.userData.isBuilderRaceLineHandle = true;
    handle.userData.raceLinePointIndex = index;
    builderRaceLineHandleRoot.add(handle);
    return handle;
  });
}

function builderRaceLineLaunchPoint() {
  const launchType = builderGameMode === 'relay-race' ? 'relay-podium-gate' : 'podium';
  const launchPoints = builderPropObjects.filter((object) => object.userData.propType === launchType).flatMap((object) => {
    object.updateWorldMatrix(true, true);
    const bounds = new THREE.Box3().setFromObject(object);
    if (bounds.isEmpty()) return [];
    return [new THREE.Vector3(
      (bounds.min.x + bounds.max.x) / 2,
      bounds.max.y + 0.68,
      (bounds.min.z + bounds.max.z) / 2,
    )];
  });
  if (!launchPoints.length) return null;
  return launchPoints.reduce((center, point) => center.add(point), new THREE.Vector3())
    .multiplyScalar(1 / launchPoints.length);
}

function builderRaceLineGatePlaneObstacles() {
  return customGateObjects.flatMap((object) => {
    const data = object.userData.gateData;
    const planes = object.userData.gatePassPlanes || [];
    object.updateWorldMatrix(true, false);
    return planes.map((plane, openingIndex) => {
      const center = plane.point.clone().applyMatrix4(object.matrixWorld);
      const widthEdge = plane.point.clone().addScaledVector(plane.widthAxis, plane.width / 2).applyMatrix4(object.matrixWorld);
      const heightEdge = plane.point.clone().addScaledVector(plane.heightAxis, plane.height / 2).applyMatrix4(object.matrixWorld);
      const widthOffset = widthEdge.sub(center);
      const heightOffset = heightEdge.sub(center);
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld);
      return {
        key: `${data.id}:${openingIndex}`,
        direction: data.entryDirections?.[openingIndex] ?? data.entryDirection ?? 1,
        center,
        normal: plane.normal.clone().applyMatrix3(normalMatrix).normalize(),
        widthAxis: widthOffset.clone().normalize(),
        heightAxis: heightOffset.clone().normalize(),
        halfWidth: widthOffset.length(),
        halfHeight: heightOffset.length(),
        clearance: 1.35,
      };
    });
  });
}

function builderRaceLinePlaneCrossing(start, end, obstacle) {
  const startDistance = start.clone().sub(obstacle.center).dot(obstacle.normal);
  const endDistance = end.clone().sub(obstacle.center).dot(obstacle.normal);
  if (startDistance * endDistance >= -1e-6) return null;
  const amount = startDistance / (startDistance - endDistance);
  if (amount <= 1e-4 || amount >= 1 - 1e-4) return null;
  const crossing = start.clone().lerp(end, amount).sub(obstacle.center);
  const widthOffset = crossing.dot(obstacle.widthAxis);
  const heightOffset = crossing.dot(obstacle.heightAxis);
  if (Math.abs(widthOffset) > obstacle.halfWidth + obstacle.clearance
    || Math.abs(heightOffset) > obstacle.halfHeight + obstacle.clearance) return null;
  return { widthOffset, heightOffset };
}

function builderRaceLinePointInsideGatePlane(point, obstacle) {
  const relative = point.clone().sub(obstacle.center);
  if (Math.abs(relative.dot(obstacle.normal)) > 0.25) return false;
  return Math.abs(relative.dot(obstacle.widthAxis)) <= obstacle.halfWidth + obstacle.clearance
    && Math.abs(relative.dot(obstacle.heightAxis)) <= obstacle.halfHeight + obstacle.clearance;
}

function builderRaceLineDetourPoint(start, end, obstacle, crossing, obstacles = []) {
  const clamp = (value, limit) => THREE.MathUtils.clamp(value, -limit, limit);
  const candidates = [];
  for (const extraClearance of [0, 1.5, 3, 6]) {
    const outerWidth = obstacle.halfWidth + obstacle.clearance + 0.65 + extraClearance;
    const outerHeight = obstacle.halfHeight + obstacle.clearance + 0.65 + extraClearance;
    candidates.push(...[
      [outerWidth, clamp(crossing.heightOffset, outerHeight)],
      [-outerWidth, clamp(crossing.heightOffset, outerHeight)],
      [clamp(crossing.widthOffset, outerWidth), outerHeight],
      [clamp(crossing.widthOffset, outerWidth), -outerHeight],
    ].map(([widthOffset, heightOffset]) => obstacle.center.clone()
      .addScaledVector(obstacle.widthAxis, widthOffset)
      .addScaledVector(obstacle.heightAxis, heightOffset)));
  }
  const safeCandidates = candidates.filter((candidate) => obstacles.every((other) => other.key === obstacle.key
    || !builderRaceLinePointInsideGatePlane(candidate, other)));
  return (safeCandidates.length ? safeCandidates : candidates)
    .sort((a, b) => start.distanceTo(a) + a.distanceTo(end) - start.distanceTo(b) - b.distanceTo(end))[0];
}

function routeBuilderRaceLineAroundPlanes(points, obstacles, skippedPlaneKey = null) {
  const routed = points.map((point) => point.clone());
  const maxInsertions = Math.max(8, obstacles.length * Math.max(4, points.length * 2));
  let insertions = 0;
  while (insertions < maxInsertions) {
    let inserted = false;
    for (let pointIndex = 0; pointIndex < routed.length && !inserted; pointIndex += 1) {
      for (const obstacle of obstacles) {
        if (obstacle.key === skippedPlaneKey || !builderRaceLinePointInsideGatePlane(routed[pointIndex], obstacle)) continue;
        const relative = routed[pointIndex].clone().sub(obstacle.center);
        routed[pointIndex] = builderRaceLineDetourPoint(routed[pointIndex], routed[pointIndex], obstacle, {
          widthOffset: relative.dot(obstacle.widthAxis),
          heightOffset: relative.dot(obstacle.heightAxis),
        }, obstacles);
        insertions += 1;
        inserted = true;
        break;
      }
    }
    for (let pointIndex = 0; pointIndex < routed.length - 1 && !inserted; pointIndex += 1) {
      for (const obstacle of obstacles) {
        if (obstacle.key === skippedPlaneKey) continue;
        const crossing = builderRaceLinePlaneCrossing(routed[pointIndex], routed[pointIndex + 1], obstacle);
        if (!crossing) continue;
        routed.splice(pointIndex + 1, 0, builderRaceLineDetourPoint(
          routed[pointIndex], routed[pointIndex + 1], obstacle, crossing, obstacles,
        ));
        insertions += 1;
        inserted = true;
        break;
      }
    }
    if (!inserted) break;
  }
  return routed;
}

function builderRaceLineCurveIsClear(curve, obstacles, skippedPlaneKey = null) {
  const sampleCount = THREE.MathUtils.clamp(Math.ceil(curve.getLength() * 2), 24, 960);
  let previous = curve.getPoint(0);
  if (obstacles.some((obstacle) => obstacle.key !== skippedPlaneKey
    && builderRaceLinePointInsideGatePlane(previous, obstacle))) return false;
  for (let sample = 1; sample <= sampleCount; sample += 1) {
    const current = curve.getPoint(sample / sampleCount);
    for (const obstacle of obstacles) {
      if (obstacle.key === skippedPlaneKey) continue;
      if (builderRaceLinePointInsideGatePlane(current, obstacle)
        || builderRaceLinePlaneCrossing(previous, current, obstacle)) return false;
    }
    previous = current;
  }
  return true;
}

function builderRaceLineNearbyPlanes(points, obstacles) {
  const bounds = new THREE.Box3().setFromPoints(points).expandByScalar(4);
  return obstacles.filter((obstacle) => {
    const gateRadius = Math.hypot(obstacle.halfWidth, obstacle.halfHeight) + obstacle.clearance;
    return bounds.distanceToPoint(obstacle.center) <= gateRadius;
  });
}

function builderRaceLineCurveCrossesPlaneCorrectly(curve, obstacle) {
  if (obstacle.direction === 0) return false;
  const sampleCount = THREE.MathUtils.clamp(Math.ceil(curve.getLength() * 2), 24, 960);
  let previous = curve.getPoint(0);
  let crossingCount = 0;
  for (let sample = 1; sample <= sampleCount; sample += 1) {
    const current = curve.getPoint(sample / sampleCount);
    if (builderRaceLinePlaneCrossing(previous, current, obstacle)) {
      const previousDistance = previous.clone().sub(obstacle.center).dot(obstacle.normal);
      const currentDistance = current.clone().sub(obstacle.center).dot(obstacle.normal);
      const correctDirection = obstacle.direction === 1
        ? previousDistance > 0 && currentDistance < 0
        : previousDistance < 0 && currentDistance > 0;
      if (!correctDirection || ++crossingCount > 1) return false;
    }
    previous = current;
  }
  return true;
}

function refreshBuilderRaceLineGeometry() {
  clearRaceLineGroup(builderRaceLinePathRoot);
  builderRaceLineRoot.visible = currentPage === 'builder' && !flying && builderRaceLineGenerated;
  if (!builderRaceLineGenerated || builderRaceLinePoints.length < 3) return;

  const obstacles = builderRaceLineGatePlaneObstacles();
  const addPath = (points, isMainRoute = false, skippedPlaneKey = null, transitionDirections = null) => {
    if (points.length < 2) return;
    let curve = points.length > 2
      ? new THREE.CatmullRomCurve3(points, false, 'centripetal')
      : transitionDirections
        ? createRoundedRaceLineTransition(points[0], points[1], transitionDirections.outgoing, transitionDirections.incoming)
        : new THREE.LineCurve3(points[0], points[1]);
    const nearbyObstacles = builderRaceLineNearbyPlanes([...points, ...curve.getPoints(16)], obstacles);
    const skippedPlane = nearbyObstacles.find((obstacle) => obstacle.key === skippedPlaneKey);
    const planeCrossingIsValid = !skippedPlane || builderRaceLineCurveCrossesPlaneCorrectly(curve, skippedPlane);
    if (!planeCrossingIsValid || !builderRaceLineCurveIsClear(curve, nearbyObstacles, skippedPlaneKey)) {
      const linearPath = new THREE.CurvePath();
      for (let index = 0; index < points.length - 1; index += 1) {
        linearPath.add(new THREE.LineCurve3(points[index], points[index + 1]));
      }
      curve = linearPath;
    }
    const segments = THREE.MathUtils.clamp(Math.ceil(curve.getLength() / 1.35), 24, 960);
    addBuilderRaceLineTube(curve, isMainRoute ? 0.075 : 0.06, 0x39ffd0, isMainRoute ? 0.28 : 0.22, segments);
  };

  const firstApproach = builderRaceLinePoints[0];
  const launch = builderRaceLineLaunchPoint();
  if (launch) {
    const rise = Math.max(1.5, Math.min(4, launch.distanceTo(firstApproach) * 0.06));
    const curvePoint = launch.clone().lerp(firstApproach, 0.38).add(new THREE.Vector3(0, rise, 0));
    addPath(routeBuilderRaceLineAroundPlanes([launch, curvePoint, firstApproach], obstacles));
  }
  for (let gateIndex = 0; gateIndex < builderRaceLinePoints.length / 3; gateIndex += 1) {
    const pointIndex = gateIndex * 3;
    const gateRef = builderRaceLineGateRefs[gateIndex];
    const targetPlaneKey = gateRef ? `${gateRef.gateId}:${gateRef.openingIndex}` : null;
    const targetPlane = obstacles.find((obstacle) => obstacle.key === targetPlaneKey);
    const startDistance = targetPlane
      ? builderRaceLinePoints[pointIndex].clone().sub(targetPlane.center).dot(targetPlane.normal)
      : 0;
    const endDistance = targetPlane
      ? builderRaceLinePoints[pointIndex + 2].clone().sub(targetPlane.center).dot(targetPlane.normal)
      : 0;
    const crossesInGreenDirection = targetPlane?.direction === 1
      ? startDistance > 0 && endDistance < 0
      : targetPlane?.direction === -1 && startDistance < 0 && endDistance > 0;
    const allowedPlaneKey = crossesInGreenDirection ? targetPlaneKey : null;
    addPath(routeBuilderRaceLineAroundPlanes(
      builderRaceLinePoints.slice(pointIndex, pointIndex + 3),
      obstacles,
      allowedPlaneKey,
    ), true, allowedPlaneKey);
    if (gateIndex >= builderRaceLinePoints.length / 3 - 1) continue;
    addPath(routeBuilderRaceLineAroundPlanes([
      builderRaceLinePoints[pointIndex + 2],
      builderRaceLinePoints[pointIndex + 3],
    ], obstacles), true, null, {
      outgoing: builderRaceLinePoints[pointIndex + 2].clone().sub(builderRaceLinePoints[pointIndex + 1]),
      incoming: builderRaceLinePoints[pointIndex + 4].clone().sub(builderRaceLinePoints[pointIndex + 3]),
    });
  }
  builderRaceLineHandles.forEach((handle, index) => handle.position.copy(builderRaceLinePoints[index]));
}

function generateBuilderRaceLine() {
  const route = orderedBuilderGates().map((slot) => {
    const object = customGateObjects.find((candidate) => candidate.userData.gateId === slot.gate.id);
    if (!object) return null;
    object.updateWorldMatrix(true, false);
    const firstGreenOpening = slot.gate.entryDirections?.findIndex((direction) => direction !== 0) ?? -1;
    const openingIndex = slot.openingIndex ?? (firstGreenOpening >= 0 ? firstGreenOpening : 0);
    const plane = object.userData.gatePassPlanes?.[openingIndex] || object.userData.gatePassPlanes?.[0];
    if (!plane) return null;

    const center = plane.point.clone().applyMatrix4(object.matrixWorld);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(object.matrixWorld);
    const normal = plane.normal.clone().applyMatrix3(normalMatrix).normalize();
    const direction = slot.gate.entryDirections?.[openingIndex] ?? slot.gate.entryDirection ?? 1;
    const travelDirection = normal.multiplyScalar(direction === -1 ? 1 : -1);
    const widthEdge = plane.point.clone().addScaledVector(plane.widthAxis, plane.width).applyMatrix4(object.matrixWorld);
    const heightEdge = plane.point.clone().addScaledVector(plane.heightAxis, plane.height).applyMatrix4(object.matrixWorld);
    const lead = THREE.MathUtils.clamp(Math.min(center.distanceTo(widthEdge), center.distanceTo(heightEdge)) * 0.46, 3, 8);
    return {
      gateId: slot.gate.id,
      openingIndex,
      center,
      approach: center.clone().addScaledVector(travelDirection, -lead),
      exit: center.clone().addScaledVector(travelDirection, lead),
    };
  }).filter(Boolean);

  if (!route.length) {
    showToast('Place and number the track gates before generating a race line.');
    return;
  }
  detachBuilderPropTransform();
  clearBuilderRaceLine();
  builderRaceLineGateRefs = route.map(({ gateId, openingIndex }) => ({ gateId, openingIndex }));
  selectedGateId = null;
  selectedBuilderPropId = null;
  selectedEnvironmentBuildingId = null;
  builderSelectionHelper.visible = false;
  document.querySelectorAll('[data-gate-type], [data-builder-prop]').forEach((button) => button.classList.remove('is-selected'));
  route.forEach((gate) => builderRaceLinePoints.push(gate.approach, gate.center, gate.exit));
  builderRaceLineGenerated = true;
  rebuildBuilderRaceLineHandles();
  document.querySelector('#builderPlacementStatus').textContent = 'RACE LINE / SELECT A POINT TO MOVE';
  invalidateBuilderTrackPicture();
  updateBuilderDisplay();
  showToast('Race line generated. Click a glowing point to move that part of the route.');
}

function setBuilderGateRouteNumber(selected, requestedNumber, openingIndex = null) {
  const slots = builderGateRouteSlots();
  const selectedSlot = slots.find((slot) => slot.gate.id === selected.id && slot.openingIndex === openingIndex)
    || slots.find((slot) => slot.gate.id === selected.id && slot.openingIndex === null);
  if (!selectedSlot || selectedSlot.isStartFinish) return;
  const checkpoints = slots.filter((slot) => slot !== selectedSlot && !slot.isStartFinish && slot.routeOrder > 0)
    .sort((a, b) => a.routeOrder - b.routeOrder);
  if (requestedNumber === 0) {
    setBuilderGateRouteSlotOrder(selectedSlot, 0);
    checkpoints.forEach((slot, index) => { setBuilderGateRouteSlotOrder(slot, index + 1); });
  } else {
    const requested = THREE.MathUtils.clamp(Math.floor(requestedNumber), 1, checkpoints.length + 1);
    checkpoints.splice(requested - 1, 0, selectedSlot);
    checkpoints.forEach((slot, index) => { setBuilderGateRouteSlotOrder(slot, index + 1); });
  }
  normalizeBuilderGateSequence();
  invalidateBuilderTrackPicture();
  updateBuilderDisplay();
}

function updateBuilderDisplay() {
  const relayMode = builderGameMode === 'relay-race';
  const podiumCount = relayMode ? builderRelayPodiumGateCount() : builderPodiumCount();
  const routeSlots = builderGateRouteSlots();
  updateBuilderRelayPodiumGateIndicators();
  const hasStartFinish = routeSlots.some((slot) => slot.isStartFinish);
  const countedGateCount = routeSlots.filter((slot) => slot.isStartFinish || slot.routeOrder > 0).length;
  document.querySelector('#gateCount').textContent = `${String(countedGateCount).padStart(2, '0')} GATES / ${String(builderProps.length).padStart(2, '0')} OBJECTS`;
  const podiumRequirement = builderGameMode === 'relay-race' ? RELAY_STATION_COUNT : REQUIRED_TRACK_PODIUM_COUNT;
  document.querySelector('#builderSummary').textContent = `${podiumCount}/${podiumRequirement} ${relayMode ? 'RELAY PODIUMS' : 'PODIUMS'} / ${hasStartFinish ? 'START SET' : 'START NEEDED'}`;
  const podiumAssetDescription = document.querySelector('[data-builder-prop="podium"] small');
  if (podiumAssetDescription) podiumAssetDescription.textContent = `${REQUIRED_TRACK_PODIUM_COUNT} required`;
  const relayPodiumGateDescription = document.querySelector('[data-builder-prop="relay-podium-gate"] small');
  if (relayPodiumGateDescription) relayPodiumGateDescription.textContent = `${RELAY_STATION_COUNT} required · ${builderRelayPodiumGateCount()}/${RELAY_STATION_COUNT}`;
  const relayPodiumGateButton = document.querySelector('[data-builder-prop="relay-podium-gate"]');
  if (relayPodiumGateButton) relayPodiumGateButton.disabled = !relayMode || builderRelayPodiumGateCount() >= RELAY_STATION_COUNT;
  const selected = builderGates.find((gate) => gate.id === selectedGateId);
  const inspector = document.querySelector('#gateInspector');
  inspector.hidden = !selected;
  const routeNumberControl = document.querySelector('#gateRouteNumberControl');
  const routeNumberLabel = document.querySelector('#gateRouteNumberLabel');
  const routeNumberInput = document.querySelector('#gateRouteNumber');
  const startFinishInput = document.querySelector('#gateStartFinish');
  const startFinishControl = startFinishInput.closest('.builder-role-toggle');
  routeNumberControl.hidden = !selected || selectedGateOpeningIndex === null;
  const selectedHasMultipleOpenings = selected && builderGateRouteOpeningCount(selected) > 1;
  const selectedRouteSlot = routeSlots.find((slot) => slot.gate.id === selected?.id
    && slot.openingIndex === (selectedHasMultipleOpenings ? selectedGateOpeningIndex : null));
  const selectedRouteOrder = selectedRouteSlot?.routeOrder ?? Number(selected?.routeOrder) ?? 0;
  const selectedIsStartFinish = Boolean(selectedRouteSlot?.isStartFinish ?? selected?.isStartFinish);
  const numberedGateCount = routeSlots.filter((slot) => !slot.isStartFinish && slot.routeOrder > 0).length;
  routeNumberInput.max = String(Math.max(1, numberedGateCount + (selected && selectedRouteOrder === 0 && !selectedIsStartFinish ? 1 : 0)));
  const selectedDirection = selected?.entryDirections?.[selectedGateOpeningIndex ?? 0] ?? selected?.entryDirection ?? 1;
  routeNumberInput.disabled = !selected || selectedIsStartFinish || !selectedRouteSlot || selectedDirection === 0;
  routeNumberLabel.textContent = selectedHasMultipleOpenings && selectedGateOpeningIndex !== null
    ? `${builderGateOpeningLabel(selected, selectedGateOpeningIndex).toUpperCase()} ROUTE NUMBER (0 = N/A)`
    : 'ROUTE NUMBER (0 = N/A)';
  startFinishControl.hidden = !selected || selectedGateOpeningIndex === null;
  startFinishInput.disabled = !selectedRouteSlot;
  startFinishInput.checked = selectedIsStartFinish;
  const startFinishText = startFinishControl.querySelector('b');
  startFinishText.textContent = selectedHasMultipleOpenings && selectedGateOpeningIndex !== null
    ? `${builderGateOpeningLabel(selected, selectedGateOpeningIndex).toUpperCase()} / START + FINISH`
    : 'START / FINISH';
  const selectedProp = builderProps.find((prop) => prop.id === selectedBuilderPropId);
  const selectedEnvironmentBuilding = builderEnvironmentBuildings.find((item) => item.id === selectedEnvironmentBuildingId);
  document.querySelector('#propInspector').hidden = !selectedProp && !selectedEnvironmentBuilding;
  const launchOption = document.querySelector('#builderLaunchPodiumOption');
  launchOption.hidden = selectedProp?.type !== 'podium';
  document.querySelector('#builderPropLaunch').checked = Boolean(selectedProp?.isLaunchPodium);
  if (selectedProp) {
    document.querySelector('#selectedPropName').textContent = `${builderPropTypes[selectedProp.type]} environment object`;
  } else if (selectedEnvironmentBuilding) {
    document.querySelector('#selectedPropName').textContent = selectedEnvironmentBuilding.label;
  }
  if (selected) {
    const selectedGatePrefix = selectedHasMultipleOpenings && selectedGateOpeningIndex !== null
      ? `${gateTypes[selected.type].name} / ${builderGateOpeningLabel(selected, selectedGateOpeningIndex)}`
      : gateTypes[selected.type].name;
    document.querySelector('#selectedGateName').textContent = selectedIsStartFinish
      ? `${selectedGatePrefix} / Start + Finish`
      : selectedRouteOrder === 0
        ? `${selectedGatePrefix} / N/A`
        : `${selectedGatePrefix} / Gate ${selectedRouteOrder}`;
    routeNumberInput.value = selectedIsStartFinish ? '' : String(selectedRouteOrder);
    document.querySelector('#gateColor').value = selected.color;
  }
  refreshBuilderRaceLineGeometry();
  document.querySelector('#deleteBuilderRaceLine').disabled = !builderRaceLineGenerated;
  updateBuilderPublishState();
}

const builderMoveKeys = new Set();
const builderMoveForward = new THREE.Vector3();
const builderMoveRight = new THREE.Vector3();
const builderMoveDelta = new THREE.Vector3();
const builderCameraUp = new THREE.Vector3(0, 1, 0);
function updateBuilderCameraMovement(deltaSeconds) {
  if (currentPage !== 'builder' || builderMoveKeys.size === 0) return;
  camera.getWorldDirection(builderMoveForward);
  builderMoveForward.y = 0;
  if (builderMoveForward.lengthSq() < 0.001) return;
  builderMoveForward.normalize();
  builderMoveRight.crossVectors(builderMoveForward, builderCameraUp).normalize();
  builderMoveDelta.set(0, 0, 0);
  if (builderMoveKeys.has('KeyW')) builderMoveDelta.add(builderMoveForward);
  if (builderMoveKeys.has('KeyS')) builderMoveDelta.sub(builderMoveForward);
  if (builderMoveKeys.has('KeyD')) builderMoveDelta.add(builderMoveRight);
  if (builderMoveKeys.has('KeyA')) builderMoveDelta.sub(builderMoveRight);
  if (builderMoveKeys.has('KeyE')) builderMoveDelta.y += 1;
  if (builderMoveKeys.has('KeyQ')) builderMoveDelta.y -= 1;
  if (builderMoveDelta.lengthSq() === 0) return;
  const speed = (builderMoveKeys.has('ShiftLeft') || builderMoveKeys.has('ShiftRight')) ? 96 : 38;
  builderMoveDelta.normalize().multiplyScalar(speed * deltaSeconds);
  camera.position.add(builderMoveDelta);
  orbit.target.add(builderMoveDelta);
}

function setBuilderCamera(distanceMultiplier = 1) {
  builderMoveKeys.clear();
  camera.position.set(30 * distanceMultiplier, 1.2 + (24 - 1.2) * distanceMultiplier, menuPlatformCenterZ + 34 * distanceMultiplier);
  orbit.target.set(0, 1.2, menuPlatformCenterZ);
  orbit.update();
}

const builderTransformToolbar = document.querySelector('#builderTransformToolbar');

function syncBuilderTransformToolbar() {
  const active = currentPage === 'builder' && !flying && Boolean(selectedBuilderPropId || selectedGateId || selectedEnvironmentBuildingId || selectedBuilderRaceLinePointIndex !== null);
  builderTransformControls.enabled = active;
  builderTransformHelper.visible = active;
  builderTransformToolbar.hidden = !active;
  builderTransformToolbar.querySelectorAll('[data-transform-mode]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.transformMode === builderTransformMode);
  });
  builderTransformToolbar.querySelectorAll('[data-transform-axis]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.transformAxis === builderTransformAxis);
  });
  builderTransformToolbar.querySelectorAll('[data-transform-space]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.transformSpace === builderTransformSpace);
  });
}

function setBuilderTransformAxis(axis) {
  builderTransformAxis = axis;
  for (const key of ['X', 'Y', 'Z']) builderTransformControls[`show${key}`] = axis === 'all' || axis === key.toLowerCase();
  syncBuilderTransformToolbar();
}

function attachBuilderPropTransform(object) {
  if (!object) return;
  builderTransformControls.attach(object);
  builderTransformControls.setMode(builderTransformMode);
  builderTransformControls.setSpace(builderTransformSpace);
  setBuilderTransformAxis(builderTransformAxis);
  syncBuilderTransformToolbar();
}

function detachBuilderPropTransform() {
  selectedBuilderRaceLinePointIndex = null;
  builderRaceLineHandles.forEach((handle, index) => handle.material.color.setHex(index % 3 === 1 ? 0x70ff9a : 0x73f6ff));
  builderTransformControls.detach();
  builderTransformHelper.visible = false;
  builderTransformToolbar.hidden = true;
  builderTransformControls.enabled = false;
}

function selectBuilderRaceLinePoint(pointIndex) {
  const handle = builderRaceLineHandles[pointIndex];
  if (!handle) return;
  detachBuilderPropTransform();
  selectedGateId = null;
  selectedBuilderPropId = null;
  selectedEnvironmentBuildingId = null;
  selectedBuilderRaceLinePointIndex = pointIndex;
  gatePlacementArmed = false;
  builderSelectionHelper.visible = false;
  builderGhostRoot.visible = false;
  document.querySelectorAll('[data-gate-type], [data-builder-prop]').forEach((button) => button.classList.remove('is-selected'));
  builderRaceLineHandles.forEach((item, index) => item.material.color.setHex(index === pointIndex ? 0xffcf78 : index % 3 === 1 ? 0x70ff9a : 0x73f6ff));
  builderTransformControls.attach(handle);
  builderTransformControls.setMode(builderTransformMode);
  builderTransformControls.setSpace(builderTransformSpace);
  setBuilderTransformAxis(builderTransformAxis);
  document.querySelector('#builderPlacementStatus').textContent = `EDIT / RACE LINE POINT ${pointIndex + 1}`;
  syncBuilderTransformToolbar();
  updateBuilderDisplay();
}

renderer.domElement.addEventListener('wheel', (event) => {
  if (currentPage !== 'builder' || flying || event.ctrlKey || event.metaKey
    || !gatePlacementArmed || !builderGhostRoot.visible) return;
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1);
  if (!delta) return;
  event.preventDefault();
  event.stopImmediatePropagation();
  const rotationDelta = THREE.MathUtils.clamp(delta / 100, -4, 4) * Math.PI / 12;
  const rotateYaw = (yaw) => THREE.MathUtils.euclideanModulo(yaw + rotationDelta, Math.PI * 2);
  builderGhostRoot.rotation.y = rotateYaw(builderGhostRoot.rotation.y);
}, { capture: true, passive: false });

builderTransformToolbar.querySelectorAll('[data-transform-mode]').forEach((button) => button.addEventListener('click', () => {
  builderTransformMode = button.dataset.transformMode;
  builderTransformControls.setMode(builderTransformMode);
  syncBuilderTransformToolbar();
}));
builderTransformToolbar.querySelectorAll('[data-transform-axis]').forEach((button) => button.addEventListener('click', () => {
  setBuilderTransformAxis(button.dataset.transformAxis);
}));
builderTransformToolbar.querySelectorAll('[data-transform-space]').forEach((button) => button.addEventListener('click', () => {
  builderTransformSpace = button.dataset.transformSpace;
  builderTransformControls.setSpace(builderTransformSpace);
  syncBuilderTransformToolbar();
}));

window.addEventListener('keydown', (event) => {
  if (currentPage !== 'builder' || !(selectedBuilderPropId || selectedGateId || selectedEnvironmentBuildingId || selectedBuilderRaceLinePointIndex !== null) || flying) return;
  const typing = event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable="true"]');
  if (typing || event.altKey || event.ctrlKey || event.metaKey) return;
  const mode = { KeyG: 'translate', KeyR: 'rotate' }[event.code];
  if (mode) {
    builderTransformMode = mode;
    builderTransformControls.setMode(mode);
    syncBuilderTransformToolbar();
    event.preventDefault();
  } else if (['KeyX', 'KeyY', 'KeyZ'].includes(event.code)) {
    const axis = event.code.slice(-1).toLowerCase();
    setBuilderTransformAxis(builderTransformAxis === axis ? 'all' : axis);
    event.preventDefault();
  }
});

function selectBuilderGate(id) {
  detachBuilderPropTransform();
  selectedGateId = id;
  selectedGateOpeningIndex = null;
  selectedBuilderPropId = null;
  selectedEnvironmentBuildingId = null;
  const data = builderGates.find((gate) => gate.id === id);
  if (data) {
    activeGateType = data.type;
    activeBuilderAsset = { kind: 'gate', type: data.type };
    document.querySelectorAll('[data-gate-type]').forEach((button) => button.classList.toggle('is-selected', button.dataset.gateType === activeGateType));
    document.querySelectorAll('[data-builder-prop]').forEach((button) => button.classList.remove('is-selected'));
    const object = customGateObjects.find((gate) => gate.userData.gateId === id);
    if (object) {
      builderSelectionHelper.setFromObject(object);
      builderSelectionHelper.visible = true;
      attachBuilderPropTransform(object);
    }
  } else {
    builderSelectionHelper.visible = false;
  }
  updateBuilderDisplay();
}

function selectGateType(type) {
  if (!gateTypes[type]?.raceAsset || builderGameMode === 'prop-hunt') return;
  detachBuilderPropTransform();
  activeGateType = type;
  activeBuilderAsset = { kind: 'gate', type };
  selectedGateId = null;
  selectedBuilderPropId = null;
  builderSelectionHelper.visible = false;
  gatePlacementArmed = true;
  document.querySelectorAll('[data-gate-type]').forEach((button) => button.classList.toggle('is-selected', button.dataset.gateType === type));
  document.querySelectorAll('[data-builder-prop]').forEach((button) => button.classList.remove('is-selected'));
  setBuilderGhost(activeBuilderAsset);
  document.querySelector('#builderPlacementStatus').textContent = `PLACE / ${gateTypes[type].name.toUpperCase()}`;
  updateBuilderDisplay();
}

function selectBuilderProp(type) {
  const available = builderGameMode === 'prop-hunt'
    ? type !== 'podium' && type !== 'relay-podium-gate'
    : builderGameMode === 'relay-race'
      ? type === 'relay-podium-gate'
      : type === 'podium';
  if (!builderPropTypes[type] || !available) return;
  if (type === 'relay-podium-gate' && builderRelayPodiumGateCount() >= RELAY_STATION_COUNT) {
    showToast('This Relay track already has all 4 podium gates.');
    return;
  }
  detachBuilderPropTransform();
  activeBuilderAsset = { kind: 'prop', type };
  selectedGateId = null;
  selectedBuilderPropId = null;
  selectedEnvironmentBuildingId = null;
  builderSelectionHelper.visible = false;
  gatePlacementArmed = true;
  document.querySelectorAll('[data-gate-type]').forEach((button) => button.classList.remove('is-selected'));
  document.querySelectorAll('[data-builder-prop]').forEach((button) => button.classList.toggle('is-selected', button.dataset.builderProp === type));
  setBuilderGhost(activeBuilderAsset);
  document.querySelector('#builderPlacementStatus').textContent = `PLACE / ${builderPropTypes[type].toUpperCase()}`;
  updateBuilderDisplay();
}

function selectEnvironmentBuilding(id) {
  const building = builderEnvironmentBuildings.find((item) => item.id === id);
  if (!building) return;
  detachBuilderPropTransform();
  selectedGateId = null;
  selectedBuilderPropId = null;
  selectedEnvironmentBuildingId = building.id;
  gatePlacementArmed = false;
  builderGhostRoot.visible = false;
  document.querySelectorAll('[data-gate-type], [data-builder-prop]').forEach((button) => button.classList.remove('is-selected'));
  builderSelectionHelper.setFromObject(building.object);
  builderSelectionHelper.visible = true;
  attachBuilderPropTransform(building.object);
  document.querySelector('#builderPlacementStatus').textContent = `EDIT / ${building.label.toUpperCase()}`;
  updateBuilderDisplay();
}

function disposeBuilderVisual(root) {
  const sharedMaterialSet = new Set(Object.values(sharedMaterials));
  root.traverse((node) => {
    if (node.userData.isPodiumNameplateText) node.userData.podiumUsernameTexture?.dispose();
    if (node.userData.isGateModelStatusSign) {
      node.material.map?.dispose();
      node.material.dispose();
      return;
    }
    if (!node.isMesh) return;
    if (node.geometry && node.geometry !== boxGeometry) node.geometry.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => { if (material && !sharedMaterialSet.has(material)) material.dispose(); });
  });
}

function clearBuilderGhost() {
  for (const child of [...builderGhostRoot.children]) {
    builderGhostRoot.remove(child);
    disposeBuilderVisual(child);
  }
  builderGhostAssetKey = '';
  builderGhostRoot.visible = false;
}

function makeTransparentBuilderVisual(model) {
  const sharedMaterialSet = new Set(Object.values(sharedMaterials));
  const isGateVisual = model.userData.importedGate || model.userData.proceduralGate;
  model.traverse((node) => {
    if (!node.isMesh) return;
    const cloneIfShared = (material) => sharedMaterialSet.has(material) ? material.clone() : material;
    node.material = Array.isArray(node.material) ? node.material.map(cloneIfShared) : cloneIfShared(node.material);
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      material.transparent = true;
      material.opacity = 0.32;
      material.depthWrite = false;
      if (!isGateVisual) {
        if (material.emissive) material.emissive.set(0x54dfff);
        material.emissiveIntensity = Math.max(0.7, Number(material.emissiveIntensity) || 0);
      }
      material.needsUpdate = true;
    });
    node.renderOrder = 5;
    node.castShadow = false;
    node.receiveShadow = false;
  });
  return model;
}

function setBuilderGhost(asset) {
  clearBuilderGhost();
  if (!asset) return;
  builderGhostRoot.rotation.set(0, 0, 0);
  const assetKey = `${asset.kind}:${asset.type}`;
  builderGhostAssetKey = assetKey;
  const palette = biomes[activeBiome]?.colors ?? ['cyan'];
  const gateHue = palette[builderGates.length % palette.length] || 'cyan';
  if (asset.kind === 'gate') builderGhostRoot.add(createGateModelStatusSign(asset.type));
  else builderGhostRoot.add(makeTransparentBuilderVisual(createBuilderPropModel(asset.type)));
  if (asset.kind === 'gate') {
    loadGateModel(asset.type).then((source) => {
      if (builderGhostAssetKey !== assetKey || currentPage !== 'builder') return;
      const statusSign = builderGhostRoot.children.find((child) => child.userData.isGateModelStatusSign);
      if (!source) {
        setGateModelStatusSignText(statusSign, 'GATE MODEL UNAVAILABLE');
        return;
      }
      disposeGateModelStatusSign(statusSign);
      const model = cloneGateModel(source);
      applyGateLedColor(model, gateHue);
      builderGhostRoot.add(makeTransparentBuilderVisual(model));
    });
  }
  builderGhostRoot.visible = currentPage === 'builder' && !flying && gatePlacementArmed;
  updateBuilderGhostPosition(orbit.target);
}

function updateBuilderGhostPosition(position) {
  if (!gatePlacementArmed || !builderGhostAssetKey) return;
  const x = THREE.MathUtils.clamp(Math.round(position.x * 2) / 2, -menuPlatformHalfSize, menuPlatformHalfSize);
  const z = THREE.MathUtils.clamp(Math.round(position.z * 2) / 2, menuPlatformCenterZ - menuPlatformHalfSize, menuPlatformCenterZ + menuPlatformHalfSize);
  builderGhostRoot.position.set(x, builderSurfaceYAt(x, z), z);
  builderGhostRoot.visible = currentPage === 'builder' && !flying;
}

function placeBuilderGate(position) {
  if (builderGates.length >= 80) return showToast('This course has reached the 80 gate limit.');
  const palette = biomes[activeBiome].colors;
  const x = Math.round(position.x * 2) / 2;
  const z = Math.round(position.z * 2) / 2;
  const data = {
    id: (globalThis.crypto?.randomUUID?.() || `gate-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    type: activeGateType,
    x,
    y: Math.round(builderSurfaceYAt(x, z) * 4) / 4,
    z,
    rotation: THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(builderGhostRoot.rotation.y), 360),
    scale: 1,
    rotationX: 0,
    rotationZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    color: palette[builderGates.length % palette.length] || 'cyan',
    isStartFinish: builderGates.length === 0,
    routeOrder: builderGates.length === 0 ? 0 : builderGateRouteSlots().filter((slot) => !slot.isStartFinish && slot.routeOrder > 0).length + 1,
  };
  builderGates.push(data);
  customGateObjects.push(createBuilderGate(data));
  normalizeBuilderGateSequence();
  builderPlacementHistory.push({ kind: 'gate', id: data.id });
  gatePlacementArmed = false;
  builderGhostRoot.visible = false;
  invalidateBuilderTrackPicture();
  selectBuilderGate(data.id);
  updateBuilderDisplay();
}

function placeBuilderProp(position) {
  if (builderProps.length >= 100) return showToast('This environment has reached the 100 object limit.');
  if (activeBuilderAsset.type === 'relay-podium-gate' && builderRelayPodiumGateCount() >= RELAY_STATION_COUNT) {
    showToast('This Relay track already has all 4 podium gates.');
    return;
  }
  const x = Math.round(position.x * 2) / 2;
  const z = Math.round(position.z * 2) / 2;
  const data = {
    id: globalThis.crypto?.randomUUID?.() || `prop-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: activeBuilderAsset.type,
    x,
    y: Math.round(builderSurfaceYAt(x, z) * 4) / 4,
    z,
    rotation: THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(builderGhostRoot.rotation.y), 360),
    rotationX: 0,
    rotationY: THREE.MathUtils.euclideanModulo(THREE.MathUtils.radToDeg(builderGhostRoot.rotation.y), 360),
    rotationZ: 0,
    scale: 1,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    isLaunchPodium: activeBuilderAsset.type === 'podium' && !builderProps.some((prop) => prop.isLaunchPodium),
  };
  builderProps.push(data);
  builderPropObjects.push(createBuilderPropObject(data));
  builderPlacementHistory.push({ kind: 'prop', id: data.id });
  gatePlacementArmed = false;
  builderGhostRoot.visible = false;
  invalidateBuilderTrackPicture();
  selectedGateId = null;
  selectedEnvironmentBuildingId = null;
  selectedBuilderPropId = data.id;
  const object = builderPropObjects.find((item) => item.userData.propId === data.id);
  if (object) {
    builderSelectionHelper.setFromObject(object);
    builderSelectionHelper.visible = true;
    attachBuilderPropTransform(object);
  }
  updateBuilderDisplay();
}

function copySelectedBuilderObject() {
  const gate = builderGates.find((item) => item.id === selectedGateId);
  const prop = builderProps.find((item) => item.id === selectedBuilderPropId);
  if (gate) builderObjectClipboard = { kind: 'gate', data: { ...gate } };
  else if (prop) builderObjectClipboard = { kind: 'prop', data: { ...prop } };
  else return false;
  builderClipboardPasteCount = 0;
  showToast('Selected object copied. Press Ctrl+V to paste a duplicate.');
  return true;
}

function getBuilderPastePosition(source) {
  const offset = Math.max(1, builderClipboardPasteCount + 1) * 5;
  const candidates = [
    [source.x + offset, source.z],
    [source.x, source.z + offset],
    [source.x - offset, source.z],
    [source.x, source.z - offset],
  ];
  const minX = -menuPlatformHalfSize + 1;
  const maxX = menuPlatformHalfSize - 1;
  const minZ = menuPlatformCenterZ - menuPlatformHalfSize + 1;
  const maxZ = menuPlatformCenterZ + menuPlatformHalfSize - 1;
  const [x, z] = candidates.find(([candidateX, candidateZ]) =>
    candidateX >= minX && candidateX <= maxX && candidateZ >= minZ && candidateZ <= maxZ) || [];
  return Number.isFinite(x) && Number.isFinite(z) ? { x, z } : null;
}

function pasteBuilderObject() {
  if (!builderObjectClipboard) return false;
  const { kind, data: source } = builderObjectClipboard;
  if (kind === 'gate' && builderGates.length >= 80) {
    showToast('This course has reached the 80 gate limit.');
    return false;
  }
  if (kind === 'prop' && (builderProps.length >= 100
    || (source.type === 'relay-podium-gate' && builderRelayPodiumGateCount() >= RELAY_STATION_COUNT))) {
    showToast(source.type === 'relay-podium-gate'
      ? 'This Relay track already has all 4 podium gates.'
      : 'This environment has reached the 100 object limit.');
    return false;
  }
  if (kind === 'prop' && (
    (builderGameMode === 'relay-race' && source.type !== 'relay-podium-gate')
    || (builderGameMode !== 'relay-race' && source.type === 'relay-podium-gate')
    || (builderGameMode === 'prop-hunt' && ['podium', 'relay-podium-gate'].includes(source.type))
  )) {
    showToast('This object is not available in the selected game mode.');
    return false;
  }
  const position = getBuilderPastePosition(source);
  if (!position) {
    showToast('There is no room on the platform to paste this object.');
    return false;
  }
  const id = globalThis.crypto?.randomUUID?.()
    || `builder-copy-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  builderClipboardPasteCount += 1;
  if (kind === 'gate') {
    const data = {
      ...source,
      id,
      x: position.x,
      y: Math.round(builderSurfaceYAt(position.x, position.z) * 4) / 4,
      z: position.z,
      isStartFinish: false,
      routeOrder: builderGateRouteSlots().filter((slot) => !slot.isStartFinish && slot.routeOrder > 0).length + 1,
      entryRouteOrders: undefined,
    };
    builderGates.push(data);
    customGateObjects.push(createBuilderGate(data));
    normalizeBuilderGateSequence();
    builderPlacementHistory.push({ kind: 'gate', id });
    invalidateBuilderTrackPicture();
    selectBuilderGate(id);
  } else {
    const data = {
      ...source,
      id,
      x: position.x,
      y: Math.round(builderSurfaceYAt(position.x, position.z) * 4) / 4,
      z: position.z,
      isLaunchPodium: false,
    };
    builderProps.push(data);
    builderPropObjects.push(createBuilderPropObject(data));
    builderPlacementHistory.push({ kind: 'prop', id });
    invalidateBuilderTrackPicture();
    selectedGateId = null;
    selectedEnvironmentBuildingId = null;
    selectedBuilderPropId = id;
    const object = builderPropObjects.find((item) => item.userData.propId === id);
    if (object) {
      builderSelectionHelper.setFromObject(object);
      builderSelectionHelper.visible = true;
      attachBuilderPropTransform(object);
    }
  }
  updateBuilderDisplay();
  showToast('Object pasted.');
  return true;
}

const builderRaycaster = new THREE.Raycaster();
const builderPointer = new THREE.Vector2();
const builderGround = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const builderDragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const builderGroundHit = new THREE.Vector3();
const builderGateHitBounds = new THREE.Box3();
const builderGateHitCenter = new THREE.Vector3();
const builderGateHitRadius = new THREE.Vector3();
const builderGateHitSphere = new THREE.Sphere();
const builderGateHit = new THREE.Vector3();
let builderPointerDown = null;
function setBuilderRayFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  if (!rect.width || !rect.height) return false;
  builderPointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
  builderRaycaster.setFromCamera(builderPointer, camera);
  return true;
}

function builderRaceLineHandleAtPointer(event) {
  if (!builderRaceLineGenerated || !builderRaceLineRoot.visible || !setBuilderRayFromEvent(event)) return null;
  const hits = builderRaycaster.intersectObjects(builderRaceLineHandles, false);
  return hits[0]?.object || null;
}

function builderGateAtPointer(event) {
  if (!setBuilderRayFromEvent(event)) return null;
  const gateHits = builderRaycaster.intersectObjects(customGateObjects, true);
  let closestGate = null;
  let closestDistance = Infinity;
  for (const gate of customGateObjects) {
    if (!gate.visible || !gate.userData.gateId) continue;
    gate.updateWorldMatrix(true, true);
    builderGateHitBounds.setFromObject(gate);
    if (builderGateHitBounds.isEmpty()) continue;
    builderGateHitBounds.getCenter(builderGateHitCenter);
    builderGateHitBounds.getBoundingSphere(builderGateHitSphere);
    builderGateHitRadius.set(
      Math.max(builderGateHitSphere.radius * 0.18, 0.55),
      Math.max(builderGateHitSphere.radius * 0.18, 0.55),
      Math.max(builderGateHitSphere.radius * 0.18, 0.55),
    );
    builderGateHitBounds.expandByVector(builderGateHitRadius);
    if (!builderRaycaster.ray.intersectBox(builderGateHitBounds, builderGateHit)) continue;
    const distance = builderRaycaster.ray.origin.distanceTo(builderGateHit);
    if (distance >= closestDistance) continue;
    closestGate = gate;
    closestDistance = distance;
  }

  const actualHit = gateHits[0];
  if (actualHit) {
    let hitGate = actualHit.object;
    while (hitGate && !hitGate.userData.isBuilderGate) hitGate = hitGate.parent;
    if (hitGate?.userData.gateId) {
      const actualDistance = actualHit.distance;
      if (!closestGate || actualDistance <= closestDistance) return hitGate;
    }
  }
  return closestGate;
}

function builderGateBoundaryAtPointer(event) {
  if (!setBuilderRayFromEvent(event)) return null;
  const hit = builderRaycaster.intersectObjects(customGateObjects, true)
    .find((intersection) => intersection.object.userData.isGatePassBoundarySurface);
  if (!hit) return null;
  let gate = hit.object.parent;
  while (gate && !gate.userData.isBuilderGate) gate = gate.parent;
  return gate?.userData.gateData
    ? { gate, openingIndex: hit.object.userData.gateBoundaryIndex }
    : null;
}

function builderGateBadgeAtPointer(event) {
  if (!setBuilderRayFromEvent(event)) return null;
  const hit = builderRaycaster.intersectObjects(customGateObjects, true)
    .find((intersection) => intersection.object.userData.isBuilderGateBadge);
  if (!hit) return null;
  let gate = hit.object.parent;
  while (gate && !gate.userData.isBuilderGate) gate = gate.parent;
  return gate?.userData.gateData
    ? { gate, openingIndex: hit.object.userData.gateBadgeOpeningIndex }
    : null;
}

function builderPropAtPointer(event) {
  if (!setBuilderRayFromEvent(event)) return null;
  const hitProp = builderRaycaster.intersectObjects(builderPropObjects, true)[0]?.object;
  let selectedObject = hitProp;
  while (selectedObject && !selectedObject.userData.isBuilderProp) selectedObject = selectedObject.parent;
  return selectedObject?.userData.propId ? selectedObject : null;
}

function builderEnvironmentBuildingAtPointer(event) {
  // The builder is locked to the sky platform; hidden biome geometry must not intercept clicks.
  if (currentPage !== 'builder' || !environmentRoot.visible) return null;
  if (!setBuilderRayFromEvent(event)) return null;
  const hits = builderRaycaster.intersectObjects(environmentRoot.children, true);
  for (const hit of hits) {
    let selectedObject = hit.object;
    let registeredObject = null;
    while (selectedObject && selectedObject !== environmentRoot) {
      if (selectedObject.userData.skipBuilderSelection || selectedObject.userData.flightGroundSurface) break;
      if (selectedObject.userData.environmentBuildingId) {
        registeredObject = selectedObject;
        break;
      }
      selectedObject = selectedObject.parent;
    }
    if (registeredObject) return registeredObject;
    if (hit.object.userData.skipBuilderSelection || hit.object.userData.flightGroundSurface) continue;
    if (hit.object.isInstancedMesh && Number.isInteger(hit.instanceId)) {
      const path = builderEnvironmentObjectPath(hit.object);
      const id = `scene-v2:${path}:instance:${hit.instanceId}`;
      const existing = builderEnvironmentBuildings.find((item) => item.id === id);
      if (existing) return existing.object;
      const saved = readBuilderEnvironmentBuildingStates()[id];
      const label = `${hit.object.name || 'Environment object'} ${hit.instanceId + 1}`;
      return createBuilderEnvironmentInstance(hit.object, hit.instanceId, id, label, saved);
    }
    return registerBuilderSceneObject(hit.object)?.object || null;
  }
  return null;
}

function builderGroundAtPointer(event) {
  if (!setBuilderRayFromEvent(event)) return null;
  let groundY = builderSurfaceYAt(orbit.target.x, orbit.target.z);
  for (let attempt = 0; attempt < 5; attempt += 1) {
    builderGround.constant = -groundY;
    if (!builderRaycaster.ray.intersectPlane(builderGround, builderGroundHit)) return null;
    groundY = builderSurfaceYAt(builderGroundHit.x, builderGroundHit.z);
  }
  if (Math.abs(builderGroundHit.x) > menuPlatformHalfSize || Math.abs(builderGroundHit.z - menuPlatformCenterZ) > menuPlatformHalfSize) return null;
  return builderGroundHit.clone();
}

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (currentPage !== 'builder' || event.button !== 0) return;
  if (builderTransformControls.dragging) return;
  if (builderRaceLineHandleAtPointer(event) || builderGateAtPointer(event) || builderEnvironmentBuildingAtPointer(event) || builderPropAtPointer(event)) orbit.enabled = false;
}, { capture: true });

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (currentPage !== 'builder' || event.button !== 0) return;
  if (builderTransformControls.dragging) return;
  const raceLineHandle = builderRaceLineHandleAtPointer(event);
  if (raceLineHandle) {
    selectBuilderRaceLinePoint(raceLineHandle.userData.raceLinePointIndex);
    builderPointerDown = { x: event.clientX, y: event.clientY, kind: 'select', objectId: null, moved: false };
    orbit.enabled = false;
    renderer.domElement.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  const badgeGate = builderGateBadgeAtPointer(event);
  if (badgeGate) {
    const data = badgeGate.gate.userData.gateData;
    const openingIndex = badgeGate.openingIndex;
    const hasMultipleOpenings = builderGateRouteOpeningCount(data) > 1;
    const slot = builderGateRouteSlots().find((item) => item.gate.id === data.id && item.openingIndex === (hasMultipleOpenings ? openingIndex : null));
    if (slot && !slot.isStartFinish) {
      const numberedCount = builderGateRouteSlots().filter((item) => !item.isStartFinish && item.routeOrder > 0).length;
      const nextNumber = slot.routeOrder > 0 && slot.routeOrder < numberedCount
        ? slot.routeOrder + 1
        : slot.routeOrder > 0 ? 0 : 1;
      setBuilderGateRouteNumber(data, nextNumber, slot.openingIndex);
      showToast(nextNumber === 0 ? 'Gate set to N/A and removed from the race route.' : `Gate number set to ${nextNumber}.`);
    }
    selectBuilderGate(data.id);
    selectedGateOpeningIndex = openingIndex ?? 0;
    updateBuilderDisplay();
    builderPointerDown = { x: event.clientX, y: event.clientY, kind: 'select', objectId: null, moved: false };
    orbit.enabled = false;
    renderer.domElement.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  const boundaryHit = builderGateBoundaryAtPointer(event);
  if (boundaryHit) {
    const { gate, openingIndex } = boundaryHit;
    const data = gate.userData.gateData;
    selectBuilderGate(data.id);
    selectedGateOpeningIndex = openingIndex ?? 0;
    if (builderGateRouteOpeningCount(data) > 1) {
      const previousDirection = data.entryDirections[openingIndex] ?? 1;
      const nextDirection = previousDirection === 1 ? -1 : previousDirection === -1 ? 0 : 1;
      data.entryDirections[openingIndex] = nextDirection;
      data.entryDirection = data.entryDirections[0];
      updateGatePassBoundaryDirection(gate);
      const slot = builderGateRouteSlots().find((item) => item.gate.id === data.id && item.openingIndex === openingIndex);
      if (slot && !slot.isStartFinish && nextDirection === 0) {
        setBuilderGateRouteNumber(data, 0, openingIndex);
      } else if (slot && !slot.isStartFinish && previousDirection === 0 && nextDirection !== 0 && slot.routeOrder === 0) {
        setBuilderGateRouteNumber(data, builderGateRouteSlots().filter((item) => item.routeOrder > 0 && !item.isStartFinish).length + 1, openingIndex);
      } else {
        updateBuilderDisplay();
        invalidateBuilderTrackPicture();
      }
      document.querySelector('#gateRouteNumber').focus({ preventScroll: true });
      const directionMessage = nextDirection === 0
        ? 'invisible'
        : nextDirection === 1 ? 'green from the front' : 'green from the back';
      showToast(`Gate ${openingIndex + 1} direction: ${directionMessage}${nextDirection === 0 ? '. Gate set to N/A.' : '.'}`);
      builderPointerDown = { x: event.clientX, y: event.clientY, kind: 'select', objectId: null, moved: false };
      orbit.enabled = false;
      renderer.domElement.setPointerCapture(event.pointerId);
      event.preventDefault();
      return;
    }
    const previousDirection = data.entryDirections[openingIndex] ?? 1;
    const nextDirection = previousDirection === 1 ? -1 : previousDirection === -1 ? 0 : 1;
    data.entryDirections[openingIndex] = nextDirection;
    data.entryDirection = data.entryDirections[0];
    updateGatePassBoundaryDirection(gate);
    const allOpeningsHidden = data.entryDirections.every((direction) => direction === 0);
    const directionMessage = nextDirection === 0
      ? 'invisible'
      : nextDirection === 1 ? 'green from the front' : 'green from the back';
    const routeSlot = builderGateRouteSlots().find((slot) => slot.gate.id === data.id && slot.openingIndex === null);
    if (!routeSlot?.isStartFinish && allOpeningsHidden && Number(data.routeOrder) > 0) {
      setBuilderGateRouteNumber(data, 0);
    } else if (!routeSlot?.isStartFinish && previousDirection === 0 && nextDirection !== 0 && Number(data.routeOrder) === 0) {
      setBuilderGateRouteNumber(data, 1);
    } else {
      updateBuilderDisplay();
      invalidateBuilderTrackPicture();
    }
    document.querySelector('#gateRouteNumber').focus({ preventScroll: true });
    showToast(`Gate ${openingIndex + 1} direction: ${directionMessage}${allOpeningsHidden && !routeSlot?.isStartFinish ? '. Gate set to N/A.' : '.'}`);
    builderPointerDown = { x: event.clientX, y: event.clientY, kind: 'select', objectId: null, moved: false };
    orbit.enabled = false;
    renderer.domElement.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  const gateObject = builderGateAtPointer(event);
  const environmentBuilding = gateObject ? null : builderEnvironmentBuildingAtPointer(event);
  const propObject = gateObject || environmentBuilding ? null : builderPropAtPointer(event);
  if (propObject) {
    selectedGateId = null;
    selectedEnvironmentBuildingId = null;
    selectedBuilderPropId = propObject.userData.propId;
    builderSelectionHelper.setFromObject(propObject);
    builderSelectionHelper.visible = true;
    attachBuilderPropTransform(propObject);
    builderPointerDown = { x: event.clientX, y: event.clientY, kind: 'select', objectId: null, moved: false };
    gatePlacementArmed = false;
    builderGhostRoot.visible = false;
    updateBuilderDisplay();
    orbit.enabled = false;
    renderer.domElement.setPointerCapture(event.pointerId);
    event.preventDefault();
    return;
  }
  if (environmentBuilding) {
    selectEnvironmentBuilding(environmentBuilding.userData.environmentBuildingId);
    builderPointerDown = { x: event.clientX, y: event.clientY, kind: 'select', objectId: null, moved: false };
    renderer.domElement.setPointerCapture(event.pointerId);
    orbit.enabled = false;
    event.preventDefault();
    return;
  }
  if (!gatePlacementArmed && (selectedGateId || selectedBuilderPropId || selectedEnvironmentBuildingId || selectedBuilderRaceLinePointIndex !== null)) {
    detachBuilderPropTransform();
    selectedGateId = null;
    selectedBuilderPropId = null;
    selectedEnvironmentBuildingId = null;
    builderSelectionHelper.visible = false;
    document.querySelectorAll('[data-gate-type], [data-builder-prop]').forEach((button) => button.classList.remove('is-selected'));
    document.querySelector('#builderPlacementStatus').textContent = 'SELECT OR CHOOSE AN OBJECT';
    updateBuilderDisplay();
    orbit.enabled = true;
  }
  const objectId = gateObject?.userData.gateId || null;
  builderPointerDown = { x: event.clientX, y: event.clientY, kind: gateObject ? 'gate' : null, objectId, moved: false };
  if (!gateObject) return;
  selectBuilderGate(objectId);
  gatePlacementArmed = false;
  builderGhostRoot.visible = false;
  builderDragPlane.constant = -gateObject.position.y;
  const groundY = builderSurfaceYAt(gateObject.position.x, gateObject.position.z);
  builderPointerDown.groundOffset = gateObject.position.y - groundY;
  orbit.enabled = false;
  renderer.domElement.setPointerCapture(event.pointerId);
  event.preventDefault();
});

renderer.domElement.addEventListener('pointermove', (event) => {
  const drag = builderPointerDown;
  if (currentPage !== 'builder') return;
  if (builderTransformControls.dragging) return;
  if (!drag?.objectId) {
    if (gatePlacementArmed) {
      const hit = builderGroundAtPointer(event);
      if (hit) updateBuilderGhostPosition(hit);
    }
    return;
  }
  if (drag.kind !== 'gate' || (event.buttons & 1) === 0) return;
  if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 3) return;
  if (!setBuilderRayFromEvent(event) || !builderRaycaster.ray.intersectPlane(builderDragPlane, builderGroundHit)) return;
  const data = builderGates.find((item) => item.id === drag.objectId);
  const object = customGateObjects.find((item) => item.userData.gateId === drag.objectId);
  if (!data || !object) return;
  const x = THREE.MathUtils.clamp(Math.round(builderGroundHit.x * 2) / 2, -menuPlatformHalfSize, menuPlatformHalfSize);
  const z = THREE.MathUtils.clamp(Math.round(builderGroundHit.z * 2) / 2, menuPlatformCenterZ - menuPlatformHalfSize, menuPlatformCenterZ + menuPlatformHalfSize);
  const y = Math.round((builderSurfaceYAt(x, z) + drag.groundOffset) * 4) / 4;
  if (Math.abs(x - data.x) < 0.001 && Math.abs(y - data.y) < 0.001 && Math.abs(z - data.z) < 0.001) return;
  drag.moved = true;
  object.position.set(data.x = x, data.y = y, data.z = z);
  document.querySelector('#builderPlacementStatus').textContent = `MOVE / ${gateTypes[data.type].name.toUpperCase()}`;
  builderSelectionHelper.update();
  event.preventDefault();
});

function finishBuilderPointer(event) {
  const interaction = builderPointerDown;
  builderPointerDown = null;
  if (!interaction) return;
  if (interaction.kind === 'select') {
    orbit.enabled = currentPage === 'builder' && !builderTransformControls.dragging;
    return;
  }
  if (interaction.objectId) {
    orbit.enabled = currentPage === 'builder';
    if (interaction.moved) {
      invalidateBuilderTrackPicture();
      updateBuilderDisplay();
    }
    const data = (interaction.kind === 'gate' ? builderGates : builderProps).find((item) => item.id === interaction.objectId);
    if (data) document.querySelector('#builderPlacementStatus').textContent = `SELECTED / ${(interaction.kind === 'gate' ? gateTypes[data.type].name : builderPropTypes[data.type]).toUpperCase()}`;
    return;
  }
  if (event.type !== 'pointerup') return;
  if (currentPage !== 'builder' || Math.hypot(event.clientX - interaction.x, event.clientY - interaction.y) > 5) return;
  if (!gatePlacementArmed) return;
  const groundHit = builderGroundAtPointer(event);
  if (!groundHit) return;
  updateBuilderGhostPosition(groundHit);
  if (activeBuilderAsset.kind === 'prop') placeBuilderProp(groundHit);
  else placeBuilderGate(groundHit);
}

renderer.domElement.addEventListener('pointerup', finishBuilderPointer);
renderer.domElement.addEventListener('pointercancel', finishBuilderPointer);

document.querySelectorAll('[data-gate-type]').forEach((button) => button.addEventListener('click', () => selectGateType(button.dataset.gateType)));
document.querySelectorAll('[data-builder-prop]').forEach((button) => button.addEventListener('click', () => selectBuilderProp(button.dataset.builderProp)));

document.querySelector('#undoGate').addEventListener('click', () => {
  const previous = builderPlacementHistory.pop();
  if (!previous) return showToast('No placed objects to undo.');
  invalidateBuilderTrackPicture();
  if (previous.kind === 'gate') {
    if (selectedGateId === previous.id) detachBuilderPropTransform();
    const dataIndex = builderGates.findIndex((item) => item.id === previous.id);
    const objectIndex = customGateObjects.findIndex((item) => item.userData.gateId === previous.id);
    if (dataIndex >= 0) builderGates.splice(dataIndex, 1);
    if (objectIndex >= 0) { const [object] = customGateObjects.splice(objectIndex, 1); gateRoot.remove(object); clearChildren(object); }
    if (selectedGateId === previous.id) selectedGateId = null;
    normalizeBuilderGateSequence();
  } else {
    const dataIndex = builderProps.findIndex((item) => item.id === previous.id);
    const objectIndex = builderPropObjects.findIndex((item) => item.userData.propId === previous.id);
    if (selectedBuilderPropId === previous.id) detachBuilderPropTransform();
    if (dataIndex >= 0) builderProps.splice(dataIndex, 1);
    if (objectIndex >= 0) { const [object] = builderPropObjects.splice(objectIndex, 1); builderPropRoot.remove(object); clearChildren(object); }
    if (selectedBuilderPropId === previous.id) selectedBuilderPropId = null;
  }
  if (!selectedGateId && !selectedBuilderPropId) builderSelectionHelper.visible = false;
  updateBuilderDisplay();
});

function updateSelectedGateFromInspector() {
  const gate = builderGates.find((item) => item.id === selectedGateId);
  if (!gate) return;
  gate.color = document.querySelector('#gateColor').value;
  invalidateBuilderTrackPicture();
  const object = customGateObjects.find((item) => item.userData.gateId === gate.id);
  if (object) {
    if (object.userData.loadedModel) applyGateLedColor(object, gate.color);
    if (object.userData.gateId === selectedGateId) builderSelectionHelper.update();
  }
}

function updateSelectedGateRouteNumber() {
  const selected = builderGates.find((gate) => gate.id === selectedGateId);
  const hasMultipleOpenings = selected && builderGateRouteOpeningCount(selected) > 1;
  const selectedSlot = builderGateRouteSlots().find((slot) => slot.gate.id === selected?.id
    && slot.openingIndex === (hasMultipleOpenings ? selectedGateOpeningIndex : null));
  if (!selected || selectedSlot?.isStartFinish) return;
  const value = Number(document.querySelector('#gateRouteNumber').value);
  if (!Number.isSafeInteger(value) || value < 0) return;
  setBuilderGateRouteNumber(selected, value, hasMultipleOpenings ? selectedGateOpeningIndex : null);
}

function updateSelectedGateStartFinish() {
  const selected = builderGates.find((gate) => gate.id === selectedGateId);
  const hasMultipleOpenings = selected && builderGateRouteOpeningCount(selected) > 1;
  const selectedSlot = builderGateRouteSlots().find((slot) => slot.gate.id === selected?.id
    && slot.openingIndex === (hasMultipleOpenings ? selectedGateOpeningIndex : null));
  if (!selected || !selectedSlot) return;
  if (!document.querySelector('#gateStartFinish').checked && selectedSlot.isStartFinish) {
    document.querySelector('#gateStartFinish').checked = true;
    showToast('Every track needs one start / finish gate. Mark another gate to move it.');
    return;
  }
  if (document.querySelector('#gateStartFinish').checked) {
    normalizeBuilderGateSequence(selected.id, selectedSlot.openingIndex);
  }
  invalidateBuilderTrackPicture();
  updateBuilderDisplay();
}

function updateSelectedLaunchPodium() {
  const selected = builderProps.find((prop) => prop.id === selectedBuilderPropId);
  if (!selected || selected.type !== 'podium') return;
  const enabled = document.querySelector('#builderPropLaunch').checked;
  builderProps.forEach((prop) => { prop.isLaunchPodium = enabled && prop.id === selected.id; });
  builderPropObjects.forEach((object) => {
    const prop = builderProps.find((item) => item.id === object.userData.propId);
    object.userData.isLaunchPodium = Boolean(prop?.isLaunchPodium);
  });
  invalidateBuilderTrackPicture();
  updateBuilderDisplay();
}

document.querySelector('#gateColor').addEventListener('change', updateSelectedGateFromInspector);
document.querySelector('#gateRouteNumber').addEventListener('change', updateSelectedGateRouteNumber);
document.querySelector('#gateStartFinish').addEventListener('change', updateSelectedGateStartFinish);
document.querySelector('#builderPropLaunch').addEventListener('change', updateSelectedLaunchPodium);
document.querySelector('#deleteGate').addEventListener('click', () => {
  const index = builderGates.findIndex((gate) => gate.id === selectedGateId);
  if (index < 0) return;
  detachBuilderPropTransform();
  const [removed] = builderGates.splice(index, 1);
  builderPlacementHistory = builderPlacementHistory.filter((entry) => entry.id !== removed.id);
  invalidateBuilderTrackPicture();
  const objectIndex = customGateObjects.findIndex((gate) => gate.userData.gateId === removed.id);
  if (objectIndex >= 0) { const [object] = customGateObjects.splice(objectIndex, 1); gateRoot.remove(object); clearChildren(object); }
  normalizeBuilderGateSequence();
  selectedGateId = null;
  builderSelectionHelper.visible = false;
  updateBuilderDisplay();
});

document.querySelector('#deleteBuilderProp').addEventListener('click', () => {
  if (selectedEnvironmentBuildingId) {
    const building = builderEnvironmentBuildings.find((item) => item.id === selectedEnvironmentBuildingId);
    if (!building) return;
    building.object.visible = false;
    saveBuilderEnvironmentBuildings();
    updateBuilderBuildingRestoreButton();
    detachBuilderPropTransform();
    selectedEnvironmentBuildingId = null;
    builderSelectionHelper.visible = false;
    invalidateBuilderTrackPicture();
    updateBuilderDisplay();
    showToast(`${building.label} removed from this environment.`);
    return;
  }
  const index = builderProps.findIndex((prop) => prop.id === selectedBuilderPropId);
  if (index < 0) return;
  const [removed] = builderProps.splice(index, 1);
  detachBuilderPropTransform();
  builderPlacementHistory = builderPlacementHistory.filter((entry) => entry.id !== removed.id);
  const objectIndex = builderPropObjects.findIndex((object) => object.userData.propId === removed.id);
  if (objectIndex >= 0) { const [object] = builderPropObjects.splice(objectIndex, 1); builderPropRoot.remove(object); clearChildren(object); }
  selectedBuilderPropId = null;
  builderSelectionHelper.visible = false;
  invalidateBuilderTrackPicture();
  updateBuilderDisplay();
});

document.querySelector('#restoreEnvironmentBuildings').addEventListener('click', () => {
  for (const building of builderEnvironmentBuildings) building.object.visible = true;
  saveBuilderEnvironmentBuildings();
  updateBuilderBuildingRestoreButton();
  invalidateBuilderTrackPicture();
  showToast('Removed map buildings restored.');
});

function updateEnvironmentFromControls() {
  environmentState = {
    time: Number(document.querySelector('#environmentTime').value),
    fogDistance: Number(document.querySelector('#environmentFog').value),
    weather: document.querySelector('#environmentWeather').value,
    brightness: Number(document.querySelector('#environmentBrightness').value) / 100,
  };
  applyEnvironmentToScene();
  if (currentPage === 'builder') {
    invalidateBuilderTrackPicture();
    saveBuilderBiomeEnvironment();
  } else {
    saveBiomeEnvironment();
  }
}
['#environmentTime', '#environmentFog', '#environmentBrightness'].forEach((selector) => document.querySelector(selector).addEventListener('input', updateEnvironmentFromControls));
document.querySelector('#environmentWeather').addEventListener('change', updateEnvironmentFromControls);

document.querySelector('#builderBiomeSelect').addEventListener('change', (event) => {
  const nextBiome = event.currentTarget.value;
  if (nextBiome === activeBiome) return;
  detachBuilderPropTransform();
  customGateObjects.forEach((object) => { gateRoot.remove(object); clearChildren(object); });
  builderPropObjects.forEach((object) => { builderPropRoot.remove(object); clearChildren(object); });
  builderGates = [];
  customGateObjects = [];
  builderProps = [];
  builderPropObjects = [];
  builderPlacementHistory = [];
  clearBuilderRaceLine();
  selectedGateId = null;
  selectedBuilderPropId = null;
  selectedEnvironmentBuildingId = null;
  builderSelectionHelper.visible = false;
  safeApplyBiome(nextBiome);
  document.querySelector('#builderTrackName').value = '';
  document.querySelector('#builderLapCount').value = '1';
  builderTrackPicture = '';
  renderBuilderTrackPicture();
  setBuilderGameMode(builderGameMode, nextBiome);
  renderSavedBuilderTracks('');
  setBuilderSaveMessage('Blank course ready. Save it to keep it on this device.');
  setBuilderCamera();
  if (gatePlacementArmed) updateBuilderGhostPosition(orbit.target);
  void updatePartyConfig();
  showToast(`${biomes[activeBiome].name} loaded. Environment edits save per biome.`);
});

function updateBuilderPublishState() {
  const button = document.querySelector('#publishCommunityTrack');
  if (!button) return;
  const name = document.querySelector('#builderTrackName').value.trim();
  button.disabled = publishingBuilderTrack || name.length < 2 || name.length > 32 || !builderTrackIsViable() || !builderTrackPicture;
}

function setBuilderPublishMessage(message, isError = false) {
  const node = document.querySelector('#builderPublishMessage');
  node.textContent = message;
  node.classList.toggle('is-error', isError);
}

function renderBuilderTrackPicture() {
  const preview = document.querySelector('#builderTrackPicturePreview');
  preview.hidden = !builderTrackPicture;
  if (builderTrackPicture) preview.src = builderTrackPicture;
  else preview.removeAttribute('src');
  document.querySelector('#builderPicturePlaceholder').hidden = Boolean(builderTrackPicture);
}

function invalidateBuilderTrackPicture() {
  const hadPicture = Boolean(builderTrackPicture);
  if (hadPicture) {
    builderTrackPicture = '';
    renderBuilderTrackPicture();
  }
  if (currentPage === 'builder') setBuilderSaveMessage('Unsaved changes. Save this track to keep them on this device.');
  updateBuilderPublishState();
  const requirements = builderTrackRequirementsMessage();
  const missing = requirements ? [requirements] : [];
  const trackName = document.querySelector('#builderTrackName').value.trim();
  if (trackName.length < 2 || trackName.length > 32) missing.push('Add a track name between 2 and 32 characters.');
  missing.push(`${hadPicture ? 'Capture a fresh' : 'Take a'} picture before you upload it.`);
  setBuilderPublishMessage(missing.join(' '));
}

function setBuilderSaveMessage(message, isError = false) {
  const node = document.querySelector('#builderSaveMessage');
  node.textContent = message;
  node.classList.toggle('is-error', isError);
}

function savedBuilderTrackStorageKey() {
  return `aerframe-saved-builder-tracks-${activeBiome}`;
}

function readSavedBuilderTracks() {
  try {
    const tracks = JSON.parse(localStorage.getItem(savedBuilderTrackStorageKey()) || '[]');
    return Array.isArray(tracks)
      ? tracks.filter((track) => track && typeof track.id === 'string' && typeof track.name === 'string'
        && track.biomeId === activeBiome && Array.isArray(track.gates) && Array.isArray(track.props))
      : [];
  } catch {
    setBuilderSaveMessage('Could not read saved tracks from this browser.', true);
    return null;
  }
}

function renderSavedBuilderTracks(selectedId = document.querySelector('#builderSavedTrackSelect').value) {
  const select = document.querySelector('#builderSavedTrackSelect');
  const tracks = readSavedBuilderTracks();
  select.replaceChildren();
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = tracks ? tracks.length ? 'Choose a saved track' : 'No saved tracks' : 'Saved tracks unavailable';
  select.append(placeholder);
  (tracks || []).forEach((track) => {
    const option = document.createElement('option');
    option.value = track.id;
    option.textContent = track.name;
    select.append(option);
  });
  select.value = tracks?.some((track) => track.id === selectedId) ? selectedId : '';
  document.querySelector('#loadSavedBuilderTrack').disabled = !select.value;
  document.querySelector('#deleteSavedBuilderTrack').disabled = !select.value;
}

function saveBuilder() {
  const name = document.querySelector('#builderTrackName').value.trim();
  if (name.length < 2 || name.length > 32) {
    setBuilderSaveMessage('Add a track name between 2 and 32 characters before saving.', true);
    return false;
  }
  const tracks = readSavedBuilderTracks();
  if (!tracks) return false;
  const existingIndex = tracks.findIndex((track) => track.name.toLocaleLowerCase() === name.toLocaleLowerCase());
  const id = existingIndex >= 0
    ? tracks[existingIndex].id
    : globalThis.crypto?.randomUUID?.() || `saved-track-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const track = {
    id,
    name,
    biomeId: activeBiome,
    gameMode: builderGameMode,
    laps: Number(document.querySelector('#builderLapCount').value) || 1,
    imageDataUrl: builderTrackPicture,
    gates: builderGates.map((gate) => ({ ...gate })),
    props: builderProps.map((prop) => ({ ...prop })),
    raceLine: builderRaceLineGenerated ? builderRaceLinePoints.map((point) => point.toArray()) : null,
    raceLineGateRefs: builderRaceLineGenerated ? builderRaceLineGateRefs.map((gateRef) => ({ ...gateRef })) : null,
  };
  if (existingIndex >= 0) tracks[existingIndex] = track;
  else tracks.push(track);
  try {
    localStorage.setItem(savedBuilderTrackStorageKey(), JSON.stringify(tracks));
  } catch {
    setBuilderSaveMessage('Could not save this track. Browser storage may be full.', true);
    return false;
  }
  renderSavedBuilderTracks(id);
  setBuilderSaveMessage(`"${name}" saved on this device.`);
  return true;
}

document.querySelector('#saveBuilderTrack').addEventListener('click', saveBuilder);
document.querySelector('#builderSavedTrackSelect').addEventListener('change', (event) => {
  const selected = Boolean(event.currentTarget.value);
  document.querySelector('#loadSavedBuilderTrack').disabled = !selected;
  document.querySelector('#deleteSavedBuilderTrack').disabled = !selected;
});
document.querySelector('#loadSavedBuilderTrack').addEventListener('click', () => {
  const tracks = readSavedBuilderTracks();
  if (!tracks) return;
  const track = tracks.find((item) => item.id === document.querySelector('#builderSavedTrackSelect').value);
  if (!track) return;
  detachBuilderPropTransform();
  customGateObjects.forEach((object) => { gateRoot.remove(object); clearChildren(object); });
  builderPropObjects.forEach((object) => { builderPropRoot.remove(object); clearChildren(object); });
  builderGates = [];
  customGateObjects = [];
  builderProps = [];
  builderPropObjects = [];
  builderPlacementHistory = [];
  selectedGateId = null;
  selectedBuilderPropId = null;
  selectedEnvironmentBuildingId = null;
  builderSelectionHelper.visible = false;
  restoreBuilder(track);
  restoreBuilderProps(track);
  setBuilderGameMode(track.gameMode, activeBiome);
  setBuilderSaveMessage(`Loaded "${track.name}". Save again to keep any changes.`);
});
document.querySelector('#deleteSavedBuilderTrack').addEventListener('click', () => {
  const select = document.querySelector('#builderSavedTrackSelect');
  const tracks = readSavedBuilderTracks();
  if (!tracks) return;
  const track = tracks.find((item) => item.id === select.value);
  if (!track) return;
  try {
    localStorage.setItem(savedBuilderTrackStorageKey(), JSON.stringify(tracks.filter((item) => item.id !== track.id)));
  } catch {
    setBuilderSaveMessage('Could not delete the saved track from this browser.', true);
    return;
  }
  renderSavedBuilderTracks();
  setBuilderSaveMessage(`"${track.name}" deleted from this device.`);
});

document.querySelector('#builderTrackName').addEventListener('input', () => {
  updateBuilderPublishState();
  setBuilderSaveMessage('Unsaved changes. Save this track to keep them on this device.');
});
document.querySelector('#builderLapCount').addEventListener('change', () => {
  updateBuilderPublishState();
  setBuilderSaveMessage('Unsaved changes. Save this track to keep them on this device.');
});

function captureCommunityTrackPicture(source) {
  const capture = document.createElement('canvas');
  const context = capture.getContext('2d');
  if (!context || !source.width || !source.height) return '';

  let bestImage = '';
  for (const [width, height] of [[1600, 900], [1280, 720], [1024, 576]]) {
    capture.width = width;
    capture.height = height;
    context.fillStyle = '#080d1d';
    context.fillRect(0, 0, width, height);
    const scale = Math.min(width / source.width, height / source.height);
    const imageWidth = source.width * scale;
    const imageHeight = source.height * scale;
    context.drawImage(source, (width - imageWidth) / 2, (height - imageHeight) / 2, imageWidth, imageHeight);

    for (const quality of [0.96, 0.92, 0.88, 0.84, 0.8, 0.76, 0.72]) {
      bestImage = capture.toDataURL('image/jpeg', quality);
      // Keep the encoded image under the server's 320 KB upload limit.
      if (bestImage.length <= 410_000) return bestImage;
    }
  }
  return bestImage;
}

document.querySelector('#captureTrackPicture').addEventListener('click', () => {
  if (currentPage !== 'builder') return;
  const selectedHelperVisible = builderSelectionHelper.visible;
  const ghostVisible = builderGhostRoot.visible;
  const transformVisible = builderTransformHelper.visible;
  const lineHandlesVisible = builderRaceLineHandleRoot.visible;
  builderSelectionHelper.visible = false;
  builderGhostRoot.visible = false;
  builderTransformHelper.visible = false;
  builderRaceLineHandleRoot.visible = false;
  let picture = '';
  try {
    composer.render();
    picture = captureCommunityTrackPicture(renderer.domElement);
  } catch {
    setBuilderPublishMessage('Could not capture the world. Try again after it finishes loading.', true);
  } finally {
    builderSelectionHelper.visible = selectedHelperVisible;
    builderGhostRoot.visible = ghostVisible;
    builderTransformHelper.visible = transformVisible;
    builderRaceLineHandleRoot.visible = lineHandlesVisible;
    try { composer.render(); } catch { /* The next animation frame will redraw the scene. */ }
  }
  if (!picture) return;
  builderTrackPicture = picture;
  renderBuilderTrackPicture();
  const nameReady = document.querySelector('#builderTrackName').value.trim().length >= 2;
  const courseReady = builderTrackIsViable();
  const missingUploadDetails = [];
  if (!courseReady) missingUploadDetails.push(builderTrackRequirementsMessage());
  if (!nameReady) missingUploadDetails.push('Add a track name between 2 and 32 characters.');
  const message = missingUploadDetails.length
    ? `Picture ready. ${missingUploadDetails.join(' ')}`
    : 'Picture ready. Save locally or upload.';
  setBuilderPublishMessage(message);
  updateBuilderPublishState();
});

document.querySelector('#publishCommunityTrack').addEventListener('click', async () => {
  const name = document.querySelector('#builderTrackName').value.trim();
  if (name.length < 2 || name.length > 32 || !builderTrackIsViable() || !builderTrackPicture) {
    setBuilderPublishMessage(builderTrackRequirementsMessage() || 'Add a valid track name and capture a picture before uploading.');
    updateBuilderPublishState();
    return;
  }
  const uploadGates = orderedBuilderGates();
  publishingBuilderTrack = true;
  updateBuilderPublishState();
  setBuilderPublishMessage('Uploading your track…');
  try {
    const response = await fetch('/api/community-tracks', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        biomeId: activeBiome,
        gameMode: builderGameMode,
        laps: Number(document.querySelector('#builderLapCount').value) || 1,
        startFinishIndex: 0,
        points: uploadGates.map((slot) => [slot.x, slot.y + builderGateFlightCenterY, slot.z]),
        gateRotations: uploadGates.map((slot) => slot.rotation || 0),
        gateEntryDirections: uploadGates.map((slot) => slot.openingIndex !== null
          ? [slot.entryDirections?.[slot.openingIndex] ?? 1]
          : Array.isArray(slot.entryDirections) ? [...slot.entryDirections] : [slot.entryDirection === -1 ? -1 : 1]),
        gateTypes: uploadGates.map((slot) => slot.gate.type),
        gateColors: uploadGates.map((slot) => slot.gate.color || 'cyan'),
        gateIds: uploadGates.map((slot) => slot.gate.id),
        gateOpeningIndices: uploadGates.map((slot) => slot.openingIndex ?? -1),
        gateRotationsX: uploadGates.map((slot) => slot.rotationX || 0),
        gateRotationsZ: uploadGates.map((slot) => slot.rotationZ || 0),
        gateScales: uploadGates.map((slot) => slot.scale || 1),
        gateScalesX: uploadGates.map((slot) => slot.scaleX || slot.scale || 1),
        gateScalesY: uploadGates.map((slot) => slot.scaleY || slot.scale || 1),
        gateScalesZ: uploadGates.map((slot) => slot.scaleZ || slot.scale || 1),
        objects: builderProps.map(({ type, x, y, z, rotation, rotationX, rotationY, rotationZ, scale, scaleX, scaleY, scaleZ, isLaunchPodium }) => ({ type, x, y, z, rotation, rotationX, rotationY, rotationZ, scale, scaleX, scaleY, scaleZ, isLaunchPodium })),
        raceLine: builderRaceLineGenerated ? builderRaceLinePoints.map((point) => point.toArray()) : null,
        imageDataUrl: builderTrackPicture,
      }),
    });
    let result = {};
    try { result = await response.json(); } catch { /* The API can return a plain error page when unavailable. */ }
    if (!response.ok) throw new Error(result.error || 'Could not upload this track. Please try again.');
    const track = result.track;
    const environmentId = trackEnvironmentId(track);
    if (!track || !environmentId) throw new Error('The server saved the track, but it could not be loaded in the community library.');
    const publishedTrack = {
      ...track,
      gameMode: trackGameMode(track),
      biomeId: environmentId,
      environmentId,
      biomeName: biomes[environmentId].name,
    };
    publishedCommunityTracks = [
      publishedTrack,
      ...publishedCommunityTracks.filter((existing) => existing.id !== track.id),
    ];
    if (!trackCatalog[environmentId].some((candidate) => candidate.id === track.id)) trackCatalog[environmentId].unshift(publishedTrack);
    renderCommunityTrackPicker();
    renderServerTrackChoices();
    setPage('communityTracks');
    showToast(`${name} uploaded to community tracks.`);
  } catch (error) {
    setBuilderPublishMessage(error instanceof Error ? error.message : 'Could not upload this track. Please try again.', true);
  } finally {
    publishingBuilderTrack = false;
    updateBuilderPublishState();
  }
});

function restoreBuilder(savedTrack = null) {
  clearBuilderRaceLine();
  if (Array.isArray(savedTrack?.raceLine)) {
    builderRaceLinePoints = savedTrack.raceLine.slice(0, 240).flatMap((point) => {
      if (!Array.isArray(point) || point.length < 3) return [];
      const coordinates = point.slice(0, 3).map(Number);
      if (!coordinates.every((value) => Number.isFinite(value) && Math.abs(value) <= 1000)) return [];
      return [new THREE.Vector3(...coordinates)];
    });
    builderRaceLineGenerated = builderRaceLinePoints.length >= 3 && builderRaceLinePoints.length % 3 === 0;
    if (builderRaceLineGenerated) rebuildBuilderRaceLineHandles();
    else builderRaceLinePoints = [];
  }
  if (builderRaceLineGenerated && Array.isArray(savedTrack?.raceLineGateRefs)) {
    builderRaceLineGateRefs = savedTrack.raceLineGateRefs.slice(0, builderRaceLinePoints.length / 3)
      .filter((gateRef) => typeof gateRef?.gateId === 'string' && Number.isInteger(gateRef.openingIndex) && gateRef.openingIndex >= 0)
      .map((gateRef) => ({ gateId: gateRef.gateId, openingIndex: gateRef.openingIndex }));
  }
  builderPlacementHistory = [];
  let saved = [];
  if (savedTrack) {
    document.querySelector('#builderTrackName').value = typeof savedTrack.name === 'string' ? savedTrack.name.slice(0, 32) : '';
    document.querySelector('#builderLapCount').value = String([1, 2, 3, 4, 5].includes(Number(savedTrack.laps)) ? Number(savedTrack.laps) : 1);
    builderTrackPicture = typeof savedTrack.imageDataUrl === 'string' && savedTrack.imageDataUrl.startsWith('data:image/jpeg;base64,') ? savedTrack.imageDataUrl : '';
    setBuilderGameMode(Object.hasOwn(builderGameModeLabels, savedTrack.gameMode) ? savedTrack.gameMode : '4v4', activeBiome, false);
    saved = savedTrack.gates;
  } else {
    try {
      const metadata = JSON.parse(localStorage.getItem(`aerframe-course-meta-${activeBiome}`) || '{}');
      document.querySelector('#builderTrackName').value = typeof metadata.name === 'string' ? metadata.name.slice(0, 32) : '';
      document.querySelector('#builderLapCount').value = String([1, 2, 3, 4, 5].includes(Number(metadata.laps)) ? Number(metadata.laps) : 1);
      builderTrackPicture = typeof metadata.imageDataUrl === 'string' && metadata.imageDataUrl.startsWith('data:image/jpeg;base64,') ? metadata.imageDataUrl : '';
      setBuilderGameMode(getSavedBuilderGameMode(activeBiome), activeBiome, false);
    } catch {
      document.querySelector('#builderTrackName').value = '';
      document.querySelector('#builderLapCount').value = '1';
      builderTrackPicture = '';
      setBuilderGameMode(getSavedBuilderGameMode(activeBiome), activeBiome, false);
    }
    try {
      const biomeCourse = localStorage.getItem(`aerframe-course-${activeBiome}`);
      const legacyCourse = activeBiome === 'neon-docks' ? localStorage.getItem('aerframe-course') : null;
      saved = JSON.parse(biomeCourse || legacyCourse || '[]');
    } catch { saved = []; }
  }
  renderBuilderTrackPicture();
  if (!Array.isArray(saved)) {
    updateBuilderDisplay();
    return;
  }
  builderGates = saved.slice(0, 80).map((gate, index) => {
    const x = Number(gate.x) || 0;
    const z = Number(gate.z) || 0;
    const savedY = Number(gate.y);
    return {
      id: gate.id || `legacy-${index}-${Date.now()}`,
      type: ({
        single: 'neon-square',
        ladder: 'neon-ladder',
        flag: 'neon-flag',
        hurdle: 'neon-hurdle',
        dive: 'neon-dive',
        corkscrew: 'neon-square',
      })[gate.type] || (gateTypes[gate.type] ? gate.type : 'neon-square'),
      x,
      y: Number.isFinite(savedY) && savedY !== 0 ? savedY : terrainSurfaceYAt(activeBiome, x, z),
      z,
      rotation: Number(gate.rotation) || 0,
      rotationX: Number(gate.rotationX) || 0,
      rotationZ: Number(gate.rotationZ) || 0,
      scale: Number(gate.scale) || 1,
      scaleX: Number(gate.scaleX) || Number(gate.scale) || 1,
      scaleY: Number(gate.scaleY) || Number(gate.scale) || 1,
      scaleZ: Number(gate.scaleZ) || Number(gate.scale) || 1,
      color: colors[gate.color] ? gate.color : 'cyan',
      entryDirection: gate.entryDirection === 0 ? 0 : gate.entryDirection === -1 ? -1 : 1,
      entryDirections: Array.isArray(gate.entryDirections)
        ? gate.entryDirections.map((direction) => direction === 0 ? 0 : direction === -1 ? -1 : 1)
        : null,
      entryRouteOrders: Array.isArray(gate.entryRouteOrders)
        ? gate.entryRouteOrders.map((routeOrder) => Number.isSafeInteger(routeOrder) && routeOrder > 0 ? routeOrder : 0)
        : null,
      entryStartFinish: Array.isArray(gate.entryStartFinish)
        ? gate.entryStartFinish.map((isStartFinish) => isStartFinish === true)
        : null,
      isStartFinish: gate.isStartFinish === true,
      routeOrder: Number.isSafeInteger(gate.routeOrder) ? gate.routeOrder : index,
    };
  });
  customGateObjects = builderGates.map((gate) => createBuilderGate(gate));
  normalizeBuilderGateSequence();
  if (builderRaceLineGenerated && !builderRaceLineGateRefs.length) {
    builderRaceLineGateRefs = orderedBuilderGates().slice(0, builderRaceLinePoints.length / 3)
      .map((slot) => ({ gateId: slot.gate.id, openingIndex: slot.openingIndex ?? 0 }));
  }
  builderPlacementHistory = builderGates.map((gate) => ({ kind: 'gate', id: gate.id }));
  updateBuilderDisplay();
}

function restoreBuilderProps(savedTrack = null) {
  detachBuilderPropTransform();
  let saved = [];
  if (savedTrack) saved = savedTrack.props;
  else {
    try { saved = JSON.parse(localStorage.getItem(`aerframe-props-${activeBiome}`) || '[]'); } catch { saved = []; }
  }
  builderProps = Array.isArray(saved) ? saved.filter((prop) => builderPropTypes[prop.type]).slice(0, 100).map((prop, index) => {
    const x = THREE.MathUtils.clamp(Number(prop.x) || 0, -320, 320);
    const z = THREE.MathUtils.clamp(Number(prop.z) || 0, -320, 320);
    return {
      id: typeof prop.id === 'string' ? prop.id : `saved-prop-${index}-${Date.now()}`,
      type: prop.type,
      x,
      y: Number.isFinite(Number(prop.y)) ? Number(prop.y) : terrainSurfaceYAt(activeBiome, x, z),
      z,
      rotation: Number(prop.rotation) || 0,
      rotationX: THREE.MathUtils.clamp(Number(prop.rotationX) || 0, -360, 360),
      rotationY: THREE.MathUtils.clamp(Number(prop.rotationY ?? prop.rotation) || 0, -360, 360),
      rotationZ: THREE.MathUtils.clamp(Number(prop.rotationZ) || 0, -360, 360),
      scale: THREE.MathUtils.clamp(Number(prop.scale) || 1, 0.5, 2),
      scaleX: THREE.MathUtils.clamp(Number(prop.scaleX ?? prop.scale) || 1, 0.5, 2),
      scaleY: THREE.MathUtils.clamp(Number(prop.scaleY ?? prop.scale) || 1, 0.5, 2),
      scaleZ: THREE.MathUtils.clamp(Number(prop.scaleZ ?? prop.scale) || 1, 0.5, 2),
      isLaunchPodium: prop.type === 'podium' && prop.isLaunchPodium === true,
    };
  }) : [];
  const launchPodium = builderProps.find((prop) => prop.isLaunchPodium) || builderProps.find((prop) => prop.type === 'podium');
  builderProps.forEach((prop) => { prop.isLaunchPodium = prop.id === launchPodium?.id; });
  builderPropObjects = builderProps.map((prop) => createBuilderPropObject(prop));
  builderPlacementHistory = [...builderPlacementHistory, ...builderProps.map((prop) => ({ kind: 'prop', id: prop.id }))];
  updateBuilderDisplay();
  if (!publishingBuilderTrack) setBuilderPublishMessage(builderTrackRequirementsMessage());
}
safeApplyBiome((() => {
  try {
    if (localStorage.getItem('aerframe-menu-version') !== '3') {
      localStorage.setItem('aerframe-menu-version', '3');
      localStorage.setItem('aerframe-biome', 'neon-docks');
      return 'neon-docks';
    }
    return biomes[localStorage.getItem('aerframe-biome')] ? localStorage.getItem('aerframe-biome') : 'neon-docks';
  } catch { return 'neon-docks'; }
})(), false, { buildEnvironment: false });
restoreBuilder();
restoreBuilderProps();
syncWorldMode();

const fovRange = document.querySelector('#fovRange');
const angleRange = document.querySelector('#angleRange');
const flightCameraQuickControls = document.querySelector('#flightCameraQuickControls');
const flightCameraToggle = document.querySelector('#flightCameraToggle');
const flightCameraPanel = document.querySelector('#flightCameraPanel');
const flightFovRange = document.querySelector('#flightFovRange');
const flightAngleRange = document.querySelector('#flightAngleRange');
const flightFovValue = document.querySelector('#flightFovValue');
const flightAngleValue = document.querySelector('#flightAngleValue');
const qualitySelect = document.querySelector('#qualitySelect');
const droneNeonColorInput = document.querySelector('#droneNeonColor');
const droneNeonColorValue = document.querySelector('#droneNeonColorValue');
const droneBodyColorInput = document.querySelector('#droneBodyColor');
const droneBodyColorValue = document.querySelector('#droneBodyColorValue');
const dronePropColorInput = document.querySelector('#dronePropColor');
const dronePropColorValue = document.querySelector('#dronePropColorValue');
const soundToggle = document.querySelector('#soundToggle');
const audioVolumeRange = document.querySelector('#audioVolumeRange');
const audioVolumeValue = document.querySelector('#audioVolumeValue');
fovRange.value = String(storedSettings.fov || 90);
angleRange.value = String(cameraAngle);
flightFovRange.value = fovRange.value;
flightAngleRange.value = angleRange.value;
qualitySelect.value = String(quality);
droneNeonColorInput.value = droneNeonColor;
droneNeonColorValue.textContent = droneNeonColor.toUpperCase();
droneBodyColorInput.value = droneBodyColor;
droneBodyColorValue.textContent = droneBodyColor.toUpperCase();
dronePropColorInput.value = dronePropColor;
dronePropColorValue.textContent = dronePropColor.toUpperCase();
audioVolumeRange.value = String(Math.round(audioVolume * 100));
audioVolumeValue.textContent = `${audioVolumeRange.value}%`;
document.querySelector('#fovValue').textContent = `${fovRange.value}°`;
document.querySelector('#angleValue').textContent = `${angleRange.value}°`;
flightFovValue.textContent = `${fovRange.value}°`;
flightAngleValue.textContent = `${angleRange.value}°`;

function setCameraFov(value) {
  const fov = THREE.MathUtils.clamp(Number(value) || 90, 85, 130);
  fovRange.value = String(fov);
  flightFovRange.value = String(fov);
  document.querySelector('#fovValue').textContent = `${fov}°`;
  flightFovValue.textContent = `${fov}°`;
  camera.fov = fov;
  camera.updateProjectionMatrix();
}

function setCameraAngle(value) {
  cameraAngle = THREE.MathUtils.clamp(Number(value) || 45, 5, 60);
  angleRange.value = String(cameraAngle);
  flightAngleRange.value = String(cameraAngle);
  document.querySelector('#angleValue').textContent = `${cameraAngle}°`;
  flightAngleValue.textContent = `${cameraAngle}°`;
}

function updateRenderResolution() {
  const pixelRatioLimit = quality > 1.8 ? 2.8 : 2.4;
  const pixelRatio = Math.min((window.devicePixelRatio || 1) * quality, pixelRatioLimit);
  renderer.setPixelRatio(pixelRatio);
  composer.setPixelRatio(pixelRatio);
  const width = mount.clientWidth;
  const height = mount.clientHeight;
  if (width && height) {
    renderer.setSize(width, height, false);
    composer.setSize(width, height);
  }
}

function restartForRenderQuality() {
  saveSettings();
  showToast('Restarting the renderer to apply sharp display quality...');
  window.setTimeout(() => window.location.reload(), 350);
}

updateRenderResolution();

[fovRange, flightFovRange].forEach((range) => range.addEventListener('input', () => {
  setCameraFov(range.value);
  saveSettings();
}));
[angleRange, flightAngleRange].forEach((range) => range.addEventListener('input', () => {
  setCameraAngle(range.value);
  saveSettings();
}));
flightCameraToggle.addEventListener('click', () => {
  const open = flightCameraPanel.hidden;
  flightCameraPanel.hidden = !open;
  flightCameraToggle.setAttribute('aria-expanded', String(open));
});
qualitySelect.addEventListener('change', () => {
  quality = Number(qualitySelect.value);
  updateRenderResolution();
  restartForRenderQuality();
});
function updateDroneNeonSetting() {
  droneNeonColor = droneNeonColorInput.value;
  applyDroneNeonColor(droneNeonColor);
  droneNeonColorValue.textContent = droneNeonColor.toUpperCase();
  saveSettings();
}
droneNeonColorInput.addEventListener('input', updateDroneNeonSetting);
droneNeonColorInput.addEventListener('change', updateDroneNeonSetting);
function updateDroneBodyColorSetting() {
  droneBodyColor = droneBodyColorInput.value;
  applyDroneBodyColor(droneBodyColor);
  droneBodyColorValue.textContent = droneBodyColor.toUpperCase();
  saveSettings();
}
droneBodyColorInput.addEventListener('input', updateDroneBodyColorSetting);
droneBodyColorInput.addEventListener('change', updateDroneBodyColorSetting);
function updateDronePropColorSetting() {
  dronePropColor = dronePropColorInput.value;
  applyDronePropColor(dronePropColor);
  dronePropColorValue.textContent = dronePropColor.toUpperCase();
  saveSettings();
}
dronePropColorInput.addEventListener('input', updateDronePropColorSetting);
dronePropColorInput.addEventListener('change', updateDronePropColorSetting);

function setSwitch(button, value) {
  button.classList.toggle('is-on', value);
  button.setAttribute('aria-checked', String(value));
  button.querySelector('span').textContent = value ? 'ON' : 'OFF';
}
setSwitch(soundToggle, soundEnabled);
setSwitch(document.querySelector('#lobbyMusicToggle'), lobbyMusicEnabled);
setSwitch(document.querySelector('#hudToggle'), hudEnabled);
setSwitch(document.querySelector('#reticleToggle'), reticleEnabled);
setSwitch(document.querySelector('#firstPersonPropsToggle'), firstPersonPropsEnabled);
setSwitch(document.querySelector('#gameChatToggle'), gameChatEnabled);
setSwitch(document.querySelector('#vignetteToggle'), vignetteEnabled);
setSwitch(document.querySelector('#raceLineToggle'), raceLineEnabled);
hud.classList.toggle('reticle-hidden', !reticleEnabled);
soundToggle.addEventListener('click', async (event) => {
  const nextValue = !soundEnabled;
  try {
    if (nextValue) {
      if (!motorGain) initializeMotorAudio();
      if (audioContext.state === 'suspended') await audioContext.resume();
    }
    soundEnabled = nextValue;
    setSwitch(event.currentTarget, soundEnabled);
    if (soundEnabled) playUiSound('enable');
    updateMotorAudio({ pitch: 0, roll: 0 });
    saveSettings();
    showToast(soundEnabled ? 'Flight and menu audio enabled.' : 'Audio muted.');
  } catch {
    setSwitch(event.currentTarget, soundEnabled);
    showToast('Audio is unavailable in this browser.');
  }
});
audioVolumeRange.addEventListener('input', () => {
  audioVolume = Number(audioVolumeRange.value) / 100;
  audioVolumeValue.textContent = `${audioVolumeRange.value}%`;
  updateMotorAudio({ pitch: 0, roll: 0 });
  updateLobbyMusicVolume();
  saveSettings();
});
document.querySelector('#lobbyMusicToggle').addEventListener('click', (event) => {
  lobbyMusicEnabled = !lobbyMusicEnabled;
  setSwitch(event.currentTarget, lobbyMusicEnabled);
  syncLobbyMusic();
  saveSettings();
});
document.querySelector('#resetAudioSettings').addEventListener('click', () => {
  soundEnabled = false;
  lobbyMusicEnabled = true;
  audioVolume = 1;
  audioVolumeRange.value = '100';
  audioVolumeValue.textContent = '100%';
  setSwitch(soundToggle, false);
  setSwitch(document.querySelector('#lobbyMusicToggle'), true);
  updateMotorAudio({ pitch: 0, roll: 0 });
  stopLobbyMusic();
  syncLobbyMusic();
  saveSettings();
  showToast('Audio settings reset to defaults.');
});
document.querySelector('#hudToggle').addEventListener('click', (event) => {
  hudEnabled = !hudEnabled;
  setSwitch(event.currentTarget, hudEnabled);
  hud.classList.toggle('is-hidden', !hudEnabled);
  saveSettings();
});
document.querySelector('#reticleToggle').addEventListener('click', (event) => {
  reticleEnabled = !reticleEnabled;
  setSwitch(event.currentTarget, reticleEnabled);
  hud.classList.toggle('reticle-hidden', !reticleEnabled);
  saveSettings();
});
document.querySelector('#firstPersonPropsToggle').addEventListener('click', (event) => {
  firstPersonPropsEnabled = !firstPersonPropsEnabled;
  setSwitch(event.currentTarget, firstPersonPropsEnabled);
  if (flying) updateFlightCamera();
  saveSettings();
});
document.querySelector('#gameChatToggle').addEventListener('click', (event) => {
  gameChatEnabled = !gameChatEnabled;
  setSwitch(event.currentTarget, gameChatEnabled);
  updateGameChatUI();
  if (gameChatEnabled) void refreshGameChat();
  saveSettings();
});
document.querySelector('#vignetteToggle').addEventListener('click', (event) => {
  vignetteEnabled = !vignetteEnabled;
  setSwitch(event.currentTarget, vignetteEnabled);
  hud.classList.toggle('no-vignette', !vignetteEnabled);
  saveSettings();
});
document.querySelector('#raceLineToggle').addEventListener('click', (event) => {
  raceLineEnabled = !raceLineEnabled;
  setSwitch(event.currentTarget, raceLineEnabled);
  flightRaceLineRoot.visible = flying && raceLineEnabled && flightRaceLineRoot.children.length > 0
    && (selectedMode === 'Race' || isMultiplayerRaceActive() || builderTestCourse);
  saveSettings();
});
document.querySelector('#resetSettings').addEventListener('click', () => {
  const qualityChanged = quality !== 1.8;
  setCameraFov(90);
  setCameraAngle(45);
  qualitySelect.value = '1.8';
  droneNeonColor = DEFAULT_DRONE_NEON_COLOR;
  droneNeonColorInput.value = droneNeonColor;
  droneNeonColorValue.textContent = droneNeonColor.toUpperCase();
  applyDroneNeonColor(droneNeonColor);
  droneBodyColor = DEFAULT_DRONE_BODY_COLOR;
  droneBodyColorInput.value = droneBodyColor;
  droneBodyColorValue.textContent = droneBodyColor.toUpperCase();
  applyDroneBodyColor(droneBodyColor);
  dronePropColor = DEFAULT_DRONE_PROP_COLOR;
  dronePropColorInput.value = dronePropColor;
  dronePropColorValue.textContent = dronePropColor.toUpperCase();
  applyDronePropColor(dronePropColor);
  quality = 1.8;
  hudEnabled = true;
  reticleEnabled = true;
  firstPersonPropsEnabled = true;
  gameChatEnabled = true;
  vignetteEnabled = true;
  raceLineEnabled = true;
  syncFlightTuneControls();
  renderRatePreview();
  setSwitch(document.querySelector('#hudToggle'), true);
  setSwitch(document.querySelector('#reticleToggle'), true);
  setSwitch(document.querySelector('#firstPersonPropsToggle'), true);
  setSwitch(document.querySelector('#gameChatToggle'), true);
  setSwitch(document.querySelector('#vignetteToggle'), true);
  setSwitch(document.querySelector('#raceLineToggle'), true);
  if (flying) updateFlightCamera();
  hud.classList.remove('is-hidden', 'reticle-hidden', 'no-vignette');
  updateGameChatUI();
  updateRenderResolution();
  camera.updateProjectionMatrix();
  if (qualityChanged) restartForRenderQuality();
  else {
    saveSettings();
    showToast('Settings reset to defaults.');
  }
});

document.querySelectorAll('[data-coming-soon]').forEach((button) => button.addEventListener('click', () => {
  showToast(`${button.dataset.comingSoon} is part of the upcoming online build.`);
}));
document.querySelector('#biomeSelect').addEventListener('change', (event) => {
  const nextBiome = event.currentTarget.value;
  if (nextBiome === activeBiome) return;
  builderGates = [];
  customGateObjects = [];
  builderProps = [];
  builderPropObjects.forEach((object) => builderPropRoot.remove(object));
  builderPropObjects = [];
  builderPlacementHistory = [];
  selectedGateId = null;
  selectedBuilderPropId = null;
  builderSelectionHelper.visible = false;
  safeApplyBiome(nextBiome);
  restoreBuilder();
  restoreBuilderProps();
  void updatePartyConfig();
  showToast(`${biomes[activeBiome].name} loaded. Your custom course is saved per biome.`);
});
document.querySelector('#trackSelect').addEventListener('change', (event) => {
  const track = trackCatalog[activeBiome].find((item) => item.id === event.currentTarget.value);
  applyTrackSelection(event.currentTarget.value);
  void updatePartyConfig();
  if (track) showToast(`${track.name} loaded in ${biomes[activeBiome].name}.`);
});

function initializeMotorAudio() {
  audioContext ??= new (window.AudioContext || window.webkitAudioContext)();
  const compressor = audioContext.createDynamicsCompressor();
  compressor.threshold.value = -26;
  compressor.knee.value = 18;
  compressor.ratio.value = 3.5;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.13;

  motorGain = audioContext.createGain();
  motorGain.gain.value = 0;
  motorLowpass = audioContext.createBiquadFilter();
  motorLowpass.type = 'lowpass';
  motorLowpass.frequency.value = 1050;
  motorLowpass.Q.value = 0.8;
  motorLowpass.connect(motorGain);
  motorNoiseFilter = audioContext.createBiquadFilter();
  motorNoiseFilter.type = 'bandpass';
  motorNoiseFilter.frequency.value = 420;
  motorNoiseFilter.Q.value = 0.8;
  motorNoiseGain = audioContext.createGain();
  motorNoiseGain.gain.value = 0;
  motorNoiseFilter.connect(motorNoiseGain).connect(motorGain);
  motorGain.connect(compressor).connect(audioContext.destination);

  const detune = [0.986, 1.012, 1.021, 0.979];
  motorVoices = detune.map((trim, index) => {
    const bus = audioContext.createGain();
    bus.gain.value = 0.22;
    bus.connect(motorLowpass);
    const body = audioContext.createOscillator();
    body.type = 'triangle';
    body.frequency.value = 42;
    const bodyLevel = audioContext.createGain();
    bodyLevel.gain.value = 0.48;
    body.connect(bodyLevel).connect(bus);
    const blade = audioContext.createOscillator();
    blade.type = 'sawtooth';
    blade.frequency.value = 84;
    const bladeLevel = audioContext.createGain();
    bladeLevel.gain.value = 0.045;
    blade.connect(bladeLevel).connect(bus);
    const overtone = audioContext.createOscillator();
    overtone.type = 'sine';
    overtone.frequency.value = 168;
    const overtoneLevel = audioContext.createGain();
    overtoneLevel.gain.value = 0.012;
    overtone.connect(overtoneLevel).connect(bus);
    body.start(); blade.start(); overtone.start();
    return { trim, index, body, blade, overtone, bus };
  });

  const noiseBuffer = audioContext.createBuffer(1, audioContext.sampleRate * 2, audioContext.sampleRate);
  const samples = noiseBuffer.getChannelData(0);
  for (let i = 0; i < samples.length; i += 1) samples[i] = Math.random() * 2 - 1;
  motorNoiseSource = audioContext.createBufferSource();
  motorNoiseSource.buffer = noiseBuffer;
  motorNoiseSource.loop = true;
  motorNoiseSource.connect(motorNoiseFilter);
  motorNoiseSource.start();
}

function updateMotorAudio(controls) {
  if (!audioContext || !motorGain) return;
  const now = audioContext.currentTime;
  const active = soundEnabled && flying && !flightDamageState.crashed;
  motorGain.gain.setTargetAtTime(active ? 0.34 * audioVolume : 0, now, active ? 0.1 : 0.16);
  if (!active) {
    motorNoiseGain.gain.setTargetAtTime(0, now, 0.12);
    return;
  }

  const throttle = THREE.MathUtils.clamp(flight.throttle, 0, 1);
  // A large, low-pitched 14 inch setup turns more slowly; a bi-blade prop
  // produces two blade-pass pulses for each shaft revolution.
  const rpmTone = 36 + Math.pow(throttle, 1.18) * 88;
  const corrections = [
    controls.pitch + controls.roll,
    controls.pitch - controls.roll,
    -controls.pitch + controls.roll,
    -controls.pitch - controls.roll,
  ];
  motorVoices.forEach((voice, index) => {
    voice.bus.gain.setTargetAtTime(flightDamageState.brokenProps[index] ? 0 : 0.22, now, 0.08);
    const localRpm = rpmTone * voice.trim * (1 + corrections[index] * 0.035);
    voice.body.frequency.setTargetAtTime(localRpm, now, 0.055);
    voice.blade.frequency.setTargetAtTime(localRpm * 2, now, 0.05);
    voice.overtone.frequency.setTargetAtTime(localRpm * 4, now, 0.06);
  });
  motorLowpass.frequency.setTargetAtTime(760 + throttle * 900, now, 0.09);
  motorNoiseFilter.frequency.setTargetAtTime(300 + throttle * 520 + flight.speed * 1.4, now, 0.12);
  motorNoiseGain.gain.setTargetAtTime(0.002 + throttle * 0.009 + Math.min(flight.speed / 300, 0.003), now, 0.1);
}

renderer.domElement.addEventListener('dblclick', () => {
  if (flying || currentPage === 'builder') return;
  if (currentPage === 'trackPicker') setTrackOverviewCamera();
  else resetMenuCamera();
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'Escape' && !flying && currentPage === 'builder' && !document.querySelector('#builderSettingsDrawer').hidden) {
    event.preventDefault();
    setBuilderSettingsOpen(false);
    return;
  }
  if (event.code === 'Escape' && !authModal.hidden) {
    event.preventDefault();
    closeAuthModal();
    return;
  }
  if (event.code === 'Escape' && flying) {
    event.preventDefault();
    if (event.target instanceof Element && event.target.closest('#gameChat')) event.target.blur();
    if (currentPage === 'settings') {
      setPage(pageBeforeSettings);
    } else {
      pageBeforeSettings = currentPage;
      setSettingsTab('tune');
      setPage('settings');
    }
    return;
  }
  if (event.code === 'Escape' && !flying && currentPage === 'multiplayer' && partyLobby?.code) {
    event.preventDefault();
    pageBeforeSettings = 'multiplayer';
    setPage('settings');
    return;
  }
  if (event.code === 'Escape' && !flying && currentPage === 'builder') {
    event.preventDefault();
    setPage('builderMenu');
    return;
  }
  if (event.code === 'Escape' && currentPage === 'settings') {
    event.preventDefault();
    setPage(pageBeforeSettings);
    return;
  }
  const isBuilderNavigationKey = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'ShiftLeft', 'ShiftRight'].includes(event.code);
  const isTypingInControl = event.target instanceof Element && event.target.closest('input, select, textarea, [contenteditable="true"]');
  if (flying && ['Digit1', 'Numpad1'].includes(event.code) && !event.repeat && !isTypingInControl) {
    event.preventDefault();
    thirdPersonFlightCamera = !thirdPersonFlightCamera;
    flightCameraNeedsSnap = true;
    updateFlightCamera();
    return;
  }
  if (currentPage === 'builder' && !flying && !isTypingInControl && (event.ctrlKey || event.metaKey)) {
    if (event.code === 'KeyC' && (selectedGateId || selectedBuilderPropId)) {
      if (copySelectedBuilderObject()) event.preventDefault();
      return;
    }
    if (event.code === 'KeyV' && builderObjectClipboard) {
      event.preventDefault();
      pasteBuilderObject();
      return;
    }
  }
  if (flying && event.code === 'KeyR' && !event.repeat && !isTypingInControl && restartLocalRace('keyboard')) {
    event.preventDefault();
    return;
  }
  if (currentPage === 'builder' && !isTypingInControl && ['Delete', 'Backspace'].includes(event.code)) {
    const deleteButton = selectedGateId ? document.querySelector('#deleteGate') : (selectedBuilderPropId || selectedEnvironmentBuildingId) ? document.querySelector('#deleteBuilderProp') : null;
    if (deleteButton) {
      event.preventDefault();
      deleteButton.click();
      return;
    }
  }
  if (currentPage === 'builder' && isBuilderNavigationKey && !isTypingInControl) {
    builderMoveKeys.add(event.code);
    event.preventDefault();
  }
  if (!flying && event.code === 'Enter' && !event.repeat && authModal.hidden && !isTypingInControl) {
    event.preventDefault();
    if (currentPage === 'singleplayer' || currentPage === 'trackPicker' || currentPage === 'multiplayer' || currentPage === 'builderMenu') activateMenuChoice();
    else if (currentPage === 'builder') { selectedMode = 'Race'; enterFlight(); }
    return;
  }
  if (isTypingInControl) return;
  if (flying && ['Space', 'KeyC', 'ArrowUp', 'ArrowDown'].includes(event.code)) event.preventDefault();
  keys.add(event.code);
});
window.addEventListener('keyup', (event) => {
  keys.delete(event.code);
  builderMoveKeys.delete(event.code);
});
window.addEventListener('blur', () => {
  keys.clear();
  builderMoveKeys.clear();
});

function launchPadLocalPosition(position) {
  if (!launchPadState) return null;
  const dx = position.x - launchPadState.center.x;
  const dz = position.z - launchPadState.center.z;
  const cosine = Math.cos(launchPadState.yaw);
  const sine = Math.sin(launchPadState.yaw);
  return { x: dx * cosine - dz * sine, z: dx * sine + dz * cosine };
}

function startRaceClockOnTakeoff(previous, current) {
  if (!raceTimerEnabled || raceTimerStartedAt) return;
  raceTimerStartedAt = performance.now();
  updateRaceTimerDisplay(raceTimerStartedAt);
  const crewRaceActive = partyLobby && ['starting', 'grid', 'racing'].includes(partyLobby.status);
  if (crewRaceActive) {
    void reportCrewLaunch(partyLobby.startAt, previous.toArray(), current.toArray())
      .catch((error) => setLobbyMessage(error.message, true));
  }
}

function updateDestroyedFlight(dt) {
  flight.throttle = 0;
  flight.motorOutput = 0;
  flight.acceleration.set(0, -9.81, 0);
  flight.velocity.addScaledVector(flight.acceleration, dt);
  flight.velocity.addScaledVector(flight.velocity, -flightTune.airDrag * 0.28 * dt);
  flight.position.addScaledVector(flight.velocity, dt);
  resolveFlightWorldCollision();
  resolveFlightPilotCollisions();

  const groundY = flightGroundYAt(flight.position.x, flight.position.z, flight.position.y);
  const groundClearance = flightGroundClearance();
  const grounded = groundY > -9990 && flight.position.y < groundY + groundClearance;
  const newGroundImpact = grounded && !destroyedFlightWasGrounded;
  if (!grounded) destroyedFlightWasGrounded = false;
  if (grounded) {
    const previousVelocity = flight.velocity.clone();
    const impactSpeed = previousVelocity.length();
    flight.position.y = groundY + groundClearance;
    flight.velocity.y = Math.min(1.5, Math.max(0, -flight.velocity.y) * 0.1);
    const groundSlideRetention = Math.exp(-1.1 * dt);
    flight.velocity.x *= groundSlideRetention;
    flight.velocity.z *= groundSlideRetention;
    if (newGroundImpact && impactSpeed >= 7.5) {
      const contactOffset = flightGroundContactOffset(flight.orientation, previousVelocity).clone();
      flightCollisionImpulse.subVectors(previousVelocity, flight.velocity);
      flightCollisionTorque.crossVectors(contactOffset, flightCollisionImpulse)
        .multiplyScalar(flightCollisionInverseInertia * 0.45);
      flight.impactAngularVelocity.add(flightCollisionTorque);
    }
    if (flight.impactAngularVelocity.length() > 4.2) flight.impactAngularVelocity.setLength(4.2);
    destroyedFlightWasGrounded = true;
  }
  const tumbleSpeed = flight.impactAngularVelocity.length();
  if (tumbleSpeed > 0.001) {
    flight.impactAngularAxis.copy(flight.impactAngularVelocity).divideScalar(tumbleSpeed);
    flight.impactAngularStep.setFromAxisAngle(flight.impactAngularAxis, tumbleSpeed * dt);
    flight.orientation.premultiply(flight.impactAngularStep).normalize();
    flight.impactAngularVelocity.multiplyScalar(Math.exp(-(grounded ? 4 : 1.5) * dt));
  }

  flight.speed = flight.velocity.length() * 3.6;
  updateFlightDamageEffects(dt);
  updateRaceTimerDisplay();
  updateRaceLeaderboard();
  updateFlightCamera(dt);
  document.querySelector('#flightPrompt').textContent = 'DRONE DESTROYED. RESET TO RECOVER.';
  document.querySelector('#speedValue').textContent = String(Math.round(flight.speed)).padStart(3, '0');
  document.querySelector('#altitudeValue').textContent = Math.max(0, flight.position.y - groundY).toFixed(1);
  document.querySelector('#throttleValue').textContent = '0%';
  document.querySelector('#throttleBar').style.width = '0%';
  updateMotorAudio({ pitch: 0, roll: 0 });
}

function updateFlight(dt) {
  previousFlightPosition.copy(flight.position);
  previousFlightOrientation.copy(flight.orientation);
  const partyRaceAt = Number(partyLobby?.raceAt) || (Number(partyLobby?.startAt) + 5000);
  if (partyRacePhase === 'grid' && partyLobby?.startAt) {
    if (Date.now() >= partyRaceAt) beginPartyRace(partyRaceAt);
    else {
      flight.velocity.set(0, 0, 0);
      flight.throttle = 0;
      flight.speed = 0;
      updateFlightCamera(dt);
      document.querySelector('#speedValue').textContent = '000';
      document.querySelector('#altitudeValue').textContent = Math.max(0, flight.position.y - builderSurfaceYAt(flight.position.x, flight.position.z)).toFixed(1);
      document.querySelector('#throttleValue').textContent = '0%';
      document.querySelector('#throttleBar').style.width = '0%';
      updateMotorAudio({ pitch: 0, roll: 0 });
      updateRaceTimerDisplay();
      updateRaceStartOverlay();
      return;
    }
  }
  if (partyRacePhase === 'race' && partyLobby?.gameMode === 'relay-race' && !isLocalRelayPilotActive()) {
    flight.velocity.set(0, 0, 0);
    flight.throttle = 0;
    flight.speed = 0;
    updateFlightCamera(dt);
    document.querySelector('#speedValue').textContent = '000';
    document.querySelector('#throttleValue').textContent = '0%';
    document.querySelector('#throttleBar').style.width = '0%';
    updateMotorAudio({ pitch: 0, roll: 0 });
    updateRaceTimerDisplay();
    updateRaceStartOverlay();
    return;
  }
  if (flightDamageState.crashed) {
    updateDestroyedFlight(dt);
    return;
  }
  const propsBroken = flightDamageState.brokenProps.some(Boolean);
  const controls = getFlightInput();
  if (propsBroken) {
    flight.throttle = 0;
    flight.motorOutput = 0;
  } else if (controls.source === 'KEYBOARD') {
    flight.throttle = THREE.MathUtils.clamp(flight.throttle + controls.throttleDelta * 0.68 * dt, 0, 1);
  } else {
    flight.throttle += (controls.throttle - flight.throttle) * Math.min(1, dt * 12);
  }

  flight.angularRateTarget.set(
    -rateToDegrees('pitch', controls.pitch),
    -rateToDegrees('yaw', controls.yaw),
    rateToDegrees('roll', controls.roll),
  );
  flight.measuredAngularAcceleration.subVectors(flight.bodyAngularVelocity, flight.previousBodyAngularVelocity)
    .multiplyScalar(1 / Math.max(dt, 0.001));
  flight.previousBodyAngularVelocity.copy(flight.bodyAngularVelocity);
  flight.filteredAngularAcceleration.lerp(
    flight.measuredAngularAcceleration,
    1 - Math.exp(-dt / 0.035),
  );
  flight.angularRateError.subVectors(flight.angularRateTarget, flight.bodyAngularVelocity);
  flight.angularRateIntegral.addScaledVector(flight.angularRateError, dt);
  flight.angularRateIntegral.set(
    THREE.MathUtils.clamp(flight.angularRateIntegral.x, -300, 300),
    THREE.MathUtils.clamp(flight.angularRateIntegral.y, -300, 300),
    THREE.MathUtils.clamp(flight.angularRateIntegral.z, -300, 300),
  );
  flight.pidAngularAcceleration.set(
    flightTune.pitchP * flight.angularRateError.x
      + flightTune.pitchI * flight.angularRateIntegral.x
      - flightTune.pitchD * flight.filteredAngularAcceleration.x,
    flightTune.yawP * flight.angularRateError.y
      + flightTune.yawI * flight.angularRateIntegral.y
      - flightTune.yawD * flight.filteredAngularAcceleration.y,
    flightTune.rollP * flight.angularRateError.z
      + flightTune.rollI * flight.angularRateIntegral.z
      - flightTune.rollD * flight.filteredAngularAcceleration.z,
  );
  const vehicleMassKg = flightTune.weight / 1000;
  const wheelbaseMeters = flightTune.wheelbase / 1000;
  const propThrustScale = (flightTune.propDiameter / 5) ** 2;
  const motorMaxThrustNewtons = flightTune.motorThrust / 1000 * 9.81 * propThrustScale;
  const motorAuthority = flightAvailableMotorRatio();
  const hoverThrottle = flightTune.weight / (4 * flightTune.motorThrust * propThrustScale);
  const rollPitchInertia = vehicleMassKg * wheelbaseMeters ** 2 / 12;
  const maxAngularAcceleration = THREE.MathUtils.clamp(
    (motorMaxThrustNewtons * wheelbaseMeters * 0.5 * THREE.MathUtils.clamp(1 - hoverThrottle, 0, 0.85))
      / rollPitchInertia * THREE.MathUtils.radToDeg(1),
    0,
    9000,
  );
  flight.pidAngularAcceleration.set(
    THREE.MathUtils.clamp(flight.pidAngularAcceleration.x, -maxAngularAcceleration, maxAngularAcceleration),
    THREE.MathUtils.clamp(flight.pidAngularAcceleration.y, -maxAngularAcceleration * 0.72, maxAngularAcceleration * 0.72),
    THREE.MathUtils.clamp(flight.pidAngularAcceleration.z, -maxAngularAcceleration, maxAngularAcceleration),
  );
  const motorResponseAlpha = 1 - Math.exp(-dt / (flightTune.motorResponse / 1000));
  if (propsBroken) {
    flight.motorAngularAcceleration.set(0, 0, 0);
    flight.bodyAngularVelocity.multiplyScalar(Math.exp(-1.1 * dt));
  } else {
    flight.motorAngularAcceleration.lerp(flight.pidAngularAcceleration, motorResponseAlpha);
    flight.motorAngularAcceleration.multiplyScalar(motorAuthority);
    flight.bodyAngularVelocity.addScaledVector(flight.motorAngularAcceleration, dt);
  }
  flightDamageTorque.set(0, 0, 0);
  flightDamageState.brokenProps.forEach((broken, motorIndex) => {
    if (!broken) return;
    const [motorX, motorZ] = flightCollisionMotorOffsets[motorIndex];
    flightDamageTorque.x += motorZ;
    flightDamageTorque.y += motorIndex % 2 ? 0.65 : -0.65;
    flightDamageTorque.z -= motorX;
  });
  flight.bodyAngularVelocity.addScaledVector(flightDamageTorque, flight.motorOutput * 36 * dt);
  flight.bodyAngularVelocity.set(
    THREE.MathUtils.clamp(flight.bodyAngularVelocity.x, -2200, 2200),
    THREE.MathUtils.clamp(flight.bodyAngularVelocity.y, -1500, 1500),
    THREE.MathUtils.clamp(flight.bodyAngularVelocity.z, -2200, 2200),
  );
  const bodyAngularSpeed = flight.bodyAngularVelocity.length();
  if (bodyAngularSpeed > 0.001) {
    flight.angularAxis.copy(flight.bodyAngularVelocity).divideScalar(bodyAngularSpeed);
    flight.angularStep.setFromAxisAngle(flight.angularAxis, THREE.MathUtils.degToRad(bodyAngularSpeed * dt));
    flight.orientation.multiply(flight.angularStep).normalize();
  }
  const impactAngularSpeed = flight.impactAngularVelocity.length();
  if (impactAngularSpeed > 0.001) {
    flight.impactAngularAxis.copy(flight.impactAngularVelocity).divideScalar(impactAngularSpeed);
    flight.impactAngularStep.setFromAxisAngle(flight.impactAngularAxis, impactAngularSpeed * dt);
    flight.orientation.premultiply(flight.impactAngularStep).normalize();
    flight.impactAngularVelocity.multiplyScalar(Math.exp(-2.8 * dt));
  }
  flight.up.set(0, 1, 0).applyQuaternion(flight.orientation);
  flight.propwashPhase += dt;
  const descentSpeed = Math.max(0, -flight.velocity.dot(flight.up));
  const propwashIntensity = THREE.MathUtils.clamp((flight.throttle - 0.52) / 0.42, 0, 1)
    * THREE.MathUtils.clamp((descentSpeed - 1.6) / 5.5, 0, 1);
  if (propwashIntensity > 0) {
    flightPropwashForce.set(
      Math.sin(flight.propwashPhase * 29.3 + flight.position.x * 1.7),
      Math.sin(flight.propwashPhase * 23.7 + flight.position.z * 1.3) * 0.28,
      Math.cos(flight.propwashPhase * 31.1 + flight.position.z * 1.9),
    ).applyQuaternion(flight.orientation);
    flight.impactAngularVelocity.addScaledVector(
      flightPropwashForce,
      propwashIntensity * 2.4 * flightTune.propwash / 100 * (flightTune.propDiameter / 5) * dt,
    );
  }
  const targetMotorOutput = propsBroken ? 0 : flight.throttle * flight.throttle;
  if (propsBroken) flight.motorOutput = 0;
  else flight.motorOutput += (targetMotorOutput - flight.motorOutput) * motorResponseAlpha;
  const maximumThrustAcceleration = motorMaxThrustNewtons * 4 * motorAuthority / vehicleMassKg;
  flight.acceleration.copy(flight.up).multiplyScalar(maximumThrustAcceleration * flight.motorOutput);
  flight.acceleration.y -= 9.81;
  flight.acceleration.addScaledVector(flight.velocity, -flightTune.airDrag);
  flight.velocity.addScaledVector(flight.acceleration, dt);
  flight.position.addScaledVector(flight.velocity, dt);
  const impact = resolveFlightWorldCollision();
  if (impact) applyFlightImpactDamage(impact);
  const pilotImpact = resolveFlightPilotCollisions();
  if (pilotImpact) applyFlightImpactDamage(pilotImpact);

  let groundY = flightGroundYAt(flight.position.x, flight.position.z, flight.position.y);
  const padPosition = launchPadLocalPosition(flight.position);
  const onLaunchBlock = Boolean(launchPadState && !launchPadState.started && padPosition
    && Math.abs(padPosition.x) <= launchPadState.halfWidth
    && Math.abs(padPosition.z) <= launchPadState.halfDepth);
  if (onLaunchBlock) groundY = Math.max(groundY, launchPadState.topY);
  breakFlightPropsOnGroundContact(groundY);
  breakFlightArmsOnGroundContact(groundY);
  const groundClearance = flightGroundClearance();
  if (flight.position.y < groundY + groundClearance) {
    flight.position.y = groundY + groundClearance;
    if (flight.velocity.y < -flightDamageMinimumImpactSpeed) {
      applyFlightImpactDamage({
        speed: -flight.velocity.y,
        part: 'body',
        motorIndex: -1,
        normal: new THREE.Vector3(0, 1, 0),
      });
    }
    if (flight.velocity.y < -0.6) flight.velocity.y *= -0.14;
    else if (flight.velocity.y < 0) flight.velocity.y = 0;
    const groundSlideRetention = Math.exp(-(flightDamageState.brokenProps.some(Boolean) ? 2.4 : 0.35) * dt);
    flight.velocity.x *= groundSlideRetention;
    flight.velocity.z *= groundSlideRetention;
  }

  const groundedWithBrokenProps = flightDamageState.brokenProps.some(Boolean)
    && groundY > -9990
    && flight.position.y <= groundY + groundClearance + 0.02;
  if (groundedWithBrokenProps) {
    flight.up.set(0, 1, 0).applyQuaternion(flight.orientation).normalize();
    const tiltAngle = Math.acos(THREE.MathUtils.clamp(flight.up.y, -1, 1));
    const tiltAxisMagnitude = flight.angularAxis.crossVectors(flight.up, axisY).length();
    if (tiltAngle > 0.002) {
      if (tiltAxisMagnitude > 0.001) flight.angularAxis.multiplyScalar(1 / tiltAxisMagnitude);
      else flight.angularAxis.copy(axisX);
      flightDroneInverseOrientation.copy(flight.orientation).invert();
      flight.angularAxis.applyQuaternion(flightDroneInverseOrientation);
      const levelingAcceleration = Math.min(1000, THREE.MathUtils.radToDeg(tiltAngle) * 12);
      flight.bodyAngularVelocity.addScaledVector(flight.angularAxis, levelingAcceleration * dt);
    }
    const groundRotationDamping = Math.exp(-4.2 * dt);
    flight.bodyAngularVelocity.multiplyScalar(groundRotationDamping);
    flight.impactAngularVelocity.multiplyScalar(groundRotationDamping);
  }

  if (launchPadState && !launchPadState.started) {
    const liftedOffBlock = flight.position.y > launchPadState.topY + 1.05 && flight.velocity.y > 0;
    if (liftedOffBlock || !onLaunchBlock) {
      launchPadState.started = true;
      startRaceClockOnTakeoff(previousFlightPosition, flight.position);
    }
  }

  flight.speed = flight.velocity.length() * 3.6;
  updateFlightDamageEffects(dt);
  updateTrackIndicators();
  updateRaceTimerDisplay();
  updateRaceLeaderboard();
  updateRaceStartOverlay();
  updateFlightCamera(dt);

  document.querySelector('#speedValue').textContent = String(Math.round(flight.speed)).padStart(3, '0');
  document.querySelector('#altitudeValue').textContent = Math.max(0, flight.position.y - groundY).toFixed(1);
  const percent = Math.round(flight.throttle * 100);
  document.querySelector('#throttleValue').textContent = `${percent}%`;
  document.querySelector('#throttleBar').style.width = `${percent}%`;
  updateMotorAudio(controls);
}

let lastFrame = performance.now();
let fpsClock = 0;
let fpsFrames = 0;
let fps = 60;
let deviceStatusFrames = 0;
let frameUpdateErrorReported = false;
let postProcessingErrorReported = false;
let directRenderErrorReported = false;
function resize() {
  const width = mount.clientWidth;
  const height = mount.clientHeight;
  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
  composer.setSize(width, height);
  if (currentPage === 'trackPicker') requestAnimationFrame(updateTrackPickerPreview);
}
window.addEventListener('resize', resize);
resize();

function animate(now) {
  requestAnimationFrame(animate);
  try {
    if (menuGrassWindUniform) menuGrassWindUniform.value = now * 0.00062;
    const dt = Math.min((now - lastFrame) / 1000 || 0.016, 0.04);
    lastFrame = now;
    fpsClock += dt;
    fpsFrames += 1;
    if (fpsClock >= 0.5) {
      fps = Math.round(fpsFrames / fpsClock);
      fpsClock = 0;
      fpsFrames = 0;
      if (flying) document.querySelector('#fpsValue').textContent = String(fps);
    }

    sampleGamepad();
    if (deviceStatusFrames++ % 12 === 0) {
      refreshInputSource();
    }
    if (flying) updateFlight(dt);
    else {
      if (currentPage === 'builder') updateBuilderCameraMovement(dt);
      orbit.update();
      if (menuBackdropRoot.visible) {
        const windTime = now * 0.001;
        updateMenuGrassWind(windTime);
        updateMenuLooseWind(windTime);
      }
      updatePodiumInvitePositions();
      if (currentPage === 'builder' && builderSelectionHelper.visible) builderSelectionHelper.update();
      const spin = now * 0.001;
      const droneDisplayBaseY = currentPage !== 'builder' ? menuDroneBaseY : showDroneBaseY;
      showDrone.position.y = droneDisplayBaseY + Math.sin(spin * 1.6) * 0.18;
      showDrone.rotation.y = menuDroneFacingCameraYaw(showDrone) + Math.sin(spin * 0.45) * 0.12;
      if (!flightDamageState.crashed) {
        propellers.forEach((prop, index) => { spinDroneRotor(prop, dt * (index % 2 ? -20 : 20)); });
      }
      partyDroneObjects.forEach((drone, droneIndex) => {
        if (!drone.visible) return;
        drone.position.y = droneDisplayBaseY + Math.sin(spin * 1.6 + droneIndex + 1) * 0.16;
        drone.rotation.y = menuDroneFacingCameraYaw(drone) + Math.sin(spin * 0.45 + droneIndex + 1) * 0.12;
        if (!flightDamageState.crashed) {
          partyDroneRotors[droneIndex].forEach((prop, index) => { spinDroneRotor(prop, dt * (index % 2 ? -18 : 18)); });
        }
      });
    }
    if (flying) {
      if (!flightDamageState.crashed && thirdPersonFlightCamera) {
        propellers.forEach((prop, index) => { spinDroneRotor(prop, dt * (index % 2 ? -20 : 20)); });
      }
      updatePartyDroneFlightVisuals(dt);
      if (!flightDamageState.crashed) {
        livePartyDroneRotors.forEach((rotors) => {
          rotors.forEach((prop, index) => { spinDroneRotor(prop, dt * (index % 2 ? -18 : 18)); });
        });
      }
    }
    if (menuBackdropRoot.visible) {
      if (menuStarTimeUniform) menuStarTimeUniform.value = now * 0.00042;
    }
    updateLobbyMusicVisualization(dt);
    if (environmentRoot.visible && activeBiome === 'neon-docks') {
      const groundClearance = flying
        ? Math.max(0, flight.position.y - terrainSurfaceYAt(activeBiome, flight.position.x, flight.position.z))
        : Infinity;
      propwashVisual.x = flight.position.x;
      propwashVisual.z = flight.position.z;
      propwashVisual.strength = flying
        ? flight.throttle * flight.throttle * THREE.MathUtils.clamp(1 - groundClearance / 7, 0, 1)
        : 0;
      updateGrassWindMeshes(environmentGrassWindMeshes, now * 0.001);
      updateNeonDocksWaterAnimation(now * 0.001);
    }
  } catch (error) {
    if (!frameUpdateErrorReported) {
      console.error('A menu or flight update failed; continuing to render the 3D world.', error);
      frameUpdateErrorReported = true;
    }
  }

  let frameRendered = false;
  try {
    composer.render();
    frameRendered = true;
  } catch (error) {
    if (!postProcessingErrorReported) {
      console.error('Post-processing failed; switching to a direct 3D render.', error);
      postProcessingErrorReported = true;
    }
    try {
      renderer.setRenderTarget(null);
      renderer.render(scene, camera);
      frameRendered = true;
    } catch (directRenderError) {
      if (!directRenderErrorReported) {
        console.error('The 3D world could not be drawn.', directRenderError);
        directRenderErrorReported = true;
        const detail = directRenderError instanceof Error ? ` ${directRenderError.message}` : '';
        showWorldLoadFailure(`The 3D renderer could not draw the world.${detail} Reload to try again.`);
      }
    }
  }
  if (frameRendered && !worldLoadFailureActive && !root.classList.contains('has-rendered-world')) root.classList.add('has-rendered-world');
}

function attachMenuCardCapture(buttonSelector, source) {
  const button = document.querySelector(buttonSelector);
  const oldImage = button?.querySelector('.choice-image');
  if (!oldImage) return;
  button.classList.remove('has-captured-art');
  const image = document.createElement('img');
  image.className = 'choice-image';
  image.alt = '';
  image.setAttribute('aria-hidden', 'true');
  image.decoding = 'async';
  image.draggable = false;
  image.addEventListener('load', () => button.classList.add('has-captured-art'), { once: true });
  image.addEventListener('error', () => console.error(`The captured artwork for ${buttonSelector} could not be loaded.`), { once: true });
  oldImage.replaceWith(image);
  image.src = typeof source === 'string' ? source : source.toDataURL('image/jpeg', 0.96);
}

function captureMenuChoiceTiles() {
  if (mainMenuChoiceTilesCaptured || worldLoadFailureActive) return;
  if (!root.classList.contains('has-rendered-world')) {
    requestAnimationFrame(captureMenuChoiceTiles);
    return;
  }

  const source = renderer.domElement;
  if (!source.width || !source.height) {
    requestAnimationFrame(captureMenuChoiceTiles);
    return;
  }

  const capture = document.createElement('canvas');
  capture.width = 1280;
  capture.height = 800;
  const context = capture.getContext('2d');
  if (!context) return;

  const selectors = [
    '[data-menu-choice="trackPicker"]',
    '[data-menu-choice="multiplayer"]',
    '[data-menu-choice="builderMenu"]',
    '[data-menu-choice="communityTracks"]',
  ];
  const sceneObjects = [
    environmentRoot, gateRoot, trackRoot, communityPropRoot, builderPropRoot,
    builderGhostRoot, builderFlightRoot, biomeLightRoot, menuBackdropRoot, menuStreetLampRoot, stars,
    menuCityRoot, menuStageRoot, menuAmbientRoot, menuInfoBannerRoot,
    showDrone, partyDroneRoot, fieldSpot, ...defaultGateObjects, ...customGateObjects,
  ];
  const previousVisibility = sceneObjects.map((object) => object.visible);
  const drones = [showDrone, ...partyDroneObjects];
  const previousDrones = drones.map((drone) => ({
    visible: drone.visible,
    position: drone.position.clone(),
    rotation: drone.rotation.clone(),
  }));
  const previousPosition = camera.position.clone();
  const previousQuaternion = camera.quaternion.clone();
  const previousUp = camera.up.clone();
  const previousFov = camera.fov;
  const previousAspect = camera.aspect;
  const previousBackground = scene.background.clone();
  const previousFogColor = scene.fog.color.clone();
  const previousFogNear = scene.fog.near;
  const previousFogFar = scene.fog.far;
  const previousLightLevels = [hemi.intensity, moon.intensity, fill.intensity, scene.environmentIntensity, renderer.toneMappingExposure];
  const previousPodiums = menuStageRoot.children.map((podium) => ({
    visible: podium.visible,
    position: podium.position.clone(),
  }));
  const podiumPositions = [[-6, -6], [6, -6], [-6, 6], [6, 6]];
  const previousTrackId = activeTrack?.id;
  let photoGround = null;
  let photoGroundGeometry = null;
  let photoGroundMaterial = null;
  let photoGroundTexture = null;
  let grassPreview = null;
  let grassPreviewMaterial = null;
  let grassPreviewTexture = null;
  const temporaryShowcaseLights = [];

  try {
    environmentRoot.visible = true;
    gateRoot.visible = false;
    trackRoot.visible = false;
    communityPropRoot.visible = false;
    builderPropRoot.visible = false;
    builderGhostRoot.visible = false;
    builderFlightRoot.visible = false;
    biomeLightRoot.visible = false;
    menuBackdropRoot.visible = false;
    menuStreetLampRoot.visible = false;
    stars.visible = false;
    menuCityRoot.visible = false;
    menuStageRoot.visible = true;
    menuAmbientRoot.visible = false;
    menuInfoBannerRoot.visible = false;
    fieldSpot.visible = false;
    partyDroneRoot.visible = false;
    menuStageRoot.children.forEach((podium, index) => {
      podium.visible = index === 0;
      podium.position.set(0, 0, 0);
    });

    camera.fov = 44;
    camera.aspect = source.width / source.height;
    camera.updateProjectionMatrix();

    const drawCapture = () => {
      camera.updateProjectionMatrix();
      composer.render();
      const scale = Math.max(capture.width / source.width, capture.height / source.height);
      const width = source.width * scale;
      const height = source.height * scale;
      context.drawImage(source, (capture.width - width) / 2, (capture.height - height) / 2, width, height);
      return capture.toDataURL('image/jpeg', 0.96);
    };

    const setCaptureLighting = (focus, brightness = 1) => {
      scene.background.set('#030817');
      scene.fog.color.set('#071629');
      scene.fog.near = 170;
      scene.fog.far = 1200;
      hemi.intensity = 0.2 * brightness;
      moon.intensity = 0.32 * brightness;
      fill.intensity = 0.24 * brightness;
      scene.environmentIntensity = 0.2 * brightness;
      renderer.toneMappingExposure = 0.9;
      if (!temporaryShowcaseLights.length) {
        const keyLight = new THREE.SpotLight(0xffffff, 820, 100, Math.PI / 3.2, 0.72, 1.5);
        const fillLight = new THREE.SpotLight(0xffffff, 620, 100, Math.PI / 3.2, 0.72, 1.5);
        temporaryShowcaseLights.push(keyLight, fillLight);
        scene.add(keyLight, keyLight.target, fillLight, fillLight.target);
      }
      const [keyLight, fillLight] = temporaryShowcaseLights;
      keyLight.intensity = 820 * brightness;
      fillLight.intensity = 620 * brightness;
      keyLight.position.set(focus.x - 18, focus.y + 25, focus.z - 12);
      keyLight.target.position.copy(focus);
      fillLight.position.set(focus.x + 18, focus.y + 23, focus.z + 11);
      fillLight.target.position.copy(focus);
    };

    photoGroundGeometry = new THREE.PlaneGeometry(120, 120);
    photoGroundTexture = docksGrassGroundTexture.clone();
    photoGroundTexture.repeat.set(12, 12);
    photoGroundTexture.needsUpdate = true;
    photoGroundMaterial = new THREE.MeshStandardMaterial({
      map: photoGroundTexture,
      color: 0xb5d092,
      roughness: 0.92,
    });
    photoGround = new THREE.Mesh(photoGroundGeometry, photoGroundMaterial);
    photoGround.rotation.x = -Math.PI / 2;
    photoGround.position.y = -0.16;
    scene.add(photoGround);

    showDrone.visible = true;
    showDrone.position.set(0, menuDroneBaseY, 0);
    showDrone.rotation.set(0, 0.4, 0);
    camera.fov = 29;
    camera.updateProjectionMatrix();
    camera.position.set(6, 25, 5);
    camera.lookAt(0, 3.7, 0);
    setCaptureLighting(new THREE.Vector3(0, menuDroneBaseY, 0), 0.85);
    attachMenuCardCapture(selectors[0], drawCapture());
    const savedTrack = previousTrackId
      ? trackCatalog[activeBiome]?.find((track) => track.id === previousTrackId)
      : null;

    showDrone.visible = false;
    partyDroneRoot.visible = true;
    const [pilotX, pilotZ] = podiumPositions[0];
    menuStageRoot.children.forEach((podium, index) => {
      const [x, z] = podiumPositions[index] || [0, 0];
      podium.visible = index < podiumPositions.length;
      podium.position.set(x, 0, z);
    });
    showDrone.visible = true;
    showDrone.position.set(pilotX, menuDroneBaseY, pilotZ);
    showDrone.rotation.set(0, 0.4, 0);
    partyDroneObjects.forEach((drone, index) => {
      drone.visible = true;
      const [x, z] = podiumPositions[index + 1] || [0, 0];
      drone.position.set(x, menuDroneBaseY, z);
      drone.rotation.set(0, Math.PI + index * 0.42, 0);
    });
    scene.remove(photoGround);
    photoGroundGeometry.dispose();
    photoGroundTexture.dispose();
    photoGroundMaterial.dispose();
    photoGround = null;
    photoGroundGeometry = null;
    photoGroundTexture = null;
    photoGroundMaterial = null;
    menuBackdropRoot.visible = true;
    stars.visible = true;
    setCaptureLighting(new THREE.Vector3(0, 1.5, 0), 0.8);
    camera.fov = 34;
    camera.updateProjectionMatrix();
    camera.position.set(4, 15, 19);
    camera.lookAt(0, 3.7, 0);
    attachMenuCardCapture(selectors[1], drawCapture());
    menuStageRoot.children.forEach((podium, index) => {
      const previous = previousPodiums[index];
      if (!previous) return;
      podium.visible = previous.visible;
      podium.position.copy(previous.position);
    });
    stars.visible = previousVisibility[sceneObjects.indexOf(stars)];
    scene.background.copy(previousBackground);
    scene.fog.color.copy(previousFogColor);
    scene.fog.near = previousFogNear;
    scene.fog.far = previousFogFar;
    [hemi.intensity, moon.intensity, fill.intensity, scene.environmentIntensity, renderer.toneMappingExposure] = previousLightLevels;

    partyDroneRoot.visible = false;
    environmentRoot.visible = false;
    trackRoot.visible = false;
    communityPropRoot.visible = false;
    showDrone.visible = false;
    menuBackdropRoot.visible = false;
    menuStreetLampRoot.visible = false;
    menuCityRoot.visible = false;
    menuStageRoot.visible = false;
    menuAmbientRoot.visible = false;
    const grassCanvas = document.createElement('canvas');
    grassCanvas.width = 512;
    grassCanvas.height = 512;
    const grassContext = grassCanvas.getContext('2d');
    if (!grassContext) throw new Error('Grass tile preview could not be created.');
    const grassGradient = grassContext.createRadialGradient(256, 256, 24, 256, 256, 380);
    grassGradient.addColorStop(0, '#334923');
    grassGradient.addColorStop(0.58, '#293d22');
    grassGradient.addColorStop(1, '#192a1c');
    grassContext.fillStyle = grassGradient;
    grassContext.fillRect(0, 0, 512, 512);
    let grassSeed = 28761;
    for (let blade = 0; blade < 18000; blade += 1) {
      grassSeed = (Math.imul(grassSeed, 1664525) + 1013904223) >>> 0;
      const x = grassSeed / 4294967296 * 512;
      grassSeed = (Math.imul(grassSeed, 1664525) + 1013904223) >>> 0;
      const y = grassSeed / 4294967296 * 512;
      grassSeed = (Math.imul(grassSeed, 1664525) + 1013904223) >>> 0;
      const length = 1.5 + (grassSeed / 4294967296) * 4;
      grassContext.strokeStyle = grassSeed & 1 ? 'rgba(144, 170, 103, .24)' : 'rgba(15, 35, 24, .34)';
      grassContext.lineWidth = 0.6 + (grassSeed / 4294967296) * 0.8;
      grassContext.beginPath();
      grassContext.moveTo(x, y);
      grassContext.lineTo(x - 1.2 + (grassSeed / 4294967296) * 2.4, y - length);
      grassContext.stroke();
    }
    grassPreviewTexture = new THREE.CanvasTexture(grassCanvas);
    grassPreviewTexture.colorSpace = THREE.SRGBColorSpace;
    grassPreviewMaterial = new THREE.MeshStandardMaterial({ map: grassPreviewTexture, roughness: 0.94 });
    grassPreview = new THREE.Mesh(new THREE.PlaneGeometry(180, 180), grassPreviewMaterial);
    grassPreview.rotation.x = -Math.PI / 2;
    grassPreviewTexture.wrapS = THREE.RepeatWrapping;
    grassPreviewTexture.wrapT = THREE.RepeatWrapping;
    grassPreviewTexture.repeat.set(8, 8);
    scene.add(grassPreview);
    setCaptureLighting(new THREE.Vector3(0, 0, 0));
    camera.up.set(0, 0, -1);
    camera.position.set(0, 32, 0);
    camera.lookAt(0, 0, 0);
    attachMenuCardCapture(selectors[2], drawCapture());
    scene.remove(grassPreview);
    grassPreview.geometry.dispose();
    grassPreviewMaterial.dispose();
    grassPreviewTexture.dispose();
    grassPreview = null;
    grassPreviewMaterial = null;
    grassPreviewTexture = null;

    if (savedTrack) applyTrackSelection(savedTrack.id, false);
    trackRoot.visible = true;
    communityPropRoot.visible = true;
    showDrone.visible = false;
    const communityTrack = trackCatalog[activeBiome]?.find((track) => track.id.startsWith('community-'))
      || (previousTrackId ? trackCatalog[activeBiome]?.find((track) => track.id === previousTrackId) : null);
    if (communityTrack) applyTrackSelection(communityTrack.id, false);
    trackRoot.visible = true;
    communityPropRoot.visible = true;
    menuBackdropRoot.visible = true;
    menuStreetLampRoot.visible = true;
    menuCityRoot.visible = true;
    menuStageRoot.visible = true;
    menuAmbientRoot.visible = true;
    const communityTarget = trackGateEntries.reduce((sum, entry) => sum.add(entry.object.getWorldPosition(new THREE.Vector3())), new THREE.Vector3())
      .multiplyScalar(1 / Math.max(1, trackGateEntries.length));
    setCaptureLighting(communityTarget);
    camera.position.set(communityTarget.x + 5, communityTarget.y + 72, communityTarget.z + 9);
    camera.up.set(0, 0, -1);
    camera.lookAt(communityTarget);
    attachMenuCardCapture(selectors[3], drawCapture());
    mainMenuChoiceTilesCaptured = true;
  } catch (error) {
    console.warn('Menu tile photos could not be captured; the built-in artwork will remain.', error);
  } finally {
    temporaryShowcaseLights.forEach((light) => {
      scene.remove(light);
      scene.remove(light.target);
    });
    if (photoGround) scene.remove(photoGround);
    photoGroundGeometry?.dispose();
    photoGroundTexture?.dispose();
    photoGroundMaterial?.dispose();
    if (grassPreview) {
      scene.remove(grassPreview);
      grassPreview.geometry.dispose();
    }
    grassPreviewMaterial?.dispose();
    grassPreviewTexture?.dispose();
    if (previousTrackId) applyTrackSelection(previousTrackId, false);
    sceneObjects.forEach((object, index) => { object.visible = previousVisibility[index]; });
    menuStageRoot.children.forEach((podium, index) => {
      const previous = previousPodiums[index];
      if (!previous) return;
      podium.visible = previous.visible;
      podium.position.copy(previous.position);
    });
    drones.forEach((drone, index) => {
      drone.visible = previousDrones[index].visible;
      drone.position.copy(previousDrones[index].position);
      drone.rotation.copy(previousDrones[index].rotation);
    });
    camera.position.copy(previousPosition);
    camera.quaternion.copy(previousQuaternion);
    camera.up.copy(previousUp);
    camera.fov = previousFov;
    camera.aspect = previousAspect;
    camera.updateProjectionMatrix();
    scene.background.copy(previousBackground);
    scene.fog.color.copy(previousFogColor);
    scene.fog.near = previousFogNear;
    scene.fog.far = previousFogFar;
    [hemi.intensity, moon.intensity, fill.intensity, scene.environmentIntensity, renderer.toneMappingExposure] = previousLightLevels;
    try { composer.render(); } catch { /* The animation loop will redraw the active view. */ }
  }
}

function captureMultiplayerModeTiles() {
  const cards = [...document.querySelectorAll('.game-mode-card')];
  if (!cards.length || worldLoadFailureActive || !root.classList.contains('has-rendered-world')) return;
  if (builtBiomeId !== activeBiome && !safeApplyBiome(activeBiome, false)) return;
  const captureKey = `${activeBiome}:${activeTrack?.id || ''}`;
  if (captureKey === multiplayerTileCaptureKey && cards.every((card) => card.querySelector('img.game-mode-art'))) return;

  const source = renderer.domElement;
  const capture = document.createElement('canvas');
  capture.width = 1280;
  capture.height = 800;
  const context = capture.getContext('2d');
  if (!context || !source.width || !source.height) return;

  const sceneObjects = [
    environmentRoot, gateRoot, trackRoot, communityPropRoot, builderPropRoot, biomeLightRoot,
    menuBackdropRoot, menuStreetLampRoot, stars, menuCityRoot, menuStageRoot, menuAmbientRoot,
    menuInfoBannerRoot, builderFlightRoot, showDrone,
    partyDroneRoot, fieldSpot, ...defaultGateObjects, ...customGateObjects,
  ];
  const previousVisibility = sceneObjects.map((object) => object.visible);
  const previousPosition = camera.position.clone();
  const previousQuaternion = camera.quaternion.clone();
  const previousFov = camera.fov;
  const previousAspect = camera.aspect;
  const previousBackground = scene.background.clone();
  const previousFogColor = scene.fog.color.clone();
  const previousFogNear = scene.fog.near;
  const previousFogFar = scene.fog.far;
  const previousLightLevels = [hemi.intensity, moon.intensity, fill.intensity, scene.environmentIntensity, renderer.toneMappingExposure];
  const previousDrones = [showDrone, ...partyDroneObjects].map((drone) => ({
    visible: drone.visible,
    position: drone.position.clone(),
    rotation: drone.rotation.clone(),
    scale: drone.scale.clone(),
  }));
  const previousPodiums = menuStageRoot.children.map((podium) => ({
    visible: podium.visible,
    position: podium.position.clone(),
  }));
  const temporaryDrones = [];
  const temporaryPodiums = [];
  const temporaryProps = [];
  const temporaryGates = [];
  const temporaryLights = [];
  let capturedCards = 0;
  const disposeTemporaryGate = (gate) => {
    const materials = new Set();
    gate.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry.dispose();
      (Array.isArray(node.material) ? node.material : [node.material]).forEach((material) => {
        if (material) materials.add(material);
      });
    });
    materials.forEach((material) => material.dispose());
  };

  try {
    camera.fov = 53;
    camera.aspect = source.width / source.height;
    camera.updateProjectionMatrix();

    cards.forEach((card, index) => {
      const previousArt = card.querySelector('.game-mode-art');
      sceneObjects.forEach((object, objectIndex) => { object.visible = previousVisibility[objectIndex]; });
      environmentRoot.visible = false;
      gateRoot.visible = true;
      trackRoot.visible = true;
      communityPropRoot.visible = false;
      builderPropRoot.visible = false;
      biomeLightRoot.visible = false;
      menuBackdropRoot.visible = true;
      menuStreetLampRoot.visible = false;
      stars.visible = true;
      menuCityRoot.visible = false;
      menuStageRoot.visible = false;
      menuAmbientRoot.visible = false;
      menuInfoBannerRoot.visible = false;
      builderFlightRoot.visible = false;
      showDrone.visible = false;
      partyDroneRoot.visible = false;
      fieldSpot.visible = false;
      defaultGateObjects.forEach((gate) => { gate.visible = true; });
      customGateObjects.forEach((gate) => { gate.visible = false; });

      const captureSpecialScene = (focus) => {
        const keyLight = new THREE.SpotLight(0xffffff, 820, 100, Math.PI / 3.2, 0.72, 1.5);
        keyLight.position.set(focus.x - 18, focus.y + 25, focus.z - 12);
        keyLight.target.position.set(focus.x, 1.5, focus.z);
        const fillLight = new THREE.SpotLight(0xffffff, 620, 100, Math.PI / 3.2, 0.72, 1.5);
        fillLight.position.set(focus.x + 18, focus.y + 23, focus.z + 12);
        fillLight.target.position.set(focus.x, 1.5, focus.z);
        temporaryLights.push(keyLight, fillLight);
        scene.add(keyLight, keyLight.target, fillLight, fillLight.target);
        hemi.intensity = 0.2;
        moon.intensity = 0.32;
        fill.intensity = 0.24;
        scene.environmentIntensity = 0.2;
        renderer.toneMappingExposure = 0.9;
        scene.background.set('#030817');
        scene.fog.color.set('#071629');
        scene.fog.near = 170;
        scene.fog.far = 1200;
      };

      if (card.dataset.gameMode === '4v4') {
        trackRoot.visible = false;
        gateRoot.visible = false;
        menuStageRoot.visible = true;
        menuAmbientRoot.visible = true;
        const podiumPositions = [
          [-7.5, menuPlatformCenterZ - 4.8], [-2.5, menuPlatformCenterZ - 4.8], [2.5, menuPlatformCenterZ - 4.8], [7.5, menuPlatformCenterZ - 4.8],
          [-7.5, menuPlatformCenterZ + 4.8], [-2.5, menuPlatformCenterZ + 4.8], [2.5, menuPlatformCenterZ + 4.8], [7.5, menuPlatformCenterZ + 4.8],
        ];
        for (let podiumIndex = menuStageRoot.children.length; podiumIndex < podiumPositions.length; podiumIndex += 1) {
          const podium = menuStageRoot.children[0].clone(true);
          menuStageRoot.add(podium);
          temporaryPodiums.push(podium);
        }
        menuStageRoot.children.forEach((podium, podiumIndex) => {
          const position = podiumPositions[podiumIndex];
          podium.visible = Boolean(position);
          if (position) podium.position.set(position[0], 0, position[1]);
        });
        const showcaseDrones = [showDrone, ...partyDroneObjects];
        for (let droneIndex = showcaseDrones.length; droneIndex < podiumPositions.length; droneIndex += 1) {
          const drone = showDrone.clone(true);
          drone.scale.setScalar(1.35);
          partyDroneRoot.add(drone);
          temporaryDrones.push(drone);
          showcaseDrones.push(drone);
        }
        showcaseDrones.forEach((drone, droneIndex) => {
          const [x, z] = podiumPositions[droneIndex];
          drone.visible = true;
          if (drone !== showDrone) drone.scale.setScalar(1.35);
          drone.position.set(x, menuDroneBaseY, z);
          drone.rotation.set(0, z < 0 ? 0 : Math.PI, 0);
        });
        showDrone.visible = true;
        partyDroneRoot.visible = true;
        menuStageRoot.visible = true;
        const focus = new THREE.Vector3(0, menuDroneBaseY, menuPlatformCenterZ);
        captureSpecialScene(focus);
        camera.fov = 53;
        camera.position.set(0, 31, menuPlatformCenterZ + 15);
        camera.lookAt(0, 3.7, menuPlatformCenterZ);
      } else if (card.dataset.gameMode === 'competitive-4v4') {
        trackRoot.visible = false;
        gateRoot.visible = false;
        stars.visible = true;
        menuAmbientRoot.visible = true;
        const gateLineZ = menuPlatformCenterZ - 4;
        const focus = new THREE.Vector3(0, 3.2, gateLineZ + 1);
        [
          { hue: 0x45e8ff, x: 0, z: gateLineZ + 5, scale: 1 },
          { hue: 0xff4eb8, x: 0, z: gateLineZ - 11, scale: 0.82 },
          { hue: 0xff6338, x: 0, z: gateLineZ - 24, scale: 0.66 },
        ].forEach(({ hue, x, z, scale }) => {
          const gate = new THREE.Group();
          const neon = new THREE.MeshStandardMaterial({
            color: hue,
            emissive: hue,
            emissiveIntensity: 2.6,
            roughness: 0.28,
            metalness: 0.12,
            toneMapped: false,
          });
          const frameWidth = 8.2;
          const frameHeight = 8.2;
          const frameDepth = 0.24;
          const bar = (width, height, y) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, frameDepth), neon);
            mesh.position.set(0, y, 0);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            gate.add(mesh);
          };
          const upright = (xPosition) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.24, frameHeight, frameDepth), neon);
            mesh.position.set(xPosition, frameHeight / 2, 0);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            gate.add(mesh);
          };
          upright(-frameWidth / 2);
          upright(frameWidth / 2);
          bar(frameWidth, 0.24, frameHeight);
          bar(frameWidth, 0.24, 0);
          gate.position.set(x, menuPlatformSurfaceY, z);
          gate.scale.setScalar(scale);
          scene.add(gate);
          temporaryGates.push(gate);
        });
        [showDrone, ...partyDroneObjects].forEach((drone) => { drone.visible = false; });
        const tournamentDrone = showDrone.clone(true);
        tournamentDrone.visible = true;
        tournamentDrone.position.set(-0.5, menuDroneBaseY + 0.5, gateLineZ + 1.7);
        tournamentDrone.rotation.set(-0.26, Math.PI, -0.08);
        partyDroneRoot.add(tournamentDrone);
        partyDroneRoot.visible = true;
        temporaryDrones.push(tournamentDrone);
        captureSpecialScene(focus);
        camera.fov = 39;
        camera.position.set(7, 8, gateLineZ + 34);
        camera.lookAt(focus);
      } else if (card.dataset.gameMode === 'relay-race') {
        trackRoot.visible = false;
        gateRoot.visible = false;
        stars.visible = true;
        menuAmbientRoot.visible = true;
        menuStageRoot.visible = true;
        const relayStations = [
          { x: -9, z: menuPlatformCenterZ + 8, hue: 'cyan' },
          { x: 0, z: menuPlatformCenterZ - 7, hue: 'coral' },
          { x: 9, z: menuPlatformCenterZ - 22, hue: 'ember' },
        ];
        for (let podiumIndex = menuStageRoot.children.length; podiumIndex < relayStations.length; podiumIndex += 1) {
          const podium = menuStageRoot.children[0].clone(true);
          menuStageRoot.add(podium);
          temporaryPodiums.push(podium);
        }
        menuStageRoot.children.forEach((podium, podiumIndex) => {
          const station = relayStations[podiumIndex];
          podium.visible = Boolean(station);
          if (station) podium.position.set(station.x, 0, station.z + 2);
        });
        relayStations.forEach(({ x, z, hue }) => {
          const gate = new THREE.Group();
          const color = hue === 'cyan' ? 0x45dfff : hue === 'coral' ? 0xff754f : 0xffa43b;
          const neon = new THREE.MeshStandardMaterial({
            color,
            emissive: color,
            emissiveIntensity: 2.6,
            roughness: 0.28,
            metalness: 0.12,
            toneMapped: false,
          });
          const frameWidth = 9.2;
          const frameHeight = 9.2;
          const frameDepth = 0.3;
          const bar = (width, height, y) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, frameDepth), neon);
            mesh.position.set(0, y, 0);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            gate.add(mesh);
          };
          const upright = (xPosition) => {
            const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.3, frameHeight + 3.4, frameDepth), neon);
            mesh.position.set(xPosition, (frameHeight + 3.4) / 2, 0);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            gate.add(mesh);
          };
          upright(-frameWidth / 2);
          upright(frameWidth / 2);
          bar(frameWidth, 0.3, frameHeight + 3.4);
          bar(frameWidth, 0.3, 3.4);
          gate.position.set(x, menuPlatformSurfaceY, z);
          scene.add(gate);
          temporaryGates.push(gate);
        });
        const focus = new THREE.Vector3(0, 4.5, menuPlatformCenterZ - 5);
        captureSpecialScene(focus);
        camera.fov = 46;
        camera.position.set(19, 17, menuPlatformCenterZ + 29);
        camera.lookAt(focus);
      } else if (card.dataset.gameMode === 'prop-hunt') {
        trackRoot.visible = false;
        gateRoot.visible = false;
        biomeLightRoot.visible = false;
        communityPropRoot.visible = true;
        builderPropRoot.visible = true;
        menuStreetLampRoot.visible = false;
        menuAmbientRoot.visible = true;
        const focus = new THREE.Vector3(0, menuPlatformSurfaceY, menuPlatformCenterZ - 4);
        [
          { type: 'container', dx: -18, dz: 0 },
          { type: 'barrier', dx: 18, dz: 0 },
          { type: 'tower', dx: -6, dz: -27 },
        ].forEach(({ type, dx, dz }, propIndex) => {
          const x = focus.x + dx;
          const z = focus.z + dz;
          const prop = createBuilderPropObject({
            id: `prop-hunt-menu-photo-${propIndex}`,
            type,
            x,
            y: terrainSurfaceYAt(activeBiome, x, z),
            z,
          }, communityPropRoot);
          prop.scale.setScalar(0.42);
          temporaryProps.push(prop);
        });
        [
          { type: 'single', hue: 'cyan', x: 0, z: menuPlatformCenterZ + 12 },
          { type: 'hurdle', hue: 'coral', x: 0, z: menuPlatformCenterZ - 25 },
        ].forEach(({ type, hue, x, z }) => {
          const gate = createProceduralGate(type, hue);
          gate.position.set(x, menuPlatformSurfaceY, z);
          scene.add(gate);
          temporaryGates.push(gate);
        });
        captureSpecialScene(focus);
        camera.fov = 42;
        camera.position.set(0, 18, menuPlatformCenterZ + 35);
        camera.lookAt(focus.x, focus.y + 5, focus.z);
      }

      if (card.dataset.gameMode === 'prop-hunt') {
        stars.visible = true;
      }
      const gateIndex = Math.min(trackGateEntries.length - 1, Math.floor((index + 0.5) * trackGateEntries.length / cards.length));
      const center = gateIndex >= 0
        ? trackGateEntries[gateIndex].object.getWorldPosition(new THREE.Vector3())
        : new THREE.Vector3(0, 5, 0);
      if (card.dataset.gameMode !== '4v4' && card.dataset.gameMode !== 'competitive-4v4' && card.dataset.gameMode !== 'relay-race' && card.dataset.gameMode !== 'prop-hunt') {
        captureSpecialScene(center);
        const angle = index * Math.PI * 0.5 + Math.PI * 0.12;
        camera.position.set(center.x + Math.sin(angle) * 43, center.y + 19, center.z + Math.cos(angle) * 43);
        camera.lookAt(center.x, center.y, center.z);
      }
      camera.updateProjectionMatrix();
      composer.render();

      context.fillStyle = '#08111c';
      context.fillRect(0, 0, capture.width, capture.height);
      const scale = Math.max(capture.width / source.width, capture.height / source.height);
      const width = source.width * scale;
      const height = source.height * scale;
      context.drawImage(source, (capture.width - width) / 2, (capture.height - height) / 2, width, height);

      if (!previousArt) return;
      const image = document.createElement('img');
      image.className = 'game-mode-art';
      image.alt = '';
      image.setAttribute('aria-hidden', 'true');
      image.decoding = 'async';
      image.draggable = false;
      image.src = capture.toDataURL('image/jpeg', 0.96);
      previousArt.replaceWith(image);
      capturedCards += 1;
      temporaryLights.forEach((light) => {
        scene.remove(light);
        scene.remove(light.target);
      });
      temporaryLights.length = 0;
      temporaryProps.forEach((prop) => {
        communityPropRoot.remove(prop);
        prop.traverse((node) => { if (node.userData.ownedBuilderGeometry) node.geometry?.dispose(); });
      });
      temporaryProps.length = 0;
      temporaryGates.forEach((gate) => {
        scene.remove(gate);
        disposeTemporaryGate(gate);
      });
      temporaryGates.length = 0;
      temporaryDrones.forEach((drone) => partyDroneRoot.remove(drone));
      temporaryDrones.length = 0;
      temporaryPodiums.forEach((podium) => menuStageRoot.remove(podium));
      temporaryPodiums.length = 0;
      [showDrone, ...partyDroneObjects].forEach((drone, droneIndex) => {
        const previous = previousDrones[droneIndex];
        drone.visible = previous.visible;
        drone.position.copy(previous.position);
        drone.rotation.copy(previous.rotation);
        drone.scale.copy(previous.scale);
      });
      menuStageRoot.children.forEach((podium, podiumIndex) => {
        const previous = previousPodiums[podiumIndex];
        if (!previous) return;
        podium.visible = previous.visible;
        podium.position.copy(previous.position);
      });
      scene.background.copy(previousBackground);
      scene.fog.color.copy(previousFogColor);
      scene.fog.near = previousFogNear;
      scene.fog.far = previousFogFar;
      [hemi.intensity, moon.intensity, fill.intensity, scene.environmentIntensity, renderer.toneMappingExposure] = previousLightLevels;
    });
    if (capturedCards === cards.length) multiplayerTileCaptureKey = captureKey;
  } catch {
    // Keep the built-in artwork if this device cannot capture the WebGL canvas.
  } finally {
    temporaryLights.forEach((light) => {
      scene.remove(light);
      scene.remove(light.target);
    });
    temporaryProps.forEach((prop) => {
      communityPropRoot.remove(prop);
      prop.traverse((node) => { if (node.userData.ownedBuilderGeometry) node.geometry?.dispose(); });
    });
    temporaryGates.forEach((gate) => {
      scene.remove(gate);
      disposeTemporaryGate(gate);
    });
    temporaryDrones.forEach((drone) => partyDroneRoot.remove(drone));
    temporaryPodiums.forEach((podium) => menuStageRoot.remove(podium));
    sceneObjects.forEach((object, index) => { object.visible = previousVisibility[index]; });
    [showDrone, ...partyDroneObjects].forEach((drone, droneIndex) => {
      const previous = previousDrones[droneIndex];
      drone.visible = previous.visible;
      drone.position.copy(previous.position);
      drone.rotation.copy(previous.rotation);
      drone.scale.copy(previous.scale);
    });
    menuStageRoot.children.forEach((podium, podiumIndex) => {
      const previous = previousPodiums[podiumIndex];
      if (!previous) return;
      podium.visible = previous.visible;
      podium.position.copy(previous.position);
    });
    camera.position.copy(previousPosition);
    camera.quaternion.copy(previousQuaternion);
    camera.fov = previousFov;
    camera.aspect = previousAspect;
    camera.updateProjectionMatrix();
    scene.background.copy(previousBackground);
    scene.fog.color.copy(previousFogColor);
    scene.fog.near = previousFogNear;
    scene.fog.far = previousFogFar;
    [hemi.intensity, moon.intensity, fill.intensity, scene.environmentIntensity, renderer.toneMappingExposure] = previousLightLevels;
    try { composer.render(); } catch { /* The animation loop will redraw the active view. */ }
  }
}

requestAnimationFrame(animate);
