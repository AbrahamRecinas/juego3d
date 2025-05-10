// src/player.js
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as THREE   from 'three';

export async function loadPlayerModel(path, scene, collidables, onLoaded) {
  const loader = new FBXLoader();
  return new Promise(resolve => {
    loader.load(path, fbx => {
      fbx.scale.set(0.01,0.01,0.01);
      scene.add(fbx);
      collidables.push(fbx);
      // animaciones
      const mixer = new THREE.AnimationMixer(fbx);
      fbx.animations.forEach(clip => mixer.clipAction(clip));
      onLoaded(mixer);
      resolve(fbx);
    });
  });
}
