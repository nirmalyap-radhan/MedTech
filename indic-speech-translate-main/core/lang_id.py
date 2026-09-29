"""
core/lang_id.py
----------------
Language identification / classification step used to route input to the
correct STT or TTS backend when the caller doesn't already know the
language.

Two identifiers are wrapped, matching the two kinds of input the system
receives:

  * TextLanguageIdentifier  -> classifies typed text (used before TTS)
  * AudioLanguageIdentifier -> classifies spoken audio (used before STT)

Both are lazy-loaded (the underlying HF pipeline is only constructed the
first time `.predict()` is called) and both return a normalized language
"key" that matches the keys in core.config.LANGUAGES, so the rest of the
pipeline never has to deal with raw model-specific label strings.
"""

from __future__ import annotations

import logging
from typing import Optional

from .config import LANGUAGES, LID_AUDIO_MODEL_ID, LID_TEXT_MODEL_ID

logger = logging.getLogger(__name__)

# Maps the label strings returned by the underlying HF models to our
# internal language keys (core.config.LANGUAGES keys). Extend this if you
# swap in a different LID model with different label conventions.
_ISO1_TO_KEY = {profile.iso1: key for key, profile in LANGUAGES.items()}
_ISO3_TO_KEY = {profile.iso3: key for key, profile in LANGUAGES.items()}


def _normalize_label(raw_label: str) -> Optional[str]:
    """Map a raw model label (which may be an iso1/iso3 code or a code with
    extra decoration like 'hin_Deva' or '__label__hi') to our internal key.
    """
    label = raw_label.lower().strip()
    label = label.replace("__label__", "")
    # strip script suffixes such as "hin_deva" -> "hin"
    core = label.split("_")[0]
    if core in _ISO3_TO_KEY:
        return _ISO3_TO_KEY[core]
    if core in _ISO1_TO_KEY:
        return _ISO1_TO_KEY[core]
    return None


class TextLanguageIdentifier:
    """Classifies the language of a piece of text. Used to route a TTS
    request when the caller supplies text but not a language.

    NOTE: ai4bharat/IndicLID is distributed as custom Python code on GitHub
    (https://github.com/AI4Bharat/IndicLID) rather than as a standard
    `transformers`-loadable checkpoint, so it cannot be loaded via
    `transformers.pipeline(...)`. This class instead uses Meta's
    facebook/fasttext-language-identification model (the NLLB "lid218e"
    checkpoint), which IS hosted on the Hugging Face Hub and covers 217
    languages -- including every language in core.config.LANGUAGES --
    via the `fasttext` library. Labels look like '__label__hin_Deva',
    which `_normalize_label` already knows how to parse.
    """

    def __init__(self, model_id: str = LID_TEXT_MODEL_ID, device: Optional[str] = None):
        self.model_id = model_id
        self.device = device  # unused (fasttext is CPU-only/tiny), kept for interface parity
        self._model = None

    def _load(self):
        if self._model is None:
            import fasttext
            from huggingface_hub import hf_hub_download

            logger.info("Loading text language-id model: %s", self.model_id)
            model_path = hf_hub_download(repo_id=self.model_id, filename="model.bin")
            self._model = fasttext.load_model(model_path)
        return self._model

    def predict(self, text: str) -> str:
        """Return the internal language key (e.g. 'hindi') best matching text."""
        model = self._load()
        # fasttext chokes on embedded newlines; a single line of text is expected.
        clean_text = " ".join(text.strip().splitlines()) or text
        labels, _scores = model.predict(clean_text, k=1)
        raw_label = labels[0]
        key = _normalize_label(raw_label)
        if key is None:
            raise ValueError(
                f"Language-id model returned unrecognized label '{raw_label}'. "
                "Update core/lang_id.py's label-mapping if you changed models."
            )
        return key


class AudioLanguageIdentifier:
    """Classifies the language of an audio clip. Used to route an STT
    request when the caller supplies audio but not a language."""

    def __init__(self, model_id: str = LID_AUDIO_MODEL_ID, device: Optional[str] = None):
        self.model_id = model_id
        self.device = device
        self._pipe = None

    def _load(self):
        if self._pipe is None:
            from transformers import pipeline
            logger.info("Loading audio language-id model: %s", self.model_id)
            self._pipe = pipeline(
                "audio-classification",
                model=self.model_id,
                device=self.device,
            )
        return self._pipe

    def predict(self, audio) -> str:
        """
        audio: path to a wav/flac file, or a dict {"array": np.ndarray,
        "sampling_rate": int} as accepted by HF audio-classification
        pipelines.
        """
        pipe = self._load()
        result = pipe(audio, top_k=1)
        raw_label = result[0]["label"] if isinstance(result, list) else result["label"]
        key = _normalize_label(raw_label)
        if key is None:
            raise ValueError(
                f"Audio language-id model returned unrecognized label '{raw_label}'. "
                "Update core/lang_id.py's label-mapping if you changed models."
            )
        return key
