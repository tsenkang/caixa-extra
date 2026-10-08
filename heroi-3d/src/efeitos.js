// Efeitos visuais: poeira, faíscas, fumaça, fogo, explosões, ondas de choque, raios e linhas de vento.
import * as THREE from 'three';
import { SistemaParticulas } from './particulas.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const CIMA = new THREE.Vector3(0, 1, 0);

// raio (laser) feito com dois cilindros: miolo claro + brilho
export class Raio {
  constructor(cena, corMiolo, corBrilho, larguraMiolo = 0.06, larguraBrilho = 0.22) {
    const geo = new THREE.CylinderGeometry(1, 1, 1, 8, 1, true);
    this.miolo = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: corMiolo, transparent: true, opacity: 1, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.brilho = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: corBrilho, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.miolo.material.color.multiplyScalar(8);
    this.brilho.material.color.multiplyScalar(5);
    this.larguraMiolo = larguraMiolo;
    this.larguraBrilho = larguraBrilho;
    this.miolo.visible = this.brilho.visible = false;
    this.miolo.frustumCulled = this.brilho.frustumCulled = false;
    cena.add(this.miolo, this.brilho);
  }
  mostrar(a, b, tempo = 0) {
    _v.subVectors(b, a);
    const comp = _v.length();
    if (comp < 0.01) return this.esconder();
    _q.setFromUnitVectors(CIMA, _v.divideScalar(comp));
    const tremor = 1 + Math.sin(tempo * 60) * 0.15;
    for (const [m, l] of [[this.miolo, this.larguraMiolo], [this.brilho, this.larguraBrilho * tremor]]) {
      m.visible = true;
      m.position.addVectors(a, b).multiplyScalar(0.5);
      m.quaternion.copy(_q);
      m.scale.set(l, comp, l);
    }
  }
  esconder() { this.miolo.visible = this.brilho.visible = false; }
}

