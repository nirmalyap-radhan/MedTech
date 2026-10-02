"""
Modular STT/TTS core for Indo-Dravidian languages.

Public entry point for external applications:

    from core.pipeline import SpeechPipeline
"""

from .pipeline import SpeechPipeline  # noqa: F401
from .config import list_languages  # noqa: F401
