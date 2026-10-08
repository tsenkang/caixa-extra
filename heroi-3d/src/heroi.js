// O herói: modelo feito com cápsulas/caixas, voo e colisão com prédios.
import * as THREE from 'three';
import { gradienteToon, materialContorno } from './modelos.js';

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

// raio em zigue-zague (emblema do Corisco)
function geoRaioEmblema(t) {
  const s = new THREE.Shape();
  const pts = [[0.2, 1], [-0.45, -0.05], [0.0, -0.05], [-0.25, -1], [0.5, 0.15], [0.05, 0.15], [0.35, 1]];
  s.moveTo(pts[0][0] * t, pts[0][1] * t);
  for (const [x, y] of pts.slice(1)) s.lineTo(x * t, y * t);
  return new THREE.ShapeGeometry(s);
}

// boneco articulado (usado pelo herói e pelos heróis inimigos)
// proporções de "herói de desenho": ombros largos, cintura fina, cotovelos e joelhos articulados
export function criarHumanoide(cores, escala = 1) {
  const mat = (c) => new THREE.MeshToonMaterial({ color: c, gradientMap: gradienteToon });
  // físico: multiplicadores de ombros, braços, pernas e cabeça (o Colosso é bem mais forte)
  const fis = { ombros: 1, bracos: 1, pernas: 1, cabeca: 1, ...(cores.fisico || {}) };
  const O = fis.ombros, B = fis.bracos, P = fis.pernas;
  const mUniforme = mat(cores.uniforme);
  const mDetalhe = mat(cores.detalhe);
  if (cores.brilho) { mDetalhe.emissive.set(cores.detalhe); mDetalhe.emissiveIntensity = 1.6; } // detalhes que brilham
  const mPele = mat(cores.pele ?? 0xf1c27d);
  const mBota = mat(cores.botas ?? cores.detalhe);
  const mCabelo = mat(cores.cabelo ?? 0x1a1a1a);
  const malha = (geo, m, x = 0, y = 0, z = 0, pai) => {
    const o = new THREE.Mesh(geo, m);
    o.position.set(x, y, z);
    pai.add(o);
    return o;
  };
  const elip = (r, sx, sy, sz, seg = 14) => new THREE.SphereGeometry(r, seg, Math.max(8, (seg * 0.7) | 0)).scale(sx, sy, sz);
  const tronco = (r1, r2, h, seg = 12) => new THREE.CylinderGeometry(r1, r2, h, seg);

  const raiz = new THREE.Group();
  const corpo = new THREE.Group();
  corpo.position.y = 1.0;
  corpo.rotation.order = 'YXZ';
  raiz.add(corpo);

  // quadril, cintura, peito
  malha(elip(0.2, 1.05, 0.62, 0.78), mDetalhe, 0, -0.02, 0, corpo); // sunga/calção
  malha(tronco(0.19, 0.17, 0.12).scale(1, 1, 0.75), mat(cores.cinto ?? 0xfacc15), 0, 0.09, 0, corpo); // cinto
  malha(new THREE.BoxGeometry(0.1, 0.08, 0.03), mat(cores.fivela ?? 0xfff3a0), 0, 0.09, 0.14, corpo); // fivela
  malha(tronco(0.24 * O, 0.18, 0.3).scale(1, 1, 0.68), mUniforme, 0, 0.28, 0, corpo); // abdômen
  malha(elip(0.29, O, 0.78, 0.62 * Math.sqrt(O)), mUniforme, 0, 0.5, 0, corpo); // peito
  malha(elip(0.12, 1.1 * O, 0.75, 0.55), mUniforme, -0.1 * O, 0.5, 0.09, corpo); // peitoral
  malha(elip(0.12, 1.1 * O, 0.75, 0.55), mUniforme, 0.1 * O, 0.5, 0.09, corpo);
  const mBraco = cores.bracosPele ? mPele : mUniforme;
  malha(elip(0.11 * B, 1, 0.9, 1), mUniforme, -0.31 * O, 0.6, 0, corpo); // ombros
  malha(elip(0.11 * B, 1, 0.9, 1), mUniforme, 0.31 * O, 0.6, 0, corpo);
  if (cores.espinhos) {
    for (const lado of [-1, 1]) for (const dz of [-0.05, 0.06]) {
      const e = malha(new THREE.ConeGeometry(0.045 * B, 0.2, 6), mat(cores.espinhos), lado * 0.33 * O, 0.72, dz, corpo);
      e.rotation.z = -lado * 0.5;
    }
  }
  if (cores.emblema !== undefined) {
    const geoEmb = cores.emblemaRaio ? geoRaioEmblema(0.13) : geoEstrela(0.11, 0.045);
    const matEmb = new THREE.MeshToonMaterial({ color: cores.emblema, gradientMap: gradienteToon, side: THREE.DoubleSide });
    if (cores.brilho) { matEmb.emissive.set(cores.emblema); matEmb.emissiveIntensity = 2; }
    const emb = new THREE.Mesh(geoEmb, matEmb);
    emb.position.set(0, 0.53, 0.185);
    emb.rotation.x = -0.12;
    emb.userData.semContorno = true;
    corpo.add(emb);
  }
  malha(tronco(0.065, 0.075, 0.14), mPele, 0, 0.73, 0, corpo); // pescoço

  // cabeça
  const cabeca = new THREE.Group();
  cabeca.position.y = 0.9 - (1 - fis.cabeca) * 0.12;
  cabeca.scale.setScalar(fis.cabeca);
  corpo.add(cabeca);
  malha(elip(0.135, 0.92, 1.12, 1), mPele, 0, 0, 0, cabeca);
  malha(elip(0.1, 1.05, 0.7, 0.95), mPele, 0, -0.07, 0.03, cabeca); // queixo
  malha(elip(0.022, 1, 1.3, 1.2, 8), mPele, 0, -0.01, 0.135, cabeca); // nariz
  for (const x of [-0.13, 0.13]) malha(elip(0.03, 0.6, 1, 0.8, 8), mPele, x, 0, -0.01, cabeca); // orelhas
  // olhos (branco + pupila) e sobrancelhas
  const matOlho = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const matPupila = new THREE.MeshBasicMaterial({ color: cores.olho ?? 0x1d3557 });
  const olhos = [];
  for (const x of [-0.05, 0.05]) {
    const o = malha(elip(0.026, 1.2, 0.9, 0.6, 10), matOlho, x, 0.025, 0.118, cabeca);
    o.userData.semContorno = true;
    olhos.push(o);
    const pu = malha(elip(0.012, 1, 1, 0.6, 8), matPupila, x, 0.025, 0.134, cabeca);
    pu.userData.semContorno = true;
    const sob = malha(new THREE.BoxGeometry(0.055, 0.012, 0.02), mCabelo, x, 0.065, 0.125, cabeca);
    sob.rotation.z = x > 0 ? -0.15 : 0.15;
    sob.userData.semContorno = true;
  }
  // cabelo com topete na frente
  const cab = malha(elip(0.145, 0.98, 0.72, 1.05), mCabelo, 0, 0.06, -0.015, cabeca);
  cab.rotation.x = -0.2;
  const topete = malha(elip(0.06, 1.3, 0.8, 1.2, 10), mCabelo, 0.03, 0.12, 0.1, cabeca);
  topete.rotation.z = -0.4;
  if (cores.mascara) {
    const masc = new THREE.Mesh(new THREE.CylinderGeometry(0.142, 0.142, 0.06, 18, 1, true), new THREE.MeshToonMaterial({ color: cores.mascara, gradientMap: gradienteToon, side: THREE.DoubleSide }));
    masc.position.y = 0.025;
    masc.userData.semContorno = true;
    cabeca.add(masc);
  }

  // braços com cotovelo
  const bracos = [], antebracos = [];
  for (const lado of [-1, 1]) {
    const ombro = new THREE.Group();
    ombro.position.set(lado * 0.34 * O, 0.58, 0);
    corpo.add(ombro);
    malha(tronco(0.08 * B, 0.065 * B, 0.32), mBraco, 0, -0.16, 0, ombro); // braço
    const cotovelo = new THREE.Group();
    cotovelo.position.y = -0.32;
    ombro.add(cotovelo);
    malha(new THREE.SphereGeometry(0.065 * B, 10, 8), mBraco, 0, 0, 0, cotovelo);
    malha(tronco(0.065 * B, 0.055 * B, 0.2), mBraco, 0, -0.1, 0, cotovelo); // antebraço
    malha(tronco(0.075 * B, 0.06 * B, 0.12), mDetalhe, 0, -0.2, 0, cotovelo); // punho da luva
    malha(elip(0.065 * B, 0.9, 1.2, 0.8), mDetalhe, 0, -0.32, 0.01, cotovelo); // mão
    bracos.push(ombro);
    antebracos.push(cotovelo);
  }
  // pernas com joelho
  const pernas = [], canelas = [];
  for (const lado of [-1, 1]) {
    const quadril = new THREE.Group();
    quadril.position.set(lado * 0.12, -0.04, 0);
    corpo.add(quadril);
    malha(tronco(0.105 * P, 0.08 * P, 0.46), mUniforme, 0, -0.23, 0, quadril); // coxa
    const joelho = new THREE.Group();
    joelho.position.y = -0.46;
    quadril.add(joelho);
    malha(new THREE.SphereGeometry(0.08 * P, 10, 8), mUniforme, 0, 0, 0, joelho);
    malha(tronco(0.08 * P, 0.065 * P, 0.2), mUniforme, 0, -0.1, 0, joelho); // canela
    malha(tronco(0.095 * P, 0.075 * P, 0.28), mBota, 0, -0.3, 0, joelho); // bota
    malha(tronco(0.1 * P, 0.1 * P, 0.05), mBota, 0, -0.17, 0, joelho); // borda da bota
    malha(elip(0.075, 1, 0.55, 1.6), mBota, 0, -0.44, 0.05, joelho); // pé
    pernas.push(quadril);
    canelas.push(joelho);
  }

  // capa
  let capa = null, capaGeo = null, capaBase = null;
  if (cores.capa !== undefined) {
    capa = new THREE.Group();
    capa.position.set(0, 0.64, -0.17);
    capaGeo = new THREE.PlaneGeometry(0.7, 1.35, 4, 10);
    capaGeo.translate(0, -0.675, 0);
    capaBase = Float32Array.from(capaGeo.attributes.position.array);
    const m = new THREE.Mesh(capaGeo, new THREE.MeshToonMaterial({ color: cores.capa, gradientMap: gradienteToon, side: THREE.DoubleSide }));
    m.userData.semContorno = true;
    capa.add(m);
    corpo.add(capa);
    // presilhas da capa nos ombros
    for (const x of [-0.2, 0.2]) malha(new THREE.SphereGeometry(0.04, 8, 6), mat(cores.cinto ?? 0xfacc15), x, 0.66, -0.12, corpo);
  }

  raiz.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  adicionarContornoBoneco(raiz);
  raiz.scale.setScalar(escala);
  return {
    raiz, corpo, cabeca, olhos, matOlho, bracoE: bracos[0], bracoD: bracos[1], antebracoE: antebracos[0], antebracoD: antebracos[1],
    pernaE: pernas[0], pernaD: pernas[1], canelaE: canelas[0], canelaD: canelas[1], capa, capaGeo, capaBase, t: 0,
  };
}

