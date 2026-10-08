// Choque de raios: quando o laser do herói e o raio azul do Voltagem se encontram,
// os dois travam num ponto, a energia cresce e tudo termina numa explosão gigante.
import * as THREE from 'three';

const _p = new THREE.Vector3();
const _q = new THREE.Vector3();
const _v = new THREE.Vector3();
const _c = new THREE.Vector3();
const _d1 = new THREE.Vector3();
const _d2 = new THREE.Vector3();
const _r = new THREE.Vector3();

const TEMPO_CARGA = 1.1; // segundos de raios travados até explodir
const DISTANCIA_CHOQUE = 2.5; // quão perto os feixes precisam passar

// pontos mais próximos entre dois segmentos (a1-b1 e a2-b2); devolve a distância
function maisProximos(a1, b1, a2, b2, outP, outQ) {
  _d1.subVectors(b1, a1);
  _d2.subVectors(b2, a2);
  _r.subVectors(a1, a2);
  const a = _d1.dot(_d1), e = _d2.dot(_d2), f = _d2.dot(_r);
  let s, t;
  const c = _d1.dot(_r), b = _d1.dot(_d2);
  const den = a * e - b * b;
  s = den > 1e-6 ? Math.min(1, Math.max(0, (b * f - c * e) / den)) : 0;
  t = (b * s + f) / e;
  if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
  else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
  outP.copy(a1).addScaledVector(_d1, s);
  outQ.copy(a2).addScaledVector(_d2, t);
  return outP.distanceTo(outQ);
}

export class ChoqueDeRaios {
  constructor(jogo) {
    this.jogo = jogo;
    this.ativo = null; // o herói inimigo com quem os raios estão travados
    this.carga = 0;
    this.espera = 0;
    this.ponto = new THREE.Vector3();
    // bola de energia (vermelho por fora, azul por dentro, miolo branco)
    const geo = new THREE.SphereGeometry(1, 24, 16);
    const mat = (c, o) => new THREE.MeshBasicMaterial({ color: c, transparent: true, opacity: o, blending: THREE.AdditiveBlending, depthWrite: false });
    this.bolas = [mat(new THREE.Color(0xff3030).multiplyScalar(3), 0.55), mat(new THREE.Color(0x3a7bff).multiplyScalar(3), 0.7), mat(new THREE.Color(0xffffff).multiplyScalar(6), 0.9)]
      .map((m) => { const b = new THREE.Mesh(geo, m); b.visible = false; b.frustumCulled = false; jogo.cena.add(b); return b; });
    this.flash = document.createElement('div');
    this.flash.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity 0.05s';
    document.body.appendChild(this.flash);
    this.alphaFlash = 0;
  }

  atualizar(dt) {
    const jogo = this.jogo;
    const laser = jogo.laser;
    this.espera -= dt;

    // procura um Voltagem com o raio ligado cruzando o laser do herói
    let alvo = null;
    if (laser.ativo && this.espera <= 0) {
      for (const e of jogo.entidades) {
        if (e.variante !== 'raio' || e.estado !== 'normal' || !e.feixe?.ativo) continue;
        const d = maisProximos(laser.inicio, laser.fim, e.feixe.a, e.feixe.b, _p, _q);
        if (d < DISTANCIA_CHOQUE) { alvo = e; break; }
      }
      // durante o choque basta os dois continuarem atirando
      if (!alvo && this.ativo && this.ativo.feixe?.ativo && this.ativo.estado === 'normal') {
        alvo = this.ativo;
        maisProximos(laser.inicio, laser.fim, alvo.feixe.a, alvo.feixe.b, _p, _q);
      }
    }

    if (!alvo) {
      if (this.ativo) this.terminar(false);
      return;
    }

    if (!this.ativo) {
      this.ativo = alvo;
      this.carga = 0;
      this.ponto.copy(laser.inicio).lerp(alvo.feixe.a, 0.5);
      jogo.hud.mensagem('CHOQUE DE RAIOS!', '#e9d5ff');
      jogo.audio?.raioAzul(true);
    }
    // o ponto de choque fica entre os dois (anda devagar)
    _d1.subVectors(laser.fim, laser.inicio).normalize();
    _d2.subVectors(alvo.feixe.b, alvo.feixe.a).normalize();
    if (_d1.dot(_d2) < -0.7) {
      // raios de frente um para o outro: o choque é no meio do caminho, com "empurra-empurra"
      const t = 0.5 + Math.sin(jogo.tempo * 3) * 0.08;
      _v.copy(laser.inicio).lerp(alvo.feixe.a, t);
    } else _v.addVectors(_p, _q).multiplyScalar(0.5);
    this.ponto.lerp(_v, Math.min(1, dt * 3));
    this.carga += dt;
    const k = this.carga / TEMPO_CARGA;

    // os dois feixes terminam no ponto de choque
    const heroi = jogo.heroi;
    heroi.rig.olhos.forEach((olho, i) => {
      olho.getWorldPosition(_c);
      laser.raios[i].mostrar(_c, this.ponto, jogo.tempo + i);
    });
    alvo.raio3d.mostrar(alvo.feixe.a, this.ponto, jogo.tempo);

    // bola de energia crescendo e pulsando
    const tam = 1 + k * 5 + Math.sin(jogo.tempo * 40) * 0.3;
    this.bolas.forEach((b, i) => {
      b.visible = true;
      b.position.copy(this.ponto);
      b.scale.setScalar(tam * [1.25, 0.95, 0.55][i] * (1 + Math.random() * 0.08));
    });
    jogo.efeitos.faiscas(this.ponto, 6, 18 + k * 20, [1, 0.3, 0.3]);
    jogo.efeitos.faiscas(this.ponto, 6, 18 + k * 20, [0.4, 0.7, 1]);
    jogo.camera.tremer(0.05 + k * 0.12);
    jogo.marcarPerigo(this.ponto, 80);
    if (this.carga >= TEMPO_CARGA) this.explodir();
  }

