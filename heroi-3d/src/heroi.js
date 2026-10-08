// O herói: modelo feito com cápsulas/caixas, voo e colisão com prédios.
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _desejo = new THREE.Vector3();
const _centro = new THREE.Vector3();
const _base = new THREE.Vector3();

// estrela de 5 pontas (emblema)
function geoEstrela(r1, r2) {
  const s = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? r1 : r2;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) s.moveTo(x, y); else s.lineTo(x, y);
  }
  return new THREE.ShapeGeometry(s);
}

// boneco articulado (usado pelo herói e pelos heróis inimigos)
export function criarHumanoide(cores, escala = 1) {
  const mat = (c, extra = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, metalness: 0.15, ...extra });
  const mUniforme = mat(cores.uniforme);
  const mDetalhe = mat(cores.detalhe);
  const mPele = mat(cores.pele ?? 0xf1c27d, { metalness: 0 });
  const mBota = mat(cores.botas ?? cores.detalhe);

  const raiz = new THREE.Group();
  const corpo = new THREE.Group();
  corpo.position.y = 1.0;
  corpo.rotation.order = 'YXZ';
  raiz.add(corpo);

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.24, 0.36, 4, 12), mUniforme);
  torso.position.y = 0.36;
  torso.scale.set(1.2, 1, 0.8);
  corpo.add(torso);
  const cinto = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.27, 0.09, 14), mat(cores.cinto ?? 0xfacc15));
  cinto.position.y = 0.06;
  cinto.scale.z = 0.78;
  corpo.add(cinto);
  const calcao = new THREE.Mesh(new THREE.CylinderGeometry(0.27, 0.24, 0.16, 14), mDetalhe);
  calcao.position.y = -0.05;
  calcao.scale.z = 0.78;
  corpo.add(calcao);
  if (cores.emblema !== undefined) {
    const emb = new THREE.Mesh(geoEstrela(0.12, 0.05), mat(cores.emblema, { side: THREE.DoubleSide }));
    emb.position.set(0, 0.46, 0.2);
    corpo.add(emb);
  }

  const cabeca = new THREE.Group();
  cabeca.position.y = 0.92;
  corpo.add(cabeca);
  const rosto = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), mPele);
  rosto.scale.set(0.95, 1.08, 1);
  cabeca.add(rosto);
  const cabelo = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), mat(cores.cabelo ?? 0x1a1a1a));
  cabelo.position.set(0, 0.02, -0.02);
  cabelo.rotation.x = -0.35;
  cabeca.add(cabelo);
  if (cores.mascara) {
    const masc = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.07, 14, 1, true), mat(cores.mascara, { side: THREE.DoubleSide }));
    masc.position.y = 0.02;
    cabeca.add(masc);
  }
  const matOlho = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const olhos = [];
  for (const x of [-0.06, 0.06]) {
    const o = new THREE.Mesh(new THREE.SphereGeometry(0.028, 8, 6), matOlho);
    o.position.set(x, 0.02, 0.155);
    cabeca.add(o);
    olhos.push(o);
  }

  const membro = (r, comp, m) => {
    const g = new THREE.Mesh(new THREE.CapsuleGeometry(r, comp, 4, 8), m);
    g.position.y = -(comp / 2 + r * 0.6);
    return g;
  };
  const bracos = [];
  for (const lado of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(lado * 0.36, 0.6, 0);
    piv.add(membro(0.075, 0.48, mUniforme));
    const luva = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), mDetalhe);
    luva.position.y = -0.66;
    piv.add(luva);
    corpo.add(piv);
    bracos.push(piv);
  }
  const pernas = [];
  for (const lado of [-1, 1]) {
    const piv = new THREE.Group();
    piv.position.set(lado * 0.13, -0.02, 0);
    piv.add(membro(0.1, 0.6, mUniforme));
    const bota = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.34, 10), mBota);
    bota.position.y = -0.8;
    piv.add(bota);
    corpo.add(piv);
    pernas.push(piv);
  }

  let capa = null, capaGeo = null, capaBase = null;
  if (cores.capa !== undefined) {
    capa = new THREE.Group();
    capa.position.set(0, 0.62, -0.19);
    capaGeo = new THREE.PlaneGeometry(0.66, 1.3, 3, 8);
    capaGeo.translate(0, -0.65, 0);
    capaBase = Float32Array.from(capaGeo.attributes.position.array);
    const m = new THREE.Mesh(capaGeo, mat(cores.capa, { side: THREE.DoubleSide, roughness: 0.8, metalness: 0 }));
    capa.add(m);
    corpo.add(capa);
  }

  raiz.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
  raiz.scale.setScalar(escala);
  return { raiz, corpo, cabeca, olhos, matOlho, bracoE: bracos[0], bracoD: bracos[1], pernaE: pernas[0], pernaD: pernas[1], capa, capaGeo, capaBase, t: 0 };
}

