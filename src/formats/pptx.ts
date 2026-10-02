import type JSZip from "jszip";
import { escapeHtml, type ReflowDoc } from "./types";
import { openZip, readXml, resolvePath } from "./zip";

type MakeUrl = (data: Uint8Array, mime: string) => string;

const defaultMakeUrl: MakeUrl = (data, mime) => URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: mime }));

const TITLE_TYPES = new Set(["title", "ctrTitle"]);
const IMAGE_TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", bmp: "image/bmp", webp: "image/webp" };

function paragraphText(p: Element): string {
  return Array.from(p.getElementsByTagName("a:t"))
    .map((t) => t.textContent ?? "")
    .join("")
    .trim();
}

function relsPathFor(slidePath: string): string {
  const parts = slidePath.split("/");
  const file = parts.pop();
  return [...parts, "_rels", `${file}.rels`].join("/");
}

interface SlideContext {
  zip: JSZip;
  slidePath: string;
  rels: Map<string, string>;
  makeUrl: MakeUrl;
  /** Sunum genelinde aynı resim bir kez blob'a çevrilir. */
  urls: Map<string, string>;
}

/** Slayttaki öğeleri ekrandaki sırasıyla dolaşır: metin kutuları, resimler, tablolar, gruplar. */
async function walk(node: Element, ctx: SlideContext, out: { title: string; parts: string[] }) {
  for (const child of Array.from(node.children)) {
    const tag = child.tagName;
    if (tag === "p:sp") {
      const placeholder = child.getElementsByTagName("p:ph")[0];
      const isTitle = placeholder != null && TITLE_TYPES.has(placeholder.getAttribute("type") ?? "");
      const texts = Array.from(child.getElementsByTagName("a:p")).map(paragraphText).filter(Boolean);
      if (isTitle && !out.title) out.title = texts.join(" ");
      else out.parts.push(...texts.map((t) => `<p>${escapeHtml(t)}</p>`));
    } else if (tag === "p:pic") {
      const id = child.getElementsByTagName("a:blip")[0]?.getAttribute("r:embed");
      const target = id ? ctx.rels.get(id) : undefined;
      if (!target) continue;
      const path = resolvePath(ctx.slidePath, target);
      const ext = path.split(".").pop()?.toLowerCase() ?? "";
      const file = ctx.zip.file(path);
      if (!file || !IMAGE_TYPES[ext]) continue;
      let url = ctx.urls.get(path);
      if (!url) {
        url = ctx.makeUrl(await file.async("uint8array"), IMAGE_TYPES[ext]);
        ctx.urls.set(path, url);
      }
      out.parts.push(`<img src="${escapeHtml(url)}" alt="">`);
    } else if (tag === "p:graphicFrame") {
      for (const cell of Array.from(child.getElementsByTagName("a:tc"))) {
        const text = Array.from(cell.getElementsByTagName("a:p")).map(paragraphText).filter(Boolean).join(" ");
        if (text) out.parts.push(`<p>${escapeHtml(text)}</p>`);
      }
    } else if (tag === "p:grpSp") {
      await walk(child, ctx, out);
    }
  }
}

export async function pptxToReflow(bytes: Uint8Array, makeUrl: MakeUrl = defaultMakeUrl): Promise<ReflowDoc> {
  const zip = await openZip(bytes);
  const presentation = await readXml(zip, "ppt/presentation.xml");
  const rels = await readXml(zip, "ppt/_rels/presentation.xml.rels");
  if (!presentation || !rels) throw new Error("Bu dosya geçerli bir PowerPoint (PPTX) sunusu değil.");

  const relTargets = (doc: Document) =>
    new Map(Array.from(doc.getElementsByTagName("Relationship")).map((r) => [r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? ""]));
  const targets = relTargets(rels);
  const urls = new Map<string, string>();
  const sections: ReflowDoc["sections"] = [];

  const slideIds = Array.from(presentation.getElementsByTagName("p:sldId"));
  for (const [index, sldId] of slideIds.entries()) {
    const target = targets.get(sldId.getAttribute("r:id") ?? "");
    if (!target) continue;
    const slidePath = resolvePath("ppt/presentation.xml", target);
    const slide = await readXml(zip, slidePath);
    const tree = slide?.getElementsByTagName("p:spTree")[0];
    if (!tree) continue;
    const slideRels = await readXml(zip, relsPathFor(slidePath));
    const out = { title: "", parts: [] as string[] };
    await walk(tree, { zip, slidePath, rels: slideRels ? relTargets(slideRels) : new Map(), makeUrl, urls }, out);
    const heading = `Slayt ${index + 1}${out.title ? `: ${out.title}` : ""}`;
    sections.push({ title: heading, html: `<h2>${escapeHtml(heading)}</h2>\n${out.parts.join("\n")}` });
  }
  return { sections, objectUrls: [...urls.values()] };
}
