"""
tests/test_pipeline.py
------------------------
Lightweight sanity tests for the routing/config logic.

These tests deliberately avoid downloading real Hugging Face checkpoints
(no network access assumed in CI). They patch out the model-loading calls
so we can verify:
  1. The language registry is well-formed.
  2. STT always outputs English by default (task="translate"), with
     MMS-ASR-only languages chained through NLLB translation to match.
  3. TTS routing picks the expected backend per language.
  4. Text translation resolves codes correctly and rejects unverified ones.
  5. The public SpeechPipeline facade wires all three engines together.

Run with:  pytest tests/test_pipeline.py -v
"""

import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import numpy as np
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.config import LANGUAGES, NLLB_LANG_CODES, STTBackend, TTSBackend, get_profile, list_languages  # noqa: E402
from core.stt import SpeechToText  # noqa: E402
from core.translation import TextTranslator  # noqa: E402
from core.tts import TextToSpeech, _chunk_text  # noqa: E402
from core.pipeline import SpeechPipeline  # noqa: E402


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

def test_registry_well_formed():
    assert len(LANGUAGES) >= 15
    for key, profile in LANGUAGES.items():
        assert profile.iso1 and profile.iso3
        assert profile.family in {"indo-aryan", "dravidian"}
        assert isinstance(profile.stt_backend, STTBackend)
        assert isinstance(profile.tts_backend, TTSBackend)


def test_get_profile_unknown_language_raises():
    with pytest.raises(KeyError):
        get_profile("klingon")


def test_list_languages_sorted_and_matches_registry():
    langs = list_languages()
    assert langs == sorted(langs)
    assert set(langs) == set(LANGUAGES.keys())


def test_nllb_codes_only_cover_registered_languages():
    """Every NLLB_LANG_CODES key must be a real registry language (catches
    typos), and Konkani/Dogri/Tulu are deliberately absent (unverified)."""
    assert set(NLLB_LANG_CODES.keys()).issubset(set(LANGUAGES.keys()))
    for excluded in ("konkani", "dogri", "tulu"):
        assert excluded not in NLLB_LANG_CODES


# ---------------------------------------------------------------------------
# STT: always translates to English by default
# ---------------------------------------------------------------------------

def test_stt_default_forces_translate_task_for_whisper():
    """The core architecture change: Whisper's task must be "translate"
    (English output) by default, not "transcribe"."""
    stt = SpeechToText(use_inference_api=False)
    assert stt.translate_to_english is True
    fake_pipe = MagicMock(return_value={"text": "hello"})
    with patch.object(stt, "_get_backend_pipeline", return_value=fake_pipe):
        text, meta = stt.transcribe("fake_path.wav", language="malayalam", return_meta=True)
    fake_pipe.assert_called_once_with(
        "fake_path.wav",
        generate_kwargs={
            "no_repeat_ngram_size": 3,
            "repetition_penalty": 1.3,
            "task": "translate",
            "language": "ml",
        },
    )
    assert meta["translated"] is True


def test_stt_translate_to_english_false_uses_transcribe_task():
    """Opt-out: same-language transcript instead of English translation."""
    stt = SpeechToText(use_inference_api=False, translate_to_english=False)
    fake_pipe = MagicMock(return_value={"text": "hello"})
    with patch.object(stt, "_get_backend_pipeline", return_value=fake_pipe):
        text, meta = stt.transcribe("fake_path.wav", language="malayalam", return_meta=True)
    fake_pipe.assert_called_once_with(
        "fake_path.wav",
        generate_kwargs={
            "no_repeat_ngram_size": 3,
            "repetition_penalty": 1.3,
            "task": "transcribe",
            "language": "ml",
        },
    )
    assert meta["translated"] is False


def test_stt_per_call_override_beats_instance_setting():
    stt = SpeechToText(use_inference_api=False, translate_to_english=True)
    fake_pipe = MagicMock(return_value={"text": "hello"})
    with patch.object(stt, "_get_backend_pipeline", return_value=fake_pipe):
        stt.transcribe("fake_path.wav", language="hindi", translate_to_english=False)
    _, kwargs = fake_pipe.call_args
    assert kwargs["generate_kwargs"]["task"] == "transcribe"


def test_stt_api_forces_translate_task_via_extra_body():
    """Same fix as the local path, applied to the hosted API: task must be
    forced via extra_body={"generate_kwargs": {...}}, since InferenceClient
    has no dedicated task/language parameter of its own."""
    stt = SpeechToText(use_inference_api=True)
    fake_client = MagicMock()
    fake_client.automatic_speech_recognition.return_value = MagicMock(text="hosted result")
    with patch.object(stt, "_get_inference_client", return_value=fake_client):
        stt.transcribe("fake_path.wav", language="kannada")
    _, kwargs = fake_client.automatic_speech_recognition.call_args
    assert kwargs["extra_body"] == {
        "generate_kwargs": {
            "no_repeat_ngram_size": 3,
            "repetition_penalty": 1.3,
            "task": "translate",
            "language": "kn",
        }
    }


