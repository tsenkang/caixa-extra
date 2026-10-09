// Inimigos: soldados, jipes, tanques, helicópteros e heróis inimigos. Também os tiros e mísseis.
import * as THREE from 'three';
import { Entidade, Veiculo, NOS, NOS_PONTA, anguloLerp } from './entidades.js';
import { materialCores, geoSoldado, geoJipe, geoTanqueCasco, geoTanqueTorre, geoTanqueCano, geoHelicoptero, geoHeliceHeli, geoHeliceCauda, geoPedra, materialMundo } from './modelos.js';
import { criarHumanoide, animarHumanoide } from './heroi.js';
import { Raio } from './efeitos.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _c = new THREE.Vector3();
const _h = new THREE.Vector3();
const _q = new THREE.Quaternion();
const CIMA = new THREE.Vector3(0, 1, 0);

// distância de um ponto até um segmento
function distSegmento(p, a, b) {
  _d.subVectors(b, a);
  const l2 = _d.lengthSq() || 1;
  const t = Math.max(0, Math.min(1, _v.subVectors(p, a).dot(_d) / l2));
  return _v.copy(a).addScaledVector(_d, t).distanceTo(p);
}

// tem linha de visão (sem prédio no meio)?
function enxerga(jogo, de, ate) {
  _d.subVectors(ate, de);
  const dist = _d.length();
  _d.divideScalar(dist);
  return !jogo.predios.raycast(de, _d, dist - 1);
}

// ---------- tiros, mísseis e pedras ----------
export class Projeteis {
  constructor(jogo) {
    this.jogo = jogo;
    this.balas = [];
    this.maxBalas = 300;
    this.posLinhas = new Float32Array(this.maxBalas * 6);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.posLinhas, 3).setUsage(THREE.DynamicDrawUsage));
    this.linhas = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xffe08a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.linhas.frustumCulled = false;
    jogo.cena.add(this.linhas);

    this.misseis = [];
    this.geoMissil = new THREE.CylinderGeometry(0.15, 0.15, 1.6, 8);
    this.matMissil = materialMundo({ color: 0xd4d4d4, emissive: 0x331100 });
    this.matPedra = materialCores;
  }

  bala(origem, alvo, velocidade, dano) {
    if (this.balas.length >= this.maxBalas) return;
    const vel = new THREE.Vector3().subVectors(alvo, origem).normalize().multiplyScalar(velocidade);
    this.balas.push({ pos: origem.clone(), vel, dano, vida: 0 });
    this.jogo.audio?.tiro(origem);
  }

  // op: { vel, teleguiado, raio, dano, pedra }
  missil(origem, dir, op) {
    const mesh = new THREE.Mesh(op.pedra ? geoPedra() : this.geoMissil, op.pedra ? this.matPedra : this.matMissil);
    mesh.castShadow = true;
    mesh.position.copy(origem);
    this.jogo.cena.add(mesh);
    // atenção: op.vel é um número (velocidade); o vetor vel vem depois para não ser sobrescrito
    this.misseis.push({ ...op, mesh, pos: mesh.position, vel: dir.clone().multiplyScalar(op.vel), vida: 0 });
    if (!op.pedra) this.jogo.audio?.missil(origem);
  }

  explodir(m) {
    this.jogo.cena.remove(m.mesh);
    m.morto = true;
    this.jogo.explosao(m.pos, m.raio, m.dano, 'inimigo');
  }

  atualizar(dt) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    heroi.centro(_h);
    const preso = heroi.segurando;

    // balas
    let n = 0;
    for (let i = this.balas.length - 1; i >= 0; i--) {
      const b = this.balas[i];
      _c.copy(b.pos);
      b.pos.addScaledVector(b.vel, dt);
      b.vida += dt;
      let some = b.vida > 1.6 || b.pos.y < 0;
      if (!some && !heroi.morto && distSegmento(_h, _c, b.pos) < 0.9) { heroi.levarDano(b.dano); some = true; jogo.efeitos.faiscas(b.pos, 3, 6); }
      if (!some && preso && distSegmento(preso.centro(_v.clone()), _c, b.pos) < preso.raio) { preso.levarDano(b.dano, 'inimigo'); some = true; }
      if (!some && jogo.predios.solido(b.pos.x, b.pos.y, b.pos.z)) { some = true; jogo.efeitos.faiscas(b.pos, 2, 5); }
      if (some) { this.balas.splice(i, 1); continue; }
    }
    for (const b of this.balas) {
      const o = n * 6;
      this.posLinhas[o] = b.pos.x; this.posLinhas[o + 1] = b.pos.y; this.posLinhas[o + 2] = b.pos.z;
      _d.copy(b.vel).normalize();
      this.posLinhas[o + 3] = b.pos.x - _d.x * 3; this.posLinhas[o + 4] = b.pos.y - _d.y * 3; this.posLinhas[o + 5] = b.pos.z - _d.z * 3;
      n++;
    }
    this.linhas.geometry.setDrawRange(0, n * 2);
    this.linhas.geometry.attributes.position.needsUpdate = true;

    // mísseis e pedras
    for (let i = this.misseis.length - 1; i >= 0; i--) {
      const m = this.misseis[i];
      m.vida += dt;
      if (m.pedra) m.vel.y -= 20 * dt;
      else if (m.teleguiado) {
        const vel = m.vel.length();
        _d.subVectors(_h, m.pos).normalize().multiplyScalar(vel);
        m.vel.lerp(_d, Math.min(1, m.teleguiado * dt)).setLength(vel);
      }
      m.pos.addScaledVector(m.vel, dt);
      if (m.pedra) { m.mesh.rotation.x += dt * 4; m.mesh.rotation.z += dt * 3; }
      else {
        m.mesh.quaternion.setFromUnitVectors(CIMA, _d.copy(m.vel).normalize());
        if (Math.random() < 0.8) jogo.efeitos.fumaca(m.pos, 1, 1.2, 0.55);
        jogo.efeitos.fogo(m.pos, 1, 0.2, 1);
      }
      let bateu = m.vida > 7 || m.pos.y < 0.3;
      if (!bateu && !heroi.morto && m.pos.distanceTo(_h) < (m.pedra ? 2.5 : 1.8)) bateu = true;
      if (!bateu && preso && preso.centro(_v).distanceTo(m.pos) < preso.raio + 1) bateu = true;
      if (!bateu && jogo.predios.solido(m.pos.x, m.pos.y, m.pos.z)) bateu = true;
      if (bateu) { this.explodir(m); this.misseis.splice(i, 1); }
    }
  }
}

// ---------- soldado ----------
export class Soldado extends Entidade {
  constructor(jogo, pos) {
    super(jogo, new THREE.Mesh(geoSoldado(), materialCores), { tipo: 'soldado', raio: 0.5, altura: 1.8, vida: 20, massa: 1, inimigo: true });
    this.pos.copy(pos);
    this.tiro = 1 + Math.random() * 2;
    this.lado = Math.random() < 0.5 ? 1 : -1;
    this.distPreferida = 35 + Math.random() * 30;
    this.fase = Math.random() * 10;
  }

  ia(dt) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    heroi.centro(_h);
    const dx = _h.x - this.pos.x, dz = _h.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    let mx = 0, mz = 0;
    if (dist > this.distPreferida + 10) { mx = dx / dist; mz = dz / dist; }
    else if (dist < 20) { mx = -dx / dist; mz = -dz / dist; }
    else { mx = (-dz / dist) * this.lado * 0.4; mz = (dx / dist) * this.lado * 0.4; }
    if (mx || mz) {
      if (jogo.predios.solido(this.pos.x + mx * 1.5, 1, this.pos.z + mz * 1.5)) { const t = mx; mx = -mz * this.lado; mz = t * this.lado; }
      this.pos.x += mx * 4 * dt;
      this.pos.z += mz * 4 * dt;
    }
    this.fase += dt;
    this.pos.y = 0.2 + (mx || mz ? Math.abs(Math.sin(this.fase * 9)) * 0.06 : 0);
    this.obj.rotation.y = anguloLerp(this.obj.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 8));

    this.tiro -= dt;
    if (this.tiro <= 0 && !heroi.morto) {
      this.tiro = 0.8 + Math.random() * 1.0;
      const d3 = this.pos.distanceTo(_h);
      if (d3 < 120) {
        _c.copy(this.pos).y += 1.3;
        if (enxerga(jogo, _c, _h)) {
          const erro = 1 + d3 * 0.03;
          _v.set(_h.x + (Math.random() - 0.5) * erro, _h.y + (Math.random() - 0.5) * erro, _h.z + (Math.random() - 0.5) * erro);
          jogo.projeteis.bala(_c, _v, 130, 3);
          jogo.efeitos.brilho(_c, 0.8, 1, 0.8, 0.3);
        } else this.lado = -this.lado;
      }
    }
  }

  morrer() {
    this.iniciarMorte();
    this.jogo.aoInimigoDerrotado(this);
  }
  aoAterrissarMorto() { this.alvoDeitado = null; this.chaoMorto = 0.14; }
  morto(dt) { this.corpoCaido(dt); }
}

