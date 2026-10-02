import { useEffect, useMemo, useState } from "react";
import { db, type DocumentRecord, type OccurrenceRecord, type TermRecord } from "../db/db";
import type { TermStatus } from "../learning/matcher";
import { refreshTerms, useTerms } from "../learning/store";
import { deleteTerm, occurrenceCounts, occurrencesOf, setTermStatus } from "../learning/terms";
import { STATUS_LABELS } from "../learning/WordPopup";

interface Props {
  onGoTo(occurrence: OccurrenceRecord): void;
}

type Filter = "all" | TermStatus;

function matchesSearch(term: TermRecord, query: string): boolean {
  const q = query.trim().toLocaleLowerCase("tr");
  if (!q) return true;
  return [term.lemma, term.surface, term.meaning].some((field) => field.toLocaleLowerCase("tr").includes(q));
}

export function WordsPage({ onGoTo }: Props) {
  const terms = useTerms();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [counts, setCounts] = useState<Map<number, number>>(new Map());
  const [documents, setDocuments] = useState<Map<number, DocumentRecord>>(new Map());
  const [expanded, setExpanded] = useState<number | null>(null);
  const [occurrences, setOccurrences] = useState<OccurrenceRecord[]>([]);

  useEffect(() => {
    occurrenceCounts(db).then(setCounts);
    db.documents.toArray().then((docs) => setDocuments(new Map(docs.map((d) => [d.id, d]))));
  }, [terms]);

  useEffect(() => {
    if (expanded == null) return;
    occurrencesOf(db, expanded).then(setOccurrences);
  }, [expanded, terms]);

  const visible = useMemo(
    () => terms.filter((t) => (filter === "all" || t.status === filter) && matchesSearch(t, query)),
    [terms, filter, query],
  );
  const totals = useMemo(() => {
    const byStatus: Record<TermStatus, number> = { unknown: 0, learning: 0, known: 0 };
    terms.forEach((t) => byStatus[t.status]++);
    return byStatus;
  }, [terms]);

  async function changeStatus(term: TermRecord, status: TermStatus) {
    await setTermStatus(db, term.id, status);
    await refreshTerms();
  }

  async function remove(term: TermRecord) {
    if (!confirm(`"${term.lemma}" ve kayıtlı geçişleri silinsin mi?`)) return;
    await deleteTerm(db, term.id);
    if (expanded === term.id) setExpanded(null);
    await refreshTerms();
  }

  return (
    <div className="words-page">
      <div className="words-header">
        <h2>Kelimelerim ({terms.length})</h2>
        <span className="muted">
          {totals.unknown} bilmiyorum · {totals.learning} az biliyorum · {totals.known} biliyorum
        </span>
      </div>

      <div className="row words-filters">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Kelime ya da Türkçe anlam ara"
          aria-label="Ara"
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value as Filter)} aria-label="Duruma göre süz">
          <option value="all">Tümü</option>
          {(Object.keys(STATUS_LABELS) as TermStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </div>

      {terms.length === 0 && (
        <p className="muted empty">
          Henüz kelime işaretlemedin. Okuyucuda bir kelimeye tıkla ya da birkaç kelimeyi seç, sonra durumunu işaretle.
        </p>
      )}
      {terms.length > 0 && visible.length === 0 && <p className="muted empty">Aramaya uyan kelime yok.</p>}

      <ul className="term-list">
        {visible.map((term) => (
          <li key={term.id} className={`term-row status-${term.status}`}>
            <div className="term-main">
              <button
                className="term-toggle"
                onClick={() => setExpanded(expanded === term.id ? null : term.id)}
                aria-expanded={expanded === term.id}
              >
                <span className="term-lemma">{term.lemma}</span>
                {term.surface.toLowerCase() !== term.lemma.toLowerCase() && <span className="muted"> ({term.surface})</span>}
                <span className="term-meaning">{term.meaning || <span className="muted">anlam yok</span>}</span>
              </button>
              <span className="muted term-count" title="Kaydedilen geçiş sayısı">
                {counts.get(term.id) ?? 0} geçiş
              </span>
              <select
                className={`status-select ${term.status}`}
                value={term.status}
                onChange={(e) => changeStatus(term, e.target.value as TermStatus)}
                aria-label={`${term.lemma} durumu`}
              >
                {(Object.keys(STATUS_LABELS) as TermStatus[]).map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </select>
              <button className="icon-btn" onClick={() => remove(term)} aria-label={`${term.lemma} sil`} title="Sil">
                ×
              </button>
            </div>

            {expanded === term.id && (
              <div className="term-details">
                {term.explanation && <p className="muted">{term.explanation}</p>}
                {occurrences.length === 0 && <p className="muted">Kayıtlı cümle yok.</p>}
                <ul className="occurrence-list">
                  {occurrences.map((occ) => {
                    const doc = documents.get(occ.documentId);
                    const where = doc ? `${doc.name} · ${doc.format === "pdf" || occ.view === "original" ? "s." : "bölüm"} ${occ.page}` : "silinmiş belge";
                    return (
                      <li key={occ.id}>
                        <p className="occurrence-sentence">{occ.sentence}</p>
                        <div className="row small">
                          <span className="muted">{where}</span>
                          {doc && (
                            <button className="secondary" onClick={() => onGoTo(occ)}>
                              Cümleye git
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
