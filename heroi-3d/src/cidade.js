// Monta a cidade: chão, ruas, calçadas, praça, posto, prédios, casas, árvores, céu e luz.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { texturaRua, texturaGrama, texturaCalcada } from './texturas.js';

// linhas centrais das ruas
export const RUAS_X = [-180, -120, -60, 0, 60, 120, 180]; // ruas "verticais" (correm ao longo de z)
export const RUAS_Z = [-150, -90, -30, 30, 90, 150]; // ruas "horizontais" (correm ao longo de x)
export const ASFALTO = 9; // largura do asfalto (2 faixas)
export const FAIXA = 2.25; // deslocamento do centro da faixa
export const META_PLACA = 25.5; // metade do quarteirão com calçada
export const META_LOTE = 23; // metade do lote (sem calçada)
export const CALCADA = 24.25; // distância do centro do quarteirão até o meio da calçada
export const FIM_X = 300, FIM_Z = 270; // até onde as ruas vão (fora da cidade)
export const LIMITE_CIDADE_X = 215, LIMITE_CIDADE_Z = 185; // borda da área construída

// tipos dos 30 quarteirões [linha z][coluna x]: centro com prédios altos, bairros de casas em volta
const MAPA = [
  ['casas', 'casas', 'altos', 'casas', 'praca', 'casas'],
  ['casas', 'altos', 'altos', 'altos', 'altos', 'casas'],
  ['posto', 'altos', 'praca', 'altos', 'altos', 'casas'],
  ['casas', 'altos', 'altos', 'altos', 'casas', 'posto'],
  ['casas', 'casas', 'altos', 'casas', 'casas', 'casas'],
];

export const QUARTEIROES = [];
for (let j = 0; j < MAPA.length; j++)
  for (let i = 0; i < MAPA[0].length; i++)
    QUARTEIROES.push({ cx: (RUAS_X[i] + RUAS_X[i + 1]) / 2, cz: (RUAS_Z[j] + RUAS_Z[j + 1]) / 2, tipo: MAPA[j][i] });

// pares [parede, detalhe]
const PALETAS_PREDIO = [
  [0xefe3cc, 0xc07a4f], [0xc9dde8, 0x6f8fab], [0xf4e7bd, 0xb39b5a], [0xe3cdb8, 0x9b7258],
  [0xd5e2cc, 0x7f9a74], [0xeeeef1, 0x8a94a3], [0xf3d2b5, 0xc0704f], [0xbcd6dd, 0x5f8c99],
  [0xd98c6a, 0xf0e0cc], [0xb5503c, 0xe8d8c4],
];
const CORES_PREDIO = [0xd9d4c7, 0xb8c4cc, 0xc9b79c, 0x9fb1bc, 0xe0d0b0, 0xa8a8b0, 0xc7a99a, 0x8fa3ad];
const CORES_CASA = [0xf4e1c1, 0xffffff, 0xc7e3f0, 0xf6c9a8, 0xd9f0c7, 0xf0d0e0, 0xf2e88a];

function aleatorio(lista) { return lista[(Math.random() * lista.length) | 0]; }