const lerp = (a, b, t) => a + (b - a) * t;

// animação simples do boneco
// e: { voando, rapidez(0-1), inclinacao, andar(m/s), soco(0-1), segurando, dt }
export function animarHumanoide(rig, e) {
  const dt = e.dt;
  rig.t += dt;
  const t = rig.t;
  const k = Math.min(1, dt * 8);
  let bEx = 0, bEz = 0.12, bDx = 0, bDz = -0.12, pE = 0, pD = 0, incl = 0;

  if (e.voando) {
    incl = e.inclinacao;
    if (e.rapidez > 0.35) {
      bDx = -2.95; bDz = -0.05; // braço estendido para frente (pose clássica)
      bEx = 0.3; bEz = 0.25;
    } else {
      bEz = 0.35 + Math.sin(t * 2) * 0.05; bDz = -0.35 - Math.sin(t * 2) * 0.05;
      bEx = -0.2; bDx = -0.2;
    }
    pE = 0.08 + Math.sin(t * 2.2) * 0.06;
    pD = 0.18 + Math.sin(t * 2.2 + 1) * 0.06;
  } else if (e.andar > 0.5) {
    const ritmo = Math.min(14, 4 + e.andar * 0.6);
    const amp = Math.min(0.9, 0.3 + e.andar * 0.05);
    const s = Math.sin(t * ritmo);
    pE = s * amp; pD = -s * amp;
    bEx = -s * amp * 0.8; bDx = s * amp * 0.8;
    incl = Math.min(0.35, e.andar * 0.02);
  } else {
    bEz = 0.12 + Math.sin(t * 1.5) * 0.02; bDz = -bEz;
  }
  if (e.segurando) { bEx = bDx = -1.45; bEz = -0.15; bDz = 0.15; }
  if (e.soco > 0) { const s = Math.sin(e.soco * Math.PI); bDx = lerp(bDx, -1.6, s); bDz = lerp(bDz, 0.1, s); }

  rig.bracoE.rotation.x = lerp(rig.bracoE.rotation.x, bEx, k);
  rig.bracoE.rotation.z = lerp(rig.bracoE.rotation.z, bEz, k);
  rig.bracoD.rotation.x = lerp(rig.bracoD.rotation.x, bDx, e.soco > 0 ? 1 : k);
  rig.bracoD.rotation.z = lerp(rig.bracoD.rotation.z, bDz, k);
  rig.pernaE.rotation.x = lerp(rig.pernaE.rotation.x, pE, k);
  rig.pernaD.rotation.x = lerp(rig.pernaD.rotation.x, pD, k);
  rig.corpo.rotation.x = lerp(rig.corpo.rotation.x, incl, Math.min(1, dt * 5));

  // capa balançando
  if (rig.capa) {
    const r = e.voando ? e.rapidez : Math.min(1, e.andar / 30);
    rig.capa.rotation.x = lerp(rig.capa.rotation.x, 0.12 + r * 1.25 + (e.voando ? 0.15 : 0), Math.min(1, dt * 4));
    const pos = rig.capaGeo.attributes.position;
    const base = rig.capaBase;
    const freq = 5 + r * 16;
    const amp = 0.04 + r * 0.1;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      const d = -y; // distância do ombro
      pos.array[i * 3 + 2] = Math.sin(t * freq + y * 4 + x * 3) * amp * d;
      pos.array[i * 3] = x * (1 + d * 0.25);
    }
    pos.needsUpdate = true;
  }
}

function anguloLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

export class Heroi {
  constructor(jogo) {
    this.jogo = jogo;
    this.rig = criarHumanoide({
      uniforme: 0x1d4ed8, detalhe: 0xdc2626, capa: 0xd61f1f, botas: 0xdc2626,
      cinto: 0xfacc15, emblema: 0xffffff, cabelo: 0x161616,
    });
    jogo.cena.add(this.rig.raiz);
    this.pos = new THREE.Vector3(0, 0, 0);
    this.vel = new THREE.Vector3();
    this.anterior = new THREE.Vector3();
    this.yawCorpo = 0;
    this.vidaMax = 600;
    this.vida = this.vidaMax;
    this.tempoSemDano = 99;
    this.superVelocidade = false;
    this.olharCamera = false; // vira para onde a câmera olha (laser, pegar)
    this.segurando = null;
    this.soco = 0;
    this.morto = false;
    this.tempoQuebra = 0;
  }

  centro(out) { return out.copy(this.pos).setY(this.pos.y + 1.0); }

  // pontos do corpo usados para colisão com blocos
  bateEmPredio(p) {
    const pr = this.jogo.predios;
    return pr.solido(p.x, p.y + 0.3, p.z) || pr.solido(p.x, p.y + 1.0, p.z) || pr.solido(p.x, p.y + 1.8, p.z);
  }

  atualizar(dt, ctrl, cam) {
    if (this.morto) return;
    const jogo = this.jogo;
    // ---------- movimento ----------
    _desejo.set(0, 0, 0);
    if (ctrl.segura('KeyW')) _desejo.add(cam.frente);
    if (ctrl.segura('KeyS')) _desejo.sub(cam.frente);
    if (ctrl.segura('KeyD')) _desejo.add(cam.direita);
    if (ctrl.segura('KeyA')) _desejo.sub(cam.direita);
    if (_desejo.lengthSq() > 0) _desejo.normalize();
    if (ctrl.segura('Space')) _desejo.y += 1;
    if (ctrl.segura('ControlLeft', 'ControlRight', 'KeyC')) _desejo.y -= 1;
    if (_desejo.lengthSq() > 1) _desejo.normalize();

    this.superVelocidade = ctrl.segura('ShiftLeft', 'ShiftRight') && _desejo.lengthSq() > 0;
    const velMax = this.superVelocidade ? 115 : 32;
    const acel = this.superVelocidade ? 2.5 : 5;
    _v.copy(_desejo).multiplyScalar(velMax);
    this.vel.lerp(_v, 1 - Math.exp(-acel * dt));

    this.anterior.copy(this.pos);
    const rapido = this.vel.length() > 12;
    if (rapido) {
      this.pos.addScaledVector(this.vel, dt);
    } else if (!this.bateEmPredio(this.pos)) {
      // devagar: colide com as paredes (eixo por eixo para deslizar)
      for (const eixo of ['x', 'y', 'z']) {
        const antes = this.pos[eixo];
        this.pos[eixo] += this.vel[eixo] * dt;
        if (this.bateEmPredio(this.pos)) { this.pos[eixo] = antes; this.vel[eixo] = 0; }
      }
    } else {
      this.pos.addScaledVector(this.vel, dt); // já está dentro de um bloco: deixa sair
    }
    if (this.pos.y < 0) { this.pos.y = 0; if (this.vel.y < 0) this.vel.y = 0; }
    if (this.pos.y > 400) { this.pos.y = 400; this.vel.y = Math.min(0, this.vel.y); }
    const r = Math.hypot(this.pos.x, this.pos.z);
    if (r > 800) { this.pos.x *= 800 / r; this.pos.z *= 800 / r; }

    // ---------- atravessar prédios (abre um buraco do tamanho do corpo) ----------
    if (rapido) {
      this.centro(_centro);
      _base.copy(this.vel).multiplyScalar(0.7);
      let n = jogo.predios.danificarEsfera(_centro, 1.3, 9999, { velBase: _base, forca: 10, origem: 'heroi', pedacos: 3 });
      _centro.addScaledVector(this.vel, 0.02);
      n += jogo.predios.danificarEsfera(_centro, 1.3, 9999, { velBase: _base, forca: 6, origem: 'heroi', pedacos: 2 });
      if (n > 0) {
        this.vel.multiplyScalar(Math.max(0.8, 1 - n * 0.015));
        jogo.camera.tremer(0.12 + n * 0.03);
        jogo.efeitos?.poeira(_centro, 3, 2, 5);
        jogo.efeitos?.faiscas(_centro, 4, 10, [0.9, 0.85, 0.7]);
        if (this.tempoQuebra <= 0) { jogo.audio?.quebra(Math.min(1, 0.4 + n * 0.1)); this.tempoQuebra = 0.08; }
      }
    }
    this.tempoQuebra -= dt;

    // voando rápido por cima de gente/carros: tudo sai voando
    if (rapido) {
      this.centro(_centro);
      for (const e of jogo.entidades) {
        if (e === this.segurando || e.remover || e.estado === 'preso' || e.estado === 'arremessado') continue;
        e.centro(_v);
        const r = e.raio + 1;
        if (_v.distanceToSquared(_centro) > r * r) continue;
        e.levarDano(this.vel.length() * 0.8, 'heroi');
        _v.copy(this.vel).multiplyScalar(1.1 / Math.sqrt(e.massa)).y += 8;
        e.lancar(_v, true);
        jogo.camera.tremer(0.2);
        jogo.audio?.impacto(0.6, _centro);
      }
    }

    // ---------- vida ----------
    this.tempoSemDano += dt;
    if (this.tempoSemDano > 4) this.vida = Math.min(this.vidaMax, this.vida + 30 * dt);
    this.soco = Math.max(0, this.soco - dt * 4);

    this.animar(dt, cam);
  }

