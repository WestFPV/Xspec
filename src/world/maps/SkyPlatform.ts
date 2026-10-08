import * as THREE from 'three';

export function buildSkyPlatform(): THREE.Group {
  const platform = new THREE.Group();
  const surfaceY = -0.042;
  const centerY = -2.05;
  const centerZ = 95;
  const size = 600;

  const base = new THREE.Mesh(
    new THREE.BoxGeometry(size, 4, size),
    new THREE.MeshStandardMaterial({ color: 0x172332, roughness: 0.76, metalness: 0.32 }),
  );
  base.position.set(0, centerY, centerZ);
  base.receiveShadow = true;
  platform.add(base);

  const grass = new THREE.Mesh(
    new THREE.PlaneGeometry(size - 0.2, size - 0.2),
    new THREE.MeshStandardMaterial({ color: 0x63804a, roughness: 0.98 }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, surfaceY, centerZ);
  grass.receiveShadow = true;
  platform.add(grass);

  const bottomY = centerY - 2.05;
  const edgeMaterials = [
    new THREE.MeshBasicMaterial({ color: 0x4de5ff, toneMapped: false }),
    new THREE.MeshBasicMaterial({ color: 0xff56bb, toneMapped: false }),
  ];
  const addEdge = (geometry: THREE.BoxGeometry, x: number, z: number, material: THREE.Material) => {
    const edge = new THREE.Mesh(geometry, material);
    edge.position.set(x, bottomY, z);
    platform.add(edge);
  };
  addEdge(new THREE.BoxGeometry(size, 0.1, 0.22), 0, centerZ - size / 2 + 1, edgeMaterials[0]);
  addEdge(new THREE.BoxGeometry(size, 0.1, 0.22), 0, centerZ + size / 2 - 1, edgeMaterials[1]);
  addEdge(new THREE.BoxGeometry(0.22, 0.1, size), -size / 2 + 1, centerZ, edgeMaterials[1]);
  addEdge(new THREE.BoxGeometry(0.22, 0.1, size), size / 2 - 1, centerZ, edgeMaterials[0]);
  return platform;
}
