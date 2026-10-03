export type AiErrorKind =
  | "config"
  | "auth"
  | "notFound"
  | "rateLimit"
  | "badRequest"
  | "server"
  | "network"
  | "timeout"
  | "badResponse";

/** Kullanıcıya gösterilebilir, Türkçe mesajlı AI hatası. */
export class AiError extends Error {
  constructor(
    public kind: AiErrorKind,
    message: string,
    public status?: number,
    public detail?: string,
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** Sağlayıcının hata gövdesinden kısa bir açıklama çıkarır (OpenAI ve NVIDIA biçimleri). */
export function providerMessage(body: string): string {
  try {
    const data = JSON.parse(body);
    const msg = data?.error?.message ?? data?.detail ?? data?.message ?? data?.title;
    if (typeof msg === "string") return msg;
  } catch {
    // JSON değilse ham metni kullan
  }
  return body.trim().slice(0, 300);
}

export function errorForStatus(status: number, body: string): AiError {
  const detail = providerMessage(body);
  switch (status) {
    case 401:
      return new AiError("auth", "API anahtarı hatalı veya geçersiz (401).", status, detail);
    case 403:
      // NVIDIA hatalı anahtarda 401 değil 403 döner.
      return new AiError(
        "auth",
        "API anahtarı hatalı ya da bu anahtarın bu modele erişim izni yok (403).",
        status,
        detail,
      );
    case 404:
      return new AiError(
        "notFound",
        "Model veya adres bulunamadı (404). Model kimliğini ve temel adresi kontrol et.",
        status,
        detail,
      );
    case 429:
      return new AiError(
        "rateLimit",
        "İstek sınırı aşıldı (429). Biraz bekleyip tekrar dene.",
        status,
        detail,
      );
    default:
      if (status >= 500) {
        return new AiError(
          "server",
          `Sağlayıcı tarafında hata oluştu (${status}). Daha sonra tekrar dene.`,
          status,
          detail,
        );
      }
      return new AiError("badRequest", `İstek reddedildi (${status}).`, status, detail);
  }
}

/** Kullanıcıya gösterilecek hata metni; sağlayıcının kendi mesajı varsa onu da ekler (sorunun nedenini o söyler). */
export function describeAiError(e: unknown): string {
  if (!(e instanceof AiError)) return e instanceof Error ? e.message : String(e);
  return e.detail ? `${e.message}\nSağlayıcının mesajı: ${e.detail.slice(0, 300)}` : e.message;
}
