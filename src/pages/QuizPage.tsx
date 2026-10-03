import { useEffect, useMemo, useRef, useState } from "react";
import { describeAiError } from "../ai/errors";
import { db, type OccurrenceRecord } from "../db/db";
import { trackRoot, untrackRoot } from "../learning/highlights";
import { pickFromPointer, type Pick } from "../learning/pick";
import { SentencePopup } from "../learning/SentencePopup";
import { WordPopup } from "../learning/WordPopup";
import type { TermStatus } from "../learning/matcher";
import { useTerms } from "../learning/store";
import {
  countEligible,
  makeQuestion,
  pickQuizItems,
  quizStats,
  recordAttempt,
  type QuizItem,
  type QuizMode,
  type QuizQuestion,
  type TermQuizStats,
} from "../quiz/quiz";
import type { AiTarget } from "../settings/providers";
import { QuizScore } from "./WordsPage";

interface Props {
  /** Güçlü model (soruları üretir; hata olursa yedek model denenir). */
  target: AiTarget | null;
  /** Hızlı model (cevapladıktan sonra kelime anlamı ve cümle çevirisi). */
  fast: AiTarget | null;
  /** Sayfa ekranda mı (klavye kısayolları yalnızca o zaman çalışır). */
  active: boolean;
}

interface Slot {
  item: QuizItem;
  state: "pending" | "loading" | "ready" | "error";
  question?: QuizQuestion;
  error?: string;
  chosen?: number;
}

const STATUS_LABELS: { status: TermStatus; label: string }[] = [
  { status: "unknown", label: "Bilmiyorum" },
  { status: "learning", label: "Az biliyorum" },
  { status: "known", label: "Biliyorum" },
];
const MODES: { mode: QuizMode; label: string }[] = [
  { mode: "mixed", label: "Karışık" },
  { mode: "en-tr", label: "İngilizce → Türkçe" },
  { mode: "tr-en", label: "Türkçe → İngilizce" },
];
const COUNTS = [5, 10, 15, 20];
const LETTERS = ["A", "B", "C", "D"];
/** Şu anki sorudan sonra kaç soru önceden hazırlansın. */
const PREFETCH = 2;

/** İngilizce cümle, hedef kelime vurgulu. */
function English({ question, pickable }: { question: QuizQuestion; pickable?: boolean }) {
  const { english, highlight } = question;
  return (
    <span className={pickable ? PICKABLE : undefined}>
      {highlight ? (
        <>
          {english.slice(0, highlight.start)}
          <mark>{english.slice(highlight.start, highlight.end)}</mark>
          {english.slice(highlight.end)}
        </>
      ) : (
        english
      )}
    </span>
  );
}

/** Cevaplandıktan sonra tıklanıp çevrilebilen İngilizce metin (okuyucudaki gibi). */
const PICKABLE = "quiz-pickable";

