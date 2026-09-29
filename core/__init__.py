"""Contratos compartilhados entre os módulos do robô.

Tudo que trafega entre percepção, cérebro, memória e expressão passa por
estes objetos padronizados. Nenhum módulo conhece a implementação do outro,
apenas estes contratos.
"""

from core.evento import Evento, TipoEvento
from core.intencao import Emocao, Gesto, Intencao, Olhar

__all__ = ["Evento", "TipoEvento", "Intencao", "Emocao", "Olhar", "Gesto"]
