import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Renderer } from '../graphics/Renderer';
import { World } from '../world/World';

export class Game {
  private readonly renderer: Renderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(48, 1, 0.1, 320);
  private readonly world: World;
  private readonly controls: OrbitControls;
  private frame = 0;
  private running = false;

  constructor(private readonly mount: HTMLElement) {
    this.renderer = new Renderer(mount);
    this.camera.position.set(49, 36, 57);
    this.camera.lookAt(0, 3, 0);

    this.world = new World(this.scene);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(0, 3, 0);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.055;
    this.controls.minDistance = 18;
    this.controls.maxDistance = 112;
    this.controls.maxPolarAngle = Math.PI * 0.48;
    this.controls.minPolarAngle = 0.22;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = 0.48;
    this.controls.zoomSpeed = 0.75;

    this.renderer.domElement.addEventListener('dblclick', this.resetView);
    window.addEventListener('resize', this.resize);
    this.resize();
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.render();
  }

  dispose(): void {
    this.running = false;
    cancelAnimationFrame(this.frame);
    window.removeEventListener('resize', this.resize);
    this.renderer.domElement.removeEventListener('dblclick', this.resetView);
    this.controls.dispose();
    this.world.dispose();
    this.renderer.dispose();
  }

  private readonly resize = (): void => {
    const width = this.mount.clientWidth;
    const height = this.mount.clientHeight;
    if (!width || !height) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.resize(width, height);
  };

  private readonly resetView = (): void => {
    this.camera.position.set(49, 36, 57);
    this.controls.target.set(0, 3, 0);
    this.controls.update();
  };

  private readonly render = (): void => {
    if (!this.running) return;
    this.frame = requestAnimationFrame(this.render);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  };
}