export function criarCidade(jogo) {
  const cena = jogo.cena;
  const predios = jogo.predios;

  // ---------- céu, luz e névoa ----------
  // sol do fim de tarde: sombras compridas e luz dourada
  const dirSol = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - 30), THREE.MathUtils.degToRad(140));
  const ceu = criarCeu(dirSol);
  cena.add(ceu);
  jogo.ceu = ceu;

  cena.fog = new THREE.Fog(0xcfe0ef, 220, 1100);

  cena.add(new THREE.HemisphereLight(0xcfe2ff, 0x7d8a5a, 1.6));
  const sol = new THREE.DirectionalLight(0xffe2b8, 3.2);
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
  texGrama.repeat.set(160, 160);
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
    r.position.set(x, 0.05, 0);
    r.receiveShadow = true;
    cena.add(r);
  }
  for (const z of RUAS_Z) {
    const r = new THREE.Mesh(new THREE.PlaneGeometry(ASFALTO, compX), matRuaX);
    r.rotation.x = -Math.PI / 2;
    r.rotation.z = Math.PI / 2;
    r.position.set(0, 0.07, z);
    r.receiveShadow = true;
    cena.add(r);
  }
  // cruzamentos lisos (escondem as faixas)
  const matCruz = new THREE.MeshLambertMaterial({ color: 0x3a3c40 });
  const geoCruz = new THREE.PlaneGeometry(ASFALTO, ASFALTO);
  for (const x of RUAS_X) for (const z of RUAS_Z) {
    const c = new THREE.Mesh(geoCruz, matCruz);
    c.rotation.x = -Math.PI / 2;
    c.position.set(x, 0.09, z);
    c.receiveShadow = true;
    cena.add(c);
  }

  // quarteirões: placa de calçada + lote
  const texCalc = texturaCalcada();
  texCalc.repeat.set(17, 17);
  const matCalcada = new THREE.MeshLambertMaterial({ map: texCalc });
  const matLoteGrama = new THREE.MeshLambertMaterial({ map: texGrama.clone() });
  matLoteGrama.map.repeat.set(4, 4);
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

  // árvores fora da cidade (campo)
  for (let n = 0; n < 420; n++) {
    const x = (Math.random() - 0.5) * 1200, z = (Math.random() - 0.5) * 1100;
    if (Math.abs(x) < LIMITE_CIDADE_X && Math.abs(z) < LIMITE_CIDADE_Z) continue; // dentro da cidade
    if (RUAS_X.some((r) => Math.abs(x - r) < 9) || RUAS_Z.some((r) => Math.abs(z - r) < 9)) continue; // em cima da rua
    arvores.push({ x, z, grande: Math.random() < 0.5 });
  }
  criarArvores(cena, arvores, jogo);
  criarFaixasPedestre(cena);

  criarPostes(cena);
  criarHorizonte(cena);
  predios.finalizar(cena);
}

// postes de luz nas calçadas
function criarPostes(cena) {
  const pontos = [];
  for (const q of QUARTEIROES) {
    const d = META_PLACA - 0.7;
    for (let t = -d + 4; t <= d - 4; t += 15) {
      pontos.push([q.cx + t, q.cz - d, 0], [q.cx + t, q.cz + d, Math.PI], [q.cx - d, q.cz + t, Math.PI / 2], [q.cx + d, q.cz + t, -Math.PI / 2]);
    }
  }
  const haste = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.13, 6, 6), new THREE.MeshLambertMaterial({ color: 0x3b4048 }), pontos.length);
  const geoBraco = new THREE.BoxGeometry(0.1, 0.1, 1.6).translate(0, 0, -0.7);
  const braco = new THREE.InstancedMesh(geoBraco, new THREE.MeshLambertMaterial({ color: 0x3b4048 }), pontos.length);
  const lampada = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.15, 0.7), new THREE.MeshLambertMaterial({ color: 0xfff3c4, emissive: 0x6b5a2a }), pontos.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), s = new THREE.Vector3(1, 1, 1), p = new THREE.Vector3();
  pontos.forEach(([x, z, r], i) => {
    q.setFromEuler(e.set(0, r, 0));
    haste.setMatrixAt(i, m.compose(p.set(x, 3.2, z), q, s));
    braco.setMatrixAt(i, m.compose(p.set(x, 6.1, z), q, s));
    const fx = -Math.sin(r) * 1.4, fz = -Math.cos(r) * 1.4;
    lampada.setMatrixAt(i, m.compose(p.set(x + fx, 6.05, z + fz), q, s));
  });
  haste.castShadow = braco.castShadow = true;
  cena.add(haste, braco, lampada);
}

