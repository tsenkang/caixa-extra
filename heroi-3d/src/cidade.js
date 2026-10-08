// Monta a cidade: chão, ruas, calçadas, praça, posto, prédios, casas, árvores, céu e luz.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { texturaRua, texturaGrama, texturaCalcada } from './texturas.js';

// linhas centrais das ruas
export const RUAS_X = [-120, -60, 0, 60, 120]; // ruas "verticais" (correm ao longo de z)
export const RUAS_Z = [-90, -30, 30, 90]; // ruas "horizontais" (correm ao longo de x)
export const ASFALTO = 9; // largura do asfalto (2 faixas)
export const FAIXA = 2.25; // deslocamento do centro da faixa
export const META_PLACA = 25.5; // metade do quarteirão com calçada
export const META_LOTE = 23; // metade do lote (sem calçada)
export const CALCADA = 24.25; // distância do centro do quarteirão até o meio da calçada
export const FIM_X = 230, FIM_Z = 200; // até onde as ruas vão (fora da cidade)

// tipos dos 12 quarteirões [linha z][coluna x]
const MAPA = [
  ['casas', 'altos', 'altos', 'casas'],
  ['posto', 'praca', 'altos', 'casas'],
  ['casas', 'altos', 'casas', 'altos'],
];

export const QUARTEIROES = [];
for (let j = 0; j < 3; j++)
  for (let i = 0; i < 4; i++)
    QUARTEIROES.push({ cx: (RUAS_X[i] + RUAS_X[i + 1]) / 2, cz: (RUAS_Z[j] + RUAS_Z[j + 1]) / 2, tipo: MAPA[j][i] });

const CORES_PREDIO = [0xd9d4c7, 0xb8c4cc, 0xc9b79c, 0x9fb1bc, 0xe0d0b0, 0xa8a8b0, 0xc7a99a, 0x8fa3ad];
const CORES_CASA = [0xf4e1c1, 0xffffff, 0xc7e3f0, 0xf6c9a8, 0xd9f0c7, 0xf0d0e0, 0xf2e88a];

function aleatorio(lista) { return lista[(Math.random() * lista.length) | 0]; }