function adicionarContornoBoneco(raiz) {
  const malhas = [];
  raiz.traverse((o) => { if (o.isMesh && !o.userData.semContorno && !o.userData.contorno) malhas.push(o); });
  for (const m of malhas) {
    const c = new THREE.Mesh(m.geometry, materialContorno(0.014));
    c.userData.contorno = true;
    m.add(c);
  }
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
  const sSoco = e.soco > 0 ? Math.sin(e.soco * Math.PI) : 0;
  if (e.soco > 0) {
    if (e.socoLado === -1) { bEx = lerp(bEx, -1.6, sSoco); bEz = lerp(bEz, -0.1, sSoco); }
    else { bDx = lerp(bDx, -1.6, sSoco); bDz = lerp(bDz, 0.1, sSoco); }
  }

  // dobra dos cotovelos e joelhos
  let cE = -0.25, cD = -0.25, jE = 0.05, jD = 0.05;
  if (e.voando) {
    cD = e.rapidez > 0.35 ? 0 : -0.35;
    cE = -0.3;
    jE = 0.2 + Math.sin(t * 2.2) * 0.05; jD = 0.45 + Math.sin(t * 2.2 + 1) * 0.05;
  } else if (e.andar > 0.5) {
    jE = Math.max(0, pE) * 1.3 + 0.1; jD = Math.max(0, pD) * 1.3 + 0.1;
    cE = cD = -0.45 - Math.min(0.6, e.andar * 0.03);
  }
  if (e.segurando) cE = cD = -0.5;
  if (e.soco > 0) { if (e.socoLado === -1) cE = lerp(cE, 0, sSoco); else cD = lerp(cD, 0, sSoco); }
  if (rig.antebracoE) {
    rig.antebracoE.rotation.x = lerp(rig.antebracoE.rotation.x, cE, e.soco > 0 ? 1 : k);
    rig.antebracoD.rotation.x = lerp(rig.antebracoD.rotation.x, cD, e.soco > 0 ? 1 : k);
    rig.canelaE.rotation.x = lerp(rig.canelaE.rotation.x, jE, k);
    rig.canelaD.rotation.x = lerp(rig.canelaD.rotation.x, jD, k);
  }
  rig.bracoE.rotation.x = lerp(rig.bracoE.rotation.x, bEx, e.soco > 0 ? 1 : k);
  rig.bracoE.rotation.z = lerp(rig.bracoE.rotation.z, bEz, k);
  rig.bracoD.rotation.x = lerp(rig.bracoD.rotation.x, bDx, e.soco > 0 ? 1 : k);
  rig.bracoD.rotation.z = lerp(rig.bracoD.rotation.z, bDz, k);
  rig.pernaE.rotation.x = lerp(rig.pernaE.rotation.x, pE, k);
  rig.pernaD.rotation.x = lerp(rig.pernaD.rotation.x, pD, k);
  rig.corpo.rotation.x = lerp(rig.corpo.rotation.x, incl, Math.min(1, dt * 5));

  // capa balançando
  if (rig.capa) {
    const r = e.voando ? e.rapidez : Math.min(1, e.andar / 30);
    // a capa abre para trás pela velocidade, menos o quanto o corpo já está deitado no voo
    const abertura = Math.max(0.1, 0.12 + r * 1.3 - (e.inclinacao || 0) * 0.95);
    rig.capa.rotation.x = lerp(rig.capa.rotation.x, abertura, Math.min(1, dt * 4));
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
    this.socoLado = 1;
    this.atordoado = 0;
    this.dash = 0;
    this.raioQuebra = 0;
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
    let acel = this.superVelocidade ? 2.5 : 5;
    if (this.atordoado > 0) { this.atordoado -= dt; _desejo.set(0, 0, 0); acel = 0.9; } // levou um golpe forte: voa sem controle
    _v.copy(_desejo).multiplyScalar(velMax);
    if (this.dash > 0) this.dash -= dt; // durante o avanço/investida a velocidade é do combate
    else this.vel.lerp(_v, 1 - Math.exp(-acel * dt));

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
      const rq = this.raioQuebra || 1.3; // na investida o buraco é maior
      let n = jogo.predios.danificarEsfera(_centro, rq, 9999, { velBase: _base, forca: 10, origem: 'heroi', pedacos: 3 });
      _centro.addScaledVector(this.vel, 0.02);
      n += jogo.predios.danificarEsfera(_centro, rq, 9999, { velBase: _base, forca: 6, origem: 'heroi', pedacos: 2 });
      if (n > 0) {
        if (!(this.dash > 0)) this.vel.multiplyScalar(Math.max(0.8, 1 - n * 0.015));
        jogo.camera.tremer(0.12 + n * 0.03);
        jogo.efeitos?.poeira(_centro, 3, 2, 5);
        jogo.efeitos?.faiscas(_centro, 4, 10, [0.9, 0.85, 0.7]);
        if (this.tempoQuebra <= 0) { jogo.audio?.quebra(Math.min(1, 0.4 + n * 0.1)); this.tempoQuebra = 0.08; }
      }
    }
    this.tempoQuebra -= dt;

    // voando rápido por cima de gente/carros: tudo sai voando (no combo/investida quem cuida é o combate)
    if (rapido && !(this.dash > 0)) {
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
      andar: noChao && !this.superVelocidade ? horiz : 0, soco: this.soco, socoLado: this.socoLado, segurando: !!this.segurando,
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
