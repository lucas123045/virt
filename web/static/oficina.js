// A oficina abandonada onde o virt fica: concreto manchado, estantes de ferro
// com tralhas, bancada, cabos pendurados, uma lâmpada que falha e muita escuridão.
// Iluminação simples e sombras duras, como num jogo de PS2.
import * as THREE from 'three';
import { aleatorio, texturaConcreto, texturaFerrugem, texturaMadeira, texturaMetal, texturaParede, texturaPele } from './texturas.js';

const FUNDO = 0x050404;

function caixa(l, a, p, mat, pai, x, y, z, ry = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(l, a, p), mat);
  m.position.set(x, y, z);
  m.rotation.y = ry;
  m.castShadow = m.receiveShadow = true;
  pai.add(m);
  return m;
}

export function criarOficina(cena) {
  const r = aleatorio(11);
  cena.background = new THREE.Color(FUNDO);
  // Névoa densa: o fundo some no escuro (e esconde o "fim do mundo", como no PS2)
  cena.fog = new THREE.FogExp2(FUNDO, 0.11);

  const oficina = new THREE.Group();
  cena.add(oficina);

  // --- materiais (Lambert facetado, texturas pequenas) ---
  const lambert = (opcoes) => new THREE.MeshLambertMaterial({ flatShading: true, ...opcoes });
  const concreto = lambert({ map: texturaConcreto() });
  const parede = lambert({ map: texturaParede() });
  const madeira = lambert({ map: texturaMadeira(9, [60, 42, 30]) });
  const ferro = lambert({ map: texturaMetal(31) });
  const ferrugem = lambert({ map: texturaFerrugem(37) });
  const pele = lambert({ map: texturaPele(19) });
  const vidro = lambert({ color: 0x2a3326, transparent: true, opacity: 0.6 });
  const cabo = lambert({ color: 0x141110 });

  // --- chão e paredes ---
  const chao = new THREE.Mesh(new THREE.PlaneGeometry(40, 40), concreto);
  chao.rotation.x = -Math.PI / 2;
  chao.receiveShadow = true;
  oficina.add(chao);

  const fundo = new THREE.Mesh(new THREE.PlaneGeometry(14, 6), parede);
  fundo.position.set(0, 3, -3.6);
  fundo.receiveShadow = true;
  oficina.add(fundo);
  const esquerda = new THREE.Mesh(new THREE.PlaneGeometry(10, 6), parede);
  esquerda.position.set(-4.5, 3, 0.5);
  esquerda.rotation.y = Math.PI / 2;
  esquerda.receiveShadow = true;
  oficina.add(esquerda);
  for (const x of [-3, 0, 3]) caixa(0.2, 6, 0.2, ferro, oficina, x, 3, -3.5);

  // --- estante de cantoneira de ferro com caixas e peças (fundo à esquerda) ---
  const estante = new THREE.Group();
  estante.position.set(-2.3, 0, -3.0);
  estante.rotation.y = 0.15;
  oficina.add(estante);
  for (const x of [-0.9, 0.9]) for (const z of [-0.2, 0.2]) caixa(0.04, 2.4, 0.04, ferro, estante, x, 1.2, z);
  for (let i = 0; i < 5; i++) {
    const y = 0.2 + i * 0.52;
    caixa(1.84, 0.03, 0.44, ferro, estante, 0, y, 0);
    let x = -0.8;
    while (x < 0.75) {
      const tipo = r();
      if (tipo < 0.5) {
        const l = 0.15 + r() * 0.25, a = 0.1 + r() * 0.25;
        caixa(l, a, 0.2 + r() * 0.15, r() < 0.5 ? ferrugem : madeira, estante, x + l / 2, y + 0.015 + a / 2, (r() - 0.5) * 0.1, (r() - 0.5) * 0.3);
        x += l + 0.04;
      } else if (tipo < 0.7) {
        const pote = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.14, 6), vidro);
        pote.position.set(x + 0.05, y + 0.085, 0);
        estante.add(pote);
        x += 0.12;
      } else if (tipo < 0.82) {
        // Rosto reserva, sem olhos, largado na prateleira
        const cabeca = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), pele);
        cabeca.scale.set(0.8, 1.1, 0.9);
        cabeca.position.set(x + 0.1, y + 0.1, 0);
        cabeca.rotation.set(0.9, r() * 2, 0.5);
        cabeca.castShadow = true;
        estante.add(cabeca);
        x += 0.22;
      } else {
        const eng = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.018, 4, 8), ferrugem);
        eng.rotation.x = Math.PI / 2;
        eng.position.set(x + 0.07, y + 0.035, 0);
        estante.add(eng);
        x += 0.16;
      }
    }
  }

  // --- bancada de ferro (direita) com uma caixa de ferramentas ---
  const bancada = new THREE.Group();
  bancada.position.set(2.3, 0, -1.8);
  bancada.rotation.y = -0.5;
  oficina.add(bancada);
  caixa(2.0, 0.06, 0.8, madeira, bancada, 0, 0.92, 0);
  for (const [x, z] of [[-0.9, -0.34], [0.9, -0.34], [-0.9, 0.34], [0.9, 0.34]]) caixa(0.05, 0.9, 0.05, ferro, bancada, x, 0.45, z);
  caixa(1.9, 0.03, 0.7, ferro, bancada, 0, 0.25, 0);
  caixa(0.45, 0.25, 0.25, ferrugem, bancada, 0.5, 1.07, -0.1, 0.15);
  caixa(0.2, 0.2, 0.2, ferrugem, bancada, -0.4, 0.37, 0.05, 0.5);
  // Um braço reserva em cima da bancada
  const braco = new THREE.Group();
  braco.position.set(-0.3, 0.98, 0.1);
  braco.rotation.set(0, 0.6, Math.PI / 2);
  bancada.add(braco);
  const osso = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.6, 6), ferro);
  osso.castShadow = true;
  braco.add(osso);

  // --- cabos no chão e cabos pendurados do teto ---
  const caixaEnergia = caixa(0.4, 0.5, 0.25, ferro, oficina, -1.3, 0.25, -1.4, 0.4);
  const luzCaixa = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.01), new THREE.MeshBasicMaterial({ color: 0xff2010 }));
  luzCaixa.position.set(0.1, 0.12, 0.13);
  caixaEnergia.add(luzCaixa);
  const tubo = (pontos, raio) => {
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pontos), 24, raio, 4), cabo);
    m.castShadow = m.receiveShadow = true;
    oficina.add(m);
  };
  for (let i = 0; i < 3; i++) {
    tubo([
      new THREE.Vector3(-0.05 + i * 0.05, 0.012, -0.06),
      new THREE.Vector3(-0.35 + i * 0.1, 0.012, -0.6 + r() * 0.2),
      new THREE.Vector3(-0.9 + i * 0.06, 0.012, -0.9 - r() * 0.2),
      new THREE.Vector3(-1.2 + i * 0.05, 0.1, -1.3),
    ], 0.012);
  }
  for (let i = 0; i < 6; i++) {
    const x = 1.6 + r() * 1.4, z = -2.4 + r() * 1.2;
    tubo([new THREE.Vector3(x, 3.6, z), new THREE.Vector3(x + (r() - 0.5) * 0.3, 1.2 + r() * 1.2, z + 0.1), new THREE.Vector3(x + 0.3, 3.6, z - 0.2)], 0.01);
  }

  // --- luzes: poucas e duras ---
  cena.add(new THREE.HemisphereLight(0x4a4238, 0x080606, 0.55));

  // Lâmpada pendurada que falha
  const lampada = new THREE.Group();
  lampada.position.set(-1.1, 2.9, 0.5);
  oficina.add(lampada);
  const fioLampada = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 1.2, 4), ferro);
  fioLampada.position.y = 0.6;
  lampada.add(fioLampada);
  const cupula = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.16, 8, 1, true), lambert({ color: 0x1e1b18, side: THREE.DoubleSide }));
  lampada.add(cupula);
  const bulbo = new THREE.Mesh(new THREE.SphereGeometry(0.045, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffd08a }));
  bulbo.position.y = -0.07;
  lampada.add(bulbo);
  const luzLampada = new THREE.PointLight(0xffa860, 12, 9, 1.6);
  luzLampada.position.y = -0.12;
  luzLampada.castShadow = true;
  luzLampada.shadow.mapSize.set(512, 512);
  luzLampada.shadow.bias = -0.004;
  lampada.add(luzLampada);

  // Luz principal: de cima e de lado, deixando parte do rosto no escuro
  const principal = new THREE.SpotLight(0xffe0b8, 70, 11, 0.45, 0.3, 1.4);
  principal.position.set(-1.3, 3.8, 1.6);
  principal.target.position.set(0, 1.55, 0);
  principal.castShadow = true;
  principal.shadow.mapSize.set(512, 512);
  principal.shadow.bias = -0.002;
  cena.add(principal, principal.target);

  // Contraluz fria e fraca, só para a silhueta não se perder no fundo
  const contraluz = new THREE.DirectionalLight(0x5a6a88, 1.2);
  contraluz.position.set(1.5, 2.5, -3);
  cena.add(contraluz);

  // Preenchimento mínimo da frente (o olho bom precisa de um reflexo)
  const preenchimento = new THREE.PointLight(0xd8c8b0, 2.2, 5, 1.4);
  preenchimento.position.set(0.4, 1.9, 2.0);
  cena.add(preenchimento);

  // --- poeira no ar ---
  const nParticulas = 250;
  const posicoes = new Float32Array(nParticulas * 3);
  for (let i = 0; i < nParticulas; i++) {
    posicoes[i * 3] = (r() - 0.5) * 5;
    posicoes[i * 3 + 1] = r() * 3.2;
    posicoes[i * 3 + 2] = (r() - 0.5) * 4;
  }
  const geoPoeira = new THREE.BufferGeometry();
  geoPoeira.setAttribute('position', new THREE.BufferAttribute(posicoes, 3));
  const poeira = new THREE.Points(geoPoeira, new THREE.PointsMaterial({
    color: 0xcfc0a0, size: 0.01, transparent: true, opacity: 0.35, depthWrite: false,
  }));
  cena.add(poeira);

  const base = { lampada: luzLampada.intensity, principal: principal.intensity };
  const corBulbo = new THREE.Color(0xffd08a);
  let piscarLampada = 0;

  return {
    // fatorLuz vem da emoção do virt (triste = oficina mais escura)
    atualizar(dt, t, fatorLuz = 1) {
      // A lâmpada falha de vez em quando (apaga e acende em trancos)
      if (piscarLampada <= 0 && Math.random() < dt * 0.1) piscarLampada = 0.2 + Math.random() * 0.5;
      let falha = 1;
      if (piscarLampada > 0) {
        piscarLampada -= dt;
        falha = Math.random() < 0.55 ? 0.1 : 1;
      }
      luzLampada.intensity = base.lampada * falha * fatorLuz;
      bulbo.material.color.copy(corBulbo).multiplyScalar(0.3 + 0.7 * falha);
      // A luz principal também treme levemente quando a lâmpada falha
      principal.intensity = base.principal * fatorLuz * (falha < 1 ? 0.85 : 1);
      lampada.rotation.z = Math.sin(t * 0.4) * 0.03;

      const p = geoPoeira.attributes.position.array;
      for (let i = 0; i < nParticulas; i++) {
        p[i * 3] += Math.sin(t * 0.3 + i) * 0.0004;
        p[i * 3 + 1] += dt * 0.01 * (0.3 + (i % 7) * 0.1);
        if (p[i * 3 + 1] > 3.2) p[i * 3 + 1] = 0;
      }
      geoPoeira.attributes.position.needsUpdate = true;
      luzCaixa.visible = Math.floor(t * 1.5) % 2 === 0;
    },
  };
}