// ---------- veículos militares (andam pelas ruas até o herói) ----------
class VeiculoMilitar extends Veiculo {
  escolherProximo(no, anterior) {
    const h = this.jogo.heroi.pos;
    let melhor = anterior, d = Infinity;
    for (const v of NOS[no].viz) {
      if (v === anterior && NOS[no].viz.length > 1) continue;
      const dd = Math.hypot(NOS[v].x - h.x, NOS[v].z - h.z);
      if (dd < d) { d = dd; melhor = v; }
    }
    return melhor;
  }
  distHeroi() { const h = this.jogo.heroi.pos; return Math.hypot(h.x - this.pos.x, h.z - this.pos.z); }
  morrer(origem) {
    if (this.estado === 'morto') return;
    super.morrer(origem);
    this.jogo.aoInimigoDerrotado(this);
  }
}

export class Jipe extends VeiculoMilitar {
  constructor(jogo, de) {
    super(jogo, new THREE.Mesh(geoJipe(), materialCores), { tipo: 'jipe', raio: 2.2, altura: 1.8, vida: 90, massa: 3, inimigo: true, de, velocidade: 20 });
    this.descarregou = false;
  }
  ia(dt) {
    const perto = this.distHeroi() < 55;
    const alvo = perto ? 0 : this.velocidade;
    this.velAtual += (alvo - this.velAtual) * Math.min(1, dt * 2);
    this.dirigir(dt, this.velAtual);
    escapamento(this, 2.4, 0.8);
    if (perto && !this.descarregou && this.velAtual < 2) {
      this.descarregou = true;
      const a = this.obj.rotation.y;
      for (let i = 0; i < 3; i++) {
        _v.set(this.pos.x + Math.cos(a) * (2 + i), 0.2, this.pos.z - Math.sin(a) * (2 + i));
        this.jogo.entidades.push(new Soldado(this.jogo, _v));
      }
    }
  }
}

export class Tanque extends VeiculoMilitar {
  constructor(jogo, de) {
    const grupo = new THREE.Group();
    grupo.add(new THREE.Mesh(geoTanqueCasco(), materialCores));
    const torre = new THREE.Group();
    torre.position.y = 1.6;
    torre.add(new THREE.Mesh(geoTanqueTorre(), materialCores));
    const cano = new THREE.Mesh(geoTanqueCano(), materialCores);
    cano.position.set(0, 0.45, 1.5);
    torre.add(cano);
    grupo.add(torre);
    super(jogo, grupo, { tipo: 'tanque', raio: 3.4, altura: 2.6, vida: 320, massa: 8, inimigo: true, de, velocidade: 8 });
    this.torre = torre;
    this.cano = cano;
    this.recuo = 0;
    this.tiro = 3;
  }
  ia(dt) {
    const jogo = this.jogo;
    const dist = this.distHeroi();
    const alvo = dist < 75 ? 0 : this.velocidade;
    this.velAtual += (alvo - this.velAtual) * Math.min(1, dt * 2);
    this.dirigir(dt, this.velAtual);
    // torre mira no herói
    jogo.heroi.centro(_h);
    const ang = Math.atan2(_h.x - this.pos.x, _h.z - this.pos.z) - this.obj.rotation.y;
    this.torre.rotation.y = anguloLerp(this.torre.rotation.y, ang, Math.min(1, dt * 2));
    // cano sobe/desce mirando e recua depois do tiro
    const elev = Math.max(-0.45, Math.min(0.08, -Math.atan2(_h.y - this.pos.y - 2.1, Math.max(1, dist))));
    this.cano.rotation.x += (elev - this.cano.rotation.x) * Math.min(1, dt * 3);
    this.recuo = Math.max(0, this.recuo - dt * 2.5);
    this.cano.position.z = 1.5 - this.recuo * 0.9;
    escapamento(this, 3.4, 1.4);
    this.tiro -= dt;
    if (this.tiro <= 0 && dist < 160 && !jogo.heroi.morto) {
      this.tiro = 3.5 + Math.random() * 1.5;
      const a = this.obj.rotation.y + this.torre.rotation.y;
      _c.set(this.pos.x + Math.sin(a) * 6.2, this.pos.y + 2.05, this.pos.z + Math.cos(a) * 6.2);
      if (enxerga(jogo, _c, _h)) {
        _d.set(_h.x + (Math.random() - 0.5) * 3, _h.y + (Math.random() - 0.5) * 2, _h.z + (Math.random() - 0.5) * 3).sub(_c).normalize();
        jogo.projeteis.missil(_c, _d, { vel: 90, teleguiado: 0, raio: 5, dano: 35 });
        jogo.efeitos.fogo(_c, 10, 0.6, 2.5);
        jogo.efeitos.fumaca(_c, 6, 3, 0.5);
        jogo.efeitos.clarao(_c, 0.8, 0.15, 0xffc070);
        this.recuo = 1;
        _v.copy(this.pos).y = 0.5;
        jogo.efeitos.ondaDeChoque(_v, 8, 0.4, 0xd8c9a8); // poeira levantada pelo disparo
        jogo.efeitos.poeira(_v, 6, 5, 4);
        jogo.tremerPerto(_c, 0.2);
        jogo.audio?.canhao(_c);
      }
    }
  }
}

// fumaça do escapamento atrás do veículo
function escapamento(v, distTras, altura) {
  if (v.estado !== 'normal' || Math.random() > 0.25 + v.velAtual * 0.02) return;
  const a = v.obj.rotation.y;
  _c.set(v.pos.x - Math.sin(a) * distTras, v.pos.y + altura, v.pos.z - Math.cos(a) * distTras);
  v.jogo.efeitos.fumaca(_c, 1, 1.2, 0.3);
}

