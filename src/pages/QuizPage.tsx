import { useEffect, useMemo, useRef, useState } from "react";
import { describeAiError } from "../ai/errors";
import type { Evaluation } from "../ai/schemas";
import { db, type OccurrenceRecord } from "../db/db";
import { trackRoot, untrackRoot } from "../learning/highlights";
import type { TermStatus } from "../learning/matcher";
import { pickFromPointer, type Pick } from "../learning/pick";
import { SentencePopup } from "../learning/SentencePopup";
import { refreshTerms, useTerms } from "../learning/store";
import { STATUS_LABELS as STATUS_NAMES, WordPopup } from "../learning/WordPopup";
import {
  countEligible,
  evaluateAnswer,
  makeQuestion,
  pickQuizItems,
  pickReviewItems,
  quizStats,
  recordAttempt,
  recordOpenAttempt,
  wordUnderstood,
  type QuizItem,
  type QuizKindMode,
  type QuizMode,
  type QuizQuestion,
  type TermQuizStats,
} from "../quiz/quiz";
import { describeDue, dueTerms, type ReviewChange } from "../quiz/review";
import type { AiTarget } from "../settings/providers";
import { QuizScore } from "./WordsPage";

interface Props {
  /** Güçlü model (soruları üretir ve yazılı cevabı değerlendirir; hata olursa yedek model denenir). */
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
  /** Çoktan seçmelide seçilen şık. */
  chosen?: number;
  /** Açık uçluda yazılan cevap ve değerlendirmesi. */
  answer?: string;
  evaluating?: boolean;
  evalError?: string;
  evaluation?: Evaluation;
  /** Cevap bitti mi, kelime doğru bilindi mi. */
  done?: boolean;
  correct?: boolean;
  change?: ReviewChange | null;
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
const KINDS: { kind: QuizKindMode; label: string }[] = [
  { kind: "mixed", label: "Karışık" },
  { kind: "mcq", label: "Çoktan seçmeli" },
  { kind: "open", label: "Çeviriyi ben yazayım" },
];
const RESULT_LABELS: Record<Evaluation["sonuc"], string> = { dogru: "Doğru", kismen: "Kısmen doğru", yanlis: "Yanlış" };
const ERROR_LABELS: Record<Evaluation["hatalar"][number]["tur"], string> = {
  anlam: "Anlam",
  dilbilgisi: "Dilbilgisi",
  kelime: "Kelime",
  eksik: "Eksik",
  fazla: "Fazla",
};
const COUNTS = [5, 10, 15, 20];
const LETTERS = ["A", "B", "C", "D"];
/** Şu anki sorudan sonra kaç soru önceden hazırlansın. */
const PREFETCH = 2;
/** Cevaplandıktan sonra tıklanıp çevrilebilen İngilizce metin (okuyucudaki gibi). */
const PICKABLE = "quiz-pickable";

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

/** Cevaptan sonra kelimenin durumunda ve tekrar zamanında ne değişti. */
function ChangeNote({ change }: { change?: ReviewChange | null }) {
  if (!change) return null;
  const due = describeDue(change.review.dueAt, Date.now());
  return (
    <span className="muted quiz-change">
      {change.before !== change.after && (
        <>
          <strong>{STATUS_NAMES[change.before]}</strong> → <strong>{STATUS_NAMES[change.after]}</strong> ·{" "}
        </>
      )}
      Sonraki tekrar: {due}
    </span>
  );
}

export function QuizPage({ target, fast, active }: Props) {
  const terms = useTerms();
  const [occurrences, setOccurrences] = useState<OccurrenceRecord[]>([]);
  const [stats, setStats] = useState<Map<string, TermQuizStats>>(new Map());
  const [statuses, setStatuses] = useState<TermStatus[]>(["unknown", "learning"]);
  const [mode, setMode] = useState<QuizMode>("mixed");
  const [kind, setKind] = useState<QuizKindMode>("mixed");
  const [count, setCount] = useState(10);
  const [phase, setPhase] = useState<"setup" | "running" | "done">("setup");
  const [isReview, setIsReview] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [current, setCurrent] = useState(0);
  const loading = useRef(new Set<number>());
  /** Yeni sınav başlayınca eski isteklerin sonuçları yok sayılır. */
  const run = useRef(0);
  const pageRef = useRef<HTMLDivElement>(null);
  const [popup, setPopup] = useState<Pick | null>(null);
  const [now, setNow] = useState(Date.now());

  // Ayar ve sonuç ekranında güncel sayılar.
  useEffect(() => {
    if (!active || phase === "running") return;
    setNow(Date.now());
    db.occurrences.toArray().then(setOccurrences);
    quizStats(db).then(setStats);
  }, [active, phase, terms]);

  const eligible = useMemo(() => countEligible(terms, statuses), [terms, statuses]);
  const due = useMemo(() => dueTerms(terms, now), [terms, now]);
  const nextDue = useMemo(() => Math.min(...terms.map((t) => t.review.dueAt)), [terms]);

  async function start(review: boolean) {
    const items = review
      ? pickReviewItems(terms, occurrences, Date.now(), { count, mode, kind })
      : pickQuizItems(terms, occurrences, await quizStats(db), { count, statuses, mode, kind });
    if (items.length === 0) return;
    run.current++;
    loading.current.clear();
    setIsReview(review);
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
    if (slot?.question?.kind !== "mcq" || slot.done) return;
    const correct = index === slot.question.correctIndex;
    patch(current, { chosen: index, done: true, correct });
    const { change } = await recordAttempt(db, slot.item, slot.question, index);
    patch(current, { change });
    refreshTerms();
  }

  async function submit() {
    const index = current;
    const slot = slots[index];
    const answer = slot?.answer?.trim();
    if (slot?.question?.kind !== "open" || !answer || !target || slot.evaluating || slot.done) return;
    const myRun = run.current;
    patch(index, { evaluating: true, evalError: undefined });
    try {
      const evaluation = await evaluateAnswer(target, slot.item, slot.question, answer);
      if (run.current !== myRun) return;
      const correct = wordUnderstood(evaluation, slot.item.term.lemma);
      patch(index, { evaluating: false, evaluation, done: true, correct });
      const { change } = await recordOpenAttempt(db, slot.item, slot.question, answer, evaluation);
      patch(index, { change });
      refreshTerms();
    } catch (e) {
      if (run.current === myRun) patch(index, { evaluating: false, evalError: describeAiError(e) });
    }
  }

  function next() {
    if (current + 1 >= slots.length) setPhase("done");
    else setCurrent(current + 1);
  }

  // Cevaplanan sorudaki ve sonuç ekranındaki İngilizce metin: kelimeye tıkla ya da cümleyi seç (okuyucudaki gibi).
  const doneNow = phase === "running" && !!slots[current]?.done;
  useEffect(() => {
    const root = pageRef.current;
    if (!root) return;
    const pickables = [...root.querySelectorAll("." + PICKABLE)];
    pickables.forEach((el) => trackRoot(el, "flow"));
    const onUp = (e: MouseEvent) => {
      if (e.button !== 0 || (e.target as HTMLElement).closest("button, textarea")) return;
      const result = pickFromPointer(e, "." + PICKABLE, "flow");
      if (result) setPopup(result.pick);
    };
    root.addEventListener("mouseup", onUp);
    return () => {
      root.removeEventListener("mouseup", onUp);
      pickables.forEach(untrackRoot);
    };
  }, [phase, current, doneNow]);

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

  // Klavye: 1-4 ya da A-D şık seçer, Enter sonraki soruya geçer; yazılı cevapta Ctrl+Enter gönderir.
  const keyHandler = useRef<(e: KeyboardEvent) => void>(() => {});
  keyHandler.current = (e: KeyboardEvent) => {
    if (phase !== "running") return;
    const slot = slots[current];
    if (!slot) return;
    const el = document.activeElement as HTMLElement | null;
    const typing = !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName));
    if (typing) {
      if (el?.tagName === "TEXTAREA" && e.key === "Enter" && (e.ctrlKey || !e.shiftKey)) {
        e.preventDefault();
        // Değerlendirildikten sonra Enter sonraki soruya geçer.
        if (slot.done) next();
        else submit();
      }
      return;
    }
    if (e.ctrlKey || e.altKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    const choice = ["1", "2", "3", "4"].includes(k) ? Number(k) - 1 : ["a", "b", "c", "d"].indexOf(k);
    if (choice >= 0 && slot.question?.kind === "mcq" && !slot.done) {
      e.preventDefault();
      choose(choice);
    } else if (e.key === "Enter" && slot.done) {
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
        <h2>Sınav ve tekrar</h2>
        {!target && <p className="msg error">Ayarlar → Modeller'den bir güçlü model seç; soruları o hazırlar.</p>}

        <section className="profile-form quiz-review">
          <div>
            <h3>Bugünkü tekrar</h3>
            <p className="muted">
              {due.length > 0
                ? `${due.length} kelimenin tekrar zamanı geldi.${due.length > count ? ` Bu turda ${count} tanesi sorulur.` : ""}`
                : terms.length > 0
                  ? `Bugün tekrar edilecek kelime yok. Sonraki tekrar: ${describeDue(nextDue, now)}.`
                  : "Henüz işaretli kelime yok. Okurken kelime işaretle."}
            </p>
          </div>
          <button onClick={() => start(true)} disabled={!target || due.length === 0}>
            Tekrara başla
          </button>
        </section>

        <section className="profile-form quiz-setup">
          <h3>Sınav ayarları</h3>
          <div className="quiz-setup-row">
            <span className="quiz-setup-label">Soru türü</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as QuizKindMode)} aria-label="Soru türü">
              {KINDS.map((k) => (
                <option key={k.kind} value={k.kind}>
                  {k.label}
                </option>
              ))}
            </select>
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
          </div>
          <div className="quiz-setup-row">
            <span className="quiz-setup-label">Serbest sınavda</span>
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
            <button onClick={() => start(false)} disabled={!target || eligible === 0}>
              Serbest sınav başlat
            </button>
            <span className="muted">
              {eligible > 0
                ? `Bu durumlarda ${eligible} kelime var${eligible < count ? `; sınav ${eligible} soru olacak` : ""}.`
                : "Bu durumlarda kelime yok."}
            </span>
          </div>
          <p className="muted quiz-note">
            Her cevap kelimenin tekrar zamanını günceller: doğru bildikçe aralık büyür (1, 3, 7 gün…), yanlış yaptığın kelime
            bugün yeniden sorulur, üst üste 3 doğru "biliyorum"a yükseltir.
          </p>
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
    const answered = slots.filter((s) => s.done && s.question);
    const right = answered.filter((s) => s.correct);
    const wrong = answered.filter((s) => !s.correct);
    const skipped = slots.length - answered.length;
    return (
      <div ref={pageRef} className="quiz-page">
        {popups}
        <h2>{isReview ? "Tekrar bitti" : "Sınav bitti"}</h2>
        <p className="quiz-score">
          {right.length} / {answered.length} kelime doğru
          {skipped > 0 && <span className="muted"> · {skipped} soru cevaplanmadı</span>}
        </p>

        <section className="quiz-scores">
          <h3>Bu turdaki kelimeler</h3>
          <div className="quiz-score-list">
            {answered.map((s, i) => (
              <div key={i} className="quiz-score-row">
                <span className={s.correct ? "quiz-answer-right" : "quiz-answer-wrong"}>{s.correct ? "✓" : "✗"}</span>
                <span className="quiz-mistake-term">{s.item.term.lemma}</span>
                <ChangeNote change={s.change} />
                <QuizScore stats={stats.get(s.item.term.key)} />
              </div>
            ))}
          </div>
        </section>

        {wrong.length > 0 ? (
          <section className="quiz-mistakes">
            <h3>Yanlış yaptığın sorular</h3>
            {wrong.map((s, i) => {
              const q = s.question!;
              const right = q.kind === "mcq" ? q.options[q.correctIndex].text : q.direction === "en-tr" ? q.turkish : q.english;
              const yours = q.kind === "mcq" ? q.options[s.chosen!].text : s.answer;
              return (
                <div key={i} className="quiz-mistake">
                  <div className="quiz-mistake-term">{s.item.term.lemma}</div>
                  <div className="quiz-sentence-small">
                    <English question={q} pickable />
                  </div>
                  {q.direction === "tr-en" && <div className="muted">{q.turkish}</div>}
                  <div className="quiz-answer-right">Doğrusu: {right}</div>
                  <div className="quiz-answer-wrong">Senin cevabın: {yours}</div>
                </div>
              );
            })}
          </section>
        ) : (
          answered.length > 0 && <p className="msg ok">Hepsi doğru!</p>
        )}
        <button onClick={() => setPhase("setup")}>Bitti</button>
      </div>
    );
  }

