import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { db, type QuizAttemptRecord } from "../db/db";
import { useTerms } from "../learning/store";
import { dueTerms } from "../quiz/review";
import { accuracy, dailyCounts, dailyStreak, mostMistaken, type DayCount } from "../stats/stats";

interface Props {
  active: boolean;
  /** Boş durumda kullanıcıyı okuyucuya ya da sınava götürür. */
  onGo(page: "reader" | "quiz"): void;
}

const DAYS = 30;
const dayLabel = (day: number) => new Date(day).toLocaleDateString("tr-TR", { day: "numeric", month: "short" });

function Tile({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {note && <div className="stat-note muted">{note}</div>}
    </div>
  );
}

/** Y ekseni için yuvarlak üst sınır ve 3-4 çizgi. */
function niceTicks(max: number): number[] {
  if (max <= 4) return [0, 2, 4];
  const step = [1, 2, 5, 10, 20, 25, 50, 100].find((s) => max / s <= 4) ?? Math.ceil(max / 4);
  const top = Math.ceil(max / step) * step;
  return Array.from({ length: top / step + 1 }, (_, i) => i * step);
}

/** Son 30 günde günlük cevaplanan soru sayısı: tek seri sütun grafik, üzerine gelince ayrıntı. */
function DailyChart({ days }: { days: DayCount[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);

  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const observer = new ResizeObserver(() => setWidth(el.clientWidth));
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const height = 180;
  const pad = { left: 28, right: 8, top: 10, bottom: 24 };
  const ticks = niceTicks(Math.max(...days.map((d) => d.total), 1));
  const top = ticks[ticks.length - 1];
  const plotW = Math.max(100, width - pad.left - pad.right);
  const plotH = height - pad.top - pad.bottom;
  const slot = plotW / days.length;
  const barW = Math.min(24, Math.max(2, slot - 2)); // komşu sütunlar arasında en az 2 px boşluk
  const y = (v: number) => pad.top + plotH - (v / top) * plotH;
  const radius = Math.min(4, barW / 2);
  const hovered = hover !== null ? days[hover] : null;

  return (
    <div ref={wrapRef} className="daily-chart" onMouseLeave={() => setHover(null)}>
      <svg width={width} height={height} role="img" aria-label="Son 30 günde günlük cevaplanan soru sayısı">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.left} x2={width - pad.right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={pad.left - 6} y={y(t)} className="chart-axis" textAnchor="end" dominantBaseline="middle">
              {t}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const x = pad.left + i * slot + (slot - barW) / 2;
          const h = (d.total / top) * plotH;
          const r = Math.min(radius, h);
          // Üst köşeleri yuvarlak, tabanı düz sütun.
          const path =
            h > 0
              ? `M${x},${y(0)} V${y(d.total) + r} Q${x},${y(d.total)} ${x + r},${y(d.total)} H${x + barW - r} Q${x + barW},${y(d.total)} ${x + barW},${y(d.total) + r} V${y(0)} Z`
              : "";
          return (
            <g key={d.day}>
              {path && <path d={path} className={hover === i ? "chart-bar hovered" : "chart-bar"} />}
              {/* Fare hedefi sütundan büyük: bütün gün dilimi. */}
              <rect
                x={pad.left + i * slot}
                y={pad.top}
                width={slot}
                height={plotH}
                fill="transparent"
                onMouseEnter={() => setHover(i)}
                tabIndex={0}
                onFocus={() => setHover(i)}
                aria-label={`${dayLabel(d.day)}: ${d.total} soru, ${d.correct} doğru`}
              />
              {(i % 7 === days.length % 7 || i === days.length - 1) && (
                <text x={pad.left + i * slot + slot / 2} y={height - 6} className="chart-axis" textAnchor="middle">
                  {i === days.length - 1 ? "bugün" : dayLabel(d.day)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hovered && hover !== null && (
        <div
          className="chart-tooltip"
          style={{ left: Math.min(Math.max(pad.left + hover * slot + slot / 2, 70), width - 70), top: Math.max(y(hovered.total) - 8, 0) }}
        >
          <div className="muted">{dayLabel(hovered.day)}</div>
          <div>
            <strong>{hovered.total}</strong> soru
          </div>
          {hovered.total > 0 && (
            <div>
              <strong>{hovered.correct}</strong> doğru · <strong>{hovered.total - hovered.correct}</strong> yanlış
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function StatsPage({ active, onGo }: Props) {
  const terms = useTerms();
  const [attempts, setAttempts] = useState<QuizAttemptRecord[]>([]);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    db.quizAttempts.toArray().then(setAttempts);
  }, [active, terms]);

  const days = useMemo(() => dailyCounts(attempts, now, DAYS), [attempts, now]);
  const streak = useMemo(
    () => dailyStreak([...attempts.map((a) => a.createdAt), ...terms.map((t) => t.createdAt)], now),
    [attempts, terms, now],
  );
  const mistakes = useMemo(() => mostMistaken(terms, attempts), [terms, attempts]);
  const counts = useMemo(() => {
    const c = { unknown: 0, learning: 0, known: 0 };
    terms.forEach((t) => c[t.status]++);
    return c;
  }, [terms]);
  const due = useMemo(() => dueTerms(terms, now).length, [terms, now]);
  const rate = accuracy(days);
  const answered30 = days.reduce((n, d) => n + d.total, 0);

  if (terms.length === 0 && attempts.length === 0) {
    return (
      <div className="stats-page">
        <h2>İstatistik</h2>
        <div className="empty-state">
          <p>Henüz istatistik yok.</p>
          <p className="muted">Bir belge açıp bilmediğin kelimeleri işaretle, sonra sınav çöz; ilerlemen burada görünecek.</p>
          <button onClick={() => onGo("reader")}>Okuyucuya git</button>
        </div>
      </div>
    );
  }

  return (
    <div className="stats-page">
      <h2>İstatistik</h2>

      <div className="stat-tiles">
        <Tile label="Öğrenilen kelime" value={counts.known} note={`toplam ${terms.length} kelimeden`} />
        <Tile label="Az biliyorum" value={counts.learning} />
        <Tile label="Bilmiyorum" value={counts.unknown} />
        <Tile
          label="Günlük seri"
          value={`${streak.days} gün`}
          note={streak.today ? "bugün çalıştın" : streak.days > 0 ? "bugün çalışınca seri sürer" : "bugün başla"}
        />
        <Tile label="Bugünkü tekrar" value={due} note={due > 0 ? "kelime bekliyor" : "hepsi tamam"} />
        <Tile label="Son 30 gün başarı" value={rate === null ? "—" : `%${rate}`} note={`${answered30} cevap`} />
      </div>

      <section className="stats-section">
        <h3>Son 30 günde cevaplanan sorular</h3>
        {answered30 > 0 ? (
          <>
            <DailyChart days={days} />
            <details className="stats-table">
              <summary>Tablo olarak göster</summary>
              <table>
                <thead>
                  <tr>
                    <th>Gün</th>
                    <th>Soru</th>
                    <th>Doğru</th>
                    <th>Yanlış</th>
                  </tr>
                </thead>
                <tbody>
                  {days
                    .filter((d) => d.total > 0)
                    .reverse()
                    .map((d) => (
                      <tr key={d.day}>
                        <td>{dayLabel(d.day)}</td>
                        <td>{d.total}</td>
                        <td>{d.correct}</td>
                        <td>{d.total - d.correct}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </details>
          </>
        ) : (
          <div className="empty-state small">
            <p className="muted">Son 30 günde sınav çözülmemiş.</p>
            <button className="secondary" onClick={() => onGo("quiz")}>
              Sınava git
            </button>
          </div>
        )}
      </section>

      <section className="stats-section">
        <h3>En çok yanlış yaptığın kelimeler</h3>
        {mistakes.length > 0 ? (
          <table className="stats-mistakes">
            <thead>
              <tr>
                <th>Kelime</th>
                <th>Anlam</th>
                <th>Yanlış</th>
                <th>Doğru</th>
                <th>Başarı</th>
              </tr>
            </thead>
            <tbody>
              {mistakes.map((w) => (
                <tr key={w.term.key}>
                  <td className="quiz-mistake-term">{w.term.lemma}</td>
                  <td className="muted">{w.term.meaning}</td>
                  <td>{w.wrong}</td>
                  <td>{w.correct}</td>
                  <td>%{Math.round((w.correct / (w.correct + w.wrong)) * 100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="muted">Henüz yanlış yaptığın bir kelime yok.</p>
        )}
      </section>
    </div>
  );
}