export function criarCidade(jogo) {
  const cena = jogo.cena;
  const predios = jogo.predios;

  // ---------- céu, luz e névoa ----------
  const ceu = new Sky();
  ceu.scale.setScalar(2500);
  const u = ceu.material.uniforms;
  u.turbidity.value = 5;
  u.rayleigh.value = 1.4;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.85;
  const dirSol = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 38), THREE.MathUtils.degToRad(135));
  u.sunPosition.value.copy(dirSol);
  cena.add(ceu);
  jogo.ceu = ceu;

  cena.fog = new THREE.Fog(0xbcd3e6, 160, 750);

  cena.add(new THREE.HemisphereLight(0xcfe3ff, 0x5b6b46, 1.1));
  const sol = new THREE.DirectionalLight(0xfff1dc, 2.6);
  sol.position.copy(dirSol).multiplyScalar(300);
  sol.castShadow = true;
  sol.shadow.mapSize.set(2048, 2048);
  const sc = sol.shadow.camera;
  sc.left = -120; sc.right = 120; sc.top = 120; sc.bottom = -120; sc.near = 10; sc.far = 700;
  sol.shadow.bias = -0.0005;
  sol.shadow.normalBias = 0.4;
  cena.add(sol);
  cena.add(sol.target);
  jogo.sol = sol;
  jogo.dirSol = dirSol;

  // ---------- chão ----------
  const texGrama = texturaGrama();
  texGrama.repeat.set(300, 300);
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshLambertMaterial({ map: texGrama }));
  chao.rotation.x = -Math.PI / 2;
  chao.receiveShadow = true;
  cena.add(chao);

  // ruas
  const texRua = texturaRua();
  const matRua = (comp) => {
    const t = texRua.clone();
    t.needsUpdate = true;
    t.repeat.set(1, comp / 9);
    return new THREE.MeshLambertMaterial({ map: t });
  };
  const compZ = FIM_Z * 2, compX = FIM_X * 2;
  const matRuaZ = matRua(compZ), matRuaX = matRua(compX);
  for (const x of RUAS_X) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(ASFALTO, compZ), matRuaZ);
    r.rotation.x = -Math.PI / 2;
    r.position.set(x, 0.02, 0);
    r.receiveShadow = true;
    cena.add(r);
  }
  for (const z of RUAS_Z) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(ASFALTO, compX), matRuaX);
    r.rotation.x = -Math.PI / 2;
    r.rotation.z = Math.PI / 2;
    r.position.set(0, 0.03, z);
    r.receiveShadow = true;
    cena.add(r);
  }
  // cruzamentos lisos (escondem as faixas)
  const matCruz = new THREE.MeshLambertMaterial({ color: 0x3a3c40 });
  const geoCruz = new THREE.PlaneGeometry(ASFALTO, ASFALTO);
  for (const x of RUAS_X) for (const z of RUAS_Z) {
    const c = new THREE.Mesh(geoCruz, matCruz);
    c.rotation.x = -Math.PI / 2;
    c.position.set(x, 0.04, z);
    c.receiveShadow = true;
    cena.add(c);
  }

  // quarteirões: placa de calçada + lote
  const texCalc = texturaCalcada();
  texCalc.repeat.set(17, 17);
  const matCalcada = new THREE.MeshLambertMaterial({ map: texCalc });
  const matLoteGrama = new THREE.MeshLambertMaterial({ map: texGrama.clone() });
  matLoteGrama.map.repeat.set(8, 8);
  matLoteGrama.map.needsUpdate = true;
  const matLoteConcreto = new THREE.MeshLambertMaterial({ color: 0x9c9890 });
  const geoPlaca = new THREE.BoxGeometry(META_PLACA * 2, 0.2, META_PLACA * 2);
  const geoLote = new THREE.PlaneGeometry(META_LOTE * 2, META_LOTE * 2);

  const arvores = [];
  jogo.bombasPosto = [];

  for (const q of QUARTEIROES) {
    const placa = new THREE.Mesh(geoPlaca, matCalcada);
    placa.position.set(q.cx, 0.1, q.cz);
    placa.receiveShadow = true;
    cena.add(placa);
    const lote = new THREE.Mesh(geoLote, q.tipo === 'altos' || q.tipo === 'posto' ? matLoteConcreto : matLoteGrama);
    lote.rotation.x = -Math.PI / 2;
    lote.position.set(q.cx, 0.21, q.cz);
    lote.receiveShadow = true;
    cena.add(lote);

    if (q.tipo === 'altos') montarAltos(predios, q);
    else if (q.tipo === 'casas') montarCasas(predios, q, arvores);
    else if (q.tipo === 'praca') montarPraca(cena, q, arvores);
    else if (q.tipo === 'posto') montarPosto(jogo, q, arvores);
  }

  // árvores (instanciadas)
  const nArv = arvores.length;
  const tronco = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.3, 2.4, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a2b }), nArv);
  const copa = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1.8, 0), new THREE.MeshLambertMaterial({ color: 0x3f7f2f, flatShading: true }), nArv);
  const m = new THREE.Matrix4();
  arvores.forEach((a, i) => {
    m.makeTranslation(a.x, 1.2, a.z);
    tronco.setMatrixAt(i, m);
    const s = 0.8 + Math.random() * 0.6;
    m.makeScale(s, s * 1.2, s).setPosition(a.x, 3.2 + s, a.z);
    copa.setMatrixAt(i, m);
  });
  tronco.castShadow = copa.castShadow = true;
  copa.receiveShadow = true;
  cena.add(tronco, copa);
  jogo.arvores = { lista: arvores, tronco, copa };

  predios.finalizar(cena);
}

// quarteirão de prédios altos: 4 prédios (2 altos garantidos)
function montarAltos(predios, q) {
  const posicoes = [[-17, -17], [5, -17], [-17, 5], [5, 5]];
  const altos = [0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, 2 + (Math.random() < 0.4 ? 1 : 0));
  posicoes.forEach(([ox, oz], n) => {
    const alto = altos.includes(n);
    const nx = 4, nz = 4;
    const ny = alto ? 10 + ((Math.random() * 16) | 0) : 3 + ((Math.random() * 5) | 0);
    predios.criarPredio({
      x: q.cx + ox, z: q.cz + oz, nx, ny, nz, tx: 3, ty: 3.2, tz: 3,
      cor: aleatorio(CORES_PREDIO), corTopo: 0x8a8a8a,
      nome: alto ? 'arranha-céu' : 'prédio',
    });
  });
}

