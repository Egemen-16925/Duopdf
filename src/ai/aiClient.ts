import { fetch } from "@tauri-apps/plugin-http";
import { z } from "zod";
import type { AiTarget, ProviderProfile } from "../settings/providers";
import { AiError, errorForStatus } from "./errors";
import { extractJson, stripThinking } from "./json";
import type { ChatMessage, PromptTemplate } from "./prompts/types";

// Tarayıcı fetch'i NVIDIA'da CORS'a takılır; tüm istekler HTTP eklentisiyle Rust tarafından çıkar.

const DEFAULT_TIMEOUT_MS = 90_000;

export interface ChatOptions {
  model: string;
  messages: ChatMessage[];
  jsonMode?: boolean;
  maxTokens?: number;
  temperature?: number;
  /** 429 gelince kaç kez bekleyip yeniden denensin. */
  retries?: number;
  timeoutMs?: number;
}

export interface ChatResult {
  status: number;
  ms: number;
  text: string;
  /** Model "düşünme" çıktısı üretti mi (<think> veya reasoning_content). */
  hadThinking: boolean;
}

function endpoint(profile: ProviderProfile, path: string): string {
  if (!profile.baseUrl.trim()) throw new AiError("config", "Temel adres (base URL) girilmemiş.");
  return profile.baseUrl.trim().replace(/\/+$/, "") + path;
}

function headers(profile: ProviderProfile): Record<string, string> {
  const h: Record<string, string> = { "Content-Type": "application/json", Accept: "application/json" };
  if (profile.apiKey.trim()) h.Authorization = `Bearer ${profile.apiKey.trim()}`;
  return h;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function send(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<{ status: number; body: string; retryAfter: string | null }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal, connectTimeout: 15_000 });
    return { status: res.status, body: await res.text(), retryAfter: res.headers.get("retry-after") };
  } catch (e) {
    if (controller.signal.aborted) {
      throw new AiError("timeout", `Yanıt ${Math.round(timeoutMs / 1000)} saniyede gelmedi (zaman aşımı).`);
    }
    throw new AiError(
      "network",
      "Sunucuya ulaşılamadı. İnternet bağlantısını ve temel adresi kontrol et.",
      undefined,
      String(e),
    );
  } finally {
    clearTimeout(timer);
  }
}

export async function chat(profile: ProviderProfile, opts: ChatOptions): Promise<ChatResult> {
  if (!opts.model.trim()) throw new AiError("config", "Model seçilmemiş.");
  const url = endpoint(profile, "/chat/completions");
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  let useResponseFormat = opts.jsonMode ?? false;
  let retriesLeft = opts.retries ?? 2;
  let attempt = 0;
  const started = performance.now();

  for (;;) {
    const body: Record<string, unknown> = {
      model: opts.model.trim(),
      messages: opts.messages,
      temperature: opts.temperature ?? 0.2,
      max_tokens: opts.maxTokens ?? 1024,
      stream: false,
    };
    if (useResponseFormat) body.response_format = { type: "json_object" };

    const res = await send(url, { method: "POST", headers: headers(profile), body: JSON.stringify(body) }, timeoutMs);

    if (res.status === 429 && retriesLeft > 0) {
      retriesLeft--;
      const waitSec = Number(res.retryAfter);
      await sleep(Number.isFinite(waitSec) && waitSec > 0 ? waitSec * 1000 : 2000 * 2 ** attempt++);
      continue;
    }
    // Bazı modeller response_format'ı desteklemez; o zaman şema zaten istemde, onsuz dene.
    if ((res.status === 400 || res.status === 422) && useResponseFormat) {
      useResponseFormat = false;
      continue;
    }
    if (res.status < 200 || res.status >= 300) throw errorForStatus(res.status, res.body);

    let data: any;
    try {
      data = JSON.parse(res.body);
    } catch {
      throw new AiError("badResponse", "Sağlayıcıdan anlaşılmayan bir yanıt geldi.", res.status, res.body.slice(0, 300));
    }
    const message = data?.choices?.[0]?.message;
    const content: unknown = message?.content;
    if (typeof content !== "string" || !content.trim()) {
      throw new AiError(
        "badResponse",
        "Model boş yanıt döndü (uzun düşünme çıktısı yanıt sınırını doldurmuş olabilir).",
        res.status,
      );
    }
    const stripped = stripThinking(content);
    return {
      status: res.status,
      ms: Math.round(performance.now() - started),
      text: stripped.text,
      hadThinking: stripped.hadThinking || Boolean(message?.reasoning_content || message?.reasoning),
    };
  }
}

export interface PromptRun<T> extends ChatResult {
  data?: T;
  /** JSON ayrıştırılamadıysa veya şemaya uymadıysa açıklama. */
  validationError?: string;
}

