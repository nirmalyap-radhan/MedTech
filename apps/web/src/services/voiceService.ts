/**
 * voiceService.ts
 * ----------------
 * Real Microphone Audio Capture → Sarvam Saaras v4 Integration.
 *
 * Flow:
 * 1. Request microphone permission via navigator.mediaDevices.getUserMedia()
 * 2. Capture fresh audio session using MediaRecorder
 * 3. Send audio Blob to backend (http://localhost:5000/api/transcribe)
 * 4. Backend normalizes to 16kHz WAV and calls Sarvam Saaras v4
 * 5. Return regional transcript + English translation
 *
 * Fully isolates every recording lifecycle so Q1, Q2... Q8 each get a fresh session.
 */

export interface VoiceIntakeResult {
  status: 'success' | 'permission-denied' | 'not-supported' | 'backend-error' | 'empty';
  rawAudioBlob?: Blob;
  regionalTranscript: string;
  englishTranslation: string;
  detectedLanguage: string;
  structuredData: {
    chiefComplaint: string;
    duration: string;
    severity?: string;
  };
  errorMessage?: string;
  backendSource: 'sarvam-saaras-v4';
}

import { VOICE_TRANSCRIBE_ENDPOINT } from './apiConfig';

export class VoiceService {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private backendUrl = VOICE_TRANSCRIBE_ENDPOINT;
  private activeStream: MediaStream | null = null;

  /**
   * Check if browser supports mediaDevices.getUserMedia
   */
  public isSupported(): boolean {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /**
   * Check if recording is currently active
   */
  public isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }

  /**
   * Safely cancel and clean up any ongoing recording without triggering backend requests
   */
  public cancelRecording(): void {
    if (this.mediaRecorder) {
      try {
        this.mediaRecorder.onstop = null;
        this.mediaRecorder.ondataavailable = null;
        if (this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.stop();
        }
      } catch (e) {
        // Ignore
      }
      this.mediaRecorder = null;
    }

    if (this.activeStream) {
      try {
        this.activeStream.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
      } catch (e) {
        // Ignore
      }
      this.activeStream = null;
    }

    this.audioChunks = [];
  }

  /**
   * Proactively request microphone access from browser.
   * Prompts the user with Safari/Chrome's native permission modal immediately.
   */
  public async requestPermission(): Promise<'granted' | 'denied' | 'unsupported'> {
    if (!this.isSupported()) {
      return 'unsupported';
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Stop tracks immediately so mic is not left open before question readout
      stream.getTracks().forEach((track) => track.stop());
      return 'granted';
    } catch {
      return 'denied';
    }
  }

