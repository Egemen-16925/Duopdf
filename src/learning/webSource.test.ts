import { describe, expect, it } from "vitest";
import { webSource } from "./webSource";

describe("webSource", () => {
  it("başlığı ve site adını gösterir, adresi açılabilir verir", () => {
    expect(webSource("https://www.example.com/article?id=1", "Example article")).toEqual({
      label: "Example article · example.com",
      href: "https://www.example.com/article?id=1",
    });
  });

  it("başlık yoksa yalnızca site adını gösterir", () => {
    expect(webSource("http://example.com/a").label).toBe("example.com");
  });

  it("http(s) olmayan ya da bozuk adresi açılabilir saymaz", () => {
    expect(webSource("javascript:alert(1)", "Kötü").href).toBeUndefined();
    expect(webSource("file:///C:/Windows/system.ini").href).toBeUndefined();
    expect(webSource("adres değil")).toEqual({ label: "web sayfası" });
  });
});
