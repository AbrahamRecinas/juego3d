// src/main.js
import * as THREE                     from 'three';
import { OrbitControls }              from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/controls/OrbitControls.js';
import { FBXLoader }                  from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/loaders/FBXLoader.js';
import { AnimationMixer, LoopRepeat, AnimationClip } from 'three';
import { PlayerControls }             from './controls.js';
import { Interactable }               from './interactables.js';

////////////////////////////////////////////////////////////////////////////////
// Globals & Constants
////////////////////////////////////////////////////////////////////////////////
const scene         = new THREE.Scene();
const camera        = new THREE.PerspectiveCamera(
  50,
  window.innerWidth / window.innerHeight,
  0.1,
  200
);
const renderer      = new THREE.WebGLRenderer({ antialias: true });
const controls      = new OrbitControls(camera, renderer.domElement);
const collidables   = [];    // walls, props, bed
const interactables = [];    // only props for HUD
const doors         = [];    // door pivots
const clock         = new THREE.Clock();

let playerMixer,
    idleAction,
    walkAction,
    interactAction,
    restAction;
let currentAction = 'idle';

const keyState = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
const lastPos  = new THREE.Vector3();

const salaSize   = 30, wallHeight = 10;
const roomW      = 15, roomD      = 15, roomH = 6;
const doorWidth  = 4,  doorHeight = 6;

// Materials
const floorMat     = new THREE.MeshStandardMaterial({ color: 0x888888 });
const wallMat      = new THREE.MeshStandardMaterial({ color: 0x444455 });
const roomWallMat  = new THREE.MeshStandardMaterial({
  color: 0x555566,
  side: THREE.DoubleSide
});
const roomFloorMat = new THREE.MeshStandardMaterial({ color: 0x777777 });
const doorMat      = new THREE.MeshStandardMaterial({ color: 0x553311 });
const bedMat       = new THREE.MeshStandardMaterial({ color: 0x884422 });

////////////////////////////////////////////////////////////////////////////////
// 1) Renderer & Camera
////////////////////////////////////////////////////////////////////////////////
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

camera.position.set(0, 30, 30);
camera.lookAt(0, 0, 0);

controls.enableDamping   = true;
controls.dampingFactor   = 0.05;
controls.enableZoom      = false;
controls.enablePan       = false;
controls.minPolarAngle   = Math.PI / 4;
controls.maxPolarAngle   = Math.PI / 4;
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

  // lateral segments
  [-1, 1].forEach(signZ => {
    const seg = new THREE.Mesh(
      new THREE.PlaneGeometry(sideW, wallHeight),
      wallMat.clone()
    );
    seg.position.set(
      xPos,
      wallHeight / 2,
      signZ * (doorWidth / 2 + sideW / 2)
    );
    seg.rotation.y = rotY;
    scene.add(seg);
    collidables.push(seg);
  });

  // top segment
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(doorWidth, topH),
    wallMat.clone()
  );
  top.position.set(xPos, doorHeight + topH / 2, 0);
  top.rotation.y = rotY;
  scene.add(top);
  collidables.push(top);

  // hinge pivot
  const pivot = new THREE.Object3D();
  pivot.position.set(xPos, 0, pivotZ);
  scene.add(pivot);

  // door mesh
  const dg   = new THREE.BoxGeometry(0.2, doorHeight, doorWidth);
  const side = rotY > 0 ? +1 : -1;
  dg.translate(0, 0, side * (doorWidth / 2));
  const doorMesh = new THREE.Mesh(dg, doorMat.clone());
  doorMesh.position.set(0, doorHeight / 2, 0);
  doorMesh.rotation.y = rotY;
  pivot.add(doorMesh);

  const closedY = rotY;
  const openY   = rotY + (rotY > 0 ? +Math.PI / 2 : -Math.PI / 2);
  doors.push({
    pivot, closedY, openY,
    zone: { axis: 'x', threshold: xPos, min: -doorWidth/2, max: +doorWidth/2 }
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
    w.position.set(x, roomH / 2, sign * (roomD / 2));
    w.rotation.y = sign < 0 ? Math.PI : 0;
    scene.add(w);
    collidables.push(w);
  });

  // outer wall
  const dir = x < 0 ? -1 : +1;
  const w2 = new THREE.Mesh(
    new THREE.PlaneGeometry(roomD, roomH),
    roomWallMat.clone()
  );
  w2.position.set(x + dir * (roomW / 2), roomH / 2, 0);
  w2.rotation.y = dir < 0 ? Math.PI/2 : -Math.PI/2;
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
// 5) Player & Animations
////////////////////////////////////////////////////////////////////////////////
const fbxLoader = new FBXLoader();
let player = new THREE.Object3D();
player.position.set(0,0.5,0);
scene.add(player);

