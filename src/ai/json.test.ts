import { describe, expect, it } from "vitest";
import { extractJson, stripThinking } from "./json";

describe("stripThinking", () => {
  it("removes think blocks and reports them", () => {
    expect(stripThinking("<think>hmm\nok</think>\n{\"a\":1}")).toEqual({ text: '{"a":1}', hadThinking: true });
  });

  it("removes an unterminated think block", () => {
    expect(stripThinking("<think>still thinking")).toEqual({ text: "", hadThinking: true });
  });

  it("leaves plain text untouched", () => {
    expect(stripThinking("  merhaba ")).toEqual({ text: "merhaba", hadThinking: false });
  });
});

describe("extractJson", () => {
  it("parses plain JSON", () => {
    expect(extractJson('{"ceviri":"x"}')).toEqual({ ceviri: "x" });
  });

  it("parses fenced JSON", () => {
    expect(extractJson('İşte:\n```json\n{"a": [1, 2]}\n```\nBitti.')).toEqual({ a: [1, 2] });
  });

  it("finds an object surrounded by prose", () => {
    expect(extractJson('Sonuç şu: {"sonuc": "dogru"} umarım yardımcı olur')).toEqual({ sonuc: "dogru" });
  });

  it("ignores thinking before the JSON", () => {
    expect(extractJson('<think>{"wrong": true}</think>{"right": true}')).toEqual({ right: true });
  });

  it("throws when there is no JSON", () => {
    expect(() => extractJson("Üzgünüm, yapamam.")).toThrow(SyntaxError);
  });
});
