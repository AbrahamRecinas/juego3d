// src/main.js
import * as THREE                     from 'three';
import { OrbitControls }              from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/controls/OrbitControls.js';
import { FBXLoader }                  from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/loaders/FBXLoader.js';
import { PlayerControls }             from './controls.js';
import { Interactable }               from './interactables.js';
import { AnimationMixer, LoopRepeat, AnimationClip } from 'three';

////////////////////////////////////////////////////////////////////////////////
// Globals & Constants
////////////////////////////////////////////////////////////////////////////////
const scene         = new THREE.Scene();
const camera        = new THREE.PerspectiveCamera(
  50, window.innerWidth/window.innerHeight, 0.1, 200
);
const renderer      = new THREE.WebGLRenderer({ antialias: true });
const controls      = new OrbitControls(camera, renderer.domElement);
const collidables   = [];    // meshes blocking the player
const interactables = [];    // interactable props
const doors         = [];    // door pivots
const clock         = new THREE.Clock();

let playerMixer, idleAction, walkAction;
let currentAction = 'idle';

// Track movement keys
const keyState = { KeyW:false, KeyA:false, KeyS:false, KeyD:false };
// For orientation
const lastPos = new THREE.Vector3();

const salaSize   = 30,  wallHeight = 10;
const roomW      = 15,  roomD      = 15, roomH = 6;
const doorWidth  = 4,   doorHeight = 6;

// Materials
const floorMat     = new THREE.MeshStandardMaterial({ color: 0x888888 });
const wallMat      = new THREE.MeshStandardMaterial({ color: 0x444455 });
const roomWallMat  = new THREE.MeshStandardMaterial({ color: 0x555566, side: THREE.DoubleSide });
const roomFloorMat = new THREE.MeshStandardMaterial({ color: 0x777777 });
const doorMat      = new THREE.MeshStandardMaterial({ color: 0x553311 });
const bedMat       = new THREE.MeshStandardMaterial({ color: 0x884422 });

////////////////////////////////////////////////////////////////////////////////
// 1) Renderer & Camera Setup
////////////////////////////////////////////////////////////////////////////////
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

camera.position.set(0, 30, 30);
camera.lookAt(0, 0, 0);

// OrbitControls: horizontal only, fixed tilt
controls.enableDamping   = true;
controls.dampingFactor   = 0.05;
controls.enableZoom      = false;
controls.enablePan       = false;
controls.minPolarAngle   = Math.PI/4;
controls.maxPolarAngle   = Math.PI/4;
controls.minAzimuthAngle = -Infinity;
controls.maxAzimuthAngle = +Infinity;

////////////////////////////////////////////////////////////////////////////////
// 2) Lighting
////////////////////////////////////////////////////////////////////////////////
scene.add(new THREE.AmbientLight(0xffffff, 0.5));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
dirLight.position.set(5, 10, 5);
scene.add(dirLight);

////////////////////////////////////////////////////////////////////////////////
// 3) Floor
////////////////////////////////////////////////////////////////////////////////
const floor = new THREE.Mesh(
  new THREE.PlaneGeometry(salaSize, salaSize),
  floorMat
);
floor.rotation.x = -Math.PI / 2;
scene.add(floor);

////////////////////////////////////////////////////////////////////////////////
// 4) Walls & Doors Helpers
////////////////////////////////////////////////////////////////////////////////
function createHorizontalWall(zPos, rotY = 0) {
  const w = new THREE.Mesh(
    new THREE.PlaneGeometry(salaSize, wallHeight),
    wallMat.clone()
  );
  w.position.set(0, wallHeight / 2, zPos);
  w.rotation.y = rotY;
  scene.add(w);
  collidables.push(w);
}

function createVerticalWallWithDoor(xPos, rotY, pivotZ = 0) {
  const sideW = (salaSize - doorWidth) / 2;
  const topH  = wallHeight - doorHeight;

  // side segments
  [-1, 1].forEach(signZ => {
    const seg = new THREE.Mesh(
      new THREE.PlaneGeometry(sideW, wallHeight),
      wallMat.clone()
    );
    seg.position.set(xPos, wallHeight / 2, signZ * (doorWidth/2 + sideW/2));
    seg.rotation.y = rotY;
    scene.add(seg);
    collidables.push(seg);
  });

  // top segment
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(doorWidth, topH),
    wallMat.clone()
  );
  top.position.set(xPos, doorHeight + topH/2, 0);
  top.rotation.y = rotY;
  scene.add(top);
  collidables.push(top);

  // hinge pivot
  const pivot = new THREE.Object3D();
  pivot.position.set(xPos, 0, pivotZ);
  scene.add(pivot);

  // door geometry (origin at hinge edge)
  const dg = new THREE.BoxGeometry(0.2, doorHeight, doorWidth);
  const side = rotY > 0 ? +1 : -1;
  dg.translate(0, 0, side * (doorWidth/2));
  const doorMesh = new THREE.Mesh(dg, doorMat.clone());
  doorMesh.position.set(0, doorHeight/2, 0);
  doorMesh.rotation.y = rotY;
  pivot.add(doorMesh);

  // store for auto open/close
  const closedY = rotY;
  const openY   = rotY + (rotY>0 ? +Math.PI/2 : -Math.PI/2);
  doors.push({
    pivot, closedY, openY,
    zone:{ axis:'x', threshold:xPos, min:-doorWidth/2, max:+doorWidth/2 }
  });
}

