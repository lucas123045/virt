# virt — cérebro de um robô animatrônico

Primeira etapa: o virt conversa **por texto no terminal**. A arquitetura já
está separada em módulos para, depois, receber voz, memória persistente,
câmera e um corpo físico (servos via Arduino) **sem mexer no cérebro**.

## Arquitetura

```
 entrada        ┌────────────┐  Evento   ┌─────────┐  Intencao  ┌────────────┐
 (texto/voz/ ──▶│ perception │──────────▶│  brain  │───────────▶│ expression │──▶ terminal /
  câmera)       └────────────┘           └────┬────┘            └────────────┘    tela / servos
                                              │ buscar_contexto / salvar
                                         ┌────▼────┐
                                         │ memory  │
                                         └─────────┘
```

O loop em `main.py` é: **percepção → cérebro → memória → expressão**.

Os módulos só conversam por dois objetos padronizados (em `core/`):

| Contrato   | Formato |
|------------|---------|
| `Evento`   | `{"tipo": "fala" \| "rosto_detectado" \| "silencio", "conteudo": ..., "timestamp": ...}` |
| `Intencao` | `{"fala": str, "emocao": "neutro" \| "feliz" \| "curioso" \| "desconfiado" \| "irritado" \| "triste", "olhar": "usuario" \| "baixo" \| "lado" \| "cima", "gesto": "nenhum" \| "inclinar_cabeca" \| "acenar_cabeca" \| "negar_cabeca" \| "piscar"}` |

### Estrutura de pastas

```
virt/
├── main.py                 # monta as peças e roda o loop
├── config.py               # lê o .env (provedor, modelo, chaves, limites)
├── personality.md          # personalidade do robô (editável, sem código)
├── .env.example
├── requirements.txt
├── core/                   # contratos compartilhados
│   ├── evento.py           #   Evento
│   └── intencao.py         #   Intencao + RESPOSTA_PADRAO
├── perception/
│   ├── base.py             # Percepcao (abstrata): perceber() -> Evento | None
│   └── texto_terminal.py   # TextoTerminal: input() -> Evento
├── brain/
│   ├── cerebro.py          # Cerebro.pensar(evento) -> Intencao (validação + retry)
│   ├── prompt.py           # prompt de sistema (personalidade + fatos) e eventos
│   ├── reflexao.py         # resume conversas em fatos duráveis
│   ├── json_util.py        # extrai o JSON da resposta do LLM
│   ├── llm.py              # ProvedorLLM: AnthropicLLM, OpenAILLM, LLMFalso
│   └── personalidade.py    # carrega personality.md
├── memory/
│   ├── base.py             # Memoria (abstrata): salvar/buscar_contexto + fatos
│   ├── sessao.py           # MemoriaSessao: tudo em RAM
│   └── sqlite.py           # MemoriaSQLite: histórico e fatos persistentes (padrão)
├── expression/
│   ├── base.py             # Corpo (abstrata): executar(intencao); CorpoComposto
│   └── terminal.py         # TerminalBody: imprime fala + emoção/olhar/gesto
└── tests/
    ├── test_cerebro.py
    ├── test_fatos.py
    └── test_memoria_sqlite.py
```

### Como o cérebro garante o JSON

1. Monta o prompt: `personality.md` + regras de formato (as opções válidas
   são geradas a partir dos `Literal` do Pydantic, então nunca desatualizam).
2. Envia o histórico da memória como pares `user` (evento) / `assistant`
   (intenção em JSON) e, por fim, o evento atual.
3. Valida a resposta com `Intencao` (Pydantic). Tolera blocos ```` ```json ````
   e texto em volta do objeto.
4. Se for inválida, **tenta de novo uma vez**, mostrando ao modelo o erro.
5. Se falhar de novo (ou a API cair), usa `RESPOSTA_PADRAO`. O corpo sempre
   recebe uma intenção válida.

## Como rodar

Requer Python 3.11+.

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate   |   Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env   # Windows: copy .env.example .env
# edite o .env: LLM_PROVIDER=anthropic ou openai, e a chave correspondente

python main.py
```

No terminal:

- digite normalmente para falar com o virt;
- **linha vazia** simula silêncio;
- `/rosto Lucas` simula a câmera detectando um rosto;
- `/sair` (ou Ctrl+C) encerra.

Para testar sem chave de API: `LLM_PROVIDER=mock` no `.env`.