// montanhas e nuvens ao longe (sem névoa para não sumirem)
function criarHorizonte(cena) {
  // montanha "acidentada": cone com vértices deslocados e cor em degradê
  const horizonte = new THREE.Color(0xcfe0ef);
  const montanha = (x, z, raio, h, corBase, neve, rugas = 0.25) => {
    const g = new THREE.ConeGeometry(raio, h, 9, 4).toNonIndexed();
    const pos = g.attributes.position;
    const arr = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    // desloca vértices (mesma posição = mesmo deslocamento, sem buracos)
    const desl = new Map();
    for (let v = 0; v < pos.count; v++) {
      const px = pos.getX(v), py = pos.getY(v), pz = pos.getZ(v);
      const ch = `${Math.round(px * 10) + 0},${Math.round(py * 10) + 0},${Math.round(pz * 10) + 0}`; // + 0 evita '-0'
      if (!desl.has(ch)) desl.set(ch, py > h / 2 - 0.01 ? [0, 0, 0] : [(Math.random() - 0.5) * raio * rugas, (Math.random() - 0.5) * h * rugas * 0.4, (Math.random() - 0.5) * raio * rugas]);
      const d = desl.get(ch);
      pos.setXYZ(v, px + d[0] + x, py + d[1] + h / 2 - 4, pz + d[2] + z);
      const t = (py + h / 2) / h; // 0 embaixo, 1 no topo
      c.copy(corBase).lerp(horizonte, Math.max(0, 0.6 - t) * 0.8);
      if (neve && t > 0.82) c.set(0xeef2f6);
      arr[v * 3] = c.r; arr[v * 3 + 1] = c.g; arr[v * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    g.computeVertexNormals();
    return g;
  };
  const longe = [], perto = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2 + Math.random() * 0.1;
    const r = 1250 + Math.random() * 300;
    const h = 150 + Math.random() * 260;
    longe.push(montanha(Math.cos(a) * r, Math.sin(a) * r, 160 + Math.random() * 160, h, new THREE.Color(0x7d97ad), h > 320, 0.1));
  }
  for (let i = 0; i < 34; i++) {
    const a = (i / 34) * Math.PI * 2 + Math.random() * 0.15;
    const r = 700 + Math.random() * 200;
    perto.push(montanha(Math.cos(a) * r, Math.sin(a) * r, 90 + Math.random() * 90, 40 + Math.random() * 70, new THREE.Color(0x5f8f4a), false));
  }
  cena.add(new THREE.Mesh(mergeGeometries(longe), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true, fog: false })));
  const colinas = new THREE.Mesh(mergeGeometries(perto), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  cena.add(colinas);

  const nuvens = [];
  for (let i = 0; i < 18; i++) {
    const a = Math.random() * Math.PI * 2, r = 250 + Math.random() * 700;
    const cx = Math.cos(a) * r, cz = Math.sin(a) * r, cy = 230 + Math.random() * 90;
    for (let b = 0; b < 6; b++) {
      const raio = 18 + Math.random() * 22;
      const g = new THREE.SphereGeometry(raio, 8, 6).scale(1.6, 0.55, 1).translate(cx + (Math.random() - 0.5) * 80, cy + Math.random() * 8, cz + (Math.random() - 0.5) * 40);
      nuvens.push(g.toNonIndexed());
    }
  }
  const matNuvem = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xb8c4d6, fog: false, transparent: true, opacity: 0.92 });
  cena.add(new THREE.Mesh(mergeGeometries(nuvens), matNuvem));
}

// quarteirão de prédios altos: 4 prédios (2 altos garantidos)
// cúpula do céu com degradê e brilho do sol
function criarCeu(dirSol) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uTopo: { value: new THREE.Color(0x2f6fc4) },
      uMeio: { value: new THREE.Color(0x7fb2e6) },
      uHorizonte: { value: new THREE.Color(0xe3ecf2) },
      uSol: { value: dirSol.clone() },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform vec3 uTopo, uMeio, uHorizonte, uSol; varying vec3 vDir;
      void main(){
        float h = max(vDir.y, 0.0);
        vec3 cor = mix(uHorizonte, uMeio, smoothstep(0.0, 0.18, h));
        cor = mix(cor, uTopo, smoothstep(0.18, 0.75, h));
        float s = max(dot(normalize(vDir), normalize(uSol)), 0.0);
        cor += vec3(1.0, 0.85, 0.6) * pow(s, 8.0) * 0.35;   // brilho em volta do sol
        cor += vec3(1.0, 0.95, 0.85) * pow(s, 900.0) * 6.0; // disco do sol
        if (vDir.y < 0.0) cor = uHorizonte;
        gl_FragColor = vec4(cor, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(2400, 32, 16), mat);
  m.frustumCulled = false;
  m.renderOrder = -1;
  return m;
}

