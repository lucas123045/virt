// O corpo 3D do virt: uma máquina humanoide antiga e abandonada, no estilo
// de um jogo de terror de PS2. Geometria low-poly facetada, texturas pequenas
// e borradas, placas de pele/porcelana quebradas sobre um esqueleto de metal
// enferrujado. Sem pernas: é um protótipo perigoso, suspenso e contido por
// cabos grossos que sustentam seu peso com física real (contencao.js).
//
// Este arquivo é o equivalente virtual de um futuro ServoBody: traduz
// emoção/olhar/gesto em rotações de "servos" (pescoço, cabeça, mandíbula,
// pálpebras). A API pública (aplicarIntencao, pensar, falar...) não muda.
import * as THREE from 'three';
import {
  aleatorio, texturaFerrugem, texturaMetal, texturaPele, texturaRosto,
} from './texturas.js';
import { CENTRO_DE_MASSA, Contencao } from './contencao.js';
import { BracoPendular } from './fisica.js';

// ---------------------------------------------------------------------------
// Pose por emoção
//   mandibula: abertura base (a boca nunca fecha totalmente)
//   pitch/yaw/roll: postura da cabeça   tremor: agitação
//   curvar: tronco curvado   respiracao: ritmo do "zumbido"   luz: fator das luzes da cena
// ---------------------------------------------------------------------------
const EMOCOES = {
  neutro:      { mandibula: 0.10, pitch: 0.06, yaw: 0.0,  roll: 0.05,  tremor: 0.0,   curvar: 0.0,   respiracao: 1.2, luz: 1.0 },
  feliz:       { mandibula: 0.30, pitch: 0.0,  yaw: 0.0,  roll: 0.16,  tremor: 0.0,   curvar: -0.02, respiracao: 1.6, luz: 1.04 },
  curioso:     { mandibula: 0.16, pitch: 0.04, yaw: 0.0,  roll: 0.30,  tremor: 0.0,   curvar: 0.03,  respiracao: 1.4, luz: 1.0 },
  desconfiado: { mandibula: 0.05, pitch: 0.14, yaw: 0.2,  roll: -0.05, tremor: 0.0,   curvar: 0.0,   respiracao: 1.0, luz: 0.9 },
  irritado:    { mandibula: 0.26, pitch: 0.18, yaw: 0.0,  roll: 0.0,   tremor: 0.014, curvar: 0.04,  respiracao: 2.4, luz: 0.85 },
  triste:      { mandibula: 0.08, pitch: 0.40, yaw: 0.0,  roll: 0.12,  tremor: 0.0,   curvar: 0.10,  respiracao: 0.8, luz: 0.75 },
};

const DURACAO_GESTO = { inclinar_cabeca: 1.6, acenar_cabeca: 1.2, negar_cabeca: 1.3, piscar: 0.9 };

const suavizar = (atual, alvo, velocidade, dt) => atual + (alvo - atual) * (1 - Math.exp(-velocidade * dt));
const limitar = (v, min, max) => Math.min(max, Math.max(min, v));
const suave = (a, b, x) => { const t = limitar((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
// Servo barato: a rotação anda em degraus, dando movimento travado e mecânico
const servo = (v, passo = 0.012) => Math.round(v / passo) * passo;
// Ruído determinístico por posição (vértices duplicados recebem o mesmo valor)
const hash3 = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
const hash1 = (n) => hash3(n, n * 0.37, 1.3);

const v3 = (x, y, z) => new THREE.Vector3(x, y, z);
const EIXO_Y = v3(0, 1, 0);
const BAIXO = v3(0, -1, 0);

// ---------------------------------------------------------------------------
// Materiais: Lambert/Phong com flatShading (sem PBR), como num PS2
// ---------------------------------------------------------------------------
function criarMateriais() {
  return {
    pele: new THREE.MeshLambertMaterial({ map: texturaPele(7), flatShading: true }),
    placa: new THREE.MeshLambertMaterial({ map: texturaPele(17), flatShading: true, side: THREE.DoubleSide }),
    rosto: new THREE.MeshLambertMaterial({ map: texturaRosto(13), flatShading: true, side: THREE.DoubleSide }),
    metal: new THREE.MeshPhongMaterial({ map: texturaMetal(3), flatShading: true, shininess: 18, specular: 0x2a2622 }),
    ferrugem: new THREE.MeshLambertMaterial({ map: texturaFerrugem(5), flatShading: true }),
    escuro: new THREE.MeshBasicMaterial({ color: 0x040302 }),
    fios: [0x5e2320, 0x7a6a35, 0x3a3a38, 0x2e3d4d, 0x151210, 0x4a3222].map((c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true })),
  };
}

// ---------------------------------------------------------------------------
// Peças básicas
// ---------------------------------------------------------------------------
function malha(geo, mat, pai, { x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1 } = {}) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.scale.set(sx, sy, sz);
  pai.add(m);
  return m;
}

// Cilindro facetado ligando dois pontos (ossos, hastes, falanges)
function barra(a, b, raio, mat, pai, raioFim = raio, lados = 6) {
  const dir = new THREE.Vector3().subVectors(b, a);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(raioFim, raio, dir.length(), lados), mat);
  m.position.copy(a).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(EIXO_Y, dir.normalize());
  pai.add(m);
  return m;
}

