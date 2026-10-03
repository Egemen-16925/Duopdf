import { describe, expect, it, vi } from "vitest";

vi.mock("@tauri-apps/plugin-store", () => ({ load: vi.fn() }));

import { allTargets, normalizeSettings, removeProfile, targetFor, type ProviderSettings } from "./providers";

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
