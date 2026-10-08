// Câmera em terceira pessoa (por cima do ombro), com tremida e balanço em alta velocidade.
import * as THREE from 'three';

const _alvo = new THREE.Vector3();
const _desejada = new THREE.Vector3();
const _dir = new THREE.Vector3();

export class CameraHeroi {
  constructor(camera) {
    this.camera = camera;
    this.yaw = Math.PI; // olhando para +z... (ajustado no início)
    this.pitch = -0.12;
    this.sensibilidade = 0.0022;
    this.trauma = 0; // tremida (0 a 1)
    this.distancia = 7;
    this.tempo = 0;
    this.frente = new THREE.Vector3();
    this.direita = new THREE.Vector3();
    this.calcularEixos();
  }

  girar(dx, dy) {
    this.yaw -= dx * this.sensibilidade;
    this.pitch -= dy * this.sensibilidade;
    this.pitch = Math.max(-1.45, Math.min(1.35, this.pitch));
  }

  calcularEixos() {
    const cp = Math.cos(this.pitch);
    this.frente.set(-Math.sin(this.yaw) * cp, Math.sin(this.pitch), -Math.cos(this.yaw) * cp);
    this.direita.set(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
  }

  // "soco" na lente: o campo de visão abre e volta (sensação de impacto)
  socoFov(graus) { this.fovExtra = Math.min(18, (this.fovExtra || 0) + graus); }

  tremer(qtd) { if (Number.isFinite(qtd)) this.trauma = Math.min(0.85, this.trauma + Math.min(0.5, qtd)); }

  atualizar(dt, heroi, predios) {
    this.tempo += dt;
    this.calcularEixos();
    const rapidez = Math.min(1, heroi.vel.length() / 110);
    const distAlvo = 6.5 + rapidez * 4;
    this.distancia += (distAlvo - this.distancia) * Math.min(1, dt * 3);

    _alvo.copy(heroi.pos).y += 1.7;
    _alvo.addScaledVector(this.direita, 1.1);
    _desejada.copy(_alvo).addScaledVector(this.frente, -this.distancia).y += 0.4;

    // não deixa a câmera entrar nos prédios
    _dir.subVectors(_desejada, _alvo);
    const comp = _dir.length();
    _dir.divideScalar(comp);
    const hit = predios.raycast(_alvo, _dir, comp);
    if (hit) _desejada.copy(_alvo).addScaledVector(_dir, Math.max(0.5, hit.dist - 0.4));
    if (_desejada.y < 0.6) _desejada.y = 0.6;

    const cam = this.camera;
    cam.position.copy(_desejada);

    // balanço em alta velocidade
    const t = this.tempo;
    if (rapidez > 0.3) {
      const b = (rapidez - 0.3) * 0.25;
      cam.position.addScaledVector(this.direita, Math.sin(t * 9) * b);
      cam.position.y += Math.sin(t * 13) * b * 0.6;
    }
    // tremida
    const s = this.trauma * this.trauma;
    if (s > 0.001) {
      cam.position.x += (Math.random() - 0.5) * s * 1.1;
      cam.position.y += (Math.random() - 0.5) * s * 1.1;
      cam.position.z += (Math.random() - 0.5) * s * 1.1;
    }
    this.trauma = Math.max(0, this.trauma - dt * 2.2);

    _alvo.copy(cam.position).add(this.frente);
    cam.lookAt(_alvo);
    if (s > 0.001) cam.rotateZ((Math.random() - 0.5) * s * 0.08);

    const fovAlvo = 72 + rapidez * 20;
    cam.fov += (fovAlvo - cam.fov) * Math.min(1, dt * 3);
    if (this.fovExtra > 0.01) { cam.fov += this.fovExtra * Math.min(1, dt * 12); this.fovExtra *= Math.max(0, 1 - dt * 8); }
    cam.updateProjectionMatrix();
  }
}
