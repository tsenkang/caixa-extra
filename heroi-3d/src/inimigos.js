// Inimigos: soldados, jipes, tanques, helicópteros e heróis inimigos. Também os tiros e mísseis.
import * as THREE from 'three';
import { Entidade, Veiculo, NOS, NOS_PONTA, anguloLerp } from './entidades.js';
import { materialCores, geoSoldado, geoJipe, geoTanqueCasco, geoTanqueTorre, geoTanqueCano, geoHelicoptero, geoHeliceHeli, geoHeliceCauda, geoPedra } from './modelos.js';
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
    this.matMissil = new THREE.MeshLambertMaterial({ color: 0xd4d4d4, emissive: 0x331100 });
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
const TIPOS = {
  raio: {
    nome: 'VOLTAGEM', vida: 450, escala: 1.1, corBarra: 'linear-gradient(90deg,#0284c7,#7dd3fc)',
    cores: { uniforme: 0x101a33, detalhe: 0x38bdf8, capa: 0x1e3a8a, cinto: 0x38bdf8, emblema: 0x7dd3fc, cabelo: 0xe5e7eb, mascara: 0x38bdf8, brilho: true, olho: 0x38bdf8 },
  },
  rapido: {
    nome: 'CORISCO', vida: 320, escala: 1, corBarra: 'linear-gradient(90deg,#ca8a04,#fde047)',
    cores: { uniforme: 0xfacc15, detalhe: 0xdc2626, botas: 0xdc2626, cinto: 0xdc2626, emblema: 0xdc2626, mascara: 0xdc2626, cabelo: 0x7a3b10, emblemaRaio: true, fisico: { ombros: 0.92, bracos: 0.9, pernas: 0.95 } },
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
      if (this.tempoEstado > 2.4) {
        const heroi = this.jogo.heroi;
        if (heroi.segurando === this) heroi.segurando = null;
        this.estado = 'normal';
        _v.copy(this.jogo.camera.frente).multiplyScalar(-30);
        heroi.vel.add(_v);
        heroi.levarDano(10);
        this.jogo.hud.mensagem(`${this.nome} SE SOLTOU!`, '#c084fc');
      }
      this.animar(dt, 0, true);
      return;
    }
    if (this.estado === 'normal' || this.estado === 'arremessado' || this.estado === 'caido') {
      if (this.estado !== 'normal') { this.raio3d?.esconder(); if (this.feixe) this.feixe.ativo = false; }
    }
    super.atualizar(dt);
    // heróis que voam se recuperam no ar depois de arremessados (em vez de cair)
    if (this.estado === 'arremessado' && this.variante !== 'gigante' && this.tempoEstado > 0.3) {
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 2.2));
      this.vel.y += 22 * dt;
      if (this.vel.length() < 10) { this.estado = 'normal'; this.obj.rotation.set(0, this.obj.rotation.y, 0); this.atordoar(0.4); }
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

  iaRapido(dt) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    heroi.centro(_h);
    this.timer -= dt;
    this.centro(_c);
    if (this.fase === 'mover') {
      // avança em alta velocidade
      _d.subVectors(_h, _c);
      const dist = _d.length();
      _d.normalize().multiplyScalar(75);
      this.vel.lerp(_d, Math.min(1, dt * 5));
      if (dist < 2.8 && !heroi.morto) {
        heroi.levarDano(18);
        _v.copy(_d).normalize().multiplyScalar(85).y += 8;
        heroi.vel.copy(_v); // o herói sai voando (e atravessa o que tiver no caminho)
        heroi.atordoado = 0.5;
        this.jogo.congelar(0.07);
        this.soco = 1;
        jogo.camera.tremer(0.5);
        jogo.efeitos.ondaDeChoque(_h, 5, 0.3, 0xfff1a0, _v.normalize());
        jogo.audio?.soco(0.7);
        this.fase = 'recuar';
        this.timer = 1.1;
        const a = Math.random() * Math.PI * 2;
        this.vel.set(Math.cos(a) * 60, 15, Math.sin(a) * 60);
      }
      if (this.timer < -5) { this.fase = 'recuar'; this.timer = 1; }
    } else if (this.fase === 'recuar') {
      if (this.timer <= 0) { this.fase = 'esperar'; this.timer = 0.6 + Math.random() * 0.8; }
    } else {
      this.vel.multiplyScalar(Math.max(0, 1 - dt * 3));
      if (this.timer <= 0) { this.fase = 'mover'; this.timer = 0; }
    }
    this.pos.addScaledVector(this.vel, dt);
    if (this.pos.y < 0.5) { this.pos.y = 0.5; this.vel.y = Math.abs(this.vel.y); }
    this.olharPara(this.fase === 'esperar' ? _h : _v.copy(this.pos).add(this.vel), dt, 12);
    this.velAnim = this.vel.length();
    // rastro amarelo
    if (this.velAnim > 20) {
      jogo.efeitos.aditivo.emitir(_c.x, _c.y, _c.z, { vx: 0, vy: 0, vz: 0, vida: 0.35, tamIni: 1.4, tamFim: 0.2, alfa: 0.8, gravidade: 0, arrasto: 0, r: 1, g: 0.85, b: 0.2 });
      this.quebrarCaminho(1);
    }
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
    const cor = { raio: [0.4, 0.75, 1], rapido: [1, 0.85, 0.2], gigante: [0.75, 0.35, 1] }[this.variante];
    const hex = { raio: 0x7dd3fc, rapido: 0xfde047, gigante: 0xc084fc }[this.variante];
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
      if (n >= HEROI_NIVEL[tipo] && c[tipo] === 0 && this.esperaHeroi[tipo] <= 0) {
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
