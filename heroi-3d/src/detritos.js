// Pedaços de prédio caindo, com material de verdade:
//  - pedaço de fachada (bloco inteiro com a textura do prédio)
//  - concreto (pedra irregular cinza com brita), vidro (cacos transparentes que brilham),
//    tijolos soltos e vergalhões de ferro torcidos.
// Até MAX_FISICA pedaços usam cannon-es (batem entre si e no chão).
// Os outros usam uma física simples (gravidade + chão + topo dos prédios), mais barata.
// No máximo MAX pedaços ao mesmo tempo: os mais antigos são apagados.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { materialMundo } from './modelos.js';
import { texturaEntulho, texturaTijoloSolto } from './texturas.js';

const MAX = 1500;
const MAX_FISICA = 300;
const GRAVIDADE = 22;

// tipos de pedaço (1 a 6 = fachada com a mesma textura dos blocos do prédio)
export const CONCRETO = 7, VIDRO = 8, TIJOLO = 9, FERRO = 10;

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _w = new THREE.Quaternion();
const _e = new THREE.Euler();

// pedra irregular (icosaedro amassado, sem pontas finas)
function geoPedraEntulho() {
  const g = new THREE.IcosahedronGeometry(0.62, 0);
  const pos = g.attributes.position;
  const marcas = new Map();
  for (let i = 0; i < pos.count; i++) {
    const ch = `${pos.getX(i).toFixed(3)},${pos.getY(i).toFixed(3)},${pos.getZ(i).toFixed(3)}`;
    if (!marcas.has(ch)) marcas.set(ch, 0.72 + Math.random() * 0.4);
    const k = marcas.get(ch);
    pos.setXYZ(i, Math.max(-0.5, Math.min(0.5, pos.getX(i) * k)), Math.max(-0.5, Math.min(0.5, pos.getY(i) * k)), Math.max(-0.5, Math.min(0.5, pos.getZ(i) * k)));
  }
  g.computeVertexNormals();
  return g;
}
// caco de vidro: triângulo irregular bem fino
function geoCaco() {
  const s = new THREE.Shape();
  s.moveTo(-0.5, -0.5); s.lineTo(0.5, -0.35); s.lineTo(0.1, 0.5); s.lineTo(-0.2, 0.1);
  const g = new THREE.ExtrudeGeometry(s, { depth: 1, bevelEnabled: false });
  g.translate(0, 0, -0.5);
  return g;
}
// vergalhão torcido (tubo com uma dobra)
function geoVergalhao() {
  const curva = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(0.02, -0.1, 0), new THREE.Vector3(0.12, 0.2, 0.05), new THREE.Vector3(0.35, 0.5, 0.1),
  ]);
  return new THREE.TubeGeometry(curva, 8, 0.5, 5, false);
}

export class SistemaDetritos {
  constructor(jogo) {
    this.jogo = jogo;
    // mundo físico
    const mundo = new CANNON.World({ gravity: new CANNON.Vec3(0, -GRAVIDADE, 0) });
    mundo.broadphase = new CANNON.SAPBroadphase(mundo);
    mundo.allowSleep = true;
    mundo.solver.iterations = 5;
    mundo.defaultContactMaterial.friction = 0.6;
    mundo.defaultContactMaterial.restitution = 0.12;
    const chao = new CANNON.Body({ mass: 0, shape: new CANNON.Plane() });
    chao.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    mundo.addBody(chao);
    this.mundo = mundo;
    this.poolCorpos = [];

    // uma malha instanciada por material (todas com MAX instâncias; cada pedaço usa a do seu tipo)
    const caixa = new THREE.BoxGeometry(1, 1, 1);
    const fachadas = jogo.predios.materiais;
    const vidro = new THREE.MeshStandardMaterial({ color: 0xb8e2f2, emissive: 0x16303c, metalness: 0.3, roughness: 0.03, transparent: true, opacity: 0.78, side: THREE.DoubleSide, envMapIntensity: 1.6, depthWrite: false });
    const defs = [
      null,
      [caixa, fachadas[1]], [caixa, fachadas[2]], [caixa, fachadas[3]], [caixa, fachadas[4]], [caixa, fachadas[5]], [caixa, fachadas[6]],
      [geoPedraEntulho(), materialMundo({ map: texturaEntulho() })],
      [geoCaco(), vidro],
      [caixa, materialMundo({ map: texturaTijoloSolto() })],
      [geoVergalhao(), new THREE.MeshStandardMaterial({ color: 0x6b4a3a, metalness: 0.75, roughness: 0.55 })],
    ];
    _m.makeScale(0, 0, 0);
    this.malhas = defs.map((d, t) => {
      if (!d) return null;
      const malha = new THREE.InstancedMesh(d[0], d[1], MAX);
      malha.castShadow = t !== VIDRO;
      malha.receiveShadow = t !== VIDRO;
      malha.frustumCulled = false;
      malha.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < MAX; i++) { malha.setMatrixAt(i, _m); malha.setColorAt(i, _c.set(0xffffff)); }
      malha.userData.mudou = false;
      if (t === VIDRO) malha.renderOrder = 2;
      jogo.cena.add(malha);
      return malha;
    });