fbxLoader.load('models/maincharacter.fbx', char => {
  char.scale.set(0.03, 0.03, 0.03);
  player.add(char);
  playerMixer = new AnimationMixer(char);

  // idle
  fbxLoader.load('models/idle.fbx', idleFbx => {
    idleAction = playerMixer.clipAction(idleFbx.animations[0]);
    idleAction.setLoop(LoopRepeat);
    idleAction.play();
  });

  // walk
  fbxLoader.load('models/walk.fbx', walkFbx => {
    const raw = walkFbx.animations[0];
    const walkClip = AnimationClip.parse(AnimationClip.toJSON(raw));
    walkClip.tracks = walkClip.tracks.filter(t => !t.name.endsWith('.position'));
    walkAction = playerMixer.clipAction(walkClip);
    walkAction.setLoop(LoopRepeat);
  });

  // interact
  fbxLoader.load('models/interact.fbx', interFbx => {
    interactAction = playerMixer.clipAction(interFbx.animations[0]);
    interactAction.setLoop(THREE.LoopOnce, 1);
    interactAction.clampWhenFinished = true;
  });

  // rest
  fbxLoader.load('models/rest.fbx', restFbx => {
    restAction = playerMixer.clipAction(restFbx.animations[0]);
    restAction.setLoop(THREE.LoopOnce, 1);
    restAction.clampWhenFinished = true;
  });

  // finished listener
  playerMixer.addEventListener('finished', e => {
    if (e.action === interactAction) {
      interactAction.fadeOut(0.1);
      const moving = keyState.KeyW||keyState.KeyA||keyState.KeyS||keyState.KeyD;
      if (moving && walkAction) {
        walkAction.reset().fadeIn(0.1).play();
        currentAction = 'walk';
      } else if (idleAction) {
        idleAction.reset().fadeIn(0.1).play();
        currentAction = 'idle';
      }
    }
    if (e.action === restAction) {
      if (interactables.every(i => i.isSafe)) {
        alert('Descansando… ¡Has ganado!');
      } else {
        alert('Descansando… ¡Has perdido! Faltan objetos.');
      }
    }
  });
});

// 5.4) Cargar modelo FBX de la cama
let bed, bedObj;

fbxLoader.load('models/bed.FBX', fb => {
  // Ajusta escala según el tamaño real de tu FBX
  fb.scale.set(0.0025, 0.0025, 0.0025);
  // Colócala en la esquina de la recámara derecha
  fb.position.set(offsetX + 3, 0.5, 0.2);
  //Rotacion
  fb.rotation.set(0, 2.2, 0);
  scene.add(fb);

  // Para que el jugador colisione con cada mesh dentro de la cama:
  fb.traverse(child => {
    if (child.isMesh) {
      child.geometry.computeBoundingBox();
      collidables.push(child);
    }
  });

  // Guarda la referencia y envuélvela en Interactable,
  // PERO NO la metas en el array `interactables`
  bed = fb;
});


const playerControls = new PlayerControls(player, salaSize + roomW, collidables);

////////////////////////////////////////////////////////////////////////////////
// 6) Props as FBX + per‐model scale + HUD
////////////////////////////////////////////////////////////////////////////////
const backZ    = -salaSize/2 + 0.5;
const sideWall = salaSize/2 - 0.5;
const centerY  = 1;

const propConfigs = [
  { name:'Extintor', file:'models/extintor.fbx', pos:[sideWall,0.5,-4], dist:2.5, scale:0.005, rotation:[0,0,0] },
  { name:'Switch',   file:'models/switch.fbx',    pos:[8,4,-15],       dist:4, scale:0.5,   rotation:[1.5,0,0] },
  { name:'Window',   file:'models/window.fbx',    pos:[-8,2,-14],    dist:2.5, scale:0.03,  rotation:[0,0,0] },
  { name:'Radiator',   file:'models/radiator.FBX',    pos:[-8,2,-14],    dist:2.5, scale:1,  rotation:[0,0,0] },
  { name:'Puerta',   file:'models/door.fbx',    pos:[-1,-0.5,-15],    dist:3, scale:0.03,  rotation:[0,0,0] },
  { name:'Mesa',   file:'models/mesa.fbx',    pos:[-1,-0.5,-10],    dist:4, scale:0.03,  rotation:[0,0,0] },
];

propConfigs.forEach(cfg => {
  fbxLoader.load(cfg.file, model => {
    model.scale.set(cfg.scale, cfg.scale, cfg.scale);
    model.rotation.set(...cfg.rotation);
    model.position.fromArray(cfg.pos);

    model.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
        child.geometry.computeBoundingBox();
        collidables.push(child);
      }
    });

    scene.add(model);

    const obj = new Interactable(model, cfg.name);
    Math.random() < 0.5 ? obj.markSafe() : obj.markUnsafe();
    obj.interactDist = cfg.dist;
    interactables.push(obj);

    updateHUD();
  });
});