export function QuizPage({ target, fast, active }: Props) {
  const terms = useTerms();
  const [occurrences, setOccurrences] = useState<OccurrenceRecord[]>([]);
  const [stats, setStats] = useState<Map<string, TermQuizStats>>(new Map());
  const [statuses, setStatuses] = useState<TermStatus[]>(["unknown", "learning"]);
  const [mode, setMode] = useState<QuizMode>("mixed");
  const [count, setCount] = useState(10);
  const [phase, setPhase] = useState<"setup" | "running" | "done">("setup");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [current, setCurrent] = useState(0);
  const loading = useRef(new Set<number>());
  /** Yeni sınav başlayınca eski isteklerin sonuçları yok sayılır. */
  const run = useRef(0);
  const pageRef = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<Pick | null>(null);

  // Cevaplanan sorudaki ve sonuç ekranındaki İngilizce metin: kelimeye tıkla ya da cümleyi seç (okuyucudaki gibi).
  const answeredNow = phase === "running" && slots[current]?.chosen !== undefined;
  useEffect(() => {
    const root = pageRef.current;
    if (!root) return;
    const pickables = [...root.querySelectorAll("." + PICKABLE)];
    pickables.forEach((el) => trackRoot(el, "flow"));
    const onUp = (e: MouseEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest("button")) return;
      const result = pickFromPointer(e, "." + PICKABLE, "flow");
      if (result) setPopup(result.pick);
    };
    root.addEventListener("mouseup", onUp);
    return () => {
      root.removeEventListener("mouseup", onUp);
      pickables.forEach(untrackRoot);
    };
  }, [phase, current, answeredNow]);

  // Soru değişince açık pencere kapanır.
  useEffect(() => setPopup(null), [phase, current]);

  const popups = popup && (
    <>
      {popup.kind === "word" ? (
        <WordPopup
          pick={popup}
          target={fast}
          onClose={() => setPopup(null)}
          onTranslateSentence={() =>
            setPopup((p) => (p?.kind === "word" ? { kind: "sentence", text: p.sentence, range: p.sentenceRange, rect: p.rect } : p))
          }
        />
      ) : (
        <SentencePopup pick={popup} target={fast} onClose={() => setPopup(null)} />
      )}
    </>
  );

  // Ayar ve sonuç ekranında güncel sayılar.
  useEffect(() => {
    if (!active || phase === "running") return;
    db.occurrences.toArray().then(setOccurrences);
    quizStats(db).then(setStats);
  }, [active, phase, terms]);

  const eligible = useMemo(() => countEligible(terms, statuses), [terms, statuses]);

  async function start() {
    const fresh = await quizStats(db);
    const items = pickQuizItems(terms, occurrences, fresh, { count, statuses, mode });
    if (items.length === 0) return;
    run.current++;
    loading.current.clear();
    setSlots(items.map((item) => ({ item, state: "pending" })));
    setCurrent(0);
    setPhase("running");
  }

  function patch(index: number, change: Partial<Slot>) {
    setSlots((prev) => prev.map((s, i) => (i === index ? { ...s, ...change } : s)));
  }

  async function load(index: number, avoid: string[] = []) {
    const slot = slots[index];
    if (!slot || !target || loading.current.has(index)) return;
    const myRun = run.current;
    loading.current.add(index);
    patch(index, { state: "loading", error: undefined, question: undefined });
    try {
      const question = await makeQuestion(db, target, slot.item, { avoid });
      if (run.current === myRun) patch(index, { state: "ready", question });
    } catch (e) {
      if (run.current === myRun) patch(index, { state: "error", error: describeAiError(e) });
    } finally {
      loading.current.delete(index);
    }
  }

  // Şu anki soru ve sonraki birkaç soru arka planda hazırlanır.
  useEffect(() => {
    if (phase !== "running") return;
    for (let i = current; i < Math.min(slots.length, current + 1 + PREFETCH); i++) {
      if (slots[i].state === "pending") load(i);
    }
  }, [phase, current, slots]);

  async function choose(index: number) {
    const slot = slots[current];
    if (!slot?.question || slot.chosen !== undefined) return;
    patch(current, { chosen: index });
    await recordAttempt(db, slot.item, slot.question, index);
  }

  function next() {
    if (current + 1 >= slots.length) setPhase("done");
    else setCurrent(current + 1);
  }

  // Klavye: 1-4 ya da A-D şık seçer, Enter sonraki soruya geçer.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    if (phase !== "running" || e.ctrlKey || e.altKey || e.metaKey) return;
    const el = document.activeElement as HTMLElement | null;
    if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
    const slot = slots[current];
    if (!slot) return;
    const k = e.key.toLowerCase();
    const choice = ["1", "2", "3", "4"].includes(k) ? Number(k) - 1 : ["a", "b", "c", "d"].indexOf(k);
    if (choice >= 0 && slot.question && slot.chosen === undefined) {
      e.preventDefault();
      choose(choice);
    } else if (e.key === "Enter" && slot.chosen !== undefined) {
      e.preventDefault();
      next();
    }
  };
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => keyHandler.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active]);

  if (phase === "setup") {
    const scored = terms
      .map((t) => ({ term: t, s: stats.get(t.key) }))
      .filter((x): x is { term: typeof x.term; s: TermQuizStats } => !!x.s && x.s.count > 0)
      .sort((a, b) => b.s.wrong - a.s.wrong || a.s.correct - b.s.correct);
    return (
      <div ref={pageRef} className="quiz-page">
        <h2>Çoktan seçmeli sınav</h2>
        <p className="muted">
          İşaretlediğin kelimeler her sınavda yapay zekânın kurduğu yeni bir cümleyle sorulur. Önce az sorulan ve çok yanlış
          yaptığın kelimeler gelir.
        </p>
        {!target && <p className="msg error">Ayarlar → Modeller'den bir güçlü model seç; soruları o hazırlar.</p>}
        <section className="profile-form quiz-setup">
          <div className="quiz-setup-row">
            <span className="quiz-setup-label">Hangi kelimeler</span>
            {STATUS_LABELS.map(({ status, label }) => (
              <label key={status} className="quiz-check">
                <input
                  type="checkbox"
                  checked={statuses.includes(status)}
                  onChange={(e) => setStatuses((prev) => (e.target.checked ? [...prev, status] : prev.filter((s) => s !== status)))}
                />
                {label}
              </label>
            ))}
          </div>
          <div className="quiz-setup-row">
            <span className="quiz-setup-label">Soru yönü</span>
            <select value={mode} onChange={(e) => setMode(e.target.value as QuizMode)} aria-label="Soru yönü">
              {MODES.map((m) => (
                <option key={m.mode} value={m.mode}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
          <div className="quiz-setup-row">
            <span className="quiz-setup-label">Soru sayısı</span>
            <select value={count} onChange={(e) => setCount(Number(e.target.value))} aria-label="Soru sayısı">
              {COUNTS.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <span className="muted">
              {eligible > 0
                ? `Sorulabilecek ${eligible} kelime var${eligible < count ? `; sınav ${eligible} soru olacak` : ""}.`
                : "Bu durumlarda kelime yok. Okurken kelime işaretle."}
            </span>
          </div>
          <button onClick={start} disabled={!target || eligible === 0}>
            Sınavı başlat
          </button>
        </section>

        {scored.length > 0 && (
          <section className="quiz-scores">
            <h3>Kelimelerdeki başarın</h3>
            <div className="quiz-score-list">
              {scored.map(({ term, s }) => (
                <div key={term.id} className="quiz-score-row">
                  <span className="quiz-mistake-term">{term.lemma}</span>
                  <span className="muted">{term.meaning}</span>
                  <QuizScore stats={s} />
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  if (phase === "done") {
    const answered = slots.filter((s) => s.chosen !== undefined && s.question);
    const right = answered.filter((s) => s.chosen === s.question!.correctIndex);
    const wrong = answered.filter((s) => s.chosen !== s.question!.correctIndex);
    const skipped = slots.length - answered.length;
    return (
      <div ref={pageRef} className="quiz-page">
        {popups}
        <h2>Sınav bitti</h2>
        <p className="quiz-score">
          {right.length} / {answered.length} doğru
          {skipped > 0 && <span className="muted"> · {skipped} soru cevaplanmadı</span>}
        </p>

        <section className="quiz-scores">
          <h3>Bu sınavdaki kelimeler</h3>
          <div className="quiz-score-list">
            {answered.map((s, i) => {
              const ok = s.chosen === s.question!.correctIndex;
              return (
                <div key={i} className="quiz-score-row">
                  <span className={ok ? "quiz-answer-right" : "quiz-answer-wrong"}>{ok ? "✓" : "✗"}</span>
                  <span className="quiz-mistake-term">{s.item.term.lemma}</span>
                  <span className="muted">toplam:</span>
                  <QuizScore stats={stats.get(s.item.term.key)} />
                </div>
              );
            })}
          </div>
        </section>

        {wrong.length > 0 ? (
          <section className="quiz-mistakes">
            <h3>Yanlış yaptığın sorular</h3>
            {wrong.map((s, i) => {
              const q = s.question!;
              return (
                <div key={i} className="quiz-mistake">
                  <div className="quiz-mistake-term">{s.item.term.lemma}</div>
                  <div className="quiz-sentence-small">
                    <English question={q} pickable />
                  </div>
                  {q.direction === "tr-en" && <div className="muted">{q.turkish}</div>}
                  <div className="quiz-answer-right">Doğrusu: {q.options[q.correctIndex].text}</div>
                  <div className="quiz-answer-wrong">Senin cevabın: {q.options[s.chosen!].text}</div>
                </div>
              );
            })}
          </section>
        ) : (
          answered.length > 0 && <p className="msg ok">Hepsi doğru!</p>
        )}
        <button onClick={() => setPhase("setup")}>Yeni sınav</button>
      </div>
    );
  }

  const slot = slots[current];
  const { question } = slot;
  const answered = slot.chosen !== undefined;
  const isLast = current + 1 >= slots.length;
  const toTurkish = slot.item.direction === "en-tr";
  return (
    <div ref={pageRef} className="quiz-page">
      {popups}
      <div className="quiz-head">
        <span>
          Soru {current + 1} / {slots.length}
        </span>
        <div className="quiz-progress" aria-hidden>
          <div style={{ width: `${(current / slots.length) * 100}%` }} />
        </div>
        <button className="secondary" onClick={() => setPhase("done")}>
          Sınavı bitir
        </button>
      </div>

      <section className="quiz-card">
        <div className="quiz-question">{toTurkish ? "Bu cümlenin Türkçesi hangisidir?" : "Bu cümlenin İngilizcesi hangisidir?"}</div>

        {slot.state === "loading" || slot.state === "pending" ? (
          <p className="muted">Soru hazırlanıyor… (yapay zekâ yeni bir cümle kuruyor)</p>
        ) : slot.state === "error" ? (
          <div>
            <p className="msg error">Soru hazırlanamadı: {slot.error}</p>
            <div className="row">
              <button onClick={() => load(current)}>Tekrar dene</button>
              <button className="secondary" onClick={next}>
                Bu soruyu atla
              </button>
            </div>
          </div>
        ) : (
          question && (
            <>
              <p className="quiz-sentence">{toTurkish ? <English question={question} pickable={answered} /> : question.turkish}</p>
              <ol className="quiz-options">
                {question.options.map((o, i) => {
                  const cls = !answered ? "" : o.correct ? "correct" : i === slot.chosen ? "wrong" : "dim";
                  return (
                    <li key={i}>
                      {answered ? (
                        // Cevaptan sonra düğme değil: İngilizce şıklar okuyucudaki gibi tıklanıp seçilebilsin.
                        <div className={`quiz-option ${cls}`}>
                          <span className="quiz-letter">{LETTERS[i]}</span>
                          <span className={toTurkish ? undefined : PICKABLE}>{o.text}</span>
                        </div>
                      ) : (
                        <button className="quiz-option" onClick={() => choose(i)}>
                          <span className="quiz-letter">{LETTERS[i]}</span>
                          <span>{o.text}</span>
                        </button>
                      )}
                      {answered && !o.correct && o.why && <div className="quiz-why">{o.why}</div>}
                    </li>
                  );
                })}
              </ol>
              {answered ? (
                <>
                  <p className="muted quiz-hint">İngilizce yazıda kelimeye tıkla ya da cümleyi seç: anlamı ve çevirisi açılır.</p>
                  {!toTurkish && (
                    <p className="quiz-target muted">
                      Hedef kelime: <strong>{slot.item.term.lemma}</strong> — <English question={question} pickable />
                    </p>
                  )}
                  <div className="quiz-feedback">
                    {slot.chosen === question.correctIndex ? (
                      <span className="quiz-answer-right">Doğru!</span>
                    ) : (
                      <span className="quiz-answer-wrong">Yanlış. Doğru cevap: {LETTERS[question.correctIndex]}</span>
                    )}
                    <button onClick={next}>{isLast ? "Sonuçları gör" : "Sonraki soru"} (Enter)</button>
                  </div>
                </>
              ) : (
                <div className="quiz-tools">
                  <span className="muted">1-4 ya da A-D tuşlarıyla da seçebilirsin.</span>
                  <button
                    className="link-btn"
                    onClick={() => load(current, [question.english])}
                    title="Şıklar hatalıysa (ör. iki doğru şık) başka bir cümleyle yeni soru üret"
                  >
                    Soruyu yenile
                  </button>
                </div>
              )}
            </>
          )
        )}
      </section>
    </div>
  );
}
