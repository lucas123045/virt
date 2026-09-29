// Filtro de tela no estilo PS2 / TV de tubo:
//   - cores reduzidas para 15 bits (5 por canal) com dithering ordenado 4x4
//   - granulação animada
//   - entrelaçamento leve (linhas alternadas mais escuras)
//   - leve dessaturação e vinheta escura nas bordas
import * as THREE from 'three';

export const EfeitoPS2 = {
  uniforms: {
    tDiffuse: { value: null },
    tempo: { value: 0 },
    resolucao: { value: new THREE.Vector2(640, 448) },
    granulacao: { value: 0.07 },
    vinheta: { value: 1.15 },
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
    uniform float granulacao;
    uniform float vinheta;
    varying vec2 vUv;

    float ruido(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    // Matriz de Bayer 4x4 para o dithering
    float bayer(vec2 p) {
      int x = int(mod(p.x, 4.0));
      int y = int(mod(p.y, 4.0));
      int i = x + y * 4;
      float m[16] = float[16](0.0, 8.0, 2.0, 10.0, 12.0, 4.0, 14.0, 6.0,
                              3.0, 11.0, 1.0, 9.0, 15.0, 7.0, 13.0, 5.0);
      return m[i] / 16.0 - 0.5;
    }

    void main() {
      vec2 pixel = floor(vUv * resolucao);
      vec3 cor = texture2D(tDiffuse, vUv).rgb;

      // leve dessaturação e tom amarronzado de fita velha
      float luma = dot(cor, vec3(0.299, 0.587, 0.114));
      cor = mix(cor, vec3(luma) * vec3(1.03, 1.0, 0.94), 0.22);

      // granulação
      cor += (ruido(pixel + fract(tempo * 7.0) * 100.0) - 0.5) * granulacao;

      // entrelaçamento
      cor *= 0.94 + 0.06 * mod(pixel.y + floor(tempo * 30.0), 2.0);

      // vinheta
      vec2 c = vUv - 0.5;
      cor *= clamp(1.0 - dot(c, c) * vinheta * 1.6, 0.0, 1.0);

      // 15 bits de cor (32 níveis por canal) com dithering
      cor += bayer(pixel) / 32.0;
      cor = floor(cor * 31.0 + 0.5) / 31.0;

      gl_FragColor = vec4(clamp(cor, 0.0, 1.0), 1.0);
    }
  `,
};
