// Entidades: tudo que se move e pode ser pego (pessoas, carros, soldados, veículos...).
// Também tem a rede de ruas usada pelos veículos.
import * as THREE from 'three';
import { RUAS_X, RUAS_Z, FAIXA, FIM_X, FIM_Z, QUARTEIROES, CALCADA } from './cidade.js';
import { materialCores, materialQueimado, geoPessoa, geoCarro, geoBomba, adicionarContorno, TIPOS_CARRO } from './modelos.js';

const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const _c2 = new THREE.Vector3();

// ---------- rede de ruas (nós nos cruzamentos e nas pontas) ----------
export const NOS = [];
const indiceNo = new Map();
function addNo(x, z) {
  const ch = `${x},${z}`;
  if (indiceNo.has(ch)) return indiceNo.get(ch);
  NOS.push({ x, z, viz: [] });
  indiceNo.set(ch, NOS.length - 1);
  return NOS.length - 1;
}
function ligar(a, b) { NOS[a].viz.push(b); NOS[b].viz.push(a); }
for (const x of RUAS_X) {
  const linha = [addNo(x, -FIM_Z), ...RUAS_Z.map((z) => addNo(x, z)), addNo(x, FIM_Z)];
  for (let i = 0; i < linha.length - 1; i++) ligar(linha[i], linha[i + 1]);
}
for (const z of RUAS_Z) {
  const linha = [addNo(-FIM_X, z), ...RUAS_X.map((x) => addNo(x, z)), addNo(FIM_X, z)];
  for (let i = 0; i < linha.length - 1; i++) ligar(linha[i], linha[i + 1]);
}
export const NOS_PONTA = NOS.map((n, i) => i).filter((i) => NOS[i].viz.length === 1);

export function noMaisProximo(x, z) {
  let melhor = 0, d = Infinity;
  NOS.forEach((n, i) => { const dd = (n.x - x) ** 2 + (n.z - z) ** 2; if (dd < d) { d = dd; melhor = i; } });
  return melhor;
}

export function anguloLerp(a, b, t) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

// ---------- entidade base ----------
export class Entidade {
  constructor(jogo, objeto, op) {
    this.jogo = jogo;
    this.obj = objeto;
    this.pos = objeto.position;
    this.vel = new THREE.Vector3();
    this.giro = new THREE.Vector3();
    this.tipo = op.tipo;
    this.raio = op.raio ?? 0.6;
    this.altura = op.altura ?? 1.8;
    this.vidaMax = this.vida = op.vida ?? 10;
    this.massa = op.massa ?? 1;
    this.agarravel = op.agarravel ?? true;
    this.inimigo = op.inimigo ?? false;
    this.estado = 'normal'; // normal | preso | arremessado | caido | morto
    this.remover = false;
    this.tempoEstado = 0;
    this.lancadoPorHeroi = false;
    this.podeVoarMorto = true;
    this.voandoMorto = false;
    objeto.traverse((o) => { if (o.isMesh) { o.castShadow = true; } });
    // contorno preto de desenho (os heróis já vêm com o deles)
    if (op.contorno !== 0) adicionarContorno(objeto, op.contorno ?? (this.raio > 1.5 ? 0.05 : 0.022));
    jogo.cena.add(objeto);
  }

  centro(out) { return out.copy(this.pos).setY(this.pos.y + this.altura * 0.5); }

  levarDano(qtd, origem = 'heroi') {
    if (this.estado === 'morto') return;
    this.vida -= qtd;
    if (this.vida <= 0) {
      this.vida = 0;
      const noAr = this.estado === 'arremessado' || this.pos.y > 0.5;
      this.morrer(origem);
      if (noAr && this.estado === 'morto' && !this.remover) this.voandoMorto = true;
    }
  }

  morrer() { this.estado = 'morto'; this.tempoEstado = 0; }

  // ----- corpo depois da morte (pessoas e soldados) -----
  // em vez de "deitar" na hora, o corpo tomba sobre os pés, assenta no chão e depois afunda e some
  iniciarMorte() {
    this.estado = 'morto';
    this.tempoEstado = 0;
    this.giro.multiplyScalar(0.25); // gira menos voando
    this.obj.rotation.order = 'YXZ'; // tomba para frente/trás do próprio corpo
    this.alvoDeitado = null;
    this.ladoQueda = Math.random() < 0.5 ? 1 : -1;
    const naCalcada = this.pos.y > 0.1 && this.pos.y < 0.5;
    this.chaoMorto = (naCalcada ? 0.2 : 0) + 0.14;
  }

