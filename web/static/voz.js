// Voz do virt: animatrônico velho, grave e cansado (estilo FNAF).
//
// Caminho principal: o servidor gera a fala com a voz do Windows (Daniel,
// lenta e grave, com pausas) e o navegador toca o WAV por uma cadeia de
// efeitos Web Audio: fita desacelerada e oscilando, "arrastadas" de motor,
// alto-falante velho saturado, eco de salão vazio e chiado. A mandíbula
// abre conforme o volume real da voz.
//
// Reserva (sem áudio do servidor): a síntese de fala do navegador, abaixo.
//
// A síntese de fala do navegador (speechSynthesis) só permite escolher a voz
// e ajustar tom, velocidade e volume; o som dela não passa pelo Web Audio,
// então não dá para distorcê-lo. Por isso a sensação de máquina vem de:
//   1. voz masculina pt-BR com o tom no mínimo que ainda soa claro;
//   2. fala picotada em trechos, com pausas e hesitações, e o tom variando
//      levemente a cada trecho (como um mecanismo falhando);
//   3. uma camada sonora sintetizada por baixo (Web Audio): zumbido grave de
//      motor, estática e um estalo de relé ao começar e terminar de falar.

// Vozes masculinas pt-BR conhecidas, em ordem de preferência
// (Antonio = voz neural do Edge; Daniel = voz local do Windows)
const PREFERIDAS = [/antonio/i, /daniel/i, /thiago|ricardo|felipe|julio/i];
const FEMININAS = /maria|francisca|luciana|heloisa|leila|google/i;

const esperar = (ms) => new Promise((ok) => setTimeout(ok, ms));
const variar = (base, amplitude) => base + (Math.random() - 0.5) * 2 * amplitude;

// Divide a fala em trechos curtos com a pausa que vem depois de cada um
function dividir(texto) {
  const trechos = [];
  const frases = texto.match(/[^.!?…;:]+[.!?…;:]*/g) ?? [texto];
  for (const frase of frases) {
    const partes = frase.split(/,\s*/).map((p) => p.trim()).filter(Boolean);
    partes.forEach((parte, i) => {
      const fimDeFrase = i === partes.length - 1;
      const palavras = parte.split(/\s+/);
      // Hesitação: trechos longos às vezes "travam" no meio, como se custasse falar
      if (palavras.length > 7 && Math.random() < 0.45) {
        const corte = Math.floor(palavras.length * variar(0.5, 0.15));
        trechos.push({ texto: palavras.slice(0, corte).join(' '), pausa: variar(320, 90) });
        trechos.push({ texto: palavras.slice(corte).join(' '), pausa: fimDeFrase ? variar(850, 200) : variar(380, 100) });
      } else {
        trechos.push({ texto: parte, pausa: fimDeFrase ? variar(850, 200) : variar(380, 100) });
      }
    });
  }
  if (trechos.length) trechos[trechos.length - 1].pausa = 0;
  return trechos;
}

export class VozVirt {
  // aoFalar(true/false) avisa o corpo 3D para mexer a mandíbula
  constructor({ aoFalar, aoNivel = () => {} }) {
    this.aoFalar = aoFalar;
    this.aoNivel = aoNivel;  // volume da voz (0..1) ou null, para a mandíbula
    this.fonteAtual = null;
    this.geracao = 0;        // invalida falas antigas quando uma nova começa
    this.audio = null;       // contexto Web Audio (criado após um clique)
    this.textura = null;
    this.voz = null;
    if (this.disponivel) {
      const atualizar = () => { this.voz = this._escolherVoz(); };
      atualizar();
      speechSynthesis.addEventListener?.('voiceschanged', atualizar);
    }
  }

  get disponivel() { return 'speechSynthesis' in window; }

  // Prefere uma voz masculina pt-BR; se não houver, qualquer pt-BR; se nem
  // isso, qualquer português. null = voz padrão do sistema.
  _escolherVoz() {
    const vozes = speechSynthesis.getVoices()
      .filter((v) => v.lang?.replace('_', '-').toLowerCase().startsWith('pt'));
    for (const nome of PREFERIDAS) {
      const encontrada = vozes.find((v) => nome.test(v.name));
      if (encontrada) return encontrada;
    }
    const brasileiras = vozes.filter((v) => v.lang.replace('_', '-') === 'pt-BR');
    return brasileiras.find((v) => !FEMININAS.test(v.name)) ?? brasileiras[0] ?? vozes[0] ?? null;
  }

  // Nome da voz em uso (para mostrar na interface)
  get nomeVoz() { return this.voz?.name ?? 'voz padrão do sistema'; }

  // Precisa ser chamado a partir de um clique (regra dos navegadores para áudio)
  ativarAudio() {
    try {
      this.audio ??= new AudioContext();
      this.audio.resume();
    } catch { this.audio = null; }
  }

  // Fala o texto. Retorna a duração estimada em segundos (para a legenda).
  falar(texto) {
    this.cancelar();
    const geracao = ++this.geracao;
    const trechos = dividir(texto);
    this._sequencia(trechos, geracao);
    const caracteres = trechos.reduce((soma, t) => soma + t.texto.length, 0);
    return caracteres / 11 + trechos.reduce((soma, t) => soma + t.pausa, 0) / 1000;
  }