// ---------- helicóptero ----------
export class Helicoptero extends Entidade {
  constructor(jogo, pos) {
    const grupo = new THREE.Group();
    const corpo = new THREE.Mesh(geoHelicoptero(), materialCores);
    corpo.position.y = 1.6;
    grupo.add(corpo);
    const helice = new THREE.Mesh(geoHeliceHeli(), materialCores);
    helice.position.y = 3.2;
    grupo.add(helice);
    const cauda = new THREE.Mesh(geoHeliceCauda(), materialCores);
    cauda.position.set(0.2, 2.9, -7.75);
    grupo.add(cauda);
    super(jogo, grupo, { tipo: 'heli', raio: 3.5, altura: 3, vida: 160, massa: 5, inimigo: true });
    this.helice = helice;
    this.heliceCauda = cauda;
    this.lado = 1;
    this.pos.copy(pos);
    this.angulo = Math.random() * Math.PI * 2;
    this.tiro = 4;
    this.caindo = false;
  }
  atualizar(dt) {
    this.helice.rotation.y += dt * (this.caindo ? 10 : 30);
    this.heliceCauda.rotation.x += dt * (this.caindo ? 8 : 40);
    super.atualizar(dt);
  }
  ia(dt) {
    const jogo = this.jogo;
    const h = jogo.heroi.pos;
    this.angulo += dt * 0.25;
    _v.set(h.x + Math.cos(this.angulo) * 55, Math.max(28, h.y + 18), h.z + Math.sin(this.angulo) * 55);
    _d.subVectors(_v, this.pos);
    const l = _d.length();
    if (l > 0.5) _d.multiplyScalar(Math.min(24, l) / l);
    this.vel.lerp(_d, Math.min(1, dt * 1.5));
    this.pos.addScaledVector(this.vel, dt);
    jogo.heroi.centro(_h);
    this.obj.rotation.y = anguloLerp(this.obj.rotation.y, Math.atan2(_h.x - this.pos.x, _h.z - this.pos.z), Math.min(1, dt * 3));
    // inclina para o lado e para frente conforme se move
    const ry = this.obj.rotation.y;
    const lateral = this.vel.x * Math.cos(ry) - this.vel.z * Math.sin(ry);
    const frente = this.vel.x * Math.sin(ry) + this.vel.z * Math.cos(ry);
    this.obj.rotation.z += (Math.max(-0.4, Math.min(0.4, -lateral * 0.025)) - this.obj.rotation.z) * Math.min(1, dt * 3);
    this.obj.rotation.x += (0.05 + Math.max(-0.25, Math.min(0.3, frente * 0.015)) - this.obj.rotation.x) * Math.min(1, dt * 3);
    // poeira do vento das hélices quando está baixo
    if (this.pos.y < 22 && Math.random() < 0.5) {
      const a = Math.random() * Math.PI * 2;
      _c.set(this.pos.x + Math.cos(a) * 6, 0.5, this.pos.z + Math.sin(a) * 6);
      jogo.efeitos.normal.emitir(_c.x, _c.y, _c.z, { vx: Math.cos(a) * 12, vy: 1, vz: Math.sin(a) * 12, vida: 1.2, tamIni: 2, tamFim: 6, alfa: 0.4, gravidade: 0, arrasto: 1.2, r: 0.7, g: 0.66, b: 0.58 });
    }
    if (jogo.predios.solido(this.pos.x, this.pos.y + 1.5, this.pos.z)) this.levarDano(40 * dt, 'inimigo');
    this.tiro -= dt;
    if (this.tiro <= 0 && !jogo.heroi.morto) {
      this.tiro = 3 + Math.random() * 1.5;
      // foguete sai do casulo da direita ou da esquerda
      this.lado = -this.lado;
      _c.set(this.lado * 1.5, 1.25, 1.2).applyEuler(this.obj.rotation).add(this.pos);
      jogo.efeitos.fogo(_c, 4, 0.3, 1.5);
      if (enxerga(jogo, _c, _h)) {
        _d.subVectors(_h, _c).normalize();
        jogo.projeteis.missil(_c, _d, { vel: 55, teleguiado: 1.4, raio: 4.5, dano: 30 });
      }
    }
  }
  pousar() { this.levarDano(9999); } // bateu no chão: cai
  morrer() {
    if (this.estado === 'morto') return;
    this.estado = 'morto';
    this.tempoEstado = 0;
    this.caindo = true;
    this.jogo.aoInimigoDerrotado(this);
  }
  morto(dt) {
    if (!this.caindo) return;
    this.vel.y -= 18 * dt;
    this.pos.addScaledVector(this.vel, dt);
    this.obj.rotation.y += dt * 5;
    this.centro(_c);
    this.jogo.efeitos.fumaca(_c, 1, 3, 0.12);
    this.jogo.efeitos.fogo(_c, 1, 1, 2);
    if (this.pos.y <= 0 || this.jogo.predios.solido(_c.x, _c.y, _c.z) || this.tempoEstado > 8) {
      this.caindo = false;
      this.jogo.explosao(_c, 9, 80, 'inimigo', this);
      this.remover = true;
    }
  }
}

// ---------- heróis inimigos ----------
export const TIPOS = {
  raio: {
    nome: 'VOLTAGEM', vida: 450, escala: 1.1, corBarra: 'linear-gradient(90deg,#0284c7,#7dd3fc)',
    cores: { uniforme: 0x101a33, detalhe: 0x38bdf8, capa: 0x1e3a8a, cinto: 0x38bdf8, emblema: 0x7dd3fc, cabelo: 0xe5e7eb, mascara: 0x38bdf8, brilho: true, olho: 0x38bdf8 },
  },
  rapido: {
    nome: 'CORISCO', vida: 320, escala: 1, corBarra: 'linear-gradient(90deg,#ca8a04,#fde047)',
    cores: { uniforme: 0xfacc15, detalhe: 0xdc2626, botas: 0xdc2626, cinto: 0xdc2626, emblema: 0xdc2626, mascara: 0xdc2626, cabelo: 0x7a3b10, emblemaRaio: true, fisico: { ombros: 0.92, bracos: 0.9, pernas: 0.95 } },
  },
  viltrumita: {
    nome: 'VILTRUMITA', vida: 3200, escala: 1.15, corBarra: 'linear-gradient(90deg,#7f1d1d,#ef4444)',
    cores: { uniforme: 0xf1f1ee, detalhe: 0xb91c1c, capa: 0xb91c1c, botas: 0x9f1515, cinto: 0xb91c1c, emblema: 0xb91c1c, cabelo: 0x2a2626, bigode: 0x2a2626, olho: 0x3b2a1a, fisico: { ombros: 1.18, bracos: 1.15, pernas: 1.05 } },
  },
  gigante: {
    nome: 'COLOSSO', vida: 1600, escala: 4.5, corBarra: 'linear-gradient(90deg,#15803d,#a855f7)',
    cores: { uniforme: 0x3f6212, detalhe: 0x6b21a8, botas: 0x3b0764, cinto: 0x6b21a8, emblema: 0xa855f7, cabelo: 0x111111, pele: 0x8fa35a, bracosPele: true, espinhos: 0xc084fc, fisico: { ombros: 1.45, bracos: 1.75, pernas: 1.35, cabeca: 0.82 } },
  },
};

export class HeroiInimigo extends Entidade {
  constructor(jogo, tipo) {
    const cfg = TIPOS[tipo];
    const rig = criarHumanoide(cfg.cores, cfg.escala);
    super(jogo, rig.raiz, {
      tipo: 'heroiInimigo', raio: 0.7 * cfg.escala, altura: 2.1 * cfg.escala, vida: cfg.vida,
      massa: tipo === 'gigante' ? 20 : 1.5, agarravel: tipo !== 'gigante', inimigo: true, contorno: 0,
    });
    this.rig = rig;
    this.variante = tipo;
    this.chefe = true;
    this.nome = cfg.nome;
    if (tipo === 'rapido') this.resistenciaLaser = 0.55; // vibra tão rápido que o laser pega só de raspão
    if (tipo === 'viltrumita') this.resistenciaLaser = 0.35; // pele quase indestrutível
    this.corBarra = cfg.corBarra;
    this.fase = 'mover';
    this.timer = 2;
    this.timer2 = 3;
    this.angulo = Math.random() * Math.PI * 2;
    this.alvoRaio = new THREE.Vector3();
    // nasce longe do herói
    const h = jogo.heroi.pos;
    const a = Math.random() * Math.PI * 2;
    this.pos.set(h.x + Math.cos(a) * 200, tipo === 'gigante' ? 0 : 50, h.z + Math.sin(a) * 200);
    if (tipo === 'gigante') { this.pos.x = Math.max(-260, Math.min(260, this.pos.x)); this.pos.z = Math.max(-240, Math.min(240, this.pos.z)); }
    if (tipo === 'raio') this.raio3d = new Raio(jogo.cena, 0xe0f2ff, 0x2a8cff, 0.06, 0.25);
    this.velAnim = 0;
  }

  lancar(vel, porHeroi) {
    if (this.variante !== 'gigante') { super.lancar(vel, porHeroi); return; }
    // o gigante só cambaleia para trás
    if (Number.isFinite(vel.x + vel.z)) { this.pos.x += vel.x * 0.12; this.pos.z += vel.z * 0.12; }
  }

