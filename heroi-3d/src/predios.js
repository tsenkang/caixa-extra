// Prédios destrutíveis.
// Cada prédio é uma grade de blocos (i = largura, j = andar, k = profundidade).
// Todos os blocos da cidade são desenhados com 2 InstancedMesh (paredes com janela e blocos lisos).
// Quando um bloco quebra, a instância some e nasce um pedaço com física (detritos.js).
import * as THREE from 'three';
import { texturaJanela, texturaConcreto } from './texturas.js';

const HP_BLOCO = 30;
const MAX_QUEDA_POR_QUADRO = 160; // quantos blocos soltos viram pedaços por quadro

const _m = new THREE.Matrix4();
const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();
const _c = new THREE.Color();
const _vel = new THREE.Vector3();
const _ang = new THREE.Vector3();
const _tam = new THREE.Vector3();

export class SistemaPredios {
  constructor(jogo) {
    this.jogo = jogo;
    this.predios = [];
    this.filaQueda = [];
    this.sujos = new Set();
    this.emissores = [];
    this.destruidos = 0;
    this.blocosQuebrados = 0;
    this.matParede = new THREE.MeshLambertMaterial({ map: texturaJanela() });
    this.matLiso = new THREE.MeshLambertMaterial({ map: texturaConcreto() });
    this.atualizarMalha = [false, false, false];
    this._fila = new Int32Array(4096);
    this._res = { p: null, idx: -1 };
    this._hit = { dist: 0, ponto: new THREE.Vector3(), normal: new THREE.Vector3(), p: null, idx: -1 };
  }

  // op: { x, z, nx, ny, nz, tx, ty, tz, cor, corTopo, forma(i,j,k)->0/1/2, corCelula(i,j,k,t), conta, nome }
  criarPredio(op) {
    const { x, z, nx, ny, nz } = op;
    const tx = op.tx ?? 3, ty = op.ty ?? 3.2, tz = op.tz ?? 3;
    const n = nx * ny * nz;
    const p = {
      x0: x, z0: z, nx, ny, nz, tx, ty, tz, n,
      x1: x + nx * tx, y1: ny * ty, z1: z + nz * tz,
      tipo: new Uint8Array(n), // 1 = bloco inteiro, 0 = vazio/quebrado
      malha: new Uint8Array(n), // 1 = parede com janela, 2 = liso
      inst: new Int32Array(n).fill(-1),
      hp: new Float32Array(n),
      cores: new Float32Array(n * 3),
      totalAndar: new Int32Array(ny),
      vivosAndar: new Int32Array(ny),
      visitado: new Uint8Array(n),
      total: 0, vivos: 0, destruido: false, origem: '',
      conta: op.conta !== false, nome: op.nome || 'prédio',
    };
    const cor = new THREE.Color(op.cor ?? 0xcccccc);
    const corTopo = new THREE.Color(op.corTopo ?? 0x9a9a9a);
    for (let j = 0; j < ny; j++)
      for (let k = 0; k < nz; k++)
        for (let i = 0; i < nx; i++) {
          const idx = i + nx * (k + nz * j);
          const t = op.forma ? op.forma(i, j, k) : (j === ny - 1 ? 2 : 1);
          if (!t) continue;
          p.tipo[idx] = 1;
          p.malha[idx] = t;
          p.hp[idx] = HP_BLOCO * (op.resistencia ?? 1);
          if (op.corCelula) _c.set(op.corCelula(i, j, k, t));
          else _c.copy(t === 2 ? corTopo : cor);
          const variacao = 0.88 + Math.random() * 0.12;
          p.cores[idx * 3] = _c.r * variacao;
          p.cores[idx * 3 + 1] = _c.g * variacao;
          p.cores[idx * 3 + 2] = _c.b * variacao;
          p.total++;
          p.totalAndar[j]++;
        }
    p.vivos = p.total;
    p.vivosAndar.set(p.totalAndar);
    this.predios.push(p);
    return p;
  }

