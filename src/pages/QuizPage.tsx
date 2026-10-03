import { useEffect, useMemo, useRef, useState } from "react";
import { AiError } from "../ai/errors";
import { db, type OccurrenceRecord } from "../db/db";
import type { TermStatus } from "../learning/matcher";
import { useTerms } from "../learning/store";
import {
  countEligible,
  makeQuestion,
  pickQuizItems,
  quizStats,
  recordAttempt,
  type QuizItem,
  type QuizQuestion,
} from "../quiz/quiz";
import type { AiTarget } from "../settings/providers";

interface Props {
  /** Güçlü model (çeldiricileri üretir). */
  target: AiTarget | null;
  /** Sayfa ekranda mı (klavye kısayolları yalnızca o zaman çalışır). */
  active: boolean;
}

interface Slot {
  item: QuizItem;
  state: "pending" | "loading" | "ready" | "error";
  question?: QuizQuestion;
  error?: string;
  chosen?: number;
  skipped?: boolean;
}

const STATUS_LABELS: { status: TermStatus; label: string }[] = [
  { status: "unknown", label: "Bilmiyorum" },
  { status: "learning", label: "Az biliyorum" },
  { status: "known", label: "Biliyorum" },
];
const COUNTS = [5, 10, 15, 20];
const LETTERS = ["A", "B", "C", "D"];
/** Şu anki sorudan sonra kaç soru önceden hazırlansın. */
const PREFETCH = 2;

function errorText(e: unknown): string {
  if (e instanceof AiError) return e.message;
  return e instanceof Error ? e.message : String(e);
}