### Oficina virtual (navegador)

Por padrão (`INTERFACE=web`) o `main.py` abre `http://127.0.0.1:8765`, onde o
virt aparece em 3D numa oficina abandonada, e o chat acontece no navegador.
Com `INTERFACE=terminal` volta o modo só texto.

O visual imita um jogo de terror de PS2 gravado em fita VHS: geometria
low-poly facetada, texturas pequenas geradas em código, render em ~480 linhas,
sombras duras, 15 bits de cor com dithering, granulação e distorções de fita.
O virt tem órbitas negras e vazias, nenhum dente e uma mandíbula mecânica.
Ele não tem pernas: fica suspenso por seis cabos grossos que sustentam seu peso
com física real e balança de leve quando mexe a cabeça ou tenta se soltar.

| Arquivo (`web/static/`) | O que controla |
|---|---|
| `virt3d.js` | modelo do robô, proporções, materiais e animações por emoção/olhar/gesto |
| `contencao.js` | cabos que prendem o virt (sem pernas, suspenso), suportes, fios soltos |
| `fisica.js` | física: corpo rígido (Newton-Euler), cabos elásticos (Hooke) e cordas (Verlet) |
| `voz.js` | voz de animatrônico: toca o WAV do servidor com efeitos (fita lenta, alto-falante velho, eco) e move a mandíbula pelo volume; reserva com a voz do navegador |
| `texturas.js` | texturas procedurais (pele encardida, ferrugem, metal, concreto) |
| `oficina.js` | cenário, luzes e névoa |
| `ps2.js` / `vhs.js` | filtros de tela |
| `app.js` | renderizador, câmera, chat, legenda e voz |

A voz é gerada localmente pelo sintetizador do Windows (voz "Daniel", em `expression/sintetizador.py` + `voz_windows.ps1`), sem internet nem instalação extra. Ligue no botão "voz".

Parâmetros de URL úteis: `?linhas=720` (mais nítido), `?vhs=0` (sem filtro VHS),
`?camera=rosto|busto|corpo|perto`, `?offline&emocao=irritado&gesto=piscar`
(testa uma pose sem o cérebro).

### Memória

Por padrão (`MEMORY_BACKEND=sqlite`) tudo fica salvo em `virt.db` e o virt
lembra das conversas entre sessões. São duas camadas:

1. **Histórico recente**: as últimas `MEMORY_MAX_INTERACTIONS` interações vão
   para o LLM como conversa. Se passarem de `CONTEXT_MAX_TOKENS` (estimativa),
   as mais antigas são cortadas automaticamente, então o contexto nunca estoura.
2. **Fatos**: a cada `FACTS_REFLECT_EVERY` interações, e ao sair com `/sair`
   ou Ctrl+C, o cérebro "reflete" e resume a conversa em fatos curtos
   ("O Lucas tem um gato chamado Bolacha"), até `FACTS_MAX`. Os fatos ficam
   sempre no prompt de sistema, então coisas antigas não se perdem quando
   saem da janela do histórico. Cada reflexão é uma chamada extra ao LLM.

- Para o virt esquecer tudo: apague o arquivo `virt.db`.
- Para uma memória só da sessão atual: `MEMORY_BACKEND=sessao`.

Testes: `pytest`

## Próximas etapas (onde encaixar cada coisa)

| Recurso | O que criar | Onde plugar |
|---|---|---|
| Voz (entrada) | `perception/voz.py` com `Percepcao` que faz STT (ex.: Whisper) | `main.py`: trocar `TextoTerminal` |
| Voz (saída) | um `Corpo` que faz TTS da `fala` | `CorpoComposto(TerminalBody(), CorpoVoz())` |
| Câmera | `perception/camera.py` emitindo `rosto_detectado` | combinar fontes com uma fila/threads |
| Memória por relevância | `memory/vetorial.py` (embeddings) implementando `Memoria` | `criar_memoria()` em `main.py` |
| Rosto na tela | `expression/screen_face.py` → `ScreenFaceBody` | `main.py` |
| Servos | `expression/servo.py` → `ServoBody` (serial para o Arduino) | `main.py` |

Novos tipos de evento (ex.: `"toque"`): adicionar em `core/evento.py`
(`TipoEvento`) e descrever em `brain/prompt.py`. Novas emoções/gestos:
adicionar em `core/intencao.py` e mapear em cada `Corpo`.
