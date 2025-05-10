// src/controls.js
import * as THREE from 'three';

export class PlayerControls {
  /**
   * @param {THREE.Mesh} player 
   * @param {number} salaSize 
   * @param {THREE.Object3D[]} collidables – meshes que no debe atravesar
   */
  constructor(player, salaSize, collidables=[]) {
    this.player     = player;
    this.salaSize   = salaSize;
    this.collidables= collidables;

    // movimiento
    this.moveForward  = false;
    this.moveBackward = false;
    this.moveLeft     = false;
    this.moveRight    = false;

    this.velocity = new THREE.Vector3();
    this.speed    = 10;               // u/s
    this.clock    = new THREE.Clock();

    this._initListeners();
  }

  _initListeners() {
    window.addEventListener('keydown', e => {
      switch (e.code) {
        case 'KeyW': this.moveForward  = true; break;
        case 'KeyS': this.moveBackward = true; break;
        case 'KeyA': this.moveLeft     = true; break;
        case 'KeyD': this.moveRight    = true; break;
      }
    });
    window.addEventListener('keyup', e => {
      switch (e.code) {
        case 'KeyW': this.moveForward  = false; break;
        case 'KeyS': this.moveBackward = false; break;
        case 'KeyA': this.moveLeft     = false; break;
        case 'KeyD': this.moveRight    = false; break;
      }
    });
  }

  update() {
    const delta = Math.min(0.1, this.clock.getDelta());

    // reset velocity
    this.velocity.set(0, 0, 0);
    if (this.moveForward)  this.velocity.z -= this.speed * delta;
    if (this.moveBackward) this.velocity.z += this.speed * delta;
    if (this.moveLeft)     this.velocity.x -= this.speed * delta;
    if (this.moveRight)    this.velocity.x += this.speed * delta;

    // calcula nueva posición tentativa
    const newPos = this.player.position.clone().add(this.velocity);

    // clamp amplio (permitir entrar a salas)
    const limit = this.salaSize; 
    newPos.x = THREE.MathUtils.clamp(newPos.x, -limit, +limit);
    newPos.z = THREE.MathUtils.clamp(newPos.z, -limit, +limit);

    // crea cajas envolventes para colisión
    const playerBox = new THREE.Box3().setFromCenterAndSize(
      newPos,
      new THREE.Vector3(1, 1, 1)
    );

    // chequea cada muro
    let collision = false;
    for (const mesh of this.collidables) {
      const box = new THREE.Box3().setFromObject(mesh);
      if (box.intersectsBox(playerBox)) {
        collision = true;
        break;
      }
    }

    // solo aplica si no choca
    if (!collision) {
      this.player.position.copy(newPos);
    }
  }
}