export class Efeitos {
  constructor(jogo) {
    this.jogo = jogo;
    const cena = jogo.cena;
    this.normal = new SistemaParticulas(cena, 3500, false);
    this.aditivo = new SistemaParticulas(cena, 2500, true);

    // bolas de fogo
    this.bolas = [];
    const geoBola = new THREE.SphereGeometry(1, 16, 12);
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(geoBola, new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      cena.add(m);
      this.bolas.push({ m, t: 0, dur: 0, raio: 1 });
    }
    // ondas de choque
    this.ondas = [];
    const geoOnda = new THREE.RingGeometry(0.85, 1, 48);
    geoOnda.rotateX(-Math.PI / 2);
    for (let i = 0; i < 8; i++) {
      const m = new THREE.Mesh(geoOnda, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.visible = false;
      cena.add(m);
      this.ondas.push({ m, t: 0, dur: 0, raio: 1 });
    }
    // luzes de clarão (sempre na cena, só mudam a intensidade)
    this.luzes = [];
    for (let i = 0; i < 3; i++) {
      const l = new THREE.PointLight(0xff9a40, 0, 70, 1.4);
      cena.add(l);
      this.luzes.push({ l, t: 0, dur: 0, forca: 0 });
    }
    this.proxLuz = 0;

    // linhas de vento (canvas 2D por cima)
    this.canvasVento = document.getElementById('vento');
    this.ctxVento = this.canvasVento.getContext('2d');
    this.linhas = [];
    for (let i = 0; i < 70; i++) this.linhas.push({ ang: Math.random() * Math.PI * 2, r: Math.random(), vel: 0.6 + Math.random() * 1.2, larg: 1 + Math.random() * 2 });
    this.intensidadeVento = 0;
  }

  // ----- presets de partículas -----
  poeira(p, qtd = 4, espalha = 2, tamanho = 5) {
    for (let i = 0; i < qtd; i++) {
      const c = 0.55 + Math.random() * 0.2;
      this.normal.emitir(p.x + (Math.random() - 0.5) * espalha, p.y + (Math.random() - 0.5) * espalha, p.z + (Math.random() - 0.5) * espalha, {
        vx: (Math.random() - 0.5) * 3, vy: Math.random() * 2, vz: (Math.random() - 0.5) * 3,
        vida: 2 + Math.random() * 2.5, tamIni: tamanho * 0.5, tamFim: tamanho * 1.8, alfa: 0.55,
        gravidade: -0.3, arrasto: 0.8, r: c, g: c * 0.95, b: c * 0.88,
      });
    }
  }
  faiscas(p, qtd = 8, vel = 12, cor = [1, 0.7, 0.25]) {
    for (let i = 0; i < qtd; i++) {
      _v.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().multiplyScalar(vel * (0.4 + Math.random()));
      this.aditivo.emitir(p.x, p.y, p.z, {
        vx: _v.x, vy: _v.y, vz: _v.z, vida: 0.3 + Math.random() * 0.5, tamIni: 0.35, tamFim: 0.1, alfa: 1,
        gravidade: 18, arrasto: 1, r: cor[0], g: cor[1], b: cor[2],
      });
    }
  }
  // lascas: pedacinhos da cor do bloco que voam e caem
  lascas(p, qtd, vel, cor) {
    for (let i = 0; i < qtd; i++) {
      const k = 0.6 + Math.random();
      const c = 0.7 + Math.random() * 0.3;
      this.normal.emitir(p.x + (Math.random() - 0.5) * 2, p.y + (Math.random() - 0.5) * 2, p.z + (Math.random() - 0.5) * 2, {
        vx: vel.x * k + (Math.random() - 0.5) * 12, vy: vel.y * k + Math.random() * 9, vz: vel.z * k + (Math.random() - 0.5) * 12,
        vida: 1 + Math.random() * 1.2, tamIni: 0.25 + Math.random() * 0.35, tamFim: 0.2, alfa: 1.6,
        gravidade: 22, arrasto: 0.3, r: cor.r * c, g: cor.g * c, b: cor.b * c,
      });
    }
  }
  fumaca(p, qtd = 3, tamanho = 4, escura = 0.25) {
    for (let i = 0; i < qtd; i++) {
      const c = escura + Math.random() * 0.12;
      this.normal.emitir(p.x + (Math.random() - 0.5), p.y, p.z + (Math.random() - 0.5), {
        vx: (Math.random() - 0.5) * 1.5, vy: 2 + Math.random() * 2, vz: (Math.random() - 0.5) * 1.5,
        vida: 2.5 + Math.random() * 2, tamIni: tamanho * 0.5, tamFim: tamanho * 2.2, alfa: 0.6,
        gravidade: 0, arrasto: 0.5, r: c, g: c, b: c,
      });
    }
  }
  fogo(p, qtd = 4, raio = 1, tamanho = 3) {
    for (let i = 0; i < qtd; i++) {
      this.aditivo.emitir(p.x + (Math.random() - 0.5) * raio, p.y + (Math.random() - 0.5) * raio, p.z + (Math.random() - 0.5) * raio, {
        vx: (Math.random() - 0.5) * 3, vy: 2 + Math.random() * 4, vz: (Math.random() - 0.5) * 3,
        vida: 0.4 + Math.random() * 0.5, tamIni: tamanho, tamFim: tamanho * 0.3, alfa: 0.9,
        gravidade: -2, arrasto: 1.5, r: 1, g: 0.45 + Math.random() * 0.3, b: 0.1,
      });
    }
  }
  brilho(p, tamanho, r, g, b) {
    this.aditivo.emitir(p.x, p.y, p.z, { vx: 0, vy: 0, vz: 0, vida: 0.08, tamIni: tamanho, tamFim: tamanho, alfa: 1, gravidade: 0, arrasto: 0, r, g, b });
  }

  clarao(p, forca = 1, dur = 0.5, cor = 0xff9a40) {
    const l = this.luzes[this.proxLuz];
    this.proxLuz = (this.proxLuz + 1) % this.luzes.length;
    l.l.position.copy(p);
    l.l.color.set(cor);
    l.t = 0; l.dur = dur; l.forca = 900 * forca;
  }

  bolaDeFogo(p, raio, dur = 0.6) {
    const b = this.bolas.find((x) => !x.m.visible) || this.bolas[0];
    b.m.visible = true;
    b.m.position.copy(p);
    b.t = 0; b.dur = dur; b.raio = raio;
  }

  ondaDeChoque(p, raio, dur = 0.5, cor = 0xffffff, normal = null) {
    const o = this.ondas.find((x) => !x.m.visible) || this.ondas[0];
    o.m.visible = true;
    o.m.position.copy(p);
    // o anel nasce deitado; com "normal" ele fica de frente para a direção do golpe
    if (normal) o.m.quaternion.setFromUnitVectors(CIMA, normal);
    else o.m.quaternion.identity();
    o.m.material.color.set(cor);
    o.t = 0; o.dur = dur; o.raio = raio;
  }

  explosao(p, raio) {
    this.bolaDeFogo(p, raio * 0.9, 0.5 + raio * 0.03);
    this.fogo(p, 10 + raio * 3, raio * 0.6, raio * 0.9);
    this.faiscas(p, 20 + raio * 2, 18 + raio * 2);
    this.fumaca(p, 6 + raio, raio * 1.2, 0.18);
    this.poeira(p, 4 + raio, raio, raio * 1.2);
    this.ondaDeChoque(_v.set(p.x, Math.max(0.3, p.y), p.z), raio * 2.2, 0.45, 0xffc080);
    this.clarao(p, Math.min(3, raio / 4), 0.6);
  }

  atualizar(dt, camera, altura) {
    this.normal.atualizar(dt, camera, altura);
    this.aditivo.atualizar(dt, camera, altura);
    for (const b of this.bolas) {
      if (!b.m.visible) continue;
      b.t += dt;
      const t = b.t / b.dur;
      if (t >= 1) { b.m.visible = false; continue; }
      b.m.scale.setScalar(b.raio * (0.3 + Math.sqrt(t) * 0.9));
      b.m.material.opacity = 1 - t;
      b.m.material.color.setRGB(6, 4.5 - t * 3, 2 - t * 1.8);
    }
    for (const o of this.ondas) {
      if (!o.m.visible) continue;
      o.t += dt;
      const t = o.t / o.dur;
      if (t >= 1) { o.m.visible = false; continue; }
      o.m.scale.setScalar(o.raio * (0.15 + t));
      o.m.material.opacity = (1 - t) * 0.55;
    }
    for (const l of this.luzes) {
      if (l.forca <= 0) { l.l.intensity = 0; continue; }
      l.t += dt;
      const t = l.t / l.dur;
      if (t >= 1) { l.forca = 0; l.l.intensity = 0; continue; }
      l.l.intensity = l.forca * (1 - t) * (1 - t);
    }
  }

  // linhas de vento na tela (super velocidade)
  desenharVento(dt, alvo) {
    const c = this.canvasVento;
    if (c.width !== innerWidth || c.height !== innerHeight) { c.width = innerWidth; c.height = innerHeight; }
    this.intensidadeVento += (alvo - this.intensidadeVento) * Math.min(1, dt * 4);
    const ctx = this.ctxVento;
    ctx.clearRect(0, 0, c.width, c.height);
    const k = this.intensidadeVento;
    if (k < 0.02) return;
    const cx = c.width / 2, cy = c.height / 2;
    const diag = Math.hypot(cx, cy);
    ctx.lineCap = 'round';
    for (const l of this.linhas) {
      l.r += l.vel * dt * (1.2 + k * 2.5);
      if (l.r > 1.1) { l.r = 0.25 + Math.random() * 0.3; l.ang = Math.random() * Math.PI * 2; }
      const r0 = l.r * diag, r1 = r0 + (40 + 200 * k) * l.vel;
      const ca = Math.cos(l.ang), sa = Math.sin(l.ang);
      ctx.strokeStyle = `rgba(255,255,255,${0.35 * k * Math.min(1, l.r * 2)})`;
      ctx.lineWidth = l.larg;
      ctx.beginPath();
      ctx.moveTo(cx + ca * r0, cy + sa * r0);
      ctx.lineTo(cx + ca * r1, cy + sa * r1);
      ctx.stroke();
    }
  }
}