def test_stt_uses_inference_api_when_it_succeeds():
    stt = SpeechToText(use_inference_api=True)
    with patch.object(stt, "_transcribe_via_api", return_value="hosted result") as api_mock, \
         patch.object(stt, "_get_backend_pipeline") as local_mock:
        text, meta = stt.transcribe("fake_path.wav", language="bengali", return_meta=True)
    api_mock.assert_called_once()
    local_mock.assert_not_called()
    assert text == "hosted result"
    assert meta["served_via"] == "hosted_inference_api"


def test_stt_falls_back_to_local_when_api_fails():
    stt = SpeechToText(use_inference_api=True)
    fake_pipe = MagicMock(return_value={"text": "local result"})
    with patch.object(stt, "_transcribe_via_api", side_effect=RuntimeError("no token")), \
         patch.object(stt, "_get_backend_pipeline", return_value=fake_pipe) as local_mock:
        text, meta = stt.transcribe("fake_path.wav", language="bengali", return_meta=True)
    local_mock.assert_called_once()
    assert text == "local result"
    assert meta["served_via"] == "local"


def test_stt_local_only_mode_never_calls_api():
    stt = SpeechToText(use_inference_api=False)
    fake_pipe = MagicMock(return_value={"text": "local result"})
    with patch.object(stt, "_transcribe_via_api") as api_mock, \
         patch.object(stt, "_get_backend_pipeline", return_value=fake_pipe):
        stt.transcribe("fake_path.wav", language="hindi")
    api_mock.assert_not_called()


def test_stt_default_auto_detect_skips_heavy_classifier():
    """auto-detect must go straight to Whisper with NO separate ~3.9GB
    mms-lid-256 classifier call by default."""
    stt = SpeechToText(use_inference_api=False)
    assert stt.audio_lid_mode == "whisper_native"
    fake_pipe = MagicMock(return_value={"text": "hello"})
    with patch.object(stt, "_get_lang_id") as lang_id_mock, \
         patch.object(stt, "_get_backend_pipeline", return_value=fake_pipe) as get_backend:
        text, meta = stt.transcribe("fake_path.wav", return_meta=True)
    lang_id_mock.assert_not_called()
    get_backend.assert_called_once_with(STTBackend.WHISPER, "openai/whisper-large-v3")
    # No specific spoken language was known ahead of time, so no
    # "language" key -- but task=translate and the anti-repetition-loop
    # guards are still applied unconditionally.
    fake_pipe.assert_called_once_with(
        "fake_path.wav",
        generate_kwargs={
            "no_repeat_ngram_size": 3,
            "repetition_penalty": 1.3,
            "task": "translate",
        },
    )
    assert meta["language"] == "auto"
    assert meta["language_auto_detected"] is True


def test_stt_classifier_mode_routes_via_detected_language():
    stt = SpeechToText(use_inference_api=False, audio_lid_mode="classifier")
    fake_pipe = MagicMock(return_value={"text": "hi"})
    with patch.object(stt, "detect_language", return_value="tamil") as detect_mock, \
         patch.object(stt, "_get_backend_pipeline", return_value=fake_pipe):
        text, meta = stt.transcribe("fake_path.wav", return_meta=True)
    detect_mock.assert_called_once()
    assert meta["language"] == "tamil"
    assert meta["language_auto_detected"] is True


def test_stt_invalid_audio_lid_mode_rejected():
    with pytest.raises(ValueError):
        SpeechToText(audio_lid_mode="not_a_real_mode")


def test_stt_mms_asr_chains_through_translator_for_english():
    """MMS-ASR (Odia/Assamese/etc.) can't translate on its own -- it must
    transcribe natively, then get chained through NLLB to still produce
    English output when translate_to_english=True (the default)."""
    stt = SpeechToText()
    fake_pipe = MagicMock(return_value={"text": "ଓଡ଼ିଆ ପାଠ୍ୟ"})
    fake_translator = MagicMock()
    fake_translator.translate.return_value = "English translation"
    with patch.object(stt, "_get_backend_pipeline", return_value=fake_pipe), \
         patch.object(stt, "_get_translator", return_value=fake_translator):
        text, meta = stt.transcribe("fake_path.wav", language="odia", return_meta=True)
    fake_translator.translate.assert_called_once_with(
        "ଓଡ଼ିଆ ପାଠ୍ୟ", target_language="english", source_language="odia"
    )
    assert text == "English translation"
    assert meta["translated"] is True