  cancelar() {
    this.geracao++;
    if (this.disponivel) speechSynthesis.cancel();
    try { this.fonteAtual?.stop(); } catch { /* já parou */ }
    this.fonteAtual = null;
    this.aoNivel(null);
    this._pararTextura();
    this.aoFalar(false);
  }

  async _sequencia(trechos, geracao) {
    this._iniciarTextura();
    for (const trecho of trechos) {
      if (geracao !== this.geracao) return;
      await this._dizer(trecho.texto);
      if (geracao !== this.geracao) return;
      if (trecho.pausa) await esperar(trecho.pausa);
    }
    if (geracao === this.geracao) this._pararTextura();
  }

  _dizer(texto) {
    return new Promise((pronto) => {
      const fala = new SpeechSynthesisUtterance(texto);
      fala.lang = 'pt-BR';
      if (this.voz) fala.voice = this.voz;
      // Voz feminina como reserva? Tom no mínimo para compensar.
      const reserva = !this.voz || FEMININAS.test(this.voz.name);
      fala.pitch = reserva ? variar(0.08, 0.04) : variar(0.3, 0.06);
      fala.rate = variar(0.8, 0.04);
      let terminou = false;
      const fim = () => {
        if (terminou) return;
        terminou = true;
        this.aoFalar(false);
        pronto();
      };
      fala.onstart = () => this.aoFalar(true);
      fala.onend = fim;
      fala.onerror = fim;
      // Alguns navegadores às vezes não disparam onend: não travar a sequência
      setTimeout(fim, 2500 + texto.length * 140);
      speechSynthesis.speak(fala);
    });
  }

  // --- voz de animatrônico a partir do WAV do servidor ----------------------

  // Retorna a duração em segundos, ou null se não deu para tocar
  // (áudio não liberado, erro de rede...) para o app usar a reserva.
  async falarAudio(url) {
    if (!this.audio) return null;
    this.cancelar();
    const geracao = ++this.geracao;
    try {
      const resposta = await fetch(url);
      if (!resposta.ok) return null;
      const buffer = await this.audio.decodeAudioData(await resposta.arrayBuffer());
      if (geracao !== this.geracao) return 0;
      return this._tocarAnimatronico(buffer, geracao);
    } catch {
      return null;
    }
  }

  _tocarAnimatronico(buffer, geracao) {
    const ctx = this.audio;
    const inicio = ctx.currentTime + 0.05;
    const VELOCIDADE = 0.9; // fita um pouco lenta: mais grave e cansada (menor = mais lento)
    const duracao = buffer.duration / VELOCIDADE;

    const fonte = ctx.createBufferSource();
    fonte.buffer = buffer;
    const taxa = fonte.playbackRate;
    taxa.setValueAtTime(VELOCIDADE, inicio);
    // "Arrastadas": o motor da fita perde força por um instante
    for (let t = 0.7; t < duracao - 0.8; t += 1.4 + Math.random() * 2.2) {
      if (Math.random() < 0.6) {
        const t0 = inicio + t;
        taxa.setValueAtTime(VELOCIDADE, t0);
        taxa.linearRampToValueAtTime(VELOCIDADE * 0.9, t0 + 0.12);
        taxa.linearRampToValueAtTime(VELOCIDADE, t0 + 0.4);
      }
    }
    // No fim da frase a voz "desce", como um animatrônico desligando
    taxa.setValueAtTime(VELOCIDADE, inicio + Math.max(0, duracao - 0.5));
    taxa.linearRampToValueAtTime(VELOCIDADE * 0.86, inicio + duracao);
    // Oscilação lenta de fita gasta (wow)
    const wow = ctx.createOscillator();
    wow.frequency.value = 0.55;
    const profundidade = ctx.createGain();
    profundidade.gain.value = 22; // cents
    wow.connect(profundidade).connect(fonte.detune);

    // Alto-falante velho: corta graves extremos e agudos, realça a média
    const passaAlta = ctx.createBiquadFilter();
    passaAlta.type = 'highpass';
    passaAlta.frequency.value = 85;
    const presenca = ctx.createBiquadFilter();
    presenca.type = 'peaking';
    presenca.frequency.value = 1000;
    presenca.Q.value = 1;
    presenca.gain.value = 4;
    const saturacao = ctx.createWaveShaper();
    saturacao.curve = curvaSaturacao(7);
    saturacao.oversample = '2x';
    const passaBaixa = ctx.createBiquadFilter();
    passaBaixa.type = 'lowpass';
    passaBaixa.frequency.value = 3300;

    // Eco de salão vazio
    const eco = ctx.createConvolver();
    eco.buffer = respostaSala(ctx, 1.8);
    const molhado = ctx.createGain();
    molhado.gain.value = 0.28;
    const seco = ctx.createGain();
    seco.gain.value = 0.9;

    const analisador = ctx.createAnalyser();
    analisador.fftSize = 512;
    const saida = ctx.createGain();
    saida.gain.value = 1.15;

    fonte.connect(passaAlta).connect(presenca).connect(saturacao).connect(passaBaixa);
    passaBaixa.connect(seco).connect(analisador);
    passaBaixa.connect(eco).connect(molhado).connect(analisador);
    analisador.connect(saida).connect(ctx.destination);

    this._iniciarTextura();
    this.aoFalar(true);
    fonte.start(inicio);
    wow.start(inicio);
    this.fonteAtual = fonte;

    // Mandíbula acompanhando o volume (RMS) da voz
    const amostras = new Float32Array(analisador.fftSize);
    const medir = () => {
      if (geracao !== this.geracao) return;
      analisador.getFloatTimeDomainData(amostras);
      let soma = 0;
      for (const a of amostras) soma += a * a;
      this.aoNivel(Math.sqrt(soma / amostras.length));
      requestAnimationFrame(medir);
    };
    requestAnimationFrame(medir);

    fonte.onended = () => {
      wow.stop();
      if (geracao !== this.geracao) return;
      this.fonteAtual = null;
      this.aoNivel(null);
      this.aoFalar(false);
      this._pararTextura();
    };
    return duracao;
  }

