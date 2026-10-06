import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState, useSyncExternalStore } from "react";
import { isAndroid } from "../platform";
import { getPrefs } from "../settings/prefs";

/**
 * Sesli okuma: Windows'ta tarayıcının Web Speech API'si (yüklü sesler), Android'de WebView bunu
 * desteklemediği için sistemin TextToSpeech motoru. API anahtarı gerektirmez. Yalnızca İngilizce okunur.
 */
let nativeAvailable = false;

export function speechAvailable(): boolean {
  if (isAndroid) return nativeAvailable;
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Android'de motor açılışta geç hazırlanır; hazır olunca düğmeler görünsün. */
export function useSpeechAvailable(): boolean {
  return useSyncExternalStore(subscribe, speechAvailable);
}

/** Yüklü İngilizce sesler (sesler geç yüklenebilir; `useEnglishVoices` değişince günceller). */
/** Web Speech API var mı (Android WebView'da yok; orada sistemin metin okuma motoru kullanılır). */
function webSpeech(): boolean {
  return !isAndroid && typeof window !== "undefined" && "speechSynthesis" in window;
}

export function englishVoices(): SpeechSynthesisVoice[] {
  if (!webSpeech()) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
}

export function useEnglishVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(englishVoices);
  useEffect(() => {
    if (!webSpeech()) return;
    const update = () => setVoices(englishVoices());
    speechSynthesis.addEventListener("voiceschanged", update);
    update();
    return () => speechSynthesis.removeEventListener("voiceschanged", update);
  }, []);
  return voices;
}

/** Tercih edilen ses: ayarlarda seçilen, yoksa ABD İngilizcesi, yoksa ilk İngilizce ses. */
function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = englishVoices();
  const wanted = getPrefs().speechVoice;
  return voices.find((v) => v.voiceURI === wanted) ?? voices.find((v) => v.lang === "en-US") ?? voices[0];
}

let speakingText: string | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

if (isAndroid) {
  invoke<boolean>("speech_available")
    .then((ok) => {
      nativeAvailable = ok;
      notify();
    })
    .catch(() => undefined);
}

function toggleNative(clean: string) {
  const wasSame = speakingText === clean;
  speakingText = null;
  notify();
  if (wasSame) {
    invoke("stop_speaking").catch(() => undefined);
    return;
  }
  speakingText = clean;
  notify();
  invoke("speak", { text: clean, rate: getPrefs().speechRate })
    .catch(() => undefined)
    .finally(() => {
      if (speakingText === clean) {
        speakingText = null;
        notify();
      }
    });
}

/** Metni okur; aynı metin okunurken yeniden çağrılırsa durdurur. */
export function toggleSpeak(text: string) {
  if (!speechAvailable()) return;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return;
  if (isAndroid) return toggleNative(clean);
  const wasSame = speakingText === clean;
  speechSynthesis.cancel();
  speakingText = null;
  notify();
  if (wasSame) return;
  const utterance = new SpeechSynthesisUtterance(clean);
  const voice = pickVoice();
  if (voice) utterance.voice = voice;
  utterance.lang = voice?.lang ?? "en-US";
  utterance.rate = getPrefs().speechRate;
  const done = () => {
    if (speakingText === clean) {
      speakingText = null;
      notify();
    }
  };
  utterance.onend = done;
  utterance.onerror = done;
  speakingText = clean;
  notify();
  speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  if (!speechAvailable()) return;
  if (isAndroid) {
    invoke("stop_speaking").catch(() => undefined);
    speakingText = null;
    notify();
    return;
  }
  speechSynthesis.cancel();
  speakingText = null;
  notify();
}

/** Bu metin şu an okunuyor mu (düğmenin görünümü için). */
export function useSpeaking(text: string): boolean {
  const current = useSyncExternalStore(subscribe, () => speakingText);
  return current !== null && current === text.replace(/\s+/g, " ").trim();
}
