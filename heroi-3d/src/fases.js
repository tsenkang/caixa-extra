// Fases do jogo: cada uma tem um objetivo (exército ou um chefe).
// Ordem: exército -> Voltagem -> Corisco -> Colosso -> Viltrumita (penúltimo) -> Godzilla (chefe final)
import { HeroiInimigo, TIPOS } from './inimigos.js';
import { Godzilla } from './godzilla.js';

export const FASES = [
  { titulo: 'O EXÉRCITO', texto: 'Derrote 12 soldados e veículos', meta: 12, alerta: 2 },
  { titulo: 'VOLTAGEM', texto: 'Derrote o herói elétrico', chefe: 'raio', alerta: 1 },
  { titulo: 'CORISCO', texto: 'Ele é mais rápido que você', chefe: 'rapido', alerta: 1 },
  { titulo: 'COLOSSO', texto: 'O gigante quer esmagar a cidade', chefe: 'gigante', alerta: 2 },
  { titulo: 'O VILTRUMITA', texto: 'Penúltimo chefe: forte, rápido e sem piedade', chefe: 'viltrumita', alerta: 0 },
  { titulo: 'GODZILLA', texto: 'CHEFE FINAL: o rei dos monstros', chefe: 'godzilla', alerta: 0 },
];

// progresso salvo no navegador (pode falhar em janela anônima)
export function faseLiberada() {
  try { return Math.min(FASES.length - 1, Number(localStorage.getItem('heroi-fase-max')) || 0); } catch { return 0; }
}
function salvarLiberada(n) {
  try { if (n > faseLiberada()) localStorage.setItem('heroi-fase-max', String(n)); } catch { /* sem armazenamento */ }
}

export class Fases {
  constructor(jogo) {
    this.jogo = jogo;
    this.atual = 0;
    this.estado = 'parado'; // parado | titulo | luta | vitoria | fim
    this.timer = 0;
    this.contagem = 0;
    this.chefe = null;
    this.elHud = document.getElementById('fase-hud');
    this.elTitulo = document.getElementById('titulo-fase');
  }

  get fase() { return FASES[this.atual]; }

  comecar(n) {
    const jogo = this.jogo;
    this.atual = n;
    this.estado = 'titulo';
    this.timer = 3.2;
    this.contagem = 0;
    this.chefe = null;
    jogo.alerta.herois = false;
    jogo.alerta.minimo = 0;
    salvarLiberada(n);
    const f = this.fase;
    this.mostrarTitulo(`FASE ${n + 1}`, f.titulo, f.texto, f.chefe === 'godzilla' ? '#38bdf8' : f.chefe === 'viltrumita' ? '#ef4444' : '#facc15');
    this.atualizarHud();
  }

  mostrarTitulo(topo, grande, baixo, cor) {
    const el = this.elTitulo;
    el.innerHTML = `<div class="topo"></div><div class="grande"></div><div class="baixo"></div>`;
    el.querySelector('.topo').textContent = topo;
    el.querySelector('.grande').textContent = grande;
    el.querySelector('.grande').style.color = cor;
    el.querySelector('.baixo').textContent = baixo;
    el.classList.remove('escondido', 'anim');
    void el.offsetWidth; // reinicia a animação
    el.classList.add('anim');
  }

  atualizarHud() {
    const f = this.fase;
    let obj = f.texto;
    if (f.meta) obj = `Inimigos: ${Math.min(this.contagem, f.meta)} / ${f.meta}`;
    else if (this.estado === 'titulo') obj = 'Prepare-se...';
    else if (this.estado === 'vitoria') obj = 'Fase completa!';
    else if (f.chefe) obj = `Derrote ${f.chefe === 'godzilla' ? 'GODZILLA' : TIPOS[f.chefe].nome}`;
    this.elHud.innerHTML = `<b></b><span></span>`;
    this.elHud.querySelector('b').textContent = `FASE ${this.atual + 1}/${FASES.length} · ${f.titulo}`;
    this.elHud.querySelector('span').textContent = obj;
  }

  // chamado quando qualquer inimigo é derrotado
  aoDerrotar(e) {
    if (this.estado !== 'luta') return;
    const f = this.fase;
    if (f.meta && !e.chefe) {
      this.contagem++;
      this.atualizarHud();
      if (this.contagem >= f.meta) this.vencer();
    } else if (f.chefe && e === this.chefe) {
      this.vencer(f.chefe === 'godzilla' ? 6 : 3.5);
    }
  }

  vencer(espera = 3) {
    this.estado = 'vitoria';
    this.timer = espera;
    this.atualizarHud();
    this.jogo.hud.mensagem('FASE COMPLETA!', '#4ade80');
    salvarLiberada(Math.min(FASES.length - 1, this.atual + 1));
  }

  // tira os inimigos que sobraram (para a próxima fase começar limpa)
  limparInimigos() {
    for (const e of this.jogo.entidades) {
      if (e.inimigo && e !== this.chefe && e.estado !== 'morto' && e.estado !== 'preso') e.remover = true;
    }
    this.jogo.alerta.pontos = 0;
  }

  atualizar(dt) {
    const jogo = this.jogo;
    if (this.estado === 'parado' || this.estado === 'fim') return;
    this.timer -= dt;
    const f = this.fase;
    if (this.estado === 'titulo') {
      if (this.timer <= 0) {
        this.estado = 'luta';
        jogo.alerta.minimo = f.alerta;
        if (f.chefe === 'godzilla') {
          this.chefe = new Godzilla(jogo);
          jogo.hud.mensagem('⚠ O CHÃO ESTÁ TREMENDO...', '#38bdf8');
        } else if (f.chefe) {
          this.chefe = new HeroiInimigo(jogo, f.chefe);
          jogo.hud.mensagem(`⚠ ${TIPOS[f.chefe].nome} CHEGOU!`, f.chefe === 'viltrumita' ? '#ef4444' : '#c084fc');
        }
        if (this.chefe) jogo.entidades.push(this.chefe);
        this.atualizarHud();
      }
    } else if (this.estado === 'luta') {
      // chefe sumiu sem morrer (não deveria): traz outro
      if (this.chefe && this.chefe.remover && this.chefe.estado !== 'morto') { this.estado = 'titulo'; this.timer = 1; }
    } else if (this.estado === 'vitoria') {
      if (this.timer <= 0) {
        // cura o herói e vai para a próxima
        const h = jogo.heroi;
        h.vida = h.vidaMax;
        if (this.atual + 1 >= FASES.length) {
          this.estado = 'fim';
          jogo.vitoriaFinal();
          return;
        }
        this.limparInimigos();
        this.comecar(this.atual + 1);
      }
    }
  }
}
