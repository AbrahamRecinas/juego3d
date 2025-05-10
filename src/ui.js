// src/ui.js
export function createHUD() {
  const hud = document.createElement('div');
  hud.style = `
    position:absolute; top:10px; right:10px;
    background:rgba(0,0,0,0.6); color:#fff;
    padding:8px; font-family:Arial; z-index:100;
  `;
  document.body.appendChild(hud);
  return hud;
}

export function updateHUD(hud, interactables) {
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
