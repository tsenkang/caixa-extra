// Modelos simples feitos com formas básicas.
// Cada modelo vira UMA geometria (com cores por vértice) para economizar chamadas de desenho.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// sombreado "de desenho" (toon): 3 faixas de luz
function criarGradiente() {
  const dados = new Uint8Array([90, 90, 90, 255, 175, 175, 175, 255, 255, 255, 255, 255]);
  const t = new THREE.DataTexture(dados, 3, 1, THREE.RGBAFormat);
  t.minFilter = t.magFilter = THREE.NearestFilter;
  t.needsUpdate = true;
  return t;
}
export const gradienteToon = criarGradiente();
export const materialCores = new THREE.MeshToonMaterial({ vertexColors: true, gradientMap: gradienteToon });
export const materialQueimado = new THREE.MeshToonMaterial({ vertexColors: true, color: 0x2a2a2a, gradientMap: gradienteToon });

// contorno preto (casca invertida um pouco maior que o objeto)
const materiaisContorno = new Map();
export function materialContorno(espessura = 0.03) {
  if (!materiaisContorno.has(espessura)) {
    const m = new THREE.MeshBasicMaterial({ color: 0x15121a, side: THREE.BackSide });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>\n transformed += normalize(normal) * ${espessura.toFixed(3)};`);
    };
    m.customProgramCacheKey = () => 'contorno' + espessura;
    materiaisContorno.set(espessura, m);
  }
  return materiaisContorno.get(espessura);
}
// adiciona o contorno em todas as malhas do objeto
export function adicionarContorno(obj, espessura = 0.03) {
  const malhas = [];
  obj.traverse((o) => { if (o.isMesh && !o.userData.contorno) malhas.push(o); });
  for (const m of malhas) {
    const c = new THREE.Mesh(m.geometry, materialContorno(espessura));
    c.userData.contorno = true;
    c.castShadow = false;
    m.add(c);
  }
  return obj;
}

const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3(1, 1, 1);

function parte(geo, cor, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  return { geo, cor, x, y, z, rx, ry, rz };
}
export const caixa = (w, h, d, cor, x, y, z, rx, ry, rz) => parte(new THREE.BoxGeometry(w, h, d), cor, x, y, z, rx, ry, rz);
export const cilindro = (rt, rb, h, cor, x, y, z, rx, ry, rz, seg = 10) =>
  parte(new THREE.CylinderGeometry(rt, rb, h, seg), cor, x, y, z, rx, ry, rz);
export const esfera = (r, cor, x, y, z, seg = 10) => parte(new THREE.SphereGeometry(r, seg, Math.max(6, (seg * 0.7) | 0)), cor, x, y, z);
// esfera achatada/esticada (sx, sy, sz)
export const elipse = (r, sx, sy, sz, cor, x, y, z, rx = 0, ry = 0, rz = 0, seg = 10) =>
  parte(new THREE.SphereGeometry(r, seg, Math.max(6, (seg * 0.7) | 0)).scale(sx, sy, sz), cor, x, y, z, rx, ry, rz);
// membro afunilado entre dois pontos (raio em cima / embaixo)
export function membro(r1, r2, cor, x1, y1, z1, x2, y2, z2, seg = 8) {
  const a = new THREE.Vector3(x1, y1, z1), b = new THREE.Vector3(x2, y2, z2);
  const d = new THREE.Vector3().subVectors(a, b);
  const g = new THREE.CylinderGeometry(r1, r2, d.length(), seg);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize());
  const e = new THREE.Euler().setFromQuaternion(q);
  const m = a.add(b).multiplyScalar(0.5);
  return parte(g, cor, m.x, m.y, m.z, e.x, e.y, e.z);
}

// junta várias partes coloridas em uma geometria só
export function juntar(partes) {
  const geos = [];
  for (const p of partes) {
    _e.set(p.rx || 0, p.ry || 0, p.rz || 0);
    _q.setFromEuler(_e);
    _p.set(p.x || 0, p.y || 0, p.z || 0);
    _m.compose(_p, _q, _s);
    p.geo.applyMatrix4(_m);
    const n = p.geo.attributes.position.count;
    const c = new THREE.Color(p.cor);
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    p.geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    // todas não-indexadas (a extrusão do carro não tem índice)
    geos.push(p.geo.index ? p.geo.toNonIndexed() : p.geo);
  }
  const g = mergeGeometries(geos);
  geos.forEach((x) => x.dispose());
  g.computeBoundingSphere();
  return g;
}

// guarda geometrias já criadas
const cache = new Map();
function emCache(chave, criar) {
  if (!cache.has(chave)) cache.set(chave, criar());
  return cache.get(chave);
}

// ---------- Pessoas ----------
const CORES_CAMISA = [0xe11d48, 0x2563eb, 0x16a34a, 0xf59e0b, 0x9333ea, 0xffffff, 0x0ea5e9, 0xf97316];
const CORES_CALCA = [0x1e3a8a, 0x111827, 0x78350f, 0x374151, 0x4b5563];
const CORES_PELE = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const CORES_CABELO = [0x111111, 0x3b2314, 0x7a4b25, 0xd6b370, 0x555555];

// pessoa com proporções mais realistas (cabeça, pescoço, tronco afunilado, braços e pernas, sapatos)
export function geoPessoa(variacao) {
  const a = variacao % CORES_CAMISA.length;
  const b = (variacao >> 3) % CORES_CALCA.length;
  const c = (variacao >> 5) % CORES_PELE.length;
  const d = (variacao >> 2) % CORES_CABELO.length;
  const mulher = variacao % 2 === 1;
  return emCache(`pessoa${a}-${b}-${c}-${d}-${mulher}`, () => {
    const camisa = CORES_CAMISA[a], calca = CORES_CALCA[b], pele = CORES_PELE[c], cabelo = CORES_CABELO[d];
    const partes = [
      // sapatos
      elipse(0.07, 1, 0.6, 1.8, 0x222222, -0.1, 0.05, 0.04), elipse(0.07, 1, 0.6, 1.8, 0x222222, 0.1, 0.05, 0.04),
      // pernas (coxa + canela)
      membro(0.085, 0.065, calca, -0.1, 0.92, 0, -0.1, 0.48, 0.01), membro(0.065, 0.05, calca, -0.1, 0.48, 0.01, -0.1, 0.08, 0),
      membro(0.085, 0.065, calca, 0.1, 0.92, 0, 0.1, 0.48, 0.01), membro(0.065, 0.05, calca, 0.1, 0.48, 0.01, 0.1, 0.08, 0),
      // quadril e tronco
      elipse(0.2, 1, 0.55, 0.7, calca, 0, 0.94, 0),
      parte(new THREE.CylinderGeometry(0.2, 0.17, 0.52, 10).scale(1, 1, 0.62), camisa, 0, 1.2, 0),
      elipse(0.21, 1, 0.42, 0.65, camisa, 0, 1.44, 0), // ombros
      // braços
      membro(0.055, 0.045, camisa, -0.23, 1.44, 0, -0.27, 1.15, 0.02), membro(0.045, 0.038, pele, -0.27, 1.15, 0.02, -0.28, 0.9, 0.05),
      membro(0.055, 0.045, camisa, 0.23, 1.44, 0, 0.27, 1.15, 0.02), membro(0.045, 0.038, pele, 0.27, 1.15, 0.02, 0.28, 0.9, 0.05),
      esfera(0.045, pele, -0.28, 0.86, 0.05, 6), esfera(0.045, pele, 0.28, 0.86, 0.05, 6),
      // pescoço e cabeça
      membro(0.05, 0.055, pele, 0, 1.58, 0, 0, 1.5, 0),
      elipse(0.115, 0.92, 1.08, 1, pele, 0, 1.69, 0.01, 0, 0, 0, 12),
      elipse(0.02, 1, 1.2, 1, pele, 0, 1.68, 0.12, 0, 0, 0, 6), // nariz
      esfera(0.014, 0x1a1a1a, -0.04, 1.71, 0.1, 6), esfera(0.014, 0x1a1a1a, 0.04, 1.71, 0.1, 6), // olhos
      elipse(0.122, 0.98, 0.75, 1.02, cabelo, 0, 1.75, -0.01, -0.25, 0, 0, 12), // cabelo
    ];
    if (mulher) {
      partes.push(elipse(0.1, 1.1, 1.6, 0.5, cabelo, 0, 1.6, -0.08)); // cabelo comprido
      partes.push(parte(new THREE.CylinderGeometry(0.17, 0.26, 0.4, 10).scale(1, 1, 0.75), calca, 0, 0.8, 0)); // saia
    }
    return juntar(partes);
  });
}

export function geoSoldado() {
  return emCache('soldado', () => {
    const farda = 0x4d5d33, escuro = 0x2f3a20, pele = 0xe0ac69;
    return juntar([
      elipse(0.08, 1, 0.7, 1.7, 0x15140f, -0.1, 0.06, 0.04), elipse(0.08, 1, 0.7, 1.7, 0x15140f, 0.1, 0.06, 0.04),
      membro(0.09, 0.07, farda, -0.11, 0.92, 0, -0.11, 0.48, 0.02), membro(0.07, 0.06, farda, -0.11, 0.48, 0.02, -0.1, 0.1, 0),
      membro(0.09, 0.07, farda, 0.11, 0.92, 0, 0.11, 0.48, 0.02), membro(0.07, 0.06, farda, 0.11, 0.48, 0.02, 0.1, 0.1, 0),
      elipse(0.21, 1, 0.55, 0.72, farda, 0, 0.95, 0),
      parte(new THREE.CylinderGeometry(0.22, 0.19, 0.52, 10).scale(1, 1, 0.68), farda, 0, 1.21, 0),
      parte(new THREE.BoxGeometry(0.42, 0.38, 0.32), escuro, 0, 1.24, 0.01), // colete
      parte(new THREE.BoxGeometry(0.3, 0.36, 0.14), 0x3b4529, 0, 1.25, -0.2), // mochila
      elipse(0.22, 1, 0.42, 0.68, farda, 0, 1.45, 0),
      // braços segurando o fuzil
      membro(0.06, 0.05, farda, -0.24, 1.44, 0, -0.2, 1.2, 0.18), membro(0.05, 0.045, farda, -0.2, 1.2, 0.18, -0.05, 1.25, 0.38),
      membro(0.06, 0.05, farda, 0.24, 1.44, 0, 0.22, 1.18, 0.12), membro(0.05, 0.045, farda, 0.22, 1.18, 0.12, 0.1, 1.22, 0.28),
      membro(0.05, 0.055, pele, 0, 1.58, 0, 0, 1.5, 0),
      elipse(0.115, 0.92, 1.05, 1, pele, 0, 1.68, 0.01, 0, 0, 0, 12),
      esfera(0.014, 0x1a1a1a, -0.04, 1.7, 0.1, 6), esfera(0.014, 0x1a1a1a, 0.04, 1.7, 0.1, 6),
      elipse(0.15, 1, 0.72, 1.08, escuro, 0, 1.76, 0, 0, 0, 0, 12), // capacete
      parte(new THREE.BoxGeometry(0.06, 0.09, 0.85), 0x111111, 0.04, 1.24, 0.42), // fuzil
      parte(new THREE.BoxGeometry(0.05, 0.16, 0.08), 0x111111, 0.04, 1.14, 0.3),
    ]);
  });
}

// ---------- Veículos (frente = +z) ----------
// carro: perfil lateral (capô, para-brisa, teto, porta-malas) extrudado na largura
export function geoCarro(cor) {
  return emCache(`carro${cor}`, () => {
    const perfil = new THREE.Shape();
    const pts = [[-2.15, 0.35], [-2.2, 0.85], [-1.6, 0.95], [-1.1, 1.55], [0.55, 1.58], [1.2, 1.0], [2.1, 0.88], [2.2, 0.35]];
    perfil.moveTo(pts[0][0], pts[0][1]);
    for (const [z, y] of pts.slice(1)) perfil.lineTo(z, y);
    const larg = 1.8;
    const corpo = new THREE.ExtrudeGeometry(perfil, { depth: larg, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 1 });
    // extrusão sai no plano XY e cresce em Z: gira para o perfil ficar em ZY e a largura em X
    corpo.rotateY(-Math.PI / 2);
    corpo.translate(larg / 2, 0, 0);
    const vidros = new THREE.Shape();
    vidros.moveTo(-1.45, 1.0); vidros.lineTo(-1.02, 1.5); vidros.lineTo(0.5, 1.52); vidros.lineTo(1.05, 1.02);
    const janela = new THREE.ExtrudeGeometry(vidros, { depth: larg + 0.16, bevelEnabled: false });
    janela.rotateY(-Math.PI / 2);
    janela.translate((larg + 0.16) / 2, 0, 0);
    const partes = [
      parte(corpo, cor),
      parte(janela, 0x22344a),
      caixa(1.9, 0.18, 0.25, 0x2a2a2a, 0, 0.42, 2.2), caixa(1.9, 0.18, 0.25, 0x2a2a2a, 0, 0.42, -2.2), // para-choques
      caixa(0.42, 0.14, 0.06, 0xfff4c8, -0.6, 0.78, 2.24), caixa(0.42, 0.14, 0.06, 0xfff4c8, 0.6, 0.78, 2.24),
      caixa(0.42, 0.12, 0.06, 0xd01818, -0.6, 0.78, -2.24), caixa(0.42, 0.12, 0.06, 0xd01818, 0.6, 0.78, -2.24),
      caixa(0.6, 0.12, 0.05, 0x1a1a1a, 0, 0.6, 2.24), // grade
    ];
    for (const sx of [-0.92, 0.92]) for (const sz of [-1.35, 1.4]) {
      partes.push(cilindro(0.36, 0.36, 0.26, 0x151515, sx, 0.36, sz, 0, 0, Math.PI / 2, 14));
      partes.push(cilindro(0.2, 0.2, 0.28, 0xc0c4c8, sx, 0.36, sz, 0, 0, Math.PI / 2, 10)); // calota
    }
    return juntar(partes);
  });
}

export function geoJipe() {
  return emCache('jipe', () => {
    const v = 0x4b5a2a;
    const partes = [
      caixa(2.1, 0.8, 4.0, v, 0, 0.9, 0),
      caixa(2.0, 0.6, 0.12, 0x222222, 0, 1.6, 0.7),
      caixa(0.1, 0.9, 0.1, 0x222222, -0.95, 1.75, -1.2),
      caixa(0.1, 0.9, 0.1, 0x222222, 0.95, 1.75, -1.2),
      caixa(2.0, 0.08, 0.1, 0x222222, 0, 2.2, -1.2),
      cilindro(0.45, 0.45, 0.3, 0x111111, 0, 1.0, -2.15, Math.PI / 2, 0, 0),
      caixa(1.6, 0.1, 1.6, 0x333a20, 0, 1.32, -0.6),
    ];
    for (const sx of [-1.05, 1.05]) for (const sz of [-1.3, 1.3])
      partes.push(cilindro(0.48, 0.48, 0.4, 0x111111, sx, 0.48, sz, 0, 0, Math.PI / 2));
    return juntar(partes);
  });
}

export function geoTanqueCasco() {
  return emCache('tanqueCasco', () => juntar([
    caixa(3.2, 1.1, 6.0, 0x4b5320, 0, 1.0, 0),
    caixa(3.0, 0.4, 1.0, 0x434a1c, 0, 1.2, 3.1, 0.5),
    caixa(0.8, 1.1, 6.6, 0x1c1c1c, -1.9, 0.6, 0),
    caixa(0.8, 1.1, 6.6, 0x1c1c1c, 1.9, 0.6, 0),
  ]));
}
export function geoTanqueTorre() {
  return emCache('tanqueTorre', () => juntar([
    caixa(2.3, 0.9, 2.8, 0x56602a, 0, 0.45, -0.2),
    cilindro(0.17, 0.2, 4.2, 0x333a18, 0, 0.5, 2.9, Math.PI / 2, 0, 0, 8),
    cilindro(0.3, 0.3, 0.4, 0x2a2f14, 0.6, 1.05, -0.6),
  ]));
}

export function geoHelicoptero() {
  return emCache('heli', () => juntar([
    caixa(2.0, 1.9, 4.4, 0x3b4a30, 0, 0, 0),
    esfera(1.05, 0x2a3f4f, 0, -0.1, 2.0, 10),
    cilindro(0.18, 0.35, 5.5, 0x3b4a30, 0, 0.3, -4.8, Math.PI / 2, 0, 0, 8),
    caixa(0.15, 1.4, 1.0, 0x3b4a30, 0, 0.9, -7.3),
    caixa(1.8, 0.12, 0.6, 0x3b4a30, 0, 0.3, -7.2),
    caixa(0.12, 0.12, 3.8, 0x222222, -0.9, -1.4, 0),
    caixa(0.12, 0.12, 3.8, 0x222222, 0.9, -1.4, 0),
    caixa(0.1, 0.6, 0.1, 0x222222, -0.9, -1.1, 1),
    caixa(0.1, 0.6, 0.1, 0x222222, 0.9, -1.1, 1),
    caixa(0.1, 0.6, 0.1, 0x222222, -0.9, -1.1, -1),
    caixa(0.1, 0.6, 0.1, 0x222222, 0.9, -1.1, -1),
    caixa(0.5, 0.3, 1.4, 0x222222, -1.2, -0.3, 0.6),
    caixa(0.5, 0.3, 1.4, 0x222222, 1.2, -0.3, 0.6),
  ]));
}
export function geoHeliceHeli() {
  return emCache('helice', () => juntar([
    caixa(12, 0.06, 0.4, 0x151515, 0, 0, 0),
    caixa(0.4, 0.06, 12, 0x151515, 0, 0, 0),
    cilindro(0.2, 0.2, 0.5, 0x151515, 0, -0.25, 0),
  ]));
}

// bomba de combustível do posto
export function geoBomba() {
  return emCache('bomba', () => juntar([
    caixa(0.9, 1.8, 0.6, 0xdc2626, 0, 0.9, 0),
    caixa(0.7, 0.5, 0.05, 0xffffff, 0, 1.3, 0.31),
    caixa(1.2, 0.2, 0.9, 0x666666, 0, 0.1, 0),
  ]));
}

// pedra gigante (arremessada pelo Colosso)
export function geoPedra() {
  return emCache('pedra', () => juntar([esfera(1.4, 0x7c6f64, 0, 0, 0, 7), caixa(1.6, 1.4, 1.5, 0x6b5f55, 0.3, 0.2, 0, 0.5, 0.4, 0)]));
}