    // dados de cada pedaço
    this.tipo = new Uint8Array(MAX);
    this.ativo = new Uint8Array(MAX);
    this.dormindo = new Uint8Array(MAX);
    this.corpo = new Array(MAX).fill(null);
    this.pos = new Float32Array(MAX * 3);
    this.vel = new Float32Array(MAX * 3);
    this.rot = new Float32Array(MAX * 4);
    this.ang = new Float32Array(MAX * 3);
    this.tam = new Float32Array(MAX * 3);
    this.tempoParado = new Float32Array(MAX);
    this.ponteiro = 0;
    this.numFisica = 0;
    this.numAtivos = 0;
  }

  // tipo: 1-6 fachada, CONCRETO, VIDRO, TIJOLO ou FERRO
  criar(pos, tam, cor, vel, angVel, tipo = 1) {
    const s = this.ponteiro;
    this.ponteiro = (s + 1) % MAX;
    if (this.ativo[s]) this.liberar(s);
    else this.numAtivos++;
    this.ativo[s] = 1;
    this.tipo[s] = tipo;
    this.dormindo[s] = 0;
    this.tempoParado[s] = 0;
    const s3 = s * 3, s4 = s * 4;
    this.pos[s3] = pos.x; this.pos[s3 + 1] = pos.y; this.pos[s3 + 2] = pos.z;
    this.vel[s3] = vel.x; this.vel[s3 + 1] = vel.y; this.vel[s3 + 2] = vel.z;
    this.ang[s3] = angVel.x; this.ang[s3 + 1] = angVel.y; this.ang[s3 + 2] = angVel.z;
    this.tam[s3] = tam.x; this.tam[s3 + 1] = tam.y; this.tam[s3 + 2] = tam.z;
    if (tipo >= CONCRETO) {
      // fragmentos já nascem virados de qualquer jeito
      _q.setFromEuler(_e.set(Math.random() * 6.3, Math.random() * 6.3, Math.random() * 6.3));
      this.rot[s4] = _q.x; this.rot[s4 + 1] = _q.y; this.rot[s4 + 2] = _q.z; this.rot[s4 + 3] = _q.w;
    } else { this.rot[s4] = 0; this.rot[s4 + 1] = 0; this.rot[s4 + 2] = 0; this.rot[s4 + 3] = 1; }
    const malha = this.malhas[tipo];
    malha.setColorAt(s, cor);
    malha.instanceColor.needsUpdate = true;

    // vidro e ferro são finos: usam só a física simples
    if (this.numFisica < MAX_FISICA && tipo !== VIDRO && tipo !== FERRO) {
      const r = Math.min(tam.x, tam.y, tam.z) * 0.5;
      let corpo = this.poolCorpos.pop();
      if (!corpo) {
        corpo = new CANNON.Body({ mass: 1, shape: new CANNON.Sphere(r), linearDamping: 0.05, angularDamping: 0.35, allowSleep: true, sleepSpeedLimit: 0.6, sleepTimeLimit: 0.6 });
      } else {
        corpo.shapes[0].radius = r;
        corpo.shapes[0].updateBoundingSphereRadius();
        corpo.updateBoundingRadius();
      }
      corpo.mass = Math.max(0.5, tam.x * tam.y * tam.z * 0.4);
      corpo.updateMassProperties();
      corpo.position.set(pos.x, pos.y, pos.z);
      corpo.velocity.set(vel.x, vel.y, vel.z);
      corpo.angularVelocity.set(angVel.x, angVel.y, angVel.z);
      corpo.quaternion.set(this.rot[s4], this.rot[s4 + 1], this.rot[s4 + 2], this.rot[s4 + 3]);
      corpo.wakeUp();
      this.mundo.addBody(corpo);
      this.corpo[s] = corpo;
      this.numFisica++;
    }
  }

  // tira o corpo físico (o pedaço continua existindo como "simples")
  tirarCorpo(s) {
    const corpo = this.corpo[s];
    if (!corpo) return;
    this.mundo.removeBody(corpo);
    this.poolCorpos.push(corpo);
    this.corpo[s] = null;
    this.numFisica--;
  }

  liberar(s) {
    this.tirarCorpo(s);
    this.ativo[s] = 0;
    _m.makeScale(0, 0, 0);
    const malha = this.malhas[this.tipo[s]];
    malha.setMatrixAt(s, _m);
    malha.userData.mudou = true;
  }

  // empurra pedaços (explosões, soco)
  empurrar(centro, raio, forca) {
    const r2 = raio * raio;
    for (let s = 0; s < MAX; s++) {
      if (!this.ativo[s]) continue;
      const s3 = s * 3;
      const corpo = this.corpo[s];
      const x = corpo ? corpo.position.x : this.pos[s3];
      const y = corpo ? corpo.position.y : this.pos[s3 + 1];
      const z = corpo ? corpo.position.z : this.pos[s3 + 2];
      const dx = x - centro.x, dy = y - centro.y, dz = z - centro.z;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 > r2) continue;
      const d = Math.sqrt(d2) || 1;
      const f = forca * (1 - d / raio) / d;
      if (corpo) {
        corpo.velocity.x += dx * f; corpo.velocity.y += dy * f + forca * 0.3; corpo.velocity.z += dz * f;
        corpo.wakeUp();
      } else {
        this.vel[s3] += dx * f; this.vel[s3 + 1] += dy * f + forca * 0.3; this.vel[s3 + 2] += dz * f;
        this.ang[s3] = (Math.random() - 0.5) * 6; this.ang[s3 + 2] = (Math.random() - 0.5) * 6;
        this.dormindo[s] = 0;
        this.tempoParado[s] = 0;
      }
    }
  }

  atualizar(dt) {
    // física cannon-es com passo fixo
    if (this.numFisica > 0) this.mundo.step(1 / 60, dt, 2);

    const predios = this.jogo.predios;
    const efeitos = this.jogo.efeitos;
    for (let s = 0; s < MAX; s++) {
      if (!this.ativo[s]) continue;
      const s3 = s * 3, s4 = s * 4;
      const tipo = this.tipo[s];
      const malha = this.malhas[tipo];
      const corpo = this.corpo[s];
      if (corpo) {
        if (corpo.sleepState === CANNON.Body.SLEEPING) {
          // parado há um tempo: vira pedaço simples para liberar a física
          this.tempoParado[s] += dt;
          if (this.tempoParado[s] > 1.5) {
            this.pos[s3] = corpo.position.x; this.pos[s3 + 1] = corpo.position.y; this.pos[s3 + 2] = corpo.position.z;
            this.rot[s4] = corpo.quaternion.x; this.rot[s4 + 1] = corpo.quaternion.y; this.rot[s4 + 2] = corpo.quaternion.z; this.rot[s4 + 3] = corpo.quaternion.w;
            this.vel[s3] = this.vel[s3 + 1] = this.vel[s3 + 2] = 0;
            this.tirarCorpo(s);
            this.dormindo[s] = 1;
            this.tempoParado[s] = 0;
          }
          continue;
        }
        this.tempoParado[s] = 0;
        _p.set(corpo.position.x, corpo.position.y, corpo.position.z);
        _q.set(corpo.quaternion.x, corpo.quaternion.y, corpo.quaternion.z, corpo.quaternion.w);
        if (_p.y < -5) { this.liberar(s); this.numAtivos--; continue; }
      } else {
        if (this.dormindo[s]) {
          // entulho parado some depois de um tempo (encolhendo); cacos de vidro somem antes
          this.tempoParado[s] += dt;
          const t = this.tempoParado[s];
          const vida = tipo === VIDRO ? 14 : 35;
          if (t > vida) {
            const k = Math.max(0, 1 - (t - vida));
            if (k <= 0) { this.liberar(s); this.numAtivos--; continue; }
            _p.set(this.pos[s3], this.pos[s3 + 1] - (1 - k) * 0.5, this.pos[s3 + 2]);
            _q.set(this.rot[s4], this.rot[s4 + 1], this.rot[s4 + 2], this.rot[s4 + 3]);
            _s.set(this.tam[s3] * k, this.tam[s3 + 1] * k, this.tam[s3 + 2] * k);
            _m.compose(_p, _q, _s);
            _m.toArray(malha.instanceMatrix.array, s * 16);
            malha.userData.mudou = true;
          }
          continue;
        }
        // física simples
        let vx = this.vel[s3], vy = this.vel[s3 + 1] - GRAVIDADE * dt, vz = this.vel[s3 + 2];
        if (tipo === VIDRO) { vx *= 1 - dt * 0.8; vz *= 1 - dt * 0.8; vy = Math.max(vy, -30); } // caco plana um pouco no ar
        let x = this.pos[s3] + vx * dt, y = this.pos[s3 + 1] + vy * dt, z = this.pos[s3 + 2] + vz * dt;
        _q.set(this.rot[s4], this.rot[s4 + 1], this.rot[s4 + 2], this.rot[s4 + 3]);
        // gira pela velocidade angular
        const ax = this.ang[s3], ay = this.ang[s3 + 1], az = this.ang[s3 + 2];
        _w.set(ax * dt * 0.5, ay * dt * 0.5, az * dt * 0.5, 1);
        _q.premultiply(_w).normalize();
        // meia altura da peça girada (para assentar no chão)
        _m.makeRotationFromQuaternion(_q);
        const e = _m.elements;
        const meia = 0.5 * (Math.abs(e[1]) * this.tam[s3] + Math.abs(e[5]) * this.tam[s3 + 1] + Math.abs(e[9]) * this.tam[s3 + 2]);
        let piso = 0;
        if (vy < 0) {
          const cel = predios.celulaEm(x, y - meia, z);
          if (cel) piso = cel.topo;
        }
        if (y - meia < piso) {
          y = piso + meia;
          if (tipo === VIDRO) {
            // vidro batendo no chão: brilho e tilintar, quica quase nada
            if (vy < -8 && Math.random() < 0.25) efeitos?.faiscas(_p.set(x, y, z), 3, 4, [0.85, 0.95, 1]);
            if (vy < -8 && Math.random() < 0.04) this.jogo.audio?.vidro?.(_p.set(x, y, z));
            vy = -vy * 0.08; vx *= 0.3; vz *= 0.3;
          } else if (tipo === FERRO) {
            vy = -vy * 0.35; vx *= 0.6; vz *= 0.6; // ferro quica mais
          } else {
            if (vy < -9 && Math.random() < 0.3) efeitos?.poeira(_p.set(x, y, z), 1, 2, 4);
            vy = -vy * 0.2; vx *= 0.55; vz *= 0.55;
          }
          this.ang[s3] *= 0.5; this.ang[s3 + 1] *= 0.5; this.ang[s3 + 2] *= 0.5;
          if (vx * vx + vy * vy + vz * vz < 1.5) { vx = vy = vz = 0; this.dormindo[s] = 1; this.tempoParado[s] = 0; }
        }
        this.pos[s3] = x; this.pos[s3 + 1] = y; this.pos[s3 + 2] = z;
        this.vel[s3] = vx; this.vel[s3 + 1] = vy; this.vel[s3 + 2] = vz;
        this.rot[s4] = _q.x; this.rot[s4 + 1] = _q.y; this.rot[s4 + 2] = _q.z; this.rot[s4 + 3] = _q.w;
        _p.set(x, y, z);
      }
      _s.set(this.tam[s3], this.tam[s3 + 1], this.tam[s3 + 2]);
      _m.compose(_p, _q, _s);
      _m.toArray(malha.instanceMatrix.array, s * 16);
      malha.userData.mudou = true;
    }
    for (const malha of this.malhas) {
      if (malha && malha.userData.mudou) { malha.instanceMatrix.needsUpdate = true; malha.userData.mudou = false; }
    }
  }
}