function createRoom(x) {
  // floor
  const rf = new THREE.Mesh(
    new THREE.PlaneGeometry(roomW, roomD),
    roomFloorMat.clone()
  );
  rf.rotation.x = -Math.PI / 2;
  rf.position.set(x, 0, 0);
  scene.add(rf);

  // north/south walls
  [+1, -1].forEach(sign => {
    const w = new THREE.Mesh(
      new THREE.PlaneGeometry(roomW, roomH),
      roomWallMat.clone()
    );
    w.position.set(x, roomH/2, sign * (roomD/2));
    w.rotation.y = sign<0 ? Math.PI : 0;
    scene.add(w);
    collidables.push(w);
  });

  // outer wall
  const dir = x<0 ? -1 : +1;
  const w2 = new THREE.Mesh(
    new THREE.PlaneGeometry(roomD, roomH),
    roomWallMat.clone()
  );
  w2.position.set(x + dir*(roomW/2), roomH/2, 0);
  w2.rotation.y = dir<0 ? Math.PI/2 : -Math.PI/2;
  scene.add(w2);
  collidables.push(w2);
}

// build structure
createHorizontalWall(-salaSize/2);
createHorizontalWall(+salaSize/2, Math.PI);
createVerticalWallWithDoor(-salaSize/2,  Math.PI/2, +2);
createVerticalWallWithDoor(+salaSize/2, -Math.PI/2, -2);
const offsetX = salaSize/2 + roomW/2;
createRoom(-offsetX);
createRoom(+offsetX);

////////////////////////////////////////////////////////////////////////////////
// 5) Player & Animations (idle.fbx + walk.fbx)
////////////////////////////////////////////////////////////////////////////////
const fbxLoader = new FBXLoader();
let player = new THREE.Object3D();
player.position.set(0, 0.5, 0);
scene.add(player);

// 5.1) Load character mesh
fbxLoader.load('models/maincharacter.fbx', char => {
  char.scale.set(0.03, 0.03, 0.03);
  player.add(char);

  playerMixer = new THREE.AnimationMixer(char);

  // 5.2) Idle clip
  fbxLoader.load('models/idle.fbx', idleFbx => {
    idleAction = playerMixer.clipAction(idleFbx.animations[0]);
    idleAction.setLoop(THREE.LoopRepeat);
    idleAction.play(); // start idle
  });

  // 5.3) Walk clip
  fbxLoader.load('models/walk.fbx', walkFbx => {
    // clona el clip antes de mutarlo
    const raw = walkFbx.animations[0];
    const walkClip = AnimationClip.parse( AnimationClip.toJSON(raw) );
    walkClip.tracks = walkClip.tracks.filter(track =>
      // nombre típico: "Hips.position"
      !track.name.endsWith('.position')
    );
    walkAction = playerMixer.clipAction(walkClip);
    walkAction.setLoop(LoopRepeat);
  });
  //Interactuar
  fbxLoader.load('models/interact.fbx', interactFbx => {
    interactAction = playerMixer.clipAction(interactFbx.animations[0]);
    // Solo 1 vez, sin loop automático
    interactAction.setLoop(THREE.LoopOnce, 1);
    interactAction.clampWhenFinished = true;
  });

});

const playerControls = new PlayerControls(
  player, salaSize + roomW, collidables
);

// place bed
const bed = new THREE.Mesh(
  new THREE.BoxGeometry(3,1,2),
  bedMat.clone()
);
bed.position.set(offsetX - 1, 0.5, -roomD/2 + 1);
scene.add(bed);

////////////////////////////////////////////////////////////////////////////////
// 6) Interactables + Collisions
////////////////////////////////////////////////////////////////////////////////
const backZ    = -salaSize/2 + 0.5;
const sideWall = salaSize/2 - 0.5;
const centerY  = 1;

