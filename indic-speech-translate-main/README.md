# Indo-Dravidian Speech + Translation Suite

Speak in any supported Indo-Aryan or Dravidian language, get an English
transcript, translate it into whichever language you choose, and
optionally hear it spoken back — all on free, mostly-ungated Hugging Face
models.

## 1. Architecture

```
indic_speech_system/
├── core/                     # <-- integrate THIS into any external app
│   ├── config.py             # language registry + model routing table
│   ├── lang_id.py            # text & audio language classifiers
│   ├── stt.py                # SpeechToText: audio (any language) -> English
│   ├── translation.py        # TextTranslator: English <-> chosen language
│   ├── tts.py                # TextToSpeech: text -> speech
│   ├── text_utils.py         # shared long-text chunking (TTS + translation)
│   └── pipeline.py           # SpeechPipeline facade (single import point)
├── app.py                    # Gradio demo -- UI only, imports core.pipeline
├── tests/
│   └── test_pipeline.py      # mocked unit tests for routing logic
├── requirements.txt
└── README.md
```

**Separation of concerns:** `app.py` never touches a model directly — it
only calls `SpeechPipeline` methods. Any other host application (a REST
API, a batch job, another product) can depend on the `core` package the
same way and ignore `app.py` entirely.

### The three-stage pipeline

```
  Speech (any supported language)
         │  core/stt.py -- openai/whisper-large-v3, task="translate"
         ▼
  English text
         │  core/translation.py -- facebook/nllb-200-distilled-600M
         ▼
  Text in your chosen language
         │  core/tts.py -- facebook/mms-tts-<lang> (or ai4bharat/indic-parler-tts)
         ▼
  Speech in your chosen language   (optional)
```

`SpeechPipeline.speech_to_speech_translate(audio, target_language=...)`
runs all three stages in one call. Each stage is also usable standalone
(`speech_to_text`, `translate_text`, `text_to_speech`) since the whole
point of this design is that any of the three can be swapped, skipped, or
used independently by a host application.

### Why "always translate to English" by default?

Whisper has two distinct tasks: **transcribe** (output stays in the
spoken language) and **translate** (output is always English, whatever
language was spoken). `core/stt.py` now defaults to `task="translate"`
for every call, so `speech_to_text()` always returns English regardless
of the input language — this was a deliberate architecture choice (not a
one-off setting) so that a single, uniform "any language in -> English
out" contract can feed the translation stage. Pass
`translate_to_english=False` (per-instance or per-call) to instead get a
same-language transcript, exactly like a more conventional ASR system.

