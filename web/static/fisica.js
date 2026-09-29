// Física do virt preso por cabos, sem bibliotecas externas:
//
//   - CorpoRigido: tronco com massa e tensor de inércia, integrado pelas
//     equações de Newton-Euler (força -> aceleração linear, torque -> angular).
//   - CaboElastico: cabo de aço/borracha que só puxa (lei de Hooke com
//     amortecimento). A soma das trações sustenta o peso do corpo.
//   - Corda: cadeia de partículas integrada por Verlet com restrições de
//     distância. Usada para desenhar os cabos (retos quando tensos, com
//     barriga quando folgados) e para os fios soltos que balançam.
//
// Unidades SI: metros, quilogramas, segundos, newtons.
import * as THREE from 'three';

export const GRAVIDADE = new THREE.Vector3(0, -9.81, 0);

const _a = new THREE.Vector3();
const _b = new THREE.Vector3();
const _q = new THREE.Quaternion();

export class CorpoRigido {
  // inercia: momentos principais no referencial do corpo (kg·m²)
  constructor({ massa, inercia, posicao }) {
    this.massa = massa;
    this.invInercia = new THREE.Vector3(1 / inercia.x, 1 / inercia.y, 1 / inercia.z);
    this.inercia = inercia.clone();
    this.posicao = posicao.clone();
    this.velocidade = new THREE.Vector3();
    this.orientacao = new THREE.Quaternion();
    this.velAngular = new THREE.Vector3();
    this.forca = new THREE.Vector3();
    this.torque = new THREE.Vector3();
  }

  // Ponto do corpo (coordenadas locais) -> mundo
  pontoMundo(local, alvo = new THREE.Vector3()) {
    return alvo.copy(local).applyQuaternion(this.orientacao).add(this.posicao);
  }

  // Velocidade de um ponto do corpo: v + ω × r
  velocidadePonto(pontoMundo, alvo = new THREE.Vector3()) {
    _a.subVectors(pontoMundo, this.posicao);
    return alvo.crossVectors(this.velAngular, _a).add(this.velocidade);
  }

  // Força aplicada num ponto: soma a força e o torque r × F
  aplicarForca(forca, pontoMundo) {
    this.forca.add(forca);
    _a.subVectors(pontoMundo, this.posicao);
    this.torque.add(_b.crossVectors(_a, forca));
  }

  // Torque dado no referencial do corpo (ex.: reação dos motores internos)
  aplicarTorqueLocal(torqueLocal) {
    this.torque.add(_a.copy(torqueLocal).applyQuaternion(this.orientacao));
  }

  integrar(dt, amortLinear = 0.3, amortAngular = 0.8) {
    // Linear: a = F/m + g (Euler semi-implícito)
    _a.copy(this.forca).multiplyScalar(1 / this.massa).add(GRAVIDADE);
    this.velocidade.addScaledVector(_a, dt).multiplyScalar(Math.max(0, 1 - amortLinear * dt));
    this.posicao.addScaledVector(this.velocidade, dt);

    // Angular: α = R · I⁻¹ · Rᵀ · τ   (+ termo giroscópico -ω × Iω)
    _q.copy(this.orientacao).invert();
    const tauLocal = _a.copy(this.torque).applyQuaternion(_q);
    const wLocal = _b.copy(this.velAngular).applyQuaternion(_q);
    const Iw = new THREE.Vector3(this.inercia.x * wLocal.x, this.inercia.y * wLocal.y, this.inercia.z * wLocal.z);
    tauLocal.sub(new THREE.Vector3().crossVectors(wLocal, Iw));
    tauLocal.multiply(this.invInercia).applyQuaternion(this.orientacao);
    this.velAngular.addScaledVector(tauLocal, dt).multiplyScalar(Math.max(0, 1 - amortAngular * dt));

    // Integra a orientação: q += ½ · (ω, 0) · q · dt
    const w = this.velAngular;
    _q.set(w.x * dt * 0.5, w.y * dt * 0.5, w.z * dt * 0.5, 0).multiply(this.orientacao);
    this.orientacao.x += _q.x;
    this.orientacao.y += _q.y;
    this.orientacao.z += _q.z;
    this.orientacao.w += _q.w;
    this.orientacao.normalize();

    this.forca.set(0, 0, 0);
    this.torque.set(0, 0, 0);
  }
}

export class CaboElastico {
  // ancora: ponto fixo no mundo; pontoLocal: onde o cabo prende no corpo
  constructor({ ancora, pontoLocal, comprimento, rigidez, amortecimento }) {
    this.ancora = ancora.clone();
    this.pontoLocal = pontoLocal.clone();
    this.comprimento = comprimento; // comprimento de repouso
    this.rigidez = rigidez;         // N/m
    this.amortecimento = amortecimento; // N·s/m
    this.tensao = 0;                // N (para efeitos visuais)
    this.ponto = new THREE.Vector3();
    this._direcao = new THREE.Vector3();
    this._vel = new THREE.Vector3();
  }

  aplicar(corpo) {
    corpo.pontoMundo(this.pontoLocal, this.ponto);
    const direcao = this._direcao.subVectors(this.ancora, this.ponto);
    const distancia = direcao.length();
    direcao.divideScalar(distancia);
    const alongamento = distancia - this.comprimento;
    if (alongamento <= 0) {
      this.tensao = 0; // cabo frouxo não empurra
      return;
    }
    // Velocidade com que o ponto se afasta da âncora (amortecimento viscoso)
    const vel = corpo.velocidadePonto(this.ponto, this._vel);
    const afastando = -vel.dot(direcao);
    this.tensao = Math.max(0, this.rigidez * alongamento + this.amortecimento * afastando);
    corpo.aplicarForca(this._vel.copy(direcao).multiplyScalar(this.tensao), this.ponto);
  }
}

