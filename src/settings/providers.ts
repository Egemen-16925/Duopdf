import { load, type Store } from "@tauri-apps/plugin-store";

/**
 * Sağlayıcı ayarları öğrenme verisinden ayrı bir dosyada durur (providers.json).
 * Anahtar, sağlayıcı veya model değişince öğrenme verisine dokunulmaz.
 *
 * Sağlayıcı = adres + anahtar. Her model rolü (hızlı, güçlü, görsel) kendi sağlayıcısını
 * ve modelini ayrı seçer; böylece roller farklı API'lerden çalışabilir.
 */
export interface ProviderProfile {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
}

export type ModelRole = "fast" | "strong" | "vision";

export const ROLE_LABELS: Record<ModelRole, string> = {
  fast: "Hızlı model",
  strong: "Güçlü model",
  vision: "Görsel model",
};

export interface ModelChoice {
  profileId: string;
  model: string;
}

export interface RoleAssignment extends ModelChoice {
  /** İstek sınırı (429) aşılınca geçilecek yedek sağlayıcı + model (isteğe bağlı). */
  fallback?: ModelChoice | null;
}

export interface ProviderSettings {
  profiles: ProviderProfile[];
  roles: Record<ModelRole, RoleAssignment>;
}

/** Bir isteğin gideceği yer: sağlayıcı + model. */
export interface AiTarget {
  profile: ProviderProfile;
  model: string;
  /** İstek sınırı aşılınca kullanılacak yedek. */
  fallback?: AiTarget;
}

/** Her rol için kullanılabilir hedef (sağlayıcı yoksa, anahtar ya da model boşsa null). */
export type AiTargets = Record<ModelRole, AiTarget | null>;

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

export function newProfile(partial: Partial<ProviderProfile> = {}): ProviderProfile {
  return { id: crypto.randomUUID(), name: "Yeni sağlayıcı", baseUrl: "", apiKey: "", ...partial };
}

function emptyRoles(profileId: string): Record<ModelRole, RoleAssignment> {
  return {
    fast: { profileId, model: "" },
    strong: { profileId, model: "" },
    vision: { profileId, model: "" },
  };
}

export function defaultSettings(): ProviderSettings {
  const nvidia = newProfile({ name: "NVIDIA", baseUrl: NVIDIA_BASE_URL });
  return { profiles: [nvidia], roles: emptyRoles(nvidia.id) };
}

/** Eski biçim: profilde fastModel/strongModel/visionModel ve tek bir "etkin profil" vardı. */
interface LegacyProfile extends ProviderProfile {
  fastModel?: string;
  strongModel?: string;
  visionModel?: string;
}

/** Kayıtlı veriyi (eski ya da yeni biçim) geçerli ayarlara çevirir. */
export function normalizeSettings(
  storedProfiles: LegacyProfile[] | undefined | null,
  storedRoles: Partial<Record<ModelRole, RoleAssignment>> | undefined | null,
  legacyActiveId?: string | null,
): ProviderSettings {
  if (!storedProfiles || storedProfiles.length === 0) return defaultSettings();
  const profiles = storedProfiles.map(({ id, name, baseUrl, apiKey }) => ({ id, name, baseUrl, apiKey }));
  const ids = new Set(profiles.map((p) => p.id));
  const fallbackId = legacyActiveId && ids.has(legacyActiveId) ? legacyActiveId : profiles[0].id;

  if (!storedRoles) {
    // Eski biçimden taşıma: etkin profilin modelleri üç role atanır.
    const active = storedProfiles.find((p) => p.id === fallbackId)!;
    return {
      profiles,
      roles: {
        fast: { profileId: fallbackId, model: active.fastModel ?? "" },
        strong: { profileId: fallbackId, model: active.strongModel ?? "" },
        vision: { profileId: fallbackId, model: active.visionModel ?? "" },
      },
    };
  }
  const roles = emptyRoles(fallbackId);
  for (const role of Object.keys(roles) as ModelRole[]) {
    const stored = storedRoles[role];
    if (!stored) continue;
    roles[role] = { profileId: ids.has(stored.profileId) ? stored.profileId : fallbackId, model: stored.model ?? "" };
    if (stored.fallback && ids.has(stored.fallback.profileId)) {
      roles[role].fallback = { profileId: stored.fallback.profileId, model: stored.fallback.model ?? "" };
    }
  }
  return { profiles, roles };
}

function resolve(settings: ProviderSettings, choice: ModelChoice | null | undefined): AiTarget | null {
  if (!choice) return null;
  const profile = settings.profiles.find((p) => p.id === choice.profileId);
  const model = choice.model.trim();
  if (!profile || !profile.apiKey.trim() || !profile.baseUrl.trim() || !model) return null;
  return { profile, model };
}

export function targetFor(settings: ProviderSettings, role: ModelRole): AiTarget | null {
  const assignment = settings.roles[role];
  const primary = resolve(settings, assignment);
  if (!primary) return null;
  const fallback = resolve(settings, assignment.fallback);
  // Yedek asıl hedefle aynıysa işe yaramaz.
  if (fallback && !(fallback.profile.id === primary.profile.id && fallback.model === primary.model)) primary.fallback = fallback;
  return primary;
}

export function allTargets(settings: ProviderSettings): AiTargets {
  return { fast: targetFor(settings, "fast"), strong: targetFor(settings, "strong"), vision: targetFor(settings, "vision") };
}

/** Sağlayıcı silinince ona bağlı roller ilk sağlayıcıya döner (model boşaltılır). */
export function removeProfile(settings: ProviderSettings, id: string): ProviderSettings {
  const profiles = settings.profiles.filter((p) => p.id !== id);
  if (profiles.length === 0) return settings;
  const roles = { ...settings.roles };
  for (const role of Object.keys(roles) as ModelRole[]) {
    if (roles[role].profileId === id) roles[role] = { ...roles[role], profileId: profiles[0].id, model: "" };
    if (roles[role].fallback?.profileId === id) roles[role] = { ...roles[role], fallback: null };
  }
  return { profiles, roles };
}

const STORE_FILE = "providers.json";
let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  storePromise ??= load(STORE_FILE, { defaults: {}, autoSave: false });
  return storePromise;
}

export async function loadProviderSettings(): Promise<ProviderSettings> {
  const store = await getStore();
  const settings = normalizeSettings(
    await store.get<LegacyProfile[]>("profiles"),
    await store.get<Record<ModelRole, RoleAssignment>>("roles"),
    await store.get<string>("activeProfileId"),
  );
  await saveProviderSettings(settings);
  return settings;
}

export async function saveProviderSettings(settings: ProviderSettings): Promise<void> {
  const store = await getStore();
  await store.set("profiles", settings.profiles);
  await store.set("roles", settings.roles);
  await store.delete("activeProfileId");
  await store.save();
}
