"""Configuração do robô, lida do arquivo .env e das variáveis de ambiente."""

from __future__ import annotations

import os
from typing import Literal

from dotenv import load_dotenv
from pydantic import BaseModel, Field

Provedor = Literal["anthropic", "openai", "mock"]
TipoMemoria = Literal["sqlite", "sessao"]
# web = oficina 3D no navegador | terminal = só texto
Interface = Literal["web", "terminal"]

# Modelo usado quando LLM_MODEL não é definido no .env
MODELOS_PADRAO: dict[Provedor, str] = {
    "anthropic": "claude-sonnet-5-5",
    "openai": "gpt-4o-mini",
    "mock": "mock",
}


class Configuracao(BaseModel):
    provedor: Provedor = "anthropic"
    modelo: str = ""
    chave_api: str | None = None
    max_tokens: int = Field(default=400, gt=0)
    max_interacoes_memoria: int = Field(default=20, gt=0)
    tipo_memoria: TipoMemoria = "sqlite"
    arquivo_banco: str = "virt.db"
    max_tokens_contexto: int = Field(default=8000, gt=0)
    refletir_a_cada: int = Field(default=10, gt=0)
    max_fatos: int = Field(default=30, gt=0)
    arquivo_personalidade: str = "personality.md"
    nivel_log: str = "WARNING"
    interface: Interface = "web"
    porta_web: int = Field(default=8765, ge=0, le=65535)
    abrir_navegador: bool = True
    silencio_segundos: float = Field(default=60.0, ge=0)

    @classmethod
    def do_ambiente(cls) -> Configuracao:
        """Carrega o .env (se existir) e monta a configuração validada."""
        load_dotenv()
        provedor = os.getenv("LLM_PROVIDER", "anthropic").strip().lower()
        chaves = {"anthropic": "ANTHROPIC_API_KEY", "openai": "OPENAI_API_KEY"}
        return cls(
            provedor=provedor,  # type: ignore[arg-type]  # o Pydantic valida o valor
            modelo=os.getenv("LLM_MODEL") or MODELOS_PADRAO.get(provedor, ""),  # type: ignore[call-overload]
            chave_api=os.getenv(chaves.get(provedor, "")) or None,
            max_tokens=int(os.getenv("LLM_MAX_TOKENS", "400")),
            max_interacoes_memoria=int(os.getenv("MEMORY_MAX_INTERACTIONS", "20")),
            tipo_memoria=os.getenv("MEMORY_BACKEND", "sqlite").strip().lower(),  # type: ignore[arg-type]
            arquivo_banco=os.getenv("MEMORY_DB_PATH", "virt.db"),
            max_tokens_contexto=int(os.getenv("CONTEXT_MAX_TOKENS", "8000")),
            refletir_a_cada=int(os.getenv("FACTS_REFLECT_EVERY", "10")),
            max_fatos=int(os.getenv("FACTS_MAX", "30")),
            arquivo_personalidade=os.getenv("PERSONALITY_FILE", "personality.md"),
            nivel_log=os.getenv("LOG_LEVEL", "WARNING").upper(),
            interface=os.getenv("INTERFACE", "web").strip().lower(),  # type: ignore[arg-type]
            porta_web=int(os.getenv("WEB_PORT", "8765")),
            abrir_navegador=os.getenv("WEB_OPEN_BROWSER", "true").strip().lower() in {"1", "true", "sim", "yes"},
            silencio_segundos=float(os.getenv("SILENCE_SECONDS", "60")),
        )

    def chave_api_obrigatoria(self) -> str:
        """Retorna a chave de API ou explica qual variável falta no .env."""
        if not self.chave_api:
            variavel = "ANTHROPIC_API_KEY" if self.provedor == "anthropic" else "OPENAI_API_KEY"
            raise RuntimeError(
                f"Defina {variavel} no arquivo .env (ou use LLM_PROVIDER=mock para testar offline)."
            )
        return self.chave_api
