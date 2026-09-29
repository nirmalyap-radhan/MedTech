"""
core/translation.py
---------------------
Modular English <-> Indic-language text translator.

    from core.translation import TextTranslator
    translator = TextTranslator()

    # English -> a chosen language
    malayalam_text = translator.translate("Hello, how are you?", target_language="malayalam")

    # Any supported language -> English (used internally by core/stt.py to
    # give MMS-ASR-only languages, which can't translate on their own, the
    # same "always returns English" behavior as Whisper)
    english_text = translator.translate(malayalam_text, target_language="english", source_language="malayalam")

Backend
-------
`facebook/nllb-200-distilled-600M` -- Meta's "No Language Left Behind"
model. Free, ungated (no access request, no token needed), and covers 200
languages through a completely standard `transformers` translation
pipeline (`AutoModelForSeq2SeqLM` + `NllbTokenizer`) -- no custom package
required, unlike some other MT toolkits.

Language codes are looked up from `core.config.NLLB_LANG_CODES`, which was
built by directly checking Hugging Face's own FLORES-200 code reference
rather than guessed. Three registry languages (Konkani, Dogri, Tulu)
aren't in that verified table and will raise a clear error here rather
than silently mistranslating with a guessed code.
"""

from __future__ import annotations

import logging
from typing import Optional

import torch

from .config import ENGLISH_NLLB_CODE, NLLB_LANG_CODES, TRANSLATION_MODEL_ID
from .text_utils import chunk_text

logger = logging.getLogger(__name__)


class TextTranslator:
    def __init__(self, device: Optional[str] = None):
        self.device = device
        # Keyed by (src_code, tgt_code) -- a translation run builds a small
        # callable pipeline for a specific language pair. All pairs share
        # the same underlying NLLB model weights (loaded lazily once).
        self._pipelines: dict[tuple[str, str], object] = {}
        self._tokenizer = None
        self._model = None

    @staticmethod
    def _resolve_code(language_key: str) -> str:
        key = language_key.strip().lower()
        if key == "english":
            return ENGLISH_NLLB_CODE
        if key not in NLLB_LANG_CODES:
            raise ValueError(
                f"No verified NLLB translation code for '{language_key}'. "
                f"Supported translation languages: {sorted(NLLB_LANG_CODES.keys())} "
                "(+ 'english'). See core.config.NLLB_LANG_CODES to add more "
                "once you've verified the exact FLORES-200 code."
            )
        return NLLB_LANG_CODES[key]

    def _load_backend(self):
        """Lazily load the shared NLLB tokenizer + model once.

        `transformers 5.x` removed the legacy `pipeline("translation", ...)`
        task used by older versions, so the model is loaded through the
        documented Auto API (AutoTokenizer + AutoModelForSeq2SeqLM) directly
        instead -- the original docstring for this module describes exactly
        this backend ("AutoModelForSeq2SeqLM + NllbTokenizer").
        """
        if self._model is None or self._tokenizer is None:
            from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
            logger.info("Loading translation backend %s", TRANSLATION_MODEL_ID)
            self._tokenizer = AutoTokenizer.from_pretrained(
                TRANSLATION_MODEL_ID, low_cpu_mem_usage=True
            )
            self._model = AutoModelForSeq2SeqLM.from_pretrained(
                TRANSLATION_MODEL_ID, low_cpu_mem_usage=True
            )
            if self.device:
                self._model = self._model.to(torch.device(self.device))
        return self._model, self._tokenizer

    def _get_pipeline(self, src_code: str, tgt_code: str):
        key = (src_code, tgt_code)
        if key not in self._pipelines:
            forced_bos_token_id = None
            model, tokenizer = None, None

            def pipe(text, max_length):
                nonlocal forced_bos_token_id, model, tokenizer
                if model is None or tokenizer is None:
                    model, tokenizer = self._load_backend()
                    forced_bos_token_id = tokenizer.convert_tokens_to_ids(tgt_code)
                session_tokenizer, session_model = tokenizer, model
                session_tokenizer.src_lang = src_code
                inputs = session_tokenizer(text, return_tensors="pt")
                with torch.no_grad():
                    outputs = session_model.generate(
                        **inputs,
                        forced_bos_token_id=forced_bos_token_id,
                        max_length=max_length,
                    )
                translated = session_tokenizer.batch_decode(
                    outputs, skip_special_tokens=True
                )[0].strip()
                return [{"translation_text": translated}]

            self._pipelines[key] = pipe
        return self._pipelines[key]

    def translate(
        self,
        text: str,
        target_language: str,
        source_language: str = "english",
    ) -> str:
        """
        Translate `text` from `source_language` (default: English) into
        `target_language`. Both are internal language keys from
        core.config.list_languages(), or the special key "english".

        Long text is automatically split into sentence-sized chunks (NLLB
        has a limited input length and produces worse/truncated output on
        very long text) and rejoined with spaces.
        """
        src_code = self._resolve_code(source_language)
        tgt_code = self._resolve_code(target_language)
        pipe = self._get_pipeline(src_code, tgt_code)

        chunks = chunk_text(text)
        if not chunks:
            return ""

        translated_chunks = []
        for index, chunk in enumerate(chunks, start=1):
            if len(chunks) > 1:
                logger.info("Translating chunk %d/%d", index, len(chunks))
            result = pipe(chunk, max_length=512)
            translated_chunks.append(result[0]["translation_text"].strip())

        return " ".join(translated_chunks)
