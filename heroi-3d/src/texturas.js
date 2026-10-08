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
  const t = 128;
  const [c, ctx] = canvas(t);
  ctx.fillStyle = '#f4f2ee';
  ctx.fillRect(0, 0, t, t);
  ruido(ctx, t, 14);
  // laje entre andares e frisos
  ctx.fillStyle = '#c9c5bd';
  ctx.fillRect(0, t - 12, t, 12);
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fillRect(0, t - 13, t, 1);
  ctx.fillRect(0, 0, 2, t);
  ctx.fillRect(t - 2, 0, 2, t);
  // moldura
  ctx.fillStyle = '#8d8a85';
  ctx.fillRect(20, 22, 88, 72);
  // vidro refletindo o céu
  const g = ctx.createLinearGradient(0, 26, 0, 90);
  g.addColorStop(0, '#bfe0f5');
  g.addColorStop(0.45, '#6c9cc4');
  g.addColorStop(1, '#2b4a6b');
  ctx.fillStyle = g;
  ctx.fillRect(24, 26, 80, 64);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.moveTo(28, 86); ctx.lineTo(60, 28); ctx.lineTo(74, 28); ctx.lineTo(42, 86); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath(); ctx.moveTo(52, 86); ctx.lineTo(84, 28); ctx.lineTo(90, 28); ctx.lineTo(58, 86); ctx.fill();
  ctx.fillStyle = '#8d8a85';
  ctx.fillRect(62, 26, 4, 64);
  // peitoril
  ctx.fillStyle = '#b5b1aa';
  ctx.fillRect(16, 94, 96, 6);
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
  const t = 256;
  const [c, ctx] = canvas(t);
  ctx.fillStyle = '#69a043';
  ctx.fillRect(0, 0, t, t);
  // manchas suaves (repetem nas bordas para não aparecer a emenda)
  for (let i = 0; i < 40; i++) {
    const x = Math.random() * t, y = Math.random() * t, r = 15 + Math.random() * 40;
    const cor = Math.random() < 0.5 ? 'rgba(120,170,70,0.35)' : 'rgba(70,120,45,0.3)';
    for (const ox of [-t, 0, t]) for (const oy of [-t, 0, t]) {
      const g = ctx.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
      g.addColorStop(0, cor); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x + ox - r, y + oy - r, r * 2, r * 2);
    }
  }
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = Math.random() < 0.5 ? 'rgba(140,190,80,0.5)' : 'rgba(60,100,40,0.5)';
    ctx.fillRect(Math.random() * t, Math.random() * t, 1, 2);
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

// janela com cortina e luz acesa por dentro (variação)
export function texturaJanelaAcesa() {
  const t = 128;
  const [c, ctx] = canvas(t);
  ctx.fillStyle = '#f4f2ee';
  ctx.fillRect(0, 0, t, t);
  ruido(ctx, t, 14);
  ctx.fillStyle = '#c9c5bd';
  ctx.fillRect(0, t - 12, t, 12);
  ctx.fillStyle = 'rgba(0,0,0,0.10)';
  ctx.fillRect(0, t - 13, t, 1);
  ctx.fillRect(0, 0, 2, t);
  ctx.fillRect(t - 2, 0, 2, t);
  ctx.fillStyle = '#8d8a85';
  ctx.fillRect(20, 22, 88, 72);
  const g = ctx.createLinearGradient(0, 26, 0, 90);
  g.addColorStop(0, '#ffe7b0');
  g.addColorStop(1, '#d99a4e');
  ctx.fillStyle = g;
  ctx.fillRect(24, 26, 80, 64);
  // cortinas
  ctx.fillStyle = '#b8473a';
  ctx.fillRect(24, 26, 18, 64);
  ctx.fillRect(86, 26, 18, 64);
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  for (let x = 26; x < 42; x += 5) ctx.fillRect(x, 26, 1, 64);
  for (let x = 88; x < 104; x += 5) ctx.fillRect(x, 26, 1, 64);
  ctx.fillStyle = '#8d8a85';
  ctx.fillRect(62, 26, 4, 64);
  ctx.fillStyle = '#b5b1aa';
  ctx.fillRect(16, 94, 96, 6);
  return finalizar(c);
}

// fachada de vidro espelhado (arranha-céus modernos)
export function texturaVidro() {
  const t = 128;
  const [c, ctx] = canvas(t);
  const g = ctx.createLinearGradient(0, 0, t, t);
  g.addColorStop(0, '#d7ecfa');
  g.addColorStop(0.35, '#8fbde0');
  g.addColorStop(0.7, '#4f86b4');
  g.addColorStop(1, '#2d5b86');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, t, t);
  ctx.fillStyle = 'rgba(255,255,255,0.22)';
  ctx.beginPath(); ctx.moveTo(0, 90); ctx.lineTo(70, 0); ctx.lineTo(100, 0); ctx.lineTo(10, t); ctx.lineTo(0, t); ctx.fill();
  // montantes de alumínio
  ctx.fillStyle = '#c4ccd4';
  ctx.fillRect(0, 0, t, 3);
  ctx.fillRect(0, t - 9, t, 9);
  ctx.fillRect(0, 0, 3, t);
  ctx.fillRect(t / 2 - 1, 0, 3, t);
  ctx.fillStyle = 'rgba(30,50,70,0.35)';
  ctx.fillRect(0, t - 10, t, 1);
  return finalizar(c);
}