  animar(dt, cam) {
    const rig = this.rig;
    const vel = this.vel.length();
    const noChao = this.pos.y < 0.05;
    const horiz = Math.hypot(this.vel.x, this.vel.z);
    const voando = !noChao || this.superVelocidade || this.vel.y > 1;

    // para onde o corpo olha
    let yawAlvo = this.yawCorpo;
    if (this.olharCamera || this.segurando || this.soco > 0) yawAlvo = cam.yaw + Math.PI;
    else if (horiz > 1.5) yawAlvo = Math.atan2(this.vel.x, this.vel.z);
    this.yawCorpo = anguloLerp(this.yawCorpo, yawAlvo, Math.min(1, dt * 10));
    rig.raiz.rotation.y = this.yawCorpo;
    rig.raiz.position.copy(this.pos);

    // inclinação do corpo na direção do voo
    let incl = 0;
    if (voando && vel > 10 && !this.olharCamera && !this.segurando) {
      const dy = this.vel.y / vel;
      incl = Math.acos(Math.max(-1, Math.min(1, dy))) * Math.min(1, (vel - 10) / 30);
      if (horiz < 3) incl = Math.min(incl, 0.3); // subindo/descendo reto
      incl = Math.min(incl, 2.6);
    }
    animarHumanoide(rig, {
      dt, voando, rapidez: Math.min(1, vel / 60), inclinacao: incl,
      andar: noChao && !this.superVelocidade ? horiz : 0, soco: this.soco, segurando: !!this.segurando,
    });
    if (!voando) rig.raiz.position.y += 0;
    else if (vel < 5) rig.raiz.position.y += Math.sin(rig.t * 2) * 0.08; // flutuando
  }

  levarDano(qtd) {
    if (this.morto) return;
    this.vida -= qtd;
    this.tempoSemDano = 0;
    this.jogo.hud?.piscarDano(Math.min(1, qtd / 40));
    if (this.vida <= 0) {
      this.vida = 0;
      this.morto = true;
      this.jogo.fimDeJogo?.();
    }
  }
}
