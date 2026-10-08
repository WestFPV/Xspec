import * as THREE from 'three';

export class Renderer {
  readonly instance: THREE.WebGLRenderer;
  readonly domElement: HTMLCanvasElement;

  constructor(private readonly mount: HTMLElement) {
    this.instance = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.instance.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
    this.instance.outputColorSpace = THREE.SRGBColorSpace;
    this.instance.toneMapping = THREE.ACESFilmicToneMapping;
    this.instance.toneMappingExposure = 1.16;
    this.instance.shadowMap.enabled = false;
    this.instance.setClearColor(0x9eafb0, 1);
    this.domElement = this.instance.domElement;
    this.domElement.className = 'world-canvas';
    this.domElement.setAttribute('aria-hidden', 'true');
    this.mount.appendChild(this.domElement);
  }

  resize(width: number, height: number): void {
    this.instance.setSize(width, height, false);
  }

  render(scene: THREE.Scene, camera: THREE.Camera): void {
    this.instance.render(scene, camera);
  }

  dispose(): void {
    this.instance.dispose();
    this.domElement.remove();
  }
}
