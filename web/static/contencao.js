// Contenção do virt: cabos grossos que saem das costas, ombros e cintura e
// sustentam de verdade o peso do tronco (ver fisica.js), ancorados em vigas no
// teto e em colunas fora do quadro. Inclui presilhas, conectores, desgaste
// perto das pontas (marcas de tensão), fios finos soltos e um cabo de
// energia folgado até o chão.
import * as THREE from 'three';
import { CaboElastico, Corda, CorpoRigido } from './fisica.js';

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const EIXO_Y = v3(0, 1, 0);

// Centro de massa do tronco no mundo (o modelo é deslocado para ficar em volta dele)
export const CENTRO_DE_MASSA = v3(0, 1.4, 0);

// [nome, ponto no corpo (relativo ao centro de massa), âncora no mundo, rigidez N/m, pré-tensão m]
// A pré-tensão diferente entre os ombros deixa o corpo torto, como se um lado cedesse.
const CABOS = [
  ['costas E', v3(-0.07, 0.19, -0.09), v3(-0.5, 4.45, -1.15), 6000, 0.03],
  ['costas D', v3(0.07, 0.19, -0.09), v3(0.55, 4.45, -1.15), 6000, 0.03],
  ['ombro E', v3(-0.215, 0.2, -0.01), v3(-1.5, 4.45, 0.25), 6000, 0.045],
  ['ombro D', v3(0.215, 0.18, -0.01), v3(1.6, 4.45, 0.25), 6000, 0.012],
  ['cintura E', v3(-0.14, -0.33, 0.0), v3(-3.2, 1.25, -0.2), 3000, 0.025],
  ['cintura D', v3(0.14, -0.33, 0.0), v3(3.2, 1.35, -0.2), 3000, 0.025],
];

const SEGMENTOS = 14;
const RAIO_CABO = 0.02;

function sombra(m) { m.castShadow = true; m.receiveShadow = true; return m; }

// Posiciona um cilindro de altura 1 entre dois pontos
function alinhar(malha, a, b, raio) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const comp = dir.length() || 1e-6;
  malha.position.copy(a).addScaledVector(dir, 0.5);
  malha.quaternion.setFromUnitVectors(EIXO_Y, dir.divideScalar(comp));
  malha.scale.set(raio, comp, raio);
}

