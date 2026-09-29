"""
app.py
-------
Standalone Gradio demo for the Indo-Dravidian Speech + Translation Suite.

This file is purely presentation: it imports SpeechPipeline from `core`
and wires it to a few Gradio tabs. No model logic lives here, so the same
`core` package can be dropped into a Flask/FastAPI service, a batch
script, or any other host application unchanged.

Run:
    pip install -r requirements.txt
    python app.py
"""

import logging
import traceback

import gradio as gr

from core.config import NLLB_LANG_CODES
from core.pipeline import SpeechPipeline

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Loaded once, shared across requests. Individual backend models are lazily
# loaded on first use of that language/backend, then cached in memory --
# so the FIRST transcribe/translate/synthesize call for any given
# language will be slow (downloading + loading that backend's weights)
# and later calls fast.
pipeline = SpeechPipeline()
ALL_LANGUAGES = pipeline.supported_languages()
LANGUAGE_CHOICES = ["Auto-detect"] + [k.capitalize() for k in ALL_LANGUAGES]

# Translation targets: only languages with a verified NLLB-200 code (see
# core.config.NLLB_LANG_CODES). Konkani, Dogri, and Tulu are intentionally
# excluded here rather than offered and then failing.
TRANSLATE_TARGET_CHOICES = [k.capitalize() for k in sorted(NLLB_LANG_CODES.keys())]


def _resolve_language(choice: str):
    return None if choice == "Auto-detect" else choice.lower()


def _meta_str(meta: dict) -> str:
    lines = [
        f"Language: {meta['language']} "
        f"({'auto-detected' if meta['language_auto_detected'] else 'user-selected'})",
        f"Backend: {meta['backend']}  |  Model: {meta['model_id']}",
    ]
    if "served_via" in meta:
        lines.append(f"Served via: {meta['served_via']}")
    if "translated" in meta:
        lines.append(
            "Translated to English: yes" if meta["translated"] else
            "Translated to English: no (no verified translation code for this language)"
        )
    return "\n".join(lines)


def run_stt(audio, spoken_language_choice, use_full_classifier):
    """Generator so the UI can show a 'working...' status immediately,
    then replace it with the real result (or an error) once done.

    Always translates to English (translate_to_english=True, the
    pipeline's default) -- speech in ANY supported language comes back as
    an English transcript, which is what feeds the translate step below.
    """
    if audio is None:
        yield "", "No audio received. Record something, click Stop, then try again."
        return

    yield "", "⏳ Transcribing..."

    try:
        spoken_language = _resolve_language(spoken_language_choice)
        audio_lid_mode = "classifier" if use_full_classifier else None
        text, meta = pipeline.speech_to_text(
            audio,
            language=spoken_language,
            return_meta=True,
            audio_lid_mode=audio_lid_mode,
            # translate_to_english left at its default (True) -- this demo
            # always wants English out of STT, then translates from there.
        )
        yield text, _meta_str(meta)
    except Exception as exc:  # noqa: BLE001 - surface any backend failure to the UI
        logger.error("STT failed:\n%s", traceback.format_exc())
        yield "", f"❌ Transcription failed: {exc}"


def run_translate(english_text, target_language_choice):
    if not english_text or not english_text.strip():
        yield "", "Transcribe some audio first (or type English text in the box above)."
        return

    yield "", "⏳ Translating..."

    try:
        target_language = target_language_choice.lower()
        translated, meta = pipeline.translate_text(
            english_text, target_language=target_language, return_meta=True
        )
        status = f"Translated to: {meta['target_language']}  |  Model: {meta['model_id']}"
        yield translated, status
    except Exception as exc:  # noqa: BLE001
        logger.error("Translation failed:\n%s", traceback.format_exc())
        yield "", f"❌ Translation failed: {exc}"


