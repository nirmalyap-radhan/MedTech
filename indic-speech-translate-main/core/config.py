"""
core/config.py
---------------
Central registry of:
  * Supported "Indo-Dravidian" languages (Indo-Aryan + Dravidian families
    spoken on the Indian subcontinent), with ISO-639-1/2/3 codes.
  * Which Hugging Face model backs STT and TTS for each language.
  * Backend metadata (whether a backend is "one-model-for-many-languages"
    or "one-model-per-language").

This file is the single source of truth for routing decisions. Add a
language or swap a model by editing the dictionaries below -- no other
module needs to change.

All models referenced here are freely available on the Hugging Face Hub
(no paid API keys required), e.g.:
  - openai/whisper-large-v3            (multilingual ASR, used with task="translate" for English output)
  - facebook/mms-1b-all                (1000+ language ASR, adapter-based)
  - facebook/nllb-200-distilled-600M   (200-language text translation, e.g. English -> Malayalam)
  - ai4bharat/indic-parler-tts         (multilingual Indic TTS, single model)
  - facebook/mms-tts-<iso3>            (per-language VITS TTS)
  - facebook/fasttext-language-identification (text LID) / facebook/mms-lid-256 (audio LID)
"""

from dataclasses import dataclass
from enum import Enum


def _ensure_ffmpeg_on_path() -> None:
    """Ensure a working `ffmpeg` (or `ffmpeg.exe`) executable is
    discoverable via PATH under exactly that name, and found first in
    PATH search order.

    `transformers`'s audio pipelines shell out to a literal `ffmpeg`
    subprocess to decode audio files locally (see
    `transformers.pipelines.audio_utils.ffmpeg_read`), which requires
    ffmpeg to be resolvable on PATH.

    `imageio-ffmpeg` (a standard pip dependency; see requirements.txt)
    ships a small pre-built ffmpeg binary for Windows/macOS/Linux with no
    system install step. Its filename is versioned (e.g.
    `ffmpeg-win-x86_64-v7.1.exe`), not `ffmpeg.exe`, and Windows'
    `CreateProcess` requires an exact filename match -- it does not
    resolve versioned names or missing extensions the way an interactive
    shell does. This function therefore copies that binary once to a
    plain `ffmpeg`/`ffmpeg.exe` name in the same directory (a no-op on
    subsequent runs once the copy exists) and prepends that directory to
    PATH unconditionally, so it takes precedence over any other
    `ffmpeg`-named entry already on PATH -- including the non-functional
    placeholder `ffmpeg.exe` Windows ships by default in
    `...\\AppData\\Local\\Microsoft\\WindowsApps` (an "App Execution
    Alias" stub that resolves via PATH lookup but cannot be launched).
    """
    import os
    import shutil
    import sys

    try:
        import imageio_ffmpeg
        real_exe = imageio_ffmpeg.get_ffmpeg_exe()
        ffmpeg_dir = os.path.dirname(real_exe)
        plain_name = "ffmpeg.exe" if sys.platform == "win32" else "ffmpeg"
        plain_path = os.path.join(ffmpeg_dir, plain_name)

        if not os.path.exists(plain_path):
            shutil.copyfile(real_exe, plain_path)
            if sys.platform != "win32":
                os.chmod(plain_path, 0o755)

        os.environ["PATH"] = ffmpeg_dir + os.pathsep + os.environ.get("PATH", "")
        print(f"[core.config] Bundled ffmpeg registered on PATH: {plain_path}")
    except Exception as exc:
        # Surface a visible warning immediately rather than letting this
        # fail silently and only surface later as a confusing
        # ffmpeg-not-found error during audio decoding.
        print(
            f"[core.config] WARNING: could not register bundled ffmpeg ({exc}). "
            "Local audio decoding may fail with 'ffmpeg was not found'. "
            "Run: pip install imageio-ffmpeg"
        )


_ensure_ffmpeg_on_path()


class STTBackend(str, Enum):
    WHISPER = "whisper"          # openai/whisper-large-v3 (multilingual)
    MMS_ASR = "mms_asr"          # facebook/mms-1b-all (adapter per language)


class TTSBackend(str, Enum):
    INDIC_PARLER = "indic_parler_tts"   # ai4bharat/indic-parler-tts (multilingual)
    MMS_TTS = "mms_tts"                 # facebook/mms-tts-<iso3> (per-language)


@dataclass(frozen=True)
class LanguageProfile:
    name: str                 # human readable name
    iso1: str                 # ISO 639-1 (2-letter) code, used by Whisper
    iso3: str                 # ISO 639-3 (3-letter) code, used by MMS models
    family: str               # "indo-aryan" | "dravidian"
    stt_backend: STTBackend
    tts_backend: TTSBackend


