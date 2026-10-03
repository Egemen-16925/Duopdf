import { invoke } from "@tauri-apps/api/core";
import { load, type Store } from "@tauri-apps/plugin-store";
import { useSyncExternalStore } from "react";
import { db } from "../db/db";
import { refreshTerms } from "../learning/store";
import {
  cancelSignIn,
  deleteSyncFile,
  downloadSyncFile,
  findSyncFile,
  DrivePermissionMissing,
  refreshAccess,
  revoke,
  signIn,
  SignInRequired,
  uploadSyncFile,
  type GoogleClient,
} from "./google";
import { applySnapshot, emptySnapshot, mergeSnapshots, parseSnapshot, readSnapshot, sameSnapshot } from "./snapshot";

/**
 * Google Drive eşitlemesi: ayarlar (istemci kimliği, şifreli oturum anahtarı) ayrı bir dosyada
 * (`sync.json`) durur, öğrenme verisine ve yedeğe girmez. Gizli anahtar ve oturum anahtarı
 * API anahtarları gibi Windows DPAPI ile şifrelenir.
 */
interface StoredSync {
  clientId?: string;
  clientSecretEnc?: string;
  refreshTokenEnc?: string;
  email?: string;
  autoSync?: boolean;
  lastSyncAt?: number;
}

export interface SyncState {
  /** İstemci kimliği ve gizli anahtarı girilmiş mi. */
  configured: boolean;
  clientId: string;
  connected: boolean;
  email?: string;
  autoSync: boolean;
  busy: "idle" | "signing-in" | "syncing";
  lastSyncAt?: number;
  lastError?: string;
  /** Son eşitlemede buluttan gelen değişiklik oldu mu (bilgi amaçlı). */
  lastChanged?: boolean;
}

/** Otomatik eşitleme aralığı. */
const INTERVAL_MS = 5 * 60 * 1000;

let state: SyncState = { configured: false, clientId: "", connected: false, autoSync: true, busy: "idle" };
const listeners = new Set<() => void>();
function set(patch: Partial<SyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function getSyncState(): SyncState {
  return state;
}

export function useSyncState(): SyncState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getSyncState,
  );
}

let storePromise: Promise<Store> | null = null;
const store = () => (storePromise ??= load("sync.json", { defaults: {}, autoSave: false }));

async function stored(): Promise<StoredSync> {
  return ((await (await store()).get<StoredSync>("sync")) ?? {}) as StoredSync;
}

async function save(patch: Partial<StoredSync>) {
  const s = await store();
  await s.set("sync", { ...(await stored()), ...patch });
  await s.save();
}

const encrypt = (plain: string) => invoke<string>("protect_secret", { plain });
const decrypt = (data: string) => invoke<string>("unprotect_secret", { data });

let client: GoogleClient | null = null;
let refreshToken: string | null = null;
let access: { token: string; expiresAt: number } | null = null;

/** Açılışta kayıtlı ayarları yükler. */
export async function initSync(): Promise<void> {
  const s = await stored();
  try {
    const secret = s.clientSecretEnc ? await decrypt(s.clientSecretEnc) : "";
    client = s.clientId && secret ? { clientId: s.clientId, clientSecret: secret } : null;
    refreshToken = s.refreshTokenEnc ? await decrypt(s.refreshTokenEnc) : null;
  } catch {
    // Başka bir bilgisayardan kopyalanmış ayar: yeniden girilmeli.
    client = null;
    refreshToken = null;
  }
  set({
    configured: !!client,
    clientId: s.clientId ?? "",
    connected: !!client && !!refreshToken,
    email: s.email,
    autoSync: s.autoSync ?? true,
    lastSyncAt: s.lastSyncAt,
  });
}

/** Google Cloud'da oluşturulan masaüstü istemcisinin kimliği ve gizli anahtarı. */
export async function setClient(clientId: string, clientSecret: string): Promise<void> {
  const id = clientId.trim();
  const secret = clientSecret.trim();
  if (!id.endsWith(".apps.googleusercontent.com")) throw new Error('İstemci kimliği ".apps.googleusercontent.com" ile bitmeli.');
  if (!secret) throw new Error("Gizli anahtar boş olamaz.");
  await save({ clientId: id, clientSecretEnc: await encrypt(secret) });
  client = { clientId: id, clientSecret: secret };
  set({ configured: true, clientId: id });
}

