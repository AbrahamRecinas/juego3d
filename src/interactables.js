// src/interactables.js
import * as THREE from 'three';

export class Interactable {
  /**
   * @param {THREE.Object3D} mesh – cualquier malla o grupo
   * @param {string} name         – etiqueta para mostrar en HUD
   */
  constructor(mesh, name) {
    this.mesh   = mesh;
    this.name   = name;
    this.isSafe = false;

    // Materiales para alternar estado
    this.matUnsafe = new THREE.MeshStandardMaterial({ color: 0xff4444 });
    this.matSafe   = new THREE.MeshStandardMaterial({ color: 0x44ff44 });

    // Inicializa todos los sub-meshes en estado “unsafe”
    this.mesh.traverse(c => {
      if (c.isMesh) c.material = this.matUnsafe;
    });
  }

  toggleSafe() {
    this.isSafe ? this.markUnsafe() : this.markSafe();
  }

  markSafe() {
    this.isSafe = true;
    this.mesh.traverse(c => {
      if (c.isMesh) c.material = this.matSafe;
    });
  }

  markUnsafe() {
    this.isSafe = false;
    this.mesh.traverse(c => {
      if (c.isMesh) c.material = this.matUnsafe;
    });
  }
}