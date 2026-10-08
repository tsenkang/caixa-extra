// Sistema de partículas leve (THREE.Points com shader próprio).
import * as THREE from 'three';

const vert = /* glsl */`
attribute float tamanho;
attribute float alfa;
attribute vec3 cor;
varying float vAlfa;
varying vec3 vCor;
varying float vDist;
uniform float uEscala;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = min(tamanho * uEscala / max(-mv.z, 0.1), 900.0);
  vAlfa = alfa;
  vCor = cor;
  vDist = -mv.z;
}`;

const frag = /* glsl */`
varying float vAlfa;
varying vec3 vCor;
varying float vDist;
uniform vec3 uNevoaCor;
uniform float uNevoaPerto;
uniform float uNevoaLonge;
uniform float uAditivo;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  float a = smoothstep(0.5, 0.05, d) * vAlfa;
  float n = smoothstep(uNevoaPerto, uNevoaLonge, vDist);
  vec3 cor = mix(vCor, uNevoaCor, n * (1.0 - uAditivo));
  a *= 1.0 - n * uAditivo;
  gl_FragColor = vec4(cor * (1.0 + uAditivo * 5.0), a);
}`;

export class SistemaParticulas {
  constructor(cena, max, aditivo) {
    this.max = max;
    this.geo = new THREE.BufferGeometry();
    this.posicao = new Float32Array(max * 3);
    this.cor = new Float32Array(max * 3);
    this.tamanho = new Float32Array(max);
    this.alfa = new Float32Array(max);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.posicao, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('cor', new THREE.BufferAttribute(this.cor, 3).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('tamanho', new THREE.BufferAttribute(this.tamanho, 1).setUsage(THREE.DynamicDrawUsage));
    this.geo.setAttribute('alfa', new THREE.BufferAttribute(this.alfa, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: vert, fragmentShader: frag,
      uniforms: {
        uEscala: { value: 500 },
        uNevoaCor: { value: new THREE.Color(0xbcd3e6) },
        uNevoaPerto: { value: 160 }, uNevoaLonge: { value: 750 },
        uAditivo: { value: aditivo ? 1 : 0 },
      },
      transparent: true, depthWrite: false,
      blending: aditivo ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.pontos = new THREE.Points(this.geo, this.material);
    this.pontos.frustumCulled = false;
    cena.add(this.pontos);

    this.vel = new Float32Array(max * 3);
    this.vida = new Float32Array(max);
    this.vidaMax = new Float32Array(max);
    this.tamIni = new Float32Array(max);
    this.tamFim = new Float32Array(max);
    this.alfaIni = new Float32Array(max);
    this.gravidade = new Float32Array(max);
    this.arrasto = new Float32Array(max);
    this.ponteiro = 0;
    this.vivas = 0;
  }

  // op: { vx, vy, vz, vida, tamIni, tamFim, alfa, gravidade, arrasto, r, g, b }
  emitir(x, y, z, op) {
    const i = this.ponteiro;
    this.ponteiro = (i + 1) % this.max;
    const i3 = i * 3;
    this.posicao[i3] = x; this.posicao[i3 + 1] = y; this.posicao[i3 + 2] = z;
    this.vel[i3] = op.vx; this.vel[i3 + 1] = op.vy; this.vel[i3 + 2] = op.vz;
    this.cor[i3] = op.r; this.cor[i3 + 1] = op.g; this.cor[i3 + 2] = op.b;
    this.vida[i] = this.vidaMax[i] = op.vida;
    this.tamIni[i] = op.tamIni; this.tamFim[i] = op.tamFim;
    this.alfaIni[i] = op.alfa;
    this.gravidade[i] = op.gravidade;
    this.arrasto[i] = op.arrasto;
  }

  atualizar(dt, camera, alturaTela) {
    this.material.uniforms.uEscala.value = alturaTela / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
    let vivas = 0;
    for (let i = 0; i < this.max; i++) {
      if (this.vida[i] <= 0) { if (this.alfa[i] !== 0) { this.alfa[i] = 0; this.tamanho[i] = 0; } continue; }
      vivas++;
      this.vida[i] -= dt;
      const t = 1 - Math.max(0, this.vida[i]) / this.vidaMax[i];
      const i3 = i * 3;
      const ar = Math.max(0, 1 - this.arrasto[i] * dt);
      this.vel[i3] *= ar; this.vel[i3 + 1] = this.vel[i3 + 1] * ar - this.gravidade[i] * dt; this.vel[i3 + 2] *= ar;
      this.posicao[i3] += this.vel[i3] * dt;
      this.posicao[i3 + 1] += this.vel[i3 + 1] * dt;
      this.posicao[i3 + 2] += this.vel[i3 + 2] * dt;
      if (this.posicao[i3 + 1] < 0.1) { this.posicao[i3 + 1] = 0.1; this.vel[i3 + 1] *= -0.3; }
      this.tamanho[i] = this.tamIni[i] + (this.tamFim[i] - this.tamIni[i]) * t;
      // aparece rápido e some devagar
      this.alfa[i] = this.alfaIni[i] * Math.min(1, t * 8) * (1 - t);
    }
    this.vivas = vivas;
    const a = this.geo.attributes;
    a.position.needsUpdate = a.cor.needsUpdate = a.tamanho.needsUpdate = a.alfa.needsUpdate = true;
  }
}
