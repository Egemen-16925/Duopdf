import { askConfirm } from "../ui/confirm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import { listModels, testConnection } from "../ai/aiClient";
import { AiError } from "../ai/errors";
import {
  newProfile,
  removeProfile,
  ROLE_LABELS,
  type ModelRole,
  type ProviderProfile,
  type ProviderSettings,
} from "../settings/providers";
import { BackupSection } from "./BackupSection";
import { ModelInput } from "./ModelInput";
import { PrefsSection } from "./PrefsSection";

interface Props {
  settings: ProviderSettings;
  onChange(next: ProviderSettings): Promise<void>;
  modelLists: Record<string, string[]>;
  onModelList(profileId: string, models: string[]): void;
}

type Status = { kind: "info" | "ok" | "error"; text: string } | null;

const ROLE_HELP: Record<ModelRole, string> = {
  fast: "Kelime anlamı ve cümle çevirisi. Sık ve kısa istekler; hızlı, düşünme çıktısı üretmeyen bir model seç.",
  strong: "Çeviri değerlendirme ve sınav şıkları. Daha yavaş olabilir; doğruluk önemli.",
  vision: "İsteğe bağlı. Yerel OCR'ın okuyamadığı zor görseller için \"Yapay zekâ ile oku\". Resim bu sağlayıcıya gönderilir.",
};

const ROLE_PLACEHOLDER: Record<ModelRole, string> = {
  fast: "ör. nvidia/nemotron-3-super-120b-a12b",
  strong: "ör. nvidia/nemotron-3-ultra-550b-a55b",
  vision: "ör. meta/llama-3.2-90b-vision-instruct",
};

function errorText(e: unknown): string {
  if (e instanceof AiError) return e.detail ? `${e.message}\nSağlayıcının mesajı: ${e.detail}` : e.message;
  return String(e);
}

/** Her rol için sağlayıcı + model seçimi. Değişiklikler kısa bir gecikmeyle kendiliğinden kaydedilir. */
function RolesSection({ settings, onChange, modelLists, onModelList }: Props) {
  const [roles, setRoles] = useState(settings.roles);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const saveTimer = useRef<number | undefined>(undefined);
  const latest = useRef(settings);
  latest.current = settings;

  useEffect(() => setRoles(settings.roles), [settings.roles]);

  function update(role: ModelRole, patch: Partial<ProviderSettings["roles"][ModelRole]>) {
    const next = { ...roles, [role]: { ...roles[role], ...patch } };
    setRoles(next);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => onChange({ ...latest.current, roles: next }), 400);
  }

  async function ensureModels(profileId: string) {
    if (modelLists[profileId]) return;
    const profile = settings.profiles.find((p) => p.id === profileId);
    if (!profile?.baseUrl.trim()) return;
    try {
      onModelList(profileId, await listModels(profile));
      setFetchError(null);
    } catch (e) {
      setFetchError(`${profile.name}: model listesi alınamadı. ${errorText(e)}`);
    }
  }

  return (
    <section className="profile-form">
      <h2>Modeller</h2>
      <p className="muted">
        Her rol farklı bir sağlayıcıdan (farklı API anahtarıyla) çalışabilir. Yedek seçilirse, istek sınırı aşıldığında (429)
        beklemeden yedeğe geçilir.
      </p>
      {(Object.keys(ROLE_LABELS) as ModelRole[]).map((role) => {
        const profile = settings.profiles.find((p) => p.id === roles[role].profileId);
        const missingKey = profile && !profile.apiKey.trim();
        return (
          <div key={role} className="role-row">
            <div className="role-label">{ROLE_LABELS[role]}</div>
            <div className="role-fields">
              <select
                value={roles[role].profileId}
                onChange={(e) => update(role, { profileId: e.target.value })}
                aria-label={`${ROLE_LABELS[role]} sağlayıcısı`}
              >
                {settings.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <ModelInput
                value={roles[role].model}
                options={modelLists[roles[role].profileId] ?? []}
                placeholder={ROLE_PLACEHOLDER[role]}
                ariaLabel={ROLE_LABELS[role]}
                onOpen={() => ensureModels(roles[role].profileId)}
                onChange={(model) => update(role, { model })}
              />
            </div>
            <div className="role-fields role-fallback">
              <select
                value={roles[role].fallback?.profileId ?? ""}
                onChange={(e) =>
                  update(role, { fallback: e.target.value ? { profileId: e.target.value, model: roles[role].fallback?.model ?? "" } : null })
                }
                aria-label={`${ROLE_LABELS[role]} yedek sağlayıcısı`}
              >
                <option value="">Yedek yok</option>
                {settings.profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    Yedek: {p.name}
                  </option>
                ))}
              </select>
              {roles[role].fallback && (
                <ModelInput
                  value={roles[role].fallback.model}
                  options={modelLists[roles[role].fallback.profileId] ?? []}
                  placeholder="Yedek model"
                  ariaLabel={`${ROLE_LABELS[role]} yedek modeli`}
                  onOpen={() => ensureModels(roles[role].fallback!.profileId)}
                  onChange={(model) => update(role, { fallback: { profileId: roles[role].fallback!.profileId, model } })}
                />
              )}
            </div>
            <small className="muted">
              {ROLE_HELP[role]}
              {missingKey && <span className="error-text"> Bu sağlayıcının API anahtarı yok.</span>}
            </small>
          </div>
        );
      })}
      {fetchError && <p className="msg error">{fetchError}</p>}
    </section>
  );
}