// Fio gasto passando por pontos (tubo de 4 lados)
function fio(pontos, raio, mat, pai) {
  return malha(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pontos), 14, raio, 4), mat, pai);
}

// Remove triângulos de uma geometria não indexada conforme um critério
function removerTriangulos(geo, remover) {
  const pos = geo.attributes.position, uv = geo.attributes.uv;
  const novasPos = [], novosUv = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i); b.fromBufferAttribute(pos, i + 1); c.fromBufferAttribute(pos, i + 2);
    const centro = a.clone().add(b).add(c).divideScalar(3);
    if (remover(centro)) continue;
    for (let k = 0; k < 3; k++) {
      novasPos.push(pos.getX(i + k), pos.getY(i + k), pos.getZ(i + k));
      if (uv) novosUv.push(uv.getX(i + k), uv.getY(i + k));
    }
  }
  const nova = new THREE.BufferGeometry();
  nova.setAttribute('position', new THREE.Float32BufferAttribute(novasPos, 3));
  if (uv) nova.setAttribute('uv', new THREE.Float32BufferAttribute(novosUv, 2));
  nova.computeVertexNormals();
  return nova;
}

// Placa curva quebrada (meio cilindro aberto com bordas serrilhadas)
// "frente" = ângulo para onde a placa aponta (0 = +z, PI/2 = +x)
function placaQuebrada(raioTopo, raioBase, altura, frente, abertura, semente, quebra = 0.25) {
  const geo = new THREE.CylinderGeometry(raioTopo, raioBase, altura, 6, 3, true, frente - abertura / 2, abertura);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const h = hash3(x * 50 + semente, y * 50, z * 50);
    // bordas de cima e de baixo lascadas
    if (Math.abs(y) > altura * 0.49) pos.setY(i, y - Math.sign(y) * h * quebra * altura);
    // pequenas deformações (placa amassada)
    const f = 1 + (h - 0.5) * 0.12;
    pos.setX(i, x * f);
    pos.setZ(i, z * f);
  }
  geo.computeVertexNormals();
  return geo;
}

// Casca (calota) quebrada: ombreiras, peitoral, pelve.
// A calota abre para +y; "falhas" (0..1) remove triângulos perto da borda.
function cascaQuebrada(raio, anguloMax, semente, falhas = 0.35) {
  const geo = new THREE.SphereGeometry(raio, 8, 6, 0, Math.PI * 2, 0, anguloMax).toNonIndexed();
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const f = 1 + (hash3(x * 40 + semente, y * 40, z * 40) - 0.5) * 0.14;
    pos.setXYZ(i, x * f, y * f, z * f);
  }
  const limiteBorda = Math.cos(anguloMax * 0.6) * raio;
  return removerTriangulos(geo, (c) => c.y < limiteBorda && hash3(c.x * 30 + semente, c.y * 30, c.z * 30) < falhas);
}

// ---------------------------------------------------------------------------
// O crânio: esfera low-poly deformada vértice a vértice em um rosto calvo,
// com órbitas fundas (a esquerda do robô, +x, maior e desalinhada), nariz,
// maçãs do rosto afundadas e um buraco quebrado na têmpora.
// ---------------------------------------------------------------------------
// Direções das órbitas na esfera unitária (D = direita do robô, E = esquerda)
const DIR_ORBITA_D = v3(-0.38, 0.22, 0.9).normalize();
const DIR_ORBITA_E = v3(0.4, 0.17, 0.9).normalize();
const ESCALA_CRANIO = v3(0.098, 0.145, 0.118);

function deformarCranio(u) {
  // u: ponto na esfera unitária -> ponto no crânio (espaço da malha)
  let r = 1;
  r -= 0.2 * suave(0.9, 0.985, u.dot(DIR_ORBITA_D));
  r -= 0.25 * suave(0.88, 0.985, u.dot(DIR_ORBITA_E));
  r += 0.1 * suave(0.965, 1.0, u.dot(v3(0, -0.2, 1).normalize()));          // nariz
  r += 0.035 * suave(0.93, 1.0, u.dot(v3(0, 0.5, 0.87).normalize()));       // testa
  r -= 0.07 * suave(0.88, 0.99, u.dot(v3(-0.62, -0.3, 0.72).normalize()));  // bochechas fundas
  r -= 0.08 * suave(0.88, 0.99, u.dot(v3(0.62, -0.3, 0.72).normalize()));
  r *= 1 + (hash3(u.x, u.y, u.z) - 0.5) * 0.07;                             // superfície irregular
  let x = u.x * r, y = u.y * r, z = u.z * r;
  x *= ESCALA_CRANIO.x * (y < 0 ? 1 + y * 0.38 : 1);                          // afina no queixo
  z *= ESCALA_CRANIO.z * (y < -0.2 ? 1 + (y + 0.2) * 0.25 : 1);
  y *= ESCALA_CRANIO.y;
  if (y > 0.03 && z < 0) z *= 1.12;                                          // nuca volumosa
  if (y < -0.07) y = -0.07 + (y + 0.07) * 0.25;                              // base plana (encaixe da mandíbula)
  return v3(x, y, z);
}

