// src/world.js
import * as THREE from 'three';

export function buildFloor(scene, size, material) {
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    material
  );
  mesh.rotation.x = -Math.PI/2;
  scene.add(mesh);
}

export function createHorizontalWall(scene, collidables, size, height, zPos, rotY, material) {
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(size, height),
    material.clone()
  );
  wall.position.set(0, height/2, zPos);
  wall.rotation.y = rotY;
  scene.add(wall);
  collidables.push(wall);
}

export function createRoom(scene, collidables, x, roomW, roomD, roomH, floorMat, wallMat) {
  // Suelo
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(roomW, roomD),
    floorMat.clone()
  );
  floor.rotation.x = -Math.PI/2;
  floor.position.set(x, 0, 0);
  scene.add(floor);

  // Muros norte/sur
  [ +1, -1 ].forEach(sign => {
    const w = new THREE.Mesh(
      new THREE.PlaneGeometry(roomW, roomH),
      wallMat.clone()
    );
    w.position.set(x, roomH/2, sign * (roomD/2));
    w.rotation.y = sign < 0 ? Math.PI : 0;
    scene.add(w);
    collidables.push(w);
  });

  // Muro exterior
  const side = x < 0 ? -1 : +1;
  const ext  = new THREE.Mesh(
    new THREE.PlaneGeometry(roomD, roomH),
    wallMat.clone()
  );
  ext.position.set(x + side*(roomW/2), roomH/2, 0);
  ext.rotation.y = side<0 ? Math.PI/2 : -Math.PI/2;
  scene.add(ext);
  collidables.push(ext);
}
