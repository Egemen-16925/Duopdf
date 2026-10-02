import { describe, expect, it } from "vitest";
import { bestLocalLemma, lemmaCandidates, tokenize } from "./lemma";
import { buildMatcher, patternFor, type MatchableTerm } from "./matcher";

describe("tokenize", () => {
  it("keeps apostrophes and inner hyphens inside words", () => {
    const text = "The compiler’s real-time output, isn't it?";
    expect(tokenize(text).map((t) => t.word)).toEqual(["the", "compiler's", "real-time", "output", "isn't", "it"]);
    const [, second] = tokenize(text);
    expect(text.slice(second.start, second.end)).toBe("compiler’s");
  });
});

describe("lemmaCandidates", () => {
  it("covers irregular and regular inflections", () => {
    expect(lemmaCandidates("ran")).toContain("run");
    expect(lemmaCandidates("Running")).toContain("run");
    expect(lemmaCandidates("studies")).toContain("study");
    expect(lemmaCandidates("children")).toContain("child");
    expect(lemmaCandidates("compiler's")).toContain("compiler");
  });

  it("picks a sensible local lemma", () => {
    expect(bestLocalLemma("ran")).toBe("run");
    expect(bestLocalLemma("studies")).toBe("study");
    expect(bestLocalLemma("algorithm")).toBe("algorithm");
  });
});

function term(id: number, words: string[], status: MatchableTerm["status"] = "unknown", lemma: string[] = []): MatchableTerm {
  return { id, status, pattern: patternFor(words, lemma) };
}

describe("matcher", () => {
  const matcher = buildMatcher([
    term(1, ["running"], "unknown", ["run"]),
    term(2, ["carry", "out"], "learning"),
    term(3, ["version", "control"]),
    term(4, ["version"], "learning"),
  ]);

  const words = (text: string) => {
    const tokens = tokenize(text);
    return matcher.findAll(tokens).map((m) => ({
      id: m.termId,
      text: text.slice(tokens[m.first].start, tokens[m.last].end),
    }));
  };

  it("matches different inflections of the same lemma", () => {
    expect(words("He ran, she runs, they are running.")).toEqual([
      { id: 1, text: "ran" },
      { id: 1, text: "runs" },
      { id: 1, text: "running" },
    ]);
  });

  it("matches multi-word terms with inflected parts", () => {
    expect(words("We carried out the tests.")).toEqual([{ id: 2, text: "carried out" }]);
  });

  it("prefers the longer term when terms overlap", () => {
    expect(words("Version control and the latest version.")).toEqual([
      { id: 3, text: "Version control" },
      { id: 4, text: "version" },
    ]);
  });

  it("finds the exact term for a clicked word or phrase", () => {
    expect(matcher.findExact(tokenize("ran"))?.id).toBe(1);
    expect(matcher.findExact(tokenize("carries out"))?.id).toBe(2);
    expect(matcher.findExact(tokenize("version"))?.id).toBe(4);
    expect(matcher.findExact(tokenize("control"))).toBeUndefined();
  });
});
