/**
 * ttsService.ts
 * -------------
 * Text-to-Speech service for MediKiok Multilingual Clinical Intake.
 *
 * Guarantees consistent playback across Desktop Chrome, Safari (macOS/iOS),
 * Mobile Chrome, and modern mobile browsers:
 *
 * 1. Proactive Hardware Audio Unlock:
 *    Primes AudioContext and hardware output with a silent buffer on first user touch/click.
 *    Bypasses iOS Safari and Mobile Chrome autoplay restrictions for async fetches.
 *
 * 2. Robust Web Audio Decoding:
 *    Handles WebKit's legacy callback-based and standard Promise-based decodeAudioData,
 *    passing memory slice copies to avoid buffer detachment.
 *
 * 3. Centralized Language & Locale Alignment:
 *    Normalizes language codes and uses Sarvam's official provider codes (od-IN, hi-IN, etc.)
 *    for backend synthesis, falling back to installed browser voices when available.
 *
 * 4. Request Isolation & 0ms Latency Pre-fetching:
 *    In-flight requests are tracked and aborted immediately on question transition.
 *    Audio is cached in-memory so question transitions feel instant.
 *
 * 5. Structured Diagnostic Logging:
 *    Reports language, locale, browser platform, and fallback status without exposing credentials.
 */

import { VOICE_TTS_ENDPOINT } from './apiConfig';
import {
  getBrowserSpeechLocale,
  getBrowserDiagnosticInfo,
  getSarvamLanguageCode,
} from '../utils/languageUtils';

class TTSService {
  private currentAudio: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;
  private currentBufferSource: AudioBufferSourceNode | null = null;
  private isCurrentlySpeaking: boolean = false;
  private currentRequestId: number = 0;
  private abortController: AbortController | null = null;
  private audioCache: Map<string, string> = new Map();
  private isUnlocked: boolean = false;

  private backendTtsUrl: string = VOICE_TTS_ENDPOINT;

  constructor() {
    this.initAudioUnlock();
  }

  /**
   * Proactively unlock AudioContext and audio hardware on user gesture
   * so iOS Safari and Mobile Chrome allow subsequent asynchronous audio playback.
   */
  private initAudioUnlock(): void {
    if (typeof window === 'undefined') return;

    const unlock = () => {
      if (this.isUnlocked) return;
      try {
        const ctx = this.getAudioContext();
        if (ctx) {
          if (ctx.state === 'suspended') {
            ctx.resume();
          }
          // Genuine hardware unlock: play 1 silent frame through audio output
          const buffer = ctx.createBuffer(1, 1, 22050);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start(0);
          this.isUnlocked = true;
          console.log('[TTS] AudioContext successfully primed for mobile/Safari session.');
        }
      } catch (e) {
        // Ignore audio unlock exceptions
      }
    };

    window.addEventListener('click', unlock, { passive: true, once: true });
    window.addEventListener('touchstart', unlock, { passive: true, once: true });
    window.addEventListener('touchend', unlock, { passive: true, once: true });
    window.addEventListener('keydown', unlock, { passive: true, once: true });
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
    // 1. Invalidate in-flight request ID
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

    // 3. Stop and disconnect Web Audio BufferSource if playing
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
      // Ignore background prefetch network errors
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

    const browserInfo = getBrowserDiagnosticInfo();
    const sarvamCode = getSarvamLanguageCode(language);
    const bcpLocale = getBrowserSpeechLocale(language);

    // Primary: Backend Sarvam bulbul:v3 for studio-grade authentic speech
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
        console.warn(`[TTS Diagnostic] Backend synthesis failed for '${language}' (${sarvamCode}) on ${browserInfo}:`, err?.message || err);
      }
    }

    if (myRequestId !== this.currentRequestId) {
      return false;
    }

    // Secondary Fallback: Check if browser SpeechSynthesis has a matching voice for this language
    try {
      const hasBrowserVoice = this.hasBrowserVoiceForLanguage(language);
      if (hasBrowserVoice) {
        console.info(
          `[TTS Diagnostic] Falling back to browser SpeechSynthesis for '${language}' (${bcpLocale}) on ${browserInfo}.`
        );
        const played = await this.speakViaBrowser(text, language, myRequestId);
        if (myRequestId === this.currentRequestId) {
          this.isCurrentlySpeaking = false;
        }
        return played;
      } else {
        console.warn(
          `[TTS Diagnostic] Audio playback unavailable for '${language}' (Sarvam: ${sarvamCode}, Locale: ${bcpLocale}) on ${browserInfo}. Backend failed and browser has no native speech voice installed for this language.`
        );
        this.isCurrentlySpeaking = false;
        return false;
      }
    } catch (browserErr) {
      console.warn(
        `[TTS Diagnostic] Browser SpeechSynthesis failed for '${language}' (${bcpLocale}) on ${browserInfo}:`,
        browserErr
      );
      if (myRequestId === this.currentRequestId) {
        this.isCurrentlySpeaking = false;
      }
      return false;
    }
  }

  /**
   * Checks whether the current browser has an installed speech voice for this language
   */
  private hasBrowserVoiceForLanguage(language: string): boolean {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return false;
    }
    const bcpLocale = getBrowserSpeechLocale(language).toLowerCase();
    const langId = language.toLowerCase();
    const voices = window.speechSynthesis.getVoices();
    return voices.some((v) => {
      const vLang = v.lang.toLowerCase().replace('_', '-');
      return vLang === bcpLocale || vLang.startsWith(`${langId}-`) || vLang === langId;
    });
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

        // WebKit dual-mode decodeAudioData (Promise + callback support)
        const audioBuffer = await new Promise<AudioBuffer>((resolve, reject) => {
          const copy = arrayBuffer.slice(0);
          let settled = false;
          const onSuccess = (buf: AudioBuffer) => {
            if (!settled) {
              settled = true;
              resolve(buf);
            }
          };
          const onError = (err: any) => {
            if (!settled) {
              settled = true;
              reject(err);
            }
          };
          try {
            const p = ctx.decodeAudioData(copy, onSuccess, onError);
            if (p && typeof (p as any).then === 'function') {
              (p as any).then(onSuccess).catch(onError);
            }
          } catch (e) {
            onError(e);
          }
        });

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
        console.warn('[TTS] Web Audio API playback failed, trying HTML5 Audio fallback:', audioCtxErr);
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
        console.warn('[TTS] HTML5 Audio playback error:', e);
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
          console.warn('[TTS] Audio.play() rejected (autoplay restricted):', err);
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

      const langCode = getBrowserSpeechLocale(language);
      utterance.lang = langCode;

      const voices = window.speechSynthesis.getVoices();
      const matchingVoice = voices.find((v) => {
        const vLang = v.lang.toLowerCase().replace('_', '-');
        return vLang === langCode.toLowerCase() || vLang.startsWith(language.toLowerCase());
      });
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

      // Safety timeout: max 5.0 seconds so voice intake never hangs
      setTimeout(() => done(true), 5000);

      window.speechSynthesis.speak(utterance);
    });
  }
}

export const ttsService = new TTSService();