  /**
   * Request Real Microphone Permission and Start Recording Audio Chunks
   */
  public async startRecording(): Promise<'granted' | 'denied' | 'unsupported'> {
    if (!this.isSupported()) {
      console.warn('[VOICE] Browser does not support mediaDevices audio capture.');
      return 'unsupported';
    }

    // Safety: cancel and reset any lingering recording state first
    this.cancelRecording();

    console.log('[VOICE] Starting microphone');

    try {
      try {
        this.activeStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch {
        this.activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      }

      // Pick best supported MIME type
      let mimeType = 'audio/webm';
      if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
        mimeType = 'audio/webm;codecs=opus';
      } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
        mimeType = 'audio/ogg;codecs=opus';
      }

      this.audioChunks = [];
      this.mediaRecorder = new MediaRecorder(this.activeStream, { mimeType });

      this.mediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          this.audioChunks.push(event.data);
        }
      };

      // Start recording WITHOUT a timeslice so the browser buffers the entire recording
      // internally and emits ONE complete, valid container file (WebM/MP4) in onstop.
      // Using start(timeslice) causes Safari/Chrome to emit fragmented chunks where
      // only chunk 0 has the container header — ffmpeg then fails with "EBML header
      // parsing failed" for every question after Q1.
      this.mediaRecorder.start();
      console.log('[VOICE] MediaRecorder started (mime:', mimeType, ')');
      return 'granted';
    } catch (err: any) {
      console.error('[VOICE] Microphone permission error:', err);
      this.cancelRecording();
      return 'denied';
    }
  }

  /**
   * Stop Real Microphone Recording & Send Audio to indic-speech-translate-main Backend
   */
  public async stopRecording(language: string = 'or'): Promise<VoiceIntakeResult> {
    return new Promise((resolve) => {
      const recorder = this.mediaRecorder;
      const stream = this.activeStream;

      if (!recorder || recorder.state === 'inactive') {
        console.warn('[VOICE] MediaRecorder inactive or not started.');
        this.cancelRecording();
        resolve(this.toErrorResult(undefined, 'No audio captured. Please try again.'));
        return;
      }

      recorder.onstop = async () => {
        console.log('[VOICE] Recording stopped');

        // Stop all microphone tracks immediately
        if (stream) {
          try {
            stream.getTracks().forEach((track) => {
              track.stop();
              track.enabled = false;
            });
          } catch (e) {}
        }
        this.activeStream = null;
        this.mediaRecorder = null;

        const mimeType = recorder.mimeType || 'audio/webm';
        const chunks = [...this.audioChunks];
        this.audioChunks = [];

        const audioBlob = new Blob(chunks, { type: mimeType });
        console.log('[VOICE] Audio blob size:', audioBlob.size, 'bytes');

        if (audioBlob.size < 200) {
          console.warn('[VOICE] Audio blob too small — possibly empty.');
          resolve(this.toErrorResult(audioBlob, 'No speech detected. Please speak clearly and try again.'));
          return;
        }

        const ext = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'mp4' : 'webm';
        const filename = `mic_recording.${ext}`;
        const langName = language || 'or';

        console.log('[VOICE] Sending audio to Sarvam (lang:', langName, 'size:', audioBlob.size, ')');

        try {
          const formData = new FormData();
          formData.append('audio', audioBlob, filename);
          formData.append('language', langName);

          const response = await fetch(this.backendUrl, {
            method: 'POST',
            body: formData,
          });

          const data = await response.json();
          console.log('[VOICE] Sarvam response received (status:', data?.status, ')');

          if (data?.status === 'success') {
            resolve({
              status: 'success',
              rawAudioBlob: audioBlob,
              regionalTranscript: data.regional_text || '',
              englishTranslation: data.english_text || '',
              detectedLanguage: data.language || language,
              structuredData: {
                chiefComplaint: '',
                duration: '',
              },
              backendSource: 'sarvam-saaras-v4',
            });
            return;
          }

          if (data?.status === 'empty') {
            resolve({
              status: 'empty',
              rawAudioBlob: audioBlob,
              regionalTranscript: '',
              englishTranslation: '',
              detectedLanguage: data.language || language,
              structuredData: { chiefComplaint: '', duration: '' },
              errorMessage: data.message || 'No speech detected. Please speak clearly and try again.',
              backendSource: 'sarvam-saaras-v4',
            });
            return;
          }

          // Backend error
          resolve(this.toErrorResult(
            audioBlob,
            data?.message || 'Voice service error. Please try again.'
          ));
        } catch (err: any) {
          console.error('[VOICE] Network error reaching voice backend:', err);
          resolve(this.toErrorResult(
            audioBlob,
            'Voice service unavailable. Please try again or use text input.'
          ));
        }
      };

      try {
        recorder.stop();
      } catch (e) {
        console.error('[VOICE] Error stopping MediaRecorder:', e);
        this.cancelRecording();
        resolve(this.toErrorResult(undefined, 'Microphone error. Please try again.'));
      }
    });
  }

  /**
   * Build an error result. Never fabricates a transcript.
   */
  private toErrorResult(audioBlob: Blob | undefined, message: string): VoiceIntakeResult {
    return {
      status: 'backend-error',
      rawAudioBlob: audioBlob,
      regionalTranscript: '',
      englishTranslation: '',
      detectedLanguage: '',
      structuredData: { chiefComplaint: '', duration: '' },
      errorMessage: message,
      backendSource: 'sarvam-saaras-v4',
    };
  }
}

export const voiceService = new VoiceService();
