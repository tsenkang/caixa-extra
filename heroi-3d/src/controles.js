// Teclado + mouse (com trava do ponteiro)
export class Controles {
  constructor(canvas) {
    this.canvas = canvas;
    this.teclas = new Set();
    this.apertadas = new Set(); // teclas apertadas neste quadro
    this.mouseEsq = false;
    this.mouseDir = false;
    this.dirSoltou = false; // botão direito foi solto neste quadro
    this.dirApertou = false;
    this.dx = 0;
    this.dy = 0;
    this.travado = false;
    this.aoPerderTrava = null;

    addEventListener('keydown', (e) => {
      if (['Space', 'ControlLeft', 'ControlRight', 'ShiftLeft', 'ShiftRight', 'Tab'].includes(e.code)) e.preventDefault();
      // Ctrl+W/S/D/A seriam atalhos do navegador
      if (e.ctrlKey && ['KeyW', 'KeyS', 'KeyD', 'KeyA'].includes(e.code)) e.preventDefault();
      if (!e.repeat) this.apertadas.add(e.code);
      this.teclas.add(e.code);
    });
    addEventListener('keyup', (e) => this.teclas.delete(e.code));
    addEventListener('blur', () => { this.teclas.clear(); this.mouseEsq = this.mouseDir = false; });

    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) this.mouseEsq = true;
      if (e.button === 2) { this.mouseDir = true; this.dirApertou = true; }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseEsq = false;
      if (e.button === 2) { if (this.mouseDir) this.dirSoltou = true; this.mouseDir = false; }
    });
    addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.travado) return;
      this.dx += e.movementX;
      this.dy += e.movementY;
    });
    document.addEventListener('pointerlockchange', () => {
      this.travado = document.pointerLockElement === canvas;
      if (!this.travado) { this.mouseEsq = this.mouseDir = false; this.aoPerderTrava?.(); }
    });
  }

  travar() {
    try {
      const r = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (r && r.catch) r.catch(() => this.canvas.requestPointerLock());
    } catch { this.canvas.requestPointerLock(); }
  }

  segura(...codigos) { return codigos.some((c) => this.teclas.has(c)); }
  apertou(codigo) { return this.apertadas.has(codigo); }

  // chamado no fim de cada quadro
  limpar() {
    this.apertadas.clear();
    this.dx = this.dy = 0;
    this.dirSoltou = false;
    this.dirApertou = false;
  }
}
