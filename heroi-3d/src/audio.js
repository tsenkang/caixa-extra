// Sons sintetizados com WebAudio (não precisa de arquivos)
export class Audio {
  static protegido(obj) {
    for (const nome of Object.getOwnPropertyNames(Audio.prototype)) {
      if (nome === 'constructor' || nome === 'tocarRuido') continue;
      const f = obj[nome];
      obj[nome] = (...a) => { try { return f.apply(obj, a); } catch (e) { console.warn('som', nome, e.message); } };
    }
    return obj;
  }

  constructor(jogo) {
    this.jogo = jogo;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.mestre = this.ctx.createGain();
    this.mestre.gain.value = 0.55;
    const comp = this.ctx.createDynamicsCompressor();
    this.mestre.connect(comp).connect(this.ctx.destination);
    // ruído branco reaproveitado
    const n = this.ctx.sampleRate * 2;
    this.ruido = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const d = this.ruido.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    this.ultimo = {};
    // vento contínuo (aumenta com a velocidade)
    this.vento = this.tocarRuido({ loop: true, freq: 500, tipo: 'bandpass', q: 0.6, volume: 0 });
    this.laserSom = null;
  }

  // evita tocar o mesmo som muitas vezes por segundo
  pode(nome, intervalo) {
    const t = this.ctx.currentTime;
    if (this.ultimo[nome] && t - this.ultimo[nome] < intervalo) return false;
    this.ultimo[nome] = t;
    return true;
  }

  volumeDistancia(pos, alcance = 200) {
    if (!pos) return 1;
    const d = pos.distanceTo(this.jogo.heroi.pos);
    return Math.max(0, 1 - d / alcance);
  }

