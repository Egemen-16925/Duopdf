import { describe, expect, it, vi } from "vitest";

const storeData = new Map<string, unknown>();
const fakeStore = {
  get: async (key: string) => storeData.get(key),
  set: async (key: string, value: unknown) => void storeData.set(key, JSON.parse(JSON.stringify(value))),
  delete: async (key: string) => void storeData.delete(key),
  save: async () => {},
};
vi.mock("@tauri-apps/plugin-store", () => ({ load: async () => fakeStore }));
// Sahte DPAPI: gerçek şifreleme Rust testlerinde (src-tauri/src/secret.rs) denetleniyor.
const invokeMock = vi.fn(async (cmd: string, args: any) => {
  if (cmd === "protect_secret") return `dpapi:${btoa(args.plain)}`;
  if (cmd === "unprotect_secret") {
    if (args.data === "dpapi:other-machine") throw "çözülemedi";
    return atob(args.data.slice(6));
  }
  throw new Error(cmd);
});
vi.mock("@tauri-apps/api/core", () => ({ invoke: (cmd: string, args: unknown) => invokeMock(cmd, args) }));

import {
  allTargets,
  loadProviderSettings,
  normalizeSettings,
  removeProfile,
  saveProviderSettings,
  targetFor,
  type ProviderSettings,
} from "./providers";

const nvidia = { id: "a", name: "NVIDIA", baseUrl: "https://integrate.api.nvidia.com/v1", apiKey: "k1" };
const router = { id: "b", name: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", apiKey: "k2" };

describe("normalizeSettings", () => {
  it("starts with an NVIDIA provider when nothing is stored", () => {
    const s = normalizeSettings(undefined, undefined);
    expect(s.profiles).toHaveLength(1);
    expect(s.profiles[0].name).toBe("NVIDIA");
    expect(s.roles.fast).toEqual({ profileId: s.profiles[0].id, model: "" });
  });

  it("migrates the old single active profile to the three roles", () => {
    const legacy = [
      { ...router, fastModel: "x", strongModel: "y" },
      { ...nvidia, fastModel: "fast-1", strongModel: "strong-1", visionModel: "vision-1" },
    ];
    const s = normalizeSettings(legacy, undefined, "a");
    expect(s.profiles.map((p) => Object.keys(p).sort())).toEqual([
      ["apiKey", "baseUrl", "id", "name"],
      ["apiKey", "baseUrl", "id", "name"],
    ]);
    expect(s.roles).toEqual({
      fast: { profileId: "a", model: "fast-1" },
      strong: { profileId: "a", model: "strong-1" },
      vision: { profileId: "a", model: "vision-1" },
    });
  });

  it("keeps per-role providers and repairs roles pointing to deleted providers", () => {
    const s = normalizeSettings([nvidia, router], {
      fast: { profileId: "b", model: "fast-2" },
      strong: { profileId: "gone", model: "strong-2" },
    });
    expect(s.roles.fast).toEqual({ profileId: "b", model: "fast-2" });
    expect(s.roles.strong).toEqual({ profileId: "a", model: "strong-2" });
    expect(s.roles.vision).toEqual({ profileId: "a", model: "" });
  });
});

describe("targets", () => {
  const settings: ProviderSettings = {
    profiles: [nvidia, { ...router, apiKey: "" }],
    roles: {
      fast: { profileId: "a", model: "nvidia/fast" },
      strong: { profileId: "b", model: "router/strong" },
      vision: { profileId: "a", model: " " },
    },
  };

  it("resolves each role to its own provider and model", () => {
    expect(targetFor(settings, "fast")).toEqual({ profile: nvidia, model: "nvidia/fast" });
  });

  it("is unavailable without a key or a model", () => {
    expect(allTargets(settings)).toMatchObject({ strong: null, vision: null });
  });

  it("moves roles off a removed provider", () => {
    const s = removeProfile(settings, "a");
    expect(s.profiles.map((p) => p.id)).toEqual(["b"]);
    expect(s.roles.fast).toEqual({ profileId: "b", model: "" });
    expect(s.roles.strong).toEqual({ profileId: "b", model: "router/strong" });
  });
});

describe("fallback targets", () => {
  const settings: ProviderSettings = {
    profiles: [nvidia, router],
    roles: {
      fast: { profileId: "a", model: "m1", fallback: { profileId: "b", model: "m2" } },
      strong: { profileId: "a", model: "m1", fallback: { profileId: "a", model: "m1" } },
      vision: { profileId: "a", model: "v", fallback: { profileId: "b", model: "" } },
    },
  };

  it("attaches a complete fallback that differs from the primary", () => {
    const fast = targetFor(settings, "fast")!;
    expect(fast.fallback?.profile.id).toBe("b");
    expect(fast.fallback?.model).toBe("m2");
    expect(targetFor(settings, "strong")!.fallback).toBeUndefined();
    expect(targetFor(settings, "vision")!.fallback).toBeUndefined();
  });

  it("keeps stored fallbacks only for existing providers and clears them when the provider is removed", () => {
    const s = normalizeSettings([nvidia, router], {
      fast: { profileId: "a", model: "m1", fallback: { profileId: "b", model: "m2" } },
      strong: { profileId: "a", model: "m1", fallback: { profileId: "gone", model: "m2" } },
    });
    expect(s.roles.fast.fallback).toEqual({ profileId: "b", model: "m2" });
    expect(s.roles.strong.fallback).toBeUndefined();
    expect(removeProfile(s, "b").roles.fast.fallback).toBeNull();
  });
});

describe("stored API keys", () => {
  it("never writes the key as plain text and reads it back", async () => {
    storeData.clear();
    await saveProviderSettings({
      profiles: [nvidia],
      roles: { fast: { profileId: "a", model: "m" }, strong: { profileId: "a", model: "" }, vision: { profileId: "a", model: "" } },
    });
    const written = JSON.stringify(storeData.get("profiles"));
    expect(written).not.toContain('"k1"');
    expect(written).toContain("apiKeyEnc");
    const loaded = await loadProviderSettings();
    expect(loaded.profiles[0].apiKey).toBe("k1");
  });

  it("encrypts plain keys left by older versions on load", async () => {
    storeData.clear();
    storeData.set("profiles", [router]);
    const loaded = await loadProviderSettings();
    expect(loaded.profiles[0].apiKey).toBe("k2");
    expect(JSON.stringify(storeData.get("profiles"))).not.toContain('"k2"');
  });

  it("refuses to save when encryption gives an unexpected answer instead of dropping the key", async () => {
    storeData.clear();
    const fresh = { ...router, apiKey: "never-encrypted-before" };
    storeData.set("profiles", [fresh]);
    invokeMock.mockResolvedValueOnce(undefined as unknown as string);
    await expect(loadProviderSettings()).rejects.toThrow("şifrelenemedi");
    expect(storeData.get("profiles")).toEqual([fresh]);
  });

  it("leaves the key empty when it cannot be decrypted on this machine", async () => {
    storeData.clear();
    storeData.set("profiles", [{ id: "a", name: "NVIDIA", baseUrl: nvidia.baseUrl, apiKeyEnc: "dpapi:other-machine" }]);
    const loaded = await loadProviderSettings();
    expect(loaded.profiles[0].apiKey).toBe("");
  });
});