  atualizar(dt) {
    // o feixe só vale enquanto ele está de fato atirando
    if (this.feixe && (this.fase !== 'raio' || this.atordoadoT > 0 || this.estado !== 'normal')) this.feixe.ativo = false;
    if (this.estado === 'preso') {
      // se solta depois de um tempo
      this.tempoEstado += dt;
      if (this.tempoEstado > (this.variante === 'viltrumita' ? 0.7 : 2.4)) {
        const heroi = this.jogo.heroi;
        if (heroi.segurando === this) heroi.segurando = null;
        this.estado = 'normal';
        _v.copy(this.jogo.camera.frente).multiplyScalar(-30);
        heroi.vel.add(_v);
        heroi.levarDano(10);
        this.jogo.hud.mensagem(`${this.nome} SE SOLTOU!`, '#c084fc');
        if (this.variante === 'viltrumita') { this.socoNoHeroi(30, 120); this.fase = 'perseguir'; this.golpesPinball = 1; this.timer = 1.2; }
      }
      this.animar(dt, 0, true);
      return;
    }
    if (this.estado === 'normal' || this.estado === 'arremessado' || this.estado === 'caido') {
      if (this.estado !== 'normal') { this.raio3d?.esconder(); if (this.feixe) this.feixe.ativo = false; }
    }
    super.atualizar(dt);
    // heróis que voam se recuperam no ar depois de arremessados (em vez de cair)
    if (this.estado === 'arremessado' && this.variante !== 'gigante' && this.tempoEstado > (this.variante === 'rapido' ? 0.12 : 0.3)) {
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 2.2));
      this.vel.y += 22 * dt;
      const limite = this.variante === 'rapido' ? 35 : this.variante === 'viltrumita' ? 25 : 10; // o Corisco se recupera muito mais rápido
      if (this.vel.length() < limite) {
        this.estado = 'normal';
        this.obj.rotation.set(0, this.obj.rotation.y, 0);
        if (this.variante === 'rapido') {
          // em vez de ficar tonto, dispara para longe
          this.fase = 'recuar'; this.timer = 0.5;
          const a = Math.random() * Math.PI * 2;
          this.vel.set(Math.cos(a) * 150, 20, Math.sin(a) * 150);
        } else if (this.variante === 'viltrumita') { this.fase = 'investida'; this.timer = 1.4; } // volta com tudo
        else this.atordoar(0.4);
      }
    }
    if (this.estado === 'normal') this.animar(dt, this.velAnim, this.variante !== 'gigante');
  }

  aoSerPego() { this.tempoEstado = 0; this.raio3d?.esconder(); if (this.feixe) this.feixe.ativo = false; }

  animar(dt, vel, voando) {
    animarHumanoide(this.rig, {
      dt, voando, rapidez: Math.min(1, vel / 40), inclinacao: voando ? Math.min(1.3, vel / 40) : 0,
      andar: voando ? 0 : vel * 1.6, soco: this.soco ?? 0, segurando: false,
    });
    this.soco = Math.max(0, (this.soco ?? 0) - dt * 4);
  }

  olharPara(alvo, dt, k = 8) {
    this.obj.rotation.y = anguloLerp(this.obj.rotation.y, Math.atan2(alvo.x - this.pos.x, alvo.z - this.pos.z), Math.min(1, dt * k));
  }

  // atravessa prédios quebrando
  quebrarCaminho(raio) {
    this.centro(_c);
    _v.copy(this.vel).multiplyScalar(0.4);
    this.jogo.predios.danificarEsfera(_c, raio, 9999, { velBase: _v, forca: 6, origem: 'inimigo', pedacos: 1, max: 30 });
  }

  ia(dt) {
    this.aura();
    if (this.variante === 'raio') this.iaRaio(dt);
    else if (this.variante === 'rapido') this.iaRapido(dt);
    else if (this.variante === 'viltrumita') this.iaViltrumita(dt);
    else this.iaGigante(dt);
  }

  // aura de energia em volta de cada herói inimigo
  aura() {
    const ef = this.jogo.efeitos;
    this.centro(_c);
    const r = this.raio * 1.4;
    if (this.variante === 'raio' && Math.random() < 0.6) {
      // faíscas elétricas azuis
      _v.set(_c.x + (Math.random() - 0.5) * r, _c.y + (Math.random() - 0.5) * this.altura * 0.8, _c.z + (Math.random() - 0.5) * r);
      ef.faiscas(_v, 2, 6, [0.4, 0.75, 1]);
    } else if (this.variante === 'rapido' && Math.random() < 0.3) {
      _v.set(_c.x + (Math.random() - 0.5) * r, _c.y + (Math.random() - 0.5) * this.altura * 0.7, _c.z + (Math.random() - 0.5) * r);
      ef.faiscas(_v, 1, 4, [1, 0.85, 0.2]);
    } else if (this.variante === 'gigante' && Math.random() < 0.35) {
      // vapor roxo saindo do corpo
      _v.set(_c.x + (Math.random() - 0.5) * r, _c.y + (Math.random() - 0.3) * this.altura * 0.6, _c.z + (Math.random() - 0.5) * r);
      ef.aditivo.emitir(_v.x, _v.y, _v.z, { vx: 0, vy: 2, vz: 0, vida: 0.8, tamIni: 2.5, tamFim: 0.5, alfa: 0.35, gravidade: -1, arrasto: 1, r: 0.6, g: 0.25, b: 0.9 });
    }
  }

  // soco corpo a corpo de um herói inimigo: manda o herói voando através dos prédios
  socoNoHeroi(dano, forca) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    heroi.centro(_h);
    this.centro(_c);
    _d.subVectors(_h, _c).normalize();
    heroi.levarDano(dano);
    heroi.vel.copy(_d).multiplyScalar(forca).y += forca * 0.12;
    heroi.atordoado = 0.45;
    this.soco = 1;
    _v.copy(_h).lerp(_c, 0.4);
    jogo.efeitos.faiscas(_v, 16, 16, [1, 0.95, 0.85]);
    jogo.efeitos.ondaDeChoque(_v, 7, 0.3, 0xffffff, _d);
    jogo.camera.tremer(0.55);
    jogo.camera.socoFov?.(6);
    jogo.congelar(0.08);
    jogo.audio?.soco(1);
  }

  iaRaio(dt) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    heroi.centro(_h);
    this.timer -= dt;
    this.esperaSoco = (this.esperaSoco ?? 0) - dt;
    this.centro(_c);
    if (this.esperaSoco <= 0 && !heroi.morto && _c.distanceTo(_h) < 6) {
      // o herói chegou perto: troca socos
      this.esperaSoco = 1.6;
      this.socoNoHeroi(22, 75);
      this.vel.copy(_d).multiplyScalar(-15); // recua um pouco
    }
    if (this.fase === 'mover') {
      this.angulo += dt * 0.5;
      _v.set(_h.x + Math.cos(this.angulo) * 38, _h.y + 10, _h.z + Math.sin(this.angulo) * 38);
      _d.subVectors(_v, this.pos).multiplyScalar(1.5);
      if (_d.length() > 35) _d.setLength(35);
      this.vel.lerp(_d, Math.min(1, dt * 2));
      if (this.timer <= 0) { this.fase = 'raio'; this.timer = 2.2; this.alvoRaio.copy(_h).add(_v.set(8, 4, 0)); jogo.audio?.raioAzul(true); }
    } else {
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 4));
      this.alvoRaio.lerp(_h, Math.min(1, dt * 2.2)); // a mira persegue o herói devagar (dá para fugir)
      this.rig.olhos[0].getWorldPosition(_c);
      _d.subVectors(this.alvoRaio, _c).normalize();
      const hit = jogo.predios.raycast(_c, _d, 150);
      let fim = hit ? hit.dist : 150;
      // acertou o herói?
      _v.copy(_c).addScaledVector(_d, fim);
      if (jogo.choque?.ativo === this) { /* raios travados: sem dano */ }
      else if (!heroi.morto && distSegmento(_h, _c, _v) < 1.4) {
        heroi.levarDano(32 * dt);
        fim = Math.min(fim, _c.distanceTo(_h));
        _v.copy(_c).addScaledVector(_d, fim);
      } else if (hit) {
        jogo.predios.danificarEsfera(hit.ponto, 2, 140 * dt, { origem: 'inimigo', forca: 5, pedacos: 2 });
      }
      // guarda o feixe para o choque de raios (choque.js)
      this.feixe = this.feixe || { a: new THREE.Vector3(), b: new THREE.Vector3(), ativo: false };
      this.feixe.a.copy(_c); this.feixe.b.copy(_v); this.feixe.ativo = true;
      if (jogo.choque?.ativo === this) this.timer = Math.max(this.timer, 0.3); // não para no meio do choque
      else {
        this.raio3d.mostrar(_c, _v, jogo.tempo);
        jogo.efeitos.faiscas(_v, 2, 9, [0.5, 0.8, 1]);
        jogo.efeitos.brilho(_v, 3, 0.3, 0.6, 1);
      }
      if (this.timer <= 0) { this.fase = 'mover'; this.timer = 3 + Math.random() * 2; this.raio3d.esconder(); this.feixe.ativo = false; jogo.audio?.raioAzul(false); }
    }
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y < 2) this.pos.y = 2;
    this.olharPara(_h, dt);
    this.velAnim = this.vel.length();
    if (this.velAnim > 10) this.quebrarCaminho(1.1);
  }

  // Corisco: mais rápido que o herói (que chega a 115 m/s com Shift)
  //  cercar (circula em zigue-zague) -> avanço (180 m/s) -> rajada de socos -> pausa (brecha!) -> recuo (150 m/s)
  iaRapido(dt) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    heroi.centro(_h);
    this.timer -= dt;
    this.esquiva = (this.esquiva ?? 0) - dt;
    this.centro(_c);
    const dist = _c.distanceTo(_h);
    if (!this.fase || this.fase === 'mover' || this.fase === 'esperar') { this.fase = 'cercar'; this.timer = 1; }

    // desvia do laser e do avanço do herói com um "teleporte" lateral
    const mirandoNele = (jogo.laser.ativo && jogo.mira.entidade === this) || jogo.combate?.avanco?.alvo === this;
    if (mirandoNele && this.esquiva <= 0 && this.fase !== 'rajada' && this.fase !== 'pausa') {
      this.esquiva = 0.4;
      if (Math.random() < 0.85) this.teleporteLateral();
    }

    if (this.fase === 'cercar') {
      // circula em volta do herói bem rápido, mudando de raio (zigue-zague)
      this.angulo += dt * 4.2 * (this.sentido || (this.sentido = Math.random() < 0.5 ? 1 : -1));
      const r = 28 + Math.sin(jogo.tempo * 7) * 8;
      _v.set(_h.x + Math.cos(this.angulo) * r, Math.max(2, _h.y + Math.sin(jogo.tempo * 5) * 6), _h.z + Math.sin(this.angulo) * r);
      _d.subVectors(_v, this.pos).multiplyScalar(6);
      if (_d.length() > 150) _d.setLength(150);
      this.vel.lerp(_d, Math.min(1, dt * 8));
      if (this.timer <= 0 || dist > 150) {
        this.fase = 'avanco'; this.timer = 1.2;
        _d.subVectors(_h, _c).normalize();
        jogo.efeitos.ondaDeChoque(_c, 4, 0.25, 0xfff6c0, _d); // estrondo sônico na largada
        jogo.audio?.arremesso();
      }
    } else if (this.fase === 'avanco') {
      // dispara em linha reta a 180 m/s, corrigindo a mira
      _d.subVectors(_h, _c).normalize().multiplyScalar(180);
      this.vel.lerp(_d, Math.min(1, dt * 12));
      if (dist < 3.2 && !heroi.morto) { this.fase = 'rajada'; this.timer = 0; this.golpes = 0; }
      else if (this.timer <= 0) { this.fase = 'cercar'; this.timer = 0.8; }
    } else if (this.fase === 'rajada') {
      // gruda na frente do herói e dá 4 socos rapidíssimos (o último manda longe)
      _d.subVectors(_c, _h).normalize();
      this.pos.copy(_h).addScaledVector(_d, 2.2).y -= this.altura * 0.5;
      this.vel.copy(heroi.vel);
      if (this.timer <= 0) {
        this.timer = 0.11;
        this.golpes++;
        this.soco = 1;
        _v.copy(_h).lerp(_c, 0.4);
        jogo.efeitos.faiscas(_v, 8, 12, [1, 0.9, 0.4]);
        if (this.golpes < 4) {
          heroi.levarDano(6);
          heroi.vel.addScaledVector(_d, -12);
          jogo.camera.tremer(0.15);
          jogo.audio?.impacto(0.5, _v);
        } else {
          this.socoNoHeroi(14, 95);
          this.fase = 'pausa'; this.timer = 0.5; // brecha para o herói revidar
        }
      }
    } else if (this.fase === 'pausa') {
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 6));
      if (this.timer <= 0) {
        this.fase = 'recuar'; this.timer = 0.55;
        const a = Math.random() * Math.PI * 2;
        this.vel.set(Math.cos(a) * 150, 25, Math.sin(a) * 150);
      }
    } else if (this.fase === 'recuar') {
      if (this.timer <= 0) { this.fase = 'cercar'; this.timer = 0.8 + Math.random() * 1.2; }
    }

    // move em 2 passos (a 180 m/s anda 3 m por quadro) quebrando o que tiver no caminho
    for (let p = 0; p < 2; p++) {
      this.pos.addScaledVector(this.vel, dt / 2);
      if (this.vel.lengthSq() > 400) this.quebrarCaminho(1.1);
    }
    if (this.pos.y < 0.5) { this.pos.y = 0.5; this.vel.y = Math.abs(this.vel.y); }
    const olhar = this.fase === 'pausa' || this.fase === 'rajada' ? _h : _v.copy(this.pos).add(this.vel);
    this.olharPara(olhar, dt, 14);
    this.velAnim = this.vel.length();
    if (this.velAnim > 30) this.rastro(1);
  }

  // o Viltrumita bloqueia socos quando não está atacando e revida na hora
  bloquear() {
    if (this.variante !== 'viltrumita' || this.estado !== 'normal') return false;
    if (this.fase === 'pausa') return false; // a brecha depois do ataque dele: aí ele apanha
    const jogo0 = this.jogo;
    // conta os socos seguidos: no 3º ele escapa do combo (só leva o combo inteiro na brecha)
    if (jogo0.tempo - (this.ultimoSocoLevado ?? -9) > 1.2) this.socosSeguidos = 0;
    this.ultimoSocoLevado = jogo0.tempo;
    this.socosSeguidos = (this.socosSeguidos ?? 0) + 1;
    const furia = this.vida < this.vidaMax * 0.5;
    let bloqueia = this.socosSeguidos >= 3;
    if (!bloqueia && !(this.atordoadoT > 0) && (this.fase === 'cercar' || this.fase === 'investida')) bloqueia = Math.random() < (furia ? 0.75 : 0.55);
    if (!bloqueia) return false;
    this.socosSeguidos = 0;
    this.atordoadoT = 0;
    const jogo = this.jogo;
    this.centro(_c);
    jogo.efeitos.faiscas(_c, 18, 14, [1, 1, 1]);
    jogo.efeitos.ondaDeChoque(_c, 6, 0.25, 0xffffff);
    jogo.hud.mensagem('BLOQUEOU!', '#ef4444');
    jogo.audio?.impacto(0.8, _c);
    this.socoNoHeroi(24, 120); // contra-ataque
    this.fase = 'perseguir'; this.timer = 1.2; this.golpesPinball = 1;
    return true;
  }

  // golpe com direção escolhida (para o "pinball" do Viltrumita)
  golpeDirecao(dano, dir, forca) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    heroi.centro(_h);
    heroi.levarDano(dano);
    heroi.vel.copy(dir).multiplyScalar(forca);
    heroi.atordoado = 0.5;
    this.soco = 1;
    jogo.efeitos.faiscas(_h, 22, 20, [1, 0.95, 0.85]);
    jogo.efeitos.ondaDeChoque(_h, 10, 0.35, 0xffffff, dir);
    jogo.efeitos.brilho(_h, 3, 0.8, 0.8, 0.8);
    jogo.camera.tremer(0.7);
    jogo.camera.socoFov?.(9);
    jogo.congelar(0.1);
    jogo.audio?.soco(1.4);
  }

  // Viltrumita: brutal e rápido. Avança, dá uma sequência de socos e "joga pinball" com o herói
  //  cercar -> investida -> combo (3 socos) ou agarrão -> perseguir (bate de novo no ar) -> pausa (brecha)
  iaViltrumita(dt) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    heroi.centro(_h);
    this.centro(_c);
    this.timer -= dt;
    this.esquiva = (this.esquiva ?? 0) - dt;
    const furia = this.vida < this.vidaMax * 0.5;
    const f = furia ? 1.25 : 1;
    if (furia && !this.avisouFuria) { this.avisouFuria = true; jogo.hud.mensagem('O VILTRUMITA ESTÁ FURIOSO!', '#ef4444'); }
    const dist = _c.distanceTo(_h);
    if (!this.fase || this.fase === 'mover') { this.fase = 'cercar'; this.timer = 2; }
    // cura viltrumita: 3 s sem apanhar e ele começa a se regenerar
    if (this.vida < (this.ultimaVida ?? this.vida)) this.semDano = 0;
    else this.semDano = (this.semDano ?? 0) + dt;
    if (this.semDano > 3 && this.vida < this.vidaMax) {
      this.vida = Math.min(this.vidaMax, this.vida + 25 * dt);
      if (Math.random() < 0.15) jogo.efeitos.faiscas(_c, 1, 3, [0.5, 1, 0.5]);
    }
    this.ultimaVida = this.vida;
    // desvia do avanço do combo (F) enquanto circula
    if (jogo.combate?.avanco?.alvo === this && this.fase === 'cercar' && this.esquiva <= 0) {
      this.esquiva = 0.9;
      if (Math.random() < 0.5) this.teleporteLateral([1, 0.95, 0.9]);
    }
    if (heroi.morto && this.fase !== 'cercar') { this.fase = 'cercar'; this.timer = 99; }

    // desvia do laser às vezes
    if (jogo.laser.ativo && jogo.mira.entidade === this && this.esquiva <= 0 && (this.fase === 'cercar' || this.fase === 'pausa')) {
      this.esquiva = 0.9;
      if (Math.random() < 0.7) this.teleporteLateral([1, 0.95, 0.9]);
    }

    if (this.fase === 'cercar') {
      this.angulo += dt * 1.1 * f;
      _v.set(_h.x + Math.cos(this.angulo) * 40, Math.max(4, _h.y + 8), _h.z + Math.sin(this.angulo) * 40);
      _d.subVectors(_v, this.pos).multiplyScalar(2.5);
      if (_d.length() > 90) _d.setLength(90);
      this.vel.lerp(_d, Math.min(1, dt * 3));
      if (this.timer <= 0 && !heroi.morto) {
        this.fase = 'investida'; this.timer = 1.5;
        _d.subVectors(_h, _c).normalize();
        jogo.efeitos.ondaDeChoque(_c, 6, 0.3, 0xffffff, _d); // estrondo sônico
        jogo.audio?.arremesso();
      }
    } else if (this.fase === 'investida') {
      _d.subVectors(_h, _c).normalize().multiplyScalar(195 * f);
      this.vel.lerp(_d, Math.min(1, dt * 9));
      if (dist < 3.5) {
        if (Math.random() < (furia ? 0.55 : 0.4)) this.iniciarAgarrao();
        else { this.fase = 'combo'; this.timer = 0.05; this.golpes = 0; }
      } else if (this.timer <= 0) { this.fase = 'cercar'; this.timer = 1; }
    } else if (this.fase === 'combo') {
      // gruda no herói e soca: 2 socos pesados e um que manda longe
      _d.subVectors(_c, _h).normalize();
      this.pos.copy(_h).addScaledVector(_d, 2.4).y -= this.altura * 0.5;
      this.vel.copy(heroi.vel);
      if (this.timer <= 0) {
        this.golpes++;
        this.timer = 0.24 / f;
        this.soco = 1;
        if (this.golpes < 3) {
          heroi.levarDano(18);
          heroi.vel.addScaledVector(_d, -18);
          heroi.atordoado = 0.3;
          _v.copy(_h).lerp(_c, 0.4);
          jogo.efeitos.faiscas(_v, 10, 14, [1, 0.9, 0.7]);
          jogo.camera.tremer(0.3);
          jogo.congelar(0.05);
          jogo.audio?.soco(0.9);
        } else {
          // o terceiro manda o herói voando através dos prédios
          _v.copy(_d).negate().setY(0.15).normalize();
          this.golpeDirecao(35, _v, 150);
          this.fase = 'perseguir'; this.timer = 1.4; this.golpesPinball = furia ? 3 : 2;
        }
      }
    } else if (this.fase === 'perseguir') {
      // alcança o herói ainda voando e bate de novo para outro lado
      _d.subVectors(_h, _c).normalize().multiplyScalar(240 * f);
      this.vel.lerp(_d, Math.min(1, dt * 10));
      if (dist < 4 && this.golpesPinball > 0) {
        this.golpesPinball--;
        this.timer = 1.4;
        if (this.golpesPinball === 0) {
          // último: martelada de cima para baixo (cratera no chão)
          _v.set(heroi.vel.x * 0.002, -1, heroi.vel.z * 0.002).normalize();
          this.golpeDirecao(38, _v, 160);
          this.martelando = true;
          this.fase = 'pausa'; this.timer = 0.8 / f;
          this.vel.set(0, 12, 0);
        } else {
          const a = Math.random() * Math.PI * 2;
          _v.set(Math.cos(a), 0.35 + Math.random() * 0.4, Math.sin(a)).normalize();
          this.golpeDirecao(26, _v, 140);
        }
      } else if (this.timer <= 0) { this.fase = 'pausa'; this.timer = 0.6; }
    } else if (this.fase === 'agarrao') {
      // segura o herói e voa arrastando a cara dele pelos prédios
      _d.copy(this.dirAgarrao);
      this.vel.copy(_d).multiplyScalar(115 * f);
      this.vel.y = this.timer > 0.7 ? -10 : -35;
      heroi.atordoado = 0.3;
      heroi.dash = 0.1;
      heroi.pos.copy(this.pos).addScaledVector(_d, 2.4).y += this.altura * 0.25;
      if (heroi.pos.y < 0.5) { heroi.pos.y = 0.5; this.pos.y = Math.max(this.pos.y, 0.5); }
      heroi.vel.copy(this.vel);
      heroi.centro(_h);
      const n = jogo.predios.danificarEsfera(_h, 2.6, 9999, { velBase: _v.copy(this.vel).multiplyScalar(0.5), forca: 10, origem: 'inimigo', pedacos: 2, max: 30 });
      heroi.levarDano(10 * dt + n * 0.6);
      if (n > 0) { jogo.camera.tremer(0.2); jogo.efeitos.poeira(_h, 2, 2, 5); }
      jogo.marcarPerigo(_h, 30);
      if (this.timer <= 0) {
        // arremessa para o chão
        _v.copy(_d).setY(-1.4).normalize();
        this.golpeDirecao(25, _v, 120);
        this.martelando = true;
        this.fase = 'pausa'; this.timer = 1 / f;
        this.vel.set(0, 15, 0);
      }
    } else if (this.fase === 'pausa') {
      // brecha para o herói revidar
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 3));
      if (this.timer <= 0) { this.fase = 'cercar'; this.timer = (1 + Math.random()) / f; }
    }

    // herói martelado contra o chão: cratera
    if (this.martelando) {
      if (heroi.pos.y <= 0.3 || jogo.predios.celulaEm(heroi.pos.x, heroi.pos.y - 0.2, heroi.pos.z)) {
        this.martelando = false;
        _c.copy(heroi.pos).y += 0.3;
        heroi.levarDano(25);
        heroi.vel.set(0, 0, 0);
        heroi.atordoado = 0.7;
        jogo.efeitos.ondaDeChoque(_c, 20, 0.6, 0xd8c9a8);
        jogo.efeitos.poeira(_c, 18, 8, 8);
        jogo.camera.tremer(0.9);
        jogo.audio?.explosao(1, _c);
        jogo.predios.danificarEsfera(_c, 6, 500, { forca: 14, origem: 'inimigo', pedacos: 1, max: 60 });
        jogo.detritos.empurrar(_c, 20, 18);
      } else if (heroi.vel.y > -5) this.martelando = false; // ricocheteou em algo
    }

    if (this.fase !== 'combo') {
      for (let p = 0; p < 2; p++) {
        this.pos.addScaledVector(this.vel, dt / 2);
        if (this.vel.lengthSq() > 400) this.quebrarCaminho(1.3);
      }
    }
    if (this.pos.y < 0.5) { this.pos.y = 0.5; this.vel.y = Math.max(0, this.vel.y); }
    const olhar = this.fase === 'cercar' || this.fase === 'pausa' || this.fase === 'combo' ? _h : _v.copy(this.pos).add(this.vel);
    this.olharPara(olhar, dt, 10);
    this.velAnim = this.vel.length();
    if (this.velAnim > 60) {
      // rastro de vento branco
      jogo.efeitos.aditivo.emitir(this.pos.x, this.pos.y + this.altura * 0.5, this.pos.z, { vx: 0, vy: 0, vz: 0, vida: 0.25, tamIni: 1.6, tamFim: 0.2, alfa: 0.45, gravidade: 0, arrasto: 0, r: 0.9, g: 0.92, b: 1 });
    }
  }

  iniciarAgarrao() {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    if (heroi.segurando) { heroi.segurando.estado = 'normal'; heroi.segurando = null; } // o herói larga o que tinha na mão
    this.fase = 'agarrao';
    this.timer = 1.5;
    // vai na direção do prédio mais perto (para arrastar o herói nele)
    this.dirAgarrao = this.dirAgarrao || new THREE.Vector3();
    let melhor = null, md = Infinity;
    for (const p of jogo.predios.predios) {
      const cx = (p.x0 + p.x1) / 2, cz = (p.z0 + p.z1) / 2;
      const d = Math.hypot(cx - heroi.pos.x, cz - heroi.pos.z);
      if (d > 12 && d < md && !p.destruido) { md = d; melhor = [cx, cz]; }
    }
    if (melhor && md < 140) this.dirAgarrao.set(melhor[0] - heroi.pos.x, 0, melhor[1] - heroi.pos.z).normalize();
    else this.dirAgarrao.copy(heroi.vel).setY(0).normalize();
    if (this.dirAgarrao.lengthSq() < 0.5) this.dirAgarrao.set(1, 0, 0);
    jogo.hud.mensagem('O VILTRUMITA TE AGARROU!', '#ef4444');
    jogo.camera.tremer(0.4);
    jogo.audio?.soco(1);
  }

  // vulto amarelo deixado pelo caminho (cabeça, tronco e pernas)
  rastro(intensidade) {
    const ef = this.jogo.efeitos;
    for (const h of [0.15, 0.5, 0.85]) {
      ef.aditivo.emitir(this.pos.x, this.pos.y + this.altura * h, this.pos.z, {
        vx: 0, vy: 0, vz: 0, vida: 0.3, tamIni: 1.1 * intensidade, tamFim: 0.2, alfa: 0.7, gravidade: 0, arrasto: 0, r: 1, g: 0.82, b: 0.2,
      });
    }
  }

  // "teleporte": um passo lateral instantâneo de ~12 m, deixando um rastro de vulto
  teleporteLateral(cor = [1, 0.85, 0.25]) {
    const jogo = this.jogo;
    _d.subVectors(this.pos, jogo.heroi.pos).setY(0).normalize();
    const lado = Math.random() < 0.5 ? 1 : -1;
    _v.set(-_d.z * lado, (Math.random() - 0.3) * 0.5, _d.x * lado).normalize().multiplyScalar(12);
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      _c.copy(this.pos).addScaledVector(_v, t);
      jogo.efeitos.aditivo.emitir(_c.x, _c.y + this.altura * 0.5, _c.z, { vx: 0, vy: 0, vz: 0, vida: 0.35, tamIni: 2.2, tamFim: 0.3, alfa: 0.6, gravidade: 0, arrasto: 0, r: cor[0], g: cor[1], b: cor[2] });
    }
    this.pos.add(_v);
    if (this.pos.y < 0.5) this.pos.y = 0.5;
    jogo.efeitos.faiscas(_c.copy(this.pos).y += this.altura * 0.5, 6, 8, cor);
  }

  iaGigante(dt) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    const h = heroi.pos;
    const dx = h.x - this.pos.x, dz = h.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    this.timer -= dt;
    this.timer2 -= dt;
    let vel = 0;
    if (dist > 12) {
      vel = 7;
      this.pos.x += (dx / dist) * vel * dt;
      this.pos.z += (dz / dist) * vel * dt;
    }
    this.pos.y = 0;
    this.olharPara(h, dt, 2);
    this.velAnim = vel;
    // derruba o que estiver no caminho
    this.tempoQuebra = (this.tempoQuebra ?? 0) - dt;
    if (this.tempoQuebra <= 0) {
      this.tempoQuebra = 0.15;
      const a = this.obj.rotation.y;
      for (const y of [2.5, 6.5]) {
        _c.set(this.pos.x + Math.sin(a) * 2.5, y, this.pos.z + Math.cos(a) * 2.5);
        _v.set(Math.sin(a) * 10, 2, Math.cos(a) * 10);
        jogo.predios.danificarEsfera(_c, 3.8, 9999, { velBase: _v, forca: 6, origem: 'inimigo', pedacos: 1, max: 25 });
      }
    }
    // passos
    this.passo = (this.passo ?? 0) + dt * vel;
    if (this.passo > 6) { this.passo = 0; jogo.tremerPerto(this.pos, 0.25); jogo.efeitos.poeira(this.pos, 3, 3, 5); jogo.audio?.impacto(0.5, this.pos); }

    if (dist < 11 && h.y < 16 && this.timer <= 0 && !heroi.morto && Math.random() < 0.5) {
      // tapa gigante: o herói vai longe
      this.timer = 2.4;
      this.socoNoHeroi(40, 110);
    } else if (dist < 18 && h.y < 15 && this.timer <= 0 && !heroi.morto) {
      // pisão: onda de choque
      this.timer = 3;
      _c.copy(this.pos).y = 0.5;
      jogo.efeitos.ondaDeChoque(_c, 26, 0.6, 0xc4b5fd);
      jogo.efeitos.poeira(_c, 16, 10, 8);
      jogo.camera.tremer(0.8);
      jogo.audio?.soco(1.3);
      jogo.predios.danificarEsfera(_c, 9, 300, { forca: 12, origem: 'inimigo', pedacos: 1 });
      const f = 1 - Math.min(1, dist / 20);
      heroi.levarDano(55 * f + 10);
      _v.set(dx / dist, 0.6, dz / dist).multiplyScalar(70 * f + 20);
      heroi.vel.copy(_v);
      heroi.atordoado = 0.4;
    } else if (dist >= 18 && this.timer2 <= 0 && !heroi.morto) {
      // arremessa uma pedra
      this.timer2 = 4 + Math.random() * 2;
      this.soco = 1;
      _c.copy(this.pos).y += 9;
      heroi.centro(_h);
      const d = _c.distanceTo(_h);
      const t = Math.max(0.6, d / 45);
      _d.subVectors(_h, _c).divideScalar(t);
      _d.y += 0.5 * 20 * t;
      const v = _d.length();
      jogo.projeteis.missil(_c, _d.normalize(), { vel: v, pedra: true, raio: 6, dano: 45 });
    }
  }

  // derrota: explosão de energia na cor do herói, câmera lenta e o corpo cai mole
  morrer() {
    if (this.estado === 'morto') return;
    const jogo = this.jogo;
    this.estado = 'morto';
    this.tempoEstado = 0;
    this.raio3d?.esconder();
    if (this.feixe) this.feixe.ativo = false;
    this.centro(_c);
    const k = this.rig.raiz.scale.x;
    const cor = { raio: [0.4, 0.75, 1], rapido: [1, 0.85, 0.2], gigante: [0.75, 0.35, 1], viltrumita: [1, 0.3, 0.25] }[this.variante];
    const hex = { raio: 0x7dd3fc, rapido: 0xfde047, gigante: 0xc084fc, viltrumita: 0xff5040 }[this.variante];
    jogo.efeitos.faiscas(_c, 45, 18 + k * 2, cor);
    jogo.efeitos.ondaDeChoque(_c, 6 * k + 6, 0.6, hex);
    jogo.efeitos.brilho(_c, 4 * k, cor[0], cor[1], cor[2]);
    jogo.camaraLenta(0.7);
    jogo.congelar(0.1);
    jogo.tremerPerto(_c, 0.5);
    jogo.audio?.soco(1.2);
    jogo.hud.mensagem(`${this.nome} DERROTADO!`, '#4ade80');
    jogo.aoInimigoDerrotado(this);
    this.rig.raiz.rotation.order = 'YXZ';
    this.caindo = this.pos.y > 0.3;
    this.vel.multiplyScalar(0.5);
    this.vel.y = Math.max(this.vel.y, 3);
    this.voandoMorto = false;
  }

  morto(dt) {
    const jogo = this.jogo;
    const r = this.rig;
    const k = r.raiz.scale.x;
    if (this.voandoMorto) { this.voandoMorto = false; this.caindo = true; } // corpo arremessado de novo
    if (this.caindo) {
      this.vel.y -= 28 * dt;
      this.vel.x *= Math.max(0, 1 - dt * 0.6); this.vel.z *= Math.max(0, 1 - dt * 0.6);
      this.pos.addScaledVector(this.vel, dt);
      const cel = jogo.predios.celulaEm(this.pos.x, this.pos.y, this.pos.z);
      if (cel) { this.pos.y = cel.topo; this.aterrissarDerrotado(); }
      else if (this.pos.y <= 0) { this.pos.y = 0; this.aterrissarDerrotado(); }
    }
    // pose mole: deitado de costas, braços abertos
    const s = Math.min(1, dt * (this.caindo ? 2 : 6));
    const l = (a, b) => a + (b - a) * s;
    r.raiz.rotation.x = l(r.raiz.rotation.x, this.caindo ? -0.9 : -Math.PI / 2);
    r.raiz.rotation.z = l(r.raiz.rotation.z, 0);
    r.corpo.rotation.x = l(r.corpo.rotation.x, 0);
    r.bracoE.rotation.x = l(r.bracoE.rotation.x, -0.4); r.bracoE.rotation.z = l(r.bracoE.rotation.z, 1.25);
    r.bracoD.rotation.x = l(r.bracoD.rotation.x, -0.2); r.bracoD.rotation.z = l(r.bracoD.rotation.z, -1.1);
    r.antebracoE.rotation.x = l(r.antebracoE.rotation.x, -0.3); r.antebracoD.rotation.x = l(r.antebracoD.rotation.x, -0.5);
    r.pernaE.rotation.x = l(r.pernaE.rotation.x, 0); r.pernaE.rotation.z = l(r.pernaE.rotation.z, 0.18);
    r.pernaD.rotation.x = l(r.pernaD.rotation.x, -0.25); r.pernaD.rotation.z = l(r.pernaD.rotation.z, -0.12);
    r.canelaE.rotation.x = l(r.canelaE.rotation.x, 0.1); r.canelaD.rotation.x = l(r.canelaD.rotation.x, 0.6);
    r.cabeca.rotation.z = l(r.cabeca.rotation.z, 0.45);
    if (!this.caindo && !this.noChaoFinal) this.pos.y = l(this.pos.y, this.chaoFinal ?? 0.2 * k);
    // some afundando depois de um tempo
    if (this.tempoEstado > 14) {
      this.pos.y -= dt * 0.35 * k;
      if (this.tempoEstado > 18) this.remover = true;
    }
  }

  aterrissarDerrotado() {
    const jogo = this.jogo;
    const k = this.rig.raiz.scale.x;
    this.caindo = false;
    this.vel.set(0, 0, 0);
    this.chaoFinal = this.pos.y + 0.2 * k;
    _c.copy(this.pos).y += 0.3;
    jogo.efeitos.ondaDeChoque(_c, 5 + k * 3, 0.5, 0xd8c9a8);
    jogo.efeitos.poeira(_c, 8 + k * 3, 2 + k, 4 + k);
    jogo.tremerPerto(_c, Math.min(0.8, 0.25 * k));
    jogo.audio?.impacto(Math.min(1, 0.4 * k), _c);
  }
}

