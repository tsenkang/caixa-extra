// Pedaços de prédio caindo.
// Até MAX_FISICA pedaços usam cannon-es (batem entre si e no chão).
// Os outros usam uma física simples (gravidade + chão + topo dos prédios), mais barata.
// No máximo MAX pedaços ao mesmo tempo: os mais antigos são apagados.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { texturaJanela } from './texturas.js';

const MAX = 1500;
const MAX_FISICA = 300;
const GRAVIDADE = 22;

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _w = new THREE.Quaternion();

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

    // malha instanciada
    const mat = new THREE.MeshLambertMaterial({ map: texturaJanela() }); // pedaços com a cara do prédio
    this.malha = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, MAX);
    this.malha.castShadow = true;
    this.malha.receiveShadow = true;
    this.malha.frustumCulled = false;
    this.malha.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    _m.makeScale(0, 0, 0);
    for (let i = 0; i < MAX; i++) { this.malha.setMatrixAt(i, _m); this.malha.setColorAt(i, _c.set(0xffffff)); }
    jogo.cena.add(this.malha);

    // dados de cada pedaço
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
    this.acumulador = 0;
  }

  criar(pos, tam, cor, vel, angVel) {
    const s = this.ponteiro;
    this.ponteiro = (s + 1) % MAX;
    if (this.ativo[s]) this.liberar(s);
    else this.numAtivos++;
    this.ativo[s] = 1;
    this.dormindo[s] = 0;
    this.tempoParado[s] = 0;
    const s3 = s * 3, s4 = s * 4;
    this.pos[s3] = pos.x; this.pos[s3 + 1] = pos.y; this.pos[s3 + 2] = pos.z;
    this.vel[s3] = vel.x; this.vel[s3 + 1] = vel.y; this.vel[s3 + 2] = vel.z;
    this.ang[s3] = angVel.x; this.ang[s3 + 1] = angVel.y; this.ang[s3 + 2] = angVel.z;
    this.tam[s3] = tam.x; this.tam[s3 + 1] = tam.y; this.tam[s3 + 2] = tam.z;
    this.rot[s4] = 0; this.rot[s4 + 1] = 0; this.rot[s4 + 2] = 0; this.rot[s4 + 3] = 1;
    this.malha.setColorAt(s, cor);
    this.malha.instanceColor.needsUpdate = true;

    if (this.numFisica < MAX_FISICA) {
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
      corpo.quaternion.set(0, 0, 0, 1);
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
    this.malha.setMatrixAt(s, _m);
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
    const arr = this.malha.instanceMatrix.array;
    let mudou = false;
    for (let s = 0; s < MAX; s++) {
      if (!this.ativo[s]) continue;
      const s3 = s * 3, s4 = s * 4;
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
          // entulho parado some depois de um tempo (encolhendo)
          this.tempoParado[s] += dt;
          const t = this.tempoParado[s];
          if (t > 35) {
            const k = Math.max(0, 1 - (t - 35));
            if (k <= 0) { this.liberar(s); this.numAtivos--; mudou = true; continue; }
            _p.set(this.pos[s3], this.pos[s3 + 1] - (1 - k) * 0.5, this.pos[s3 + 2]);
            _q.set(this.rot[s4], this.rot[s4 + 1], this.rot[s4 + 2], this.rot[s4 + 3]);
            _s.set(this.tam[s3] * k, this.tam[s3 + 1] * k, this.tam[s3 + 2] * k);
            _m.compose(_p, _q, _s);
            _m.toArray(arr, s * 16);
            mudou = true;
          }
          continue;
        }
        // física simples
        let vx = this.vel[s3], vy = this.vel[s3 + 1] - GRAVIDADE * dt, vz = this.vel[s3 + 2];
        let x = this.pos[s3] + vx * dt, y = this.pos[s3 + 1] + vy * dt, z = this.pos[s3 + 2] + vz * dt;
        _q.set(this.rot[s4], this.rot[s4 + 1], this.rot[s4 + 2], this.rot[s4 + 3]);
        // gira pela velocidade angular
        const ax = this.ang[s3], ay = this.ang[s3 + 1], az = this.ang[s3 + 2];
        _w.set(ax * dt * 0.5, ay * dt * 0.5, az * dt * 0.5, 1);
        _q.premultiply(_w).normalize();
        // meia altura da caixa girada (para assentar no chão)
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
          if (vy < -9 && Math.random() < 0.3) this.jogo.efeitos?.poeira(_p.set(x, y, z), 1, 2, 4);
          vy = -vy * 0.2;
          vx *= 0.55; vz *= 0.55;
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
      _m.toArray(arr, s * 16);
      mudou = true;
    }
    if (mudou) this.malha.instanceMatrix.needsUpdate = true;
  }
}