function criarArvores(cena, arvores, jogo) {
  const n = arvores.length;
  const tronco = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.2, 0.32, 2.6, 6), new THREE.MeshLambertMaterial({ color: 0x6b4a2b }), n);
  const geoCopa = new THREE.IcosahedronGeometry(1.8, 1);
  const copa1 = new THREE.InstancedMesh(geoCopa, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), n);
  const copa2 = new THREE.InstancedMesh(geoCopa, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), n);
  const verdes = [0x3f7f2f, 0x4f8f35, 0x2f6b2a, 0x5f9a3a, 0x6b8f2a];
  const m = new THREE.Matrix4(), c = new THREE.Color();
  arvores.forEach((a, i) => {
    const s = (0.8 + Math.random() * 0.6) * (a.grande ? 1.5 : 1);
    m.makeScale(s, s, s).setPosition(a.x, 1.3 * s, a.z);
    tronco.setMatrixAt(i, m);
    m.makeScale(s * 1.1, s * 1.05, s * 1.1).setPosition(a.x, 3.2 * s, a.z);
    copa1.setMatrixAt(i, m);
    m.makeScale(s * 0.75, s * 0.8, s * 0.75).setPosition(a.x + 0.3 * s, 4.6 * s, a.z - 0.2 * s);
    copa2.setMatrixAt(i, m);
    c.set(verdes[(Math.random() * verdes.length) | 0]);
    copa1.setColorAt(i, c);
    copa2.setColorAt(i, c.multiplyScalar(1.18));
  });
  tronco.castShadow = copa1.castShadow = copa2.castShadow = true;
  copa1.receiveShadow = copa2.receiveShadow = true;
  cena.add(tronco, copa1, copa2);
  jogo.arvores = { lista: arvores, tronco, copa: copa1 };
}

// faixas de pedestre perto dos cruzamentos
function criarFaixasPedestre(cena) {
  const listras = [];
  const d = ASFALTO / 2 + 2.2;
  for (const x of RUAS_X) for (const z of RUAS_Z) {
    for (let l = -3; l <= 3; l++) {
      const o = l * 1.2;
      listras.push([x + o, z - d, 0], [x + o, z + d, 0], [x - d, z + o, 1], [x + d, z + o, 1]);
    }
  }
  const malha = new THREE.InstancedMesh(new THREE.BoxGeometry(0.6, 0.02, 3), new THREE.MeshLambertMaterial({ color: 0xf2f0e6 }), listras.length);
  const m = new THREE.Matrix4();
  listras.forEach(([x, z, r], i) => {
    m.makeRotationY(r ? Math.PI / 2 : 0).setPosition(x, 0.11, z);
    malha.setMatrixAt(i, m);
  });
  malha.receiveShadow = true;
  cena.add(malha);
}

// interior simples (estilo JJS): -1 = não é interior; 0 = vazio; 5 = laje; 6 = rampa
// a rampa troca de lado a cada andar e sobe em +z; em cima dela fica um buraco
function interior(i, j, k, ex, ez) {
  if (!(i > 0 && i < ex - 1 && k > 0 && k < ez - 1)) return -1;
  const ladoRampa = (andar) => (andar % 2 === 0 ? 1 : ex - 2);
  if (i === ladoRampa(j) && k === 1) return 6;
  if (j > 0 && i === ladoRampa(j - 1) && k === 1) return 0; // buraco por onde a rampa chega
  return j === 0 ? 0 : 5; // térreo usa o chão
}

