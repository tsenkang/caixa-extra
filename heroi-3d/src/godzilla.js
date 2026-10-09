// GODZILLA: o chefe final. Um monstro de ~55 m que anda pela cidade derrubando tudo.
// Ataques: sopro atômico (raio azul enorme), giro de cauda, pisão, mordida e rugido.
// Ele é grande demais para ser pego, mas leva dano do laser, dos socos e do choque de raios.
import * as THREE from 'three';
import { Entidade, anguloLerp } from './entidades.js';
import { gradienteToon } from './modelos.js';
import { Raio } from './efeitos.js';

const _v = new THREE.Vector3();
const _d = new THREE.Vector3();
const _c = new THREE.Vector3();
const _h = new THREE.Vector3();

const COR_PELE = 0x3d4538;
const COR_BARRIGA = 0x6e6a55;
const N_CAUDA = 10;

function distSegmento(p, a, b) {
  _d.subVectors(b, a);
  const l2 = _d.lengthSq() || 1;
  const t = Math.max(0, Math.min(1, _v.subVectors(p, a).dot(_d) / l2));
  return _v.copy(a).addScaledVector(_d, t).distanceTo(p);
}

// placa das costas: folha pontuda e irregular (perfil achatado)
function geoPlaca(alt, larg) {
  const s = new THREE.Shape();
  s.moveTo(-larg * 0.5, 0);
  s.lineTo(-larg * 0.42, alt * 0.35);
  s.lineTo(-larg * 0.55, alt * 0.45);
  s.lineTo(-larg * 0.2, alt * 0.7);
  s.lineTo(-larg * 0.3, alt * 0.78);
  s.lineTo(0, alt);
  s.lineTo(larg * 0.25, alt * 0.72);
  s.lineTo(larg * 0.4, alt * 0.75);
  s.lineTo(larg * 0.3, alt * 0.4);
  s.lineTo(larg * 0.5, 0);
  const g = new THREE.ExtrudeGeometry(s, { depth: larg * 0.18, bevelEnabled: true, bevelThickness: larg * 0.06, bevelSize: larg * 0.06, bevelSegments: 1 });
  g.translate(0, 0, -larg * 0.09);
  g.rotateY(Math.PI / 2); // a placa fica de pé ao longo da coluna (eixo z)
  return g;
}

export class Godzilla extends Entidade {
  constructor(jogo) {
    const raiz = new THREE.Group();
    super(jogo, raiz, { tipo: 'godzilla', raio: 10, altura: 50, vida: 11000, massa: 400, agarravel: false, inimigo: true, contorno: 0.14 });
    this.chefe = true;
    this.nome = 'GODZILLA';
    this.corBarra = 'linear-gradient(90deg,#1e3a8a,#38bdf8,#e0f2fe)';
    this.resistenciaLaser = 0.35; // couro grosso: o laser faz pouco dano
    this.danoChoque = 550; // o choque de raios machuca muito mais que o laser
    this.montarModelo();

    // nasce longe, na beira da cidade
    const h = jogo.heroi.pos;
    const a = Math.random() * Math.PI * 2;
    this.pos.set(Math.max(-270, Math.min(270, h.x + Math.cos(a) * 240)), 0, Math.max(-250, Math.min(250, h.z + Math.sin(a) * 240)));
    this.obj.rotation.y = Math.atan2(h.x - this.pos.x, h.z - this.pos.z);
    this.raio3d = new Raio(jogo.cena, 0xe8f6ff, 0x38b0ff, 0.7, 2.6);
    this.feixe = { a: new THREE.Vector3(), b: new THREE.Vector3(), ativo: false };
    this.alvoRaio = new THREE.Vector3();
    this.esferas = [
      { ancora: this.ancTronco, r: 11, c: new THREE.Vector3() },
      { ancora: this.ancCabeca, r: 6, c: new THREE.Vector3() },
      { ancora: this.pernaE.userData.ancora, r: 5.5, c: new THREE.Vector3() },
      { ancora: this.pernaD.userData.ancora, r: 5.5, c: new THREE.Vector3() },
      { ancora: this.cauda[3], r: 4.5, c: new THREE.Vector3() },
      { ancora: this.cauda[6], r: 3.2, c: new THREE.Vector3() },
    ];
    this.atualizarEsferas();

    this.fase = 'rugido';
    this.timer = 2.4;
    this.espera = 3;
    this.cd = { mordida: 0, pisao: 3, cauda: 4, sopro: 5, rugido: 16, pulso: 6, rajada: 3 };
    this.orbes = []; // bolas atômicas cuspidas
    this.danoRecente = 0; // dano levado nos últimos segundos (se apanhar muito, solta o pulso)
    this.passoFase = 0;
    this.t = 0;
    this.giroCauda = 0;
    this.brilhoPlacas = 0;
    this.janelaDano = 0;
    this.tempoJanela = 0;
    this.esperaBatida = 0;
    jogo.audio?.rugido?.();
    jogo.camera.tremer(0.6);
  }

