"""
core/tts.py
------------
Modular Text-to-Speech engine.

Public surface (this is what an external application should import):

    from core.tts import TextToSpeech
    tts = TextToSpeech()
    wav, sr = tts.synthesize("വണക്കം", language="malayalam")  # explicit
    wav, sr = tts.synthesize("വണക്കം")                          # auto-detect

Backend strategy
------------------
Two HF backends sit behind one interface:

  1. facebook/mms-tts-<iso3> -- the default.
     One small VITS checkpoint per language (~145MB each), covering all
     1100+ MMS languages, which includes every language in
     core.config.LANGUAGES. Crucially it is **ungated**: it downloads
     anonymously with no access request and no token, so the system works
     out of the box. This is why it is the default rather than the
     fallback.

  2. ai4bharat/indic-parler-tts -- OPT-IN QUALITY UPGRADE.
     Noticeably more natural voices, and supports natural-language style
     prompts ("a warm female voice speaking slowly"). BUT it is a **gated
     repo**: you must request access at
     https://huggingface.co/ai4bharat/indic-parler-tts and be approved,
     then log in with a token, or loading it raises GatedRepoError (403).
     It also requires the extra `parler_tts` package.

     Because of that, it is only attempted when `prefer_parler=True` is
     passed AND the language is one indic-parler-tts officially supports.
     If it fails for ANY reason (not approved yet, no token, package
     missing, download error), this class logs a warning and transparently
     falls back to the MMS checkpoint, so synthesis still succeeds.

Each backend/language combination is lazy-loaded and cached. If no
`language` is passed, the TextLanguageIdentifier from core.lang_id detects
it from the input text first.
"""

from __future__ import annotations

import logging
from typing import Optional

import numpy as np

from .config import TTSBackend, TTS_MODEL_IDS, get_profile
from .lang_id import TextLanguageIdentifier
from .text_utils import chunk_text as _chunk_text

logger = logging.getLogger(__name__)

DEFAULT_SPEAKER_DESCRIPTION = (
    "A clear, natural-sounding narrator speaks at a moderate pace "
    "in a calm and pleasant tone."
)

# MMS-TTS (VITS) generates the whole utterance in one forward pass, so a
# long passage produces a huge activation tensor -- slow at best, an OOM
# at worst, and often degraded audio toward the end. Splitting into
# sentence-sized chunks (via core.text_utils.chunk_text, shared with
# core.translation) and concatenating the waveforms avoids all three.


