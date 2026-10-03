import "fake-indexeddb/auto";
import { beforeAll, describe, expect, it, vi } from "vitest";

/* ---- Sahte Tauri eklentileri ---- */
const storeData = new Map<string, unknown>();
vi.mock("@tauri-apps/plugin-store", () => ({
  load: async () => ({
    get: async (k: string) => storeData.get(k),
    set: async (k: string, v: unknown) => void storeData.set(k, JSON.parse(JSON.stringify(v))),
    save: async () => {},
  }),
}));

let openedUrl = "";
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: async (u: string) => void (openedUrl = u) }));

vi.mock("@tauri-apps/api/core", () => ({
  invoke: async (cmd: string, args: any) => {
    if (cmd === "protect_secret") return `dpapi:${btoa(args.plain)}`;
    if (cmd === "unprotect_secret") return atob(args.data.slice(6));
    if (cmd === "oauth_listen") return 4321;
    if (cmd === "oauth_wait") {
      const state = new URL(openedUrl).searchParams.get("state");
      return `state=${state}&code=good-code`;
    }
    if (cmd === "oauth_cancel") return null;
    throw new Error(cmd);
  },
}));
vi.mock("../learning/store", () => ({ refreshTerms: async () => {} }));

/* ---- Sahte Google (token ve Drive uçları) ---- */
const files = new Map<string, string>();
const tokenRequests: URLSearchParams[] = [];
let uploads = 0;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
}

const idToken = ["x", btoa(JSON.stringify({ email: "egemen@example.com" })), "sig"].join(".");

vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: async (input: string, init: RequestInit = {}) => {
    const url = new URL(input);
    const method = init.method ?? "GET";
    const auth = (init.headers as Record<string, string> | undefined)?.Authorization;
    if (url.href.startsWith("https://oauth2.googleapis.com/token")) {
      const body = new URLSearchParams(String(init.body));
      tokenRequests.push(body);
      if (body.get("client_secret") !== "secret-1") return json({ error: "invalid_client" }, 401);
      if (body.get("grant_type") === "authorization_code") {
        return json({ access_token: "at-1", expires_in: 3600, refresh_token: "rt-1", id_token: idToken });
      }
      return json({ access_token: "at-2", expires_in: 3600 });
    }
    if (url.href.startsWith("https://oauth2.googleapis.com/revoke")) return json({});
    if (!auth?.startsWith("Bearer at-")) return json({ error: "unauthorized" }, 401);
    if (url.pathname === "/drive/v3/files" && method === "GET") {
      expect(url.searchParams.get("spaces")).toBe("appDataFolder");
      return json({ files: [...files.keys()].map((id) => ({ id })) });
    }
    if (url.pathname.startsWith("/drive/v3/files/") && url.searchParams.get("alt") === "media") {
      return new Response(files.get(url.pathname.split("/").pop()!) ?? "", { status: 200 });
    }
    if (url.pathname === "/upload/drive/v3/files" && method === "POST") {
      uploads++;
      const parts = String(init.body).split(/\r\n--duopdf-[^\r\n]*/);
      expect(parts[0]).toContain('"parents":["appDataFolder"]');
      const content = parts[1].split("\r\n\r\n").slice(1).join("\r\n\r\n");
      files.set("f1", content);
      return json({ id: "f1" });
    }
    if (url.pathname.startsWith("/upload/drive/v3/files/") && method === "PATCH") {
      uploads++;
      files.set(url.pathname.split("/").pop()!, String(init.body));
      return json({});
    }
    if (url.pathname.startsWith("/drive/v3/files/") && method === "DELETE") {
      files.delete(url.pathname.split("/").pop()!);
      return new Response(null, { status: 204 });
    }
    throw new Error(`beklenmeyen istek: ${method} ${input}`);
  },
}));

import { db } from "../db/db";
import { markTerm } from "../learning/terms";
import { pkcePair } from "./google";
import { connect, deleteCloudData, getSyncState, initSync, setClient, syncNow } from "./manager";
import { mergeSnapshots, parseSnapshot } from "./snapshot";

async function sha256url(text: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
  return btoa(String.fromCharCode(...d)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

describe("Google Drive sync", () => {
  beforeAll(async () => {
    await initSync();
    await markTerm(db, { surface: "ran", lemma: "run", status: "unknown" }, 10);
  });

  it("makes a valid PKCE pair", async () => {
    const { verifier, challenge } = await pkcePair();
    expect(verifier.length).toBeGreaterThanOrEqual(43);
    expect(challenge).toBe(await sha256url(verifier));
  });

  it("rejects a client id that is not a Google desktop client", async () => {
    await expect(setClient("abc", "x")).rejects.toThrow("apps.googleusercontent.com");
  });

  it("signs in with PKCE, stores only encrypted secrets and uploads the first copy", async () => {
    await setClient("123.apps.googleusercontent.com", "secret-1");
    await connect();

    const auth = new URL(openedUrl);
    expect(auth.origin + auth.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(auth.searchParams.get("redirect_uri")).toBe("http://127.0.0.1:4321");
    expect(auth.searchParams.get("code_challenge_method")).toBe("S256");
    expect(auth.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/drive.appdata");
    const exchange = tokenRequests[0];
    expect(exchange.get("code")).toBe("good-code");
    expect(await sha256url(exchange.get("code_verifier")!)).toBe(auth.searchParams.get("code_challenge"));

    const saved = JSON.stringify(storeData.get("sync"));
    expect(saved).not.toContain("secret-1");
    expect(saved).not.toContain("rt-1");
    expect(getSyncState()).toMatchObject({ connected: true, email: "egemen@example.com", busy: "idle" });

    const cloud = parseSnapshot(files.get("f1")!);
    expect(cloud.terms.map((t) => t.key)).toEqual(["run"]);
    expect(files.get("f1")).not.toContain("apiKey");
  });

  it("brings words added on another device and does not re-upload when nothing changed", async () => {
    const other = parseSnapshot(files.get("f1")!);
    const fromLaptop = mergeSnapshots(other, {
      ...other,
      terms: [{ ...other.terms[0], key: "deploy", lemma: "deploy", surface: "deploy", updatedAt: 99 }],
    });
    files.set("f1", JSON.stringify(fromLaptop));
    const before = uploads;

    await syncNow();
    expect((await db.terms.toArray()).map((t) => t.key).sort()).toEqual(["deploy", "run"]);
    expect(uploads).toBe(before); // bulut zaten birleşik veriyle aynı

    await markTerm(db, { surface: "commit", lemma: "commit", status: "learning" }, 200);
    await syncNow();
    expect(uploads).toBe(before + 1);
    expect(parseSnapshot(files.get("f1")!).terms.map((t) => t.key)).toEqual(["commit", "deploy", "run"]);
  });

  it("deletes only the cloud copy", async () => {
    await deleteCloudData();
    expect(files.size).toBe(0);
    expect(await db.terms.count()).toBe(3);
  });
});