  // cria as InstancedMesh depois que todos os prédios foram definidos
  finalizar(cena) {
    const contagem = [0, 0, 0];
    for (const p of this.predios) for (let i = 0; i < p.n; i++) if (p.tipo[i]) contagem[p.malha[i]]++;
    const geo = new THREE.BoxGeometry(1, 1, 1);
    this.malhas = [null,
      new THREE.InstancedMesh(geo, this.matParede, Math.max(1, contagem[1])),
      new THREE.InstancedMesh(geo, this.matLiso, Math.max(1, contagem[2]))];
    const usados = [0, 0, 0];
    for (const p of this.predios) {
      for (let idx = 0; idx < p.n; idx++) {
        if (!p.tipo[idx]) continue;
        const m = p.malha[idx];
        const inst = usados[m]++;
        p.inst[idx] = inst;
        this.centroCelula(p, idx, _p);
        _s.set(p.tx, p.ty, p.tz);
        _m.compose(_p, _q.identity(), _s);
        this.malhas[m].setMatrixAt(inst, _m);
        _c.setRGB(p.cores[idx * 3], p.cores[idx * 3 + 1], p.cores[idx * 3 + 2]);
        this.malhas[m].setColorAt(inst, _c);
      }
    }
    for (let m = 1; m <= 2; m++) {
      const malha = this.malhas[m];
      malha.castShadow = true;
      malha.receiveShadow = true;
      malha.computeBoundingSphere();
      cena.add(malha);
    }
    this.totalBlocos = contagem[1] + contagem[2];
  }

  centroCelula(p, idx, out) {
    const i = idx % p.nx;
    const k = ((idx / p.nx) | 0) % p.nz;
    const j = (idx / (p.nx * p.nz)) | 0;
    return out.set(p.x0 + (i + 0.5) * p.tx, (j + 0.5) * p.ty, p.z0 + (k + 0.5) * p.tz);
  }

  // retorna o bloco inteiro naquele ponto (ou null). O objeto retornado é reaproveitado.
  celulaEm(x, y, z) {
    if (y < 0) return null;
    for (const p of this.predios) {
      if (x < p.x0 || x >= p.x1 || y >= p.y1 || z < p.z0 || z >= p.z1) continue;
      const i = ((x - p.x0) / p.tx) | 0;
      const j = (y / p.ty) | 0;
      const k = ((z - p.z0) / p.tz) | 0;
      const idx = i + p.nx * (k + p.nz * j);
      if (p.tipo[idx]) { this._res.p = p; this._res.idx = idx; return this._res; }
      return null;
    }
    return null;
  }

  solido(x, y, z) { return this.celulaEm(x, y, z) !== null; }

