// Ponto de entrada: cria o jogo e roda o loop principal.
import * as THREE from 'three';
import { criarCidade } from './cidade.js';
import { SistemaPredios } from './predios.js';
import { SistemaDetritos } from './detritos.js';
import { Efeitos } from './efeitos.js';
import { Controles } from './controles.js';
import { CameraHeroi } from './camera.js';
import { Heroi } from './heroi.js';
import { Populacao } from './entidades.js';
import { Mira, Laser, Soco, Agarrar } from './poderes.js';
import { Hud } from './hud.js';
import { Audio } from './audio.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import * as Inimigos from './inimigos.js';
const { Projeteis, Alerta } = Inimigos;

const _v = new THREE.Vector3();
const _c = new THREE.Vector3();

class Jogo {
  constructor() {
    const canvas = document.getElementById('tela');
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;

    this.cena = new THREE.Scene();
    this.cam3 = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 3000);
    this.camera = new CameraHeroi(this.cam3);
    this.controles = new Controles(canvas);

    this.entidades = [];
    this.perigos = []; // pontos de perigo recentes (as pessoas fogem)
    this.pausado = true;
    this.tempo = 0;

    this.predios = new SistemaPredios(this);
    criarCidade(this);
    this.detritos = new SistemaDetritos(this);
    this.efeitos = new Efeitos(this);
    this.heroi = new Heroi(this);
    this.heroi.pos.set(0, 0, 12);
    this.heroi.yawCorpo = Math.PI;
    this.camera.yaw = 0;
    this.populacao = new Populacao(this);
    this.mira = new Mira(this);
    this.laser = new Laser(this);
    this.soco = new Soco(this);
    this.agarrar = new Agarrar(this);
    this.hud = new Hud(this);
    this.stats = { inimigos: 0, pessoas: 0 };
    this.projeteis = new Projeteis(this);
    this.alerta = new Alerta(this);
    this.controles.aoPerderTrava = () => { if (!this.acabou && !this.pausado) this.pausar(); };