// ---------- nível de alerta (1 a 5 estrelas) ----------
const LIMIARES = [0, 12, 90, 260, 600, 1200];
const MAXIMO = {
  soldado: [0, 6, 9, 12, 16, 20],
  jipe: [0, 2, 2, 3, 3, 4],
  tanque: [0, 0, 1, 2, 3, 3],
  heli: [0, 0, 0, 1, 2, 3],
};
const HEROI_NIVEL = { raio: 3, rapido: 4, gigante: 5 };

export class Alerta {
  constructor(jogo) {
    this.jogo = jogo;
    this.pontos = 0;
    this.nivel = 0;
    this.semCaos = 0;
    this.timer = 2;
    this.subindo = false;
    this.esperaHeroi = { raio: 0, rapido: 0, gigante: 0 };
    this.herois = true; // as fases desligam a chegada automática de heróis inimigos
    this.minimo = 0; // nível mínimo de alerta (a fase pode exigir o exército na rua)
  }

  adicionar(p) { this.pontos += p; this.semCaos = 0; }

  pontaLonge() {
    const h = this.jogo.heroi.pos;
    const opcoes = NOS_PONTA.map((i) => ({ i, d: Math.hypot(NOS[i].x - h.x, NOS[i].z - h.z) })).filter((o) => o.d > 120).sort((a, b) => a.d - b.d);
    const lista = opcoes.length ? opcoes.slice(0, 4) : NOS_PONTA.map((i) => ({ i }));
    return lista[(Math.random() * lista.length) | 0].i;
  }