export class Corda {
  // Cadeia de n+1 partículas de "inicio" a "fim". fixarFim = false deixa a
  // ponta livre (fio solto). chao: altura mínima das partículas.
  constructor({ inicio, fim, segmentos, comprimento, fixarFim = true, amortecimento = 0.985, chao = 0.01 }) {
    this.n = segmentos;
    this.comprimentoSegmento = comprimento / segmentos;
    this.fixarFim = fixarFim;
    this.amortecimento = amortecimento;
    this.chao = chao;
    this.pontos = [];
    this.anteriores = [];
    for (let i = 0; i <= segmentos; i++) {
      const p = new THREE.Vector3().lerpVectors(inicio, fim, i / segmentos);
      this.pontos.push(p);
      this.anteriores.push(p.clone());
    }
  }

  passo(dt, inicio, fim = null, iteracoes = 12) {
    const g = GRAVIDADE.y * dt * dt;
    for (let i = 1; i <= this.n; i++) {
      if (i === this.n && this.fixarFim) continue;
      const p = this.pontos[i], ant = this.anteriores[i];
      const vx = (p.x - ant.x) * this.amortecimento;
      const vy = (p.y - ant.y) * this.amortecimento;
      const vz = (p.z - ant.z) * this.amortecimento;
      ant.copy(p);
      p.x += vx; p.y += vy + g; p.z += vz;
    }
    this.pontos[0].copy(inicio);
    if (this.fixarFim && fim) this.pontos[this.n].copy(fim);

    // Restrições de distância entre partículas vizinhas
    for (let k = 0; k < iteracoes; k++) {
      for (let i = 0; i < this.n; i++) {
        const a = this.pontos[i], b = this.pontos[i + 1];
        const pesoA = i === 0 ? 0 : 1;
        const pesoB = i + 1 === this.n && this.fixarFim ? 0 : 1;
        const soma = pesoA + pesoB;
        if (!soma) continue;
        _a.subVectors(b, a);
        const d = _a.length() || 1e-6;
        const corr = (d - this.comprimentoSegmento) / d / soma;
        a.addScaledVector(_a, corr * pesoA);
        b.addScaledVector(_a, -corr * pesoB);
      }
      for (let i = 1; i <= this.n; i++) if (this.pontos[i].y < this.chao) this.pontos[i].y = this.chao;
    }
  }
}

// Braço como pêndulo duplo (ombro -> cotovelo -> pulso), integrado por Verlet.
// O ombro é arrastado pelo tronco; cotovelo e pulso caem pela gravidade e
// balançam com inércia. Um "motor" fraco em cada junta puxa o braço em
// direção à pose animada (aceleração proporcional à distância do alvo),
// então a pose só é alcançada quando a gravidade deixa.
export class BracoPendular {
  constructor({ comprimentos, forcaMotor = 6, amortecimento = 0.992 }) {
    this.comprimentos = comprimentos; // [ombro->cotovelo, cotovelo->pulso]
    this.forcaMotor = forcaMotor;     // 1/s² (rigidez do motor por massa)
    this.amortecimento = amortecimento;
    this.pontos = null;
    this.anteriores = null;
  }

  // ombro: posição atual do ombro; alvos: [cotovelo, pulso] da pose animada.
  // restringir(ponto, indice): hook para limites (colisão com o tronco etc.)
  passo(dt, ombro, alvos, restringir = null, subpassos = 4) {
    if (!this.pontos) {
      this.pontos = [ombro.clone(), alvos[0].clone(), alvos[1].clone()];
      this.anteriores = this.pontos.map((p) => p.clone());
    }
    const h = dt / subpassos;
    const acel = new THREE.Vector3();
    const dif = new THREE.Vector3();
    for (let s = 0; s < subpassos; s++) {
      this.pontos[0].copy(ombro);
      for (let i = 1; i <= 2; i++) {
        const p = this.pontos[i], ant = this.anteriores[i];
        acel.copy(GRAVIDADE).addScaledVector(dif.subVectors(alvos[i - 1], p), this.forcaMotor);
        const vx = (p.x - ant.x) * this.amortecimento;
        const vy = (p.y - ant.y) * this.amortecimento;
        const vz = (p.z - ant.z) * this.amortecimento;
        ant.copy(p);
        p.x += vx + acel.x * h * h;
        p.y += vy + acel.y * h * h;
        p.z += vz + acel.z * h * h;
      }
      // Segmentos rígidos (o ombro é fixo; o cotovelo pesa igual ao pulso)
      for (let k = 0; k < 4; k++) {
        this._manterDistancia(0, 1, this.comprimentos[0], 0, 1);
        this._manterDistancia(1, 2, this.comprimentos[1], 0.5, 0.5);
        if (restringir) for (let i = 1; i <= 2; i++) restringir(this.pontos[i], i);
      }
    }
    return this.pontos;
  }

  _manterDistancia(a, b, comprimento, pesoA, pesoB) {
    const pa = this.pontos[a], pb = this.pontos[b];
    const d = new THREE.Vector3().subVectors(pb, pa);
    const dist = d.length() || 1e-6;
    const corr = (dist - comprimento) / dist;
    pa.addScaledVector(d, corr * pesoA);
    pb.addScaledVector(d, -corr * pesoB);
  }
}