function montarAltos(predios, q) {
  const posicoes = [[-17, -17], [5, -17], [-17, 5], [5, 5]];
  const altos = [0, 1, 2, 3].sort(() => Math.random() - 0.5).slice(0, 2 + (Math.random() < 0.4 ? 1 : 0));
  posicoes.forEach(([ox, oz], n) => {
    const alto = altos.includes(n);
    const nx = 4, nz = 4;
    const ny = alto ? 10 + ((Math.random() * 16) | 0) : 3 + ((Math.random() * 5) | 0);
    // estilos: vidro espelhado, clássico (tijolo/pedra) ou residencial (janelas com cortina)
    const estilo = alto ? aleatorio(['vidro', 'vidro', 'classico', 'residencial']) : aleatorio(['classico', 'residencial', 'residencial']);
    const recuo = alto && Math.random() < 0.65 ? Math.max(4, Math.floor(ny * (0.55 + Math.random() * 0.2))) : 999; // andar onde o prédio afina
    const casaMaquinas = Math.random() < 0.75;
    const [corParede, corDetalhe] = aleatorio(PALETAS_PREDIO);
    const parede = new THREE.Color(corParede), detalhe = new THREE.Color(corDetalhe);
    const vidro = new THREE.Color(aleatorio([0xffffff, 0xd8f0e8, 0xe8e0ff, 0xd0e4ff]));
    const borda = (i, k) => i === nx - 1 || k === nz - 1;
    const toldo = new THREE.Color(aleatorio([0xff9a9a, 0x9be0a8, 0x9cc2ff, 0xffe08a, 0xffb36b, 0xffffff]));
    const tijolo = new THREE.Color(aleatorio([0xffffff, 0xf2e6da, 0xe6d6c8, 0xd8d8d8]));
    predios.criarPredio({
      x: q.cx + ox, z: q.cz + oz, nx, ny: ny + (casaMaquinas ? 1 : 0), nz, tx: 3, ty: 3.2, tz: 3,
      nome: alto ? 'arranha-céu' : 'prédio',
      forma: (i, j, k) => {
        if (j >= ny) return i >= 1 && i <= 2 && k >= 1 && k <= 2 ? 2 : 0; // casa de máquinas no teto
        if (j >= recuo && borda(i, k)) return 0; // recuo dos andares de cima
        if (j === ny - 1 || (j === recuo - 1 && borda(i, k))) return 2; // laje do teto
        // interior oco: lajes (pisos) e uma rampa por andar, com o buraco da rampa de baixo
        const t = interior(i, j, k, j >= recuo ? nx - 1 : nx, j >= recuo ? nz - 1 : nz);
        if (t >= 0) return t;
        const quina = (i === 0 || i === nx - 1) && (k === 0 || k === nz - 1);
        if (estilo === 'vidro') return j === 0 ? 4 : quina ? 2 : 4; // térreo = saguão de vidro
        if (j === 0) return 8; // lojas no térreo
        if (estilo === 'residencial') return Math.random() < 0.35 ? 3 : 1;
        return quina ? 2 : 7; // tijolinho com quinas de pedra
      },
      corCelula: (i, j, k, t) => {
        if (t === 5) return (i + k + j) % 2 ? 0xc8a982 : 0xbb9a72; // piso de madeira
        if (t === 6) return 0xa3a7ad; // rampa de concreto
        if (j >= ny) return 0xb7b9bd;
        if (t === 2) {
          if (estilo === 'vidro' && j < ny - 1) return 0xb4bec9; // colunas metálicas
          return (i + k) % 2 ? 0x8a8c91 : 0x9a9ca1;
        }
        if (t === 4) return vidro;
        if (t === 8) return toldo; // cor do toldo da loja
        if (t === 7) return tijolo;
        if (j === 0) return 0x56616c;
        const quina = (i === 0 || i === nx - 1) && (k === 0 || k === nz - 1);
        if (quina || j === ny - 2 || j === recuo - 1) return detalhe;
        return parede;
      },
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
  const telhado = aleatorio([0xd0603f, 0xc2704f, 0xb34a35, 0x8f6a5a, 0x5f7a8f]);
  const andares = Math.random() < 0.5 ? 2 : 1;
  predios.criarPredio({
    x: cx - 4.5, z: cz - 4.5, nx: 3, ny: andares + 2, nz: 3, tx: 3, ty: 2.8, tz: 3,
    cor, corTopo: telhado, nome: 'casa',
    // telhado em degraus: camada inteira + cumeeira só na fileira do meio
    forma: (i, j, k) => {
      if (j < andares && i === 1 && k === 1) return j === 0 && andares === 2 ? 6 : 0; // miolo oco (com rampa)
      return j < andares ? 1 : j === andares ? 2 : (k === 1 ? 2 : 0);
    },
    corCelula: (i, j, k, t) => (t === 6 ? 0xb89a76 : t === 2 ? telhado : cor),
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
    forma: (i, j, k) => (j === 1 ? 5 : ((i === 0 || i === 5) && (k === 0 || k === 3) ? 2 : 0)),
    corCelula: (i, j, k) => (j === 1 && (k === 0 || k === 3 || i === 0 || i === 5) ? 0xd92d20 : 0xf2f2f2),
  });
  // loja de conveniência
  predios.criarPredio({
    x: q.cx + 4, z: q.cz - 19, nx: 5, ny: 2, nz: 3, tx: 3, ty: 3.2, tz: 3,
    cor: 0xf5f5f5, corTopo: 0xd92d20, nome: 'loja',
    forma: (i, j, k) => (j === 1 ? 2 : i > 0 && i < 4 && k === 1 ? 0 : 1),
  });
  // bombas de combustível (explodem! criadas como entidades depois)
  for (const bx of [-12, -5]) for (const bz of [-15, -10])
    jogo.bombasPosto.push(new THREE.Vector3(q.cx + bx, 0.2, q.cz + bz));
  // duas casas atrás
  criarCasa(predios, q.cx - 12, q.cz + 13);
  criarCasa(predios, q.cx + 12, q.cz + 13);
  arvores.push({ x: q.cx, z: q.cz + 14 }, { x: q.cx + 19, z: q.cz + 2 });
}