export async function connect(): Promise<void> {
  if (!client) throw new Error("Önce istemci kimliğini ve gizli anahtarı kaydet.");
  set({ busy: "signing-in", lastError: undefined });
  try {
    const tokens = await signIn(client);
    refreshToken = tokens.refreshToken!;
    access = { token: tokens.accessToken, expiresAt: tokens.expiresAt };
    await save({ refreshTokenEnc: await encrypt(refreshToken), email: tokens.email });
    set({ connected: true, email: tokens.email, busy: "idle" });
  } catch (e) {
    set({ busy: "idle", lastError: e instanceof Error ? e.message : String(e) });
    throw e;
  }
  await syncNow();
}

/** Tarayıcıda bekleyen Google girişinden vazgeçer. */
export function cancelConnect(): Promise<void> {
  return cancelSignIn();
}

export async function disconnect(): Promise<void> {
  if (refreshToken) await revoke(refreshToken);
  refreshToken = null;
  access = null;
  await save({ refreshTokenEnc: undefined, email: undefined });
  set({ connected: false, email: undefined, lastError: undefined });
}

export async function setAutoSync(on: boolean): Promise<void> {
  await save({ autoSync: on });
  set({ autoSync: on });
}

async function accessToken(): Promise<string> {
  if (!client || !refreshToken) throw new SignInRequired("Google'a bağlı değilsin.");
  if (access && access.expiresAt - 60_000 > Date.now()) return access.token;
  try {
    const t = await refreshAccess(client, refreshToken);
    access = { token: t.accessToken, expiresAt: t.expiresAt };
    return access.token;
  } catch (e) {
    if (e instanceof SignInRequired) {
      refreshToken = null;
      await save({ refreshTokenEnc: undefined });
      set({ connected: false });
    }
    throw e;
  }
}

let running: Promise<void> | null = null;

/**
 * Eşitler: buluttaki dosyayı indirir, yerel veriyle kayıt kayıt birleştirir, sonucu yerel
 * veritabanına işler ve değiştiyse geri yükler. Aynı anda tek eşitleme çalışır.
 */
export function syncNow(): Promise<void> {
  if (running) return running;
  running = (async () => {
    set({ busy: "syncing", lastError: undefined });
    try {
      const token = await accessToken();
      const file = await findSyncFile(token);
      const remote = file ? parseSnapshot(await downloadSyncFile(token, file.id)) : emptySnapshot();
      const local = await readSnapshot(db);
      const merged = mergeSnapshots(local, remote);
      const changedLocally = !sameSnapshot(merged, local);
      if (changedLocally) {
        await applySnapshot(db, merged);
        await refreshTerms();
      }
      if (!file || !sameSnapshot(merged, remote)) await uploadSyncFile(token, file?.id ?? null, JSON.stringify(merged));
      const now = Date.now();
      await save({ lastSyncAt: now });
      set({ busy: "idle", lastSyncAt: now, lastChanged: changedLocally });
    } catch (e) {
      // Drive izni olmadan kurulmuş eski bağlantı: kesilir, kullanıcı izinle yeniden bağlanır.
      if (e instanceof DrivePermissionMissing) await disconnect();
      set({ busy: "idle", lastError: e instanceof Error ? e.message : String(e) });
      throw e;
    } finally {
      running = null;
    }
  })();
  return running;
}

/** Buluttaki eşitleme dosyasını siler (yerel veri kalır). */
export async function deleteCloudData(): Promise<void> {
  const token = await accessToken();
  const file = await findSyncFile(token);
  if (file) await deleteSyncFile(token, file.id);
}

let timer: number | undefined;

/** Açılışta ve birkaç dakikada bir otomatik eşitleme (bağlıysa ve açıksa). */
export function startAutoSync(): () => void {
  const tick = () => {
    if (state.connected && state.autoSync && state.busy === "idle") syncNow().catch(() => undefined);
  };
  tick();
  timer = window.setInterval(tick, INTERVAL_MS);
  return () => window.clearInterval(timer);
}

/** Kapanırken son bir eşitleme (en çok `timeoutMs` beklenir). */
export async function syncBeforeClose(timeoutMs = 8000): Promise<void> {
  if (!state.connected || !state.autoSync) return;
  await Promise.race([syncNow().catch(() => undefined), new Promise((r) => setTimeout(r, timeoutMs))]);
}