  atualizar(dt) {
    const jogo = this.jogo;
    this.semCaos += dt;
    if (this.semCaos > 20) this.pontos = Math.max(0, this.pontos - 15 * dt);
    this.pontos = Math.max(this.pontos, LIMIARES[this.minimo] + (this.minimo ? 1 : 0));
    let n = 0;
    while (n < 5 && this.pontos >= LIMIARES[n + 1]) n++;
    if (n > this.nivel) jogo.hud.mensagem(`ALERTA ${'★'.repeat(n)}`, '#facc15');
    this.nivel = n;
    this.subindo = this.semCaos < 2 && n > 0;

    for (const k in this.esperaHeroi) this.esperaHeroi[k] -= dt;
    this.timer -= dt;
    if (this.timer > 0 || n === 0) return;
    this.timer = 4;

    // conta quem está vivo
    const c = { soldado: 0, jipe: 0, tanque: 0, heli: 0, raio: 0, rapido: 0, gigante: 0 };
    for (const e of jogo.entidades) {
      if (!e.inimigo || e.estado === 'morto' || e.remover) continue;
      if (e.tipo === 'heroiInimigo') c[e.variante]++;
      else if (c[e.tipo] !== undefined) c[e.tipo]++;
    }
    const cena = jogo.entidades;
    // heróis inimigos
    for (const tipo in HEROI_NIVEL) {
      if (this.herois && n >= HEROI_NIVEL[tipo] && c[tipo] === 0 && this.esperaHeroi[tipo] <= 0) {
        cena.push(new HeroiInimigo(jogo, tipo));
        this.esperaHeroi[tipo] = 60;
        jogo.hud.mensagem(`⚠ ${TIPOS[tipo].nome} CHEGOU!`, '#c084fc');
        return;
      }
    }
    // exército
    if (c.soldado + c.jipe * 3 < MAXIMO.soldado[n] && c.jipe < MAXIMO.jipe[n]) cena.push(new Jipe(jogo, this.pontaLonge()));
    else if (c.tanque < MAXIMO.tanque[n]) cena.push(new Tanque(jogo, this.pontaLonge()));
    else if (c.heli < MAXIMO.heli[n]) {
      const h = jogo.heroi.pos;
      const a = Math.random() * Math.PI * 2;
      cena.push(new Helicoptero(jogo, _v.set(h.x + Math.cos(a) * 250, 60, h.z + Math.sin(a) * 250)));
    }
  }
}
