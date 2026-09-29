// Filtro de fita VHS gasta:
//   - linhas tremendo na horizontal (fita esticada)
//   - faixa de "tracking" rolando devagar pela tela
//   - ruído de troca de cabeça na base do quadro
//   - cor vazando: croma borrado e desalinhado em relação ao brilho
//   - riscos brancos de dropout e trancos de glitch ocasionais
//   - pretos lavados e cores dessaturadas
// Os efeitos são sutis o bastante para manter o personagem legível.
import * as THREE from 'three';

export const EfeitoVHS = {
  uniforms: {
    tDiffuse: { value: null },
    tempo: { value: 0 },
    resolucao: { value: new THREE.Vector2(640, 480) },
    intensidade: { value: 1.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float tempo;
    uniform vec2 resolucao;
    uniform float intensidade;
    varying vec2 vUv;

    float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

    vec3 paraYIQ(vec3 c) {
      return vec3(dot(c, vec3(0.299, 0.587, 0.114)),
                  dot(c, vec3(0.596, -0.274, -0.322)),
                  dot(c, vec3(0.211, -0.523, 0.312)));
    }
    vec3 paraRGB(vec3 y) {
      return vec3(y.x + 0.956 * y.y + 0.621 * y.z,
                  y.x - 0.272 * y.y - 0.647 * y.z,
                  y.x - 1.106 * y.y + 1.703 * y.z);
    }

    void main() {
      vec2 uv = vUv;
      float linha = floor(uv.y * resolucao.y);
      float quadro = floor(tempo * 30.0);

      // Glitch ocasional: por uma fração de segundo, tudo treme mais
      float glitch = step(0.94, hash(vec2(floor(tempo * 3.0), 7.0)));

      // Tremor horizontal por linha (fita esticada) + ondulação lenta
      float tremor = (hash(vec2(linha, quadro)) - 0.5) * 0.0016 * (1.0 + glitch * 5.0);
      tremor += sin(uv.y * 30.0 + tempo * 2.0) * 0.0006;

      // Faixa de tracking rolando para baixo
      float posFaixa = 1.0 - fract(tempo * 0.045);
      float faixa = smoothstep(0.035, 0.0, abs(uv.y - posFaixa));
      tremor += faixa * (hash(vec2(linha, quadro + 3.0)) - 0.5) * 0.02;

      // Ruído de troca de cabeça nos últimos 3% do quadro
      float base = smoothstep(0.03, 0.0, uv.y);
      tremor += base * (0.012 + hash(vec2(linha, quadro)) * 0.02);

      uv.x += tremor * intensidade;

      // Brilho nítido, cor borrada e deslocada para a direita (vazamento de croma)
      float Y = paraYIQ(texture2D(tDiffuse, uv).rgb).x;
      vec2 croma = vec2(0.0);
      for (int i = -3; i <= 3; i++) {
        vec2 desloc = vec2(float(i) * 0.0022 + 0.003, 0.0);
        croma += paraYIQ(texture2D(tDiffuse, uv - desloc).rgb).yz;
      }
      croma /= 7.0;
      vec3 cor = paraRGB(vec3(Y, croma * 0.8));

      // Pretos lavados e leve tom frio de fita velha
      cor = cor * 0.94 + vec3(0.025, 0.028, 0.035);

      // Faixa de tracking: mais clara e com chuvisco
      cor += faixa * (hash(vec2(uv.x * resolucao.x, linha + quadro)) * 0.25 - 0.05) * intensidade;

      // Base do quadro com chuvisco
      cor = mix(cor, vec3(hash(vec2(uv.x * 91.0, quadro + linha))), base * 0.35 * intensidade);

      // Dropouts: riscos brancos curtos e raros
      float dropout = step(0.9985, hash(vec2(linha * 0.7, quadro)))
                    * step(0.5, hash(vec2(floor(uv.x * 12.0), linha + quadro)));
      cor = mix(cor, vec3(0.85), dropout * 0.8 * intensidade);

      gl_FragColor = vec4(clamp(cor, 0.0, 1.0), 1.0);
    }
  `,
};