def test_stt_mms_asr_returns_native_text_when_no_nllb_code():
    """Tulu has no verified NLLB code -- must return the native transcript
    rather than guess a translation, and flag translated=False."""
    stt = SpeechToText()
    fake_pipe = MagicMock(return_value={"text": "native tulu text"})
    fake_translator = MagicMock()
    with patch.object(stt, "_get_backend_pipeline", return_value=fake_pipe), \
         patch.object(stt, "_get_translator", return_value=fake_translator):
        text, meta = stt.transcribe("fake_path.wav", language="tulu", return_meta=True)
    fake_translator.translate.assert_not_called()
    assert text == "native tulu text"
    assert meta["translated"] is False


def test_stt_mms_asr_native_mode_skips_translation_entirely():
    """With translate_to_english=False, MMS-ASR just returns its native
    transcript directly -- no NLLB call at all, even for a language that
    does have a verified code."""
    stt = SpeechToText(translate_to_english=False)
    fake_pipe = MagicMock(return_value={"text": "native odia text"})
    fake_translator = MagicMock()
    with patch.object(stt, "_get_backend_pipeline", return_value=fake_pipe), \
         patch.object(stt, "_get_translator", return_value=fake_translator):
        text, meta = stt.transcribe("fake_path.wav", language="odia", return_meta=True)
    fake_translator.translate.assert_not_called()
    assert text == "native odia text"
    assert meta["translated"] is False


# ---------------------------------------------------------------------------
# Translation
# ---------------------------------------------------------------------------

def test_translator_resolves_known_codes():
    assert TextTranslator._resolve_code("malayalam") == "mal_Mlym"
    assert TextTranslator._resolve_code("english") == "eng_Latn"
    assert TextTranslator._resolve_code("Hindi") == "hin_Deva"  # case-insensitive


def test_translator_rejects_unverified_language():
    """Konkani/Dogri/Tulu deliberately have no verified NLLB code --
    must raise a clear error rather than guess one."""
    with pytest.raises(ValueError, match="No verified NLLB"):
        TextTranslator._resolve_code("konkani")


def test_translator_translate_calls_pipeline_with_resolved_codes():
    translator = TextTranslator()
    fake_pipe = MagicMock(return_value=[{"translation_text": "വണക്കം"}])
    with patch.object(translator, "_get_pipeline", return_value=fake_pipe) as get_pipe:
        result = translator.translate("Hello", target_language="malayalam")
    get_pipe.assert_called_once_with("eng_Latn", "mal_Mlym")
    assert result == "വണക്കം"


def test_translator_chunks_long_text():
    translator = TextTranslator()
    long_text = "This is a sentence. " * 40
    fake_pipe = MagicMock(return_value=[{"translation_text": "chunk"}])
    with patch.object(translator, "_get_pipeline", return_value=fake_pipe):
        result = translator.translate(long_text, target_language="hindi")
    assert fake_pipe.call_count > 1
    assert result == " ".join(["chunk"] * fake_pipe.call_count)


# ---------------------------------------------------------------------------
# Shared text chunking (core.text_utils, re-exported from core.tts)
# ---------------------------------------------------------------------------

def test_chunk_text_leaves_short_text_alone():
    assert _chunk_text("ഇത് ഒരു ചെറിയ വാചകം.") == ["ഇത് ഒരു ചെറിയ വാചകം."]


def test_chunk_text_splits_long_text_on_sentence_boundaries():
    sentence = "This is a sentence of reasonable length. "
    chunks = _chunk_text(sentence * 20, max_chars=100)
    assert len(chunks) > 1
    assert all(len(c) <= 100 for c in chunks)
    assert "".join(chunks).replace(" ", "") == (sentence * 20).replace(" ", "")


def test_chunk_text_handles_devanagari_danda():
    text = "यह पहला वाक्य है। " * 20
    chunks = _chunk_text(text, max_chars=80)
    assert len(chunks) > 1
    assert all(len(c) <= 80 for c in chunks)


def test_chunk_text_breaks_runon_sentence_without_terminators():
    text = "word " * 200
    chunks = _chunk_text(text, max_chars=100)
    assert len(chunks) > 1
    assert all(len(c) <= 100 for c in chunks)


def test_chunk_text_empty_input():
    assert _chunk_text("") == []
    assert _chunk_text("   ") == []


# ---------------------------------------------------------------------------
# TTS
# ---------------------------------------------------------------------------

