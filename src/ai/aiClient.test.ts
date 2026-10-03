import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: (...args: unknown[]) => fetchMock(...args) }));

import { chat, generate, listModels, runPrompt, testConnection } from "./aiClient";
import { AiError } from "./errors";
import { translateSentencePrompt } from "./prompts/translateSentence";
import { readImageWithAi } from "./readImage";
import type { ProviderProfile } from "../settings/providers";

const profile: ProviderProfile = {
  id: "p1",
  name: "Test",
  baseUrl: "https://example.test/v1/",
  apiKey: "test-key",
};

const fast = { profile, model: "fast/model" };

function response(status: number, body: unknown, headers: Record<string, string> = {}) {
  return {
    status,
    text: async () => (typeof body === "string" ? body : JSON.stringify(body)),
    headers: new Headers(headers),
  };
}

const completion = (content: string, extra: Record<string, unknown> = {}) =>
  response(200, { choices: [{ message: { content, ...extra } }] });

function sentBody(callIndex: number) {
  return JSON.parse(fetchMock.mock.calls[callIndex][1].body);
}

beforeEach(() => {
  fetchMock.mockReset();
});

describe("chat", () => {
  it("posts to the normalized endpoint with the bearer key", async () => {
    fetchMock.mockResolvedValueOnce(completion("Merhaba"));
    const res = await chat(profile, { model: "m", messages: [{ role: "user", content: "hi" }] });
    expect(res.text).toBe("Merhaba");
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://example.test/v1/chat/completions");
    expect(init.headers.Authorization).toBe("Bearer test-key");
  });

  it("maps 401 to a Turkish auth error", async () => {
    fetchMock.mockResolvedValueOnce(response(401, { error: { message: "Invalid key" } }));
    const err = await chat(profile, { model: "m", messages: [] }).catch((e) => e);
    expect(err).toBeInstanceOf(AiError);
    expect(err.kind).toBe("auth");
    expect(err.message).toContain("API anahtarı");
    expect(err.detail).toBe("Invalid key");
  });

  it("maps 403 to an auth error that also mentions a wrong key (NVIDIA answers 403 for bad keys)", async () => {
    fetchMock.mockResolvedValueOnce(response(403, { status: 403, title: "Forbidden", detail: "Authorization failed" }));
    const err = await chat(profile, { model: "m", messages: [] }).catch((e) => e);
    expect(err.kind).toBe("auth");
    expect(err.message).toContain("API anahtarı");
    expect(err.detail).toBe("Authorization failed");
  });

  it("maps 404 to notFound", async () => {
    fetchMock.mockResolvedValueOnce(response(404, { detail: "Function not found" }));
    await expect(chat(profile, { model: "m", messages: [] })).rejects.toMatchObject({ kind: "notFound", status: 404 });
  });

  it("waits and retries on 429 using Retry-After", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(response(429, "slow down", { "retry-after": "1" }));
    fetchMock.mockResolvedValueOnce(completion("tamam"));
    const promise = chat(profile, { model: "m", messages: [], retries: 1 });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(promise).resolves.toMatchObject({ text: "tamam" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("reports 429 when retries are disabled", async () => {
    fetchMock.mockResolvedValueOnce(response(429, "slow down"));
    await expect(chat(profile, { model: "m", messages: [], retries: 0 })).rejects.toMatchObject({ kind: "rateLimit" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops response_format when the provider rejects it", async () => {
    fetchMock.mockResolvedValueOnce(response(400, { error: { message: "response_format not supported" } }));
    fetchMock.mockResolvedValueOnce(completion('{"a":1}'));
    await chat(profile, { model: "m", messages: [], jsonMode: true });
    expect(sentBody(0).response_format).toEqual({ type: "json_object" });
    expect(sentBody(1).response_format).toBeUndefined();
  });

  it("flags thinking output and strips it", async () => {
    fetchMock.mockResolvedValueOnce(completion("<think>uzun düşünce</think>Cevap"));
    await expect(chat(profile, { model: "m", messages: [] })).resolves.toMatchObject({ text: "Cevap", hadThinking: true });
    fetchMock.mockResolvedValueOnce(completion("Cevap", { reasoning_content: "..." }));
    await expect(chat(profile, { model: "m", messages: [] })).resolves.toMatchObject({ hadThinking: true });
  });

  it("treats empty content as a bad response", async () => {
    fetchMock.mockResolvedValueOnce(completion(""));
    await expect(chat(profile, { model: "m", messages: [] })).rejects.toMatchObject({ kind: "badResponse" });
  });

  it("maps a thrown fetch to a network error", async () => {
    fetchMock.mockRejectedValueOnce("dns error");
    await expect(chat(profile, { model: "m", messages: [] })).rejects.toMatchObject({ kind: "network" });
  });

  it("refuses to send without a model", async () => {
    await expect(chat(profile, { model: " ", messages: [] })).rejects.toMatchObject({ kind: "config" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("runPrompt / generate", () => {
  const valid = '{"ceviri": "Çeviri", "dilbilgisiNotu": "Not"}';

  it("sends the request to the target's model and validates the result", async () => {
    fetchMock.mockResolvedValueOnce(completion(valid));
    const run = await runPrompt(fast, translateSentencePrompt, { sentence: "Hi." });
    expect(sentBody(0).model).toBe("fast/model");
    expect(run.data).toEqual({ ceviri: "Çeviri", dilbilgisiNotu: "Not" });
    expect(run.validationError).toBeUndefined();
  });

  it("reports invalid JSON without retrying when repair is off", async () => {
    fetchMock.mockResolvedValueOnce(completion('{"translation": "x"}'));
    const run = await runPrompt(fast, translateSentencePrompt, { sentence: "Hi." });
    expect(run.data).toBeUndefined();
    expect(run.validationError).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the error to the model once when repair is on", async () => {
    fetchMock.mockResolvedValueOnce(completion("not json"));
    fetchMock.mockResolvedValueOnce(completion(valid));
    const data = await generate(fast, translateSentencePrompt, { sentence: "Hi." });
    expect(data.ceviri).toBe("Çeviri");
    const repairMessages = sentBody(1).messages;
    expect(repairMessages.at(-2)).toEqual({ role: "assistant", content: "not json" });
    expect(repairMessages.at(-1).content).toContain("geçerli değildi");
  });

  it("gives up with a clear error after one failed repair", async () => {
    fetchMock.mockResolvedValue(completion("still not json"));
    await expect(generate(fast, translateSentencePrompt, { sentence: "Hi." })).rejects.toMatchObject({
      kind: "badResponse",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails early when the target has no model", async () => {
    await expect(runPrompt({ profile, model: " " }, translateSentencePrompt, { sentence: "Hi." })).rejects.toMatchObject({
      kind: "config",
    });
  });
});

describe("readImageWithAi", () => {
  it("sends the image as an OpenAI image_url part to the vision model", async () => {
    fetchMock.mockResolvedValueOnce(completion("Figure 1: Git workflow\nWorking directory"));
    const text = await readImageWithAi({ profile, model: "vision/model" }, "data:image/jpeg;base64,AAAA");
    expect(text).toBe("Figure 1: Git workflow\nWorking directory");
    const body = sentBody(0);
    expect(body.model).toBe("vision/model");
    expect(body.messages[1].content[1]).toEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,AAAA" } });
  });

  it("asks for a vision model when none is set", async () => {
    await expect(readImageWithAi(null, "data:x")).rejects.toMatchObject({ kind: "config" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("listModels / testConnection", () => {
  it("returns sorted unique model ids", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { data: [{ id: "b" }, { id: "a" }, { id: "b" }] }));
    await expect(listModels(profile)).resolves.toEqual(["a", "b"]);
  });

  it("requires an API key", async () => {
    await expect(testConnection({ ...profile, apiKey: "" })).rejects.toMatchObject({ kind: "config" });
  });

  it("asks for a model when none is selected", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { data: [{ id: "a" }] }));
    const report = await testConnection(profile);
    expect(report.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("validates the key with a small chat request", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { data: [{ id: "fast/model" }] }));
    fetchMock.mockResolvedValueOnce(completion("OK"));
    const report = await testConnection(profile, "fast/model");
    expect(report.ok).toBe(true);
    expect(sentBody(1).model).toBe("fast/model");
  });

  it("explains a model timeout as an accepted key with a busy model", async () => {
    vi.useFakeTimers();
    fetchMock.mockResolvedValueOnce(response(200, { data: [] }));
    fetchMock.mockImplementationOnce(
      (_url: string, init: { signal: AbortSignal }) =>
        new Promise((_resolve, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const promise = testConnection(profile, "fast/model");
    const assertion = expect(promise).resolves.toMatchObject({ ok: false });
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
    const report = await promise;
    expect(report.message).toContain("fast/model");
    expect(report.message).toContain("başka bir model");
    vi.useRealTimers();
  });

  it("surfaces a bad key from the chat request", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { data: [] }));
    fetchMock.mockResolvedValueOnce(response(401, "Unauthorized"));
    await expect(testConnection(profile, "fast/model")).rejects.toMatchObject({ kind: "auth" });
  });
});

describe("fallback model", () => {
  const backupProfile: ProviderProfile = { id: "p2", name: "Yedek", baseUrl: "https://backup.test/v1", apiKey: "k2" };
  const withBackup = { profile, model: "fast/model", fallback: { profile: backupProfile, model: "backup/model" } };

  it("switches to the fallback right away when the primary answers 429", async () => {
    fetchMock
      .mockResolvedValueOnce(response(429, { error: { message: "Too many" } }))
      .mockResolvedValueOnce(completion(JSON.stringify({ ceviri: "Yedekten", dilbilgisiNotu: "" })));
    const out = await generate(withBackup, translateSentencePrompt, { sentence: "Hi." });
    expect(out.ceviri).toBe("Yedekten");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe("https://backup.test/v1/chat/completions");
    expect(sentBody(1).model).toBe("backup/model");
  });

  it("also switches on other errors (server error, invalid answer)", async () => {
    fetchMock
      .mockResolvedValueOnce(response(500, "boom"))
      .mockResolvedValueOnce(completion(JSON.stringify({ ceviri: "Yedekten", dilbilgisiNotu: "" })));
    expect((await generate(withBackup, translateSentencePrompt, { sentence: "Hi." })).ceviri).toBe("Yedekten");

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(completion("not json"))
      .mockResolvedValueOnce(completion("still not json"))
      .mockResolvedValueOnce(completion(JSON.stringify({ ceviri: "Yedekten 2", dilbilgisiNotu: "" })));
    expect((await generate(withBackup, translateSentencePrompt, { sentence: "Hi." })).ceviri).toBe("Yedekten 2");
    expect(fetchMock.mock.calls[2][0]).toBe("https://backup.test/v1/chat/completions");
  });

  it("reports the fallback's error when both fail", async () => {
    fetchMock.mockResolvedValueOnce(response(500, "boom")).mockResolvedValueOnce(response(401, { error: { message: "bad key" } }));
    const err = await generate(withBackup, translateSentencePrompt, { sentence: "Hi." }).catch((e) => e);
    expect(err.kind).toBe("auth");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("uses the fallback for image reading too", async () => {
    fetchMock.mockResolvedValueOnce(response(429, "slow down")).mockResolvedValueOnce(completion("Okunan yazı"));
    expect(await readImageWithAi(withBackup, "data:image/jpeg;base64,AAAA")).toBe("Okunan yazı");
  });
});

describe("describeAiError", () => {
  it("includes the provider's own message so the cause is visible", async () => {
    fetchMock.mockResolvedValue(response(400, { error: { message: "model does not support this parameter" } }));
    const err = await chat(profile, { model: "m", messages: [] }).catch((e) => e);
    const { describeAiError } = await import("./errors");
    expect(describeAiError(err)).toBe("İstek reddedildi (400).\nSağlayıcının mesajı: model does not support this parameter");
    fetchMock.mockReset();
  });
});