  // raio contra os blocos (DDA na grade de cada prédio). Retorna o acerto mais próximo.
  raycast(o, d, maxDist) {
    let melhor = maxDist;
    let achou = false;
    const hit = this._hit;
    for (const p of this.predios) {
      // teste do raio com a caixa do prédio
      let tmin = 0, tmax = melhor, eixo = -1;
      const mins = [p.x0, 0, p.z0], maxs = [p.x1, p.y1, p.z1], os = [o.x, o.y, o.z], ds = [d.x, d.y, d.z];
      let fora = false;
      for (let a = 0; a < 3; a++) {
        if (Math.abs(ds[a]) < 1e-9) {
          if (os[a] < mins[a] || os[a] > maxs[a]) { fora = true; break; }
        } else {
          let t1 = (mins[a] - os[a]) / ds[a], t2 = (maxs[a] - os[a]) / ds[a];
          if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; }
          if (t1 > tmin) { tmin = t1; eixo = a; }
          if (t2 < tmax) tmax = t2;
          if (tmin > tmax) { fora = true; break; }
        }
      }
      if (fora) continue;
      // percorre a grade
      const px = o.x + d.x * (tmin + 1e-4), py = o.y + d.y * (tmin + 1e-4), pz = o.z + d.z * (tmin + 1e-4);
      let i = Math.min(p.nx - 1, Math.max(0, Math.floor((px - p.x0) / p.tx)));
      let j = Math.min(p.ny - 1, Math.max(0, Math.floor(py / p.ty)));
      let k = Math.min(p.nz - 1, Math.max(0, Math.floor((pz - p.z0) / p.tz)));
      const sx = d.x > 0 ? 1 : -1, sy = d.y > 0 ? 1 : -1, sz = d.z > 0 ? 1 : -1;
      const dtx = d.x !== 0 ? p.tx / Math.abs(d.x) : Infinity;
      const dty = d.y !== 0 ? p.ty / Math.abs(d.y) : Infinity;
      const dtz = d.z !== 0 ? p.tz / Math.abs(d.z) : Infinity;
      let tmx = d.x !== 0 ? tmin + ((p.x0 + (i + (sx > 0 ? 1 : 0)) * p.tx) - px) / d.x : Infinity;
      let tmy = d.y !== 0 ? tmin + (((j + (sy > 0 ? 1 : 0)) * p.ty) - py) / d.y : Infinity;
      let tmz = d.z !== 0 ? tmin + ((p.z0 + (k + (sz > 0 ? 1 : 0)) * p.tz) - pz) / d.z : Infinity;
      let t = tmin;
      let nAx = eixo, nSinal = eixo >= 0 ? -Math.sign(ds[eixo]) : 0;
      for (let passo = 0; passo < 300; passo++) {
        const idx = i + p.nx * (k + p.nz * j);
        if (p.tipo[idx]) {
          if (t < melhor) {
            melhor = t; achou = true;
            hit.p = p; hit.idx = idx; hit.dist = t;
            hit.normal.set(0, 0, 0);
            if (nAx >= 0) hit.normal.setComponent(nAx, nSinal);
            else hit.normal.copy(d).negate();
          }
          break;
        }
        if (tmx < tmy && tmx < tmz) { t = tmx; tmx += dtx; i += sx; nAx = 0; nSinal = -sx; }
        else if (tmy < tmz) { t = tmy; tmy += dty; j += sy; nAx = 1; nSinal = -sy; }
        else { t = tmz; tmz += dtz; k += sz; nAx = 2; nSinal = -sz; }
        if (t > tmax || t > melhor || i < 0 || j < 0 || k < 0 || i >= p.nx || j >= p.ny || k >= p.nz) break;
      }
    }
    if (!achou) return null;
    hit.ponto.copy(o).addScaledVector(d, hit.dist);
    return hit;
  }

  // causa dano em todos os blocos dentro de uma esfera. Retorna quantos quebraram.
  // op: { velBase, forca, origem, pedacos, max }
  danificarEsfera(c, raio, dano, op = {}) {
    let quebrados = 0;
    const max = op.max ?? 400;
    for (const p of this.predios) {
      if (c.x + raio < p.x0 || c.x - raio > p.x1 || c.y + raio < 0 || c.y - raio > p.y1 || c.z + raio < p.z0 || c.z - raio > p.z1) continue;
      const i0 = Math.max(0, Math.floor((c.x - raio - p.x0) / p.tx)), i1 = Math.min(p.nx - 1, Math.floor((c.x + raio - p.x0) / p.tx));
      const j0 = Math.max(0, Math.floor((c.y - raio) / p.ty)), j1 = Math.min(p.ny - 1, Math.floor((c.y + raio) / p.ty));
      const k0 = Math.max(0, Math.floor((c.z - raio - p.z0) / p.tz)), k1 = Math.min(p.nz - 1, Math.floor((c.z + raio - p.z0) / p.tz));
      let tocou = false;
      for (let j = j0; j <= j1; j++)
        for (let k = k0; k <= k1; k++)
          for (let i = i0; i <= i1; i++) {
            const idx = i + p.nx * (k + p.nz * j);
            if (!p.tipo[idx]) continue;
            // distância do centro da esfera até a caixa do bloco
            const bx0 = p.x0 + i * p.tx, by0 = j * p.ty, bz0 = p.z0 + k * p.tz;
            const dx = Math.max(bx0 - c.x, 0, c.x - (bx0 + p.tx));
            const dy = Math.max(by0 - c.y, 0, c.y - (by0 + p.ty));
            const dz = Math.max(bz0 - c.z, 0, c.z - (bz0 + p.tz));
            const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
            if (dist > raio) continue;
            tocou = true;
            const f = 1 - (dist / raio) * 0.5;
            p.hp[idx] -= dano * f;
            if (p.hp[idx] <= 0 && quebrados < max) {
              this.centroCelula(p, idx, _p);
              _vel.subVectors(_p, c);
              const l = _vel.length() || 1;
              _vel.multiplyScalar(((op.forca ?? 5) * f) / l);
              if (op.velBase) _vel.add(op.velBase);
              p.origem = op.origem || p.origem;
              this.quebrar(p, idx, _vel, op.pedacos ?? 1);
              quebrados++;
            }
          }
      if (tocou && op.origem) p.origem = op.origem;
    }
    return quebrados;
  }

  esconder(p, idx) {
    const m = p.malha[idx];
    const inst = p.inst[idx];
    if (inst < 0) return;
    this.malhas[m].instanceMatrix.array.fill(0, inst * 16, inst * 16 + 16);
    p.inst[idx] = -1;
    this.atualizarMalha[m] = true;
  }

  // quebra um bloco: some da estrutura e vira pedaço(s) com física
  quebrar(p, idx, vel, pedacos = 1) {
    if (!p.tipo[idx]) return;
    p.tipo[idx] = 0;
    p.vivos--;
    p.vivosAndar[(idx / (p.nx * p.nz)) | 0]--;
    this.esconder(p, idx);
    this.criarPedacos(p, idx, vel, pedacos);
    this.sujos.add(p);
    this.blocosQuebrados++;
    this.jogo.aoQuebrarBloco?.(p);
    this.checarDestruido(p);
  }

  criarPedacos(p, idx, vel, pedacos) {
    const det = this.jogo.detritos;
    this.centroCelula(p, idx, _p);
    _c.setRGB(p.cores[idx * 3], p.cores[idx * 3 + 1], p.cores[idx * 3 + 2]);
    if (det) {
      if (pedacos <= 1) {
        _tam.set(p.tx * 0.95, p.ty * 0.95, p.tz * 0.95);
        _ang.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(3);
        det.criar(_p, _tam, _c, vel, _ang);
      } else {
        const bx = vel.x, by = vel.y, bz = vel.z; // vel pode ser o mesmo vetor _vel
        for (let n = 0; n < pedacos; n++) {
          const e = 0.4 + Math.random() * 0.25;
          _tam.set(p.tx * e, p.ty * (0.35 + Math.random() * 0.3), p.tz * e);
          const pos = _s.set(
            _p.x + (Math.random() - 0.5) * p.tx * 0.5,
            _p.y + (Math.random() - 0.5) * p.ty * 0.5,
            _p.z + (Math.random() - 0.5) * p.tz * 0.5);
          _ang.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(8);
          const vx = bx + (Math.random() - 0.5) * 4, vy = by + Math.random() * 3, vz = bz + (Math.random() - 0.5) * 4;
          det.criar(pos, _tam, _c, _vel.set(vx, vy, vz), _ang);
        }
      }
    }
    if (Math.random() < 0.35) this.jogo.efeitos?.poeira(_p, 2, 1.5, 3);
  }

  checarDestruido(p) {
    if (!p.destruido && p.conta && p.vivos < p.total * 0.4) {
      p.destruido = true;
      this.destruidos++;
      this.jogo.aoDestruirPredio?.(p);
    }
  }

  // verifica se os blocos ainda estão ligados ao chão. Os soltos caem.
  verificarEstrutura(p) {
    const { nx, nz, ny } = p;
    // andar fraco: se um andar perdeu mais de 70% dos blocos, tudo acima dele cai
    let corte = ny;
    for (let j = 0; j < ny; j++) {
      if (p.totalAndar[j] > 0 && p.vivosAndar[j] < p.totalAndar[j] * 0.3) { corte = j; break; }
    }
    const vis = p.visitado;
    vis.fill(0);
    let fila = this._fila;
    if (fila.length < p.n) fila = this._fila = new Int32Array(p.n);
    let ini = 0, fim = 0;
    if (corte > 0) {
      for (let idx = 0; idx < nx * nz; idx++) if (p.tipo[idx]) { vis[idx] = 1; fila[fim++] = idx; }
    }
    const camada = nx * nz;
    while (ini < fim) {
      const idx = fila[ini++];
      const i = idx % nx, k = ((idx / nx) | 0) % nz, j = (idx / camada) | 0;
      // vizinhos
      if (i > 0 && p.tipo[idx - 1] && !vis[idx - 1]) { vis[idx - 1] = 1; fila[fim++] = idx - 1; }
      if (i < nx - 1 && p.tipo[idx + 1] && !vis[idx + 1]) { vis[idx + 1] = 1; fila[fim++] = idx + 1; }
      if (k > 0 && p.tipo[idx - nx] && !vis[idx - nx]) { vis[idx - nx] = 1; fila[fim++] = idx - nx; }
      if (k < nz - 1 && p.tipo[idx + nx] && !vis[idx + nx]) { vis[idx + nx] = 1; fila[fim++] = idx + nx; }
      if (j > 0 && p.tipo[idx - camada] && !vis[idx - camada]) { vis[idx - camada] = 1; fila[fim++] = idx - camada; }
      if (j < corte - 1 && p.tipo[idx + camada] && !vis[idx + camada]) { vis[idx + camada] = 1; fila[fim++] = idx + camada; }
    }
    let caindo = 0;
    for (let idx = 0; idx < p.n; idx++) {
      if (p.tipo[idx] && !vis[idx]) {
        p.tipo[idx] = 0;
        p.vivos--;
        p.vivosAndar[(idx / camada) | 0]--;
        this.filaQueda.push(p, idx);
        caindo++;
      }
    }
    if (caindo > 0) {
      this.checarDestruido(p);
      if (caindo > 6) {
        this.emissores.push({ p, tempo: Math.min(5, 1.5 + caindo / 80) });
        const centro = _p.set((p.x0 + p.x1) / 2, 0, (p.z0 + p.z1) / 2);
        this.jogo.aoDesabar?.(centro, caindo);
      }
    }
  }

  atualizar(dt) {
    for (const p of this.sujos) this.verificarEstrutura(p);
    this.sujos.clear();

    // blocos soltos viram pedaços aos poucos
    const n = Math.min(this.filaQueda.length / 2, MAX_QUEDA_POR_QUADRO);
    if (n > 0) {
      const det = this.jogo.detritos;
      for (let a = 0; a < n; a++) {
        const p = this.filaQueda[a * 2], idx = this.filaQueda[a * 2 + 1];
        this.esconder(p, idx);
        this.centroCelula(p, idx, _p);
        _c.setRGB(p.cores[idx * 3], p.cores[idx * 3 + 1], p.cores[idx * 3 + 2]);
        _vel.set((Math.random() - 0.5) * 2, -1 - Math.random() * 2, (Math.random() - 0.5) * 2);
        _ang.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(1.5);
        _tam.set(p.tx * 0.96, p.ty * 0.96, p.tz * 0.96);
        det?.criar(_p, _tam, _c, _vel, _ang);
        if (a % 10 === 0) this.jogo.efeitos?.poeira(_p, 1, 2, 5);
      }
      this.filaQueda.splice(0, n * 2);
    }

    // poeira subindo da base dos prédios que desabam
    for (let e = this.emissores.length - 1; e >= 0; e--) {
      const em = this.emissores[e];
      em.tempo -= dt;
      const p = em.p;
      const qtd = Math.random() < 0.6 ? 2 : 1;
      for (let a = 0; a < qtd; a++) {
        _p.set(p.x0 + Math.random() * (p.x1 - p.x0), 1 + Math.random() * 3, p.z0 + Math.random() * (p.z1 - p.z0));
        _p.x += (Math.random() - 0.5) * 10;
        _p.z += (Math.random() - 0.5) * 10;
        this.jogo.efeitos?.poeira(_p, 1, 4, 9);
      }
      if (em.tempo <= 0) this.emissores.splice(e, 1);
    }

    for (let m = 1; m <= 2; m++) {
      if (this.atualizarMalha[m]) {
        this.malhas[m].instanceMatrix.needsUpdate = true;
        this.atualizarMalha[m] = false;
      }
    }
  }
}