// quarteirão de casas: 8 casas em volta de um jardim
function montarCasas(predios, q, arvores) {
  for (const ox of [-15, 0, 15]) for (const oz of [-15, 0, 15]) {
    if (ox === 0 && oz === 0) {
      arvores.push({ x: q.cx - 3, z: q.cz + 2 }, { x: q.cx + 3, z: q.cz - 2 });
      continue;
    }
    criarCasa(predios, q.cx + ox, q.cz + oz);
    arvores.push({ x: q.cx + ox + 6, z: q.cz + oz + (Math.random() - 0.5) * 6 });
  }
}

function criarCasa(predios, cx, cz) {
  const cor = aleatorio(CORES_CASA);
  const telhado = aleatorio([0xa63c2a, 0x7a3b2e, 0x5a4a42, 0x8c2f1f]);
  const andares = Math.random() < 0.5 ? 2 : 1;
  predios.criarPredio({
    x: cx - 4.5, z: cz - 4.5, nx: 3, ny: andares + 1, nz: 3, tx: 3, ty: 2.8, tz: 3,
    cor, corTopo: telhado, nome: 'casa',
    // último andar = telhado em forma de "escada" (só a fileira do meio sobe mais)
    forma: (i, j, k) => (j < andares ? 1 : 2),
  });
}

function montarPraca(cena, q, arvores) {
  const matCaminho = new THREE.MeshLambertMaterial({ color: 0xcfc6b0 });
  for (const rot of [0, Math.PI / 2]) {
    const c = new THREE.Mesh(new THREE.PlaneGeometry(4, META_LOTE * 2), matCaminho);
    c.rotation.x = -Math.PI / 2;
    c.rotation.z = rot;
    c.position.set(q.cx, 0.23, q.cz);
    c.receiveShadow = true;
    cena.add(c);
  }
  // chafariz
  const pedra = new THREE.MeshLambertMaterial({ color: 0xbdb6a8 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(5, 5.4, 0.8, 24), pedra);
  base.position.set(q.cx, 0.6, q.cz);
  const agua = new THREE.Mesh(new THREE.CylinderGeometry(4.5, 4.5, 0.1, 24), new THREE.MeshLambertMaterial({ color: 0x4aa3df, transparent: true, opacity: 0.85 }));
  agua.position.set(q.cx, 0.95, q.cz);
  const coluna = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.6, 3, 10), pedra);
  coluna.position.set(q.cx, 2, q.cz);
  const prato = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 0.6, 0.4, 16), pedra);
  prato.position.set(q.cx, 3.4, q.cz);
  for (const o of [base, coluna, prato]) { o.castShadow = true; o.receiveShadow = true; }
  cena.add(base, agua, coluna, prato);
  // árvores em volta
  for (let a = 0; a < 16; a++) {
    const ang = (a / 16) * Math.PI * 2 + 0.2;
    const r = 13 + Math.random() * 6;
    const x = q.cx + Math.cos(ang) * r, z = q.cz + Math.sin(ang) * r;
    if (Math.abs(x - q.cx) < 3 || Math.abs(z - q.cz) < 3) continue;
    arvores.push({ x, z });
  }
}

function montarPosto(jogo, q, arvores) {
  const predios = jogo.predios;
  // cobertura: 4 pilares + teto (se os pilares quebrarem, o teto cai)
  const ox = q.cx - 19, oz = q.cz - 19;
  predios.criarPredio({
    x: ox, z: oz, nx: 6, ny: 2, nz: 4, tx: 3, ty: 3.5, tz: 3, nome: 'posto', conta: false,
    forma: (i, j, k) => (j === 1 ? 2 : ((i === 0 || i === 5) && (k === 0 || k === 3) ? 2 : 0)),
    corCelula: (i, j, k) => (j === 1 && (k === 0 || k === 3 || i === 0 || i === 5) ? 0xd92d20 : 0xf2f2f2),
  });
  // loja de conveniência
  predios.criarPredio({
    x: q.cx + 4, z: q.cz - 19, nx: 5, ny: 2, nz: 3, tx: 3, ty: 3.2, tz: 3,
    cor: 0xf5f5f5, corTopo: 0xd92d20, nome: 'loja',
  });
  // bombas de combustível (explodem! criadas como entidades depois)
  for (const bx of [-12, -5]) for (const bz of [-15, -10])
    jogo.bombasPosto.push(new THREE.Vector3(q.cx + bx, 0.2, q.cz + bz));
  // duas casas atrás
  criarCasa(predios, q.cx - 12, q.cz + 13);
  criarCasa(predios, q.cx + 12, q.cz + 13);
  arvores.push({ x: q.cx, z: q.cz + 14 }, { x: q.cx + 19, z: q.cz + 2 });
}
