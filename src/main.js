// src/main.js
import * as THREE from 'three';
import { Raycaster, Vector2 } from 'three';
import { OrbitControls }      from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/controls/OrbitControls.js';
import { PlayerControls }     from './controls.js';
import { Interactable }       from './interactables.js';

////////////////////////////////////////////////////////////////////////////////
// Globals & Constants
////////////////////////////////////////////////////////////////////////////////
const scene         = new THREE.Scene();
const camera        = new THREE.PerspectiveCamera(50, window.innerWidth/window.innerHeight, 0.1, 200);
const renderer      = new THREE.WebGLRenderer({ antialias: true });
const controls      = new OrbitControls(camera, renderer.domElement);
const collidables   = [];      // meshes para colisiones
const interactables = [];      // lista de Interactable
const doors         = [];      // pivots de puertas

// Valores generales
const salaSize      = 30;
const wallHeight    = 10;
const roomW         = 15;
const roomD         = 15;
const roomH         = 6;
const doorWidth     = 4;
const doorHeight    = 6;

// Materiales reutilizables
const floorMat     = new THREE.MeshStandardMaterial({ color: 0x888888 });
const wallMat      = new THREE.MeshStandardMaterial({ color: 0x444455 });
const roomWallMat  = new THREE.MeshStandardMaterial({ color: 0x555566, side: THREE.DoubleSide });
const roomFloorMat = new THREE.MeshStandardMaterial({ color: 0x777777 });
const doorMat      = new THREE.MeshStandardMaterial({ color: 0x553311 });
const playerMat    = new THREE.MeshStandardMaterial({ color: 0x0077ff });
const bedMat       = new THREE.MeshStandardMaterial({ color: 0x884422 });

////////////////////////////////////////////////////////////////////////////////
// 1) Renderer & Camera Setup
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
controls.minPolarAngle   = Math.PI/4;
controls.maxPolarAngle   = Math.PI/4;
controls.minAzimuthAngle = -Infinity;
controls.maxAzimuthAngle = +Infinity;
controls.update();

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
floor.rotation.x = -Math.PI/2;
scene.add(floor);

////////////////////////////////////////////////////////////////////////////////
// 4) Walls & Doors
////////////////////////////////////////////////////////////////////////////////
function createHorizontalWall(zPos, rotY = 0) {
  const wall = new THREE.Mesh(
    new THREE.PlaneGeometry(salaSize, wallHeight),
    wallMat.clone()
  );
  wall.position.set(0, wallHeight/2, zPos);
  wall.rotation.y = rotY;
  scene.add(wall);
  collidables.push(wall);
}

function createVerticalWallWithDoor(xPos, rotY, pivotZ = 0) {
  const sideW = (salaSize - doorWidth)/2;
  const topH  = wallHeight - doorHeight;

  // segmentos laterales
  [-1, +1].forEach(signZ => {
    const seg = new THREE.Mesh(
      new THREE.PlaneGeometry(sideW, wallHeight),
      wallMat.clone()
    );
    seg.position.set(xPos, wallHeight/2, signZ*(doorWidth/2 + sideW/2));
    seg.rotation.y = rotY;
    scene.add(seg);
    collidables.push(seg);
  });

  // tramo superior
  const top = new THREE.Mesh(
    new THREE.PlaneGeometry(doorWidth, topH),
    wallMat.clone()
  );
  top.position.set(xPos, doorHeight + topH/2, 0);
  top.rotation.y = rotY;
  scene.add(top);
  collidables.push(top);

  // pivot de la puerta
  const pivot = new THREE.Object3D();
  pivot.position.set(xPos, 0, pivotZ);
  scene.add(pivot);

  // geometría de la puerta: tornamos su origen al borde
  const thickness = 0.2;
  const doorGeom  = new THREE.BoxGeometry(thickness, doorHeight, doorWidth);
  const side      = rotY>0 ? +1 : -1;
  doorGeom.translate(0, 0, side*(doorWidth/2));

  // mesh de la puerta
  const doorMesh = new THREE.Mesh(doorGeom, doorMat.clone());
  doorMesh.position.set(0, doorHeight/2, 0);
  doorMesh.rotation.y = rotY;
  pivot.add(doorMesh);

  // rangos para abrir/cerrar
  const closedY = rotY;
  const openY   = rotY + (rotY>0 ? +Math.PI/2 : -Math.PI/2);

  doors.push({
    pivot,
    closedY,
    openY,
    zone: {
      axis:      'x',
      threshold: xPos,
      min:      -doorWidth/2,
      max:      +doorWidth/2
    }
  });
}

function createRoom(x) {
  // suelo
  const rf = new THREE.Mesh(
    new THREE.PlaneGeometry(roomW, roomD),
    roomFloorMat.clone()
  );
  rf.rotation.x = -Math.PI/2;
  rf.position.set(x, 0, 0);
  scene.add(rf);

  // muros norte/sur
  [+1, -1].forEach(sign => {
    const w = new THREE.Mesh(
      new THREE.PlaneGeometry(roomW, roomH),
      roomWallMat.clone()
    );
    w.position.set(x, roomH/2, sign*(roomD/2));
    w.rotation.y = sign<0? Math.PI: 0;
    scene.add(w);
    collidables.push(w);
  });

  // muro exterior
  const side = x<0 ? -1 : +1;
  const w    = new THREE.Mesh(
    new THREE.PlaneGeometry(roomD, roomH),
    roomWallMat.clone()
  );
  w.position.set(x + side*(roomW/2), roomH/2, 0);
  w.rotation.y = side<0 ? Math.PI/2 : -Math.PI/2;
  scene.add(w);
  collidables.push(w);
}

