"""
core/stt.py
------------
Modular Speech-to-Text engine.

Public surface (this is what an external application should import):

    from core.stt import SpeechToText
    stt = SpeechToText()
    text = stt.transcribe(audio_path_or_array)                     # -> English, any spoken language
    text = stt.transcribe(audio_path_or_array, language="tamil")   # hint the spoken language for accuracy

Architecture
--------------
By default, `transcribe()` always returns English text, regardless of
what language was spoken (`translate_to_english=True`, the default). This
mirrors the two-stage design of the whole system: STT converts speech in
any language to English (this module), then `core/translation.py`
converts that English text into whichever language the user actually
wants, using Meta's free NLLB-200 model. Generic `openai/whisper-large-v3`
handles this well, so it remains the model in use -- only the *task* it's
asked to perform changes based on `translate_to_english`.

* Whisper backend: Whisper natively supports a "translate" task (output
  is always English, whatever language was spoken) in addition to its
  "transcribe" task (output stays in the spoken language). This class
  forces `task="translate"` whenever `translate_to_english=True`. Pass
  `translate_to_english=False` (per-instance or per-call) to instead get a
  same-language transcript via `task="transcribe"`.

  `openai/whisper-large-v3` is confirmed servable through Hugging Face's
  hosted Inference API (huggingface_hub.InferenceClient.automatic_speech_recognition),
  so by default this class calls the API first -- no multi-gigabyte local
  download, no GPU required. If the API call fails for any reason (no
  token, token lacks the "Inference Providers" permission, the model is
  briefly unavailable, no internet, etc.) it automatically falls back to
  loading `openai/whisper-large-v3` locally via `transformers`. Pass
  `use_inference_api=False` to force local-only behaviour.

* MMS-ASR backend (the fallback for languages Whisper doesn't cover well:
  Odia, Assamese, Maithili, Konkani, Dogri, Tulu): this is a CTC model, not
  an autoregressive one -- it has no "translate" task at all, only
  transcription in the spoken language. To still honor
  `translate_to_english=True` for these languages, this class transcribes
  natively first, then runs that native text through
  `core.translation.TextTranslator` (Meta's NLLB-200) to produce English.
  This only works for languages with a verified NLLB code (see
  `core.config.NLLB_LANG_CODES`) -- Konkani, Dogri, and Tulu aren't in that
  table, so for those three specifically, the native-language transcript
  is returned as-is with `meta["translated"] = False` and a note, rather
  than guessing a translation code.

  MMS-ASR always runs locally -- it isn't confirmed to be hosted by any
  Inference Provider.

Auto-detect strategy
-----------------------
When `language=None`, there are two possible strategies:

  1. "whisper_native" (the default). Skip any separate classification step
     entirely. Whisper auto-detects the spoken language internally as a
     normal part of translation/transcription -- using the exact same
     weights already needed to do the work. Fast, no extra download.

  2. "classifier" (opt-in). Run `facebook/mms-lid-256` first to classify
     the language, then route to whichever backend that language maps to.
     This is the only way to auto-route audio in a language Whisper
     doesn't cover to the correct MMS-ASR adapter automatically, but it's
     a ~3.9GB extra model, so it's opt-in rather than the default.
"""

from __future__ import annotations

import logging
import tempfile
from typing import Optional, Union

from .config import NLLB_LANG_CODES, STTBackend, STT_MODEL_IDS, get_profile
from .lang_id import AudioLanguageIdentifier
from .translation import TextTranslator

logger = logging.getLogger(__name__)

AudioInput = Union[str, dict]  # file path, or {"array": np.ndarray, "sampling_rate": int}


