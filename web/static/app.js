// Liga a oficina 3D ao cérebro em Python:
//   navegador --POST /entrada--> servidor --Evento--> cérebro
//   cérebro --Intencao--> servidor --SSE /eventos--> navegador (anima o virt)
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { criarOficina } from './oficina.js';
import { EfeitoPS2 } from './ps2.js';
import { EfeitoVHS } from './vhs.js';
import { Virt3D } from './virt3d.js';
import { VozVirt } from './voz.js';

const $ = (sel) => document.querySelector(sel);
const parametros = new URLSearchParams(location.search);

// ---------------------------------------------------------------------------
// Cena: renderizada em baixa resolução (~480 linhas, como a saída de um PS2)
// e ampliada pelo navegador, sem antialiasing, com sombras duras
// ---------------------------------------------------------------------------
// ?linhas=720 aumenta a nitidez (padrão: 480 linhas, como um PS2)
const LINHAS = Number(parametros.get('linhas')) || 480;
const proporcaoPixel = () => Math.min(1, LINHAS / innerHeight);

const renderer = new THREE.WebGLRenderer({ canvas: $('#cena'), antialias: false });
renderer.setPixelRatio(proporcaoPixel());
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.BasicShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const cena = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 60);

const controles = new OrbitControls(camera, renderer.domElement);
controles.enableDamping = true;
controles.enablePan = false;
controles.minDistance = 0.6;
controles.maxDistance = 8;
controles.maxPolarAngle = Math.PI * 0.52;

const oficina = criarOficina(cena);
const virt = new Virt3D(cena, camera);

// Pós-processamento: primeiro a fita VHS (tremor, tracking, cor vazando),
// depois o PS2 (granulação, 15 bits com dithering, entrelaçamento, vinheta).
// ?vhs=0 desliga o filtro VHS.
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(cena, camera));
composer.addPass(new OutputPass());
const efeitoVHS = new ShaderPass(EfeitoVHS);
efeitoVHS.enabled = parametros.get('vhs') !== '0';
composer.addPass(efeitoVHS);
const efeitoPS2 = new ShaderPass(EfeitoPS2);
composer.addPass(efeitoPS2);
function ajustarTamanho() {
  renderer.setPixelRatio(proporcaoPixel());
  renderer.setSize(innerWidth, innerHeight);
  composer.setPixelRatio(proporcaoPixel());
  composer.setSize(innerWidth, innerHeight);
  efeitoPS2.uniforms.resolucao.value.set(innerWidth * proporcaoPixel(), innerHeight * proporcaoPixel());
  efeitoVHS.uniforms.resolucao.value.copy(efeitoPS2.uniforms.resolucao.value);
}
ajustarTamanho();

// Enquadramentos prontos
const VISTAS = {
  rosto: { posicao: [0.12, 1.98, 1.0], alvo: [0, 1.93, 0] },
  busto: { posicao: [0.35, 1.78, 2.4], alvo: [0, 1.62, 0] },
  // Corpo inteiro: de baixo, mostrando o vão até o chão e os cabos subindo
  corpo: { posicao: [1.1, 1.25, 5.2], alvo: [0, 1.55, 0] },
};
let transicao = null;

function irPara(nome, imediato = false) {
  const vista = VISTAS[nome];
  if (!vista) return;
  document.querySelectorAll('[data-camera]').forEach((b) => b.classList.toggle('ativo', b.dataset.camera === nome));
  const destino = { posicao: new THREE.Vector3(...vista.posicao), alvo: new THREE.Vector3(...vista.alvo) };
  if (imediato) {
    camera.position.copy(destino.posicao);
    controles.target.copy(destino.alvo);
    transicao = null;
  } else {
    transicao = destino;
  }
}
// Se a pessoa arrastar a câmera, cancela a transição automática
controles.addEventListener('start', () => {
  transicao = null;
  document.querySelectorAll('[data-camera]').forEach((b) => b.classList.remove('ativo'));
});
document.querySelectorAll('[data-camera]').forEach((b) => b.addEventListener('click', () => irPara(b.dataset.camera)));
irPara(parametros.get('camera') ?? 'busto', true);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  ajustarTamanho();
});

const relogio = new THREE.Clock();
let primeiroQuadro = true;
renderer.setAnimationLoop(() => {
  const dt = Math.min(relogio.getDelta(), 0.05);
  const t = relogio.elapsedTime;
  if (transicao) {
    const k = 1 - Math.exp(-3 * dt);
    camera.position.lerp(transicao.posicao, k);
    controles.target.lerp(transicao.alvo, k);
    if (camera.position.distanceTo(transicao.posicao) < 0.005) transicao = null;
  }
  virt.atualizar(dt);
  oficina.atualizar(dt, t, virt.fatorLuz);
  controles.update();
  efeitoPS2.uniforms.tempo.value = t;
  efeitoVHS.uniforms.tempo.value = t;
  composer.render();
  if (primeiroQuadro) {
    primeiroQuadro = false;
    $('#carregando').classList.add('pronto');
  }
});

// ---------------------------------------------------------------------------
// Conversa
// ---------------------------------------------------------------------------
const OLHARES = { usuario: 'olhando para você', baixo: 'olhando para baixo', lado: 'olhando de lado', cima: 'olhando para cima' };
const GESTOS = { nenhum: '', inclinar_cabeca: 'inclina a cabeça', acenar_cabeca: 'acena com a cabeça', negar_cabeca: 'balança a cabeça', piscar: 'pisca devagar' };

