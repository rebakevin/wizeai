import { describe, expect, test } from "bun:test";
import { chunkForWhatsapp } from "./messageFormat";

describe("chunkForWhatsapp", () => {
  test("returns the whole text as one chunk when under the limit", () => {
    expect(chunkForWhatsapp("hello world")).toEqual(["hello world"]);
  });

  test("never cuts mid-word", () => {
    const text = "word ".repeat(2000).trim();
    const chunks = chunkForWhatsapp(text, 50);
    for (const chunk of chunks) {
      expect(chunk.endsWith("word")).toBe(true);
    }
  });

  test("prefers a paragraph break over a mid-sentence cut", () => {
    const first = "First paragraph.".padEnd(40, " x").trim();
    const second = "Second paragraph.".padEnd(40, " y").trim();
    const text = `${first}\n\n${second}`;
    const chunks = chunkForWhatsapp(text, first.length + 5);
    expect(chunks[0]).toBe(first);
    expect(chunks[1]).toBe(second);
  });

  test("terminates on input with no whitespace", () => {
    const text = "a".repeat(10000);
    const chunks = chunkForWhatsapp(text, 3900);
    expect(chunks.length).toBe(3);
    expect(chunks.join("")).toBe(text);
  });
});
