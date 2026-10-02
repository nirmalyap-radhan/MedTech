"""
core/pipeline.py
-----------------
Single, integration-friendly facade over the STT, translation, and TTS
engines.

An external application only needs to do:

    from core.pipeline import SpeechPipeline
    pipeline = SpeechPipeline()

    # Speech in ANY supported language -> English text (the default)
    english_text = pipeline.speech_to_text(audio)

    # English text -> a chosen language's text
    malayalam_text = pipeline.translate_text(english_text, target_language="malayalam")

    # Text -> speech in a chosen language
    audio, sr = pipeline.text_to_speech(malayalam_text, language="malayalam")

    # Or all three steps in one call:
    result = pipeline.speech_to_speech_translate(audio, target_language="malayalam")

This module intentionally contains NO UI code. `app.py` (the Gradio demo)
imports SpeechPipeline and nothing else from `core`.
"""

from __future__ import annotations

from typing import Optional

from .config import list_languages
from .stt import SpeechToText
from .translation import TextTranslator
from .tts import TextToSpeech


class SpeechPipeline:
    def __init__(self, device: Optional[str] = None, prefer_parler: bool = False):
        """
        device: "cuda:0", "cpu", or None to auto-select.
        prefer_parler: opt into the higher-quality but *gated*
            ai4bharat/indic-parler-tts for TTS. Requires requesting access
            at https://huggingface.co/ai4bharat/indic-parler-tts and being
            logged in. Falls back to the ungated MMS checkpoint
            automatically if unavailable, so it's safe to leave on.
        """
        self.stt = SpeechToText(device=device)
        self.translator = TextTranslator(device=device)
        self.tts = TextToSpeech(device=device, prefer_parler=prefer_parler)

    @staticmethod
    def supported_languages() -> list[str]:
        return list_languages()

    def speech_to_text(
        self,
        audio,
        language: Optional[str] = None,
        return_meta: bool = False,
        audio_lid_mode: Optional[str] = None,
        translate_to_english: Optional[bool] = None,
    ):
        """Transcribe `audio`. By default, returns English text,
        regardless of the spoken language -- see core.stt for why. Pass
        `translate_to_english=False` for a same-language transcript
        instead."""
        return self.stt.transcribe(
            audio,
            language=language,
            return_meta=return_meta,
            audio_lid_mode=audio_lid_mode,
            translate_to_english=translate_to_english,
        )

    def translate_text(
        self,
        text: str,
        target_language: str,
        source_language: str = "english",
        return_meta: bool = False,
    ):
        """Translate `text` (English by default) into `target_language`,
        using Meta's free, ungated NLLB-200 model. `target_language` and
        `source_language` are internal language keys (see
        `supported_languages()`) or the special key "english"."""
        translated = self.translator.translate(
            text, target_language=target_language, source_language=source_language
        )
        if return_meta:
            meta = {
                "source_language": source_language,
                "target_language": target_language,
                "model_id": "facebook/nllb-200-distilled-600M",
            }
            return translated, meta
        return translated

    def text_to_speech(
        self,
        text: str,
        language: Optional[str] = None,
        speaker_description: Optional[str] = None,
        prefer_parler: Optional[bool] = None,
        return_meta: bool = False,
    ):
        kwargs = {
            "language": language,
            "prefer_parler": prefer_parler,
            "return_meta": return_meta,
        }
        if speaker_description is not None:
            kwargs["speaker_description"] = speaker_description
        return self.tts.synthesize(text, **kwargs)

    def speech_to_speech_translate(
        self,
        audio,
        target_language: str,
        source_language: Optional[str] = None,
    ):
        """Full pipeline in one call: speech in any supported language ->
        English text -> `target_language` text -> `target_language`
        speech. Returns a dict with every intermediate result, so a caller
        can display or discard whichever stages it doesn't need.

        `source_language`, if given, hints the SPOKEN language for STT
        accuracy/routing (not the output language) -- leave it None to
        auto-detect.
        """
        english_text, stt_meta = self.speech_to_text(
            audio, language=source_language, return_meta=True, translate_to_english=True
        )
        target_text, translate_meta = self.translate_text(
            english_text, target_language=target_language, source_language="english", return_meta=True
        )
        out_audio, sr, tts_meta = self.text_to_speech(target_text, language=target_language, return_meta=True)
        return {
            "english_text": english_text,
            "translated_text": target_text,
            "audio": out_audio,
            "sample_rate": sr,
            "stt_meta": stt_meta,
            "translate_meta": translate_meta,
            "tts_meta": tts_meta,
        }

    def transcribe_and_speak(
        self,
        audio,
        language: Optional[str] = None,
    ):
        """Convenience helper: transcribe audio IN ITS OWN LANGUAGE (i.e.
        translate_to_english=False, unlike the default speech_to_text
        behavior), then re-synthesize that same-language transcript.
        Useful as a smoke test, or as a building block for read-back /
        confirmation flows where you want to hear back what was actually
        said rather than an English translation of it."""
        text, stt_meta = self.speech_to_text(
            audio, language=language, return_meta=True, translate_to_english=False
        )
        out_audio, sr, tts_meta = self.text_to_speech(
            text, language=stt_meta["language"], return_meta=True
        )
        return {
            "text": text,
            "audio": out_audio,
            "sample_rate": sr,
            "stt_meta": stt_meta,
            "tts_meta": tts_meta,
        }
