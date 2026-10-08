// Combate corpo a corpo "estilo viltrumita": avanço supersônico, combo de socos e investida.
//  F = combo de socos (avança até o alvo; o 3º soco arremessa através dos prédios)
//  Q = investida (arrasta quem estiver na frente através dos prédios)
import * as THREE from 'three';

const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const _h = new THREE.Vector3();
const _d = new THREE.Vector3();

const ALCANCE_AVANCO = 30; // distância máxima para avançar até o alvo
const VEL_AVANCO = 150;
const DANO_COMBO = [22, 28, 75];

export class Combate {
  constructor(jogo) {
    this.jogo = jogo;
    this.combo = 0;
    this.tempoCombo = 0;
    this.espera = 0;
    this.esperaInvestida = 0;
    this.avanco = null; // { alvo, tempo }
    this.investida = null; // { tempo, carregados: Set }
  }

  // melhor alvo na frente da câmera (prioriza heróis inimigos)
  escolherAlvo() {
    const jogo = this.jogo;
    const frente = jogo.camera.frente;
    jogo.heroi.centro(_h);
    let melhor = null, nota = -Infinity;
    for (const e of jogo.entidades) {
      if (e.remover || e.estado === 'morto' || e.estado === 'preso') continue;
      e.centro(_c);
      _d.subVectors(_c, _h);
      const dist = _d.length();
      if (dist > ALCANCE_AVANCO + e.raio) continue;
      const alinhado = _d.dot(frente) / (dist || 1);
      if (alinhado < 0.55 && dist > 4 + e.raio) continue;
      const n = alinhado * 2 - dist / ALCANCE_AVANCO + (e.chefe ? 1.5 : e.inimigo ? 0.6 : 0);
      if (n > nota) { nota = n; melhor = e; }
    }
    return melhor;
  }

  atualizar(dt, ctrl) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    this.espera -= dt;
    this.esperaInvestida -= dt;
    this.tempoCombo -= dt;
    if (this.tempoCombo <= 0 && this.combo) { this.combo = 0; jogo.hud.combo(0); }
    if (heroi.morto) return;

    // com alguém na mão o F vira "pancada" (ver Agarrar em poderes.js)
    if (ctrl.apertou('KeyF') && this.espera <= 0 && !this.investida && !heroi.segurando) this.socar();
    if (ctrl.apertou('KeyQ') && this.esperaInvestida <= 0 && !this.investida) this.iniciarInvestida();

