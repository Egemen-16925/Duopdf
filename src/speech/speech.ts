import { useEffect, useState, useSyncExternalStore } from "react";
import { getPrefs } from "../settings/prefs";

/**
 * Sesli okuma: tarayıcının Web Speech API'si (Windows'taki yüklü sesler). İnternet ve API anahtarı
 * gerektirmez. Yalnızca İngilizce metin okunur.
 */
export function speechAvailable(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

/** Yüklü İngilizce sesler (sesler geç yüklenebilir; `useEnglishVoices` değişince günceller). */
export function englishVoices(): SpeechSynthesisVoice[] {
  if (!speechAvailable()) return [];
  return speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
}

export function useEnglishVoices(): SpeechSynthesisVoice[] {
  const [voices, setVoices] = useState(englishVoices);
  useEffect(() => {
    if (!speechAvailable()) return;
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

/** Metni okur; aynı metin okunurken yeniden çağrılırsa durdurur. */
export function toggleSpeak(text: string) {
  if (!speechAvailable()) return;
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return;
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
  speechSynthesis.cancel();
  speakingText = null;
  notify();
}

/** Bu metin şu an okunuyor mu (düğmenin görünümü için). */
export function useSpeaking(text: string): boolean {
  const current = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => speakingText,
  );
  return current !== null && current === text.replace(/\s+/g, " ").trim();
}
