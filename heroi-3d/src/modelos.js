// Modelos simples feitos com formas básicas.
// Cada modelo vira UMA geometria (com cores por vértice) para economizar chamadas de desenho.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const materialCores = new THREE.MeshLambertMaterial({ vertexColors: true });
export const materialQueimado = new THREE.MeshLambertMaterial({ vertexColors: true, color: 0x2a2a2a });

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
    geos.push(p.geo);
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

export function geoPessoa(variacao) {
  const a = variacao % CORES_CAMISA.length;
  const b = variacao % CORES_CALCA.length;
  const c = variacao % CORES_PELE.length;
  const d = variacao % CORES_CABELO.length;
  return emCache(`pessoa${a}-${b}-${c}-${d}`, () => juntar([
    caixa(0.18, 0.85, 0.2, CORES_CALCA[b], -0.11, 0.425, 0),
    caixa(0.18, 0.85, 0.2, CORES_CALCA[b], 0.11, 0.425, 0),
    caixa(0.46, 0.6, 0.26, CORES_CAMISA[a], 0, 1.15, 0),
    caixa(0.12, 0.6, 0.14, CORES_CAMISA[a], -0.3, 1.12, 0),
    caixa(0.12, 0.6, 0.14, CORES_CAMISA[a], 0.3, 1.12, 0),
    esfera(0.15, CORES_PELE[c], 0, 1.62, 0, 8),
    caixa(0.3, 0.1, 0.3, CORES_CABELO[d], 0, 1.75, -0.01),
  ]));
}

export function geoSoldado() {
  return emCache('soldado', () => juntar([
    caixa(0.2, 0.85, 0.22, 0x3f4f2a, -0.11, 0.425, 0),
    caixa(0.2, 0.85, 0.22, 0x3f4f2a, 0.11, 0.425, 0),
    caixa(0.1, 0.12, 0.3, 0x111111, -0.11, 0.06, 0.04),
    caixa(0.1, 0.12, 0.3, 0x111111, 0.11, 0.06, 0.04),
    caixa(0.5, 0.62, 0.3, 0x4d5d33, 0, 1.15, 0),
    caixa(0.52, 0.3, 0.32, 0x2f3a20, 0, 1.25, 0),
    caixa(0.12, 0.55, 0.14, 0x4d5d33, -0.31, 1.15, 0.12, -0.9),
    caixa(0.12, 0.55, 0.14, 0x4d5d33, 0.31, 1.15, 0.12, -0.9),
    esfera(0.15, 0xe0ac69, 0, 1.62, 0, 8),
    esfera(0.19, 0x2f3a20, 0, 1.7, 0, 8),
    caixa(0.08, 0.1, 0.9, 0x111111, 0.12, 1.22, 0.45),
  ]));
}

// ---------- Veículos (frente = +z) ----------
export function geoCarro(cor) {
  return emCache(`carro${cor}`, () => {
    const partes = [
      caixa(1.9, 0.7, 4.2, cor, 0, 0.65, 0),
      caixa(1.7, 0.62, 2.2, 0x1f2d3d, 0, 1.3, -0.2),
      caixa(1.74, 0.08, 2.0, cor, 0, 1.64, -0.2),
      caixa(0.4, 0.15, 0.05, 0xffffcc, -0.6, 0.78, 2.11),
      caixa(0.4, 0.15, 0.05, 0xffffcc, 0.6, 0.78, 2.11),
      caixa(0.4, 0.15, 0.05, 0xcc1111, -0.6, 0.78, -2.11),
      caixa(0.4, 0.15, 0.05, 0xcc1111, 0.6, 0.78, -2.11),
    ];
    for (const sx of [-0.95, 0.95]) for (const sz of [-1.35, 1.35])
      partes.push(cilindro(0.38, 0.38, 0.3, 0x111111, sx, 0.38, sz, 0, 0, Math.PI / 2));
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
