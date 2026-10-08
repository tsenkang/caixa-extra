// Texturas geradas no código (sem arquivos externos)
import * as THREE from 'three';

function canvas(t) {
  const c = document.createElement('canvas');
  c.width = c.height = t;
  return [c, c.getContext('2d')];
}

// ruído leve para parecer concreto
function ruido(ctx, t, forca) {
  const img = ctx.getImageData(0, 0, t, t);
  for (let i = 0; i < img.data.length; i += 4) {
    const n = (Math.random() - 0.5) * forca;
    img.data[i] += n; img.data[i + 1] += n; img.data[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function finalizar(c) {
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// uma face de bloco com uma janela (o bloco tem 1 andar)
export function texturaJanela() {
  const t = 64;
  const [c, ctx] = canvas(t);
  ctx.fillStyle = '#f2f2f2';
  ctx.fillRect(0, 0, t, t);
  ruido(ctx, t, 18);
  ctx.fillStyle = '#d0d0d0';
  ctx.fillRect(0, t - 6, t, 6); // laje
  // vidro
  const g = ctx.createLinearGradient(0, 14, 0, 46);
  g.addColorStop(0, '#5d7ea8');
  g.addColorStop(1, '#22344d');
  ctx.fillStyle = g;
  ctx.fillRect(12, 14, 40, 32);
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.beginPath(); ctx.moveTo(14, 44); ctx.lineTo(30, 16); ctx.lineTo(36, 16); ctx.lineTo(20, 44); ctx.fill();
  ctx.fillStyle = '#9a9a9a';
  ctx.fillRect(31, 14, 2, 32);
  ctx.fillRect(10, 46, 44, 3);
  return finalizar(c);
}

export function texturaConcreto() {
  const t = 64;
  const [c, ctx] = canvas(t);
  ctx.fillStyle = '#e6e6e6';
  ctx.fillRect(0, 0, t, t);
  ruido(ctx, t, 40);
  ctx.strokeStyle = 'rgba(0,0,0,0.12)';
  ctx.strokeRect(0.5, 0.5, t - 1, t - 1);
  return finalizar(c);
}

// asfalto com faixa tracejada no meio (repetida ao longo da rua)
export function texturaRua() {
  const t = 128;
  const [c, ctx] = canvas(t);
  ctx.fillStyle = '#3a3c40';
  ctx.fillRect(0, 0, t, t);
  ruido(ctx, t, 16);
  ctx.fillStyle = '#e8e2c8';
  ctx.fillRect(t / 2 - 2, 0, 4, t / 2);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(4, 0, 3, t);
  ctx.fillRect(t - 7, 0, 3, t);
  const tex = finalizar(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function texturaGrama() {
  const t = 128;
  const [c, ctx] = canvas(t);
  ctx.fillStyle = '#5c8f3a';
  ctx.fillRect(0, 0, t, t);
  for (let i = 0; i < 900; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? '#6ea446' : '#4e7c31';
    ctx.fillRect(Math.random() * t, Math.random() * t, 2, 2);
  }
  const tex = finalizar(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export function texturaCalcada() {
  const t = 64;
  const [c, ctx] = canvas(t);
  ctx.fillStyle = '#b9b4aa';
  ctx.fillRect(0, 0, t, t);
  ruido(ctx, t, 20);
  ctx.strokeStyle = 'rgba(0,0,0,0.18)';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, t, t);
  const tex = finalizar(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