    if (this.avanco) this.atualizarAvanco(dt);
    if (this.investida) this.atualizarInvestida(dt);
  }

  socar() {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    this.espera = 0.22;
    const alvo = this.escolherAlvo();
    heroi.socoLado = -heroi.socoLado; // alterna os braços
    if (!alvo) {
      // soco no ar: onda de choque para frente
      heroi.soco = 1;
      heroi.centro(_c).addScaledVector(jogo.camera.frente, 3);
      jogo.efeitos.ondaDeChoque(_c, 4, 0.25, 0xffffff, jogo.camera.frente);
      jogo.predios.danificarEsfera(_c, 2.5, 200, { velBase: _v.copy(jogo.camera.frente).multiplyScalar(20), forca: 8, origem: 'heroi', pedacos: 2 });
      jogo.audio?.arremesso();
      return;
    }
    alvo.centro(_c);
    heroi.centro(_h);
    const dist = _c.distanceTo(_h);
    if (dist > alvo.raio + 2.2) {
      // avança em velocidade supersônica até o alvo
      this.avanco = { alvo, tempo: 0.4 };
      heroi.dash = 0.4;
      _d.subVectors(_c, _h).normalize();
      heroi.vel.copy(_d).multiplyScalar(VEL_AVANCO);
      jogo.efeitos.ondaDeChoque(_h, 3, 0.25, 0xffffff, _d);
      jogo.audio?.arremesso();
    } else {
      this.acertar(alvo);
    }
  }

  atualizarAvanco(dt) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    const a = this.avanco;
    a.tempo -= dt;
    if (a.alvo.remover || a.alvo.estado === 'morto') { this.pararAvanco(); return; }
    a.alvo.centro(_c);
    heroi.centro(_h);
    _d.subVectors(_c, _h);
    const dist = _d.length();
    heroi.vel.copy(_d.normalize()).multiplyScalar(VEL_AVANCO); // persegue o alvo
    // rastro de vento
    jogo.efeitos.aditivo.emitir(_h.x, _h.y, _h.z, { vx: 0, vy: 0, vz: 0, vida: 0.25, tamIni: 1.5, tamFim: 0.2, alfa: 0.5, gravidade: 0, arrasto: 0, r: 0.9, g: 0.95, b: 1 });
    if (dist < a.alvo.raio + 1.8) { this.pararAvanco(); this.acertar(a.alvo); }
    else if (a.tempo <= 0) this.pararAvanco();
  }

  pararAvanco() {
    const heroi = this.jogo.heroi;
    this.avanco = null;
    heroi.dash = 0;
    heroi.vel.multiplyScalar(0.05);
  }

  // o soco acerta o alvo
  acertar(alvo) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    this.combo++;
    this.tempoCombo = 1.4;
    const golpe = Math.min(3, ((this.combo - 1) % 3) + 1); // 1, 2, 3, 1, 2, 3...
    const final = golpe === 3;
    heroi.soco = 1;
    heroi.vel.set(0, 0, 0);
    alvo.centro(_c);
    heroi.centro(_h);
    _d.subVectors(_c, _h).normalize();
    // direção do arremesso: para onde a câmera olha (dá para mirar um prédio)
    const dir = _v.copy(jogo.camera.frente).lerp(_d, 0.3).normalize();
    alvo.levarDano(DANO_COMBO[golpe - 1] * (alvo.chefe ? 1 : 2), 'heroi');
    jogo.hud.combo(this.combo);

    const ponto = _h.lerp(_c, 0.6);
    jogo.efeitos.faiscas(ponto, final ? 22 : 10, final ? 22 : 14, [1, 0.9, 0.7]);
    jogo.efeitos.brilho(ponto, final ? 3.5 : 2, 0.6, 0.6, 0.6);
    jogo.efeitos.ondaDeChoque(ponto, final ? 9 : 4, final ? 0.4 : 0.22, 0xffffff, dir);
    jogo.audio?.soco(final ? 1.4 : 0.6);

    if (final || !alvo.chefe) {
      // golpe final: o alvo sai voando e atravessa prédios
      const forca = (final ? 120 : 70) / Math.sqrt(Math.max(1, alvo.massa * 0.6));
      const vel = dir.clone().multiplyScalar(forca);
      vel.y += 4;
      alvo.lancar(vel, true);
      if (alvo.variante === 'gigante') alvo.atordoar?.(1.2);
      jogo.camera.tremer(final ? 0.75 : 0.35);
      jogo.camera.socoFov?.(final ? 10 : 4);
      jogo.congelar(final ? 0.13 : 0.06);
      if (final) {
        jogo.camaraLenta(0.45);
        jogo.efeitos.ondaDeChoque(_c, 14, 0.5, 0xcfd8ff, dir);
        jogo.detritos.empurrar(ponto, 18, 20);
        jogo.hud.mensagem('GOLPE FINAL!', '#fde68a');
      }
    } else {
      // golpes 1 e 2: atordoam e empurram um pouco (prepara o golpe final)
      alvo.atordoar?.(0.7);
      alvo.vel.copy(dir).multiplyScalar(6);
      jogo.camera.tremer(0.25);
      jogo.camera.socoFov?.(3);
      jogo.congelar(0.05);
    }
  }

  // ---------- investida (Q) ----------
  iniciarInvestida() {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    this.esperaInvestida = 1.2;
    this.investida = { tempo: 0.55, carregados: new Set() };
    heroi.dash = 0.55;
    heroi.raioQuebra = 2.6;
    heroi.socoLado = 1;
    heroi.soco = 1;
    heroi.vel.copy(jogo.camera.frente).multiplyScalar(170);
    heroi.centro(_h);
    jogo.efeitos.ondaDeChoque(_h, 8, 0.35, 0xffffff, jogo.camera.frente);
    jogo.camera.tremer(0.3);
    jogo.camera.socoFov?.(12);
    jogo.audio?.arremesso();
  }

  atualizarInvestida(dt) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    const inv = this.investida;
    inv.tempo -= dt;
    heroi.dash = Math.max(heroi.dash, 0.05);
    heroi.soco = Math.max(heroi.soco, 0.5);
    heroi.centro(_h);
    const frente = _d.copy(heroi.vel).normalize();
    // quem estiver na frente é carregado junto
    for (const e of jogo.entidades) {
      if (e.remover || e.estado === 'preso' || inv.carregados.has(e)) continue;
      if (e.estado === 'morto' && e.tipo === 'pessoa') continue;
      e.centro(_c);
      if (_c.distanceTo(_h) < e.raio + 2.5) {
        inv.carregados.add(e);
        if (e.estado !== 'morto') { e.estado = 'preso'; e.tempoEstado = 0; }
        e.levarDano(e.chefe ? 45 : 60, 'heroi');
        jogo.congelar(0.04);
        jogo.camera.tremer(0.3);
        jogo.audio?.impacto(1, _c);
      }
    }
    for (const e of inv.carregados) {
      if (e.remover) { inv.carregados.delete(e); continue; }
      // fica grudado na frente do herói
      e.pos.copy(_h).addScaledVector(frente, 2 + e.raio).y -= e.altura * 0.5;
      e.vel.copy(heroi.vel);
    }
    jogo.efeitos.aditivo.emitir(_h.x, _h.y, _h.z, { vx: 0, vy: 0, vz: 0, vida: 0.3, tamIni: 2.5, tamFim: 0.3, alfa: 0.6, gravidade: 0, arrasto: 0, r: 1, g: 0.9, b: 0.7 });
    if (inv.tempo <= 0 || heroi.pos.y <= 0.05 && heroi.vel.y < 0) this.terminarInvestida();
  }

  terminarInvestida() {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    const inv = this.investida;
    this.investida = null;
    heroi.raioQuebra = 0;
    heroi.dash = 0;
    const dir = _d.copy(heroi.vel).normalize();
    heroi.vel.multiplyScalar(0.1);
    heroi.centro(_h);
    let algum = false;
    for (const e of inv.carregados) {
      if (e.remover) continue;
      algum = true;
      const vel = dir.clone().multiplyScalar(130 / Math.sqrt(Math.max(1, e.massa * 0.5)));
      vel.y += 5;
      if (e.estado === 'preso') e.estado = 'normal';
      e.lancar(vel, true);
    }
    if (algum) {
      jogo.efeitos.ondaDeChoque(_h, 18, 0.5, 0xffe0b0, dir);
      jogo.congelar(0.1);
      jogo.camaraLenta(0.3);
      jogo.camera.tremer(0.7);
      jogo.audio?.soco(1.4);
    }
  }
}