  // ---------- modelo ----------
  montarModelo() {
    const mPele = new THREE.MeshToonMaterial({ color: COR_PELE, gradientMap: gradienteToon });
    const mBarriga = new THREE.MeshToonMaterial({ color: COR_BARRIGA, gradientMap: gradienteToon });
    const mEscuro = new THREE.MeshToonMaterial({ color: 0x23281f, gradientMap: gradienteToon });
    const mDente = new THREE.MeshToonMaterial({ color: 0xece6d2, gradientMap: gradienteToon });
    const mBoca = new THREE.MeshToonMaterial({ color: 0x5a1a1a, gradientMap: gradienteToon });
    const mOlho = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffb02e).multiplyScalar(3) });
    const novaPlaca = () => new THREE.MeshToonMaterial({ color: 0xc9ced0, emissive: 0x3cc4ff, emissiveIntensity: 0, gradientMap: gradienteToon });
    this.matCostas = novaPlaca();
    this.matOlho = mOlho;
    const elip = (r, sx, sy, sz, seg = 16) => new THREE.SphereGeometry(r, seg, Math.max(10, (seg * 0.7) | 0)).scale(sx, sy, sz);
    const malha = (geo, m, x, y, z, pai, rx = 0, ry = 0, rz = 0) => {
      const o = new THREE.Mesh(geo, m);
      o.position.set(x, y, z);
      o.rotation.set(rx, ry, rz);
      pai.add(o);
      return o;
    };
    const ponto = (x, y, z, pai) => { const o = new THREE.Object3D(); o.position.set(x, y, z); pai.add(o); return o; };

    const corpo = new THREE.Group(); // gira inteiro quando ele cai
    this.obj.add(corpo);
    this.corpo = corpo;
    const quadril = new THREE.Group();
    quadril.position.y = 18;
    corpo.add(quadril);
    this.quadril = quadril;

    // tronco (inclinado para frente) com a barriga clara
    const peito = new THREE.Group();
    peito.rotation.x = 0.22;
    quadril.add(peito);
    this.peito = peito;
    malha(elip(1, 8.5, 9, 8), mPele, 0, 1, -1, peito); // quadril largo
    malha(elip(1, 7.8, 13, 8.2), mPele, 0, 11, 0.5, peito, -0.12); // tronco
    malha(elip(1, 5.8, 11, 4.2), mBarriga, 0, 9, 4.6, peito, -0.12); // barriga
    for (let i = 0; i < 6; i++) malha(elip(1, 5.2 - i * 0.25, 0.5, 1.2, 10), mEscuro, 0, 3 + i * 2.6, 7.6 - i * 0.25, peito, -0.12); // dobras da barriga
    malha(elip(1, 4.8, 6, 5.2), mPele, 0, 21, 3, peito, 0.5); // pescoço
    this.ancTronco = ponto(0, 10, 1, peito);

    // cabeça e mandíbula
    const cabeca = new THREE.Group();
    cabeca.position.set(0, 24.5, 5.5);
    peito.add(cabeca);
    this.cabeca = cabeca;
    malha(elip(1, 3.6, 3.3, 4.8), mPele, 0, 0.6, 1.5, cabeca); // crânio
    malha(elip(1, 2.9, 2.1, 3.4), mPele, 0, -0.1, 5, cabeca); // focinho
    for (const x of [-1.9, 1.9]) {
      malha(elip(1, 1.3, 0.55, 2.4, 10), mEscuro, x, 2.2, 3.6, cabeca, -0.25, 0, x > 0 ? -0.3 : 0.3); // sobrancelha
      const olho = malha(elip(0.45, 1.3, 0.8, 0.6, 10), mOlho, x * 1.12, 1.4, 4.4, cabeca);
      olho.userData.semContorno = true;
    }
    for (const x of [-0.8, 0.8]) malha(elip(0.3, 1, 0.6, 1, 8), mEscuro, x, 0.9, 8.1, cabeca); // narinas
    for (let i = 0; i < 7; i++) {
      for (const lado of [-1, 1]) {
        const d = malha(new THREE.ConeGeometry(0.3, 0.9, 5), mDente, lado * (2.2 - i * 0.12), -1.4, 2 + i * 0.85, cabeca, Math.PI);
        d.userData.semContorno = true;
      }
    }
    const mandibula = new THREE.Group();
    mandibula.position.set(0, -1.3, 1);
    cabeca.add(mandibula);
    this.mandibula = mandibula;
    malha(elip(1, 2.7, 1.1, 4.4), mPele, 0, -0.6, 3, mandibula); // queixo
    malha(elip(1, 2.2, 0.5, 3.6), mBoca, 0, 0.2, 3.2, mandibula); // língua/boca
    for (let i = 0; i < 6; i++) {
      for (const lado of [-1, 1]) {
        const d = malha(new THREE.ConeGeometry(0.28, 0.8, 5), mDente, lado * (2 - i * 0.12), 0.4, 1.4 + i * 0.85, mandibula);
        d.userData.semContorno = true;
      }
    }
    this.boca = ponto(0, -1.2, 7.5, cabeca); // de onde sai o sopro
    this.ancCabeca = ponto(0, 0, 3, cabeca);

    // bracinhos com garras
    this.bracos = [];
    for (const lado of [-1, 1]) {
      const ombro = new THREE.Group();
      ombro.position.set(lado * 6.8, 15, 4.5);
      peito.add(ombro);
      malha(elip(1, 1.9, 4.5, 2.1), mPele, 0, -3.2, 1, ombro, 0.5);
      const cot = new THREE.Group();
      cot.position.set(0, -6, 3);
      ombro.add(cot);
      malha(elip(1, 1.5, 3.8, 1.6), mPele, 0, -1.5, 2, cot, 1.1);
      for (const dx of [-0.8, 0, 0.8]) malha(new THREE.ConeGeometry(0.35, 1.8, 5), mDente, dx, -2.6, 4.6, cot, 1.9);
      this.bracos.push(ombro);
    }

    // placas das costas: 3 fileiras do pescoço até a cauda
    const placasCostas = [];
    for (let i = 0; i < 7; i++) {
      const t = i / 6;
      const y = 23 - t * 20, z = -3.2 - t * 4.2 + Math.sin(t * Math.PI) * -1.5;
      const alt = 5.5 - Math.abs(t - 0.35) * 4;
      placasCostas.push([0, y, z, alt, 3.4]);
      placasCostas.push([-2.2, y - 0.8, z + 0.6, alt * 0.65, 2.4]);
      placasCostas.push([2.2, y - 0.8, z + 0.6, alt * 0.65, 2.4]);
    }
    for (const [x, y, z, alt, larg] of placasCostas) {
      const p = malha(geoPlaca(alt, larg), this.matCostas, x, y, z, peito, -0.5, 0, x * -0.08);
      p.userData.semContorno = false;
    }

    // pernas grossas
    const pernas = [];
    for (const lado of [-1, 1]) {
      const perna = new THREE.Group();
      perna.position.set(lado * 6.2, 0, -1);
      quadril.add(perna);
      malha(elip(1, 5, 8.5, 6.3), mPele, 0, -4, 0.5, perna); // coxa
      const joelho = new THREE.Group();
      joelho.position.set(0, -9.5, 1.5);
      perna.add(joelho);
      malha(elip(1, 3.6, 5.5, 4.2), mPele, 0, -3.6, -1.2, joelho, -0.25); // canela
      malha(elip(1, 4.1, 1.6, 5.8), mPele, 0, -7.6, 1.2, joelho); // pé
      for (const dx of [-2.2, 0, 2.2]) malha(new THREE.ConeGeometry(0.7, 2.2, 6), mDente, dx, -8, 6.6, joelho, Math.PI / 2);
      perna.userData.joelho = joelho;
      perna.userData.pe = ponto(0, -8.5, 1.5, joelho);
      perna.userData.ancora = ponto(0, -3, 0, joelho);
      pernas.push(perna);
    }
    [this.pernaE, this.pernaD] = pernas;

    // cauda: corrente de segmentos (cada um filho do anterior) para ondular
    this.cauda = [];
    this.matCauda = [];
    let pai = quadril;
    let r = 5.6;
    for (let i = 0; i < N_CAUDA; i++) {
      const seg = new THREE.Group();
      seg.position.set(0, i === 0 ? -2 : 0, i === 0 ? -7 : -4.4);
      seg.userData.baseX = i < 3 ? -0.26 : i < 6 ? 0.22 : 0.04;
      seg.rotation.x = seg.userData.baseX;
      pai.add(seg);
      malha(elip(1, r, r * 0.9, 3.2), mPele, 0, 0, -2.2, seg);
      const mp = novaPlaca();
      this.matCauda.push(mp);
      if (i < N_CAUDA - 1) malha(geoPlaca(r * 0.75, r * 0.5), mp, 0, r * 0.75, -2, seg, -0.4);
      this.cauda.push(seg);
      pai = seg;
      r *= 0.83;
    }
    this.pontaCauda = ponto(0, 0, -4, pai);
    this.obj.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = false; } });
  }

  // as esferas de acerto acompanham o corpo
  atualizarEsferas() {
    this.obj.updateMatrixWorld(true);
    for (const e of this.esferas) e.ancora.getWorldPosition(e.c);
  }

  centro(out) { return out.copy(this.esferas ? this.esferas[0].c : this.pos); }

  // grande demais para ser empurrado ou atordoado
  lancar() {}
  atordoar() {}

  // o dano é limitado por instante (senão atravessar o corpo voando seria vitória fácil)
  levarDano(qtd, origem) {
    if (this.estado === 'morto' || !Number.isFinite(qtd)) return;
    const livre = Math.max(0, 100 - this.janelaDano);
    qtd = Math.min(qtd, livre);
    this.janelaDano += qtd;
    if (qtd > 15) this.dor = Math.min(1, (this.dor || 0) + qtd / 80); // se encolhe com golpes fortes
    this.danoRecente += qtd;
    super.levarDano(qtd, origem);
  }
  danoDireto(qtd) { this.dor = 1; super.levarDano(qtd, 'heroi'); }

  furioso() { return this.vida < this.vidaMax * 0.5; }

  // ---------- comportamento ----------
  atualizar(dt) {
    this.tempoJanela += dt;
    if (this.tempoJanela > 0.25) { this.tempoJanela = 0; this.janelaDano = 0; }
    this.t += dt;
    if (this.feixe.ativo && (this.fase !== 'sopro' || this.estado !== 'normal')) { this.feixe.ativo = false; this.raio3d.esconder(); }
    super.atualizar(dt);
    this.atualizarEsferas();
  }

  ia(dt) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    heroi.centro(_h);
    const furia = this.furioso();
    if (furia && !this.avisouFuria) {
      this.avisouFuria = true;
      jogo.hud.mensagem('GODZILLA ESTÁ FURIOSO!', '#38bdf8');
      this.fase = 'rugido'; this.timer = 2.4; jogo.audio?.rugido?.();
    }
    const kc = furia ? 0.5 : 0.8; // ataques mais frequentes na fúria
    for (const k in this.cd) this.cd[k] -= dt;
    this.espera -= dt;
    this.timer -= dt;
    this.esperaBatida -= dt;
    this.danoRecente = Math.max(0, this.danoRecente - dt * 120);
    this.atualizarOrbes(dt);
    // apanhou muito de perto: solta o pulso nuclear (interrompe o que estiver fazendo)
    if (this.danoRecente > 450 && this.fase !== 'pulso' && this.fase !== 'sopro' && this.cd.pulso < 3) {
      this.danoRecente = 0;
      this.iniciarPulso();
    }
    const dx = heroi.pos.x - this.pos.x, dz = heroi.pos.z - this.pos.z;
    const dist = Math.hypot(dx, dz) || 1;
    const distCabeca = this.esferas[1].c.distanceTo(_h);
    let andar = 0;

    // radiação: perto dele o herói não se cura (precisa se afastar para recuperar a vida)
    if (dist < 110 && !heroi.morto) {
      heroi.tempoSemDano = Math.min(heroi.tempoSemDano, 2);
      if (!this.avisouRadiacao) { this.avisouRadiacao = true; jogo.hud.mensagem('RADIAÇÃO: PERTO DELE VOCÊ NÃO SE CURA', '#a3e635'); }
    }
    // marca perigo em volta (as pessoas fogem)
    if (Math.random() < dt * 2) jogo.marcarPerigo(this.pos, 90);

    // herói batendo no corpo em alta velocidade ricocheteia
    if (this.esperaBatida <= 0 && heroi.vel.length() > 45 && !heroi.morto) {
      for (const e of this.esferas) {
        if (e.c.distanceTo(_h) < e.r + 1) {
          this.esperaBatida = 0.6;
          _d.subVectors(_h, e.c).normalize();
          heroi.vel.copy(_d).multiplyScalar(Math.max(30, heroi.vel.length() * 0.35));
          heroi.atordoado = 0.5;
          heroi.levarDano(22);
          jogo.efeitos.faiscas(_h, 14, 14, [1, 0.95, 0.8]);
          jogo.camera.tremer(0.5);
          jogo.audio?.impacto(1, _h);
          break;
        }
      }
    }

    if (this.fase === 'andar') {
      // vira devagar e anda até o herói
      this.obj.rotation.y = anguloLerp(this.obj.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * (furia ? 1.8 : 1.2)));
      if (dist > 38) andar = furia ? 14 : 10;
      if (this.espera <= 0 && !heroi.morto) this.escolherAtaque(dist, distCabeca, kc);
    } else if (this.fase === 'rugido') {
      // levanta a cabeça e ruge: onda que empurra o herói
      const k = 1 - Math.max(0, this.timer) / 2.4;
      this.poseRugido = Math.sin(Math.min(1, k * 1.4) * Math.PI);
      if (!this.rugiu && k > 0.25) {
        this.rugiu = true;
        _c.copy(this.esferas[1].c);
        jogo.efeitos.ondaDeChoque(_c, 60, 0.9, 0xbfdbfe);
        jogo.efeitos.ondaDeChoque(_v.set(this.pos.x, 0.5, this.pos.z), 70, 1.1, 0xd8c9a8);
        jogo.camera.tremer(0.8);
        jogo.detritos.empurrar(_c, 60, 25);
        const d = _c.distanceTo(_h);
        if (d < 75 && !heroi.morto) {
          const f = 1 - d / 75;
          heroi.vel.subVectors(_h, _c).normalize().multiplyScalar(40 + 60 * f);
          heroi.atordoado = 0.4;
          heroi.levarDano(10 * f);
        }
      }
      if (this.timer <= 0) { this.fase = 'andar'; this.rugiu = false; this.poseRugido = 0; this.espera = 1; }
    } else if (this.fase === 'carregar') {
      // as placas acendem da ponta da cauda até o pescoço
      const k = 1 - Math.max(0, this.timer) / this.tempoCarga;
      this.brilhoPlacas = k;
      this.obj.rotation.y = anguloLerp(this.obj.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 1.6));
      this.boca.getWorldPosition(_c);
      if (Math.random() < 0.7) jogo.efeitos.faiscas(_c, 2, 4 + k * 8, [0.4, 0.75, 1]);
      jogo.camera.tremer(0.04 * k);
      if (this.timer <= 0) {
        this.fase = 'sopro'; this.timer = furia ? 5 : 4;
        this.alvoRaio.copy(_h).add(_v.set((Math.random() - 0.5) * 30, -8, (Math.random() - 0.5) * 30));
        this.tempoExplosao = 0;
        jogo.audio?.soproAtomico?.(true);
        jogo.hud.mensagem('SOPRO ATÔMICO!', '#7dd3fc');
      }
    } else if (this.fase === 'sopro') {
      this.sopro(dt, furia);
      if (this.timer <= 0) {
        this.fase = 'andar'; this.espera = 1.5; this.brilhoPlacas = 0;
        this.feixe.ativo = false; this.raio3d.esconder();
      }
    } else if (this.fase === 'cauda') {
      // giro completo: a cauda varre tudo em volta
      const k = 1 - Math.max(0, this.timer) / 1.8;
      const suave = k * k * (3 - 2 * k);
      this.obj.rotation.y = this.yawInicio + suave * Math.PI * 2 * this.sentidoGiro;
      this.giroCauda = Math.sin(k * Math.PI) * this.sentidoGiro;
      for (const i of [3, 5, 7, 9]) {
        this.cauda[i].getWorldPosition(_c);
        if (_c.y < 2) _c.y = 2;
        jogo.predios.danificarEsfera(_c, 5.5 - i * 0.3, 9999, { velBase: _v.set(-Math.cos(this.obj.rotation.y), 0.3, Math.sin(this.obj.rotation.y)).multiplyScalar(25 * this.sentidoGiro), forca: 14, origem: 'inimigo', pedacos: 1, max: 25 });
        if (!this.acertouCauda && !heroi.morto && _c.distanceTo(_h) < 8.5 - i * 0.3) {
          this.acertouCauda = true;
          _d.subVectors(_h, this.pos).setY(0).normalize().setY(0.35);
          heroi.vel.copy(_d).multiplyScalar(130);
          heroi.atordoado = 0.6;
          heroi.levarDano(65);
          jogo.efeitos.faiscas(_h, 20, 20, [1, 0.9, 0.7]);
          jogo.camera.tremer(0.9);
          jogo.congelar(0.1);
          jogo.audio?.soco(1.5);
        }
      }
      jogo.camera.tremer(0.05);
      if (this.timer <= 0) { this.fase = 'andar'; this.giroCauda = 0; this.espera = 1.2; }
    } else if (this.fase === 'pisao') {
      // levanta a perna e pisa com tudo
      const k = 1 - Math.max(0, this.timer) / 1.3;
      this.posePisao = k < 0.6 ? Math.sin((k / 0.6) * Math.PI * 0.5) : Math.max(0, 1 - (k - 0.6) * 6);
      if (!this.pisou && k > 0.65) {
        this.pisou = true;
        this.pernaD.userData.pe.getWorldPosition(_c);
        _c.y = 0.5;
        jogo.efeitos.ondaDeChoque(_c, 45, 0.8, 0xd8c9a8);
        jogo.efeitos.ondaDeChoque(_c, 25, 0.5, 0xffffff);
        jogo.efeitos.poeira(_c, 24, 14, 10);
        jogo.camera.tremer(1);
        jogo.audio?.explosao(1.4, _c);
        jogo.predios.danificarEsfera(_c, 11, 1200, { forca: 18, origem: 'inimigo', pedacos: 1, max: 120 });
        jogo.detritos.empurrar(_c, 45, 30);
        const d = Math.hypot(_h.x - _c.x, _h.z - _c.z);
        if (d < 42 && _h.y < 22 && !heroi.morto) {
          const f = 1 - d / 42;
          heroi.levarDano(70 * f + 12);
          heroi.vel.set(_h.x - _c.x, 0, _h.z - _c.z).normalize().setY(0.8).multiplyScalar(60 * f + 30);
          heroi.atordoado = 0.5;
        }
      }
      if (this.timer <= 0) { this.fase = 'andar'; this.pisou = false; this.posePisao = 0; this.espera = 1; }
    } else if (this.fase === 'pulso') {
      // as placas piscam cada vez mais rápido e o corpo inteiro explode em energia
      const k = 1 - Math.max(0, this.timer) / this.tempoPulso;
      this.brilhoPlacas = k > 0.2 ? (Math.sin(this.t * (20 + k * 40)) > 0 ? 1 : 0.4) : k * 4;
      this.centro(_c);
      if (Math.random() < 0.8) jogo.efeitos.faiscas(_c.clone().add(_v.set((Math.random() - 0.5) * 20, (Math.random() - 0.3) * 30, (Math.random() - 0.5) * 16)), 3, 10, [0.4, 0.8, 1]);
      jogo.camera.tremer(0.05 + k * 0.1);
      if (this.timer <= 0) this.explodirPulso();
    } else if (this.fase === 'rajada') {
      // cospe bolas atômicas que perseguem o herói
      this.obj.rotation.y = anguloLerp(this.obj.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 3));
      this.brilhoPlacas = 0.6;
      const total = this.furioso() ? 7 : 4;
      if (this.cuspidas < total && this.timer < 1.5 - this.cuspidas * 0.2) {
        this.cuspidas++;
        this.cuspir();
      }
      if (this.timer <= 0) { this.fase = 'andar'; this.brilhoPlacas = 0; this.espera = 0.6; }
    } else if (this.fase === 'mordida') {
      const k = 1 - Math.max(0, this.timer) / 0.8;
      this.poseMordida = Math.sin(k * Math.PI);
      this.obj.rotation.y = anguloLerp(this.obj.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 3));
      if (!this.mordeu && k > 0.45) {
        this.mordeu = true;
        if (distCabeca < 13 && !heroi.morto) {
          this.boca.getWorldPosition(_c);
          heroi.levarDano(75);
          heroi.vel.subVectors(_h, _c).normalize().setY(-0.6).normalize().multiplyScalar(110);
          heroi.atordoado = 0.6;
          jogo.efeitos.faiscas(_h, 24, 18, [1, 0.85, 0.7]);
          jogo.camera.tremer(1);
          jogo.camera.socoFov?.(10);
          jogo.congelar(0.12);
          jogo.audio?.soco(1.6);
          jogo.hud.mensagem('MORDIDA!', '#f87171');
        }
      }
      if (this.timer <= 0) { this.fase = 'andar'; this.mordeu = false; this.poseMordida = 0; this.espera = 0.8; }
    }

    // anda derrubando o que tiver no caminho
    if (andar > 0) {
      const a = this.obj.rotation.y;
      this.pos.x += Math.sin(a) * andar * dt;
      this.pos.z += Math.cos(a) * andar * dt;
      this.pos.x = Math.max(-290, Math.min(290, this.pos.x));
      this.pos.z = Math.max(-270, Math.min(270, this.pos.z));
    }
    this.tempoQuebra = (this.tempoQuebra ?? 0) - dt;
    if (this.tempoQuebra <= 0) {
      this.tempoQuebra = 0.15;
      const a = this.obj.rotation.y;
      const sx = Math.sin(a), cz = Math.cos(a);
      for (const [y, frente, r] of [[4, 6, 7], [14, 8, 8], [26, 9, 7]]) {
        _c.set(this.pos.x + sx * frente, y, this.pos.z + cz * frente);
        _v.set(sx * 14, 3, cz * 14);
        jogo.predios.danificarEsfera(_c, r, 9999, { velBase: _v, forca: 8, origem: 'inimigo', pedacos: 1, max: 30 });
      }
      // a cauda arrasta pelo chão atrás
      this.cauda[7].getWorldPosition(_c);
      jogo.predios.danificarEsfera(_c, 4, 9999, { forca: 6, origem: 'inimigo', pedacos: 1, max: 12 });
    }
    this.animar(dt, andar);
  }

  escolherAtaque(dist, distCabeca, kc) {
    const jogo = this.jogo;
    const hy = jogo.heroi.pos.y;
    const cd = this.cd;
    const dTronco = this.esferas[0].c.distanceTo(jogo.heroi.centro(_h));
    if (dTronco < 34 && cd.pulso <= 0) { this.iniciarPulso(); return; }
    if ((dist > 55 || hy > 40) && cd.rajada <= 0) {
      this.fase = 'rajada'; this.timer = 1.6; this.cuspidas = 0; cd.rajada = 6 * kc;
      this.espera = 99;
      return;
    }
    if (distCabeca < 14 && cd.mordida <= 0) { this.fase = 'mordida'; this.timer = 0.8; cd.mordida = 3 * kc; }
    else if (dist < 32 && hy < 22 && cd.pisao <= 0) { this.fase = 'pisao'; this.timer = 1.3; cd.pisao = 5 * kc; jogo.audio?.rugido?.(0.4); }
    else if (dist < 52 && hy < 38 && cd.cauda <= 0) {
      this.fase = 'cauda'; this.timer = 1.8; cd.cauda = 7 * kc;
      this.yawInicio = this.obj.rotation.y; this.sentidoGiro = Math.random() < 0.5 ? 1 : -1; this.acertouCauda = false;
      jogo.audio?.arremesso();
    } else if (dist < 280 && cd.sopro <= 0) {
      this.fase = 'carregar'; this.tempoCarga = this.furioso() ? 1.1 : 1.6; this.timer = this.tempoCarga; cd.sopro = 11 * kc;
      jogo.audio?.soproAtomico?.(false);
    } else if (dist < 70 && cd.rugido <= 0) {
      this.fase = 'rugido'; this.timer = 2.4; cd.rugido = 14 * kc; jogo.audio?.rugido?.();
    } else return;
    this.espera = 99; // só escolhe de novo quando o ataque acabar
  }

  // raio azul gigante saindo da boca
  sopro(dt, furia) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    heroi.centro(_h);
    this.brilhoPlacas = 1;
    // a mira persegue o herói devagar (na fúria varre de um lado para o outro)
    this.alvoRaio.lerp(_h, Math.min(1, dt * (furia ? 2.4 : 2.6))); // persegue bem rápido: só fugindo em super velocidade
    if (furia) {
      _d.subVectors(_h, this.pos).setY(0).normalize();
      this.alvoRaio.addScaledVector(_v.set(-_d.z, 0, _d.x), Math.sin(this.t * 2.5) * 50 * dt);
    }
    this.obj.rotation.y = anguloLerp(this.obj.rotation.y, Math.atan2(this.alvoRaio.x - this.pos.x, this.alvoRaio.z - this.pos.z), Math.min(1, dt * 1.2));
    this.boca.getWorldPosition(_c);
    _d.subVectors(this.alvoRaio, _c).normalize();
    const hit = jogo.predios.raycast(_c, _d, 320);
    let fim = hit ? hit.dist : 320;
    if (_d.y < -0.001) fim = Math.min(fim, -_c.y / _d.y); // chão
    _v.copy(_c).addScaledVector(_d, fim);
    if (jogo.choque?.ativo === this) {
      this.timer = Math.max(this.timer, 0.3); // não para no meio do choque
    } else {
      if (!heroi.morto && distSegmento(_h, _c, _v) < 4.5) {
        heroi.levarDano(140 * dt);
        heroi.vel.addScaledVector(_d, 60 * dt);
        fim = Math.min(fim, _c.distanceTo(_h));
        _v.copy(_c).addScaledVector(_d, fim);
      } else {
        jogo.predios.danificarEsfera(_v, 4.5, 900 * dt, { velBase: _h.copy(_d).multiplyScalar(-6).setY(8), forca: 12, origem: 'inimigo', pedacos: 2, max: 40 });
        this.tempoExplosao -= dt;
        if (this.tempoExplosao <= 0) {
          this.tempoExplosao = 0.3;
          jogo.explosao(_v, 7, 50, 'inimigo', this);
        }
      }
      this.raio3d.mostrar(_c, _v, jogo.tempo);
      jogo.efeitos.faiscas(_v, 4, 16, [0.5, 0.8, 1]);
      jogo.efeitos.brilho(_v, 6, 0.3, 0.6, 1);
      jogo.efeitos.brilho(_c, 4, 0.4, 0.7, 1);
      jogo.camera.tremer(0.08);
      jogo.marcarPerigo(_v, 40);
    }
    this.feixe.a.copy(_c);
    this.feixe.b.copy(_v);
    this.feixe.ativo = true;
  }

  // ---------- animação ----------
  animar(dt, andar) {
    const t = this.t;
    if (andar > 0) this.passoFase += dt * andar * 0.32;
    else this.passoFase += (Math.round(this.passoFase / Math.PI) * Math.PI - this.passoFase) * Math.min(1, dt * 3);
    const s = Math.sin(this.passoFase);
    const amp = andar > 0 ? 1 : 0;
    // passos: tremor quando o pé bate no chão
    const sinal = Math.sign(s);
    if (andar > 0 && sinal !== this.ultimoSinal && this.ultimoSinal !== undefined) {
      const pe = sinal > 0 ? this.pernaE : this.pernaD;
      pe.userData.pe.getWorldPosition(_c);
      _c.y = 0.4;
      this.jogo.tremerPerto(_c, 0.35);
      this.jogo.efeitos.poeira(_c, 6, 5, 7);
      this.jogo.efeitos.ondaDeChoque(_c, 10, 0.4, 0xd8c9a8);
      this.jogo.audio?.impacto(0.9, _c);
    }
    this.ultimoSinal = sinal;

    const pisao = this.posePisao || 0;
    this.pernaE.rotation.x = s * 0.32 * amp;
    this.pernaD.rotation.x = -s * 0.32 * amp - pisao * 0.9;
    this.pernaE.userData.joelho.rotation.x = Math.max(0, -s) * 0.4 * amp;
    this.pernaD.userData.joelho.rotation.x = Math.max(0, s) * 0.4 * amp + pisao * 1.1;
    this.quadril.position.y = 18 - Math.abs(Math.cos(this.passoFase)) * 0.6 * amp + pisao * 1.2;
    this.quadril.rotation.z = s * 0.05 * amp;

    const rugido = this.poseRugido || 0;
    const mordida = this.poseMordida || 0;
    const carga = this.fase === 'carregar' ? 1 : 0;
    const soprando = this.fase === 'sopro' ? 1 : 0;
    const l = (a, b, k = 4) => a + (b - a) * Math.min(1, dt * k);
    this.dor = Math.max(0, (this.dor || 0) - dt * 2.5);
    const dor = this.dor * this.dor;
    this.peito.rotation.x = l(this.peito.rotation.x, -dor * 0.25 + 0.22 - rugido * 0.35 + mordida * 0.35 + carga * -0.12 + soprando * 0.08 + Math.sin(t * 1.3) * 0.02);
    this.cabeca.rotation.z = l(this.cabeca.rotation.z, Math.sin(t * 30) * dor * 0.25, 12);
    this.cabeca.rotation.x = l(this.cabeca.rotation.x, -dor * 0.4 + -rugido * 0.55 + mordida * 0.3 - carga * 0.25 + soprando * 0.15, 6);
    this.mandibula.rotation.x = l(this.mandibula.rotation.x, Math.max(rugido, mordida > 0.5 ? 0 : mordida * 1.6, soprando) * 0.75 + carga * 0.2, 10);
    for (const [i, b] of this.bracos.entries()) b.rotation.x = Math.sin(t * 1.5 + i) * 0.1 - rugido * 0.5;

    // cauda ondulando (e esticada para fora no giro)
    for (let i = 0; i < this.cauda.length; i++) {
      const seg = this.cauda[i];
      seg.rotation.y = Math.sin(t * 1.4 - i * 0.55) * 0.07 * (1 + amp) - this.giroCauda * 0.13;
      seg.rotation.x = seg.userData.baseX + (this.giroCauda ? Math.abs(this.giroCauda) * (i < 3 ? 0.08 : -0.04) : 0);
    }

    // brilho das placas (cascata da cauda até o pescoço)
    const base = this.furioso() ? 0.6 + Math.sin(t * 4) * 0.3 : 0;
    const b = this.brilhoPlacas;
    for (let i = 0; i < this.matCauda.length; i++) {
      const limiar = 1 - (i + 1) / (this.matCauda.length + 1);
      const ki = b > limiar ? Math.min(1, (b - limiar) * 4) : 0;
      this.matCauda[i].emissiveIntensity = base + ki * (3 + Math.sin(t * 30 + i) * 0.8);
    }
    this.matCostas.emissiveIntensity = base + (b > 0.15 ? Math.min(1, (b - 0.15) * 2) * (3.5 + Math.sin(t * 30) * 0.8) : 0);
  }

  // ---------- pulso nuclear: explosão em volta do corpo (castiga quem fica batendo de perto) ----------
  iniciarPulso() {
    this.fase = 'pulso';
    this.tempoPulso = this.furioso() ? 0.8 : 1.1;
    this.timer = this.tempoPulso;
    this.cd.pulso = this.furioso() ? 7 : 10;
    this.espera = 99;
    this.feixe.ativo = false;
    this.raio3d.esconder();
    this.giroCauda = 0; this.posePisao = 0; this.poseMordida = 0; this.poseRugido = 0;
    this.jogo.hud.mensagem('PULSO NUCLEAR! AFASTE-SE!', '#7dd3fc');
    this.jogo.audio?.soproAtomico?.(false);
  }

  explodirPulso() {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    this.centro(_c);
    const R = 48;
    jogo.efeitos.ondaDeChoque(_c, R * 1.2, 0.8, 0x9fdcff);
    jogo.efeitos.ondaDeChoque(_c, R * 0.8, 0.6, 0xffffff);
    jogo.efeitos.ondaDeChoque(_v.set(this.pos.x, 0.5, this.pos.z), R * 1.4, 1, 0x7dd3fc);
    jogo.efeitos.clarao(_c, 4, 0.8, 0x9fdcff);
    jogo.efeitos.faiscas(_c, 90, 50, [0.5, 0.85, 1]);
    jogo.efeitos.brilho(_c, 30, 0.4, 0.75, 1);
    jogo.predios.danificarEsfera(_c, 16, 3000, { forca: 28, origem: 'inimigo', pedacos: 1, max: 260 });
    jogo.detritos.empurrar(_c, 70, 40);
    jogo.camera.tremer(1);
    jogo.camera.socoFov?.(12);
    jogo.audio?.explosao(1.8, _c);
    heroi.centro(_h);
    const d = _h.distanceTo(_c);
    if (d < R && !heroi.morto) {
      const f = 1 - d / R;
      heroi.levarDano(40 + 80 * f);
      heroi.vel.subVectors(_h, _c).normalize().multiplyScalar(80 + 80 * f);
      heroi.atordoado = 0.8;
      jogo.congelar(0.12);
    }
    if (heroi.segurando && heroi.segurando !== this) heroi.segurando.levarDano(500, 'inimigo');
    this.fase = 'andar';
    this.brilhoPlacas = 0;
    this.espera = 0.8;
  }

  // ---------- bolas atômicas (ataque de longe) ----------
  cuspir() {
    const jogo = this.jogo;
    this.boca.getWorldPosition(_c);
    jogo.heroi.centro(_h);
    // mira um pouco à frente de onde o herói está indo
    _h.addScaledVector(jogo.heroi.vel, 0.5);
    _d.subVectors(_h, _c).normalize();
    _d.x += (Math.random() - 0.5) * 0.15; _d.z += (Math.random() - 0.5) * 0.15;
    _d.normalize();
    if (!this.geoOrbe) {
      this.geoOrbe = new THREE.SphereGeometry(1, 16, 12);
      this.matOrbe = new THREE.MeshBasicMaterial({ color: new THREE.Color(0x6fd0ff).multiplyScalar(4) });
    }
    const mesh = new THREE.Mesh(this.geoOrbe, this.matOrbe);
    mesh.scale.setScalar(2.2);
    mesh.position.copy(_c);
    mesh.frustumCulled = false;
    jogo.cena.add(mesh);
    this.orbes.push({ mesh, pos: mesh.position, vel: _d.clone().multiplyScalar(this.furioso() ? 115 : 95), vida: 0 });
    jogo.efeitos.brilho(_c, 5, 0.4, 0.8, 1);
    jogo.audio?.missil(_c);
    this.poseMordida = 0.6;
  }

  atualizarOrbes(dt) {
    const jogo = this.jogo;
    const heroi = jogo.heroi;
    heroi.centro(_h);
    for (let i = this.orbes.length - 1; i >= 0; i--) {
      const o = this.orbes[i];
      o.vida += dt;
      // persegue o herói (curva devagar: dá para desviar voando de lado)
      const vel = o.vel.length();
      _d.subVectors(_h, o.pos).normalize().multiplyScalar(vel);
      o.vel.lerp(_d, Math.min(1, dt * 2.2)).setLength(vel);
      o.pos.addScaledVector(o.vel, dt);
      o.mesh.scale.setScalar(2.2 + Math.sin(o.vida * 30) * 0.3);
      jogo.efeitos.aditivo.emitir(o.pos.x, o.pos.y, o.pos.z, { vx: 0, vy: 0, vz: 0, vida: 0.4, tamIni: 3.5, tamFim: 0.5, alfa: 0.6, gravidade: 0, arrasto: 0, r: 0.35, g: 0.75, b: 1 });
      let bateu = o.vida > 6 || o.pos.y < 0.5 || jogo.predios.solido(o.pos.x, o.pos.y, o.pos.z);
      if (!bateu && !heroi.morto && o.pos.distanceTo(_h) < 3.2) {
        bateu = true;
        heroi.levarDano(40); // acerto direto
        heroi.vel.copy(o.vel).setLength(70);
        heroi.atordoado = 0.5;
      }
      if (bateu) {
        jogo.cena.remove(o.mesh);
        this.orbes.splice(i, 1);
        jogo.explosao(o.pos, 8, 70, 'inimigo', this);
        jogo.efeitos.ondaDeChoque(o.pos, 14, 0.4, 0x9fdcff);
      }
    }
  }

  // ---------- derrota: último rugido e queda de lado esmagando prédios ----------
  morrer() {
    if (this.estado === 'morto') return;
    const jogo = this.jogo;
    this.estado = 'morto';
    this.tempoEstado = 0;
    this.feixe.ativo = false;
    this.raio3d.esconder();
    for (const o of this.orbes) this.jogo.cena.remove(o.mesh);
    this.orbes.length = 0;
    this.ladoQueda = Math.random() < 0.5 ? 1 : -1;
    this.caiu = false;
    jogo.hud.mensagem('GODZILLA CAIU!', '#4ade80');
    jogo.camaraLenta(1.4);
    jogo.audio?.rugido?.(1.3);
    jogo.aoInimigoDerrotado(this);
  }

  morto(dt) {
    const jogo = this.jogo;
    const t = this.tempoEstado;
    this.t += dt;
    if (t < 1.4) {
      // último rugido com as placas piscando
      this.poseRugido = Math.sin(Math.min(1, t / 1.4) * Math.PI);
      this.brilhoPlacas = Math.random();
      this.animar(dt, 0);
      if (Math.random() < 0.5) { this.centro(_c); jogo.efeitos.faiscas(_c.add(_v.set((Math.random() - 0.5) * 16, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 10)), 6, 14, [0.4, 0.75, 1]); }
      return;
    }
    // tomba de lado (gira em volta dos pés)
    const k = Math.min(1, (t - 1.4) / 2.2);
    this.corpo.rotation.z = this.ladoQueda * (k * k) * (Math.PI / 2) * 0.98;
    this.brilhoPlacas = Math.max(0, 1 - k * 1.5);
    this.poseRugido = 0;
    this.animar(dt, 0);
    if (k >= 1 && !this.caiu) {
      this.caiu = true;
      // impacto: esmaga tudo ao longo do corpo
      const a = this.obj.rotation.y;
      _d.set(-Math.cos(a), 0, Math.sin(a)).multiplyScalar(this.ladoQueda); // direção da queda (lado do corpo)
      for (let i = 1; i <= 5; i++) {
        _c.copy(this.pos).addScaledVector(_d, i * 9).setY(4);
        jogo.predios.danificarEsfera(_c, 9, 9999, { forca: 22, origem: 'heroi', pedacos: 1, max: 90 });
        jogo.efeitos.poeira(_c, 14, 12, 12);
      }
      _c.copy(this.pos).addScaledVector(_d, 25).setY(1);
      jogo.efeitos.ondaDeChoque(_c, 120, 1.4, 0xd8c9a8);
      jogo.efeitos.ondaDeChoque(_c, 70, 0.9, 0xffffff);
      jogo.efeitos.explosao(_c, 12);
      jogo.detritos.empurrar(_c, 80, 40);
      jogo.camera.tremer(1);
      jogo.camera.socoFov?.(14);
      jogo.audio?.desabamento(1, _c);
      jogo.audio?.explosao(2, _c);
    }
    for (const m of this.matCauda) m.emissiveIntensity *= Math.max(0, 1 - dt);
  }
}