def test_tts_defaults_to_ungated_mms_even_for_parler_languages():
    tts = TextToSpeech()
    with patch.object(tts, "_synthesize_mms", return_value=(np.zeros(100), 16000)) as mms_mock, \
         patch.object(tts, "_synthesize_parler") as parler_mock:
        audio, sr, meta = tts.synthesize("വണക്കം", language="malayalam", return_meta=True)
    parler_mock.assert_not_called()
    mms_mock.assert_called_once_with("വണക്കം", "mal")
    assert meta["backend"] == "mms_tts"
    assert meta["model_id"] == "facebook/mms-tts-mal"
    assert meta["fell_back"] is False


def test_tts_uses_parler_when_opted_in_and_available():
    tts = TextToSpeech(prefer_parler=True)
    with patch.object(tts, "_synthesize_parler", return_value=(np.zeros(100), 24000)) as parler_mock, \
         patch.object(tts, "_synthesize_mms") as mms_mock:
        audio, sr, meta = tts.synthesize("വണക്കം", language="malayalam", return_meta=True)
    parler_mock.assert_called_once()
    mms_mock.assert_not_called()
    assert meta["backend"] == "indic_parler_tts"
    assert meta["fell_back"] is False


def test_tts_falls_back_to_mms_when_parler_is_gated():
    tts = TextToSpeech(prefer_parler=True)
    with patch.object(tts, "_synthesize_parler", side_effect=OSError("gated repo 403")), \
         patch.object(tts, "_synthesize_mms", return_value=(np.zeros(100), 16000)) as mms_mock:
        audio, sr, meta = tts.synthesize("വണക്കം", language="malayalam", return_meta=True)
    mms_mock.assert_called_once()
    assert meta["backend"] == "mms_tts"
    assert meta["fell_back"] is True


def test_tts_raises_helpful_error_when_all_backends_fail():
    tts = TextToSpeech()
    with patch.object(tts, "_synthesize_mms", side_effect=OSError("network down")):
        with pytest.raises(RuntimeError, match="All TTS backends failed"):
            tts.synthesize("test", language="malayalam")


def test_tts_routes_mms_for_punjabi():
    tts = TextToSpeech(prefer_parler=True)
    with patch.object(tts, "_synthesize_mms", return_value=(np.zeros(100), 16000)) as mms_mock, \
         patch.object(tts, "_synthesize_parler") as parler_mock:
        audio, sr, meta = tts.synthesize("test", language="punjabi", return_meta=True)
    parler_mock.assert_not_called()
    mms_mock.assert_called_once_with("test", "pan")
    assert meta["backend"] == "mms_tts"


# ---------------------------------------------------------------------------
# SpeechPipeline facade
# ---------------------------------------------------------------------------

def test_pipeline_facade_delegates_speech_to_text():
    pipeline = SpeechPipeline()
    with patch.object(pipeline.stt, "transcribe", return_value="hello") as stt_mock:
        result = pipeline.speech_to_text("audio.wav", language="hindi")
    stt_mock.assert_called_once_with(
        "audio.wav",
        language="hindi",
        return_meta=False,
        audio_lid_mode=None,
        translate_to_english=None,
    )
    assert result == "hello"


def test_pipeline_facade_delegates_text_to_speech():
    pipeline = SpeechPipeline()
    with patch.object(pipeline.tts, "synthesize", return_value=(np.zeros(10), 16000)) as tts_mock:
        audio, sr = pipeline.text_to_speech("hi", language="hindi")
    tts_mock.assert_called_once()
    assert sr == 16000


def test_pipeline_facade_delegates_translate_text():
    pipeline = SpeechPipeline()
    with patch.object(pipeline.translator, "translate", return_value="വണക്കം") as translate_mock:
        result, meta = pipeline.translate_text("Hello", target_language="malayalam", return_meta=True)
    translate_mock.assert_called_once_with(
        "Hello", target_language="malayalam", source_language="english"
    )
    assert result == "വണക്കം"
    assert meta["target_language"] == "malayalam"


def test_pipeline_speech_to_speech_translate_chains_all_three_stages():
    pipeline = SpeechPipeline()
    with patch.object(pipeline, "speech_to_text", return_value=("Hello", {"language": "hindi"})) as stt_mock, \
         patch.object(pipeline, "translate_text", return_value=("വണക്കം", {"target_language": "malayalam"})) as tr_mock, \
         patch.object(pipeline, "text_to_speech", return_value=(np.zeros(10), 16000, {"backend": "mms_tts"})) as tts_mock:
        result = pipeline.speech_to_speech_translate("audio.wav", target_language="malayalam")
    stt_mock.assert_called_once()
    tr_mock.assert_called_once_with(
        "Hello", target_language="malayalam", source_language="english", return_meta=True
    )
    tts_mock.assert_called_once_with("വണക്കം", language="malayalam", return_meta=True)
    assert result["english_text"] == "Hello"
    assert result["translated_text"] == "വണക്കം"
    assert result["sample_rate"] == 16000
