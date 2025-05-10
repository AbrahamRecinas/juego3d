// src/doors.js
import * as THREE from 'three';

export function createVerticalWallWithDoor(scene, collidables, doors,
    salaSize, doorWidth, wallHeight, doorHeight, xPos, rotY, pivotZ, wallMat, doorMat
) {
  const sideW = (salaSize - doorWidth)/2;
  const topH  = wallHeight - doorHeight;

  // segmentos laterales y superior (igual que antes)…
  // [código de segmentos y top…]
  // añadir a collidables

  // pivot y puerta
  const pivot = new THREE.Object3D();
  pivot.position.set(xPos, 0, pivotZ);
  scene.add(pivot);

  const doorGeom = new THREE.BoxGeometry(0.2, doorHeight, doorWidth);
  // trasladar para que pivote en el borde interior…
  doorGeom.translate(0, 0, (rotY>0? +1 : -1)*(doorWidth/2));

  const doorMesh = new THREE.Mesh(doorGeom, doorMat.clone());
  doorMesh.position.set(0, doorHeight/2, 0);
  doorMesh.rotation.y = rotY;
  pivot.add(doorMesh);

  const closedY = rotY;
  const openY   = rotY + (rotY>0? +Math.PI/2 : -Math.PI/2);

  doors.push({ pivot, closedY, openY, zone:{
    axis:'x', threshold:xPos, min:-doorWidth/2, max:+doorWidth/2
  }});
}
