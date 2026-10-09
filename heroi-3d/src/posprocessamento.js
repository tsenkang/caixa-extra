// Pós-processamento "desenho animado realista": traço de tinta nas bordas (pela profundidade)
import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const shaderContorno = {
  uniforms: {
    tDiffuse: { value: null },
    tDepth: { value: null },
    uTexel: { value: new THREE.Vector2(1 / 1024, 1 / 768) },
    uPerto: { value: 0.1 },
    uLonge: { value: 3000 },
    uForca: { value: 1.0 },
    uCorTinta: { value: new THREE.Color(0x1a1420) },
  },
  vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */`
    #include <packing>
    uniform sampler2D tDiffuse;
    uniform sampler2D tDepth;
    uniform vec2 uTexel;
    uniform float uPerto, uLonge, uForca;
    uniform vec3 uCorTinta;
    varying vec2 vUv;
    float prof(vec2 uv) {
      float d = texture2D(tDepth, uv).x;
      return perspectiveDepthToViewZ(d, uPerto, uLonge) * -1.0; // distância em metros
    }
    void main() {
      vec4 cor = texture2D(tDiffuse, vUv);
      float c = prof(vUv);
      float l = prof(vUv - vec2(uTexel.x, 0.0)), r = prof(vUv + vec2(uTexel.x, 0.0));
      float u = prof(vUv + vec2(0.0, uTexel.y)), b = prof(vUv - vec2(0.0, uTexel.y));
      // silhueta: salto grande de profundidade (relativo à distância)
      float salto = max(max(abs(l - c), abs(r - c)), max(abs(u - c), abs(b - c))) / c;
      float silhueta = smoothstep(0.035, 0.09, salto);
      // quinas: mudança de inclinação (segunda derivada)
      float lap = abs(l + r - 2.0 * c) + abs(u + b - 2.0 * c);
      float quina = smoothstep(0.012, 0.05, lap / c);
      float linha = max(silhueta, quina * 0.8);
      // longe, o traço some (senão a cidade vira um rabisco)
      linha *= 1.0 - smoothstep(120.0, 520.0, c);
      if (c > uLonge * 0.9) linha = max(silhueta * (1.0 - smoothstep(120.0, 520.0, min(min(l, r), min(u, b)))), 0.0);
      cor.rgb = mix(cor.rgb, uCorTinta * cor.rgb * 0.6 + uCorTinta * 0.4, linha * 0.85 * uForca);
      gl_FragColor = cor;
    }`,
};

export class PassoContorno extends Pass {
  constructor(camera) {
    super();
    this.camera = camera;
    this.material = new THREE.ShaderMaterial({ ...shaderContorno, uniforms: THREE.UniformsUtils.clone(shaderContorno.uniforms) });
    this.quad = new FullScreenQuad(this.material);
  }
  setSize(w, h) { this.material.uniforms.uTexel.value.set(1 / w, 1 / h); }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.material.uniforms;
    u.tDiffuse.value = readBuffer.texture;
    u.tDepth.value = readBuffer.depthTexture;
    u.uPerto.value = this.camera.near;
    u.uLonge.value = this.camera.far;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }
}

// garante que os buffers do compositor guardem a profundidade (usada pelo contorno)
export function prepararProfundidade(composer) {
  for (const rt of [composer.renderTarget1, composer.renderTarget2]) {
    rt.depthTexture = new THREE.DepthTexture(rt.width, rt.height);
    rt.depthTexture.type = THREE.UnsignedIntType;
  }
}
