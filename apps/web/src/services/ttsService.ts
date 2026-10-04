/**
 * ttsService.ts
 * -------------
 * Text-to-Speech service for MediKiok Voice-Guided Patient Intake.
 *
 * Speeds up accessibility by speaking questions aloud in Odia (or user's selected language).
 *
 * Key guarantees:
 * 1. Strict Request ID & AbortController tracking:
 *    When stop() is called (on skip, next, back, or unmount), any in-flight
 *    backend TTS fetch is aborted IMMEDIATELY and discarded. It NEVER plays
 *    audio for a previously skipped question.
 * 2. Instant In-Memory Audio Caching & Background Pre-fetching:
 *    Intake questions are prefetched and cached so audio plays with 0ms
 *    network latency instead of waiting 2 seconds.
 * 3. Dedicated Odia TTS Guard:
 *    Avoids browser SpeechSynthesis for Odia because browsers lack Odia phoneme
 *    models (which causes audio stuttering, queue hangs, and repeat bugs).
 */

import { VOICE_TTS_ENDPOINT } from './apiConfig';

class TTSService {
  private currentAudio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private currentBufferSource: AudioBufferSourceNode | null = null;
  private isCurrentlySpeaking: boolean = false;
  private currentRequestId: number = 0;
  private abortController: AbortController | null = null;
  private audioCache: Map<string, string> = new Map();

  private backendTtsUrl: string = VOICE_TTS_ENDPOINT;

  constructor() {
    this.initAudioUnlock();
  }

  /**
   * Proactively unlock AudioContext on user interaction so Safari permits async playback
   */
  private initAudioUnlock(): void {
    if (typeof window === 'undefined') return;
    const unlock = () => {
      try {
        const ctx = this.getAudioContext();
        if (ctx && ctx.state === 'suspended') {
          ctx.resume();
        }
      } catch {
        // Ignore
      }
    };
    window.addEventListener('click', unlock, { passive: true });
    window.addEventListener('touchstart', unlock, { passive: true });
    window.addEventListener('touchend', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }

  public getAudioContext(): AudioContext | null {
    if (!this.audioContext && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.audioContext = new AudioCtx();
      }
    }
    return this.audioContext;
  }

  /**
   * Stop any current speech synthesis, HTML5 audio, or pending network fetch immediately.
   */
  public stop(): void {
    // 1. Invalidate any in-flight request immediately
    this.currentRequestId++;
    this.isCurrentlySpeaking = false;

    // 2. Abort pending fetch
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch {
        // Ignore abort errors
      }
      this.abortController = null;
    }

    // 3. Stop and disconnect Web Audio BufferSource if active
    if (this.currentBufferSource) {
      try {
        this.currentBufferSource.stop();
        this.currentBufferSource.disconnect();
      } catch {
        // Ignore
      }
      this.currentBufferSource = null;
    }

    // 4. Halt and silence current HTML5 Audio
    if (this.currentAudio) {
      try {
        this.currentAudio.pause();
        this.currentAudio.currentTime = 0;
        this.currentAudio.onended = null;
        this.currentAudio.onerror = null;
        this.currentAudio.src = '';
      } catch {
        // Ignore pause errors
      }
      this.currentAudio = null;
    }

