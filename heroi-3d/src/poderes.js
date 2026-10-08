// Poderes do herói: laser pelos olhos, soco de impacto e pegar/arremessar.
import * as THREE from 'three';
import { Raio } from './efeitos.js';

const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const _o = new THREE.Vector3();
const _olho = new THREE.Vector3();
const _vel = new THREE.Vector3();

// para onde o jogador está mirando (raio saindo do centro da tela)
export class Mira {
  constructor(jogo) {
    this.jogo = jogo;
    this.ponto = new THREE.Vector3();
    this.normal = new THREE.Vector3(0, 1, 0);
    this.entidade = null;
    this.tipo = 'ceu';
    this.dist = 0;
  }

  atualizar() {
    const jogo = this.jogo;
    const o = jogo.cam3.position;
    const d = jogo.camera.frente;
    let melhor = 400;
    this.tipo = 'ceu';
    this.entidade = null;
    // prédios
    const hit = jogo.predios.raycast(o, d, melhor);
    if (hit) { melhor = hit.dist; this.tipo = 'predio'; this.normal.copy(hit.normal); }
    // chão
    if (d.y < -0.001) {
      const t = -o.y / d.y;
      if (t < melhor) { melhor = t; this.tipo = 'chao'; this.normal.set(0, 1, 0); }
    }
    // entidades (esferas)
    const minimo = o.distanceTo(jogo.heroi.pos) - 0.5;
    for (const e of jogo.entidades) {
      if (e.remover || e.estado === 'preso') continue;
      e.centro(_c);
      _v.subVectors(_c, o);
      const t = _v.dot(d);
      if (t < minimo || t > melhor) continue;
      const perp2 = _v.lengthSq() - t * t;
      const r = e.raio + 0.3;
      if (perp2 < r * r) { melhor = t; this.tipo = 'entidade'; this.entidade = e; this.normal.copy(d).negate(); }
    }
    this.dist = melhor;
    this.ponto.copy(o).addScaledVector(d, melhor);
  }

  // procura algo para pegar (com mais tolerância que a mira)
  alvoAgarravel(maxDist = 90) {
    const jogo = this.jogo;
    const o = jogo.cam3.position;
    const d = jogo.camera.frente;
    const minimo = o.distanceTo(jogo.heroi.pos) - 0.5;
    let melhor = null, melhorT = Infinity;
    const parede = jogo.predios.raycast(o, d, maxDist);
    const limite = parede ? parede.dist + 2 : maxDist;
    for (const e of jogo.entidades) {
      if (!e.agarravel || e.remover || e.estado === 'preso') continue;
      e.centro(_c);
      _v.subVectors(_c, o);
      const t = _v.dot(d);
      if (t < minimo || t > limite || t > melhorT) continue;
      const perp = Math.sqrt(Math.max(0, _v.lengthSq() - t * t));
      if (perp < e.raio + 1.2 + t * 0.025) { melhor = e; melhorT = t; }
    }
    return melhor;
  }
}

// ---------- laser ----------
export class Laser {
  constructor(jogo) {
    this.jogo = jogo;
    this.raios = [new Raio(jogo.cena, 0xffe0e0, 0xff1a1a, 0.035, 0.12), new Raio(jogo.cena, 0xffe0e0, 0xff1a1a, 0.035, 0.12)];
    this.calor = 0; // 0 a 100
    this.superaquecido = false;
    this.ativo = false;
    this.tempoFumaca = 0;
    this.inicio = new THREE.Vector3(); // feixe atual (usado no choque de raios)
    this.fim = new THREE.Vector3();
  }

  atualizar(dt, querAtirar) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    const pode = querAtirar && !this.superaquecido && !heroi.morto;
    heroi.olharCamera = pode;
    if (pode) {
      this.calor += 22 * dt;
      if (this.calor >= 100) { this.calor = 100; this.superaquecido = true; jogo.hud?.mensagem('LASER SUPERAQUECIDO!', '#ff4444'); }
    } else {
      this.calor = Math.max(0, this.calor - (this.superaquecido ? 20 : 32) * dt);
      if (this.superaquecido && this.calor <= 25) this.superaquecido = false;
    }
    if (!pode) {
      if (this.ativo) { this.raios.forEach((r) => r.esconder()); jogo.audio?.laser(false); }
      this.ativo = false;
      heroi.rig.matOlho.color.set(this.superaquecido ? 0xff8888 : 0xffffff);
      return;
    }
    if (!this.ativo) jogo.audio?.laser(true);
    this.ativo = true;
    heroi.rig.matOlho.color.set(0xff2020);

