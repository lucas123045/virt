"""Evento: a unidade padronizada que sai da percepção.

Formato serializado:
    {"tipo": "fala" | "rosto_detectado" | "silencio", "conteudo": ..., "timestamp": ...}
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

# Tipos de evento conhecidos. Novos sentidos (ex.: "toque", "som_alto")
# devem ser adicionados aqui e tratados em brain/prompt.py.
TipoEvento = Literal["fala", "rosto_detectado", "silencio"]


class Evento(BaseModel):
    """Algo que o robô percebeu no mundo."""

    tipo: TipoEvento
    # Conteúdo livre: texto da fala, nome/ID do rosto, duração do silêncio etc.
    conteudo: Any = None
    timestamp: datetime = Field(default_factory=datetime.now)

    def para_dict(self) -> dict[str, Any]:
        """Retorna o evento no formato de dicionário padronizado (JSON-friendly)."""
        return self.model_dump(mode="json")