class SpeechToText:
    def __init__(
        self,
        device: Optional[str] = None,
        use_inference_api: bool = True,
        hf_token: Optional[str] = None,
        audio_lid_mode: str = "whisper_native",
        translate_to_english: bool = True,
    ):
        """
        device: e.g. "cuda:0", "cpu", or None to let transformers decide.
                Only affects LOCAL paths; irrelevant when the hosted
                Inference API successfully serves the request.
        use_inference_api: if True (default), the Whisper backend tries the
                hosted HF Inference API first and only falls back to a local
                model on failure. Set False to always run locally.
        hf_token: explicit HF token. If None, huggingface_hub falls back to
                whatever token `huggingface-cli login` cached on this
                machine. The token needs the "Inference Providers"
                permission (not just "Read") for the API path to work.
        audio_lid_mode: "whisper_native" (default, fast, no extra model) or
                "classifier" (loads facebook/mms-lid-256, ~3.9GB, needed
                only to auto-route MMS-ASR-only languages without the
                caller specifying one). See the module docstring above.
        translate_to_english: if True (default), `transcribe()` always
                returns English text regardless of the spoken language
                (Whisper's "translate" task, or native transcription +
                NLLB translation for MMS-ASR-only languages). Set False to
                instead get a same-language transcript.
        """
        if audio_lid_mode not in ("whisper_native", "classifier"):
            raise ValueError("audio_lid_mode must be 'whisper_native' or 'classifier'")
        self.device = device
        self.use_inference_api = use_inference_api
        self.hf_token = hf_token
        self.audio_lid_mode = audio_lid_mode
        self.translate_to_english = translate_to_english
        self._pipelines: dict[tuple[STTBackend, str], object] = {}
        self._inference_client = None
        self._lang_id: Optional[AudioLanguageIdentifier] = None
        self._translator: Optional[TextTranslator] = None

    # -- internal: lazy model / client loading --------------------------
    def _get_backend_pipeline(self, backend: STTBackend, model_id: str):
        key = (backend, model_id)
        if key not in self._pipelines:
            from transformers import pipeline
            logger.info("Loading local STT backend '%s' -> %s", backend.value, model_id)
            self._pipelines[key] = pipeline(
                "automatic-speech-recognition",
                model=model_id,
                device=self.device,
            )
        return self._pipelines[key]

    def _get_inference_client(self):
        if self._inference_client is None:
            from huggingface_hub import InferenceClient
            self._inference_client = InferenceClient(api_key=self.hf_token)
        return self._inference_client

    def _get_lang_id(self) -> AudioLanguageIdentifier:
        if self._lang_id is None:
            self._lang_id = AudioLanguageIdentifier(device=self.device)
        return self._lang_id

    def _get_translator(self) -> TextTranslator:
        if self._translator is None:
            self._translator = TextTranslator(device=self.device)
        return self._translator

    @staticmethod
    def _as_api_input(audio: AudioInput) -> str:
        """The hosted Inference API wants a file path or raw bytes. If the
        caller passed a {"array": ..., "sampling_rate": ...} dict instead
        (e.g. another app feeding in raw numpy audio), write it to a
        temporary wav file first."""
        if isinstance(audio, str):
            return audio
        import soundfile as sf
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        sf.write(tmp.name, audio["array"], audio["sampling_rate"])
        return tmp.name

    def _build_whisper_generate_kwargs(self, profile, want_english: bool) -> dict:
        """Generation overrides applied to every Whisper call, local or
        hosted.

        `task` is forced UNCONDITIONALLY -- either "translate" (output is
        always English, whatever language was spoken) or "transcribe"
        (output stays in the spoken language), based on `want_english`.
        Leaving this unset is what previously produced inconsistent
        behavior depending on the model/provider's own default.

        `no_repeat_ngram_size` + `repetition_penalty` guard against a
        well-documented Whisper decoder failure mode: it gets stuck
        repeating one phrase dozens of times (classic examples: "I have
        been doing this for a week", "Thank you for watching"). This
        happens most on quiet, short, or unclear audio regardless of
        language, so these guards are applied unconditionally too.

        If a specific spoken language is known (explicitly given, or
        classified), it's also forced here via `language` -- this helps
        accuracy for both tasks and works even over the hosted Inference
        API (see `_transcribe_via_api`'s use of `extra_body`).
        """
        kwargs = {
            "no_repeat_ngram_size": 3,
            "repetition_penalty": 1.3,
            "task": "translate" if want_english else "transcribe",
        }
        if profile is not None:
            kwargs["language"] = profile.iso1
        return kwargs

    def _transcribe_via_api(
        self, audio: AudioInput, model_id: str, generate_kwargs: Optional[dict] = None
    ) -> str:
        client = self._get_inference_client()
        api_input = self._as_api_input(audio)
        # `extra_body` forwards additional provider-specific parameters;
        # for the hf-inference provider (and Whisper specifically) this is
        # the documented way to pass generation overrides, nested exactly
        # like the local transformers pipeline's `generate_kwargs` dict.
        extra_body = {"generate_kwargs": generate_kwargs} if generate_kwargs else None
        result = client.automatic_speech_recognition(api_input, model=model_id, extra_body=extra_body)
        # InferenceClient returns an object/dict with a `.text` field
        # depending on huggingface_hub version; handle both.
        text = getattr(result, "text", None)
        if text is None and isinstance(result, dict):
            text = result.get("text", "")
        return (text or "").strip()

    # -- public API --------------------------------------------------------
    def detect_language(self, audio: AudioInput) -> str:
        """Run the (opt-in, ~3.9GB) audio language-id classifier and
        return an internal language key (e.g. 'kannada'). Only needed if
        you want audio auto-routed to an MMS-ASR-only language without
        specifying it -- see the module docstring."""
        return self._get_lang_id().predict(audio)

    def transcribe(
        self,
        audio: AudioInput,
        language: Optional[str] = None,
        return_meta: bool = False,
        audio_lid_mode: Optional[str] = None,
        translate_to_english: Optional[bool] = None,
    ):
        """
        Transcribe (and, by default, translate) `audio` to text.

        Parameters
        ----------
        audio: file path or {"array": ..., "sampling_rate": ...}
        language: internal SPOKEN-language key (see
                  core.config.list_languages()). If None, behavior depends
                  on `audio_lid_mode` -- by default, Whisper is called
                  directly and auto-detects the spoken language itself.
                  This is a hint for accuracy/routing, NOT the output
                  language -- the output is English unless
                  `translate_to_english=False`.
        return_meta: if True, return (text, meta_dict) instead of just text.
        audio_lid_mode: per-call override of the instance-level setting
                  ("whisper_native" or "classifier").
        translate_to_english: per-call override of the instance-level
                  setting. See the class docstring.

        Returns
        -------
        str, or (str, dict) if return_meta=True. The dict contains the
        detected/used spoken language (a registry key, or "auto"), which
        backend/model served the request, whether it was served remotely
        or locally, and whether English translation was actually applied
        (`meta["translated"]`) -- this can be False even when
        `translate_to_english=True` for the 3 MMS-ASR-only languages
        without a verified NLLB code (Konkani, Dogri, Tulu).
        """
        lid_mode = self.audio_lid_mode if audio_lid_mode is None else audio_lid_mode
        want_english = (
            self.translate_to_english if translate_to_english is None else translate_to_english
        )
        detected = language is None
        profile = None

        if language is not None:
            profile = get_profile(language)
        elif lid_mode == "classifier":
            language = self.detect_language(audio)
            profile = get_profile(language)
        # else: lid_mode == "whisper_native" -- leave profile=None and
        # language=None; Whisper will auto-detect internally below.

        backend = profile.stt_backend if profile is not None else STTBackend.WHISPER
        model_id = STT_MODEL_IDS[backend]
        served_via = "local"
        text: Optional[str] = None
        translated = False

        whisper_generate_kwargs = (
            self._build_whisper_generate_kwargs(profile, want_english)
            if backend == STTBackend.WHISPER else None
        )

        if backend == STTBackend.WHISPER and self.use_inference_api:
            try:
                text = self._transcribe_via_api(audio, model_id, generate_kwargs=whisper_generate_kwargs)
                served_via = "hosted_inference_api"
                translated = want_english
            except Exception as exc:  # noqa: BLE001 - any API failure -> fall back
                logger.warning(
                    "Hosted Inference API STT call failed (%s); "
                    "falling back to a local Whisper model.", exc
                )
                text = None

        if text is None:
            asr_pipe = self._get_backend_pipeline(backend, model_id)

            if backend == STTBackend.WHISPER:
                generate_kwargs = whisper_generate_kwargs
                result = asr_pipe(audio, generate_kwargs=generate_kwargs)
                text = result["text"].strip() if isinstance(result, dict) else str(result).strip()
                translated = want_english
            elif backend == STTBackend.MMS_ASR:
                # MMS-ASR is a CTC model: no generate_kwargs, no
                # translate task -- just load the correct language
                # adapter and transcribe natively. (profile is always set
                # here, since MMS_ASR is only reached via an
                # explicit/classified language, never the whisper_native
                # fast path.)
                model = getattr(asr_pipe, "model", None)
                if model is not None and hasattr(model, "load_adapter"):
                    try:
                        model.load_adapter(profile.iso3)
                    except Exception as exc:  # pragma: no cover - depends on ckpt
                        logger.warning(
                            "Could not load MMS adapter for '%s' (%s); "
                            "falling back to default adapter.", profile.iso3, exc
                        )
                result = asr_pipe(audio)
                native_text = result["text"].strip() if isinstance(result, dict) else str(result).strip()

                if want_english and language in NLLB_LANG_CODES:
                    # MMS-ASR can't translate on its own -- chain through
                    # NLLB to still honor translate_to_english=True.
                    text = self._get_translator().translate(
                        native_text, target_language="english", source_language=language
                    )
                    translated = True
                else:
                    # No verified NLLB code for this language (Konkani,
                    # Dogri, Tulu) -- return the native transcript rather
                    # than guess a translation code.
                    text = native_text
                    translated = False

            served_via = "local"

        if return_meta:
            meta = {
                "language": language if language is not None else "auto",
                "language_auto_detected": detected,
                "backend": backend.value,
                "model_id": model_id,
                "served_via": served_via,
                "translated": translated,
            }
            return text, meta
        return text