  // --- camada sonora de máquina (Web Audio) ---------------------------------

  _iniciarTextura() {
    const ctx = this.audio;
    if (!ctx || this.textura) return;
    const agora = ctx.currentTime;
    const saida = ctx.createGain();
    saida.gain.setValueAtTime(0, agora);
    saida.gain.linearRampToValueAtTime(1, agora + 0.25);
    saida.connect(ctx.destination);

    // Zumbido grave de motor: duas ondas dente-de-serra desafinadas + filtro
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'lowpass';
    filtro.frequency.value = 160;
    const volumeMotor = ctx.createGain();
    volumeMotor.gain.value = 0.045;
    filtro.connect(volumeMotor).connect(saida);
    const osciladores = [46, 46.9].map((freq) => {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.value = freq;
      osc.connect(filtro);
      osc.start();
      return osc;
    });

    // Estática crepitando
    const ruido = ctx.createBufferSource();
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const dados = buffer.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = Math.random() * 2 - 1;
    ruido.buffer = buffer;
    ruido.loop = true;
    const banda = ctx.createBiquadFilter();
    banda.type = 'bandpass';
    banda.frequency.value = 2200;
    banda.Q.value = 0.8;
    const volumeEstatica = ctx.createGain();
    volumeEstatica.gain.value = 0.004;
    ruido.connect(banda).connect(volumeEstatica).connect(saida);
    ruido.start();
    // Crepitação irregular
    const crepitar = setInterval(() => {
      const pico = Math.random() < 0.12 ? 0.03 : 0.003 + Math.random() * 0.006;
      volumeEstatica.gain.setTargetAtTime(pico, ctx.currentTime, 0.01);
    }, 60);

    this._estalo();
    this.textura = { saida, osciladores, ruido, crepitar };
  }

  _pararTextura() {
    const ctx = this.audio, tex = this.textura;
    if (!ctx || !tex) return;
    this.textura = null;
    this._estalo();
    const agora = ctx.currentTime;
    tex.saida.gain.cancelScheduledValues(agora);
    tex.saida.gain.setValueAtTime(tex.saida.gain.value, agora);
    tex.saida.gain.linearRampToValueAtTime(0, agora + 0.4);
    clearInterval(tex.crepitar);
    setTimeout(() => {
      tex.osciladores.forEach((o) => o.stop());
      tex.ruido.stop();
      tex.saida.disconnect();
    }, 500);
  }

  // Estalo curto de relé
  _estalo() {
    const ctx = this.audio;
    if (!ctx) return;
    const duracao = 0.03;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * duracao), ctx.sampleRate);
    const dados = buffer.getChannelData(0);
    for (let i = 0; i < dados.length; i++) dados[i] = (Math.random() * 2 - 1) * (1 - i / dados.length) ** 3;
    const fonte = ctx.createBufferSource();
    fonte.buffer = buffer;
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'highpass';
    filtro.frequency.value = 900;
    const volume = ctx.createGain();
    volume.gain.value = 0.18;
    fonte.connect(filtro).connect(volume).connect(ctx.destination);
    fonte.start();
  }
}

// Saturação suave (alto-falante estourando de leve)
function curvaSaturacao(k) {
  const n = 1024, curva = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curva[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return curva;
}

// Resposta de impulso sintética: um salão grande, vazio e abafado
function respostaSala(ctx, segundos) {
  const tamanho = Math.floor(ctx.sampleRate * segundos);
  const impulso = ctx.createBuffer(2, tamanho, ctx.sampleRate);
  for (let canal = 0; canal < 2; canal++) {
    const dados = impulso.getChannelData(canal);
    let anterior = 0;
    for (let i = 0; i < tamanho; i++) {
      // ruído filtrado (abafado) com queda exponencial
      anterior = anterior * 0.7 + (Math.random() * 2 - 1) * 0.3;
      dados[i] = anterior * (1 - i / tamanho) ** 3.2;
    }
  }
  return impulso;
}