    const mira = jogo.mira;
    const ponto = mira.ponto;
    // raio sai dos dois olhos
    this.inicio.set(0, 0, 0);
    heroi.rig.olhos.forEach((olho, i) => {
      olho.getWorldPosition(_olho);
      this.inicio.addScaledVector(_olho, 0.5);
      if (!jogo.choque?.ativo) this.raios[i].mostrar(_olho, ponto, jogo.tempo + i);
    });
    this.fim.copy(ponto);
    if (jogo.choque?.ativo) return; // raios travados no choque: quem desenha e causa dano é o choque

    // dano
    if (mira.tipo === 'entidade') {
      mira.entidade.levarDano(170 * dt * (mira.entidade.resistenciaLaser ?? 1), 'heroi');
    } else if (mira.tipo === 'predio') {
      _vel.copy(mira.normal).multiplyScalar(5);
      jogo.predios.danificarEsfera(ponto, 1.8, 110 * dt, { velBase: _vel, forca: 6, origem: 'heroi', pedacos: 4 });
    }
    if (mira.tipo !== 'ceu') {
      // respingo de dano em volta
      for (const e of jogo.entidades) {
        if (e === mira.entidade || e.remover || e.estado === 'preso') continue;
        if (e.centro(_c).distanceToSquared(ponto) < 6) e.levarDano(60 * dt, 'heroi');
      }
      _o.copy(ponto).addScaledVector(mira.normal, 0.3);
      jogo.efeitos.faiscas(_o, 3, 10);
      jogo.efeitos.brilho(_o, 2.5, 1, 0.25, 0.15);
      this.tempoFumaca -= dt;
      if (this.tempoFumaca <= 0) {
        this.tempoFumaca = 0.12;
        jogo.efeitos.fumaca(_o, 1, 2, 0.3);
        jogo.marcarPerigo(ponto, 18);
      }
    }
  }
}

// ---------- soco de impacto (tecla E) ----------
export class Soco {
  constructor(jogo) {
    this.jogo = jogo;
    this.espera = 0;
  }

  atualizar(dt, apertou) {
    this.espera -= dt;
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    if (!apertou || this.espera > 0 || heroi.morto) return;
    this.espera = 0.7;
    heroi.soco = 1;
    const frente = jogo.camera.frente;
    heroi.centro(_c);
    const parede = jogo.predios.raycast(_c, frente, 8);
    const pertoDoChao = heroi.pos.y < 3;

    const alvo = jogo.mira.tipo === 'entidade' && jogo.mira.dist < 14 ? jogo.mira.entidade : null;
    if (alvo) {
      // soco direto: o alvo sai voando e atravessa prédios
      alvo.levarDano(60, 'heroi');
      _vel.copy(frente).multiplyScalar(95 / Math.sqrt(alvo.massa)).y += 6;
      alvo.lancar(_vel, true);
      alvo.centro(_o);
      jogo.efeitos.ondaDeChoque(_o, 7, 0.3, 0xffffff, frente);
      jogo.efeitos.faiscas(_o, 14, 16, [1, 0.95, 0.8]);
      jogo.camera.tremer(0.45);
      jogo.congelar(0.09);
      jogo.audio?.soco(1);
      return;
    }
    if (parede || !pertoDoChao) {
      // soco para frente: abre um rombo no prédio
      const ponto = parede ? _o.copy(parede.ponto) : _o.copy(_c).addScaledVector(frente, 3);
      _vel.copy(frente).multiplyScalar(38);
      jogo.predios.danificarEsfera(ponto, 5.5, 500, { velBase: _vel, forca: 18, origem: 'heroi', pedacos: 4 });
      _v.copy(ponto).addScaledVector(frente, 5);
      jogo.predios.danificarEsfera(_v, 4.5, 300, { velBase: _vel, forca: 14, origem: 'heroi', pedacos: 2 });
      jogo.congelar(0.07);
      jogo.detritos.empurrar(ponto, 12, 18);
      this.empurrarEntidades(ponto, 11, frente, 70, 45);
      jogo.efeitos.ondaDeChoque(ponto, 10, 0.35, 0xffffff, frente);
      jogo.efeitos.poeira(ponto, 10, 4, 7);
      jogo.efeitos.faiscas(ponto, 15, 16, [1, 0.9, 0.7]);
      jogo.camera.tremer(0.55);
      jogo.marcarPerigo(ponto, 35);
      jogo.audio?.soco(1);
    } else {
      // soco no chão: onda de choque em volta
      _o.copy(heroi.pos);
      _v.copy(_o).y = 1;
      jogo.predios.danificarEsfera(_v, 10, 280, { forca: 24, origem: 'heroi', pedacos: 3 });
      jogo.congelar(0.08);
      jogo.detritos.empurrar(_o, 22, 20);
      this.empurrarEntidades(_o, 18, null, 45, 55);
      jogo.efeitos.ondaDeChoque(_v.set(_o.x, 0.4, _o.z), 20, 0.5);
      jogo.efeitos.ondaDeChoque(_v.set(_o.x, 0.6, _o.z), 12, 0.35, 0xffd9a0);
      for (let i = 0; i < 28; i++) {
        const a = (i / 28) * Math.PI * 2;
        _v.set(_o.x + Math.cos(a) * 4, 0.6, _o.z + Math.sin(a) * 4);
        jogo.efeitos.normal.emitir(_v.x, _v.y, _v.z, {
          vx: Math.cos(a) * 18, vy: 1, vz: Math.sin(a) * 18, vida: 1.6, tamIni: 3, tamFim: 9, alfa: 0.6,
          gravidade: 0, arrasto: 1.6, r: 0.62, g: 0.58, b: 0.52,
        });
      }
      jogo.camera.tremer(0.75);
      jogo.marcarPerigo(_o, 45);
      jogo.audio?.soco(1.2);
    }
  }