    // 5. Cancel browser SpeechSynthesis
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {
        // Ignore cancel errors
      }
    }
  }

  public isSpeaking(): boolean {
    return this.isCurrentlySpeaking;
  }

  /**
   * Pre-fetches question audio in the background so it plays with 0ms latency.
   */
  public async prefetch(text: string, language: string = 'or'): Promise<void> {
    if (!text || !text.trim()) return;
    const langParam = language || 'or';
    const cacheKey = `${langParam}:${text.trim()}`;
    if (this.audioCache.has(cacheKey)) return;

    try {
      const resp = await fetch(this.backendTtsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), language: langParam }),
      });
      if (resp.ok) {
        const data = await resp.json();
        if (data.status === 'success' && data.audio_base64) {
          this.audioCache.set(cacheKey, data.audio_base64);
        }
      }
    } catch {
      // Ignore background prefetch errors
    }
  }

  /**
   * Speak the given question text. Resolves when speech finishes playing.
   */
  public async speak(text: string, language: string = 'or'): Promise<boolean> {
    if (!text || !text.trim()) {
      return false;
    }

    // Stop and cancel any existing audio or fetch immediately
    this.stop();

    const myRequestId = ++this.currentRequestId;
    this.abortController = new AbortController();
    this.isCurrentlySpeaking = true;

    // First attempt: Backend Sarvam bulbul:v3 for studio-grade authentic speech
    try {
      const played = await this.speakViaBackend(text, language, myRequestId, this.abortController.signal);
      if (myRequestId !== this.currentRequestId) {
        return false;
      }
      if (played) {
        this.isCurrentlySpeaking = false;
        return true;
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.warn('[TTS] Backend TTS failed:', err);
      }
    }

    if (myRequestId !== this.currentRequestId) {
      return false;
    }

    // For non-English Indic scripts without native browser TTS voices, don't garble speech
    if (['or', 'bn', 'ta', 'te', 'kn', 'ml', 'mr', 'gu', 'pa', 'as', 'ur'].includes(language)) {
      this.isCurrentlySpeaking = false;
      return false;
    }

    // Fallback attempt: Browser SpeechSynthesis for Hindi/English
    try {
      const played = await this.speakViaBrowser(text, language, myRequestId);
      if (myRequestId === this.currentRequestId) {
        this.isCurrentlySpeaking = false;
      }
      return played;
    } catch (err) {
      console.warn('[TTS] Browser SpeechSynthesis failed:', err);
      if (myRequestId === this.currentRequestId) {
        this.isCurrentlySpeaking = false;
      }
      return false;
    }
  }

  /**
   * Play high-fidelity audio from backend /api/tts with caching & abort signal
   */
  private async speakViaBackend(
    text: string,
    language: string,
    requestId: number,
    signal: AbortSignal
  ): Promise<boolean> {
    const langParam = language || 'or';
    const cleanText = text.replace(/’/g, "'").trim();
    const cacheKey = `${langParam}:${cleanText}`;

    let base64Audio: string | undefined =
      this.audioCache.get(cacheKey) || this.audioCache.get(`${langParam}:${text.trim()}`);

    if (!base64Audio) {
      if (signal.aborted || requestId !== this.currentRequestId) {
        return false;
      }

      const resp = await fetch(this.backendTtsUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: text.trim(), language: langParam }),
        signal,
      });

      if (signal.aborted || requestId !== this.currentRequestId) {
        return false;
      }

      if (!resp.ok) {
        return false;
      }

      const data = await resp.json();
      if (signal.aborted || requestId !== this.currentRequestId) {
        return false;
      }

      if (data.status !== 'success' || !data.audio_base64) {
        return false;
      }

      const audioStr: string = data.audio_base64;
      base64Audio = audioStr;
      this.audioCache.set(cacheKey, audioStr);
    }

    if (signal.aborted || requestId !== this.currentRequestId) {
      return false;
    }

    // Convert base64 to binary ArrayBuffer
    let arrayBuffer: ArrayBuffer;
    try {
      const byteCharacters = atob(base64Audio);
      arrayBuffer = new ArrayBuffer(byteCharacters.length);
      const uint8 = new Uint8Array(arrayBuffer);
      for (let i = 0; i < byteCharacters.length; i++) {
        uint8[i] = byteCharacters.charCodeAt(i);
      }
    } catch {
      return false;
    }

    // 1. Try Web Audio API first — this bypasses Safari's strict play() restriction once unlocked!
    const ctx = this.getAudioContext();
    if (ctx) {
      try {
        if (ctx.state === 'suspended') {
          await ctx.resume();
        }
        // WebKit requires a slice copy for decodeAudioData
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer.slice(0));

        if (signal.aborted || requestId !== this.currentRequestId) {
          return false;
        }

        return await new Promise<boolean>((resolve) => {
          const source = ctx.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(ctx.destination);
          this.currentBufferSource = source;

          source.onended = () => {
            if (this.currentBufferSource === source) {
              this.currentBufferSource = null;
            }
            resolve(requestId === this.currentRequestId);
          };

          source.start(0);
        });
      } catch (audioCtxErr) {
        console.warn('[TTS] Web Audio API failed, trying HTML5 Audio fallback:', audioCtxErr);
      }
    }

    // 2. Fallback to HTML5 Audio Element
    return new Promise((resolve) => {
      let audioSrc = `data:audio/wav;base64,${base64Audio}`;
      let objectUrl: string | null = null;
      try {
        const blob = new Blob([arrayBuffer], { type: 'audio/wav' });
        objectUrl = URL.createObjectURL(blob);
        audioSrc = objectUrl;
      } catch {
        // Fall back to data URI
      }

      const audio = new Audio(audioSrc);
      this.currentAudio = audio;

      const cleanup = () => {
        audio.onended = null;
        audio.onerror = null;
        if (objectUrl) {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch {
            // ignore
          }
          objectUrl = null;
        }
        if (this.currentAudio === audio) {
          this.currentAudio = null;
        }
      };

      audio.onended = () => {
        cleanup();
        if (requestId === this.currentRequestId) {
          resolve(true);
        } else {
          resolve(false);
        }
      };

      audio.onerror = (e) => {
        cleanup();
        console.warn('[TTS] Audio playback error:', e);
        resolve(false);
      };

      if (signal.aborted || requestId !== this.currentRequestId) {
        cleanup();
        resolve(false);
        return;
      }

      audio.play().catch((err) => {
        cleanup();
        if (err.name !== 'AbortError') {
          console.warn('[TTS] Play promise rejected:', err);
        }
        resolve(false);
      });
    });
  }

  /**
   * Fallback using Web Speech API window.speechSynthesis
   */
  private async speakViaBrowser(
    text: string,
    language: string,
    requestId: number
  ): Promise<boolean> {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return false;
    }

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      const langCode = language === 'hi' ? 'hi-IN' : 'en-IN';
      utterance.lang = langCode;

      const voices = window.speechSynthesis.getVoices();
      const matchingVoice = voices.find(
        (v) => v.lang.toLowerCase().startsWith(language)
      );
      if (matchingVoice) {
        utterance.voice = matchingVoice;
      }

      let finished = false;
      const done = (val: boolean) => {
        if (!finished) {
          finished = true;
          if (requestId === this.currentRequestId) {
            resolve(val);
          } else {
            resolve(false);
          }
        }
      };

      utterance.onend = () => done(true);
      utterance.onerror = () => done(false);

      // Safety timeout: max 4.5 seconds so voice intake never hangs
      setTimeout(() => done(true), 4500);

      window.speechSynthesis.speak(utterance);
    });
  }
}

export const ttsService = new TTSService();
