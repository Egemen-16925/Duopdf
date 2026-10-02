import JSZip from "jszip";

export async function openZip(bytes: Uint8Array): Promise<JSZip> {
  try {
    return await JSZip.loadAsync(bytes);
  } catch {
    throw new Error("Dosya açılamadı: bozuk ya da beklenen biçimde değil.");
  }
}

export async function readXml(zip: JSZip, path: string, type: DOMParserSupportedType = "application/xml"): Promise<Document | null> {
  const file = zip.file(path);
  if (!file) return null;
  const doc = new DOMParser().parseFromString(await file.async("string"), type);
  return doc.getElementsByTagName("parsererror").length > 0 ? null : doc;
}

/** "a/b/c.xhtml" içindeki "../img/x.png" gibi göreli yolları zip kökünden mutlak yola çevirir. */
export function resolvePath(fromFile: string, relative: string): string {
  const clean = decodeURIComponent(relative.split("#")[0]);
  const parts = fromFile.split("/").slice(0, -1);
  for (const seg of clean.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg !== "." && seg !== "") parts.push(seg);
  }
  return parts.join("/");
}
