import { useState } from "react";
import { listModels } from "../ai/aiClient";
import { formatResults, runTask, TEST_TASKS, type TaskResult } from "../ai/modelTest";
import { activeProfile, type ProviderSettings } from "../settings/providers";

interface Props {
  settings: ProviderSettings;
  onChange(next: ProviderSettings): Promise<void>;
  modelLists: Record<string, string[]>;
  onModelList(profileId: string, models: string[]): void;
}

export function ModelTestPage({ settings, onChange, modelLists, onModelList }: Props) {
  const profile = activeProfile(settings);
  const [models, setModels] = useState<string[]>(() =>
    [...new Set([profile.fastModel, profile.strongModel].filter((m) => m.trim()))],
  );
  const [input, setInput] = useState("");
  const [results, setResults] = useState<TaskResult[]>([]);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const available = modelLists[profile.id] ?? [];

  function addModel() {
    const id = input.trim();
    if (id && !models.includes(id)) setModels([...models, id]);
    setInput("");
  }

  function removeModel(id: string) {
    setModels(models.filter((m) => m !== id));
    setResults(results.filter((r) => r.model !== id));
  }

  async function fetchModels() {
    try {
      onModelList(profile.id, await listModels(profile));
      setNotice(null);
    } catch (e) {
      setNotice(`Model listesi alınamadı: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function upsert(result: TaskResult) {
    setResults((prev) => [
      ...prev.filter((r) => !(r.model === result.model && r.taskId === result.taskId)),
      result,
    ]);
  }

  async function start() {
    if (!profile.apiKey.trim()) {
      setNotice("Etkin profilde API anahtarı yok. Önce Ayarlar'dan anahtarı gir ve kaydet.");
      return;
    }
    setRunning(true);
    setNotice(null);
    setResults([]);
    // Modeller paralel, her modelin görevleri sırayla (hız sınırı model başına).
    await Promise.all(
      models.map(async (model) => {
        for (const task of TEST_TASKS) {
          upsert({ model, taskId: task.id, state: "running" });
          upsert(await runTask(profile, model, task));
        }
      }),
    );
    setRunning(false);
  }

  async function copy() {
    const text = formatResults(models, results);
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Sonuçlar panoya kopyalandı. Claude Code'a yapıştırabilirsin.");
    } catch {
      setNotice("Panoya kopyalanamadı.");
    }
  }

  async function assign(model: string, role: "fastModel" | "strongModel") {
    await onChange({
      ...settings,
      profiles: settings.profiles.map((p) => (p.id === profile.id ? { ...p, [role]: model } : p)),
    });
    setNotice(`"${model}" ${role === "fastModel" ? "hızlı" : "güçlü"} model olarak kaydedildi.`);
  }

  return (
    <div className="model-test">
      <h2>Model testi</h2>
      <p className="muted">
        Etkin profil: <strong>{profile.name}</strong>. Her model aynı üç görevi yapar; sonuçları yan yana karşılaştır.
        429 hataları yeniden denenmeden gösterilir.
      </p>

      <div className="row">
        <input
          list="test-model-options"
          value={input}
          placeholder="Model kimliği yaz veya listeden seç"
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && addModel()}
        />
        <datalist id="test-model-options">
          {available.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        <button className="secondary" onClick={addModel} disabled={!input.trim()}>
          Ekle
        </button>
        <button className="secondary" onClick={fetchModels}>
          Modelleri getir{available.length ? ` (${available.length})` : ""}
        </button>
      </div>

      <div className="chips">
        {models.map((m) => (
          <span key={m} className="chip">
            {m}
            <button onClick={() => removeModel(m)} disabled={running} aria-label={`${m} kaldır`}>
              ×
            </button>
          </span>
        ))}
        {models.length === 0 && <span className="muted">Henüz model eklenmedi.</span>}
      </div>

      <div className="actions">
        <button onClick={start} disabled={running || models.length === 0}>
          {running ? "Çalışıyor…" : "Testi başlat"}
        </button>
        <button className="secondary" onClick={copy} disabled={running || results.length === 0}>
          Sonuçları kopyala
        </button>
      </div>
      {notice && <p className="msg info">{notice}</p>}

      {models.length > 0 && (
        <div className="results-scroll">
          <table className="results">
            <thead>
              <tr>
                <th>Görev</th>
                {models.map((m) => (
                  <th key={m}>
                    <div className="model-name">{m}</div>
                    <div className="row small">
                      <button className="secondary" disabled={running} onClick={() => assign(m, "fastModel")}>
                        {profile.fastModel === m ? "✓ Hızlı" : "Hızlı yap"}
                      </button>
                      <button className="secondary" disabled={running} onClick={() => assign(m, "strongModel")}>
                        {profile.strongModel === m ? "✓ Güçlü" : "Güçlü yap"}
                      </button>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {TEST_TASKS.map((task) => (
                <tr key={task.id}>
                  <td className="task-cell">
                    <strong>{task.title}</strong>
                    <div className="muted">{task.description}</div>
                  </td>
                  {models.map((m) => (
                    <td key={m}>
                      <ResultCell result={results.find((r) => r.model === m && r.taskId === task.id)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ResultCell({ result }: { result?: TaskResult }) {
  if (!result) return <span className="muted">—</span>;
  if (result.state === "running") return <span className="muted">Çalışıyor…</span>;
  const httpOk = result.status != null && result.status >= 200 && result.status < 300;
  return (
    <div className="result">
      <div className="badges">
        <span className={`badge ${httpOk ? "ok" : "bad"}`}>HTTP {result.status ?? "—"}</span>
        {result.ms != null && <span className="badge">{(result.ms / 1000).toFixed(1)} sn</span>}
        <span className={`badge ${result.jsonValid ? "ok" : "bad"}`}>JSON {result.jsonValid ? "geçerli" : "geçersiz"}</span>
        {result.hadThinking && <span className="badge warn">düşünme var</span>}
      </div>
      {result.error && <pre className="error-text">{result.error}</pre>}
      {result.output && <pre>{result.output}</pre>}
    </div>
  );
}
