// @vitest-environment jsdom
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { docxToSections } from "./docx";
import { epubToReflow } from "./epub";
import { pptxToSections } from "./pptx";
import { sanitizeHtml } from "./sanitize";
import { decodeText, textToSections } from "./txt";
import { formatFromPath } from "./types";
import { resolvePath } from "./zip";

async function zipBytes(files: Record<string, string | Uint8Array>): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return zip.generateAsync({ type: "uint8array" });
}

describe("formatFromPath", () => {
  it("maps extensions case-insensitively", () => {
    expect(formatFromPath("C:\\Ders\\Kitap.EPUB")).toBe("epub");
    expect(formatFromPath("notlar.md")).toBe("txt");
    expect(formatFromPath("sunum.pptx")).toBe("pptx");
    expect(formatFromPath("eski.doc")).toBeNull();
  });
});

describe("resolvePath", () => {
  it("resolves relative paths inside the zip", () => {
    expect(resolvePath("OEBPS/text/ch1.xhtml", "../images/a%20b.png")).toBe("OEBPS/images/a b.png");
    expect(resolvePath("OEBPS/content.opf", "text/ch1.xhtml#sec")).toBe("OEBPS/text/ch1.xhtml");
    expect(resolvePath("ppt/presentation.xml", "slides/slide2.xml")).toBe("ppt/slides/slide2.xml");
  });
});

describe("txt", () => {
  it("decodes UTF-8 with or without BOM", () => {
    const text = "Değişken ğüşıöç";
    const utf8 = new TextEncoder().encode(text);
    expect(decodeText(utf8)).toBe(text);
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8]))).toBe(text);
  });

  it("falls back to Windows-1254 for Turkish legacy files", () => {
    // "ğüş" in windows-1254
    expect(decodeText(new Uint8Array([0xf0, 0xfc, 0xfe]))).toBe("ğüş");
  });

  it("splits paragraphs on blank lines and escapes HTML", () => {
    const [section] = textToSections("First line\nsecond line\n\n\n<b>Not bold</b>\r\n", "notlar.txt");
    expect(section.title).toBe("notlar.txt");
    expect(section.html).toBe("<p>First line<br>second line</p>\n<p>&lt;b&gt;Not bold&lt;/b&gt;</p>");
  });
});

describe("sanitizeHtml", () => {
  it("removes scripts, event handlers and inline styles", () => {
    const html = sanitizeHtml('<p style="color:red" onclick="alert(1)">Hi <em>there</em></p><script>alert(1)</script>');
    expect(html).toBe("<p>Hi <em>there</em></p>");
  });

  it("drops javascript: links", () => {
    expect(sanitizeHtml('<a href="javascript:alert(1)">x</a>')).toBe("<a>x</a>");
  });

  it("fills resource images after sanitizing and drops unknown ones", () => {
    const resources = new Map([["img/a.png", "blob:abc"]]);
    const html = sanitizeHtml('<img data-res="img/a.png" alt="a"><img data-res="missing.png">', resources);
    expect(html).toBe('<img alt="a" src="blob:abc">');
  });
});

describe("pptx", () => {
  const slide = (shapes: string) =>
    `<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><p:cSld><p:spTree>${shapes}</p:spTree></p:cSld></p:sld>`;
  const shape = (texts: string[], ph?: string) =>
    `<p:sp><p:nvSpPr>${ph ? `<p:nvPr><p:ph type="${ph}"/></p:nvPr>` : ""}</p:nvSpPr><p:txBody>${texts
      .map((t) => `<a:p><a:r><a:t>${t}</a:t></a:r></a:p>`)
      .join("")}</p:txBody></p:sp>`;

  it("extracts slides in presentation order with titles", async () => {
    const bytes = await zipBytes({
      "ppt/presentation.xml": `<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId2"/><p:sldId id="257" r:id="rId1"/></p:sldIdLst></p:presentation>`,
      "ppt/_rels/presentation.xml.rels": `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>`,
      "ppt/slides/slide1.xml": slide(shape(["Second slide body"])),
      "ppt/slides/slide2.xml": slide(shape(["Version Control"], "title") + shape(["Git tracks changes", "Commit often &amp; &lt;early&gt;"])),
    });
    const sections = await pptxToSections(bytes);
    expect(sections.map((s) => s.title)).toEqual(["Slayt 1: Version Control", "Slayt 2"]);
    expect(sections[0].html).toContain("<p>Git tracks changes</p>");
    expect(sections[0].html).toContain("<p>Commit often &amp; &lt;early&gt;</p>");
    expect(sections[1].html).toContain("Second slide body");
  });

  it("rejects a zip that is not a presentation", async () => {
    await expect(pptxToSections(await zipBytes({ "a.txt": "x" }))).rejects.toThrow("PPTX");
  });
});