export function SettingsPage(props: Props) {
  const { settings, onChange, modelLists, onModelList } = props;
  const [selectedId, setSelectedId] = useState(settings.roles.fast.profileId);
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
  /** Bu sağlayıcıya atanmış roller (bağlantı testi bunlardan birinin modelini kullanır). */
  const usedBy = (Object.keys(ROLE_LABELS) as ModelRole[]).filter((r) => settings.roles[r].profileId === draft.id);

  function field<K extends keyof ProviderProfile>(key: K, value: ProviderProfile[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  async function save() {
    const cleaned = { ...draft, name: draft.name.trim() || "Adsız sağlayıcı", baseUrl: draft.baseUrl.trim(), apiKey: draft.apiKey.trim() };
    await onChange({ ...settings, profiles: settings.profiles.map((p) => (p.id === cleaned.id ? cleaned : p)) });
    setDraft(cleaned);
    setStatus({ kind: "ok", text: "Kaydedildi." });
  }

  async function addProfile() {
    const profile = newProfile();
    await onChange({ ...settings, profiles: [...settings.profiles, profile] });
    setSelectedId(profile.id);
  }

  async function remove() {
    if (settings.profiles.length <= 1) return;
    const ok = await askConfirm({
      title: `"${saved.name}" sağlayıcısı silinsin mi?`,
      message: "Kayıtlı API anahtarı da silinir. Ona bağlı roller ilk sağlayıcıya döner. Öğrenme verilerin etkilenmez.",
    });
    if (!ok) return;
    const next = removeProfile(settings, saved.id);
    await onChange(next);
    setSelectedId(next.profiles[0].id);
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
      setStatus({ kind: "ok", text: `${list.length} model listelendi. "Modeller" bölümünde öneri olarak çıkacaklar.` });
    });

  const checkConnection = () =>
    run(async () => {
      const model = usedBy.map((r) => settings.roles[r].model.trim()).find(Boolean) ?? "";
      const report = await testConnection(draft, model);
      setStatus({ kind: report.ok ? "ok" : "info", text: report.message });
    });

  return (
    <div className="settings">
      <aside className="profile-list">
        <h2>Sağlayıcılar</h2>
        {settings.profiles.map((p) => (
          <button
            key={p.id}
            className={p.id === draft.id ? "profile-item selected" : "profile-item"}
            onClick={() => setSelectedId(p.id)}
          >
            <span>{p.name}</span>
            {!p.apiKey.trim() && <span className="badge bad">anahtar yok</span>}
          </button>
        ))}
        <button className="secondary" onClick={addProfile}>
          + Yeni sağlayıcı
        </button>
      </aside>

      <div className="settings-main">
        <RolesSection {...props} />

        <section className="profile-form">
          <h2>{saved.name}</h2>
          {usedBy.length > 0 && (
            <p className="muted">Kullanan roller: {usedBy.map((r) => ROLE_LABELS[r].toLocaleLowerCase("tr")).join(", ")}</p>
          )}

          <label>
            Sağlayıcı adı
            <input value={draft.name} onChange={(e) => field("name", e.target.value)} />
          </label>

          <label>
            Temel adres (base URL)
            <input
              value={draft.baseUrl}
              placeholder="https://integrate.api.nvidia.com/v1"
              onChange={(e) => field("baseUrl", e.target.value)}
            />
            <small>OpenAI uyumlu bir uç nokta. OpenRouter: https://openrouter.ai/api/v1 · Ollama: http://localhost:11434/v1</small>
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

          <div className="actions">
            <button onClick={save} disabled={!dirty || busy}>
              Kaydet
            </button>
            <button className="secondary" onClick={checkConnection} disabled={busy}>
              Bağlantıyı test et
            </button>
            <button className="secondary" onClick={fetchModels} disabled={busy}>
              Modelleri getir{models.length ? ` (${models.length})` : ""}
            </button>
            <button className="danger" onClick={remove} disabled={busy || settings.profiles.length <= 1}>
              Sil
            </button>
          </div>
          {dirty && <p className="msg info">Kaydedilmemiş değişiklikler var. Testler formdaki değerlerle yapılır.</p>}
          {status && <p className={`msg ${status.kind}`}>{status.text}</p>}
        </section>

        <PrefsSection />

        <BackupSection />
      </div>
    </div>
  );
}
