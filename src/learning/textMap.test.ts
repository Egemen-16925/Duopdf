// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { cleanText, findSentence, segmentSentences, sentenceAround } from "./sentence";
import { buildTextMap, offsetOf, rangeFor } from "./textMap";

function el(html: string): HTMLElement {
  const div = document.createElement("div");
  div.innerHTML = html;
  document.body.append(div);
  return div;
}

describe("buildTextMap", () => {
  it("joins PDF text-layer spans with spaces", () => {
    const root = el('<span>Version</span><span>control systems</span><br><span> record changes.</span>');
    expect(buildTextMap(root, "pdf").text).toBe("Version control systems record changes.");
  });

  it("starts a new paragraph in PDF text when the font size jumps (heading → body)", () => {
    const root = el(
      '<span style="--font-height: 18px">Introduction</span><span style="--font-height: 10px">Version control</span><span style="--font-height: 10.4px">records changes.</span>',
    );
    const text = buildTextMap(root, "pdf").text;
    expect(text).toBe("Introduction\nVersion control records changes.");
    expect(sentenceAround(text, text.indexOf("control")).text).toBe("Version control records changes.");
  });

  it("keeps inline formatting together but separates blocks in flowing text", () => {
    const root = el("<h1>Intro</h1><p>Hello <strong>wor</strong>ld.</p><p>Next</p>");
    expect(buildTextMap(root, "flow").text).toBe("Intro\nHello world.\nNext");
  });

  it("maps string offsets back to DOM ranges and DOM positions to offsets", () => {
    const root = el("<p>Hello <strong>wor</strong>ld again.</p>");
    const map = buildTextMap(root, "flow");
    const start = map.text.indexOf("world");
    const range = rangeFor(map, start, start + 5)!;
    expect(range.toString()).toBe("world");
    const strongText = root.querySelector("strong")!.firstChild!;
    expect(offsetOf(map, strongText, 1)).toBe(start + 1);
  });
});

describe("sentences", () => {
  const text = "Git is fast. It stores snapshots of the project.\nDevelopers commit often. Done";

  it("finds the sentence around an offset", () => {
    const at = text.indexOf("snapshots");
    expect(sentenceAround(text, at).text).toBe("It stores snapshots of the project.");
  });

  it("spans several sentences for a phrase that crosses a boundary", () => {
    const s = text.indexOf("project");
    const e = text.indexOf("Developers") + 10;
    expect(sentenceAround(text, s, e).text).toBe("It stores snapshots of the project. Developers commit often.");
  });

  it("cleans hyphenation and whitespace from PDF text", () => {
    expect(cleanText("The infor-\n mation   is  here")).toBe("The information is here");
  });

  it("finds a saved sentence again despite whitespace differences", () => {
    const page = "Intro text.  It   stores\nsnapshots of the project. More.";
    const found = findSentence(page, "It stores snapshots of the project.")!;
    expect(cleanText(page.slice(found.start, found.end))).toBe("It stores snapshots of the project.");
    expect(findSentence(page, "Nothing like this")).toBeNull();
  });
});

describe("segmentSentences", () => {
  const split = (text: string) => segmentSentences(text).map((s) => text.slice(s.start, s.end).trim());

  it("does not split after common abbreviations and initials", () => {
    expect(split("Many tools exist, e.g. Git and Mercurial. They differ.")).toEqual([
      "Many tools exist, e.g. Git and Mercurial.",
      "They differ.",
    ]);
    expect(split("Dr. Brown wrote it in the U.S. in 2019. Then he left.")).toEqual([
      "Dr. Brown wrote it in the U.S. in 2019.",
      "Then he left.",
    ]);
    expect(split("As shown in Fig. 3, it drops. J. Smith agreed.")).toEqual(["As shown in Fig. 3, it drops.", "J. Smith agreed."]);
  });

  it("keeps headings on their own line separate", () => {
    expect(split("Introduction\nVersion control records changes. Commit often.")).toEqual([
      "Introduction",
      "Version control records changes.",
      "Commit often.",
    ]);
  });

  it("splits questions and exclamations", () => {
    expect(split("Is it fast? Yes! It is.")).toEqual(["Is it fast?", "Yes!", "It is."]);
  });
});