  tocarRuido({ dur = 1, freq = 1000, tipo = 'lowpass', q = 1, volume = 1, loop = false, ataque = 0.005, freqFim = null }) {
    const c = this.ctx, t = c.currentTime;
    const src = c.createBufferSource();
    src.buffer = this.ruido;
    src.loop = loop;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const f = c.createBiquadFilter();
    f.type = tipo; f.frequency.value = freq; f.Q.value = q;
    if (freqFim) f.frequency.exponentialRampToValueAtTime(freqFim, t + dur);
    const g = c.createGain();
    if (loop) g.gain.value = volume;
    else {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), t + ataque);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    }
    src.connect(f).connect(g).connect(this.mestre);
    src.start(t, Math.random() * 1.5);
    if (!loop) src.stop(t + dur + 0.05);
    return { src, g, f };
  }

  tom({ freq = 100, freqFim = 40, dur = 0.5, volume = 0.6, forma = 'sine' }) {
    const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator();
    o.type = forma;
    o.frequency.setValueAtTime(freq, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, freqFim), t + dur);
    const g = c.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.mestre);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // ----- sons do jogo -----
  laser(ligado) {
    const c = this.ctx;
    if (ligado && !this.laserSom) {
      const o1 = c.createOscillator(), o2 = c.createOscillator();
      o1.type = 'sawtooth'; o1.frequency.value = 180;
      o2.type = 'square'; o2.frequency.value = 183;
      const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 1400; f.Q.value = 6;
      const g = c.createGain(); g.gain.value = 0;
      g.gain.linearRampToValueAtTime(0.13, c.currentTime + 0.05);
      o1.connect(f); o2.connect(f); f.connect(g).connect(this.mestre);
      o1.start(); o2.start();
      const chiado = this.tocarRuido({ loop: true, freq: 3000, tipo: 'highpass', volume: 0.05 });
      this.laserSom = { o1, o2, g, chiado };
    } else if (!ligado && this.laserSom) {
      const s = this.laserSom, t = c.currentTime;
      s.g.gain.linearRampToValueAtTime(0, t + 0.08);
      s.chiado.g.gain.linearRampToValueAtTime(0, t + 0.08);
      s.o1.stop(t + 0.1); s.o2.stop(t + 0.1); s.chiado.src.stop(t + 0.1);
      this.laserSom = null;
    }
  }
  quebra(f = 1) {
    if (!this.pode('quebra', 0.05)) return;
    this.tocarRuido({ dur: 0.35, freq: 900 + Math.random() * 600, tipo: 'bandpass', q: 1.2, volume: 0.5 * f });
    this.tom({ freq: 90, freqFim: 40, dur: 0.25, volume: 0.3 * f });
  }
  impacto(f = 1, pos) {
    const v = f * this.volumeDistancia(pos);
    if (v < 0.05 || !this.pode('impacto', 0.06)) return;
    this.tocarRuido({ dur: 0.6, freq: 600, freqFim: 120, volume: 0.8 * v });
    this.tom({ freq: 70, freqFim: 30, dur: 0.4, volume: 0.6 * v });
  }
  soco(f = 1) {
    this.tom({ freq: 120, freqFim: 25, dur: 0.7, volume: 0.9 * Math.min(1.3, f) });
    this.tocarRuido({ dur: 0.9, freq: 1200, freqFim: 100, volume: 0.9 * Math.min(1.2, f) });
  }
  explosao(f = 1, pos) {
    const v = Math.min(1.3, f) * this.volumeDistancia(pos, 350);
    if (v < 0.05 || !this.pode('explosao', 0.08)) return;
    this.tocarRuido({ dur: 1.6 + f * 0.5, freq: 1500, freqFim: 60, volume: v });
    this.tom({ freq: 60, freqFim: 20, dur: 1.2, volume: 0.9 * v });
  }
  desabamento(f = 1, pos) {
    const v = this.volumeDistancia(pos, 400);
    this.tocarRuido({ dur: 3.5, freq: 400, freqFim: 80, volume: 0.9 * v * (0.5 + f), ataque: 0.2 });
    this.tom({ freq: 45, freqFim: 25, dur: 3, volume: 0.6 * v });
  }
  tiro(pos) {
    const v = this.volumeDistancia(pos, 160);
    if (v < 0.05 || !this.pode('tiro', 0.04)) return;
    this.tocarRuido({ dur: 0.12, freq: 2500, tipo: 'bandpass', q: 0.8, volume: 0.35 * v });
  }
  canhao(pos) {
    const v = this.volumeDistancia(pos, 300);
    this.tocarRuido({ dur: 0.8, freq: 800, freqFim: 80, volume: 0.9 * v });
    this.tom({ freq: 90, freqFim: 30, dur: 0.6, volume: 0.7 * v });
  }
  missil(pos) {
    const v = this.volumeDistancia(pos, 250);
    this.tocarRuido({ dur: 1.2, freq: 2000, freqFim: 600, tipo: 'bandpass', q: 2, volume: 0.4 * v, ataque: 0.05 });
  }
  raioAzul(ligado) {
    if (ligado) this.tom({ freq: 900, freqFim: 300, dur: 2.2, volume: 0.25, forma: 'sawtooth' });
  }
  // rugido do Godzilla (grave e longo)
  rugido(f = 1) {
    this.tocarRuido({ dur: 2.4 * f, freq: 520, freqFim: 160, tipo: 'lowpass', q: 4, volume: 0.9, ataque: 0.2 });
    this.tom({ freq: 150, freqFim: 48, dur: 2.3 * f, volume: 0.45, forma: 'sawtooth' });
    this.tom({ freq: 230, freqFim: 80, dur: 1.9 * f, volume: 0.22, forma: 'square' });
  }
  soproAtomico(disparo) {
    if (!disparo) this.tom({ freq: 60, freqFim: 700, dur: 2, volume: 0.22, forma: 'sawtooth' });
    else {
      this.tocarRuido({ dur: 3.6, freq: 2200, freqFim: 500, tipo: 'bandpass', q: 0.7, volume: 0.7, ataque: 0.05 });
      this.tom({ freq: 320, freqFim: 110, dur: 3.4, volume: 0.3, forma: 'sawtooth' });
    }
  }
  pegar() { this.tom({ freq: 300, freqFim: 150, dur: 0.15, volume: 0.3, forma: 'triangle' }); }
  arremesso() { this.tocarRuido({ dur: 0.5, freq: 600, freqFim: 2500, tipo: 'bandpass', q: 1.5, volume: 0.6 }); }

  // chamado todo quadro
  atualizar(velHeroi) {
    const alvo = Math.min(0.5, Math.max(0, (velHeroi - 15) / 160));
    this.vento.g.gain.setTargetAtTime(alvo, this.ctx.currentTime, 0.1);
    this.vento.f.frequency.setTargetAtTime(300 + velHeroi * 12, this.ctx.currentTime, 0.1);
  }
}