  empurrarEntidades(centro, raio, direcao, forca, dano) {
    for (const e of this.jogo.entidades) {
      if (e.remover || e.estado === 'preso') continue;
      e.centro(_c);
      const d = _c.distanceTo(centro);
      if (d > raio) continue;
      const f = 1 - d / raio;
      e.levarDano(dano * f, 'heroi');
      if (direcao) _vel.copy(direcao).multiplyScalar(forca * f);
      else _vel.subVectors(_c, centro).setY(0).normalize().multiplyScalar(forca * f);
      _vel.y += 12 * f;
      _vel.divideScalar(Math.sqrt(e.massa));
      e.lancar(_vel, true);
    }
  }
}

// ---------- pegar e arremessar (botão direito) ----------
export class Agarrar {
  constructor(jogo) {
    this.jogo = jogo;
    this.alvoMira = null;
  }

  atualizar(dt, ctrl) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    const preso = heroi.segurando;
    this.alvoMira = preso ? null : jogo.mira.alvoAgarravel();

    if (!preso && ctrl.dirApertou && this.alvoMira) {
      const e = this.alvoMira;
      e.estadoAntesPreso = e.estado;
      e.estado = 'preso';
      e.vel.set(0, 0, 0);
      e.obj.rotation.set(0, e.obj.rotation.y, 0);
      heroi.segurando = e;
      e.aoSerPego?.();
      jogo.audio?.pegar();
    }
    if (heroi.segurando) {
      const e = heroi.segurando;
      if (e.remover) { heroi.segurando = null; return; }
      // fica preso na frente do herói
      const frente = jogo.camera.frente;
      heroi.centro(_c);
      _v.copy(_c).addScaledVector(frente, 1.6 + e.raio).y += 0.2 - e.altura * 0.5;
      // em alta velocidade fica colado na frente (é ele que bate primeiro nas paredes)
      e.pos.lerp(_v, heroi.vel.length() > 10 ? 1 : Math.min(1, dt * 14));
      e.obj.rotation.y = heroi.yawCorpo;
      e.obj.rotation.z = Math.sin(jogo.tempo * 12) * 0.05; // se debatendo
      this.arrastar(e, dt);
      this.esperaPancada = (this.esperaPancada ?? 0) - dt;
      if (ctrl.apertou('KeyF') && this.esperaPancada <= 0 && !e.remover) this.pancada(e);
      if (heroi.segurando && (ctrl.dirSoltou || !ctrl.mouseDir || heroi.morto)) this.arremessar(e);
    }
  }

  // voando rápido com alguém na mão: ele é arrastado pelas paredes (e pelo chão)
  arrastar(e, dt) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    const vel = heroi.vel.length();
    this.esperaSom = (this.esperaSom ?? 0) - dt;
    if (vel < 10) return;
    e.centro(_c).addScaledVector(heroi.vel, 0.02); // um pouco à frente: acerta a parede antes do herói
    _vel.copy(heroi.vel).multiplyScalar(0.5);
    const n = jogo.predios.danificarEsfera(_c, e.raio + 0.9, 9999, { velBase: _vel, forca: 9, origem: 'heroi', pedacos: 2, max: 20 });
    const noChao = _c.y < e.altura * 0.5 + 0.4;
    if (n > 0 || noChao) {
      const dano = n > 0 ? n * 4 : vel * 0.15 * dt * 10;
      e.levarDano(dano * (e.chefe ? 0.6 : 1), 'heroi');
      if (e.chefe) e.tempoEstado = 0; // apanhando, não consegue se soltar
      jogo.efeitos.faiscas(_c, n > 0 ? 6 : 2, 10, [1, 0.85, 0.5]);
      jogo.efeitos.poeira(_c, n > 0 ? 3 : 1, 1.5, 4);
      if (n > 0) {
        jogo.camera.tremer(0.12 + n * 0.02);
        heroi.vel.multiplyScalar(Math.max(0.88, 1 - n * 0.01));
        if (this.esperaSom <= 0) { jogo.audio?.quebra(1); this.esperaSom = 0.07; }
      }
    }
  }

  // F segurando alguém: bate com ele no que estiver na frente (parede, chão ou outro inimigo)
  pancada(e) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    this.esperaPancada = 0.3;
    heroi.socoLado = -heroi.socoLado;
    heroi.soco = 1;
    const frente = jogo.camera.frente;
    heroi.centro(_c);
    let ponto = null;
    let tipo = 'ar';
    const parede = jogo.predios.raycast(_c, frente, 8 + e.raio);
    if (parede) { ponto = _o.copy(parede.ponto); tipo = 'parede'; }
    else if (frente.y < -0.3 && heroi.pos.y < 9) {
      // contra o chão
      const t = Math.min(10, (_c.y - 0.3) / -frente.y);
      ponto = _o.copy(_c).addScaledVector(frente, t);
      ponto.y = 0.3;
      tipo = 'chao';
    } else {
      // contra outro inimigo na frente
      for (const outro of jogo.entidades) {
        if (outro === e || outro.remover || outro.estado === 'preso') continue;
        outro.centro(_v);
        if (_v.distanceTo(_c) < 7 + outro.raio && _v.clone().sub(_c).normalize().dot(frente) > 0.6) {
          ponto = _o.copy(_v);
          tipo = 'inimigo';
          outro.levarDano(50, 'heroi');
          outro.lancar(_vel.copy(frente).multiplyScalar(70 / Math.sqrt(outro.massa)).setY(8), true);
          break;
        }
      }
    }
    if (!ponto) {
      // golpe no ar: só o vento
      jogo.efeitos.ondaDeChoque(_v.copy(_c).addScaledVector(frente, 3), 3, 0.2, 0xffffff, frente);
      jogo.audio?.arremesso();
      return;
    }
    // leva o corpo até o ponto do impacto (depois ele volta para as mãos)
    e.pos.copy(ponto).addScaledVector(frente, -e.raio * 0.5).y -= e.altura * 0.5;
    if (tipo === 'chao') e.pos.y = 0;
    e.levarDano(e.chefe ? 35 : 70, 'heroi');
    if (e.chefe) e.tempoEstado = 0;
    _vel.copy(frente).multiplyScalar(tipo === 'chao' ? 10 : 28);
    if (tipo === 'chao') _vel.y = 12;
    jogo.predios.danificarEsfera(ponto, 3.2 + Math.min(3, e.massa * 0.4), 700, { velBase: _vel, forca: 14, origem: 'heroi', pedacos: 3 });
    jogo.detritos.empurrar(ponto, 12, 16);
    const normal = tipo === 'chao' ? _v.set(0, 1, 0) : frente;
    jogo.efeitos.ondaDeChoque(ponto, tipo === 'chao' ? 12 : 8, 0.35, 0xffffff, normal);
    jogo.efeitos.faiscas(ponto, 18, 16, [1, 0.9, 0.7]);
    jogo.efeitos.poeira(ponto, 8, 3, 6);
    jogo.congelar(0.08);
    jogo.camera.tremer(0.5);
    jogo.camera.socoFov?.(6);
    jogo.marcarPerigo(ponto, 30);
    jogo.audio?.soco(1.1);
    // conta no combo
    const cb = jogo.combate;
    if (cb) { cb.combo++; cb.tempoCombo = 1.6; jogo.hud.combo(cb.combo); }
  }

  arremessar(e) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    heroi.segurando = null;
    // direção: para onde a câmera mira (do objeto até o ponto mirado)
    e.centro(_c);
    _v.subVectors(jogo.mira.ponto, _c);
    if (_v.lengthSq() < 4 || jogo.mira.tipo === 'ceu') _v.copy(jogo.camera.frente);
    _v.normalize();
    const forca = 80 / Math.max(1, Math.sqrt(e.massa) * 0.6);
    _vel.copy(_v).multiplyScalar(forca).addScaledVector(heroi.vel, 0.5);
    e.estado = e.estadoAntesPreso === 'morto' ? 'morto' : 'normal';
    e.lancar(_vel, true);
    e.giro.multiplyScalar(0.6);
    jogo.audio?.arremesso();
    jogo.camera.tremer(0.15);
  }
}
