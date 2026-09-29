"""
core/text_utils.py
--------------------
Small shared text-processing helpers used by more than one module
(core/tts.py and core/translation.py both need to split long text into
model-sized chunks before feeding it to a generation model).
"""

from __future__ import annotations

import re

# A conservative default chunk size that works across TTS (VITS/parler)
# and translation (NLLB) models -- all of these have limited input
# lengths and produce worse output (or outright fail) on very long text.
DEFAULT_MAX_CHARS_PER_CHUNK = 300

# Sentence terminators across the scripts this project handles: ASCII
# ".!?", the Devanagari danda "।" and double danda "॥" (also used in
# Bengali, Odia, Gujarati, Punjabi etc.), and the Urdu full stop "۔".
_SENTENCE_END_RE = re.compile(r"(?<=[.!?।॥۔])\s+")


def chunk_text(text: str, max_chars: int = DEFAULT_MAX_CHARS_PER_CHUNK) -> list[str]:
    """Split `text` into chunks of at most ~max_chars, preferring sentence
    boundaries. Falls back to whitespace splitting for run-on sentences
    that are themselves longer than max_chars."""
    text = " ".join(text.split())  # normalize whitespace/newlines
    if len(text) <= max_chars:
        return [text] if text else []

    chunks: list[str] = []
    current = ""

    def flush():
        nonlocal current
        if current.strip():
            chunks.append(current.strip())
        current = ""

    for sentence in _SENTENCE_END_RE.split(text):
        if not sentence.strip():
            continue
        # A single sentence longer than the limit: break it on whitespace.
        if len(sentence) > max_chars:
            flush()
            words = sentence.split()
            for word in words:
                if len(current) + len(word) + 1 > max_chars:
                    flush()
                current = f"{current} {word}".strip()
            flush()
            continue

        if len(current) + len(sentence) + 1 > max_chars:
            flush()
        current = f"{current} {sentence}".strip()

    flush()
    return chunks