  // clarão branco na tela (usa o tempo real, não o da câmera lenta)
  atualizarFlash(dtReal) {
    if (this.alphaFlash <= 0 && this.flash.style.opacity === '0') return;
    this.alphaFlash = Math.max(0, this.alphaFlash - dtReal * 2.6);
    this.flash.style.opacity = this.alphaFlash.toFixed(3);
  }

  terminar(explodiu) {
    if (this.ativo && !explodiu) this.jogo.hud.mensagem('O CHOQUE SE DESFEZ', '#cbd5e1');
    this.ativo = null;
    this.carga = 0;
    this.bolas.forEach((b) => { b.visible = false; });
  }

  // a explosão gigante
  explodir() {
    const jogo = this.jogo;
    const p = _c.copy(this.ponto);
    const inimigo = this.ativo;
    this.terminar(true);
    this.espera = 4;

    // nuvem de fogo e fumaça espalhada (enorme, mas sem cobrir a tela inteira)
    jogo.efeitos.explosao(p, 14);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      _v.set(Math.cos(a) * 22, (Math.random() - 0.3) * 16, Math.sin(a) * 22).add(p);
      jogo.efeitos.bolaDeFogo(_v, 7 + Math.random() * 5, 0.7 + Math.random() * 0.4);
      jogo.efeitos.fogo(_v, 12, 6, 6);
      jogo.efeitos.fumaca(_v, 8, 14, 0.18);
    }
    jogo.efeitos.fumaca(p, 20, 18, 0.15);
    jogo.efeitos.ondaDeChoque(p, 140, 1.1, 0xffffff);
    jogo.efeitos.ondaDeChoque(p, 90, 0.8, 0xffb070);
    jogo.efeitos.ondaDeChoque(_v.set(p.x, 0.5, p.z), 120, 1.2, 0xd8c9a8);
    jogo.efeitos.faiscas(p, 120, 60, [1, 0.8, 0.5]);
    jogo.efeitos.clarao(p, 6, 1.2, 0xffe0c0);
    this.alphaFlash = 0.85; // clarão branco rápido

    // destruição: esfera enorme no ar e no chão embaixo
    jogo.predios.danificarEsfera(p, 24, 4000, { forca: 35, origem: 'heroi', pedacos: 1, max: 600 });
    _v.set(p.x, 3, p.z);
    jogo.predios.danificarEsfera(_v, 18, 4000, { forca: 30, origem: 'heroi', pedacos: 1, max: 300 });
    jogo.detritos.empurrar(p, 90, 45);

    // tudo em volta sai voando
    for (const e of jogo.entidades) {
      if (e.remover) continue;
      e.centro(_q);
      const d = _q.distanceTo(p);
      if (d > 90) continue;
      const f = 1 - d / 90;
      e.levarDano((e === inimigo ? 260 : 200) * f + (e === inimigo ? 60 : 0), 'heroi');
      _v.subVectors(_q, p).normalize().multiplyScalar(120 * f / Math.sqrt(Math.max(1, e.massa * 0.5))).y += 20 * f;
      if (e.estado === 'preso') continue;
      e.lancar(_v, true);
    }
    // o herói também é jogado para trás
    const heroi = jogo.heroi;
    heroi.centro(_q);
    const dh = _q.distanceTo(p);
    if (dh < 120) {
      const f = 1 - dh / 120;
      heroi.levarDano(60 * f);
      heroi.vel.subVectors(_q, p).normalize().multiplyScalar(90 * f + 20);
      heroi.atordoado = 0.6;
    }
    jogo.laser.calor = 100; // o laser superaquece com o esforço
    jogo.laser.superaquecido = true;

    jogo.congelar(0.15);
    jogo.camaraLenta(0.6);
    jogo.camera.tremer(1);
    jogo.camera.socoFov(18);
    jogo.audio?.explosao(2, p);
    jogo.audio?.desabamento(1, p);
    jogo.hud.mensagem('EXPLOSÃO DE ENERGIA!', '#fde68a');
    jogo.alerta?.adicionar(40);
  }
}