// construimos toda la estructura
createHorizontalWall(-salaSize/2);
createHorizontalWall(+salaSize/2, Math.PI);
createVerticalWallWithDoor(-salaSize/2,  Math.PI/2, +2);
createVerticalWallWithDoor(+salaSize/2, -Math.PI/2, -2);
createRoom(- (salaSize/2 + roomW/2));
createRoom(+ (salaSize/2 + roomW/2));

////////////////////////////////////////////////////////////////////////////////
// 5) Jugador & Cama
////////////////////////////////////////////////////////////////////////////////
const player = new THREE.Mesh(
  new THREE.BoxGeometry(1,1,1),
  playerMat.clone()
);
player.position.set(0,0.5,0);
scene.add(player);

// cama en esquina trasera de recámara derecha
const bedX = salaSize/2 + roomW/2 - 1;   // pegada a muro este
const bedZ = -roomD/2 + 1;               // pegada a muro norte
const bed  = new THREE.Mesh(
  new THREE.BoxGeometry(3,1,2),
  bedMat.clone()
);
bed.position.set(bedX, 0.5, bedZ);
scene.add(bed);

// controles con colisiones
const playerControls = new PlayerControls(player, salaSize + roomW, collidables);

////////////////////////////////////////////////////////////////////////////////
// 6) Interactables (rangos independientes)
////////////////////////////////////////////////////////////////////////////////
const backZ    = -salaSize/2 + 0.5;
const sideX    = salaSize/2 - 0.5;
const centerY  = 1;

const salaInteractables = [
  { pos: new THREE.Vector3(-8,   2, backZ),      name:'Ventana',         interactDist:2.5 },
  { pos: new THREE.Vector3(-14,  0.5, -4),       name:'Válvula gas',     interactDist:2.5 },
  { pos: new THREE.Vector3( 8,   2, backZ),      name:'Interruptor luz', interactDist:2.5 },
  { pos: new THREE.Vector3( 0,   4,  0),         name:'Detector humo',   interactDist:5.0 },
  { pos: new THREE.Vector3( sideX, centerY, 5),  name:'Termostato',      interactDist:2.5 },
  { pos: new THREE.Vector3( 2,   centerY, 2),    name:'Radio',           interactDist:2.5 },
  { pos: new THREE.Vector3( sideX, 0.5, -4),     name:'Extintor',        interactDist:2.5 }
];

salaInteractables.forEach(cfg => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2,2,2),
    new THREE.MeshStandardMaterial()
  );
  mesh.position.copy(cfg.pos);
  scene.add(mesh);

  const obj = new Interactable(mesh, cfg.name);
  Math.random()<0.5 ? obj.markSafe() : obj.markUnsafe();
  obj.interactDist = cfg.interactDist;
  interactables.push(obj);
  collidables.push(mesh);
});

const roomOffset = salaSize/2 + roomW/2;
const roomInteractables = [
  { pos: new THREE.Vector3(-roomOffset+1, 1,  2), name:'Llave de agua',  interactDist:2.5 },
  { pos: new THREE.Vector3(-roomOffset+0.1,1.5,-2), name:'Espejo',         interactDist:2.5 },
  { pos: new THREE.Vector3( roomOffset-1, 0.75,0), name:'Ropero',         interactDist:2.5 },
  { pos: new THREE.Vector3( roomOffset-0.2,4,    2), name:'Lámpara',        interactDist:2.5 }
];

roomInteractables.forEach(cfg => {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2,2,2),
    new THREE.MeshStandardMaterial()
  );
  mesh.position.copy(cfg.pos);
  scene.add(mesh);

  const obj = new Interactable(mesh, cfg.name);
  Math.random()<0.5 ? obj.markSafe() : obj.markUnsafe();
  obj.interactDist = cfg.interactDist;
  interactables.push(obj);
  collidables.push(mesh);
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

function updateHUD() {
  let html = '<b>Interactuables:</b><br>';
  interactables.forEach(i => {
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
updateHUD();

////////////////////////////////////////////////////////////////////////////////
// 8) Interact proximity + E
////////////////////////////////////////////////////////////////////////////////
window.addEventListener('keydown', e => {
  if (e.code === 'KeyE') {
    // objetos
    for (const obj of interactables) {
      const d = obj.mesh.position.distanceTo(player.position);
      const r = obj.interactDist ?? 2.0;
      if (d < r) {
        obj.toggleSafe();
        updateHUD();
        return;
      }
    }
    // cama (siempre posible)
    if (bed.position.distanceTo(player.position) < 2.0) {
      if (interactables.every(i => i.isSafe)) {
        alert('Descansando… ¡Has ganado!');
      } else {
        alert('Descansando… ¡Has perdido! Faltan objetos por asegurar.');
      }
    }
  }
});

////////////////////////////////////////////////////////////////////////////////
// 9) Animate
////////////////////////////////////////////////////////////////////////////////
window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth/window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

function animate() {
  requestAnimationFrame(animate);

  playerControls.update();

  // auto abrir/cerrar puertas
  for (const { pivot, closedY, openY, zone } of doors) {
    const coord = player.position[ zone.axis ];
    const other = player.position[ zone.axis==='x'?'z':'x' ];
    const inZone = Math.abs(coord - zone.threshold) < 1
                && other >= zone.min && other <= zone.max;
    pivot.rotation.y = inZone ? openY : closedY;
  }

  controls.update();
  renderer.render(scene, camera);
}
animate();