function geometriaCranio() {
  const geo = new THREE.SphereGeometry(1, 20, 14).toNonIndexed();
  const pos = geo.attributes.position;
  const unidade = new Float32Array(pos.array);
  const u = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    u.set(unidade[i * 3], unidade[i * 3 + 1], unidade[i * 3 + 2]);
    const p = deformarCranio(u);
    pos.setXYZ(i, p.x, p.y, p.z);
  }
  // Buraco na têmpora/bochecha esquerda do robô: pele arrancada, mecanismo exposto
  return removerTriangulos(geo, (c) => {
    const ux = c.x / ESCALA_CRANIO.x, uy = c.y / ESCALA_CRANIO.y, uz = c.z / ESCALA_CRANIO.z;
    const dentro = ux > 0.74 && uy > -0.5 && uy < 0.18 && uz > -0.5 && uz < 0.62;
    return dentro && hash3(c.x * 90, c.y * 90, c.z * 90) > 0.12;
  });
}

// ---------------------------------------------------------------------------
// O robô
// ---------------------------------------------------------------------------
export class Virt3D {
  constructor(cena, camera) {
    this.camera = camera;
    this.M = criarMateriais();
    this.r = aleatorio(42);
    // "suporte" recebe a pose do corpo rígido simulado; o modelo fica
    // deslocado para que o tronco gire em torno do próprio centro de massa
    this.suporte = new THREE.Group();
    cena.add(this.suporte);
    this.raiz = new THREE.Group();
    this.raiz.position.copy(CENTRO_DE_MASSA).negate();
    this.suporte.add(this.raiz);

    this.ombros = [];
    this.maos = [];
    this.bracos = [];
    this._montar();

    // Sombras em todas as peças
    this.raiz.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });

    // Cabos de contenção + física
    this.contencao = new Contencao(cena, this.suporte, this.M, this.r);
    this.torqueInterno = new THREE.Vector3();
    this.reacao = { anterior: null, velocidade: new THREE.Vector3() };
    this.luta = { proximo: 6, fim: 0, torque: new THREE.Vector3(), braco: 0 };

    // Estado de animação
    this.t = 0;
    this.emocao = EMOCOES.neutro;
    this.atual = { ...EMOCOES.neutro };
    this.olhar = 'usuario';
    this.ladoOlhar = 1;
    this.olharAtual = { yaw: 0, pitch: 0 };
    this.gesto = null;
    this.pensando = false;
    this.falaAte = 0;
    this.falandoTTS = false;
    this.nivelVoz = null;
    this.espasmo = { yaw: 0, pitch: 0, proximo: 5 };
    this.fatorLuz = 1;
    this._tmp = new THREE.Vector3();
  }

  // --- API usada pelo app ------------------------------------------------

  aplicarIntencao({ emocao, olhar, gesto }) {
    this.emocao = EMOCOES[emocao] ?? EMOCOES.neutro;
    this.olhar = olhar;
    this.ladoOlhar = this.r() < 0.5 ? -1 : 1;
    this.pensando = false;
    if (gesto && gesto !== 'nenhum' && DURACAO_GESTO[gesto]) this.gesto = { tipo: gesto, inicio: this.t };
  }

  pensar(ligado) {
    this.pensando = ligado;
    if (ligado) this.ladoOlhar = this.r() < 0.5 ? -1 : 1;
  }

  falar(segundos) { this.falaAte = this.t + segundos; }
  definirFalaTTS(falando) { this.falandoTTS = falando; }
  // Volume real da voz (0..1) para mover a mandíbula; null = sem áudio medido
  definirNivelVoz(nivel) { this.nivelVoz = nivel; }
  get falando() { return this.falandoTTS || this.t < this.falaAte; }

  // --- montagem do corpo -------------------------------------------------

  _montar() {
    const M = this.M;

    // Pelve: placa em forma de "fralda" quebrada + cabos soltos pendurados
    const pelve = new THREE.Group();
    pelve.position.y = 1.03;
    pelve.rotation.set(0.03, 0.04, 0.03);
    this.raiz.add(pelve);
    malha(cascaQuebrada(0.13, 1.35, 3, 0.3), M.placa, pelve, { y: 0.03, rx: Math.PI, sx: 1.05, sy: 0.75, sz: 0.62 });
    malha(new THREE.BoxGeometry(0.2, 0.05, 0.08), M.metal, pelve, { y: 0.03 });
    this._basePelve(pelve);

    // Coluna exposta
    const coluna = new THREE.Group();
    coluna.position.y = 0.07;
    coluna.rotation.set(0.05, -0.05, -0.04);
    pelve.add(coluna);
    for (let i = 0; i < 6; i++) {
      malha(new THREE.CylinderGeometry(0.026, 0.03, 0.024, 6), i % 2 ? M.ferrugem : M.metal, coluna, { y: 0.01 + i * 0.04, ry: i * 0.3 });
    }
    for (const lado of [-1, 1]) {
      barra(v3(lado * 0.06, 0.0, 0.02), v3(lado * 0.08, 0.24, 0.0), 0.007, M.ferrugem, coluna);
    }
    for (let i = 0; i < 5; i++) {
      const x = (i - 2) * 0.02;
      fio([v3(x, -0.01, 0.04), v3(x * 2.2, 0.1, 0.07 + this.r() * 0.03), v3(x * 1.4, 0.25, 0.04)], 0.003, M.fios[(i + 1) % M.fios.length], coluna);
    }

    // Tórax (levemente torto para o lado)
    const peito = new THREE.Group();
    peito.position.y = 0.24;
    peito.rotation.z = -0.06;
    coluna.add(peito);
    this.peito = peito;
    this._torax(peito);
    this._bracos(peito);

    // Pescoço exposto
    const pescoco = new THREE.Group();
    pescoco.position.set(0, 0.3, -0.02);
    peito.add(pescoco);
    this.pescoco = pescoco;
    for (let i = 0; i < 5; i++) {
      malha(new THREE.CylinderGeometry(0.02, 0.024, 0.02, 6), i % 2 ? M.ferrugem : M.metal, pescoco, { y: 0.01 + i * 0.03, ry: i * 0.5 });
    }
    barra(v3(-0.03, 0.0, 0.01), v3(-0.025, 0.14, 0.02), 0.005, M.metal, pescoco);
    barra(v3(0.032, 0.0, 0.0), v3(0.028, 0.13, 0.01), 0.005, M.ferrugem, pescoco);
    for (let i = 0; i < 6; i++) {
      const x = (i - 2.5) * 0.012;
      fio([v3(x, 0.16, -0.03), v3(x * 2, 0.07, -0.05 - this.r() * 0.02), v3(x * 3.5, -0.03, -0.04)], 0.0026, M.fios[(i + 2) % M.fios.length], pescoco);
    }
    // Um fio arrebentado pendurado na frente do pescoço
    fio([v3(0.02, 0.12, 0.02), v3(0.035, 0.04, 0.05), v3(0.03, -0.04, 0.06)], 0.0028, M.fios[0], pescoco);

    this._cabeca(pescoco);
  }

  _torax(peito) {
    const M = this.M;
    // Gaiola de metal enferrujado
    for (const x of [-0.14, 0.14]) {
      for (const z of [0.07, -0.07]) barra(v3(x * 0.8, 0.0, z * 0.8), v3(x, 0.29, z), 0.008, M.ferrugem, peito);
    }
    for (const y of [0.03, 0.16, 0.29]) {
      const l = y === 0.03 ? 0.11 : 0.14;
      barra(v3(-l, y, 0.07), v3(l, y, 0.07), 0.006, M.metal, peito);
      barra(v3(-l, y, -0.07), v3(l, y, -0.07), 0.006, M.metal, peito);
    }
    // Costelas de metal
    for (let i = 0; i < 3; i++) {
      malha(new THREE.TorusGeometry(0.12 - i * 0.01, 0.005, 3, 9, Math.PI), M.metal, peito, { y: 0.1 + i * 0.05, rx: Math.PI / 2, sz: 0.55 });
    }
    // Mecanismo interno exposto
    malha(new THREE.BoxGeometry(0.15, 0.13, 0.08), M.ferrugem, peito, { x: 0.04, y: 0.14, z: -0.01, ry: 0.1, rz: 0.05 });
    malha(new THREE.CylinderGeometry(0.03, 0.03, 0.09, 6), M.metal, peito, { x: -0.05, y: 0.07, z: 0.02, rz: Math.PI / 2 });
    malha(new THREE.BoxGeometry(0.05, 0.04, 0.05), M.metal, peito, { x: 0.07, y: 0.24, z: 0.03, ry: 0.4 });
    malha(new THREE.BoxGeometry(0.3, 0.3, 0.015), M.metal, peito, { y: 0.15, z: -0.075 });
    // Placa peitoral direita (a esquerda do robô caiu), mais um caco solto
    malha(cascaQuebrada(0.14, 0.95, 11, 0.4), M.placa, peito, { x: -0.07, y: 0.17, z: 0.0, rx: Math.PI / 2, sx: 0.85, sy: 0.55, sz: 0.95 });
    malha(cascaQuebrada(0.07, 0.8, 23, 0.5), M.placa, peito, { x: 0.09, y: 0.05, z: 0.04, rx: Math.PI / 2 + 0.2, rz: 0.4, sy: 0.5 });
    // Fios saindo do mecanismo
    for (let i = 0; i < 6; i++) {
      const x = 0.02 + i * 0.012;
      fio([v3(x, 0.2, 0.03), v3(x + 0.03, 0.08, 0.1 + this.r() * 0.03), v3(x - 0.02, -0.06 - this.r() * 0.08, 0.07)], 0.0028, M.fios[i % M.fios.length], peito);
    }
  }

  _cabeca(pescoco) {
    const M = this.M;
    const cabeca = new THREE.Group();
    cabeca.position.set(0, 0.15, 0.03);   // cabeça projetada para frente
    pescoco.add(cabeca);
    this.cabeca = cabeca;

    // Crânio de pele/porcelana com o buraco quebrado
    const cranio = new THREE.Group();
    cranio.position.y = 0.12;
    cabeca.add(cranio);
    malha(geometriaCranio(), M.rosto, cranio);
    // Crânio interno de metal (aparece pelo buraco) + peças do mecanismo
    malha(new THREE.SphereGeometry(0.088, 8, 6), M.ferrugem, cranio, { y: 0.01, sx: 1.0, sy: 1.3, sz: 1.1 });
    malha(new THREE.CylinderGeometry(0.02, 0.02, 0.02, 6), M.metal, cranio, { x: 0.085, y: 0.0, z: 0.02, rz: Math.PI / 2 });
    barra(v3(0.08, -0.05, 0.05), v3(0.09, 0.03, -0.01), 0.004, M.metal, cranio);
    fio([v3(0.07, 0.02, -0.02), v3(0.1, -0.03, 0.02), v3(0.08, -0.09, 0.04)], 0.0025, M.fios[1], cranio);

    // Olhos: órbitas totalmente negras e vazias. Material "básico" preto
    // não reage à luz, então o fundo nunca aparece: só escuridão.
    // A órbita esquerda do robô (+x) é um pouco maior e mais baixa.
    for (const [direcao, raio, desvio] of [[DIR_ORBITA_D, 0.027, 0], [DIR_ORBITA_E, 0.03, -0.006]]) {
      const p = deformarCranio(direcao.clone());
      malha(new THREE.SphereGeometry(raio, 8, 6), M.escuro, cranio, { x: p.x, y: p.y + desvio, z: p.z - 0.012, sz: 0.8 });
    }

    // Boca: cavidade escura
    malha(new THREE.SphereGeometry(0.07, 8, 5), M.escuro, cabeca, { y: 0.045, z: 0.02, sx: 0.95, sy: 0.5, sz: 0.93 });

    // Mandíbula mecânica, articulada perto das "orelhas"
    const mandibula = new THREE.Group();
    mandibula.position.set(0, 0.055, -0.02);
    cabeca.add(mandibula);
    this.mandibula = mandibula;
    const geoQueixo = new THREE.SphereGeometry(1, 10, 5, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
    const pq = geoQueixo.attributes.position;
    for (let i = 0; i < pq.count; i++) {
      const x = pq.getX(i), y = pq.getY(i), z = pq.getZ(i);
      const irregular = 1 + (hash3(x, y, z + 3) - 0.5) * 0.08;
      pq.setXYZ(i, x * 0.07 * (1 + y * 0.55) * irregular, y * 0.078 * irregular, z * 0.085 * (1 - y * 0.12) * irregular);
    }
    geoQueixo.computeVertexNormals();
    malha(geoQueixo, M.rosto, mandibula, { y: -0.005, z: 0.025 });
    // Dobradiças e hastes de metal expostas nas laterais
    for (const lado of [-1, 1]) {
      malha(new THREE.CylinderGeometry(0.012, 0.012, 0.014, 6), M.metal, mandibula, { x: lado * 0.075, rz: Math.PI / 2 });
      barra(v3(lado * 0.074, 0, 0), v3(lado * 0.05, -0.045, 0.06), 0.004, M.ferrugem, mandibula);
    }
  }

  _bracos(peito) {
    const M = this.M;
    for (const lado of [-1, 1]) {
      // Ombreira grande e rasgada
      malha(cascaQuebrada(0.08, 1.3, lado > 0 ? 5 : 9, 0.45), M.placa, peito, { x: lado * 0.19, y: 0.285, rz: lado * -0.5, sx: 1.1, sy: 0.75 });

      const ombro = new THREE.Group();
      // Assimetria: o ombro esquerdo do robô (+x) caído
      ombro.position.set(lado * 0.2, lado > 0 ? 0.245 : 0.265, 0);
      // braço direito (+x) levemente aberto, puxado; o outro colado e para trás
      ombro.rotation.set(lado > 0 ? 0.12 : -0.06, 0, lado * (lado > 0 ? 0.14 : 0.04));
      peito.add(ombro);
      this.ombros.push({ grupo: ombro, lado, base: ombro.rotation.clone() });
      malha(new THREE.SphereGeometry(0.028, 6, 5), M.ferrugem, ombro);

      // Braço: haste de metal; a placa só existe de um lado (a outra caiu)
      barra(v3(0, 0, 0), v3(0, -0.36, 0), 0.016, M.metal, ombro);
      barra(v3(0, -0.02, -0.02), v3(0, -0.34, -0.018), 0.006, M.ferrugem, ombro);
      if (lado < 0) malha(placaQuebrada(0.036, 0.03, 0.26, -Math.PI / 2, Math.PI * 0.9, 2, 0.3), M.placa, ombro, { y: -0.16 });
      else malha(placaQuebrada(0.035, 0.032, 0.08, Math.PI / 2, Math.PI * 0.7, 4, 0.5), M.placa, ombro, { y: -0.3 });
      fio([v3(0, 0.02, -0.025), v3(lado * 0.012, -0.18, -0.035), v3(0, -0.36, -0.025)], 0.0028, M.fios[lado > 0 ? 0 : 1], ombro);

      // Cotovelo
      const cotovelo = new THREE.Group();
      cotovelo.position.y = -0.37;
      cotovelo.rotation.x = -0.1 - (lado > 0 ? 0.08 : 0);
      ombro.add(cotovelo);
      malha(new THREE.SphereGeometry(0.024, 6, 5), M.ferrugem, cotovelo);
      malha(new THREE.CylinderGeometry(0.008, 0.008, 0.06, 6), M.metal, cotovelo, { rz: Math.PI / 2 });

      // Antebraço: duas hastes + placa lascada
      barra(v3(0, 0, 0.01), v3(0, -0.31, 0.008), 0.009, M.metal, cotovelo);
      barra(v3(0, 0, -0.01), v3(0, -0.31, -0.008), 0.009, M.ferrugem, cotovelo);
      malha(placaQuebrada(0.028, 0.022, lado > 0 ? 0.2 : 0.12, lado * Math.PI / 2, Math.PI * 0.85, 6 + lado, 0.35), M.placa, cotovelo, { y: lado > 0 ? -0.12 : -0.2 });
      malha(new THREE.SphereGeometry(0.015, 6, 4), M.metal, cotovelo, { y: -0.32 });

      const mao = new THREE.Group();
      mao.position.y = -0.33;
      mao.rotation.set(0.05, lado * 0.15, lado * -0.06);
      cotovelo.add(mao);
      this._mao(mao, lado);
      this.maos.push({ grupo: mao, base: mao.rotation.clone(), espasmo: 0, proximo: 3 + this.r() * 6 });
      // Braço físico: pêndulo duplo com o comprimento real dos ossos
      this.bracos.push({
        ombro, cotovelo, mao, lado,
        baseCotovelo: cotovelo.rotation.clone(),
        fisica: new BracoPendular({ comprimentos: [0.37, 0.33] }),
      });
    }
  }

  // Mão comprida e articulada, com dedos tortos
  _mao(mao, lado) {
    const M = this.M;
    malha(new THREE.BoxGeometry(0.016, 0.075, 0.06), M.placa, mao, { y: -0.04 });
    malha(new THREE.BoxGeometry(0.02, 0.07, 0.05), M.metal, mao, { y: -0.04, x: -lado * 0.004 });
    for (let d = 0; d < 4; d++) {
      let p = v3(0, -0.08, -0.024 + d * 0.016);
      const abertura = (d - 1.5) * 0.06 + (this.r() - 0.5) * 0.08;
      let curva = 0;
      [0.048, 0.038, 0.03].forEach((comp, k) => {
        // cada dedo dobra de um jeito (tortos, como se emperrados)
        curva += 0.12 + this.r() * 0.35 + (d === 2 && k === 1 ? 0.5 : 0);
        const q = p.clone().add(v3(-lado * Math.sin(curva) * comp, -Math.cos(curva) * comp, Math.sin(abertura) * comp));
        barra(p, q, 0.0055, k === 2 ? M.ferrugem : M.metal, mao, 0.0045, 5);
        malha(new THREE.SphereGeometry(0.0065, 5, 4), M.ferrugem, mao, { x: p.x, y: p.y, z: p.z });
        p = q;
      });
    }
    // Polegar
    const p = v3(-lado * 0.006, -0.025, 0.034);
    const q = p.clone().add(v3(-lado * 0.02, -0.035, 0.02));
    barra(p, q, 0.006, M.metal, mao, 0.005, 5);
    barra(q, q.clone().add(v3(-lado * 0.015, -0.03, 0.006)), 0.005, M.ferrugem, mao, 0.004, 5);
  }

  // Base da pelve: onde as pernas foram removidas. Encaixes lacrados com
  // tampas parafusadas, estrutura de metal exposta e atuadores desligados.
  _basePelve(pelve) {
    const M = this.M;
    malha(new THREE.CylinderGeometry(0.1, 0.085, 0.05, 7), M.metal, pelve, { y: -0.06 });
    malha(new THREE.TorusGeometry(0.1, 0.01, 4, 7), M.ferrugem, pelve, { y: -0.04, rx: Math.PI / 2 });
    for (const lado of [-1, 1]) {
      // Encaixe do quadril lacrado
      const encaixe = new THREE.Group();
      encaixe.position.set(lado * 0.095, -0.075, 0);
      encaixe.rotation.z = lado * 0.35;
      pelve.add(encaixe);
      malha(new THREE.CylinderGeometry(0.036, 0.04, 0.03, 7), M.ferrugem, encaixe);
      malha(new THREE.CylinderGeometry(0.041, 0.041, 0.008, 7), M.metal, encaixe, { y: -0.018 });
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + 0.4;
        malha(new THREE.BoxGeometry(0.008, 0.008, 0.008), M.metal, encaixe, { x: Math.cos(a) * 0.03, y: -0.024, z: Math.sin(a) * 0.03 });
      }
    }
    // Atuador desligado e chicote de fios preso por baixo
    malha(new THREE.BoxGeometry(0.07, 0.05, 0.05), M.ferrugem, pelve, { x: 0.02, y: -0.1, z: -0.02, ry: 0.3 });
    barra(v3(-0.05, -0.05, 0.03), v3(-0.02, -0.12, 0.05), 0.006, M.metal, pelve);
  }

  // --- animação -------------------------------------------------------------

  atualizar(dt) {
    this.t += dt;
    const t = this.t;
    const a = this.atual;

    // Transição entre emoções
    for (const chave of ['mandibula', 'pitch', 'yaw', 'roll', 'tremor', 'curvar', 'respiracao', 'luz']) {
      a[chave] = suavizar(a[chave], this.emocao[chave], 3, dt);
    }
    this.fatorLuz = a.luz;

    // Para onde olhar
    let alvoYaw = 0, alvoPitch = 0;
    if (this.pensando) {
      alvoYaw = 0.3 * this.ladoOlhar; alvoPitch = -0.2;
    } else if (this.olhar === 'usuario') {
      [alvoYaw, alvoPitch] = this._olharParaCamera();
    } else if (this.olhar === 'baixo') {
      alvoPitch = 0.5;
    } else if (this.olhar === 'cima') {
      alvoPitch = -0.35;
    } else if (this.olhar === 'lado') {
      alvoYaw = 0.65 * this.ladoOlhar; alvoPitch = 0.08;
    }
    this.olharAtual.yaw = suavizar(this.olharAtual.yaw, alvoYaw, 4, dt);
    this.olharAtual.pitch = suavizar(this.olharAtual.pitch, alvoPitch, 4, dt);

    let yaw = this.olharAtual.yaw + a.yaw * (this.olhar === 'lado' ? 0 : 1);
    let pitch = this.olharAtual.pitch + a.pitch;
    let roll = a.roll;

    // Deriva lenta, quase imperceptível
    yaw += Math.sin(t * 0.37) * 0.02;
    pitch += Math.sin(t * 0.23 + 1) * 0.015;

    // Espasmo mecânico ocasional: a cabeça "pula" e volta
    const esp = this.espasmo;
    if (t > esp.proximo) {
      esp.yaw = (this.r() - 0.5) * 0.18;
      esp.pitch = (this.r() - 0.5) * 0.1;
      esp.proximo = t + 5 + this.r() * 9;
    }
    esp.yaw = suavizar(esp.yaw, 0, 2.5, dt);
    esp.pitch = suavizar(esp.pitch, 0, 2.5, dt);
    yaw += esp.yaw; pitch += esp.pitch;

    if (a.tremor > 0.001) {
      yaw += (this.r() - 0.5) * a.tremor;
      pitch += (this.r() - 0.5) * a.tremor;
    }

    // Gestos
    let estalo = 0;
    if (this.gesto) {
      const p = (t - this.gesto.inicio) / DURACAO_GESTO[this.gesto.tipo];
      if (p >= 1) {
        this.gesto = null;
      } else {
        const envelope = Math.sin(Math.PI * p);
        switch (this.gesto.tipo) {
          case 'inclinar_cabeca': roll += 0.42 * envelope * this.ladoOlhar; pitch += 0.06 * envelope; break;
          case 'acenar_cabeca': pitch += 0.18 * Math.sin(p * Math.PI * 4) * envelope; break;
          case 'negar_cabeca': yaw += 0.28 * Math.sin(p * Math.PI * 4.4) * envelope; break;
          // Sem pálpebras, "piscar" vira um estalo seco: a mandíbula bate e a cabeça dá um tranco
          case 'piscar': estalo = p < 0.25 ? Math.sin(p * Math.PI * 4) : 0; pitch += 0.05 * estalo; break;
        }
      }
    }

    yaw = limitar(yaw, -1.0, 1.0);
    pitch = limitar(pitch, -0.5, 0.7);
    this.pescoco.rotation.set(servo(pitch * 0.35), servo(yaw * 0.35), servo(roll * 0.3));
    this.cabeca.rotation.set(servo(pitch * 0.65), servo(yaw * 0.65), servo(roll * 0.7));

    // --- física: o tronco pendurado reage aos movimentos da cabeça ---
    // Torque de reação = -I_cabeça · α (conservação do momento angular).
    // Os ângulos são filtrados antes de derivar para não amplificar ruído.
    const reacao = this.reacao;
    const angulos = v3(pitch, yaw, roll);
    if (!reacao.anterior) reacao.anterior = angulos.clone();
    const filtrados = reacao.anterior.clone().lerp(angulos, 1 - Math.exp(-12 * dt));
    const velocidade = filtrados.clone().sub(reacao.anterior).divideScalar(Math.max(dt, 1e-3));
    const aceleracao = velocidade.clone().sub(reacao.velocidade).divideScalar(Math.max(dt, 1e-3));
    reacao.anterior.copy(filtrados);
    reacao.velocidade.copy(velocidade);
    // Inércia da cabeça (~3 kg) em relação ao pescoço, por eixo (kg·m²)
    this.torqueInterno.set(-0.05 * aceleracao.x, -0.03 * aceleracao.y, -0.05 * aceleracao.z).clampLength(0, 4);

    // De tempos em tempos ele tenta se soltar: os motores torcem o tronco
    // contra os cabos. Irritado, tenta com mais frequência.
    const luta = this.luta;
    if (t > luta.proximo) {
      luta.fim = t + 0.2 + this.r() * 0.15;
      luta.torque.set((this.r() - 0.5) * 3, (this.r() - 0.5) * 1.6, (this.r() - 0.5) * 3);
      luta.braco = 0.35;
      luta.proximo = t + (a.tremor > 0.005 ? 3 : 9) + this.r() * 8;
    }
    if (t < luta.fim) this.torqueInterno.add(luta.torque);
    luta.braco = suavizar(luta.braco, 0, 3, dt);
    this.contencao.passo(dt, this.torqueInterno);

    // Mandíbula: sempre entreaberta; ao falar, abre e fecha em degraus
    let abertura = a.mandibula;
    if (this.nivelVoz != null) abertura += limitar(this.nivelVoz * 3.2, 0, 0.36);
    else if (this.falando) abertura += 0.03 + 0.2 * hash1(Math.floor(t * 9));
    if (this.pensando) abertura = 0.06;
    abertura += 0.18 * estalo;
    this.mandibula.rotation.x = suavizar(this.mandibula.rotation.x, limitar(abertura, 0.04, 0.5), 25, dt);

    // "Zumbido" do motor e postura
    this.peito.position.y = 0.24 + Math.sin(t * a.respiracao * 2) * 0.0015;
    this.peito.rotation.x = a.curvar;
    for (const { grupo, lado, base: rot } of this.ombros) {
      // Durante o esforço os braços se afastam do corpo, em trancos
      // (esta pose é só o alvo dos motores; quem decide é a física abaixo)
      grupo.rotation.set(
        rot.x - a.curvar * 0.5 + Math.sin(t * 0.5 + lado) * 0.01 - servo(luta.braco * 0.4, 0.04),
        rot.y,
        rot.z - lado * a.curvar * 0.2 + lado * servo(luta.braco, 0.04),
      );
    }
    // Braços pendurados de verdade: gravidade, inércia e motores fracos
    this.suporte.updateMatrixWorld(true);
    for (const braco of this.bracos) this._simularBraco(braco, dt);
    // Espasmos nos dedos/mãos de vez em quando
    for (const mao of this.maos) {
      if (t > mao.proximo) { mao.espasmo = 0.25 + this.r() * 0.2; mao.proximo = t + 4 + this.r() * 8; }
      mao.espasmo = suavizar(mao.espasmo, 0, 5, dt);
      mao.grupo.rotation.x = mao.base.x + servo(mao.espasmo, 0.05);
    }
  }

  // Simula um braço e orienta os ossos pelo resultado. A pose animada
  // (ombro/cotovelo) é lida antes como alvo dos motores das juntas.
  _simularBraco(b, dt) {
    const { ombro, cotovelo, mao, lado } = b;
    cotovelo.rotation.copy(b.baseCotovelo);
    ombro.updateMatrixWorld(true);
    const pOmbro = ombro.getWorldPosition(new THREE.Vector3());
    const alvos = [cotovelo.getWorldPosition(new THREE.Vector3()), mao.getWorldPosition(new THREE.Vector3())];

    // Limite: o braço não atravessa o tronco (testado no referencial do tronco)
    const qTronco = this.suporte.quaternion, centro = this.suporte.position;
    const qInv = qTronco.clone().invert();
    const restringir = (p) => {
      const local = p.clone().sub(centro).applyQuaternion(qInv);
      if (local.y > -0.45 && local.y < 0.25 && lado * local.x < 0.17) {
        local.x = lado * 0.17;
        p.copy(local.applyQuaternion(qTronco).add(centro));
      }
    };
    const [p0, p1, p2] = b.fisica.passo(dt, pOmbro, alvos, restringir);

    // Cada grupo tem o osso ao longo de -Y: aponta -Y para o próximo ponto
    const qPai = ombro.parent.getWorldQuaternion(new THREE.Quaternion());
    const dirBraco = p1.clone().sub(p0).normalize().applyQuaternion(qPai.clone().invert());
    ombro.quaternion.setFromUnitVectors(BAIXO, dirBraco);
    const qOmbroInv = qPai.multiply(ombro.quaternion).invert();
    const dirAntebraco = p2.clone().sub(p1).normalize().applyQuaternion(qOmbroInv);
    // O cotovelo só dobra para frente
    if (dirAntebraco.z < 0) { dirAntebraco.z = 0; dirAntebraco.normalize(); }
    cotovelo.quaternion.setFromUnitVectors(BAIXO, dirAntebraco);
  }

  // Ângulos (yaw, pitch) para a cabeça encarar a câmera: ele segue você
  _olharParaCamera() {
    this.cabeca.getWorldPosition(this._tmp);
    this._tmp.y += 0.15;
    const d = new THREE.Vector3().subVectors(this.camera.position, this._tmp)
      .applyQuaternion(this.suporte.quaternion.clone().invert());
    const yaw = Math.atan2(d.x, d.z);
    const pitch = -Math.atan2(d.y, Math.hypot(d.x, d.z));
    return [limitar(yaw, -0.9, 0.9), limitar(pitch, -0.5, 0.6)];
  }
}