class TextToSpeech:
    def __init__(self, device: Optional[str] = None, prefer_parler: bool = False):
        """
        device: e.g. "cuda:0", "cpu", or None to auto-select.
        prefer_parler: if True, try the higher-quality (but gated)
            ai4bharat/indic-parler-tts first for languages it supports,
            falling back to the ungated MMS checkpoint automatically if it
            isn't accessible. Defaults to False so the system works with
            zero setup.
        """
        self.device = device
        self.prefer_parler = prefer_parler
        self._parler_model = None
        self._parler_tokenizer = None
        self._parler_desc_tokenizer = None
        self._mms_models: dict[str, tuple] = {}  # iso3 -> (model, tokenizer)
        self._lang_id = TextLanguageIdentifier(device=device)

    # -- internal: device resolution ------------------------------------
    def _resolve_device(self):
        if self.device:
            return self.device
        import torch
        return "cuda" if torch.cuda.is_available() else "cpu"

    # -- internal: lazy model loading -----------------------------------
    def _get_indic_parler(self):
        if self._parler_model is None:
            from transformers import AutoTokenizer
            from parler_tts import ParlerTTSForConditionalGeneration

            model_id = TTS_MODEL_IDS[TTSBackend.INDIC_PARLER]
            logger.info("Loading TTS backend 'indic_parler_tts' -> %s", model_id)
            self._parler_model = ParlerTTSForConditionalGeneration.from_pretrained(
                model_id
            ).to(self._resolve_device())
            self._parler_tokenizer = AutoTokenizer.from_pretrained(model_id)
            self._parler_desc_tokenizer = AutoTokenizer.from_pretrained(
                self._parler_model.config.text_encoder._name_or_path
            )
        return self._parler_model, self._parler_tokenizer, self._parler_desc_tokenizer

    def _get_mms(self, iso3: str):
        if iso3 not in self._mms_models:
            from transformers import AutoTokenizer, VitsModel

            model_id = TTS_MODEL_IDS[TTSBackend.MMS_TTS].format(iso3=iso3)
            logger.info("Loading TTS backend 'mms_tts' -> %s", model_id)
            model = VitsModel.from_pretrained(model_id).to(self._resolve_device())
            tokenizer = AutoTokenizer.from_pretrained(model_id)
            self._mms_models[iso3] = (model, tokenizer)
        return self._mms_models[iso3]

    # -- internal: per-backend synthesis --------------------------------
    @staticmethod
    def _join_chunks(pieces: list[np.ndarray], sample_rate: int) -> np.ndarray:
        """Concatenate per-chunk waveforms with a short silence between
        them so sentences don't run together."""
        if len(pieces) == 1:
            return pieces[0]
        pause = np.zeros(int(sample_rate * 0.25), dtype=pieces[0].dtype)
        joined: list[np.ndarray] = []
        for index, piece in enumerate(pieces):
            if index:
                joined.append(pause)
            joined.append(piece)
        return np.concatenate(joined)

    def _synthesize_parler(self, text: str, speaker_description: str):
        import torch

        model, tokenizer, desc_tokenizer = self._get_indic_parler()
        device = model.device
        desc_ids = desc_tokenizer(speaker_description, return_tensors="pt").input_ids.to(device)

        pieces = []
        chunks = _chunk_text(text)
        for index, chunk in enumerate(chunks, start=1):
            if len(chunks) > 1:
                logger.info("indic-parler-tts: synthesizing chunk %d/%d", index, len(chunks))
            prompt_ids = tokenizer(chunk, return_tensors="pt").input_ids.to(device)
            with torch.no_grad():
                generation = model.generate(input_ids=desc_ids, prompt_input_ids=prompt_ids)
            pieces.append(generation.cpu().numpy().squeeze())

        sample_rate = model.config.sampling_rate
        return self._join_chunks(pieces, sample_rate), sample_rate

    def _synthesize_mms(self, text: str, iso3: str):
        import torch

        model, tokenizer = self._get_mms(iso3)
        # MMS-TTS checkpoints are trained on lower-cased, un-punctuated text.
        pieces = []
        chunks = _chunk_text(text)
        for index, chunk in enumerate(chunks, start=1):
            if len(chunks) > 1:
                logger.info("mms-tts-%s: synthesizing chunk %d/%d", iso3, index, len(chunks))
            inputs = tokenizer(chunk, return_tensors="pt").to(model.device)
            with torch.no_grad():
                output = model(**inputs).waveform
            pieces.append(output.cpu().float().numpy().squeeze())

        sample_rate = model.config.sampling_rate
        return self._join_chunks(pieces, sample_rate), sample_rate

    # -- public API --------------------------------------------------------
    def detect_language(self, text: str) -> str:
        """Return an internal language key detected from `text`."""
        return self._lang_id.predict(text)

    def synthesize(
        self,
        text: str,
        language: Optional[str] = None,
        speaker_description: str = DEFAULT_SPEAKER_DESCRIPTION,
        prefer_parler: Optional[bool] = None,
        return_meta: bool = False,
    ):
        """
        Synthesize speech for `text`.

        Parameters
        ----------
        text: input text to speak.
        language: internal language key (see core.config.list_languages()).
                  If None, language is auto-detected from `text`.
        speaker_description: natural-language voice/style prompt. Only the
                  indic-parler-tts backend uses this; MMS ignores it.
        prefer_parler: per-call override of the instance-level setting.
        return_meta: if True, also return a meta dict describing what ran.

        Returns
        -------
        (audio_array: np.ndarray, sample_rate: int), plus a meta dict if
        return_meta=True.
        """
        detected = False
        if language is None:
            language = self.detect_language(text)
            detected = True

        profile = get_profile(language)
        use_parler = self.prefer_parler if prefer_parler is None else prefer_parler

        # Build the ordered list of backends to try. MMS is always last
        # because it's the ungated one that reliably works.
        attempts: list[TTSBackend] = []
        if use_parler and profile.tts_backend == TTSBackend.INDIC_PARLER:
            attempts.append(TTSBackend.INDIC_PARLER)
        attempts.append(TTSBackend.MMS_TTS)

        last_error: Optional[Exception] = None
        for index, backend in enumerate(attempts):
            is_last = index == len(attempts) - 1
            try:
                if backend == TTSBackend.INDIC_PARLER:
                    audio, sample_rate = self._synthesize_parler(text, speaker_description)
                    model_id = TTS_MODEL_IDS[backend]
                else:
                    audio, sample_rate = self._synthesize_mms(text, profile.iso3)
                    model_id = TTS_MODEL_IDS[backend].format(iso3=profile.iso3)

                if return_meta:
                    meta = {
                        "language": language,
                        "language_auto_detected": detected,
                        "backend": backend.value,
                        "model_id": model_id,
                        "fell_back": index > 0,
                    }
                    return audio, sample_rate, meta
                return audio, sample_rate

            except Exception as exc:  # noqa: BLE001
                last_error = exc
                if not is_last:
                    logger.warning(
                        "TTS backend '%s' failed (%s). Falling back to the next "
                        "backend. If this is a 403/GatedRepoError, request access "
                        "at https://huggingface.co/ai4bharat/indic-parler-tts and "
                        "run `huggingface-cli login`.",
                        backend.value, exc,
                    )
                    continue
                raise RuntimeError(
                    f"All TTS backends failed for language '{language}'. "
                    f"Last error from '{backend.value}': {exc}"
                ) from last_error

        raise RuntimeError(f"No TTS backend available for language '{language}'.")