# ---------------------------------------------------------------------------
# Language registry
#
# stt_backend routing rule of thumb:
#   Whisper's public checkpoint natively covers a subset of Indian languages
#   with good quality. Everything else (lower-resource languages Whisper was
#   never trained on) is routed to MMS-ASR, which uses per-language adapters
#   on top of one shared 1B-parameter model and covers far more languages.
#
# tts_backend routing rule of thumb:
#   This field records which language indic-parler-tts *officially*
#   supports (Assamese, Bengali, Bodo, Dogri, English, Gujarati, Hindi,
#   Kannada, Konkani, Maithili, Malayalam, Manipuri, Marathi, Nepali,
#   Odia, Sanskrit, Santali, Sindhi, Tamil, Telugu, Urdu per its model
#   card). It is a *preference*, not a hard route.
#
#   Note: ai4bharat/indic-parler-tts is a gated repository -- it returns
#   GatedRepoError (HTTP 403) unless access has been requested at
#   https://huggingface.co/ai4bharat/indic-parler-tts and the user is
#   logged in. core/tts.py only attempts it when prefer_parler=True, and
#   falls back to facebook/mms-tts-<iso3> (ungated, small, covers every
#   language here) otherwise. MMS is therefore the default TTS path.
# ---------------------------------------------------------------------------

LANGUAGES: dict[str, LanguageProfile] = {
    # ---------------- Indo-Aryan ----------------
    "hindi": LanguageProfile("Hindi", "hi", "hin", "indo-aryan", STTBackend.WHISPER, TTSBackend.INDIC_PARLER),
    "bengali": LanguageProfile("Bengali", "bn", "ben", "indo-aryan", STTBackend.WHISPER, TTSBackend.INDIC_PARLER),
    "marathi": LanguageProfile("Marathi", "mr", "mar", "indo-aryan", STTBackend.WHISPER, TTSBackend.INDIC_PARLER),
    "gujarati": LanguageProfile("Gujarati", "gu", "guj", "indo-aryan", STTBackend.WHISPER, TTSBackend.INDIC_PARLER),
    # Punjabi is only "unofficially" supported by indic-parler-tts per its
    # model card, so route it to the dedicated MMS per-language model instead.
    "punjabi": LanguageProfile("Punjabi", "pa", "pan", "indo-aryan", STTBackend.WHISPER, TTSBackend.MMS_TTS),
    "urdu": LanguageProfile("Urdu", "ur", "urd", "indo-aryan", STTBackend.WHISPER, TTSBackend.INDIC_PARLER),
    "nepali": LanguageProfile("Nepali", "ne", "nep", "indo-aryan", STTBackend.WHISPER, TTSBackend.INDIC_PARLER),
    "sanskrit": LanguageProfile("Sanskrit", "sa", "san", "indo-aryan", STTBackend.WHISPER, TTSBackend.INDIC_PARLER),
    "sindhi": LanguageProfile("Sindhi", "sd", "snd", "indo-aryan", STTBackend.WHISPER, TTSBackend.INDIC_PARLER),
    "odia": LanguageProfile("Odia", "or", "ory", "indo-aryan", STTBackend.MMS_ASR, TTSBackend.INDIC_PARLER),
    "assamese": LanguageProfile("Assamese", "as", "asm", "indo-aryan", STTBackend.MMS_ASR, TTSBackend.INDIC_PARLER),
    "maithili": LanguageProfile("Maithili", "mai", "mai", "indo-aryan", STTBackend.MMS_ASR, TTSBackend.INDIC_PARLER),
    "konkani": LanguageProfile("Konkani", "kok", "kok", "indo-aryan", STTBackend.MMS_ASR, TTSBackend.INDIC_PARLER),
    "dogri": LanguageProfile("Dogri", "doi", "doi", "indo-aryan", STTBackend.MMS_ASR, TTSBackend.INDIC_PARLER),

    # ---------------- Dravidian ----------------
    "tamil": LanguageProfile("Tamil", "ta", "tam", "dravidian", STTBackend.WHISPER, TTSBackend.INDIC_PARLER),
    "telugu": LanguageProfile("Telugu", "te", "tel", "dravidian", STTBackend.WHISPER, TTSBackend.INDIC_PARLER),
    "kannada": LanguageProfile("Kannada", "kn", "kan", "dravidian", STTBackend.WHISPER, TTSBackend.INDIC_PARLER),
    "malayalam": LanguageProfile("Malayalam", "ml", "mal", "dravidian", STTBackend.WHISPER, TTSBackend.INDIC_PARLER),
    "tulu": LanguageProfile("Tulu", "tcy", "tcy", "dravidian", STTBackend.MMS_ASR, TTSBackend.MMS_TTS),
}