function adicionarMensagem(tipo, texto) {
  const li = document.createElement('li');
  li.className = tipo;
  if (tipo === 'virt') {
    const nome = document.createElement('b');
    nome.textContent = 'virt';
    li.append(nome);
  }
  li.append(texto);
  const lista = $('#mensagens');
  lista.append(li);
  while (lista.children.length > 60) lista.firstChild.remove();
  lista.scrollTop = lista.scrollHeight;
}

function mostrarEstado(texto, pensando = false) {
  $('#estado').textContent = texto;
  $('#estado').classList.toggle('pensando', pensando);
}

// Legenda com efeito de máquina de escrever
let temporizadorLegenda = null;
function mostrarLegenda(texto, duracao) {
  const legenda = $('#legenda');
  clearInterval(temporizadorLegenda);
  legenda.textContent = '';
  legenda.classList.add('visivel');
  let i = 0;
  const passo = Math.max(15, (duracao * 1000 * 0.8) / Math.max(texto.length, 1));
  temporizadorLegenda = setInterval(() => {
    legenda.textContent = texto.slice(0, ++i);
    if (i >= texto.length) {
      clearInterval(temporizadorLegenda);
      temporizadorLegenda = setTimeout(() => legenda.classList.remove('visivel'), 3500);
    }
  }, passo);
}

// Voz (opcional): grave, lenta e com textura de máquina (ver voz.js)
const voz = new VozVirt({
  aoFalar: (falando) => virt.definirFalaTTS(falando),
  aoNivel: (nivel) => virt.definirNivelVoz(nivel),
});
let vozLigada = false;
try { vozLigada = localStorage.getItem('virt-voz') === '1'; } catch { /* sem armazenamento */ }
function atualizarBotaoVoz() {
  $('#voz').textContent = `voz: ${vozLigada ? 'on' : 'off'}`;
  $('#voz').classList.toggle('ativo', vozLigada);
  $('#voz').title = vozLigada ? `usando: ${voz.nomeVoz}` : 'o virt fala em voz alta';
}
atualizarBotaoVoz();
$('#voz').addEventListener('click', () => {
  vozLigada = !vozLigada;
  try { localStorage.setItem('virt-voz', vozLigada ? '1' : '0'); } catch { /* ignora */ }
  if (vozLigada) voz.ativarAudio();
  else voz.cancelar();
  atualizarBotaoVoz();
});
// O áudio só pode começar depois de uma interação: aproveita o primeiro envio
$('#formulario').addEventListener('submit', () => { if (vozLigada) voz.ativarAudio(); });

async function falar(texto, audio) {
  let duracao = Math.max(1.2, texto.length / 14);
  // Voz de animatrônico (WAV gerado no servidor + efeitos)
  if (vozLigada && audio) {
    const d = await voz.falarAudio(audio);
    if (d !== null) {
      if (d > 0) mostrarLegenda(texto, d);
      return;
    }
  }
  // Reserva: voz do navegador
  if (vozLigada && voz.disponivel) {
    duracao = voz.falar(texto);
  } else {
    virt.falar(duracao);
  }
  mostrarLegenda(texto, duracao);
}

function receberIntencao(intencao) {
  virt.aplicarIntencao(intencao);
  const partes = [intencao.emocao, OLHARES[intencao.olhar], GESTOS[intencao.gesto]].filter(Boolean);
  mostrarEstado(partes.join(' · '));
  if (intencao.fala) {
    adicionarMensagem('virt', intencao.fala);
    falar(intencao.fala, intencao.audio);
  }
}

// Conexão em tempo real com o cérebro
function conectar() {
  const fonte = new EventSource('/eventos');
  fonte.onopen = () => $('#conexao').classList.add('online');
  fonte.onerror = () => {
    $('#conexao').classList.remove('online');
    mostrarEstado('sem conexão com o cérebro (o main.py está rodando?)');
  };
  fonte.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.tipo === 'entrada') {
      adicionarMensagem('voce', msg.texto);
      virt.pensar(true);
      mostrarEstado('pensando…', true);
    } else if (msg.tipo === 'intencao') {
      receberIntencao(msg);
    }
  };
}

$('#formulario').addEventListener('submit', async (e) => {
  e.preventDefault();
  const campo = $('#entrada');
  const texto = campo.value.trim();
  if (!texto) return;
  campo.value = '';
  try {
    await fetch('/entrada', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ texto }) });
  } catch {
    adicionarMensagem('sistema', 'não consegui falar com o cérebro');
  }
});

// Modo demonstração: ?emocao=feliz&olhar=lado&gesto=piscar&fala=... (sem cérebro)
if (parametros.has('emocao')) {
  setTimeout(() => receberIntencao({
    emocao: parametros.get('emocao'),
    olhar: parametros.get('olhar') ?? 'usuario',
    gesto: parametros.get('gesto') ?? 'nenhum',
    fala: parametros.get('fala') ?? '',
  }), 300);
}
if (!parametros.has('offline')) conectar();
adicionarMensagem('sistema', 'arraste para girar a câmera · role para aproximar');

// Enquadramento extra para inspecionar o rosto bem de perto (?camera=perto)
VISTAS.perto = { posicao: [0.0, 1.95, 0.45], alvo: [0, 1.94, 0] };
if (parametros.get('camera') === 'perto') irPara('perto', true);