describe("epub", () => {
  const chapter = (body: string) =>
    `<?xml version="1.0" encoding="utf-8"?><html xmlns="http://www.w3.org/1999/xhtml"><head><title>t</title><style>p{color:red}</style></head><body>${body}</body></html>`;

  async function sampleEpub() {
    return zipBytes({
      "META-INF/container.xml": `<container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf"/></rootfiles></container>`,
      "OEBPS/content.opf": `<package xmlns="http://www.idpf.org/2007/opf"><manifest>
        <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
        <item id="c1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
        <item id="c2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
        <item id="empty" href="text/empty.xhtml" media-type="application/xhtml+xml"/>
        <item id="img" href="images/fig.png" media-type="image/png"/>
      </manifest><spine><itemref idref="c1"/><itemref idref="empty"/><itemref idref="c2"/></spine></package>`,
      "OEBPS/nav.xhtml": chapter(`<nav><ol><li><a href="text/ch1.xhtml">Giriş</a></li><li><a href="text/ch2.xhtml#top">Sürüm Kontrolü</a></li></ol></nav>`),
      "OEBPS/text/ch1.xhtml": chapter(
        `<h1>Intro</h1><p id="p1">See <a href="ch2.xhtml#git">Git</a> and <a href="https://git-scm.com">site</a>.</p><img src="../images/fig.png" alt="fig"/><script>alert(1)</script>`,
      ),
      "OEBPS/text/empty.xhtml": chapter(""),
      "OEBPS/text/ch2.xhtml": chapter(`<h2 id="git">Git</h2><p>Branches.</p>`),
      "OEBPS/images/fig.png": new Uint8Array([1, 2, 3]),
    });
  }

  it("reads chapters in spine order with table-of-contents titles", async () => {
    const urls: string[] = [];
    const doc = await epubToReflow(await sampleEpub(), (data, mime) => {
      urls.push(`${mime}:${data.length}`);
      return "blob:fig";
    });
    expect(doc.sections.map((s) => s.title)).toEqual(["Giriş", "Sürüm Kontrolü"]);
    expect(doc.sections.map((s) => s.anchor)).toEqual(["s0", "s2"]);
    expect(urls).toEqual(["image/png:3"]);
    expect(doc.objectUrls).toEqual(["blob:fig"]);
  });

  it("sanitizes chapters and rewrites links and images", async () => {
    const doc = await epubToReflow(await sampleEpub(), () => "blob:fig");
    const html = doc.sections[0].html;
    expect(html).not.toContain("script");
    expect(html).not.toContain("color:red");
    expect(html).toContain('href="#s2-git"');
    expect(html).toContain('href="https://git-scm.com"');
    expect(html).toContain('id="s0-p1"');
    expect(html).toContain('src="blob:fig"');
    expect(doc.sections[1].html).toContain('id="s2-git"');
  });

  it("rejects a zip without an OPF package", async () => {
    await expect(epubToReflow(await zipBytes({ "a.txt": "x" }))).rejects.toThrow("EPUB");
  });
});

describe("docx", () => {
  it("converts paragraphs and bold text to safe HTML", async () => {
    const bytes = await zipBytes({
      "[Content_Types].xml": `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
      "_rels/.rels": `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
      "word/document.xml": `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Hello </w:t></w:r><w:r><w:rPr><w:b/></w:rPr><w:t>world</w:t></w:r></w:p></w:body></w:document>`,
    });
    const [section] = await docxToSections(bytes, "ders.docx");
    expect(section.title).toBe("ders.docx");
    expect(section.html).toBe("<p>Hello <strong>world</strong></p>");
  });
});
