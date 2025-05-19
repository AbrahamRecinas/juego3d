// src/main.js
import * as THREE                     from 'three';
import { OrbitControls }              from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/controls/OrbitControls.js';
import { FBXLoader }                  from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/loaders/FBXLoader.js';
import { AnimationMixer, LoopRepeat, AnimationClip } from 'three';
import { PlayerControls }             from './controls.js';
import { Interactable }               from './interactables.js';
import { RGBELoader } from 'https://cdn.jsdelivr.net/npm/three@0.150.1/examples/jsm/loaders/RGBELoader.js';


////////////////////////////////////////////////////////////////////////////////
// Globals & Constants
////////////////////////////////////////////////////////////////////////////////

// ─── Declara el loader de texturas ─────────────────────────
const textureLoader = new THREE.TextureLoader();

// Sonido
const interactSound = new Audio('recursos/interact.mp3');
interactSound.volume = 0.5; 
const Win = new Audio('recursos/ganar.mp3');
interactSound.volume = 0.5; 
const Lose = new Audio('recursos/perder.mp3');
interactSound.volume = 0.3; 
const Muerto = new Audio('recursos/muerto.mp3');
interactSound.volume = 0.5; 


const scene         = new THREE.Scene();
scene.fog = new THREE.FogExp2(0xcccccc, 0.015);  // color y densidad

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

// Para interpolar la cámara durante 'rest'
let resting = false;
let restCameraStart = new THREE.Vector3();
let restCameraEnd   = new THREE.Vector3();
let restCameraTime  = 0;
const restCameraDuration = 2.0; // segundos de transición

const keyState = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
const lastPos  = new THREE.Vector3();

const salaSize   = 30, wallHeight = 10;
const roomW      = 15, roomD      = 15, roomH = 6;
const doorWidth  = 4,  doorHeight = 6;
const offsetX    = salaSize/2 + roomW/2;  // Desplazamiento lateral

// Materials
// piso texturado
const floorTexture = textureLoader.load('recursos/floor.jpg');
floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
floorTexture.repeat.set(4, 4);
const floorMat = new THREE.MeshStandardMaterial({ map: floorTexture, aoMap: floorTexture, aoMapIntensity: 0.5 });

// paredes texturadas
const wallTexture = textureLoader.load('recursos/wall.jpg');
wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
wallTexture.repeat.set(2, 1);
const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture, displacementMap: wallTexture, displacementScale: 0.02 });

const roomWallMat  = new THREE.MeshStandardMaterial({
  color: 0xffe990,
  side: THREE.DoubleSide
});
const roomFloorMat = new THREE.MeshStandardMaterial({ color: 0x777777 });
const doorMat      = new THREE.MeshStandardMaterial({ color: 0x553311 });
const bedMat       = new THREE.MeshStandardMaterial({ color: 0x884422 });

////////////////////////////////////////////////////////////////////////////////
// 1) Renderer & Camera
////////////////////////////////////////////////////////////////////////////////
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(
  50,
  window.innerWidth/window.innerHeight,
  0.1,
  200
);
camera.position.set(0, 30, 30);
camera.lookAt(0, 0, 0);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping   = true;
controls.dampingFactor   = 0.05;
controls.enableZoom      = false;
controls.enablePan       = false;
controls.minPolarAngle   = Math.PI/4;
controls.maxPolarAngle   = Math.PI/4;
controls.minAzimuthAngle = -Infinity;
controls.maxAzimuthAngle = +Infinity;
// Bloquear rotación manual
controls.enableRotate = true;

