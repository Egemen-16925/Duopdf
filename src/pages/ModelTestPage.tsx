import { useState } from "react";
import { listModels } from "../ai/aiClient";
import { formatResults, runTask, TEST_TASKS, type TaskResult } from "../ai/modelTest";
import { ROLE_LABELS, type ModelRole, type ProviderSettings } from "../settings/providers";
import { ModelInput } from "./ModelInput";

interface Props {
  settings: ProviderSettings;
  onChange(next: ProviderSettings): Promise<void>;
  modelLists: Record<string, string[]>;
  onModelList(profileId: string, models: string[]): void;
}

const ROLE_SHORT: Record<ModelRole, string> = { fast: "Hızlı", strong: "Güçlü", vision: "Görsel" };

export function ModelTestPage({ settings, onChange, modelLists, onModelList }: Props) {
  /** Hangi sağlayıcının modelleri deneniyor. */
  const [profileId, setProfileId] = useState(settings.roles.fast.profileId);
  const profile = settings.profiles.find((p) => p.id === profileId) ?? settings.profiles[0];
  const [models, setModels] = useState<string[]>(() =>
    [
      ...new Set(
        (Object.keys(ROLE_LABELS) as ModelRole[])
          .filter((r) => r !== "vision" && settings.roles[r].profileId === profileId)
          .map((r) => settings.roles[r].model)
          .filter((m) => m.trim()),
      ),
    ],
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
    if (modelLists[profile.id]) return;
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
      setNotice(`"${profile.name}" sağlayıcısının API anahtarı yok. Önce Ayarlar'dan anahtarı gir ve kaydet.`);
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

  async function assign(model: string, role: ModelRole) {
    await onChange({ ...settings, roles: { ...settings.roles, [role]: { profileId: profile.id, model } } });
    setNotice(`"${model}" (${profile.name}) ${ROLE_LABELS[role].toLocaleLowerCase("tr")} olarak kaydedildi.`);
  }

  const isAssigned = (model: string, role: ModelRole) =>
    settings.roles[role].profileId === profile.id && settings.roles[role].model === model;

  return (
    <div className="model-test">
      <h2>Model testi</h2>
      <p className="muted">
        Her model aynı üç görevi yapar; sonuçları yan yana karşılaştır. 429 hataları yeniden denenmeden gösterilir.
      </p>

      <div className="row">
        <label className="inline-label">
          Sağlayıcı
          <select
            value={profile.id}
            disabled={running}
            onChange={(e) => {
              setProfileId(e.target.value);
              setModels([]);
              setResults([]);
            }}
          >
            {settings.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <ModelInput
          value={input}
          options={available}
          placeholder="Model kimliği yaz veya listeden seç"
          ariaLabel="Denenecek model"
          onOpen={fetchModels}
          onChange={setInput}
          onEnter={addModel}
        />
        <button className="secondary" onClick={addModel} disabled={!input.trim()}>
          Ekle
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
                      {(Object.keys(ROLE_SHORT) as ModelRole[]).map((role) => (
                        <button key={role} className="secondary" disabled={running} onClick={() => assign(m, role)}>
                          {isAssigned(m, role) ? `✓ ${ROLE_SHORT[role]}` : `${ROLE_SHORT[role]} yap`}
                        </button>
                      ))}
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