def run_speak_translation(translated_text, target_language_choice):
    if not translated_text or not translated_text.strip():
        yield None, "Translate some text first."
        return

    yield None, "⏳ Synthesizing... (first use of a language downloads its model)"

    try:
        target_language = target_language_choice.lower()
        audio, sample_rate, meta = pipeline.text_to_speech(
            translated_text, language=target_language, return_meta=True
        )
        status = _meta_str(meta)
        if meta.get("fell_back"):
            status += (
                "\n⚠️ indic-parler-tts was unavailable (likely gated — request "
                "access at huggingface.co/ai4bharat/indic-parler-tts), so this "
                "used the ungated MMS voice instead."
            )
        yield (sample_rate, audio), status
    except Exception as exc:  # noqa: BLE001
        logger.error("TTS failed:\n%s", traceback.format_exc())
        yield None, f"❌ Synthesis failed: {exc}"


def run_tts(text, language_choice, voice_description, use_parler):
    if not text or not text.strip():
        yield None, "Please enter some text."
        return

    yield None, "⏳ Synthesizing... (first use of a language downloads its model)"

    try:
        language = _resolve_language(language_choice)
        kwargs = {
            "language": language,
            "prefer_parler": bool(use_parler),
            "return_meta": True,
        }
        if voice_description and voice_description.strip():
            kwargs["speaker_description"] = voice_description
        audio, sample_rate, meta = pipeline.text_to_speech(text, **kwargs)
        status = _meta_str(meta)
        if meta.get("fell_back"):
            status += (
                "\n⚠️ indic-parler-tts was unavailable (likely gated — request "
                "access at huggingface.co/ai4bharat/indic-parler-tts), so this "
                "used the ungated MMS voice instead."
            )
        yield (sample_rate, audio), status
    except Exception as exc:  # noqa: BLE001
        logger.error("TTS failed:\n%s", traceback.format_exc())
        yield None, f"❌ Synthesis failed: {exc}"