  const slot = slots[current];
  const { question } = slot;
  const isLast = current + 1 >= slots.length;
  const toTurkish = slot.item.direction === "en-tr";
  const isOpen = slot.item.kind === "open";
  const ask = isOpen
    ? toTurkish
      ? "Bu cümleyi Türkçeye çevir:"
      : "Bu cümleyi İngilizceye çevir:"
    : toTurkish
      ? "Bu cümlenin Türkçesi hangisidir?"
      : "Bu cümlenin İngilizcesi hangisidir?";

  return (
    <div ref={pageRef} className="quiz-page">
      {popups}
      <div className="quiz-head">
        <span>
          {isReview ? "Tekrar" : "Soru"} {current + 1} / {slots.length}
        </span>
        <div className="quiz-progress" aria-hidden>
          <div style={{ width: `${(current / slots.length) * 100}%` }} />
        </div>
        <button className="secondary" onClick={() => setPhase("done")}>
          Bitir
        </button>
      </div>

      <section className="quiz-card">
        <div className="quiz-question">{ask}</div>

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
              <p className="quiz-sentence">{toTurkish ? <English question={question} pickable={slot.done} /> : question.turkish}</p>

              {question.kind === "mcq" ? (
                <ol className="quiz-options">
                  {question.options.map((o, i) => {
                    const cls = !slot.done ? "" : o.correct ? "correct" : i === slot.chosen ? "wrong" : "dim";
                    return (
                      <li key={i}>
                        {slot.done ? (
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
                        {slot.done && !o.correct && o.why && <div className="quiz-why">{o.why}</div>}
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <div className="quiz-open">
                  <textarea
                    key={current}
                    value={slot.answer ?? ""}
                    onChange={(e) => patch(current, { answer: e.target.value })}
                    placeholder={toTurkish ? "Türkçe çevirini yaz…" : "İngilizce çevirini yaz…"}
                    rows={3}
                    disabled={slot.done || slot.evaluating}
                    autoFocus
                    aria-label="Çevirin"
                  />
                  {!slot.done && (
                    <div className="quiz-tools">
                      <span className="muted">Enter: gönder · Shift+Enter: yeni satır</span>
                      <button onClick={submit} disabled={!slot.answer?.trim() || slot.evaluating}>
                        {slot.evaluating ? "Değerlendiriliyor…" : "Kontrol et"}
                      </button>
                    </div>
                  )}
                  {slot.evalError && (
                    <p className="msg error">
                      Değerlendirilemedi: {slot.evalError}
                      <br />
                      <button className="link-btn" onClick={submit}>
                        Tekrar dene
                      </button>
                    </p>
                  )}
                  {slot.evaluation && <EvaluationView evaluation={slot.evaluation} toTurkish={toTurkish} question={question} />}
                </div>
              )}

              {slot.done ? (
                <>
                  <p className="muted quiz-hint">İngilizce yazıda kelimeye tıkla ya da cümleyi seç: anlamı ve çevirisi açılır.</p>
                  {!toTurkish && (
                    <p className="quiz-target muted">
                      Hedef kelime: <strong>{slot.item.term.lemma}</strong> — <English question={question} pickable />
                    </p>
                  )}
                  <div className="quiz-feedback">
                    <span className={slot.correct ? "quiz-answer-right" : "quiz-answer-wrong"}>
                      {question.kind === "mcq"
                        ? slot.correct
                          ? "Doğru!"
                          : `Yanlış. Doğru cevap: ${LETTERS[question.correctIndex]}`
                        : slot.correct
                          ? `"${slot.item.term.lemma}" doğru anlaşıldı.`
                          : `"${slot.item.term.lemma}" doğru çevrilmedi.`}
                    </span>
                    <ChangeNote change={slot.change} />
                    <button onClick={next}>{isLast ? "Sonuçları gör" : "Sonraki soru"} (Enter)</button>
                  </div>
                </>
              ) : (
                question.kind === "mcq" && (
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
                )
              )}
            </>
          )
        )}
      </section>
    </div>
  );
}

/** Yazılı cevabın değerlendirmesi: sonuç, hatalar, düzeltilmiş çeviri. */
function EvaluationView({ evaluation, toTurkish, question }: { evaluation: Evaluation; toTurkish: boolean; question: QuizQuestion }) {
  return (
    <div className={`quiz-eval ${evaluation.sonuc}`}>
      <div className="quiz-eval-head">
        <strong>{RESULT_LABELS[evaluation.sonuc]}</strong>
        <span className="muted">{Math.round(evaluation.puan)} / 100</span>
      </div>
      {evaluation.hatalar.length > 0 && (
        <ul className="quiz-eval-errors">
          {evaluation.hatalar.map((h, i) => (
            <li key={i}>
              <span className="quiz-eval-kind">{ERROR_LABELS[h.tur]}</span>
              {h.kullaniciIfadesi && <span className="quiz-eval-quote">"{h.kullaniciIfadesi}"</span>} {h.aciklama}
            </li>
          ))}
        </ul>
      )}
      <div>
        <span className="muted">Düzeltilmiş çevirin: </span>
        <span className={toTurkish ? undefined : PICKABLE}>{evaluation.duzeltilmisCeviri}</span>
      </div>
      <div>
        <span className="muted">Örnek çeviri: </span>
        {toTurkish ? question.turkish : <English question={question} pickable />}
      </div>
    </div>
  );
}
