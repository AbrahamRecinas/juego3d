// src/interactablesManager.js
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { Interactable } from './interactables.js';

export class InteractablesManager {
  constructor(scene, collidables, hudUpdater) {
    this.scene = scene;
    this.collidables = collidables;
    this.hudUpdater = hudUpdater;
    this.loader = new GLTFLoader();
    this.items = [];
  }

  addItem({ url, pos, name, interactDist }) {
    this.loader.load(url, gltf => {
      const mesh = gltf.scene;
      mesh.position.fromArray(pos);
      mesh.scale.set(1.2,1.2,1.2);
      this.scene.add(mesh);

      const obj = new Interactable(mesh, name);
      Math.random()<0.5 ? obj.markSafe() : obj.markUnsafe();
      obj.interactDist = interactDist;
      this.items.push(obj);
      this.collidables.push(mesh);
      this.hudUpdater();
    });
  }

  forEach(fn) {
    this.items.forEach(fn);
  }
}