with gr.Blocks(title="Indo-Dravidian Speech + Translation Suite") as demo:
    gr.Markdown(
        "# Indo-Dravidian Speech + Translation Suite\n"
        "Speak in any supported language, get an English transcript, "
        "translate it into the language of your choice, and optionally "
        "hear it spoken back — built entirely on free Hugging Face models.\n\n"
        "*Step 1 (Speech → English) runs through Hugging Face's hosted "
        "Inference API by default, falling back to a local model if "
        "unavailable, and always outputs English regardless of the "
        "spoken language. Step 2 (English → your chosen language) uses "
        "Meta's free NLLB-200 translation model. Step 3 (optional speech) "
        "uses Meta's ungated MMS voices. The first request for a given "
        "language/model downloads it, so it'll be slower than the ones "
        "after it.*"
    )

    with gr.Tab("Speech → Translate → Speech"):
        gr.Markdown("### Step 1: Speech → English")
        with gr.Row():
            with gr.Column():
                stt_audio = gr.Audio(
                    sources=["microphone", "upload"],
                    type="filepath",
                    label="Audio input",
                )
                stt_lang = gr.Dropdown(
                    LANGUAGE_CHOICES,
                    value="Auto-detect",
                    label="Spoken language (optional hint, not the output language)",
                    info=(
                        "Auto-detect is fast and usually accurate, but on quiet, "
                        "short, or unclear audio Whisper can occasionally "
                        "mis-detect the language. If a transcript looks wrong, "
                        "re-run with the spoken language selected here -- it's "
                        "forced on every path (including the hosted API) and is "
                        "both faster and more reliable than auto-detect. Output "
                        "is always English either way."
                    ),
                )
                stt_full_lid = gr.Checkbox(
                    value=False,
                    label="Use full audio-language classifier (slower, ~3.9GB download)",
                    info=(
                        "Only needed to auto-detect Odia/Assamese/Maithili/"
                        "Konkani/Dogri/Tulu without selecting them manually above. "
                        "Leave off for everything else -- it adds a large one-time "
                        "download and extra latency to every request."
                    ),
                )
                stt_button = gr.Button("Transcribe to English", variant="primary")
            with gr.Column():
                stt_output = gr.Textbox(label="English transcript", lines=5)
                stt_meta_output = gr.Textbox(label="Status / routing details", lines=4)
        stt_button.click(
            run_stt,
            inputs=[stt_audio, stt_lang, stt_full_lid],
            outputs=[stt_output, stt_meta_output],
        )

        gr.Markdown("### Step 2: English → your chosen language")
        with gr.Row():
            with gr.Column():
                translate_lang = gr.Dropdown(
                    TRANSLATE_TARGET_CHOICES,
                    value="Malayalam",
                    label="Translate to",
                    info=(
                        "Covers every language in this table with a verified "
                        "NLLB-200 code, including all 4 Dravidian languages "
                        "(Tamil, Telugu, Kannada, Malayalam)."
                    ),
                )
                translate_button = gr.Button("Translate", variant="primary")
            with gr.Column():
                translate_output = gr.Textbox(label="Translated text", lines=5)
                translate_meta_output = gr.Textbox(label="Status", lines=2)
        translate_button.click(
            run_translate,
            inputs=[stt_output, translate_lang],
            outputs=[translate_output, translate_meta_output],
        )

        gr.Markdown("### Step 3 (optional): hear the translation")
        with gr.Row():
            with gr.Column():
                speak_button = gr.Button("🔊 Speak translation")
            with gr.Column():
                speak_output = gr.Audio(label="Synthesized speech")
                speak_meta_output = gr.Textbox(label="Status / routing details", lines=4)
        speak_button.click(
            run_speak_translation,
            inputs=[translate_output, translate_lang],
            outputs=[speak_output, speak_meta_output],
        )

    with gr.Tab("Text → Speech (standalone)"):
        gr.Markdown(
            "Synthesize speech from typed text directly, in any supported "
            "language, without going through the translate flow above."
        )
        with gr.Row():
            with gr.Column():
                tts_text = gr.Textbox(label="Text to synthesize", lines=4, placeholder="Type or paste text here...")
                tts_lang = gr.Dropdown(LANGUAGE_CHOICES, value="Auto-detect", label="Language")
                tts_voice = gr.Textbox(
                    label="Voice style (optional, indic-parler-tts only)",
                    placeholder="e.g. 'A warm female voice speaking slowly and clearly.'",
                )
                tts_parler = gr.Checkbox(
                    value=False,
                    label="Try higher-quality indic-parler-tts (requires gated access)",
                    info=(
                        "Off by default: this model is gated. Request access at "
                        "huggingface.co/ai4bharat/indic-parler-tts and run "
                        "`huggingface-cli login`. If unavailable, the app "
                        "automatically uses the ungated MMS voice instead."
                    ),
                )
                tts_button = gr.Button("Synthesize", variant="primary")
            with gr.Column():
                tts_output = gr.Audio(label="Synthesized speech")
                tts_meta_output = gr.Textbox(label="Status / routing details", lines=4)
        tts_button.click(
            run_tts,
            inputs=[tts_text, tts_lang, tts_voice, tts_parler],
            outputs=[tts_output, tts_meta_output],
        )

    with gr.Accordion("Supported languages", open=False):
        gr.Markdown(
            "**All languages (Speech ↔ Text):** "
            + ", ".join(c for c in LANGUAGE_CHOICES if c != "Auto-detect")
            + "\n\n**Translation targets (verified NLLB-200 code):** "
            + ", ".join(TRANSLATE_TARGET_CHOICES)
            + "\n\n*Konkani, Dogri, and Tulu support Speech↔Text but not "
            "translation yet -- no verified NLLB-200 code was confirmed for "
            "them. See `core/config.py`'s `NLLB_LANG_CODES` to add one once "
            "you've verified it.*"
        )

if __name__ == "__main__":
    demo.queue().launch()
