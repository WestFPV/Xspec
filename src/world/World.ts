import * as THREE from 'three';
import { buildSkyPlatform } from './maps/SkyPlatform';

export class World {
  private readonly map: THREE.Group;

  constructor(private readonly scene: THREE.Scene) {
    this.scene.background = new THREE.Color('#030714');
    this.scene.fog = new THREE.Fog('#030714', 900, 3200);

    const skyLight = new THREE.HemisphereLight(0xb9d5ff, 0x101820, 1.2);
    this.scene.add(skyLight);

    const fill = new THREE.DirectionalLight(0x55dfff, 0.8);
    fill.position.set(-34, 24, 24);
    this.scene.add(fill);

    this.map = buildSkyPlatform();
    this.scene.add(this.map);
  }

  dispose(): void {
    this.map.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => material.dispose());
      }
    });
    this.scene.clear();
  }
}