const configs = [
  // main room
  { pos:[-8,2,backZ],         name:'Ventana',       dist:2.5 },
  { pos:[-14,0.5,-4],         name:'Válvula gas',   dist:2.5 },
  { pos:[ 8,2,backZ],         name:'Interruptor luz',dist:2.5 },
  { pos:[ 0,4,0],             name:'Detector humo', dist:5.0 },
  { pos:[ sideWall,centerY,5],name:'Termostato',    dist:2.5 },
  { pos:[ 2,centerY,2],       name:'Radio',         dist:2.5 },
  { pos:[ sideWall,0.5,-4],   name:'Extintor',      dist:2.5 },
  // bathroom left
  { pos:[-offsetX+1,1,2],     name:'Llave agua',    dist:2.5 },
  { pos:[-offsetX+0.5,2,-2],  name:'Espejo',        dist:2.5 },
  // bedroom right
  { pos:[ offsetX-1,0.75,0],  name:'Ropero',        dist:2.5 },
  { pos:[ offsetX-0.2,4,2],   name:'Lámpara',       dist:2.5 }
];

configs.forEach(cfg => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2,2,2),
    new THREE.MeshStandardMaterial()
  );
  mesh.position.fromArray(cfg.pos);
  scene.add(mesh);
  collidables.push(mesh);

  const obj = new Interactable(mesh, cfg.name);
  Math.random() < 0.5 ? obj.markSafe() : obj.markUnsafe();
  obj.interactDist = cfg.dist;
  interactables.push(obj);
});

////////////////////////////////////////////////////////////////////////////////
// 7) HUD
////////////////////////////////////////////////////////////////////////////////
const hud = document.createElement('div');
hud.style = `
  position:absolute; top:10px; right:10px;
  background:rgba(0,0,0,0.6); color:#fff;
  padding:8px; font-family:Arial; z-index:100;
`;
document.body.appendChild(hud);
function updateHUD(){
  let html = '<b>Interactuables:</b><br>';
  interactables.forEach(i => {
    html += `<span style="
      display:inline-block;width:10px;height:10px;
      background:${i.isSafe?'#4f4':'#f44'};
      margin-right:6px;"></span>${i.name}<br>`;
  });
  html += `<div style="margin-top:8px;">
    <span style="display:inline-block;width:10px;height:10px;
      background:#88f;margin-right:6px;"></span>Cama (Descansar)
  </div>`;
  hud.innerHTML = html;
}
updateHUD();

////////////////////////////////////////////////////////////////////////////////
// 8) Input Handling
////////////////////////////////////////////////////////////////////////////////
window.addEventListener('keydown', e => {
  if (keyState.hasOwnProperty(e.code)) keyState[e.code] = true;
  if (e.code === 'KeyE') {
    for (const obj of interactables) {
      if (obj.mesh.position.distanceTo(player.position) < obj.interactDist) {
        obj.toggleSafe();
        updateHUD();
        return;
      }
    }
    if (bed.position.distanceTo(player.position) < 2) {
      if (interactables.every(i => i.isSafe)) alert('Descansando… ¡Has ganado!');
      else alert('Descansando… ¡Has perdido! Faltan objetos.');
    }
  }
});
window.addEventListener('keyup', e => {
  if (keyState.hasOwnProperty(e.code)) keyState[e.code] = false;
});

////////////////////////////////////////////////////////////////////////////////
// 9) Animation Loop
////////////////////////////////////////////////////////////////////////////////
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth,window.innerHeight);
});

(function animate(){
  requestAnimationFrame(animate);

  const delta = clock.getDelta();
  if (playerMixer) playerMixer.update(delta);

  // movement & collision
  playerControls.update();

  // Animate actions
  const moving = keyState.KeyW||keyState.KeyA||keyState.KeyS||keyState.KeyD;
  if (moving && walkAction) {
    if (currentAction !== 'walk') {
      walkAction.reset().fadeIn(0.2).play();
      if (idleAction) idleAction.fadeOut(0.2);
      currentAction = 'walk';
    }
  } else {
    if (idleAction && currentAction !== 'idle') {
      idleAction.reset().fadeIn(0.2).play();
      if (walkAction) walkAction.fadeOut(0.2);
      currentAction = 'idle';
    }
  }

  // Orient towards movement
  if (moving) {
    const dir = new THREE.Vector3().subVectors(player.position, lastPos);
    dir.y = 0;
    if (dir.length() > 0.0001) {
      const lookTarget = new THREE.Vector3().addVectors(player.position, dir);
      player.lookAt(lookTarget.x, player.position.y, lookTarget.z);
    }
  }
  lastPos.copy(player.position);

  // Auto open/close doors
  doors.forEach(({pivot, closedY, openY, zone}) => {
    const cx = player.position[zone.axis];
    const cz = player.position[ zone.axis==='x'?'z':'x' ];
    const inZone = Math.abs(cx - zone.threshold) < 1
                && cz >= zone.min && cz <= zone.max;
    pivot.rotation.y = inZone ? openY : closedY;
  });

  controls.update();
  renderer.render(scene, camera);
})();
