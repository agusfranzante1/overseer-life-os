'use client'
import { useEffect, useRef, useState, useCallback } from 'react'

/**
 * Web Speech API hook — converts microphone audio to text using the browser's
 * native recognizer. No external service or API key needed.
 *
 * Support:
 *   ✓ Chrome / Edge (full)
 *   ✓ Safari (full)
 *   ✗ Firefox (no SpeechRecognition)
 *
 * The lang parameter is BCP-47 (e.g. 'es-AR', 'es-ES', 'en-US').
 */

// Minimal typing for the Web Speech API — TS doesn't ship it built-in
interface SpeechRecognitionResult {
  isFinal: boolean
  0: { transcript: string; confidence: number }
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number
  results: { length: number; [i: number]: SpeechRecognitionResult }
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean
  interimResults: boolean
  lang: string
  start(): void
  stop(): void
  abort(): void
  onresult: ((e: SpeechRecognitionEvent) => void) | null
  onerror: ((e: SpeechRecognitionErrorEvent) => void) | null
  onstart: (() => void) | null
  onend: (() => void) | null
}
interface SpeechRecognitionCtor {
  new (): SpeechRecognitionInstance
}

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor
    webkitSpeechRecognition?: SpeechRecognitionCtor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

export interface UseVoiceInputOptions {
  lang?: string                            // 'es-AR' by default
  onFinalText?: (text: string) => void     // commits final chunk
  onInterimText?: (text: string) => void   // live partial text while speaking
}

function describeError(code: string): string | null {
  switch (code) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'Permiso de micrófono denegado. Activalo en los settings del navegador (icono de 🎤 en la barra de URL).'
    case 'no-speech':
      return null  // silence — ignore
    case 'audio-capture':
      return 'No se detectó micrófono. Verificá que esté conectado y seleccionado en el sistema.'
    case 'aborted':
      return null  // user cancelled
    case 'network':
      return 'Error de red. Chrome/Edge envían el audio a Google para transcribir y no pudieron conectar.\n• Verificá tu internet\n• Desactivá VPN/firewall que bloquee Google\n• Probá Microsoft Edge (usa servidores de Microsoft, no Google)'
    case 'language-not-supported':
      return 'El idioma no está soportado en este navegador.'
    default:
      return `Error de reconocimiento: ${code}`
  }
}

export function useVoiceInput({ lang = 'es-AR', onFinalText, onInterimText }: UseVoiceInputOptions = {}) {
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const recRef = useRef<SpeechRecognitionInstance | null>(null)
  const retryCountRef = useRef(0)
  const onFinalRef = useRef(onFinalText)
  const onInterimRef = useRef(onInterimText)
  useEffect(() => { onFinalRef.current = onFinalText }, [onFinalText])
  useEffect(() => { onInterimRef.current = onInterimText }, [onInterimText])

  useEffect(() => {
    setSupported(getSpeechRecognition() !== null)
  }, [])

  const startInternal = useCallback((isRetry: boolean) => {
    const Ctor = getSpeechRecognition()
    if (!Ctor) {
      setError('Tu navegador no soporta reconocimiento de voz. Usá Chrome/Edge/Safari.')
      return
    }
    if (!isRetry) {
      setError(null)
      retryCountRef.current = 0
    }
    const rec = new Ctor()
    rec.continuous = true
    rec.interimResults = true
    rec.lang = lang

    rec.onstart = () => {
      setListening(true)
      retryCountRef.current = 0
    }
    rec.onend = () => {
      setListening(false)
      recRef.current = null
    }
    rec.onerror = (e) => {
      const code = e.error

      // Auto-retry once on transient "network" errors — Chrome's voice service
      // can flicker even with healthy internet
      if (code === 'network' && retryCountRef.current < 1) {
        retryCountRef.current++
        setListening(false)
        setTimeout(() => startInternal(true), 600)
        return
      }

      const msg = describeError(code)
      if (msg) setError(msg)
      setListening(false)
    }
    rec.onresult = (event) => {
      let interim = ''
      let finalText = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const r = event.results[i]
        const txt = r[0].transcript
        if (r.isFinal) finalText += txt
        else interim += txt
      }
      if (finalText) onFinalRef.current?.(finalText)
      if (interim)   onInterimRef.current?.(interim)
    }

    try {
      rec.start()
      recRef.current = rec
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo iniciar el micrófono')
    }
  }, [lang])

  const start = useCallback(() => startInternal(false), [startInternal])

  const stop = useCallback(() => {
    recRef.current?.stop()
  }, [])

  const toggle = useCallback(() => {
    if (listening) stop()
    else start()
  }, [listening, start, stop])

  // Allow dismissing the error manually
  const clearError = useCallback(() => setError(null), [])

  useEffect(() => () => recRef.current?.abort(), [])

  return { supported, listening, error, start, stop, toggle, clearError }
}
