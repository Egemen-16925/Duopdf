import { escapeHtml, type ReflowSection } from "./types";
import { openZip, readXml, resolvePath } from "./zip";

const TITLE_TYPES = new Set(["title", "ctrTitle"]);

function paragraphText(p: Element): string {
  return Array.from(p.getElementsByTagName("a:t"))
    .map((t) => t.textContent ?? "")
    .join("")
    .trim();
}

/** Slayttaki metni sırasıyla çıkarır; başlık yer tutucusunu ayırır. */
function extractSlide(doc: Document): { title: string; paragraphs: string[] } {
  let title = "";
  const paragraphs: string[] = [];
  for (const shape of Array.from(doc.getElementsByTagName("p:sp"))) {
    const placeholder = shape.getElementsByTagName("p:ph")[0];
    const isTitle = placeholder != null && TITLE_TYPES.has(placeholder.getAttribute("type") ?? "");
    const texts = Array.from(shape.getElementsByTagName("a:p")).map(paragraphText).filter(Boolean);
    if (isTitle && !title) title = texts.join(" ");
    else paragraphs.push(...texts);
  }
  // Tablolar p:sp dışında (p:graphicFrame) durur.
  for (const cell of Array.from(doc.getElementsByTagName("a:tc"))) {
    const text = Array.from(cell.getElementsByTagName("a:p")).map(paragraphText).filter(Boolean).join(" ");
    if (text) paragraphs.push(text);
  }
  return { title, paragraphs };
}

export async function pptxToSections(bytes: Uint8Array): Promise<ReflowSection[]> {
  const zip = await openZip(bytes);
  const presentation = await readXml(zip, "ppt/presentation.xml");
  const rels = await readXml(zip, "ppt/_rels/presentation.xml.rels");
  if (!presentation || !rels) throw new Error("Bu dosya geçerli bir PowerPoint (PPTX) sunusu değil.");

  const targets = new Map<string, string>();
  for (const rel of Array.from(rels.getElementsByTagName("Relationship"))) {
    targets.set(rel.getAttribute("Id") ?? "", rel.getAttribute("Target") ?? "");
  }

  const sections: ReflowSection[] = [];
  const slideIds = Array.from(presentation.getElementsByTagName("p:sldId"));
  for (const [index, sldId] of slideIds.entries()) {
    const target = targets.get(sldId.getAttribute("r:id") ?? "");
    if (!target) continue;
    const slide = await readXml(zip, resolvePath("ppt/presentation.xml", target));
    if (!slide) continue;
    const { title, paragraphs } = extractSlide(slide);
    const heading = `Slayt ${index + 1}${title ? `: ${title}` : ""}`;
    const body = paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n");
    sections.push({ title: heading, html: `<h2>${escapeHtml(heading)}</h2>\n${body}` });
  }
  return sections;
}