    // brilho (bloom) no laser, explosões e faíscas
    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.cena, this.cam3));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.7, 0.45, 4.0);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.usarBloom = true;

    this.relogio = new THREE.Clock();
    this.fps = { quadros: 0, tempo: 0, el: document.getElementById('fps') };

    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.composer.setSize(innerWidth, innerHeight);
      this.cam3.aspect = innerWidth / innerHeight;
      this.cam3.updateProjectionMatrix();
    });
    this.renderer.setAnimationLoop(() => this.quadro());
  }

  // ---------- ganchos chamados pelos sistemas ----------
  aoQuebrarBloco(p) { if (p.origem === 'heroi') this.alerta?.adicionar(1); }
  aoNocautear() { this.stats.pessoas++; this.alerta.adicionar(8); }
  aoInimigoDerrotado(e) { this.stats.inimigos++; this.alerta.adicionar(6); }
  aoDestruirPredio(p) {
    if (p.origem === 'heroi') this.alerta.adicionar(25);
    this.hud.mensagem(p.nome === 'casa' ? 'CASA DESTRUÍDA!' : 'PRÉDIO DESTRUÍDO!', '#fbbf24');
  }
  aoDesabar(centro, qtd) {
    this.tremerPerto(centro, Math.min(0.8, 0.2 + qtd / 300));
    this.marcarPerigo(centro, 50);
    this.audio?.desabamento(Math.min(1, qtd / 200), centro);
  }
  congelar(t) { this.congelado = Math.max(this.congelado || 0, t); }
  tremerPerto(pos, qtd) {
    const d = pos.distanceTo(this.heroi.pos);
    const f = Math.max(0, 1 - d / 90);
    if (f > 0) this.camera.tremer(qtd * f);
  }
  perigoPerto(pos) {
    for (const p of this.perigos) if (p.pos.distanceToSquared(pos) < p.raio * p.raio) return true;
    return false;
  }
  marcarPerigo(pos, raio) {
    this.perigos.push({ pos: pos.clone(), raio, tempo: 3 });
  }

  // explosão: efeitos + dano em prédios, entidades e no herói
  explosao(pos, raio, dano, origem = 'heroi', fonte = null) {
    if (!Number.isFinite(pos.x + pos.y + pos.z)) return; // proteção contra posição inválida
    this.efeitos.explosao(pos, raio);
    this.audio?.explosao(raio / 8, pos);
    this.tremerPerto(pos, Math.min(1, raio / 10));
    this.marcarPerigo(pos, raio * 4);
    this.predios.danificarEsfera(pos, raio * 0.8, dano * 3, { forca: 16 + raio * 1.5, origem, pedacos: 3 });
    this.detritos.empurrar(pos, raio * 2, 12 + raio);
    for (const e of this.entidades) {
      if (e === fonte || e.remover || e.estado === 'preso') continue;
      e.centro(_c);
      const d = _c.distanceTo(pos);
      if (d > raio * 1.6) continue;
      const f = 1 - d / (raio * 1.6);
      e.levarDano(dano * f, origem);
      _v.subVectors(_c, pos).normalize().multiplyScalar(25 * f / Math.sqrt(e.massa)).y += 10 * f;
      e.lancar(_v, origem === 'heroi');
    }
    if (origem !== 'heroi') {
      const d = this.heroi.centro(_c).distanceTo(pos);
      if (d < raio * 1.4) this.heroi.levarDano(dano * 0.5 * (1 - d / (raio * 1.4)));
    }
  }

  // ---------- loop ----------
  quadro() {
    let dt = Math.min(0.05, this.relogio.getDelta());
    // "congelamento" rápido nos impactos fortes (dá peso ao golpe)
    if (this.congelado > 0) { this.congelado -= dt; dt *= 0.08; }
    if (!this.pausado) this.atualizar(dt);
    if (this.pausado) this.camera.atualizar(0, this.heroi, this.predios);
    this.efeitos.desenharVento(dt, this.heroi.superVelocidade && !this.pausado ? Math.min(1, this.heroi.vel.length() / 100) : 0);
    // céu e sombra seguem o herói
    this.ceu.position.copy(this.cam3.position);
    const h = this.heroi.pos;
    this.sol.target.position.set(Math.round(h.x), 0, Math.round(h.z));
    this.sol.position.copy(this.dirSol).multiplyScalar(300).add(this.sol.target.position);
    if (this.usarBloom) this.composer.render();
    else this.renderer.render(this.cena, this.cam3);
    this.contarFps(dt);
  }

  atualizar(dt) {
    this.tempo += dt;
    const ctrl = this.controles;
    this.camera.girar(ctrl.dx, ctrl.dy);
    this.camera.calcularEixos();
    this.heroi.atualizar(dt, ctrl, this.camera);
    this.camera.atualizar(dt, this.heroi, this.predios);
    this.mira.atualizar();
    this.laser.atualizar(dt, ctrl.mouseEsq);
    this.soco.atualizar(dt, ctrl.apertou('KeyE'));
    this.agarrar.atualizar(dt, ctrl);

    for (const e of this.entidades) e.atualizar(dt);
    for (let i = this.entidades.length - 1; i >= 0; i--) {
      if (this.entidades[i].remover) { this.entidades[i].destruir(); this.entidades.splice(i, 1); }
    }
    this.populacao.atualizar(dt);
    this.projeteis.atualizar(dt);
    this.alerta.atualizar(dt);
    for (let i = this.perigos.length - 1; i >= 0; i--) if ((this.perigos[i].tempo -= dt) <= 0) this.perigos.splice(i, 1);

    this.predios.atualizar(dt);
    this.detritos.atualizar(dt);
    this.efeitos.atualizar(dt, this.cam3, this.renderer.domElement.clientHeight);
    this.alertaMax = Math.max(this.alertaMax || 0, this.alerta.nivel);
    this.hud.atualizar(dt);
    this.audio?.atualizar(this.heroi.vel.length());
    ctrl.limpar();
  }

  contarFps(dt) {
    const f = this.fps;
    f.quadros++;
    f.tempo += dt;
    if (f.tempo >= 0.5) {
      f.el.textContent = `${Math.round(f.quadros / f.tempo)} FPS · pedaços ${this.detritos.numAtivos} (física ${this.detritos.numFisica})`;
      f.quadros = 0;
      f.tempo = 0;
    }
  }

  pausar() {
    this.pausado = true;
    this.audio?.laser(false);
    document.getElementById('pausa').classList.remove('escondido');
    this.audio?.ctx.suspend();
  }
  continuar() {
    document.getElementById('pausa').classList.add('escondido');
    this.audio?.ctx.resume();
    this.pausado = false;
    this.relogio.getDelta();
    this.controles.travar();
  }
  fimDeJogo() {
    this.acabou = true;
    setTimeout(() => {
      this.pausado = true;
      this.audio?.laser(false);
      document.exitPointerLock?.();
      document.getElementById('fim-texto').innerHTML =
        `Prédios destruídos: <b>${this.predios.destruidos}</b><br>Inimigos derrotados: <b>${this.stats.inimigos}</b><br>Blocos quebrados: <b>${this.predios.blocosQuebrados}</b><br>Alerta máximo: <b>${'★'.repeat(this.alertaMax || 0) || '-'}</b>`;
      document.getElementById('fim').classList.remove('escondido');
    }, 1500);
  }

  comecar() {
    // opções do menu
    const sombras = document.getElementById('op-sombras').checked;
    this.usarBloom = document.getElementById('op-bloom').checked;
    this.renderer.shadowMap.enabled = sombras;
    this.sol.castShadow = sombras;
    this.cena.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    if (document.getElementById('op-telacheia').checked && !document.fullscreenElement) {
      // em tela cheia o navegador deixa o jogo usar Ctrl+W sem fechar a aba
      document.documentElement.requestFullscreen?.().then(() => navigator.keyboard?.lock?.()).catch(() => {});
    }
    try { this.audio = this.audio || Audio.protegido(new Audio(this)); this.audio.ctx.resume(); } catch { this.audio = null; }
    document.getElementById('menu').classList.add('escondido');
    document.getElementById('hud').classList.remove('escondido');
    this.pausado = false;
    this.controles.travar();
  }
}

const jogo = new Jogo();
window.jogo = jogo; // ajuda nos testes pelo console
window.Inimigos = Inimigos;
const btn = document.getElementById('btn-jogar');
document.getElementById('carregando').textContent = '';
btn.addEventListener('click', () => jogo.comecar());
document.getElementById('btn-continuar').addEventListener('click', () => jogo.continuar());
for (const id of ['btn-reiniciar', 'btn-reiniciar2']) document.getElementById(id).addEventListener('click', () => location.reload());
addEventListener('keydown', (e) => { if (e.code === 'KeyP' && !jogo.acabou) (jogo.pausado ? jogo.continuar() : jogo.pausar()); });
