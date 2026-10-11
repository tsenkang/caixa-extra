// Controles de toque para celular e tablet.
//  - lado esquerdo: joystick (aparece onde o dedo encosta). Empurrar até a borda = super velocidade.
//  - lado direito: arrastar o dedo gira a câmera.
//  - botões: laser, pegar/arremessar, combo, investida, soco, subir, descer e pausa.
// Tudo é traduzido para as mesmas "teclas" do teclado, então o resto do jogo não muda.

const SENSIBILIDADE = 1.9; // giro da câmera no toque (o dedo anda menos que o mouse)

export function ehCelular() {
  const toque = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const grosso = window.matchMedia?.('(pointer: coarse)').matches;
  return !!(toque && grosso);
}

export class ControlesToque {
  constructor(controles, jogo) {
    this.c = controles;
    this.jogo = jogo;
    this.ativo = false;
    this.joy = null; // { id, x0, y0 }
    this.olhar = new Map(); // dedos girando a câmera: id -> {x, y}

    const raiz = document.createElement('div');
    raiz.id = 'toque';
    raiz.className = 'escondido';
    raiz.innerHTML = `
      <div id="toque-esq"></div>
      <div id="toque-dir"></div>
      <div id="joy-base"><div id="joy-pino"></div></div>
      <button class="bt-toque" id="bt-pausa" aria-label="Pausar">II</button>
      <div id="bt-grupo">
        <button class="bt-toque grande" id="bt-laser" data-acao="laser">LASER</button>
        <button class="bt-toque grande" id="bt-pegar" data-acao="pegar">PEGAR</button>
        <button class="bt-toque" id="bt-combo" data-tecla="KeyF">F<small>COMBO</small></button>
        <button class="bt-toque" id="bt-investida" data-tecla="KeyQ">Q<small>INVESTIDA</small></button>
        <button class="bt-toque" id="bt-soco" data-tecla="KeyE">E<small>SOCO</small></button>
        <button class="bt-toque" id="bt-subir" data-segurar="Space">▲</button>
        <button class="bt-toque" id="bt-descer" data-segurar="KeyC">▼</button>
      </div>`;
    document.body.appendChild(raiz);
    this.raiz = raiz;
    this.base = raiz.querySelector('#joy-base');
    this.pino = raiz.querySelector('#joy-pino');

    // joystick
    const esq = raiz.querySelector('#toque-esq');
    esq.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.joy) return;
      esq.setPointerCapture(e.pointerId);
      this.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.base.classList.add('visivel');
      this.moverJoy(e.clientX, e.clientY);
    });
    esq.addEventListener('pointermove', (e) => { if (this.joy?.id === e.pointerId) this.moverJoy(e.clientX, e.clientY); });
    const soltarJoy = (e) => {
      if (this.joy?.id !== e.pointerId) return;
      this.joy = null;
      this.base.classList.remove('visivel', 'turbo');
      for (const t of ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft']) this.c.teclas.delete(t);
    };
    esq.addEventListener('pointerup', soltarJoy);
    esq.addEventListener('pointercancel', soltarJoy);

    // arrastar para olhar (área da direita e também os botões de laser e pegar)
    const dir = raiz.querySelector('#toque-dir');
    const comecarOlhar = (e) => { this.olhar.set(e.pointerId, { x: e.clientX, y: e.clientY }); };
    const moverOlhar = (e) => {
      const o = this.olhar.get(e.pointerId);
      if (!o) return;
      this.c.dx += (e.clientX - o.x) * SENSIBILIDADE;
      this.c.dy += (e.clientY - o.y) * SENSIBILIDADE;
      o.x = e.clientX; o.y = e.clientY;
    };
    const pararOlhar = (e) => this.olhar.delete(e.pointerId);
    dir.addEventListener('pointerdown', (e) => { e.preventDefault(); dir.setPointerCapture(e.pointerId); comecarOlhar(e); });
    dir.addEventListener('pointermove', moverOlhar);
    dir.addEventListener('pointerup', pararOlhar);
    dir.addEventListener('pointercancel', pararOlhar);

    // botões
    for (const b of raiz.querySelectorAll('.bt-toque')) {
      const tecla = b.dataset.tecla, segurar = b.dataset.segurar, acao = b.dataset.acao;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        b.setPointerCapture(e.pointerId);
        b.classList.add('apertado');
        navigator.vibrate?.(8);
        if (tecla) this.c.apertadas.add(tecla);
        if (segurar) this.c.teclas.add(segurar);
        if (acao === 'laser') this.c.mouseEsq = true;
        if (acao === 'pegar') { this.c.mouseDir = true; this.c.dirApertou = true; }
        if (acao) comecarOlhar(e); // dá para mirar arrastando o próprio botão
        if (b.id === 'bt-pausa' && !jogo.acabou) jogo.pausar();
      });
      b.addEventListener('pointermove', (e) => { if (acao) moverOlhar(e); });
      const soltar = (e) => {
        b.classList.remove('apertado');
        if (segurar) this.c.teclas.delete(segurar);
        if (acao === 'laser') this.c.mouseEsq = false;
        if (acao === 'pegar') { if (this.c.mouseDir) this.c.dirSoltou = true; this.c.mouseDir = false; }
        if (acao) pararOlhar(e);
      };
      b.addEventListener('pointerup', soltar);
      b.addEventListener('pointercancel', soltar);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    }
  }

  // posição do dedo no joystick -> teclas W A S D (+ Shift na borda)
  moverJoy(x, y) {
    const raioMax = 60;
    let dx = x - this.joy.x0, dy = y - this.joy.y0;
    const d = Math.hypot(dx, dy);
    if (d > raioMax) { dx *= raioMax / d; dy *= raioMax / d; }
    this.pino.style.transform = `translate(${dx}px, ${dy}px)`;
    const nx = dx / raioMax, ny = dy / raioMax;
    const t = this.c.teclas;
    const marca = (cod, sim) => (sim ? t.add(cod) : t.delete(cod));
    marca('KeyW', ny < -0.35);
    marca('KeyS', ny > 0.35);
    marca('KeyA', nx < -0.35);
    marca('KeyD', nx > 0.35);
    const turbo = d > raioMax * 1.05;
    marca('ShiftLeft', turbo);
    this.base.classList.toggle('turbo', turbo);
  }

  mostrar(sim) {
    this.ativo = sim;
    this.raiz.classList.toggle('escondido', !sim);
    document.body.classList.toggle('modo-toque', sim);
  }

  // o botão PEGAR mostra "SOLTAR" segurando alguém; o laser pisca superaquecido
  atualizar() {
    if (!this.ativo) return;
    const h = this.jogo.heroi;
    const pegar = this.raiz.querySelector('#bt-pegar');
    const texto = h.segurando ? 'SOLTAR' : 'PEGAR';
    if (pegar.textContent !== texto) pegar.textContent = texto;
    pegar.classList.toggle('alvo', !!this.jogo.agarrar?.alvoMira && !h.segurando);
    this.raiz.querySelector('#bt-laser').classList.toggle('quente', !!this.jogo.laser?.superaquecido);
  }
}
