import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useState } from "react";
import { listModels, testConnection } from "../ai/aiClient";
import { AiError } from "../ai/errors";
import { newProfile, type ProviderProfile, type ProviderSettings } from "../settings/providers";

interface Props {
  settings: ProviderSettings;
  onChange(next: ProviderSettings): Promise<void>;
  modelLists: Record<string, string[]>;
  onModelList(profileId: string, models: string[]): void;
}

type Status = { kind: "info" | "ok" | "error"; text: string } | null;

function errorText(e: unknown): string {
  if (e instanceof AiError) return e.detail ? `${e.message}\nSağlayıcının mesajı: ${e.detail}` : e.message;
  return String(e);
}

export function SettingsPage({ settings, onChange, modelLists, onModelList }: Props) {
  const [selectedId, setSelectedId] = useState(settings.activeProfileId);
  const saved = settings.profiles.find((p) => p.id === selectedId) ?? settings.profiles[0];
  const [draft, setDraft] = useState<ProviderProfile>(saved);
  const [showKey, setShowKey] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    setDraft(saved);
    setStatus(null);
    setShowKey(false);
  }, [saved.id]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const models = modelLists[draft.id] ?? [];
  const isActive = settings.activeProfileId === draft.id;

  function field<K extends keyof ProviderProfile>(key: K, value: ProviderProfile[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    const cleaned = { ...draft, name: draft.name.trim() || "Adsız profil", baseUrl: draft.baseUrl.trim(), apiKey: draft.apiKey.trim() };
    await onChange({ ...settings, profiles: settings.profiles.map((p) => (p.id === cleaned.id ? cleaned : p)) });
    setDraft(cleaned);
    setStatus({ kind: "ok", text: "Kaydedildi." });
  }

  async function addProfile() {
    const profile = newProfile();
    await onChange({ ...settings, profiles: [...settings.profiles, profile] });
    setSelectedId(profile.id);
  }

  async function removeProfile() {
    if (settings.profiles.length <= 1) return;
    if (!confirm(`"${saved.name}" profili silinsin mi? Öğrenme verilerin etkilenmez.`)) return;
    const profiles = settings.profiles.filter((p) => p.id !== saved.id);
    const activeProfileId = isActive ? profiles[0].id : settings.activeProfileId;
    await onChange({ profiles, activeProfileId });
    setSelectedId(activeProfileId);
  }

  async function makeActive() {
    await onChange({ ...settings, activeProfileId: draft.id });
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setStatus({ kind: "info", text: "Bekleniyor…" });
    try {
      await action();
    } catch (e) {
      setStatus({ kind: "error", text: errorText(e) });
    } finally {
      setBusy(false);
    }
  }

  const fetchModels = () =>
    run(async () => {
      const list = await listModels(draft);
      onModelList(draft.id, list);
      setStatus({ kind: "ok", text: `${list.length} model listelendi. Model alanlarına yazarken öneri olarak çıkacaklar.` });
    });

  const checkConnection = () =>
    run(async () => {
      const report = await testConnection(draft);
      setStatus({ kind: report.ok ? "ok" : "info", text: report.message });
    });

  return (
    <div className="settings">
      <aside className="profile-list">
        <h2>Sağlayıcı profilleri</h2>
        {settings.profiles.map((p) => (
          <button
            key={p.id}
            className={p.id === draft.id ? "profile-item selected" : "profile-item"}
            onClick={() => setSelectedId(p.id)}
          >
            <span>{p.name}</span>
            {p.id === settings.activeProfileId && <span className="badge ok">etkin</span>}
          </button>
        ))}
        <button className="secondary" onClick={addProfile}>
          + Yeni profil
        </button>
      </aside>

      <section className="profile-form">
        <h2>
          {saved.name} {isActive && <span className="badge ok">etkin</span>}
        </h2>

        <label>
          Profil adı
          <input value={draft.name} onChange={(e) => field("name", e.target.value)} />
        </label>

        <label>
          Temel adres (base URL)
          <input
            value={draft.baseUrl}
            placeholder="https://integrate.api.nvidia.com/v1"
            onChange={(e) => field("baseUrl", e.target.value)}
          />
          <small>OpenAI uyumlu bir uç nokta. Ollama için: http://localhost:11434/v1</small>
        </label>

        <label>
          API anahtarı
          <div className="row">
            <input
              type={showKey ? "text" : "password"}
              value={draft.apiKey}
              placeholder="nvapi-..."
              autoComplete="off"
              spellCheck={false}
              onChange={(e) => field("apiKey", e.target.value)}
            />
            <button className="secondary" type="button" onClick={() => setShowKey((s) => !s)}>
              {showKey ? "Gizle" : "Göster"}
            </button>
          </div>
          <small>
            Anahtar yalnızca bu cihazda saklanır ve sadece bu sağlayıcıya gönderilir. NVIDIA anahtarı:{" "}
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                openUrl("https://build.nvidia.com/settings/api-keys");
              }}
            >
              build.nvidia.com/settings/api-keys
            </a>
          </small>
        </label>

        <datalist id="model-options">
          {models.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        <label>
          Hızlı model
          <input
            list="model-options"
            value={draft.fastModel}
            placeholder="kelime anlamı ve cümle çevirisi için"
            onChange={(e) => field("fastModel", e.target.value)}
          />
        </label>

        <label>
          Güçlü model
          <input
            list="model-options"
            value={draft.strongModel}
            placeholder="çeviri değerlendirme ve sınav şıkları için"
            onChange={(e) => field("strongModel", e.target.value)}
          />
        </label>

        <div className="actions">
          <button onClick={save} disabled={!dirty || busy}>
            Kaydet
          </button>
          <button className="secondary" onClick={checkConnection} disabled={busy}>
            Bağlantıyı test et
          </button>
          <button className="secondary" onClick={fetchModels} disabled={busy}>
            Modelleri getir
          </button>
          {!isActive && (
            <button className="secondary" onClick={makeActive} disabled={busy || dirty}>
              Etkin profil yap
            </button>
          )}
          <button className="danger" onClick={removeProfile} disabled={busy || settings.profiles.length <= 1}>
            Sil
          </button>
        </div>
        {dirty && <p className="msg info">Kaydedilmemiş değişiklikler var. Testler formdaki değerlerle yapılır.</p>}
        {status && <p className={`msg ${status.kind}`}>{status.text}</p>}
      </section>
    </div>
  );
}