  corpoCaido(dt) {
    if (this.voandoMorto) { this.fisicaArremesso(dt); return; }
    const r = this.obj.rotation;
    let x = ((r.x + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; // entre -PI e PI
    if (this.alvoDeitado == null) this.alvoDeitado = (x > 0.15 ? 1 : x < -0.15 ? -1 : this.ladoQueda) * (Math.PI / 2);
    const k = Math.min(1, dt * 5);
    r.x = x + (this.alvoDeitado - x) * k;
    r.z += (0 - r.z) * k;
    if (!this.noTeto) this.pos.y += ((this.chaoMorto ?? 0.14) - this.pos.y) * Math.min(1, dt * 8);
    // depois de um tempo afunda devagar no chão e some
    if (this.tempoEstado > 10) {
      this.pos.y -= dt * 0.35;
      if (this.tempoEstado > 13) this.remover = true;
    }
  }

  atordoar(t) { this.atordoadoT = Math.max(this.atordoadoT || 0, t); }

  // empurrão (explosão, soco, herói passando)
  lancar(vel, porHeroi = true) {
    if (!Number.isFinite(vel.x + vel.y + vel.z)) return; // proteção contra valor inválido
    this.noTeto = false;
    if (this.estado === 'morto' && !this.podeVoarMorto) return;
    if (this.estado === 'preso') return;
    this.vel.copy(vel);
    this.giro.set((Math.random() - 0.5) * 10, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 10);
    if (this.estado !== 'morto') this.estado = 'arremessado';
    else { this.voandoMorto = true; this.alvoDeitado = null; this.giro.multiplyScalar(0.3); }
    this.lancadoPorHeroi = porHeroi;
    this.tempoEstado = 0;
  }

  atualizar(dt) {
    this.tempoEstado += dt;
    switch (this.estado) {
      case 'normal':
        if (this.atordoadoT > 0) {
          // atordoado pelo soco: só desliza, sem agir
          this.atordoadoT -= dt;
          this.pos.addScaledVector(this.vel, dt);
          this.vel.multiplyScalar(Math.max(0, 1 - dt * 4));
          if (this.pos.y < 0) this.pos.y = 0;
        } else this.ia(dt);
        break;
      case 'arremessado': this.fisicaArremesso(dt); break;
      case 'caido': this.caido(dt); break;
      case 'morto': this.morto(dt); break;
      default: break;
    }
  }

  ia() {}
  caido(dt) {
    if (this.noTeto) { if (this.tempoEstado > 8) this.remover = true; return; }
    if (this.tempoEstado > 2.5) { this.estado = 'normal'; this.obj.rotation.set(0, this.obj.rotation.y, 0); this.pos.y = 0.2; } }
  morto(dt) {
    if (this.voandoMorto) this.fisicaArremesso(dt);
    if (this.tempoEstado > 12) this.remover = true;
  }

  // voo depois de arremessado: gravidade, giro e batidas
  fisicaArremesso(dt) {
    const jogo = this.jogo;
    const passos = 3;
    const h = dt / passos;
    for (let p = 0; p < passos; p++) {
      this.vel.y -= 25 * h;
      this.pos.addScaledVector(this.vel, h);
      this.obj.rotation.x += this.giro.x * h;
      this.obj.rotation.y += this.giro.y * h;
      this.obj.rotation.z += this.giro.z * h;
      const v = this.vel.length();
      this.centro(_c);
      // prédios
      if (jogo.predios.solido(_c.x, _c.y, _c.z)) {
        if (v > 12) this.impacto(v);
        if (this.estado !== 'arremessado' && !this.voandoMorto) return;
        if (v > 32) {
          // rápido demais: atravessa a parede e continua voando
          this.vel.multiplyScalar(0.72);
          continue;
        }
        // devagar: volta para fora do bloco
        this.pos.addScaledVector(this.vel, -h);
        this.centro(_c);
        if (jogo.predios.solido(_c.x, _c.y, _c.z)) this.pos.y += 0.6; // nasceu dentro: empurra para cima
        if (this.vel.y < 0) {
          // caiu em cima de um telhado
          this.vel.y = 0;
          this.vel.x *= 0.5; this.vel.z *= 0.5;
          if (Math.hypot(this.vel.x, this.vel.z) < 3) { this.pousarNoTeto(); return; }
        } else {
          this.vel.x *= -0.3; this.vel.z *= -0.3;
        }
        continue;
      }
      // outras entidades
      if (v > 15) {
        for (const e of jogo.entidades) {
          if (e === this || e.estado === 'preso' || e.remover) continue;
          if (e.estado === 'morto' && !e.podeVoarMorto) continue;
          e.centro(_c2);
          const r = this.raio + e.raio;
          if (_c2.distanceToSquared(_c) > r * r) continue;
          // bateu: empurra o outro e causa dano
          const forca = v * this.massa;
          e.levarDano(forca * 0.6 / Math.max(1, e.massa * 0.5), this.lancadoPorHeroi ? 'heroi' : 'inimigo');
          _v.copy(this.vel).multiplyScalar(Math.min(1.2, this.massa / e.massa) * 0.7).y += 6;
          e.lancar(_v, this.lancadoPorHeroi);
          this.vel.multiplyScalar(0.6);
        }
      }
      // chão
      if (this.pos.y <= 0) {
        this.pos.y = 0;
        if (v > 18) this.impacto(v);
        if (this.estado !== 'arremessado' && !this.voandoMorto) return;
        this.vel.y = Math.abs(this.vel.y) * 0.3;
        this.vel.x *= 0.6; this.vel.z *= 0.6;
        this.giro.multiplyScalar(0.5);
        if (this.vel.length() < 3) {
          this.vel.set(0, 0, 0);
          if (this.estado === 'morto') { this.voandoMorto = false; this.aoAterrissarMorto(); }
          else this.pousar();
          return;
        }
      }
    }
  }

  // bateu forte em algo
  impacto(v) {
    const jogo = this.jogo;
    this.centro(_c);
    const forca = v * this.massa;
    const origem = this.lancadoPorHeroi ? 'heroi' : 'inimigo';
    _v.copy(this.vel).multiplyScalar(0.6);
    jogo.predios.danificarEsfera(_c, 1.6 + Math.min(4, this.massa * 0.7), forca * 4, { velBase: _v, forca: 12, origem, pedacos: 3 });
    if (forca > 120) jogo.congelar(0.04);
    jogo.efeitos?.poeira(_c, 4 + Math.min(10, this.massa * 2), 2, 4);
    jogo.efeitos?.faiscas(_c, 8, 12);
    jogo.tremerPerto(_c, Math.min(0.6, forca / 300));
    jogo.audio?.impacto(Math.min(1, forca / 200), _c);
    if (this.estado !== 'morto') this.levarDano(v * (this.chefe ? 0.45 : 1.5), origem); // heróis aguentam mais pancada
  }

  aoAterrissarMorto() { this.obj.rotation.set(0, this.obj.rotation.y, 0); }

  // parou em cima de um prédio: fica deitado lá e some depois
  pousarNoTeto() {
    this.vel.set(0, 0, 0);
    this.giro.set(0, 0, 0);
    this.obj.rotation.set(-Math.PI / 2, this.obj.rotation.y, 0);
    if (this.estado === 'morto') { this.voandoMorto = false; this.noTeto = true; return; }
    this.estado = 'caido';
    this.tempoEstado = 0;
    this.noTeto = true;
  }

  pousar() {
    if (this.estado === 'morto') return;
    this.estado = 'caido';
    this.tempoEstado = 0;
    this.obj.rotation.set(-Math.PI / 2, this.obj.rotation.y, 0); // deitado, levanta depois
    this.pos.y = 0.3;
  }

  destruir() { this.jogo.cena.remove(this.obj); }
}

// ---------- pedestre ----------
export class Pedestre extends Entidade {
  constructor(jogo, q, canto) {
    const mesh = new THREE.Mesh(geoPessoa((Math.random() * 1000) | 0), materialCores);
    super(jogo, mesh, { tipo: 'pessoa', raio: 0.5, altura: 1.8, vida: 15, massa: 1 });
    this.q = q;
    this.canto = canto;
    this.sentido = Math.random() < 0.5 ? 1 : -1;
    this.velAndar = 1.2 + Math.random() * 0.6;
    this.medo = 0;
    this.fase = Math.random() * 10;
    const p = this.pontoCanto(canto);
    this.pos.set(p.x + (Math.random() - 0.5) * 10 * (canto % 2), 0.2, p.z + (Math.random() - 0.5) * 10 * ((canto + 1) % 2));
  }

  pontoCanto(c) {
    const s = [[-1, -1], [1, -1], [1, 1], [-1, 1]][((c % 4) + 4) % 4];
    return _c2.set(this.q.cx + s[0] * CALCADA, 0.2, this.q.cz + s[1] * CALCADA);
  }

  ia(dt) {
    const heroi = this.jogo.heroi;
    const dx = this.pos.x - heroi.pos.x, dz = this.pos.z - heroi.pos.z;
    const dh = Math.hypot(dx, dz);
    const perto = dh < 22 && heroi.pos.y < 25;
    if (perto || this.jogo.perigoPerto(this.pos)) this.medo = 4;
    this.medo -= dt;
    this.fase += dt;
    let vx, vz, vel;
    if (this.medo > 0) {
      // fugir do herói
      vel = 6.5;
      const l = dh || 1;
      vx = dx / l; vz = dz / l;
      // não entra nos prédios: tenta desviar
      const fx = this.pos.x + vx * 1.5, fz = this.pos.z + vz * 1.5;
      if (this.jogo.predios.solido(fx, 1, fz)) { const t = vx; vx = -vz; vz = t; }
    } else {
      // andar pela calçada até o próximo canto
      vel = this.velAndar;
      const alvo = this.pontoCanto(this.canto);
      vx = alvo.x - this.pos.x; vz = alvo.z - this.pos.z;
      const l = Math.hypot(vx, vz);
      if (l < 1) { this.canto += this.sentido; vx = vz = 0; }
      else { vx /= l; vz /= l; }
    }
    this.pos.x += vx * vel * dt;
    this.pos.z += vz * vel * dt;
    this.pos.y = 0.2 + Math.abs(Math.sin(this.fase * vel * 2.5)) * 0.06;
    if (vx || vz) this.obj.rotation.y = anguloLerp(this.obj.rotation.y, Math.atan2(vx, vz), Math.min(1, dt * 10));
  }

  morrer() {
    // nocauteado: tomba e fica caído
    this.iniciarMorte();
    this.jogo.aoNocautear?.(this);
  }
  aoAterrissarMorto() { this.alvoDeitado = null; this.chaoMorto = 0.14; }
  morto(dt) { this.corpoCaido(dt); }
}

// ---------- veículo que anda pelas ruas ----------
export class Veiculo extends Entidade {
  constructor(jogo, objeto, op) {
    super(jogo, objeto, op);
    this.de = op.de ?? NOS_PONTA[(Math.random() * NOS_PONTA.length) | 0];
    this.para = NOS[this.de].viz[0];
    this.s = op.s ?? 0;
    this.velocidade = op.velocidade ?? 10;
    this.velAtual = this.velocidade;
    const p = this.posicaoIdeal(_c);
    this.pos.copy(p);
    this.obj.rotation.y = this.direcaoAngulo();
  }

  direcaoAngulo() {
    const a = NOS[this.de], b = NOS[this.para];
    return Math.atan2(b.x - a.x, b.z - a.z);
  }

  posicaoIdeal(out) {
    const a = NOS[this.de], b = NOS[this.para];
    const dx = b.x - a.x, dz = b.z - a.z;
    const L = Math.hypot(dx, dz) || 1;
    const fx = dx / L, fz = dz / L;
    // direita da direção = (-fz, fx)
    return out.set(a.x + fx * this.s - fz * FAIXA, 0, a.z + fz * this.s + fx * FAIXA);
  }

  escolherProximo(no, anterior) {
    const viz = NOS[no].viz;
    const opcoes = viz.filter((v) => v !== anterior);
    if (opcoes.length === 0) return anterior;
    return opcoes[(Math.random() * opcoes.length) | 0];
  }

  // anda pela rede de ruas
  dirigir(dt, vel) {
    const a = NOS[this.de], b = NOS[this.para];
    const L = Math.hypot(b.x - a.x, b.z - a.z);
    this.s += vel * dt;
    if (this.s >= L) {
      this.s -= L;
      const prox = this.escolherProximo(this.para, this.de);
      this.de = this.para;
      this.para = prox;
    }
    const p = this.posicaoIdeal(_c);
    const k = Math.min(1, dt * 6);
    this.pos.x += (p.x - this.pos.x) * k;
    this.pos.z += (p.z - this.pos.z) * k;
    this.pos.y += (0 - this.pos.y) * k;
    this.obj.rotation.y = anguloLerp(this.obj.rotation.y, this.direcaoAngulo(), Math.min(1, dt * 5));
  }

  // depois de cair no chão, volta para a rua mais próxima
  pousar() {
    if (this.estado === 'morto') return;
    this.estado = 'normal';
    this.obj.rotation.set(0, this.obj.rotation.y, 0);
    this.de = noMaisProximo(this.pos.x, this.pos.z);
    this.para = NOS[this.de].viz[(Math.random() * NOS[this.de].viz.length) | 0];
    this.s = 0;
  }

  // veículo destruído: explode e vira sucata
  morrer(origem = 'heroi') {
    if (this.estado === 'morto') return;
    this.estado = 'morto';
    this.tempoEstado = 0;
    this.obj.traverse((o) => { if (o.isMesh && !o.userData.contorno) o.material = materialQueimado; });
    this.centro(_c);
    this.jogo.explosao(_c, 5 + this.massa, 60, origem, this);
  }

  aoAterrissarMorto() { this.obj.rotation.set(0, this.obj.rotation.y, Math.random() < 0.3 ? Math.PI : 0); if (this.obj.rotation.z) this.pos.y = this.altura; }

  morto(dt) {
    if (this.voandoMorto) this.fisicaArremesso(dt);
    if (this.tempoEstado < 6 && Math.random() < 0.3) {
      this.centro(_c);
      this.jogo.efeitos?.fumaca(_c, 1, 3, 0.15);
      if (Math.random() < 0.5) this.jogo.efeitos?.fogo(_c, 1, 1, 2);
    }
    if (this.tempoEstado > 15) this.remover = true;
  }
}

const CORES_CARRO = [0xd62828, 0x1d70b8, 0xf2f2f2, 0x222222, 0xf4c20d, 0x2a9d8f, 0x8d99ae, 0xe76f51];

export class Carro extends Veiculo {
  constructor(jogo, de, s) {
    const cor = CORES_CARRO[(Math.random() * CORES_CARRO.length) | 0];
    // sorteia o modelo: mais sedãs, alguns SUVs/picapes/táxis, poucos ônibus e viaturas
    const r = Math.random();
    const modelo = r < 0.36 ? 'sedan' : r < 0.56 ? 'suv' : r < 0.7 ? 'picape' : r < 0.83 ? 'taxi' : r < 0.93 ? 'policia' : 'onibus';
    const t = TIPOS_CARRO[modelo];
    const corFinal = modelo === 'onibus' ? [0xf2b705, 0x1e6fd9, 0xe8e8e8, 0x2a9d8f][(Math.random() * 4) | 0] : cor;
    const mesh = new THREE.Mesh(geoCarro(corFinal, modelo), materialCores);
    super(jogo, mesh, { tipo: 'carro', raio: t.raio, altura: t.altura, vida: t.vida, massa: t.massa, de, s, velocidade: (9 + Math.random() * 5) * t.vel });
    this.modelo = modelo;
    if (modelo === 'policia') {
      // giroflex: duas luzes que piscam
      this.luzes = [0xff2030, 0x2050ff].map((c, i) => {
        const l = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.28), new THREE.MeshBasicMaterial({ color: c }));
        l.position.set(i ? 0.27 : -0.27, 1.8, -0.3);
        mesh.add(l);
        return l;
      });
    }
  }