////////////////////////////////////////////////////////////////////////////////
// 1.1) Cámara: zonas y switching
////////////////////////////////////////////////////////////////////////////////
const centers = {
  main: new THREE.Vector3(  0, 0,  0),
  bath: new THREE.Vector3(-offsetX, 0,  0),
  bed:  new THREE.Vector3(+offsetX, 0,  0)
};
const camHeight = 30, camDepth = 30;
const camPositions = {
  main: new THREE.Vector3(   0, camHeight, camDepth),
  bath: new THREE.Vector3(-offsetX, camHeight, camDepth),
  bed:  new THREE.Vector3(+offsetX, camHeight, camDepth)
};
let currentZone = 'main';
function switchCamera(zone) {
  camera.position.copy(camPositions[zone]);
  camera.lookAt(centers[zone]);
  controls.target.copy(centers[zone]);
  controls.update();
}
// Inicializar en zona principal
switchCamera('main');
////////////////////////////////////////////////////////////////////////////////
// Entorno HDR
////////////////////////////////////////////////////////////////////////////////
// 1. Renderer
renderer.setSize(window.innerWidth, window.innerHeight);
// ——— Configuración de renderer para PBR y HDR ———
renderer.physicallyCorrectLights = true;
renderer.toneMapping          = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.3;
renderer.outputEncoding      = THREE.sRGBEncoding;

// ——— PMREMGenerator ———
const pmremGenerator = new THREE.PMREMGenerator(renderer);
pmremGenerator.compileEquirectangularShader();

// ——— Carga y aplica tu archivo .hdr ———
new RGBELoader()
  .setDataType(THREE.HalfFloatType)              // usa HalfFloat para rango dinámico
  .load(
    'recursos/voortrekker_interior_4k.hdr',                // ← AJUSTA esta ruta
    hdrEquirectTexture => {
      // Genera el cubemap optimizado
      const envMap = pmremGenerator.fromEquirectangular(hdrEquirectTexture).texture;
      
      // Asigna como fondo e iluminación
      scene.background  = envMap;
      scene.environment = envMap;
      
      // Limpia
      hdrEquirectTexture.dispose();
      pmremGenerator.dispose();
    },
    undefined,
    err => console.error('Error cargando HDR:', err)
  );


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
    floorMat.clone()
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
createRoom(-offsetX);
createRoom(+offsetX);

////////////////////////////////////////////////////////////////////////////////
// 5) Player & Animations
////////////////////////////////////////////////////////////////////////////////
const fbxLoader = new FBXLoader();
let player = new THREE.Object3D();
player.position.set(0,0.5,0);
scene.add(player);

fbxLoader.load('recursos/maincharacter.fbx', char => {
  char.scale.set(0.03, 0.03, 0.03);
  player.add(char);
  playerMixer = new AnimationMixer(char);

  // idle
  fbxLoader.load('recursos/idle.fbx', idleFbx => {
    idleAction = playerMixer.clipAction(idleFbx.animations[0]);
    idleAction.setLoop(LoopRepeat);
    idleAction.play();
  });

  // walk
  fbxLoader.load('recursos/walk.fbx', walkFbx => {
    const raw = walkFbx.animations[0];
    const walkClip = AnimationClip.parse(AnimationClip.toJSON(raw));
    walkClip.tracks = walkClip.tracks.filter(t => !t.name.endsWith('.position'));
    walkAction = playerMixer.clipAction(walkClip);
    walkAction.setLoop(LoopRepeat);
  });

  // interact
  fbxLoader.load('recursos/interact.fbx', interFbx => {
    interactAction = playerMixer.clipAction(interFbx.animations[0]);
    interactAction.setLoop(THREE.LoopOnce, 1);
    interactAction.clampWhenFinished = true;
  });

  // rest
  fbxLoader.load('recursos/rest.fbx', restFbx => {
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
        Win.currentTime = 0;  // reinicia al inicio
        Win.play();
      } else {
        alert('Descansando… ¡Has perdido! Faltan objetos.');
        Muerto.currentTime = 0;  // reinicia al inicio
        Muerto.play();
      }
    }
  });
});

// 5.4) Cargar modelo FBX de la cama
let bed, bedObj;