////////////////////////////////////////////////////////////////////////////////
// 7) HUD + Restart
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
  interactables.forEach(i=>{
    html += `<span style="
      display:inline-block;width:10px;height:10px;
      background:${i.isSafe?'#4f4':'#f44'};
      margin-right:6px;"></span>${i.name}<br>`;
  });
  html += `<div style="margin-top:8px;">
    <span style="
      display:inline-block;width:10px;height:10px;
      background:#88f;margin-right:6px;
    "></span>Cama (Descansar)
  </div>`;
  hud.innerHTML = html;
}
// initial call (in case any load was instant)
updateHUD();

const btn = document.createElement('button');
btn.textContent = 'Reiniciar';
Object.assign(btn.style,{
  position:'absolute', bottom:'20px', left:'50%',
  transform:'translateX(-50%)', padding:'8px 16px',
  cursor:'pointer', zIndex:100
});
btn.addEventListener('click', ()=> location.reload());
document.body.appendChild(btn);

////////////////////////////////////////////////////////////////////////////////
// 8) Input Handling
////////////////////////////////////////////////////////////////////////////////
window.addEventListener('keydown', e => {
  // bloquea movimiento si interact/rest
  if ((currentAction==='interact' || currentAction==='rest') &&
      ['KeyW','KeyA','KeyS','KeyD'].includes(e.code)) return;
  if (keyState.hasOwnProperty(e.code)) keyState[e.code] = true;

  if (e.code === 'KeyE') {
    // primero props
    for (const obj of interactables) {
      if (player.position.distanceTo(obj.mesh.position) < obj.interactDist) {
        obj.toggleSafe();
        updateHUD();
        if (interactAction) {
          idleAction.fadeOut(0.1);
          walkAction.fadeOut(0.1);
          interactAction.reset().fadeIn(0.1).play();
          currentAction = 'interact';
        }
        return;
      }
    }
    // luego cama
  // 2) Lógica de la cama (rest)
  if (
    e.code === 'KeyE' &&
    bed &&
    player.position.distanceTo(bed.position) < 4 &&
    restAction
  ) {
// 1) Calcula la posición “ideal” junto a la cama
//    Ajusta offsetX/Y/Z según tu malla y cómo quieras que quede tumbado
const restOffset = new THREE.Vector3(-1, 0, 0);  
//    (esto lo deslizas un metro hacia “-X” desde el centro de la cama)

const targetPos = new THREE.Vector3().copy(bed.position).add(restOffset);

// 2) Mueve ahí al player y oriénta hacia la cama
player.position.copy(targetPos);
player.lookAt(bed.position.x, player.position.y, bed.position.z);
player.rotateY(Math.PI);

// 3) Y sólo **después** disparas la animación de rest
idleAction.fadeOut(0.1);
walkAction.fadeOut(0.1);
interactAction.fadeOut(0.1);

restAction.reset().fadeIn(0.1).play();
currentAction = 'rest';
  }
  }
});
window.addEventListener('keyup', e => {
  if (keyState.hasOwnProperty(e.code) &&
      currentAction!=='interact' &&
      currentAction!=='rest') {
    keyState[e.code] = false;
  }
});
////////////////////////////////////////////////////////////////////////////////
// 9) Entorno: cargar FBX NO-interactuables
////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////
// 10) Animation Loop
////////////////////////////////////////////////////////////////////////////////
window.addEventListener('resize', ()=>{
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth,window.innerHeight);
});

(function animate(){
  requestAnimationFrame(animate);
  const delta = clock.getDelta();
  if (playerMixer) playerMixer.update(delta);

  if (currentAction!=='interact' && currentAction!=='rest') {
    playerControls.update();
    controls.update();

    // mezcla idle/walk
    const moving = keyState.KeyW||keyState.KeyA||keyState.KeyS||keyState.KeyD;
    if (moving && walkAction) {
      if (currentAction!=='walk') {
        walkAction.reset().fadeIn(0.2).play();
        idleAction.fadeOut(0.2);
        currentAction='walk';
      }
    } else if (idleAction && currentAction!=='idle') {
      idleAction.reset().fadeIn(0.2).play();
      walkAction.fadeOut(0.2);
      currentAction='idle';
    }

    // orientación
    if (moving) {
      const dir = new THREE.Vector3().subVectors(player.position, lastPos);
      dir.y = 0;
      if (dir.length()>0.0001) {
        const target = player.position.clone().add(dir);
        player.lookAt(target.x, player.position.y, target.z);
      }
    }
  }

  lastPos.copy(player.position);

  // puertas automáticas
  doors.forEach(({ pivot, closedY, openY, zone })=>{
    const cx = player.position[zone.axis];
    const cz = player.position[ zone.axis==='x'?'z':'x' ];
    const inZone = Math.abs(cx-zone.threshold)<1
                && cz>=zone.min && cz<=zone.max;
    pivot.rotation.y = inZone ? openY : closedY;
  });

  renderer.render(scene,camera);
})();
