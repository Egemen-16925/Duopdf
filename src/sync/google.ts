import { invoke } from "@tauri-apps/api/core";
import { fetch } from "@tauri-apps/plugin-http";
import { openUrl } from "@tauri-apps/plugin-opener";

/**
 * Google girişi (OAuth 2 + PKCE, masaüstü "loopback" yöntemi) ve Drive'ın gizli uygulama
 * klasörü (appDataFolder). Sunucu yok: istekler doğrudan bu bilgisayardan Google'a gider.
 * Yalnızca uygulamanın kendi klasörüne erişim istenir; kullanıcının diğer Drive dosyaları görülemez.
 */
export const SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive.appdata"];
export const SYNC_FILE = "duopdf-sync.json";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const FILES_URL = "https://www.googleapis.com/drive/v3/files";
const UPLOAD_URL = "https://www.googleapis.com/upload/drive/v3/files";
/** Tarayıcıda izin için en çok bu kadar beklenir. */
const SIGN_IN_TIMEOUT_SECS = 300;

export interface GoogleClient {
  clientId: string;
  clientSecret: string;
}

export interface Tokens {
  accessToken: string;
  /** Erişim anahtarının bittiği an (ms). */
  expiresAt: number;
  refreshToken?: string;
  email?: string;
}

/** Google'ın reddettiği oturum (iptal edilmiş ya da süresi dolmuş): yeniden bağlanmak gerekir. */
export class SignInRequired extends Error {
  constructor(message = "Google bağlantısının süresi dolmuş ya da iptal edilmiş. Yeniden bağlan.") {
    super(message);
    this.name = "SignInRequired";
  }
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function pkcePair(): Promise<{ verifier: string; challenge: string }> {
  const verifier = randomString(48);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
}

/** id_token içindeki e-posta (imza doğrulaması gerekmez: token doğrudan Google'dan geldi). */
export function emailFromIdToken(idToken: string | undefined): string | undefined {
  if (!idToken) return undefined;
  try {
    const payload = idToken.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      [...atob(payload)].map((c) => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join(""),
    );
    return JSON.parse(json).email;
  } catch {
    return undefined;
  }
}

async function tokenRequest(params: Record<string, string>): Promise<Tokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    if (data.error === "invalid_grant") throw new SignInRequired();
    if (data.error === "invalid_client") throw new Error("Google istemci kimliği ya da gizli anahtarı hatalı.");
    throw new Error(`Google girişi başarısız (${res.status}): ${String(data.error_description ?? data.error ?? "")}`);
  }
  return {
    accessToken: String(data.access_token),
    expiresAt: Date.now() + (Number(data.expires_in) || 3600) * 1000,
    ...(data.refresh_token ? { refreshToken: String(data.refresh_token) } : {}),
    ...(emailFromIdToken(data.id_token as string | undefined) ? { email: emailFromIdToken(data.id_token as string) } : {}),
  };
}

/** Tarayıcıda Google girişini açar, izni bekler ve oturum anahtarlarını döndürür. */
export async function signIn(client: GoogleClient): Promise<Tokens> {
  const port = await invoke<number>("oauth_listen");
  const redirectUri = `http://127.0.0.1:${port}`;
  const { verifier, challenge } = await pkcePair();
  const state = randomString(16);
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: client.clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
    access_type: "offline",
    prompt: "consent",
  }).toString();
  try {
    await openUrl(url.toString());
  } catch (e) {
    await invoke("oauth_cancel", { port });
    throw new Error(`Tarayıcı açılamadı: ${e}`);
  }
  let query: string;
  try {
    query = await invoke<string>("oauth_wait", { port, timeoutSecs: SIGN_IN_TIMEOUT_SECS });
  } catch (e) {
    throw new Error(String(e) === "TIMEOUT" ? "Tarayıcıda izin verilmedi (süre doldu). Tekrar dene." : String(e));
  }
  const params = new URLSearchParams(query);
  if (params.get("state") !== state) throw new Error("Google'dan beklenmeyen bir yanıt geldi (state uyuşmuyor).");
  if (params.get("error")) {
    throw new Error(params.get("error") === "access_denied" ? "Google'da izin verilmedi." : `Google hatası: ${params.get("error")}`);
  }
  const code = params.get("code");
  if (!code) throw new Error("Google'dan izin kodu gelmedi.");
  const tokens = await tokenRequest({
    code,
    client_id: client.clientId,
    client_secret: client.clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: verifier,
  });
  if (!tokens.refreshToken) throw new Error("Google kalıcı oturum anahtarı vermedi; bağlantıyı kesip yeniden bağlan.");
  return tokens;
}

export function refreshAccess(client: GoogleClient, refreshToken: string): Promise<Tokens> {
  return tokenRequest({
    client_id: client.clientId,
    client_secret: client.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
}

/** Google'daki izni geri alır (bağlantıyı kesince). Hata olsa da yerel bağlantı kesilir. */
export async function revoke(token: string): Promise<void> {
  await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: "POST" }).catch(() => undefined);
}

async function driveRequest(token: string, url: string, init: RequestInit = {}): Promise<Response> {
  const res = await fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new SignInRequired();
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Drive hatası (${res.status}): ${text.slice(0, 200)}`);
  }
  return res;
}

/** Uygulama klasöründeki eşitleme dosyası (yoksa null). */
export async function findSyncFile(token: string): Promise<{ id: string } | null> {
  const url = new URL(FILES_URL);
  url.search = new URLSearchParams({ spaces: "appDataFolder", q: `name='${SYNC_FILE}'`, fields: "files(id,modifiedTime)" }).toString();
  const data = (await (await driveRequest(token, url.toString())).json()) as { files?: { id: string }[] };
  return data.files?.[0] ?? null;
}

export async function downloadSyncFile(token: string, id: string): Promise<string> {
  return (await driveRequest(token, `${FILES_URL}/${id}?alt=media`)).text();
}

/** Dosyayı ilk kez oluşturur (uygulama klasörüne) ya da içeriğini değiştirir. */
export async function uploadSyncFile(token: string, id: string | null, json: string): Promise<string> {
  if (id) {
    await driveRequest(token, `${UPLOAD_URL}/${id}?uploadType=media`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: json,
    });
    return id;
  }
  const boundary = `duopdf-${randomString(12)}`;
  const body = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify({ name: SYNC_FILE, parents: ["appDataFolder"] }),
    `--${boundary}`,
    "Content-Type: application/json",
    "",
    json,
    `--${boundary}--`,
    "",
  ].join("\r\n");
  const res = await driveRequest(token, `${UPLOAD_URL}?uploadType=multipart&fields=id`, {
    method: "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  return ((await res.json()) as { id: string }).id;
}

export async function deleteSyncFile(token: string, id: string): Promise<void> {
  await driveRequest(token, `${FILES_URL}/${id}`, { method: "DELETE" });
}
