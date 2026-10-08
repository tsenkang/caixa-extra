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
    this.renderer.toneMappingExposure = 0.75;

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

    this.relogio = new THREE.Clock();
    this.fps = { quadros: 0, tempo: 0, el: document.getElementById('fps') };

    addEventListener('resize', () => {
      this.renderer.setSize(innerWidth, innerHeight);
      this.cam3.aspect = innerWidth / innerHeight;
      this.cam3.updateProjectionMatrix();
    });
    this.renderer.setAnimationLoop(() => this.quadro());
  }

  // ---------- ganchos chamados pelos sistemas ----------
  tremerPerto(pos, qtd) {
    const d = pos.distanceTo(this.heroi.pos);
    const f = Math.max(0, 1 - d / 120);
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
    this.efeitos.explosao(pos, raio);
    this.tremerPerto(pos, Math.min(1, raio / 10));
    this.marcarPerigo(pos, raio * 4);
    this.predios.danificarEsfera(pos, raio * 0.8, dano * 3, { forca: 10 + raio, origem, pedacos: 2 });
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
    const dt = Math.min(0.05, this.relogio.getDelta());
    if (!this.pausado) this.atualizar(dt);
    this.camera.atualizar(this.pausado ? 0 : dt, this.heroi, this.predios);
    this.efeitos.desenharVento(dt, this.heroi.superVelocidade && !this.pausado ? Math.min(1, this.heroi.vel.length() / 100) : 0);
    // céu e sombra seguem o herói
    this.ceu.position.copy(this.cam3.position);
    const h = this.heroi.pos;
    this.sol.target.position.set(Math.round(h.x), 0, Math.round(h.z));
    this.sol.position.copy(this.dirSol).multiplyScalar(300).add(this.sol.target.position);
    this.renderer.render(this.cena, this.cam3);
    this.contarFps(dt);
  }

  atualizar(dt) {
    this.tempo += dt;
    const ctrl = this.controles;
    this.camera.girar(ctrl.dx, ctrl.dy);
    this.camera.calcularEixos();
    this.heroi.atualizar(dt, ctrl, this.camera);

    for (const e of this.entidades) e.atualizar(dt);
    for (let i = this.entidades.length - 1; i >= 0; i--) {
      if (this.entidades[i].remover) { this.entidades[i].destruir(); this.entidades.splice(i, 1); }
    }
    this.populacao.atualizar(dt);
    for (let i = this.perigos.length - 1; i >= 0; i--) if ((this.perigos[i].tempo -= dt) <= 0) this.perigos.splice(i, 1);

    this.predios.atualizar(dt);
    this.detritos.atualizar(dt);
    this.efeitos.atualizar(dt, this.cam3, this.renderer.domElement.clientHeight);
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

  comecar() {
    // opções do menu
    const sombras = document.getElementById('op-sombras').checked;
    this.renderer.shadowMap.enabled = sombras;
    this.sol.castShadow = sombras;
    this.cena.traverse((o) => { if (o.material) o.material.needsUpdate = true; });
    if (document.getElementById('op-telacheia').checked && !document.fullscreenElement) {
      // em tela cheia o navegador deixa o jogo usar Ctrl+W sem fechar a aba
      document.documentElement.requestFullscreen?.().then(() => navigator.keyboard?.lock?.()).catch(() => {});
    }
    document.getElementById('menu').classList.add('escondido');
    document.getElementById('hud').classList.remove('escondido');
    this.pausado = false;
    this.controles.travar();
  }
}

const jogo = new Jogo();
window.jogo = jogo; // ajuda nos testes pelo console
const btn = document.getElementById('btn-jogar');
document.getElementById('carregando').textContent = '';
btn.addEventListener('click', () => jogo.comecar());
