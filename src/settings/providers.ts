import { load, type Store } from "@tauri-apps/plugin-store";

/**
 * Sağlayıcı profilleri öğrenme verisinden ayrı bir dosyada durur (providers.json).
 * Anahtar, sağlayıcı veya model değişince öğrenme verisine dokunulmaz.
 */
export interface ProviderProfile {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  fastModel: string;
  strongModel: string;
}

export interface ProviderSettings {
  profiles: ProviderProfile[];
  activeProfileId: string;
}

export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

export function newProfile(partial: Partial<ProviderProfile> = {}): ProviderProfile {
  return {
    id: crypto.randomUUID(),
    name: "Yeni profil",
    baseUrl: "",
    apiKey: "",
    fastModel: "",
    strongModel: "",
    ...partial,
  };
}

export function defaultSettings(): ProviderSettings {
  const nvidia = newProfile({ name: "NVIDIA", baseUrl: NVIDIA_BASE_URL });
  return { profiles: [nvidia], activeProfileId: nvidia.id };
}

const STORE_FILE = "providers.json";
let storePromise: Promise<Store> | null = null;

function getStore(): Promise<Store> {
  storePromise ??= load(STORE_FILE, { defaults: {}, autoSave: false });
  return storePromise;
}

export async function loadProviderSettings(): Promise<ProviderSettings> {
  const store = await getStore();
  const profiles = await store.get<ProviderProfile[]>("profiles");
  const activeProfileId = await store.get<string>("activeProfileId");
  if (!profiles || profiles.length === 0) {
    const settings = defaultSettings();
    await saveProviderSettings(settings);
    return settings;
  }
  const activeExists = profiles.some((p) => p.id === activeProfileId);
  return { profiles, activeProfileId: activeExists ? activeProfileId! : profiles[0].id };
}

export async function saveProviderSettings(settings: ProviderSettings): Promise<void> {
  const store = await getStore();
  await store.set("profiles", settings.profiles);
  await store.set("activeProfileId", settings.activeProfileId);
  await store.save();
}

export function activeProfile(settings: ProviderSettings): ProviderProfile {
  return settings.profiles.find((p) => p.id === settings.activeProfileId) ?? settings.profiles[0];
}