`facebook/mms-1b-all` (the MMS-ASR fallback backend for languages Whisper
doesn't cover: Odia, Assamese, Maithili, Konkani, Dogri, Tulu) is a CTC
model with no translate task at all. To honor the same "always English"
contract for these languages too, `core/stt.py` transcribes natively
first, then runs that native text through `core/translation.py` (NLLB) to
produce English — automatically, with no extra step for the caller.
Konkani, Dogri, and Tulu don't have a verified NLLB code (see below), so
for those three specifically the native transcript is returned as-is,
flagged with `meta["translated"] = False`.

## 2. Model routing

| Task | Model | Notes |
|---|---|---|
| Speech → English | `openai/whisper-large-v3` | Hosted via HF's Inference API by default, falls back to local automatically. Covers Hindi, Bengali, Marathi, Gujarati, Punjabi, Urdu, Nepali, Sanskrit, Sindhi, Tamil, Telugu, Kannada, Malayalam natively; auto-detects the spoken language when none is given. |
| Speech → native text (fallback) | `facebook/mms-1b-all` | Local only, adapter-based. Covers Odia, Assamese, Maithili, Konkani, Dogri, Tulu — the languages Whisper doesn't handle well. Chained through NLLB (below) to still produce English by default. |
| English ↔ chosen language | `facebook/nllb-200-distilled-600M` | Meta's NLLB ("No Language Left Behind"), free, **ungated**, 200 languages, standard `transformers` translation pipeline. |
| Text → speech | `facebook/mms-tts-<iso3>` | **Ungated**, ~145MB per language, the default TTS voice for every language in the registry. |
| Text → speech (optional upgrade) | `ai4bharat/indic-parler-tts` | Higher quality, natural-language voice prompts, but **gated** — requires requesting access at [huggingface.co/ai4bharat/indic-parler-tts](https://huggingface.co/ai4bharat/indic-parler-tts). Falls back to MMS automatically if unavailable. Off by default (`prefer_parler=False`). |
| Audio language-id (opt-in) | `facebook/mms-lid-256` | ~3.9GB, only needed to auto-route the 6 MMS-ASR-only languages without picking one manually. Off by default — Whisper's own auto-detection handles the rest for free. |
| Text language-id | `facebook/fasttext-language-identification` | Meta's NLLB "lid218e" model, loaded via the `fasttext` library. Used by `core/tts.py` when no language is given for synthesis. |

### Translation language coverage

`core/config.py`'s `NLLB_LANG_CODES` maps this project's language keys to
their exact [FLORES-200](https://github.com/facebookresearch/flores/blob/main/flores200/README.md)
code, verified directly against Hugging Face's own reference rather than
guessed:

**Supported (16):** Hindi, Bengali, Marathi, Gujarati, Punjabi, Urdu,
Nepali, Sanskrit, Sindhi, Odia, Assamese, Maithili, Tamil, Telugu,
Kannada, Malayalam — including all 4 Dravidian languages.

**Not yet supported for translation:** Konkani, Dogri, Tulu. These three
didn't appear with high confidence in the verified FLORES-200 list
consulted, so rather than guess a code and risk a silent
mistranslation or a crash, `core/translation.py` raises a clear error for
them instead. Speech-to-text and text-to-speech still work fine for these
three — only the *translation* step is unavailable until someone verifies
the exact code and adds it to `NLLB_LANG_CODES`.

## 3. Installation

```bash
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate

pip install -r requirements.txt
```

Notes:
* A GPU is optional but recommended for local fallback paths; everything
  also runs on CPU, just more slowly.
* `openai/whisper-large-v3` is called through Hugging Face's hosted
  Inference API by default. Create a free token at
  [huggingface.co/settings/tokens](https://huggingface.co/settings/tokens)
  with **"Make calls to Inference Providers"** checked (a plain read-only
  token will silently fail this and fall back to a local download every
  time), then run `huggingface-cli login` once. Every other model used by
  default (`facebook/nllb-200-distilled-600M`, `facebook/mms-tts-*`,
  `facebook/mms-1b-all`, `facebook/mms-lid-256`,
  `facebook/fasttext-language-identification`) is ungated and downloads
  anonymously. The one exception is the optional
  `ai4bharat/indic-parler-tts`, which is gated.
* `parler_tts` is NOT installed by default — only needed for the optional
  gated indic-parler-tts upgrade:
  ```
  pip install git+https://github.com/huggingface/parler-tts.git
  ```

## 4. Running the demo

```bash
python app.py
```

The demo has two tabs:
* **Speech → Translate → Speech**: record or upload audio (Step 1: always
  produces an English transcript), pick a target language and translate
  (Step 2), then optionally synthesize and play back that translation
  (Step 3).
* **Text → Speech (standalone)**: synthesize speech from typed text
  directly, in any supported language, without going through the
  translate flow.

Each result panel shows which backend/model actually served the request
(hosted API vs local, which TTS voice, whether NLLB translation was
actually applied) so you can see the routing decisions in action.

## 5. Integrating into another application

```python
from core.pipeline import SpeechPipeline

pipeline = SpeechPipeline(device="cuda:0")  # or "cpu", or None

# Full pipeline: speech in any language -> chosen language's speech
result = pipeline.speech_to_speech_translate("call_recording.wav", target_language="tamil")
print(result["english_text"])       # STT stage output
print(result["translated_text"])    # translation stage output
# result["audio"], result["sample_rate"] -- the synthesized speech

# Or use each stage independently:
english_text = pipeline.speech_to_text("call_recording.wav")               # -> English, any spoken language
same_language_text = pipeline.speech_to_text("call_recording.wav", translate_to_english=False)

tamil_text = pipeline.translate_text(english_text, target_language="tamil")

audio, sample_rate = pipeline.text_to_speech(tamil_text, language="tamil")

print(pipeline.supported_languages())
```

`SpeechToText`, `TextTranslator`, and `TextToSpeech` are also directly
importable from `core.stt`, `core.translation`, and `core.tts`
respectively if you only need one stage.

## 6. Supported languages (Speech ↔ Text)

**Indo-Aryan:** Hindi, Bengali, Marathi, Gujarati, Punjabi, Urdu, Nepali,
Sanskrit, Sindhi, Odia, Assamese, Maithili, Konkani, Dogri

**Dravidian:** Tamil, Telugu, Kannada, Malayalam, Tulu

(Translation coverage is a subset of this list — see Section 2.)

## 7. Testing

```bash
pytest tests/test_pipeline.py -v
```

These tests mock out all model loading/inference so they run instantly
and without network access — 35 tests covering registry integrity, the
always-English STT default and its opt-out, the MMS-ASR→NLLB translation
chaining (including the Konkani/Dogri/Tulu "no verified code" case),
translation code resolution, TTS backend routing and gated-model
fallback, text chunking, and the SpeechPipeline facade.

## 8. Known Limitations

* Recognition and synthesis quality varies by language: the languages
  Whisper natively supports well are meaningfully stronger than the
  MMS-ASR fallback path, reflecting differing amounts of training data
  available for each language.
* Translation coverage (Section 2) is a subset of the full language list.
  Konkani, Dogri, and Tulu support speech-to-text and text-to-speech, but
  not translation, pending verification of their exact FLORES-200 code.
* `ai4bharat/indic-parler-tts` requires requesting access
  (see Section 2); the system falls back to the ungated MMS voice
  automatically when it is unavailable.
* Batch/streaming inference, voice-activity-based chunking for long
  recordings, and speaker diarization are out of scope for this base
  system, but can be layered on top of `core/stt.py` without changing its
  routing logic.

## 9. Implementation Notes

Notes on non-obvious implementation choices, for anyone extending this
project:

* **Whisper model choice.** `openai/whisper-large-v3` is used rather than
  `whisper-large-v3-turbo`: turbo's own model card and independent
  benchmarks report a measured accuracy gap (~2.5 WER points) on
  multilingual/low-resource content, which matters for this project.
* **Text language-id.** `facebook/fasttext-language-identification` is
  used rather than `ai4bharat/IndicLID`, since the latter is distributed
  as custom code on GitHub rather than a `transformers`-loadable
  checkpoint and cannot be loaded via `pipeline(...)`.
* **`numpy` pin.** `requirements.txt` pins `numpy<2.0` because
  `fasttext-wheel` (the text language-id backend) is incompatible with
  NumPy 2.x's changed `np.array(..., copy=False)` semantics.
* **Audio language-id is opt-in.** `facebook/mms-lid-256` (~3.9GB) is
  only loaded when `audio_lid_mode="classifier"` is explicitly requested.
  By default, Whisper's own internal language detection is used instead,
  which requires no additional model and adds no extra latency.
* **Bundled ffmpeg.** Local audio decoding depends on `ffmpeg` being
  resolvable on PATH under an exact filename match. `imageio-ffmpeg`
  provides a portable binary with no system install step; see
  `core/config.py::_ensure_ffmpeg_on_path` for the exact mechanism,
  including why simply adding the bundled binary's directory to PATH is
  insufficient on Windows.
* **Gradio version pin.** `requirements.txt` pins `gradio>=5.0,<6`.
  Certain Gradio 6.x builds have a live-waveform-rendering regression that
  can freeze the browser tab while recording from the microphone; the 5.x
  line does not have this regression.
* **Whisper repetition guard.** `no_repeat_ngram_size=3` and
  `repetition_penalty=1.3` are applied unconditionally on every Whisper
  call to guard against a documented decoder failure mode where it can
  become stuck repeating a single phrase, particularly on quiet, short, or
  unclear audio.