# ---------------------------------------------------------------------------
# Backend -> concrete Hugging Face model id
# ---------------------------------------------------------------------------

STT_MODEL_IDS = {
    # openai/whisper-large-v3 (not the turbo variant) is used for
    # accuracy: turbo's own model card and independent benchmarks report
    # a measured accuracy gap (~2.5 WER points) on multilingual/
    # low-resource content, which matters for an Indic-language project.
    STTBackend.WHISPER: "openai/whisper-large-v3",
    STTBackend.MMS_ASR: "facebook/mms-1b-all",
}

# core/stt.py always translates to English by default (task="translate"),
# so per-language fine-tuned checkpoints -- which are typically trained
# only for same-language transcription -- are not used here. Generic
# `openai/whisper-large-v3` handles translation for every Whisper-routed
# language.

# indic-parler-tts is one shared checkpoint for every language it supports.
# mms-tts is one checkpoint PER language, keyed by iso3 code, so the actual
# model id is only known once we know which language we're synthesizing.
TTS_MODEL_IDS = {
    TTSBackend.INDIC_PARLER: "ai4bharat/indic-parler-tts",
    TTSBackend.MMS_TTS: "facebook/mms-tts-{iso3}",   # format at call time
}

# ---------------------------------------------------------------------------
# Text translation (core/translation.py)
# ---------------------------------------------------------------------------
# facebook/nllb-200-distilled-600M -- Meta's "No Language Left Behind"
# model, free, ungated, and covering 200 languages via a standard
# `transformers` translation pipeline (AutoModelForSeq2SeqLM + NllbTokenizer,
# no custom package needed). Used to:
#   1. Translate a non-English MMS-ASR transcript into English (MMS-ASR
#      itself can only transcribe, never translate, so this is how the
#      6 MMS-ASR-only languages still end up producing English STT output
#      like every other language).
#   2. Translate the English STT output into whichever language the user
#      picks for display/TTS.
TRANSLATION_MODEL_ID = "facebook/nllb-200-distilled-600M"
ENGLISH_NLLB_CODE = "eng_Latn"

# Maps this project's internal language keys to their FLORES-200 code,
# verified directly against Hugging Face's own FLORES-200 code list
# (huggingface.co/spaces/vsrinivas/Transcribe_English_Audio_into_any_Language,
# cross-checked against facebookresearch/flores on GitHub) rather than
# guessed -- an incorrect code here would silently mistranslate or crash.
#
# Konkani, Dogri, and Tulu are deliberately OMITTED: they did not appear
# with high confidence in the verified FLORES-200 list consulted. Rather
# than guess a code and risk a wrong/crashing translation, core/translation.py
# raises a clear "not supported" error for these three instead. Add them
# here only once you've confirmed the exact code against an authoritative
# source (e.g. the official flores200 dataset card on Hugging Face).
NLLB_LANG_CODES: dict[str, str] = {
    "hindi": "hin_Deva",
    "bengali": "ben_Beng",
    "marathi": "mar_Deva",
    "gujarati": "guj_Gujr",
    "punjabi": "pan_Guru",
    "urdu": "urd_Arab",
    "nepali": "npi_Deva",
    "sanskrit": "san_Deva",
    "sindhi": "snd_Arab",
    "odia": "ory_Orya",
    "assamese": "asm_Beng",
    "maithili": "mai_Deva",
    "tamil": "tam_Taml",
    "telugu": "tel_Telu",
    "kannada": "kan_Knda",
    "malayalam": "mal_Mlym",
}

# Language identification model (used by the routing/classification step).
#
# facebook/fasttext-language-identification (Meta's NLLB "lid218e" model)
# is used for text language-id rather than ai4bharat/IndicLID: the latter
# is distributed as custom Python code on GitHub rather than a
# transformers-loadable checkpoint on the Hub, so it cannot be loaded via
# `pipeline(...)`. fasttext-language-identification covers 217 languages,
# including every language in this registry, and is loaded via the
# `fasttext` library.
LID_TEXT_MODEL_ID = "facebook/fasttext-language-identification"
# facebook/mms-lid-256 is a standard transformers checkpoint used as the
# audio-based language-id model for spoken input.
LID_AUDIO_MODEL_ID = "facebook/mms-lid-256"


def get_profile(language_key: str) -> LanguageProfile:
    key = language_key.strip().lower()
    if key not in LANGUAGES:
        raise KeyError(
            f"Unsupported language '{language_key}'. "
            f"Supported keys: {sorted(LANGUAGES.keys())}"
        )
    return LANGUAGES[key]


def list_languages() -> list[str]:
    return sorted(LANGUAGES.keys())