export class Contencao {
  // suporte: grupo que representa o tronco (recebe posição/orientação do corpo rígido)
  constructor(cena, suporte, M, aleatorio) {
    this.cena = cena;
    this.suporte = suporte;
    this.r = aleatorio;

    this.corpo = new CorpoRigido({ massa: 32, inercia: v3(3.4, 0.6, 3.6), posicao: CENTRO_DE_MASSA });

    const matCabo = new THREE.MeshLambertMaterial({ color: 0x0e0c0b, flatShading: true });
    const matGasto = new THREE.MeshLambertMaterial({ color: 0x2c2622, flatShading: true }); // borracha esfolada
    const geoUnidade = new THREE.CylinderGeometry(1, 1, 1, 6);
    this.geoUnidade = geoUnidade;

    // --- cabos principais ---
    this.cabos = CABOS.map(([nome, local, ancora, rigidez, pre]) => {
      const pontoMundo = local.clone().add(CENTRO_DE_MASSA);
      const comprimento = pontoMundo.distanceTo(ancora) - pre;
      const fisico = new CaboElastico({ ancora, pontoLocal: local, comprimento, rigidez, amortecimento: 120 });
      const corda = new Corda({ inicio: ancora, fim: pontoMundo, segmentos: SEGMENTOS, comprimento });
      // Segmentos visuais (os dois últimos, junto ao corpo, esfolados pelo atrito)
      const segmentos = [];
      for (let i = 0; i < SEGMENTOS; i++) {
        segmentos.push(sombra(new THREE.Mesh(geoUnidade, i >= SEGMENTOS - 2 ? matGasto : matCabo)));
        cena.add(segmentos[i]);
      }
      // Presilhas de metal a cada 3 segmentos
      const presilhas = [];
      for (let i = 2; i < SEGMENTOS - 1; i += 3) {
        const p = sombra(new THREE.Mesh(geoUnidade, M.metal));
        cena.add(p);
        presilhas.push({ malha: p, indice: i });
      }
      // Conector (terminal) na ponta do corpo e na âncora
      const terminal = sombra(new THREE.Mesh(geoUnidade, M.metal));
      const terminalAncora = sombra(new THREE.Mesh(geoUnidade, M.metal));
      cena.add(terminal, terminalAncora);
      // Placa de fixação parafusada no corpo
      const placa = sombra(new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.025), M.ferrugem));
      placa.position.copy(local);
      placa.lookAt(local.clone().add(ancora.clone().sub(pontoMundo).normalize()));
      suporte.add(placa);
      this._suporteAncora(ancora, M);
      return { nome, fisico, corda, segmentos, presilhas, terminal, terminalAncora };
    });

    // Vigas no teto e colunas laterais onde os cabos são ancorados
    for (const z of [-1.15, 0.25]) {
      const viga = sombra(new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.2, 0.14), M.metal));
      viga.position.set(0, 4.58, z);
      cena.add(viga);
    }
    for (const x of [-3.2, 3.2]) {
      const coluna = sombra(new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.7, 0.16), M.metal));
      coluna.position.set(x + Math.sign(x) * 0.1, 2.35, -0.2);
      cena.add(coluna);
    }

    // --- fios soltos (Verlet, ponta livre) ---
    const matFios = M.fios;
    this.fiosSoltos = [];
    const fioSolto = (local, comprimento, raio, cor, segmentos = 7) => {
      const inicio = local.clone().add(CENTRO_DE_MASSA);
      const corda = new Corda({ inicio, fim: inicio.clone().add(v3(0, -comprimento, 0)), segmentos, comprimento, fixarFim: false, amortecimento: 0.97 });
      const malhas = [];
      for (let i = 0; i < segmentos; i++) {
        malhas.push(sombra(new THREE.Mesh(geoUnidade, cor)));
        cena.add(malhas[i]);
      }
      this.fiosSoltos.push({ local, corda, malhas, raio });
    };
    // Feixe pendurado da base da pelve (onde ficariam as pernas)
    for (let i = 0; i < 9; i++) {
      const x = -0.09 + i * 0.022 + (this.r() - 0.5) * 0.01;
      fioSolto(v3(x, -0.43, -0.03 + this.r() * 0.07), 0.12 + this.r() * 0.28, 0.0035 + this.r() * 0.002, matFios[i % matFios.length]);
    }
    // Fiapos finos rompidos perto dos conectores dos ombros
    for (const lado of [-1, 1]) {
      for (let i = 0; i < 2; i++) {
        fioSolto(v3(lado * 0.2, 0.17, 0.02 + i * 0.015), 0.1 + this.r() * 0.12, 0.0018, matFios[(i + 2) % matFios.length], 5);
      }
    }

    // --- cabo de energia folgado da lombar até o chão ---
    const inicioEnergia = v3(0.02, -0.36, -0.08);
    this.energia = {
      local: inicioEnergia,
      corda: new Corda({
        inicio: inicioEnergia.clone().add(CENTRO_DE_MASSA), fim: v3(-0.05, 0.015, -0.06),
        segmentos: 12, comprimento: 1.45, amortecimento: 0.98,
      }),
      malhas: [],
    };
    for (let i = 0; i < 12; i++) {
      this.energia.malhas.push(sombra(new THREE.Mesh(geoUnidade, matCabo)));
      cena.add(this.energia.malhas[i]);
    }

    this._ponto = new THREE.Vector3();
    // Deixa o sistema assentar antes do primeiro quadro (sem balanço inicial)
    for (let i = 0; i < 360; i++) this.passo(1 / 60, null, true);
  }

  // Suporte na âncora: olhal parafusado numa chapa
  _suporteAncora(ancora, M) {
    const chapa = sombra(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.16), M.metal));
    chapa.position.copy(ancora);
    if (Math.abs(ancora.x) > 3) chapa.rotation.z = Math.PI / 2; // colunas laterais
    chapa.position.y += ancora.y > 4 ? 0.06 : 0;
    this.cena.add(chapa);
    const olhal = sombra(new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.009, 4, 6), M.ferrugem));
    olhal.position.copy(ancora);
    this.cena.add(olhal);
  }

  // Avança a simulação. torqueLocal: torque interno (reação da cabeça, esforço)
  passo(dt, torqueLocal = null, assentando = false) {
    const corpo = this.corpo;
    const sub = 8, h = dt / sub;
    for (let s = 0; s < sub; s++) {
      for (const cabo of this.cabos) cabo.fisico.aplicar(corpo);
      if (torqueLocal) corpo.aplicarTorqueLocal(torqueLocal);
      corpo.integrar(h, assentando ? 4 : 0.35, assentando ? 8 : 0.9);
    }
    if (assentando) return;

    // Pose do tronco
    this.suporte.position.copy(corpo.posicao);
    this.suporte.quaternion.copy(corpo.orientacao);

    // Cabos principais
    for (const cabo of this.cabos) {
      const fim = corpo.pontoMundo(cabo.fisico.pontoLocal, this._ponto);
      cabo.corda.passo(dt, cabo.fisico.ancora, fim, 30);
      const pts = cabo.corda.pontos;
      // Vibração fina proporcional à tração (cabo esticado "zunindo")
      const vibra = Math.min(0.0012, cabo.fisico.tensao * 0.000004);
      for (let i = 1; i < SEGMENTOS; i++) pts[i].y += (Math.random() - 0.5) * vibra;
      for (let i = 0; i < SEGMENTOS; i++) {
        // Perto do corpo o cabo "estrangula" um pouco sob tração
        const aperto = i >= SEGMENTOS - 2 ? 1 - Math.min(0.2, cabo.fisico.tensao / 900) : 1;
        alinhar(cabo.segmentos[i], pts[i], pts[i + 1], RAIO_CABO * aperto);
      }
      for (const { malha, indice } of cabo.presilhas) alinhar(malha, pts[indice], pts[indice + 1], RAIO_CABO * 1.45);
      // Terminais: curtos e grossos, apontando ao longo do cabo
      const n = SEGMENTOS;
      const dirFim = new THREE.Vector3().subVectors(pts[n], pts[n - 1]).normalize();
      alinhar(cabo.terminal, pts[n].clone().addScaledVector(dirFim, -0.08), pts[n], RAIO_CABO * 1.7);
      const dirIni = new THREE.Vector3().subVectors(pts[1], pts[0]).normalize();
      alinhar(cabo.terminalAncora, pts[0], pts[0].clone().addScaledVector(dirIni, 0.1), RAIO_CABO * 1.7);
    }

    // Fios soltos e cabo de energia
    for (const fio of this.fiosSoltos) {
      fio.corda.passo(dt, corpo.pontoMundo(fio.local, this._ponto), null, 6);
      const pts = fio.corda.pontos;
      fio.malhas.forEach((m, i) => alinhar(m, pts[i], pts[i + 1], fio.raio));
    }
    const energia = this.energia;
    energia.corda.passo(dt, corpo.pontoMundo(energia.local, this._ponto), energia.corda.pontos[energia.corda.n].clone(), 10);
    energia.malhas.forEach((m, i) => alinhar(m, energia.corda.pontos[i], energia.corda.pontos[i + 1], 0.014));
  }
}
