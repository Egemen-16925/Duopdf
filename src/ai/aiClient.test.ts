import { beforeEach, describe, expect, it, vi } from "vitest";

const fetchMock = vi.fn();
vi.mock("@tauri-apps/plugin-http", () => ({ fetch: (...args: unknown[]) => fetchMock(...args) }));

import { chat, generate, listModels, runPrompt, testConnection } from "./aiClient";
import { AiError } from "./errors";
import { translateSentencePrompt } from "./prompts/translateSentence";
import type { ProviderProfile } from "../settings/providers";

const profile: ProviderProfile = {
  id: "p1",
  name: "Test",
  baseUrl: "https://example.test/v1/",
  apiKey: "test-key",
  fastModel: "fast/model",
  strongModel: "strong/model",
};

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

  it("uses the fast model for a fast template and validates the result", async () => {
    fetchMock.mockResolvedValueOnce(completion(valid));
    const run = await runPrompt(profile, translateSentencePrompt, { sentence: "Hi." });
    expect(sentBody(0).model).toBe("fast/model");
    expect(run.data).toEqual({ ceviri: "Çeviri", dilbilgisiNotu: "Not" });
    expect(run.validationError).toBeUndefined();
  });

  it("reports invalid JSON without retrying when repair is off", async () => {
    fetchMock.mockResolvedValueOnce(completion('{"translation": "x"}'));
    const run = await runPrompt(profile, translateSentencePrompt, { sentence: "Hi." });
    expect(run.data).toBeUndefined();
    expect(run.validationError).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("shows the error to the model once when repair is on", async () => {
    fetchMock.mockResolvedValueOnce(completion("not json"));
    fetchMock.mockResolvedValueOnce(completion(valid));
    const data = await generate(profile, translateSentencePrompt, { sentence: "Hi." });
    expect(data.ceviri).toBe("Çeviri");
    const repairMessages = sentBody(1).messages;
    expect(repairMessages.at(-2)).toEqual({ role: "assistant", content: "not json" });
    expect(repairMessages.at(-1).content).toContain("geçerli değildi");
  });

  it("gives up with a clear error after one failed repair", async () => {
    fetchMock.mockResolvedValue(completion("still not json"));
    await expect(generate(profile, translateSentencePrompt, { sentence: "Hi." })).rejects.toMatchObject({
      kind: "badResponse",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("fails early when the role model is not configured", async () => {
    await expect(
      runPrompt({ ...profile, fastModel: "" }, translateSentencePrompt, { sentence: "Hi." }),
    ).rejects.toMatchObject({ kind: "config" });
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
    const report = await testConnection({ ...profile, fastModel: "", strongModel: "" });
    expect(report.ok).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("validates the key with a small chat request", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { data: [{ id: "fast/model" }] }));
    fetchMock.mockResolvedValueOnce(completion("OK"));
    const report = await testConnection(profile);
    expect(report.ok).toBe(true);
    expect(sentBody(1).model).toBe("fast/model");
  });

  it("surfaces a bad key from the chat request", async () => {
    fetchMock.mockResolvedValueOnce(response(200, { data: [] }));
    fetchMock.mockResolvedValueOnce(response(401, "Unauthorized"));
    await expect(testConnection(profile)).rejects.toMatchObject({ kind: "auth" });
  });
});
