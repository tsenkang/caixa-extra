// Interface na tela (HTML por cima do jogo)
const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(jogo) {
    this.jogo = jogo;
    this.vida = $('barra-vida');
    this.calor = $('barra-calor');
    this.avisoCalor = $('aviso-calor');
    this.mira = $('mira');
    this.estrelas = [...$('estrelas').children];
    this.estrelasBox = $('estrelas');
    this.contPredios = $('cont-predios');
    this.contInimigos = $('cont-inimigos');
    this.chefes = $('chefes');
    this.mensagens = $('mensagens');
    this.dano = $('dano');
    this.alphaDano = 0;
    this.barrasChefe = new Map();
    this.ultimo = {};
  }

  // só mexe no DOM quando o valor muda
  set(chave, valor, fn) {
    if (this.ultimo[chave] === valor) return;
    this.ultimo[chave] = valor;
    fn(valor);
  }

  atualizar(dt) {
    const j = this.jogo;
    const h = j.heroi;
    this.set('vida', Math.round((h.vida / h.vidaMax) * 200), (v) => (this.vida.style.width = `${v / 2}%`));
    const laser = j.laser;
    if (laser) {
      this.set('calor', Math.round(laser.calor), (v) => (this.calor.style.width = `${v}%`));
      this.set('quente', laser.superaquecido, (v) => {
        this.calor.classList.toggle('quente', v);
        this.avisoCalor.textContent = v ? '— SUPERAQUECIDO' : '';
      });
    }
    const alerta = j.alerta;
    if (alerta) {
      this.set('estrelas', alerta.nivel, (n) => this.estrelas.forEach((e, i) => e.classList.toggle('ativa', i < n)));
      this.set('piscando', alerta.subindo, (v) => this.estrelasBox.classList.toggle('piscando', v));
    }
    this.set('predios', j.predios.destruidos, (v) => (this.contPredios.textContent = v));
    this.set('inimigos', j.stats.inimigos, (v) => (this.contInimigos.textContent = v));

    // mira muda de cor quando dá para pegar algo
    const estadoMira = h.segurando ? 'segurando' : j.agarrar?.alvoMira ? 'alvo' : '';
    this.set('mira', estadoMira, (v) => (this.mira.className = v));

    // barras dos heróis inimigos
    const vivos = new Set();
    for (const e of j.entidades) {
      if (!e.chefe || e.remover) continue;
      vivos.add(e);
      let b = this.barrasChefe.get(e);
      if (!b) {
        const div = document.createElement('div');
        div.className = 'chefe';
        div.innerHTML = `<div class="nome"></div><div class="barra"><div></div></div>`;
        div.querySelector('.nome').textContent = e.nome;
        div.querySelector('.barra > div').style.background = e.corBarra;
        this.chefes.appendChild(div);
        b = { div, barra: div.querySelector('.barra > div'), v: -1 };
        this.barrasChefe.set(e, b);
      }
      const v = Math.round((e.vida / e.vidaMax) * 100);
      if (v !== b.v) { b.v = v; b.barra.style.width = `${v}%`; }
    }
    for (const [e, b] of this.barrasChefe) if (!vivos.has(e) || e.estado === 'morto') { b.div.remove(); this.barrasChefe.delete(e); }

    // tela vermelha quando leva dano
    this.alphaDano = Math.max(0, this.alphaDano - dt * 1.5);
    const baixa = h.vida / h.vidaMax < 0.25 ? 0.35 + Math.sin(j.tempo * 6) * 0.1 : 0;
    this.set('dano', Math.round(Math.max(this.alphaDano, baixa) * 50), (v) => (this.dano.style.opacity = v / 50));
  }

  combo(n) {
    if (!this.elCombo) {
      this.elCombo = document.createElement('div');
      this.elCombo.id = 'combo';
      document.getElementById('hud').appendChild(this.elCombo);
    }
    this.elCombo.textContent = n >= 2 ? `COMBO x${n}` : '';
    this.elCombo.classList.remove('pulo');
    void this.elCombo.offsetWidth; // reinicia a animação
    if (n >= 2) this.elCombo.classList.add('pulo');
  }

  piscarDano(f) { this.alphaDano = Math.min(1, this.alphaDano + 0.25 + f * 0.6); }

  mensagem(texto, cor = '#fff') {
    if (this.mensagens.children.length > 3) this.mensagens.firstChild.remove();
    const d = document.createElement('div');
    d.className = 'msg';
    d.style.color = cor;
    d.textContent = texto;
    this.mensagens.appendChild(d);
    setTimeout(() => d.remove(), 3000);
  }
}
