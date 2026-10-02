import type JSZip from "jszip";
import { sanitizeHtml } from "./sanitize";
import type { ReflowDoc, ReflowSection } from "./types";
import { openZip, readXml, resolvePath } from "./zip";

type MakeUrl = (data: Uint8Array, mime: string) => string;

const defaultMakeUrl: MakeUrl = (data, mime) => URL.createObjectURL(new Blob([data as Uint8Array<ArrayBuffer>], { type: mime }));

interface ManifestItem {
  path: string;
  mime: string;
  properties: string;
}

/** İçindekiler: dosya yolu → başlık (EPUB 3 nav veya EPUB 2 NCX). */
async function readToc(zip: JSZip, manifest: Map<string, ManifestItem>, spineToc: string | null): Promise<Map<string, string>> {
  const titles = new Map<string, string>();
  const add = (fromFile: string, href: string | null, label: string | null | undefined) => {
    const text = label?.replace(/\s+/g, " ").trim();
    if (!href || !text) return;
    const path = resolvePath(fromFile, href);
    if (!titles.has(path)) titles.set(path, text);
  };

  const nav = [...manifest.values()].find((m) => m.properties.split(/\s+/).includes("nav"));
  if (nav) {
    const doc = await readXml(zip, nav.path, "application/xhtml+xml");
    for (const a of Array.from(doc?.getElementsByTagName("a") ?? [])) add(nav.path, a.getAttribute("href"), a.textContent);
  }
  const ncx = spineToc ? manifest.get(spineToc) : undefined;
  if (titles.size === 0 && ncx) {
    const doc = await readXml(zip, ncx.path);
    for (const point of Array.from(doc?.getElementsByTagName("navPoint") ?? [])) {
      const label = point.getElementsByTagName("text")[0]?.textContent;
      add(ncx.path, point.getElementsByTagName("content")[0]?.getAttribute("src") ?? null, label);
    }
  }
  return titles;
}

export async function epubToReflow(bytes: Uint8Array, makeUrl: MakeUrl = defaultMakeUrl): Promise<ReflowDoc> {
  const zip = await openZip(bytes);
  const container = await readXml(zip, "META-INF/container.xml");
  const opfPath = container?.getElementsByTagName("rootfile")[0]?.getAttribute("full-path");
  const opf = opfPath ? await readXml(zip, opfPath) : null;
  if (!opfPath || !opf) throw new Error("Bu dosya geçerli bir EPUB e-kitabı değil.");

  const manifest = new Map<string, ManifestItem>();
  for (const item of Array.from(opf.getElementsByTagName("item"))) {
    manifest.set(item.getAttribute("id") ?? "", {
      path: resolvePath(opfPath, item.getAttribute("href") ?? ""),
      mime: item.getAttribute("media-type") ?? "",
      properties: item.getAttribute("properties") ?? "",
    });
  }
  const mimeByPath = new Map([...manifest.values()].map((m) => [m.path, m.mime]));
  const spineEl = opf.getElementsByTagName("spine")[0];
  const spine = Array.from(opf.getElementsByTagName("itemref"))
    .map((ref) => manifest.get(ref.getAttribute("idref") ?? ""))
    .filter((m): m is ManifestItem => m != null && /x?html/.test(m.mime));
  const spineIndex = new Map(spine.map((m, i) => [m.path, i]));
  const tocTitles = await readToc(zip, manifest, spineEl?.getAttribute("toc") ?? null);

  const resources = new Map<string, string>();
  const sections: ReflowSection[] = [];

  for (const [k, item] of spine.entries()) {
    const file = zip.file(item.path);
    if (!file) continue;
    const source = await file.async("string");
    let doc = new DOMParser().parseFromString(source, "application/xhtml+xml");
    if (doc.getElementsByTagName("parsererror").length > 0) doc = new DOMParser().parseFromString(source, "text/html");
    const body = doc.getElementsByTagName("body")[0];
    if (!body) continue;

    // Resimler: zip içinden blob adresine.
    for (const el of Array.from(body.querySelectorAll("img, image"))) {
      const attr = el.tagName.toLowerCase() === "img" ? "src" : el.hasAttribute("href") ? "href" : "xlink:href";
      const ref = el.getAttribute(attr);
      el.removeAttribute(attr);
      if (!ref || /^[a-z]+:/i.test(ref)) continue;
      const path = resolvePath(item.path, ref);
      const data = zip.file(path);
      if (!data) continue;
      if (!resources.has(path)) resources.set(path, makeUrl(await data.async("uint8array"), mimeByPath.get(path) ?? "image/*"));
      el.setAttribute("data-res", path);
    }
    // Kimlikler bölümler arasında çakışmasın.
    for (const el of Array.from(body.querySelectorAll("[id]"))) el.setAttribute("id", `s${k}-${el.getAttribute("id")}`);
    // Bağlantılar: dış adresler kalır, kitap içi bağlantılar bölüm çapasına çevrilir.
    for (const a of Array.from(body.querySelectorAll("a[href]"))) {
      const href = a.getAttribute("href") ?? "";
      if (/^https?:/i.test(href)) continue;
      const [target, fragment] = href.split("#");
      const index = target ? spineIndex.get(resolvePath(item.path, target)) : k;
      if (index == null) a.removeAttribute("href");
      else a.setAttribute("href", fragment ? `#s${index}-${fragment}` : `#s${index}`);
    }

    const html = sanitizeHtml(body.innerHTML, resources);
    const hasContent = /<img|<image/i.test(html) || (body.textContent ?? "").trim().length > 0;
    if (!hasContent) continue;
    const heading = body.querySelector("h1, h2, h3")?.textContent?.replace(/\s+/g, " ").trim();
    sections.push({ title: tocTitles.get(item.path) ?? heading ?? `Bölüm ${sections.length + 1}`, html, anchor: `s${k}` });
  }
  return { sections, objectUrls: [...resources.values()] };
}
