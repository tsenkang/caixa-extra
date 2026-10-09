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

// material dos personagens: sombreado de desenho + luz de contorno (brilho fino nas bordas, como em animação)
export function materialBoneco(cor, op = {}) {
  const m = new THREE.MeshToonMaterial({ color: cor, gradientMap: gradienteToon, ...op });
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `
      {
        float borda = 1.0 - max(dot(normalize(normal), normalize(vViewPosition)), 0.0);
        outgoingLight += (diffuseColor.rgb * 0.55 + 0.22) * smoothstep(0.6, 0.76, borda) * 0.5;
      }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'boneco-borda';
  return m;
}

// boneco articulado (usado pelo herói e pelos heróis inimigos)
// proporções de "herói de desenho": ombros largos, cintura fina, cotovelos e joelhos articulados
export function criarHumanoide(cores, escala = 1) {
  const mat = (c) => materialBoneco(c);
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
  if (cores.bigode !== undefined) {
    // bigode grosso (o Viltrumita)
    const big = malha(elip(0.05, 1.5, 0.45, 0.6, 10), mat(cores.bigode), 0, -0.045, 0.128, cabeca);
    big.userData.semContorno = true;
  }
  // olhos (branco + pupila) e sobrancelhas
  const matOlho = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const matPupila = new THREE.MeshBasicMaterial({ color: cores.olho ?? 0x1d3557 });
  const olhos = [], olhosG = [];
  const matBrilhoOlho = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const x of [-0.05, 0.05]) {
    // cada olho fica num grupo (para piscar)
    const g = new THREE.Group();
    g.position.set(x, 0.025, 0.118);
    cabeca.add(g);
    olhosG.push(g);
    const o = malha(elip(0.026, 1.2, 0.9, 0.6, 10), matOlho, 0, 0, 0, g);
    o.userData.semContorno = true;
    olhos.push(o);
    const pu = malha(elip(0.012, 1, 1, 0.6, 8), matPupila, 0, 0, 0.016, g);
    pu.userData.semContorno = true;
    const br = malha(new THREE.SphereGeometry(0.0045, 6, 4), matBrilhoOlho, 0.005, 0.006, 0.022, g); // brilhinho no olho
    br.userData.semContorno = true;
    const sob = malha(new THREE.BoxGeometry(0.055, 0.012, 0.02), mCabelo, x, 0.065, 0.125, cabeca);
    sob.rotation.z = x > 0 ? -0.15 : 0.15;
    sob.userData.semContorno = true;
  }
  // boca (traço) e queixo marcado
  const boca = malha(new THREE.BoxGeometry(0.045, 0.007, 0.01), new THREE.MeshBasicMaterial({ color: 0x5a2a22 }), 0, -0.075, 0.122, cabeca);
  boca.userData.semContorno = true;
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
    malha(elip(0.07 * B, 1, 1.6, 1.05), mBraco, 0, -0.13, 0.025, ombro); // bíceps
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
    malha(elip(0.095 * P, 1, 2, 1.05), mUniforme, 0, -0.2, 0.02, quadril); // músculo da coxa
    const joelho = new THREE.Group();
    joelho.position.y = -0.46;
    quadril.add(joelho);
    malha(new THREE.SphereGeometry(0.08 * P, 10, 8), mUniforme, 0, 0, 0, joelho);
    malha(tronco(0.08 * P, 0.065 * P, 0.2), mUniforme, 0, -0.1, 0, joelho); // canela
    malha(elip(0.07 * P, 1, 1.5, 1.1), mUniforme, 0, -0.08, -0.025, joelho); // panturrilha
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
    capa.rotation.order = 'ZXY';
    capa.position.set(0, 0.64, -0.17);
    capaGeo = new THREE.PlaneGeometry(0.7, 1.35, 6, 12);
    capaGeo.translate(0, -0.675, 0);
    capaBase = Float32Array.from(capaGeo.attributes.position.array);
    const m = new THREE.Mesh(capaGeo, materialBoneco(cores.capa, { side: THREE.DoubleSide }));
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
    raiz, corpo, cabeca, olhos, olhosG, matOlho, bracoE: bracos[0], bracoD: bracos[1], antebracoE: antebracos[0], antebracoD: antebracos[1],
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

const suave = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const saidaRapida = (x) => 1 - (1 - x) * (1 - x) * (1 - x);

// animação do boneco (herói e heróis inimigos)
// e: { dt, voando, rapidez(0-1), inclinacao, andar(m/s), soco(1->0), socoLado, segurando,
//      virada (giro em rad/s, para inclinar nas curvas), atordoado, pouso (0-1), pousoForte,
//      olhar (inclinação da cabeça), corrida (velocista), pesado (gigante), investida }
export function animarHumanoide(rig, e) {
  const dt = e.dt;
  rig.t += dt;
  const t = rig.t;
  const est = rig.est || (rig.est = { parado: 0, guarda: 0, piscar: 2 + Math.random() * 3, fase: 0, rolar: 0, torcao: 0, altura: 0 });
  const k = Math.min(1, dt * 9);
  const lento = Math.min(1, dt * 4);

  // alvos da pose
  let bEx = 0, bEy = 0, bEz = 0.12, bDx = 0, bDy = 0, bDz = -0.12, cE = -0.25, cD = -0.25;
  let pE = 0, pD = 0, pEz = 0.03, pDz = -0.03, jE = 0.05, jD = 0.05;
  let incl = 0, torcao = 0, rolar = 0, altura = 0, cabX = 0, cabY = 0, cabZ = 0, esticar = 0;
  const noChao = !e.voando && !(e.andar > 0.5);
  est.parado = noChao ? est.parado + dt : 0;

  if (e.voando && e.corrida) {
    // velocista: corre no ar com passadas enormes
    est.fase += dt * 24;
    const sn = Math.sin(est.fase);
    pE = sn * 1.15; pD = -sn * 1.15;
    jE = 0.3 + Math.max(0, -sn) * 1.7; jD = 0.3 + Math.max(0, sn) * 1.7;
    bEx = -sn * 1.2; bDx = sn * 1.2; bEz = 0.15; bDz = -0.15;
    cE = cD = -1.45;
    incl = 0.65; torcao = sn * 0.25; cabX = -0.45;
    rolar = Math.max(-0.8, Math.min(0.8, -(e.virada || 0) * 0.2));
  } else if (e.voando) {
    const f = suave(0.25, 0.6, e.rapidez); // 0 = pairando, 1 = voo rápido
    // pairando: pernas soltas, braços abertos, flutuando
    const hb = Math.sin(t * 2);
    const h = {
      bEx: -0.15, bEz: 0.42 + hb * 0.06, bDx: -0.15, bDz: -0.42 - hb * 0.06, cE: -0.45, cD: -0.45,
      pE: 0.04 + Math.sin(t * 2.2) * 0.08, pD: 0.3 + Math.sin(t * 2.2 + 1) * 0.08, jE: 0.25, jD: 0.75,
    };
    // voo rápido: punho direito na frente, braço esquerdo colado, pernas juntas tremulando
    const tr = Math.sin(t * 16) * 0.05 * e.rapidez;
    const v = { bEx: 0.35, bEz: 0.16, bDx: -2.95, bDz: -0.05, cE: -0.12, cD: 0, pE: 0.1 + tr, pD: 0.16 - tr, jE: 0.12, jD: 0.32 };
    if (e.investida) { v.bEx = -2.9; v.bEz = 0.08; v.cE = 0; } // investida: os dois punhos na frente
    bEx = h.bEx + (v.bEx - h.bEx) * f; bEz = h.bEz + (v.bEz - h.bEz) * f;
    bDx = h.bDx + (v.bDx - h.bDx) * f; bDz = h.bDz + (v.bDz - h.bDz) * f;
    cE = h.cE + (v.cE - h.cE) * f; cD = h.cD + (v.cD - h.cD) * f;
    pE = h.pE + (v.pE - h.pE) * f; pD = h.pD + (v.pD - h.pD) * f;
    jE = h.jE + (v.jE - h.jE) * f; jD = h.jD + (v.jD - h.jD) * f;
    pEz = 0.06 * (1 - f) + 0.015; pDz = -pEz;
    incl = e.inclinacao || 0;
    altura = hb * 0.04 * (1 - f);
    cabX = -incl * 0.55; // a cabeça olha para frente mesmo deitado no voo
    // inclina o corpo nas curvas, como um avião
    rolar = Math.max(-0.9, Math.min(0.9, -(e.virada || 0) * 0.3)) * (0.3 + f * 0.7);
    cabZ = -rolar * 0.3;
    esticar = Math.max(0, (e.rapidez - 0.75) / 0.25) * f; // estica um pouco em alta velocidade (efeito de desenho)
  } else if (e.andar > 0.5) {
    // caminhada que vira corrida
    const corre = suave(5, 15, e.andar);
    const ritmo = e.pesado ? 2.2 + e.andar * 0.2 : Math.min(15, 5.5 + e.andar * 0.55);
    est.fase += dt * ritmo;
    const sn = Math.sin(est.fase), cs = Math.cos(est.fase);
    const amp = e.pesado ? 0.45 : 0.42 + corre * 0.55;
    pE = sn * amp; pD = -sn * amp;
    jE = 0.08 + Math.max(0, -sn) * amp * 1.5 + corre * 0.25;
    jD = 0.08 + Math.max(0, sn) * amp * 1.5 + corre * 0.25;
    bEx = -sn * amp * 0.85; bDx = sn * amp * 0.85;
    bEz = 0.12; bDz = -0.12;
    cE = cD = -0.3 - corre * 1.15; // cotovelo dobra correndo
    torcao = sn * (0.1 + corre * 0.12); // quadril e ombros giram
    incl = 0.04 + corre * 0.28;
    altura = Math.abs(cs) * (0.03 + corre * 0.06) - corre * 0.05; // sobe e desce a cada passo
    rolar = sn * (e.pesado ? 0.09 : 0.03); // o gigante balança de um lado para o outro
    cabX = -incl * 0.5;
  } else {
    // parado: respira; depois de um tempo faz a pose heroica (mãos na cintura) e olha em volta
    const resp = Math.sin(t * 1.7);
    altura = resp * 0.008;
    bEz = 0.15 + resp * 0.02; bDz = -bEz;
    cE = cD = -0.2;
    pEz = 0.06; pDz = -0.06;
    cabX = resp * 0.02;
    const pose = suave(2.5, 3.4, est.parado);
    if (pose > 0) {
      // mãos na cintura, cotovelos abertos
      bEx += (0.8 - bEx) * pose; bEy = 1.1 * pose; bEz += (-0.7 - bEz) * pose;
      bDx += (0.8 - bDx) * pose; bDy = -1.1 * pose; bDz += (0.7 - bDz) * pose;
      cE += (-1.2 - cE) * pose; cD += (-1.2 - cD) * pose;
      pEz += 0.07 * pose; pDz -= 0.07 * pose;
      incl -= 0.07 * pose; // peito estufado
      cabY = Math.sin(t * 0.45) * 0.45 * pose;
      cabX -= 0.08 * pose;
    }
  }
  if (e.olhar !== undefined && !e.corrida) cabX += Math.max(-0.6, Math.min(0.6, e.olhar));

  // segurando alguém na frente
  if (e.segurando) { bEx = bDx = -1.45; bEz = -0.15; bDz = 0.15; cE = cD = -0.5; }

  // guarda de lutador por um tempo depois de socar
  if (e.soco > 0) est.guarda = 0.9;
  est.guarda = Math.max(0, est.guarda - dt);
  const g = suave(0, 0.3, est.guarda) * (e.segurando ? 0 : 1);
  if (g > 0) {
    bEx += (-1.05 - bEx) * g; bDx += (-1.05 - bDx) * g;
    bEz += (0.3 - bEz) * g; bDz += (-0.3 - bDz) * g;
    cE += (-1.75 - cE) * g; cD += (-1.75 - cD) * g;
    cabX += 0.08 * g;
  }

  // soco: prepara (puxa o braço), golpeia (estica com o corpo girando) e recolhe
  let socando = false;
  if (e.soco > 0 && !e.segurando) {
    socando = true;
    const p = 1 - e.soco;
    let ext;
    if (p < 0.16) ext = -p / 0.16; // puxa para trás
    else if (p < 0.4) ext = -1 + 2 * saidaRapida((p - 0.16) / 0.24); // estica rápido
    else ext = 1 - suave(0.4, 1, p) * 0.9; // recolhe devagar
    const lado = e.socoLado === -1 ? -1 : 1;
    const frente = Math.max(0, ext), tras = Math.max(0, -ext);
    const bx = -1.05 + (-1.62 + 1.05) * frente + 0.7 * tras;
    const cx = -1.75 * (1 - frente) + 0 * frente;
    if (lado === -1) { bEx = bx; cE = cx; bEz = 0.3 - frente * 0.22; } else { bDx = bx; cD = cx; bDz = -0.3 + frente * 0.22; }
    torcao = -lado * 0.35 * ext; // o tronco gira junto com o soco
    incl += 0.18 * frente;
    pE += lado === -1 ? -0.15 * frente : 0.2 * frente; pD += lado === -1 ? 0.2 * frente : -0.15 * frente;
  }

  // atordoado: braços e pernas se debatendo, corpo arqueado
  if (e.atordoado) {
    bEx = -2.2 + Math.sin(t * 17) * 0.6; bDx = -1.9 + Math.sin(t * 15 + 1) * 0.6;
    bEz = 0.95; bDz = -0.95; cE = cD = -0.6;
    pE = -0.5 + Math.sin(t * 13) * 0.35; pD = 0.45 + Math.sin(t * 11) * 0.35;
    jE = jD = 0.85;
    incl = -0.55; rolar = Math.sin(t * 9) * 0.3; cabX = -0.35; esticar = 0;
  }

  // aterrissagem: agachada, ou a "pose de super-herói" (joelho e punho no chão) se foi forte
  const a = e.pouso || 0;
  if (a > 0) {
    const w = suave(0, 0.35, a);
    const P = e.pousoForte
      ? { pE: -1.35, jE: 1.5, pD: 0.25, jD: 1.75, bDx: -0.55, bDz: -0.2, cD: -0.15, bEx: 0.7, bEz: 0.6, cE: -0.35, incl: 0.55, altura: -0.5, cabX: -0.25 }
      : { pE: -0.7, jE: 1.2, pD: -0.55, jD: 1.1, bDx: -0.4, bDz: -0.75, cD: -0.3, bEx: -0.4, bEz: 0.75, cE: -0.3, incl: 0.35, altura: -0.3, cabX: -0.2 };
    pE += (P.pE - pE) * w; jE += (P.jE - jE) * w; pD += (P.pD - pD) * w; jD += (P.jD - jD) * w;
    bDx += (P.bDx - bDx) * w; bDz += (P.bDz - bDz) * w; cD += (P.cD - cD) * w;
    bEx += (P.bEx - bEx) * w; bEz += (P.bEz - bEz) * w; cE += (P.cE - cE) * w;
    incl += (P.incl - incl) * w; altura += (P.altura - altura) * w; cabX += (P.cabX - cabX) * w;
    torcao *= 1 - w; rolar *= 1 - w;
  }

  // aplica (soco direto, o resto suavizado)
  if (socando || g > 0 || e.segurando || e.atordoado || a > 0) bEy = bDy = 0; // a torção das mãos na cintura só vale parado
  const kb = socando ? 1 : k;
  rig.bracoE.rotation.y = lerp(rig.bracoE.rotation.y, bEy, k);
  rig.bracoD.rotation.y = lerp(rig.bracoD.rotation.y, bDy, k);
  if (rig.antebracoE) {
    rig.antebracoE.rotation.x = lerp(rig.antebracoE.rotation.x, cE, kb);
    rig.antebracoD.rotation.x = lerp(rig.antebracoD.rotation.x, cD, kb);
    rig.canelaE.rotation.x = lerp(rig.canelaE.rotation.x, jE, a > 0 ? 1 : k);
    rig.canelaD.rotation.x = lerp(rig.canelaD.rotation.x, jD, a > 0 ? 1 : k);
  }
  rig.bracoE.rotation.x = lerp(rig.bracoE.rotation.x, bEx, kb);
  rig.bracoE.rotation.z = lerp(rig.bracoE.rotation.z, bEz, kb);
  rig.bracoD.rotation.x = lerp(rig.bracoD.rotation.x, bDx, kb);
  rig.bracoD.rotation.z = lerp(rig.bracoD.rotation.z, bDz, kb);
  rig.pernaE.rotation.x = lerp(rig.pernaE.rotation.x, pE, a > 0 ? 1 : k);
  rig.pernaD.rotation.x = lerp(rig.pernaD.rotation.x, pD, a > 0 ? 1 : k);
  rig.pernaE.rotation.z = lerp(rig.pernaE.rotation.z, pEz, k);
  rig.pernaD.rotation.z = lerp(rig.pernaD.rotation.z, pDz, k);
  rig.corpo.rotation.x = lerp(rig.corpo.rotation.x, incl, a > 0 || socando ? Math.min(1, dt * 14) : Math.min(1, dt * 5));
  est.torcao = lerp(est.torcao, torcao, socando ? Math.min(1, dt * 25) : k);
  est.rolar = lerp(est.rolar, rolar, lento);
  rig.corpo.rotation.y = est.torcao;
  rig.corpo.rotation.z = est.rolar;
  est.altura = lerp(est.altura, altura, a > 0 ? Math.min(1, dt * 20) : k);
  rig.corpo.position.y = 1.0 + est.altura;
  rig.corpo.scale.set(1 - esticar * 0.05, 1 + esticar * 0.1, 1 - esticar * 0.05);
  rig.cabeca.rotation.x = lerp(rig.cabeca.rotation.x, cabX, k);
  rig.cabeca.rotation.y = lerp(rig.cabeca.rotation.y, cabY - est.torcao * 0.6, lento);
  rig.cabeca.rotation.z = lerp(rig.cabeca.rotation.z, cabZ, lento);

  // piscar
  if (rig.olhosG) {
    est.piscar -= dt;
    if (est.piscar < -0.12) est.piscar = 2 + Math.random() * 4;
    const fechado = est.piscar < 0 ? 0.12 : e.atordoado ? 0.45 : 1;
    for (const o of rig.olhosG) o.scale.y = fechado;
  }

  // capa: abre para trás com a velocidade, balança nas curvas, ondula com vento
  if (rig.capa) {
    const r = e.voando ? e.rapidez : Math.min(1, e.andar / 30);
    const abertura = Math.max(0.1, 0.12 + r * 1.3 - (e.inclinacao || 0) * 0.95 + a * 0.5 + (e.atordoado ? 0.6 : 0));
    rig.capa.rotation.x = lerp(rig.capa.rotation.x, abertura, Math.min(1, dt * 4));
    rig.capa.rotation.z = lerp(rig.capa.rotation.z, -est.rolar * 0.7 - est.torcao * 0.6, Math.min(1, dt * 3));
    const pos = rig.capaGeo.attributes.position;
    const base = rig.capaBase;
    const freq = 4 + r * 18;
    const amp = 0.035 + r * 0.11;
    for (let i = 0; i < pos.count; i++) {
      const x = base[i * 3], y = base[i * 3 + 1];
      const d = -y; // distância do ombro
      const onda = Math.sin(t * freq + y * 4.5 + x * 3) + Math.sin(t * freq * 1.7 - y * 7 + x * 5) * 0.35;
      pos.array[i * 3 + 2] = onda * amp * d - Math.abs(x) * 0.12 * (1 - r); // as pontas curvam em volta do corpo
      pos.array[i * 3] = x * (1 + d * (0.2 + r * 0.15));
    }
    pos.needsUpdate = true;
    rig.capaGeo.computeVertexNormals();
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
    if (this.morto) { this.animarMorte(dt); return; }
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
    const vyAntes = this.vel.y;
    const noArAntes = this.pos.y > 0.05;
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
    // ---------- aterrissagem e decolagem ----------
    if (noArAntes && this.pos.y <= 0.05 && vyAntes < -14) this.aterrissar(vyAntes, Math.hypot(this.vel.x, this.vel.z));
    if (!noArAntes && this.pos.y > 0.05 && this.vel.y > 8 && !(this.pouso > 0.3)) {
      jogo.efeitos?.poeira(this.pos, 4, 2, 4); // decolagem levanta poeira
      jogo.efeitos?.ondaDeChoque(_v.copy(this.pos).setY(0.3), 4, 0.3, 0xd8c9a8);
    }
    if (this.pouso > 0) this.pouso = Math.max(0, this.pouso - dt * (this.pousoForte ? 0.9 : 2.2) * (_desejo.lengthSq() > 0 ? 3 : 1));
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

  // pouso no chão: agacha, ou "pose de super-herói" com onda de choque se vier rápido
  aterrissar(vy, horiz) {
    const jogo = this.jogo;
    const forte = vy < -40 || horiz > 70;
    this.pouso = 1;
    this.pousoForte = forte;
    _v.copy(this.pos).setY(0.3);
    if (forte) {
      this.vel.x *= 0.1; this.vel.z *= 0.1;
      jogo.efeitos?.ondaDeChoque(_v, 16, 0.5, 0xd8c9a8);
      jogo.efeitos?.ondaDeChoque(_v, 9, 0.3, 0xffffff);
      jogo.efeitos?.poeira(_v, 14, 6, 7);
      jogo.efeitos?.lascas?.(_v, 10, _base.set(0, 8, 0), new THREE.Color(0x777777));
      jogo.camera?.tremer(0.55);
      jogo.camera?.socoFov?.(5);
      jogo.detritos?.empurrar(_v, 14, 14);
      jogo.audio?.impacto(1, _v);
      // quem estiver perto cai
      for (const e of jogo.entidades) {
        if (e.remover || e.estado !== 'normal' || e.pos.distanceTo(this.pos) > 12) continue;
        _base.subVectors(e.pos, this.pos).setY(0).normalize().multiplyScalar(10 / Math.sqrt(e.massa)).setY(6);
        if (e.massa < 5) e.lancar(_base, true);
      }
    } else {
      jogo.efeitos?.poeira(_v, 5, 2.5, 4);
      jogo.audio?.impacto(0.4, _v);
    }
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
    let giro = this.yawCorpo - (this.yawAnterior ?? this.yawCorpo);
    while (giro > Math.PI) giro -= Math.PI * 2;
    while (giro < -Math.PI) giro += Math.PI * 2;
    this.yawAnterior = this.yawCorpo;
    this.virada = lerp(this.virada || 0, dt > 0 ? giro / dt : 0, Math.min(1, dt * 6));
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
      virada: this.virada, atordoado: this.atordoado > 0 && vel > 15, pouso: noChao ? this.pouso || 0 : 0, pousoForte: this.pousoForte,
      olhar: this.olharCamera ? -cam.pitch * 0.6 : 0, investida: !!this.jogo.combate?.investida,
    });
    if (!voando) rig.raiz.position.y += 0;
    else if (vel < 5) rig.raiz.position.y += Math.sin(rig.t * 2) * 0.08; // flutuando
  }

  // derrotado: cai mole (com gravidade) e fica estirado
  animarMorte(dt) {
    const rig = this.rig;
    const pr = this.jogo.predios;
    if (!this.noChao) {
      this.vel.y -= 28 * dt;
      this.vel.x *= Math.max(0, 1 - dt); this.vel.z *= Math.max(0, 1 - dt);
      this.pos.addScaledVector(this.vel, dt);
      const cel = pr.celulaEm(this.pos.x, this.pos.y, this.pos.z);
      if (cel) { this.pos.y = cel.topo; this.noChao = true; }
      else if (this.pos.y <= 0) { this.pos.y = 0; this.noChao = true; }
      if (this.noChao) {
        this.vel.set(0, 0, 0);
        this.jogo.efeitos.poeira(this.pos, 8, 2, 4);
        this.jogo.camera.tremer(0.4);
        this.jogo.audio?.impacto(0.7, this.pos);
      }
    }
    const s = Math.min(1, dt * (this.noChao ? 6 : 2));
    const l = (a, b) => a + (b - a) * s;
    rig.raiz.rotation.order = 'YXZ';
    rig.raiz.rotation.x = l(rig.raiz.rotation.x, this.noChao ? -Math.PI / 2 : -0.8);
    rig.raiz.position.copy(this.pos);
    rig.raiz.position.y += 0.2;
    rig.corpo.rotation.x = l(rig.corpo.rotation.x, 0);
    rig.bracoE.rotation.z = l(rig.bracoE.rotation.z, 1.2); rig.bracoD.rotation.z = l(rig.bracoD.rotation.z, -1.2);
    rig.bracoE.rotation.x = l(rig.bracoE.rotation.x, -0.3); rig.bracoD.rotation.x = l(rig.bracoD.rotation.x, -0.3);
    rig.pernaE.rotation.x = l(rig.pernaE.rotation.x, 0); rig.pernaD.rotation.x = l(rig.pernaD.rotation.x, -0.3);
    rig.canelaD.rotation.x = l(rig.canelaD.rotation.x, 0.7);
    rig.cabeca.rotation.z = l(rig.cabeca.rotation.z, 0.4);
    if (rig.capa) rig.capa.rotation.x = l(rig.capa.rotation.x, 0.05);
    rig.matOlho.color.set(0xffffff);
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