  atualizar(dt) {
    super.atualizar(dt);
    if (this.luzes) {
      const ligado = this.estado !== 'morto' && Math.floor(this.jogo.tempo * 6) % 2 === 0;
      this.luzes[0].material.color.setHex(ligado ? 0xff2030 : 0x401015).multiplyScalar(ligado ? 4 : 1);
      this.luzes[1].material.color.setHex(!ligado && this.estado !== 'morto' ? 0x2050ff : 0x101840).multiplyScalar(!ligado && this.estado !== 'morto' ? 4 : 1);
    }
  }

  ia(dt) {
    // freia se houver carro na frente
    let alvo = this.velocidade;
    const ang = this.obj.rotation.y;
    const fx = Math.sin(ang), fz = Math.cos(ang);
    for (const e of this.jogo.entidades) {
      if (e === this || !(e instanceof Veiculo) || e.estado !== 'normal') continue;
      const dx = e.pos.x - this.pos.x, dz = e.pos.z - this.pos.z;
      const frente = dx * fx + dz * fz;
      if (frente > 0 && frente < this.raio + e.raio + 3 && Math.abs(dx * fz - dz * fx) < 1.5) { alvo = 0; break; }
    }
    // pânico: acelera se o herói estiver perto
    const h = this.jogo.heroi.pos;
    if (alvo > 0 && Math.hypot(h.x - this.pos.x, h.z - this.pos.z) < 30) alvo *= 1.8;
    this.velAtual += (alvo - this.velAtual) * Math.min(1, dt * 3);
    this.dirigir(dt, this.velAtual);
  }
}