export function QuizPage({ target, active }: Props) {
  const terms = useTerms();
  const [occurrences, setOccurrences] = useState<OccurrenceRecord[]>([]);
  const [statuses, setStatuses] = useState<TermStatus[]>(["unknown", "learning"]);
  const [count, setCount] = useState(10);
  const [phase, setPhase] = useState<"setup" | "running" | "done">("setup");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [current, setCurrent] = useState(0);
  const loading = useRef(new Set<number>());
  /** Yeni sınav başlayınca eski isteklerin sonuçları yok sayılır. */
  const run = useRef(0);

  // Kelimelerin geçtiği cümleler (ayar ekranı her açıldığında tazelenir).
  useEffect(() => {
    if (active && phase === "setup") db.occurrences.toArray().then(setOccurrences);
  }, [active, phase, terms]);

  const eligible = useMemo(() => countEligible(terms, occurrences, statuses), [terms, occurrences, statuses]);

  async function start() {
    const stats = await quizStats(db);
    const items = pickQuizItems(terms, occurrences, stats, { count, statuses });
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

  async function load(index: number, force = false) {
    const slot = slots[index];
    if (!slot || !target || loading.current.has(index)) return;
    const myRun = run.current;
    loading.current.add(index);
    patch(index, { state: "loading", error: undefined, question: force ? undefined : slot.question });
    try {
      const question = await makeQuestion(db, target, slot.item, { force });
      if (run.current === myRun) patch(index, { state: "ready", question });
    } catch (e) {
      if (run.current === myRun) patch(index, { state: "error", error: errorText(e) });
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

  function skip() {
    patch(current, { skipped: true });
    next();
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
    const choice = ["1", "2", "3", "4"].indexOf(k) >= 0 ? Number(k) - 1 : ["a", "b", "c", "d"].indexOf(k);
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
    return (
      <div className="quiz-page">
        <h2>Çoktan seçmeli sınav</h2>
        <p className="muted">
          İşaretlediğin kelimelerin geçtiği cümleler sorulur: "Bu cümlenin Türkçesi hangisidir?" Şıkları güçlü model hazırlar;
          aynı soru ikinci kez sorulursa önbellekten gelir.
        </p>
        {!target && <p className="msg error">Ayarlar → Modeller'den bir güçlü model seç; şıkları o hazırlar.</p>}
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
                : "Bu durumlarda, geçtiği cümle kayıtlı kelime yok. Okurken kelime işaretle."}
            </span>
          </div>
          <button onClick={start} disabled={!target || eligible === 0}>
            Sınavı başlat
          </button>
        </section>
      </div>
    );
  }

  if (phase === "done") {
    const answered = slots.filter((s) => s.chosen !== undefined);
    const right = answered.filter((s) => s.chosen === s.question?.correctIndex);
    const wrong = answered.filter((s) => s.chosen !== s.question?.correctIndex);
    const skipped = slots.length - answered.length;
    return (
      <div className="quiz-page">
        <h2>Sınav bitti</h2>
        <p className="quiz-score">
          {right.length} / {answered.length} doğru
          {skipped > 0 && <span className="muted"> · {skipped} soru cevaplanmadı</span>}
        </p>
        {wrong.length > 0 ? (
          <section className="quiz-mistakes">
            <h3>Yanlış yaptığın kelimeler</h3>
            {wrong.map((s, i) => (
              <div key={i} className="quiz-mistake">
                <div className="quiz-mistake-term">{s.item.term.lemma}</div>
                <div className="quiz-sentence-small">{s.item.sentence}</div>
                <div className="quiz-answer-right">Doğrusu: {s.question!.options[s.question!.correctIndex].text}</div>
                <div className="quiz-answer-wrong">Senin cevabın: {s.question!.options[s.chosen!].text}</div>
              </div>
            ))}
          </section>
        ) : (
          answered.length > 0 && <p className="msg ok">Hepsi doğru!</p>
        )}
        <button onClick={() => setPhase("setup")}>Yeni sınav</button>
      </div>
    );
  }

  const slot = slots[current];
  const { item, question } = slot;
  const answered = slot.chosen !== undefined;
  const isLast = current + 1 >= slots.length;
  return (
    <div className="quiz-page">
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
        <div className="quiz-question">Bu cümlenin Türkçesi hangisidir?</div>
        <p className="quiz-sentence">
          {item.sentence.slice(0, item.start)}
          <mark>{item.sentence.slice(item.start, item.end)}</mark>
          {item.sentence.slice(item.end)}
        </p>

        {slot.state === "loading" || slot.state === "pending" ? (
          <p className="muted">Soru hazırlanıyor… (güçlü model, biraz sürebilir)</p>
        ) : slot.state === "error" ? (
          <div>
            <p className="msg error">Soru hazırlanamadı: {slot.error}</p>
            <div className="row">
              <button onClick={() => load(current)}>Tekrar dene</button>
              <button className="secondary" onClick={skip}>
                Bu soruyu atla
              </button>
            </div>
          </div>
        ) : (
          question && (
            <>
              <ol className="quiz-options">
                {question.options.map((o, i) => {
                  const cls = !answered ? "" : o.correct ? "correct" : i === slot.chosen ? "wrong" : "dim";
                  return (
                    <li key={i}>
                      <button className={`quiz-option ${cls}`} onClick={() => choose(i)} disabled={answered}>
                        <span className="quiz-letter">{LETTERS[i]}</span>
                        <span>{o.text}</span>
                      </button>
                      {answered && !o.correct && o.why && <div className="quiz-why">{o.why}</div>}
                    </li>
                  );
                })}
              </ol>
              {answered ? (
                <div className="quiz-feedback">
                  {slot.chosen === question.correctIndex ? (
                    <span className="quiz-answer-right">Doğru!</span>
                  ) : (
                    <span className="quiz-answer-wrong">Yanlış. Doğru cevap: {LETTERS[question.correctIndex]}</span>
                  )}
                  <button onClick={next}>{isLast ? "Sonuçları gör" : "Sonraki soru"} (Enter)</button>
                </div>
              ) : (
                <div className="quiz-tools">
                  <span className="muted">1-4 ya da A-D tuşlarıyla da seçebilirsin.</span>
                  <button
                    className="link-btn"
                    onClick={() => load(current, true)}
                    title="Şıklar hatalıysa (ör. iki doğru şık) soruyu yeniden üret"
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