fbxLoader.load('recursos/bed.FBX', fb => {
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
  { name:'Ventana',   file:'recursos/window.fbx',    pos:[-8,2,-14],    dist:2.5, scale:0.03,  rotation:[0,0,0] },
  { name:'Puerta',   file:'recursos/door.fbx',    pos:[-1,-0.5,-15],    dist:3, scale:0.03,  rotation:[0,0,0] },
  { name:'Cuchilo',   file:'recursos/Knife.fbx',    pos:[-8,5,9],    dist:10, scale:0.1,  rotation:[0,0,0] },
  { name:'TV',   file:'recursos/TV_fbx.fbx',    pos:[9,0.5,12],    dist:2.5, scale:0.025,  rotation:[0,3.1,0] },
  { name:'Lavabo',   file:'recursos/sink.fbx',    pos:[+offsetX - 50, 3, 0.2],    dist:5, scale:0.025,  rotation:[0,1.6,0] }
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
// 7) HUD + Restart + Controles + Plantilla de nombres
////////////////////////////////////////////////////////////////////////////////

// ——— HUD de interactuables ———
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
// llamada inicial
updateHUD();

// ——— Botón Reiniciar ———
const btn = document.createElement('button');
btn.textContent = 'Reiniciar';
Object.assign(btn.style,{
  position:'absolute',
  bottom:'20px',
  left:'50%',
  transform:'translateX(-50%)',
  padding:'8px 16px',
  cursor:'pointer',
  zIndex:100
});
btn.addEventListener('click', ()=> location.reload());
document.body.appendChild(btn);

// ——— Panel de controles (esquina superior izquierda) ———
const controlsBox = document.createElement('div');
controlsBox.style = `
  position:absolute; top:10px; left:10px;
  background:rgba(0,0,0,0.6); color:#fff;
  padding:8px; font-family:Arial; z-index:100;
`;
controlsBox.innerHTML = `
  WASD Para Moverse<br>
  E Para Interactuar<br>
  Asegura Todos los Objetos Antes De Descansar
`;
document.body.appendChild(controlsBox);

// ——— Plantilla de nombres (esquina inferior izquierda) ———
const nameTemplate = document.createElement('div');
nameTemplate.style = `
  position:absolute; bottom:10px; left:10px;
  width:400px; height:80px;
  border:2px dashed #fff;
  background:rgba(0,0,0,0.6); color:#fff;
  padding:8px; font-family:Arial; z-index:100;
  display:flex; flex-direction:column; justify-content:center;
`;
nameTemplate.innerHTML = `
  <label style="font-weight:bold; margin-bottom:4px;">Nombres:</label>
  <div>— Falcon Recinas Abraham 22200727</div>
  <div>— Rojas Trejo Erick Alejandro 22200978</div>
  <div>— Roberto Olvera Perez 22200965</div>
  <div style="flex:1; border:2px solid #888; border-radius:4px;"></div>
  
`;
document.body.appendChild(nameTemplate);

////////////////////////////////////////////////////////////////////////////////
// 8) Input Handling
////////////////////////////////////////////////////////////////////////////////
window.addEventListener('keydown', e => {
  // bloquea movimiento si interact/rest
  if (currentAction === 'interact' || currentAction === 'rest') {
    e.preventDefault();
    return;
  }
  if (keyState.hasOwnProperty(e.code)) keyState[e.code] = true;

  if (e.code === 'KeyE') {
    // primero props
    for (const obj of interactables) {
      if (player.position.distanceTo(obj.mesh.position) < obj.interactDist) {
        obj.toggleSafe();
        updateHUD();
        if (interactAction) {
          interactSound.currentTime = 0;  // reinicia al inicio
          interactSound.play();
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
          interactSound.currentTime = 0;  // reinicia al inicio
          interactSound.play();

restAction.reset().fadeIn(0.1).play();
currentAction = 'rest';
// Iniciar vuelo de cámara hacia la cama:
resting = true;
restCameraTime = 0;

// Punto de partida = posición actual de la cámara
restCameraStart.copy(camera.position);

// Punto final = cama + offset (arriba y un poco atrás)
restCameraEnd.set(
  bed.position.x,
  bed.position.y + 10,   // 10 unidades por encima
  bed.position.z + 10    // 10 unidades hacia Z+
);

// Asegura que el control apunte al centro de la cama
controls.target.copy(bed.position);
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
// 9) Decor “no-interactuable” con color por defecto si no trae textura
////////////////////////////////////////////////////////////////////////////////
const decorConfigs = [
  { name:'Mesa', file:'recursos/mesa.fbx', position:[-8,0,9], rotation:[0,0,0], scale:0.05, color:0x4A2A00 },
  { name:'Guitar', file:'recursos/guitar.fbx', position:[offsetX + 5,1.5,5], rotation:[0,3,1], scale:0.008, color:0x251101 },
  { name:'Bocina1', file:'recursos/MusicColumn.fbx', position:[6,2,12], rotation:[0,3.1,0], scale:0.006, color:0x000000 },
  { name:'Bocina2', file:'recursos/MusicColumn.fbx', position:[12,2,12], rotation:[0,3.1,0], scale:0.006, color:0x000000 },
  { name:'Sofa', file:'recursos/Couch.fbx', position:[-8,0,-9], rotation:[0,0,0], scale:0.03, color:0x000000 },
  { name:'Mueble', file:'recursos/modern_cabinet_hutch.fbx', position:[9,0,-13], rotation:[0,3.1,0], scale:0.04, color:0x956a46 },
  { name:'Lavadora', file:'recursos/washing_machine.fbx', position:[+offsetX - 45, 3, -6], rotation:[0,6.255,0], scale:0.005, color:0xFFFFFF },
  { name:'Mueble2', file:'recursos/Arverne Hall Tree.fbx', position:[offsetX + 5, 3, -6.5], rotation:[0,-1.56,0], scale:0.035, color:0x83420c }
];

decorConfigs.forEach(cfg => {
  fbxLoader.load(cfg.file, model => {

    // 1) Transformaciones
    model.scale.set(cfg.scale, cfg.scale, cfg.scale);
    model.rotation.set(...cfg.rotation);
    model.position.set(...cfg.position);

    // 2) Recorre las mallas internas
    model.traverse(child => {
      if (!child.isMesh) return;

      // Prepara las opciones del material
      const matOpts = {};
      if (!Array.isArray(child.material) && child.material.map) {
        matOpts.map         = child.material.map;
        matOpts.transparent = child.material.transparent;
        matOpts.opacity     = child.material.opacity;
      } else {
        matOpts.color = cfg.color;
      }

      // Crea el material y fuerza su actualización
      const mat = new THREE.MeshStandardMaterial(matOpts);
      mat.needsUpdate = true;      // ← ¡Muy importante!
      child.material = mat;

      // sombras y colisión
      child.castShadow    = true;
      child.receiveShadow = true;
      child.geometry.computeBoundingBox();
      collidables.push(child);
    });

    // 3) Añade a escena y pre-compila shaders
    scene.add(model);
    renderer.compile(scene, camera);  // ← opcional, pero muy útil
  });
});



// 11) Lluvia
const rainCount = 10000;
const rainGeometry = new THREE.BufferGeometry();
const rainPositions = [];

for (let i = 0; i < rainCount; i++) {
  rainPositions.push(
    (Math.random() - 0.5) * 200,
    Math.random() * 100,
    (Math.random() - 0.5) * 200
  );
}

rainGeometry.setAttribute('position', new THREE.Float32BufferAttribute(rainPositions, 3));

const rainMaterial = new THREE.PointsMaterial({
  color: 0x1300ff,
  size: 0.1,
  transparent: true,
  opacity: 0.6
});

const rain = new THREE.Points(rainGeometry, rainMaterial);
scene.add(rain);

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

  if (resting) {
  restCameraTime += delta;
  const t = Math.min(restCameraTime / restCameraDuration, 1);
  // easing smooth (easeInOut)
  const smoothT = t * t * (3 - 2 * t);

  camera.position.lerpVectors(restCameraStart, restCameraEnd, smoothT);
  camera.lookAt(bed.position.x, bed.position.y, bed.position.z);

  if (t >= 1) resting = false;
}

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

    // cambio de cámara por zona
  let newZone = 'main';
  const x = player.position.x;
  if(x < -offsetX + roomW/2)      newZone = 'bath';
  else if(x >  offsetX - roomW/2) newZone = 'bed';
  if(newZone!==currentZone){
    switchCamera(newZone);
   currentZone = newZone;
  }

  // animar lluvia
  const pos = rainGeometry.attributes.position.array;
  for (let i = 1; i < pos.length; i += 3) {
    pos[i] -= 1; // velocidad de caída
    if (pos[i] < 0) pos[i] = 100;
  }
  rainGeometry.attributes.position.needsUpdate = true;
  renderer.render(scene,camera);
})();