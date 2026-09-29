// Texturas geradas em código (canvas), no estilo PS2: pequenas (64–128 px),
// manchadas e borradas quando ampliadas. Nenhum arquivo de imagem.
import * as THREE from 'three';

// Gerador pseudoaleatório com semente: a textura sai igual toda vez
export function aleatorio(semente = 1) {
  let s = semente % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function texturaCanvas(largura, altura, desenhar, repeticao = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  desenhar(canvas.getContext('2d'), largura, altura);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeticao, repeticao);
  // Filtro bilinear simples, sem anisotropia: borrado como num console antigo
  tex.anisotropy = 1;
  return tex;
}

// Ruído "manchado": pixels aleatórios numa grade pequena, ampliados com
// suavização. Várias camadas dão o aspecto encardido e mosqueado da referência.
function ruidoManchado(g, largura, altura, r, celulas, cores, alfa) {
  const tmp = document.createElement('canvas');
  tmp.width = celulas;
  tmp.height = Math.max(1, Math.round((celulas * altura) / largura));
  const t = tmp.getContext('2d');
  for (let y = 0; y < tmp.height; y++) {
    for (let x = 0; x < tmp.width; x++) {
      const cor = cores[Math.floor(r() * cores.length)];
      t.fillStyle = `rgba(${cor},${(r() * alfa).toFixed(3)})`;
      t.fillRect(x, y, 1, 1);
    }
  }
  g.imageSmoothingEnabled = true;
  g.drawImage(tmp, 0, 0, largura, altura);
}

function rachaduras(g, largura, altura, r, quantidade, cor) {
  g.strokeStyle = cor;
  g.lineWidth = 1;
  for (let i = 0; i < quantidade; i++) {
    let x = r() * largura, y = r() * altura;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 5; k++) {
      x += (r() - 0.5) * 14;
      y += (r() - 0.3) * 10;
      g.lineTo(x, y);
    }
    g.stroke();
  }
}

// Pele/porcelana de marfim sujo, acinzentada, mosqueada e rachada
export function texturaPele(semente = 7) {
  return texturaCanvas(128, 128, (g, w, h) => {
    const r = aleatorio(semente);
    g.fillStyle = '#a79f8e';
    g.fillRect(0, 0, w, h);
    ruidoManchado(g, w, h, r, 8, ['190,182,166', '120,112,98'], 0.7);
    ruidoManchado(g, w, h, r, 24, ['60,52,44', '95,80,62', '200,192,176'], 0.55);
    ruidoManchado(g, w, h, r, 64, ['40,34,28', '150,140,122'], 0.35);
    // encardido escorrendo para baixo
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, 'rgba(40,32,24,0)');
    grad.addColorStop(1, 'rgba(40,32,24,0.35)');
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    rachaduras(g, w, h, r, 9, 'rgba(25,20,16,0.7)');
  });
}

// Rosto: igual à pele, com olheiras avermelhadas e manchas mais escuras
export function texturaRosto(semente = 13) {
  return texturaCanvas(128, 128, (g, w, h) => {
    const r = aleatorio(semente);
    g.fillStyle = '#b3ab99';
    g.fillRect(0, 0, w, h);
    ruidoManchado(g, w, h, r, 10, ['205,198,184', '130,122,108'], 0.6);
    ruidoManchado(g, w, h, r, 32, ['70,58,48', '110,70,60', '210,204,190'], 0.45);
    rachaduras(g, w, h, r, 6, 'rgba(30,22,18,0.6)');
  });
}

// Metal escuro, riscado e oxidado
export function texturaMetal(semente = 3) {
  return texturaCanvas(64, 64, (g, w, h) => {
    const r = aleatorio(semente);
    g.fillStyle = '#35312d';
    g.fillRect(0, 0, w, h);
    ruidoManchado(g, w, h, r, 16, ['20,18,16', '80,72,64', '90,55,30'], 0.6);
    g.strokeStyle = 'rgba(120,110,100,0.35)';
    for (let i = 0; i < 12; i++) {
      const x = r() * w, y = r() * h;
      g.beginPath(); g.moveTo(x, y); g.lineTo(x + (r() - 0.5) * 20, y + (r() - 0.5) * 4); g.stroke();
    }
  });
}

// Ferrugem marrom-alaranjada com manchas pretas
export function texturaFerrugem(semente = 5) {
  return texturaCanvas(64, 64, (g, w, h) => {
    const r = aleatorio(semente);
    g.fillStyle = '#4a2e1c';
    g.fillRect(0, 0, w, h);
    ruidoManchado(g, w, h, r, 12, ['110,60,28', '30,20,14', '80,45,22'], 0.8);
    ruidoManchado(g, w, h, r, 40, ['140,80,40', '15,10,8'], 0.5);
  });
}

// Chão de concreto sujo, com manchas de óleo
export function texturaConcreto() {
  return texturaCanvas(128, 128, (g, w, h) => {
    const r = aleatorio(3);
    g.fillStyle = '#26221f';
    g.fillRect(0, 0, w, h);
    ruidoManchado(g, w, h, r, 16, ['50,45,40', '12,10,9'], 0.7);
    ruidoManchado(g, w, h, r, 64, ['60,55,50', '8,7,6'], 0.4);
    g.strokeStyle = 'rgba(8,6,5,0.9)';
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(w / 2, 0); g.lineTo(w / 2, h); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke();
  }, 8);
}

// Parede de concreto/placas manchadas de umidade
export function texturaParede() {
  return texturaCanvas(128, 128, (g, w, h) => {
    const r = aleatorio(8);
    g.fillStyle = '#1f1c19';
    g.fillRect(0, 0, w, h);
    ruidoManchado(g, w, h, r, 8, ['40,36,32', '10,9,8'], 0.8);
    ruidoManchado(g, w, h, r, 32, ['50,44,36', '14,12,10'], 0.4);
    // escorridos verticais de umidade
    for (let i = 0; i < 20; i++) {
      g.fillStyle = `rgba(8,7,6,${0.2 + r() * 0.3})`;
      g.fillRect(r() * w, r() * h * 0.5, 1 + r() * 2, 20 + r() * 60);
    }
    g.fillStyle = 'rgba(0,0,0,0.6)';
    g.fillRect(0, 0, w, 1);
    g.fillRect(0, 0, 1, h);
  }, 3);
}

// Madeira escura e gasta (bancada, caixotes)
export function texturaMadeira(semente = 5, tom = [58, 40, 28]) {
  return texturaCanvas(64, 64, (g, w, h) => {
    const r = aleatorio(semente);
    for (let t = 0; t < 4; t++) {
      const v = 0.75 + r() * 0.35;
      g.fillStyle = `rgb(${tom[0] * v | 0},${tom[1] * v | 0},${tom[2] * v | 0})`;
      g.fillRect((t * w) / 4, 0, w / 4, h);
      g.fillStyle = 'rgba(8,5,3,0.9)';
      g.fillRect((t * w) / 4, 0, 1, h);
    }
    ruidoManchado(g, w, h, r, 16, ['20,12,8', '90,64,44'], 0.4);
  });
}