// bomba de combustível do posto: explode quando leva dano
export class BombaCombustivel extends Entidade {
  constructor(jogo, pos) {
    super(jogo, new THREE.Mesh(geoBomba(), materialCores), { tipo: 'bomba', raio: 0.9, altura: 1.8, vida: 25, massa: 2, agarravel: true });
    this.pos.copy(pos);
  }
  pousar() { this.estado = 'normal'; this.obj.rotation.set(0, 0, 0); }
  morrer(origem = 'heroi') {
    if (this.estado === 'morto') return;
    this.estado = 'morto';
    this.obj.visible = false;
    this.centro(_c);
    // explosão grande que quebra a cobertura do posto
    this.jogo.explosao(_c, 14, 120, origem, this);
    this.remover = true;
  }
}

// cria a população inicial e mantém o número de pessoas/carros
export class Populacao {
  constructor(jogo) {
    this.jogo = jogo;
    this.alvoPessoas = 75;
    this.alvoCarros = 28;
    this.tempo = 0;
    const calcadas = QUARTEIROES;
    for (let i = 0; i < this.alvoPessoas; i++) {
      const q = calcadas[(Math.random() * calcadas.length) | 0];
      jogo.entidades.push(new Pedestre(jogo, q, (Math.random() * 4) | 0));
    }
    for (let i = 0; i < this.alvoCarros; i++) {
      const de = (Math.random() * NOS.length) | 0;
      jogo.entidades.push(new Carro(jogo, de, Math.random() * 40));
    }
    for (const p of jogo.bombasPosto) jogo.entidades.push(new BombaCombustivel(jogo, p));
  }

  atualizar(dt) {
    this.tempo += dt;
    if (this.tempo < 1.5) return;
    this.tempo = 0;
    let pessoas = 0, carros = 0;
    for (const e of this.jogo.entidades) {
      if (e.estado === 'morto') continue;
      if (e.tipo === 'pessoa') pessoas++;
      else if (e.tipo === 'carro') carros++;
    }
    const h = this.jogo.heroi.pos;
    if (pessoas < this.alvoPessoas) {
      // nasce longe do herói
      for (let t = 0; t < 5; t++) {
        const q = QUARTEIROES[(Math.random() * QUARTEIROES.length) | 0];
        if (Math.hypot(q.cx - h.x, q.cz - h.z) > 60) {
          this.jogo.entidades.push(new Pedestre(this.jogo, q, (Math.random() * 4) | 0));
          break;
        }
      }
    }
    if (carros < this.alvoCarros) {
      const de = NOS_PONTA[(Math.random() * NOS_PONTA.length) | 0];
      if (Math.hypot(NOS[de].x - h.x, NOS[de].z - h.z) > 60) this.jogo.entidades.push(new Carro(this.jogo, de, 0));
    }
  }
}
