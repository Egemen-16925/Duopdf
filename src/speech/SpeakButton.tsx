import { speechAvailable, toggleSpeak, useSpeaking } from "./speech";

/** İngilizce metni sesli okuyan küçük düğme; okurken tekrar basılırsa durdurur. */
export function SpeakButton({ text, label = "Sesli oku" }: { text: string; label?: string }) {
  const speaking = useSpeaking(text);
  if (!speechAvailable()) return null;
  return (
    <button
      className={speaking ? "icon-btn speak-btn speaking" : "icon-btn speak-btn"}
      onClick={(e) => {
        e.stopPropagation();
        toggleSpeak(text);
      }}
      onMouseUp={(e) => e.stopPropagation()}
      title={speaking ? "Durdur" : label}
      aria-label={speaking ? "Durdur" : label}
    >
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none" />
        {speaking ? (
          <rect x="15" y="9" width="6" height="6" fill="currentColor" stroke="none" />
        ) : (
          <>
            <path d="M15.5 8.5a5 5 0 0 1 0 7" />
            <path d="M18.5 5.5a9 9 0 0 1 0 13" />
          </>
        )}
      </svg>
    </button>
  );
}