function validate<T>(schema: z.ZodType<T>, text: string): { data?: T; error?: string } {
  let json: unknown;
  try {
    json = extractJson(text);
  } catch (e) {
    return { error: `JSON ayrıştırılamadı: ${(e as Error).message}` };
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? { data: parsed.data } : { error: z.prettifyError(parsed.error) };
}

/**
 * Şablonu çalıştırır ve yanıtı şemayla doğrular. Doğrulama hatasını fırlatmaz,
 * sonuçta raporlar. `repair` açıksa geçersiz yanıtta hatayı modele gösterip bir kez yeniden dener.
 */
export async function runPrompt<I, O>(
  target: AiTarget,
  template: PromptTemplate<I, O>,
  input: I,
  opts: { repair?: boolean } & AttemptOptions = {},
): Promise<PromptRun<O>> {
  const { profile, model } = target;
  const messages = template.build(input);
  const common = {
    model,
    jsonMode: true,
    retries: opts.retries,
    timeoutMs: opts.timeoutMs,
    temperature: template.temperature,
    maxTokens: template.maxTokens,
  };
  const first = await chat(profile, { ...common, messages });
  const checked = validate(template.schema, first.text);
  if (checked.data !== undefined || !opts.repair) {
    return { ...first, data: checked.data, validationError: checked.error };
  }

  const second = await chat(profile, {
    ...common,
    messages: [
      ...messages,
      { role: "assistant", content: first.text },
      {
        role: "user",
        content: `Yanıtın geçerli değildi:\n${checked.error}\nYalnızca istenen biçimde geçerli bir JSON nesnesi döndür.`,
      },
    ],
  });
  const rechecked = validate(template.schema, second.text);
  return {
    ...second,
    ms: first.ms + second.ms,
    hadThinking: first.hadThinking || second.hadThinking,
    data: rechecked.data,
    validationError: rechecked.error,
  };
}

export interface AttemptOptions {
  /** 429'da kaç kez bekleyip yeniden denensin. */
  retries?: number;
  timeoutMs?: number;
}

/** Yedek varken asıl modeli bundan uzun bekleme; yedeğe geç. */
const PRIMARY_TIMEOUT_WITH_FALLBACK_MS = 45_000;

/**
 * İsteği hedefe gönderir; hata olursa (istek sınırı, zaman aşımı, sunucu hatası, geçersiz yanıt…)
 * ve hedefin yedeği varsa yedekle bir kez daha dener. Yedek varken asıl model 429'da beklenmez.
 */
export async function withFallback<T>(target: AiTarget, run: (target: AiTarget, opts: AttemptOptions) => Promise<T>): Promise<T> {
  if (!target.fallback) return run(target, {});
  try {
    return await run(target, { retries: 0, timeoutMs: PRIMARY_TIMEOUT_WITH_FALLBACK_MS });
  } catch (e) {
    // Ayar eksikliği (model seçilmemiş vb.) yedekle düzelmez; gerisinde yedeği dene.
    if (e instanceof AiError && e.kind !== "config") return run(target.fallback, {});
    throw e;
  }
}

/** Şablonu çalıştırır; geçerli veri gelmezse anlaşılır bir AiError fırlatır (yedek model de denenir). */
export async function generate<I, O>(target: AiTarget, template: PromptTemplate<I, O>, input: I): Promise<O> {
  return withFallback(target, async (t, opts) => {
    const run = await runPrompt(t, template, input, { repair: true, ...opts });
    if (run.data === undefined) {
      throw new AiError("badResponse", "Model geçerli bir yanıt üretemedi. Tekrar dene veya başka model seç.", run.status, run.validationError);
    }
    return run.data;
  });
}

export async function listModels(profile: ProviderProfile): Promise<string[]> {
  const res = await send(endpoint(profile, "/models"), { method: "GET", headers: headers(profile) }, 30_000);
  if (res.status < 200 || res.status >= 300) throw errorForStatus(res.status, res.body);
  try {
    const data = JSON.parse(res.body);
    const ids: string[] = (data?.data ?? data?.models ?? []).map((m: any) => m?.id ?? m?.name).filter(Boolean);
    return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
  } catch {
    throw new AiError("badResponse", "Model listesi okunamadı.", res.status, res.body.slice(0, 300));
  }
}

export interface ConnectionReport {
  ok: boolean;
  message: string;
}

/**
 * Önce model listesini çeker (adres doğru mu), sonra verilen modele küçük bir istek atar
 * (anahtar ve model doğru mu). NVIDIA'da model listesi anahtarsız da döner, bu yüzden ikinci adım şart.
 * `model`: bu sağlayıcıya atanmış rollerden biri; yoksa yalnızca adres denetlenir.
 */
export async function testConnection(profile: ProviderProfile, model = ""): Promise<ConnectionReport> {
  if (!profile.apiKey.trim()) throw new AiError("config", "API anahtarı girilmemiş.");
  const models = await listModels(profile);
  if (!model.trim()) {
    return {
      ok: false,
      message: `Sunucuya ulaşıldı (${models.length} model listelendi), ama anahtarı doğrulamak için "Modeller" bölümünde bu sağlayıcıya bir model ata.`,
    };
  }
  const res = await chat(profile, {
    model,
    messages: [{ role: "user", content: "Reply with: OK" }],
    maxTokens: 16,
    retries: 0,
    timeoutMs: 60_000,
  }).catch((e) => {
    // Kısa yanıt sınırı düşünen modellerde boş yanıta yol açabilir; HTTP 200 geldiyse bağlantı sağlamdır.
    if (e instanceof AiError && e.kind === "badResponse" && e.status === 200) return null;
    // Hatalı anahtar anında reddedilir; zaman aşımı, isteğin kabul edilip modelde beklediğini gösterir.
    if (e instanceof AiError && e.kind === "timeout") return "timeout" as const;
    throw e;
  });
  if (res === "timeout") {
    return {
      ok: false,
      message:
        `Anahtar kabul edildi gibi görünüyor (yetki hatası gelmedi), ama "${model}" 60 saniyede yanıt vermedi. ` +
        "Model şu an yoğun olabilir; başka bir model seçip tekrar dene.",
    };
  }
  const ms = res ? ` ${res.ms} ms.` : "";
  return { ok: true, message: `Bağlantı başarılı: anahtar geçerli, "${model}" yanıt verdi.${ms}` };
}
