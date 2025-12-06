import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "fs";
import os from "os";
import path from "path";
import { slugify, uniquePath } from "./index";

describe("slugify", () => {
  it("slugifies and lowercases titles", () => {
    expect(slugify("Hello World!")).toBe("hello_world");
  });

  it("falls back to chatgpt_conversation when empty", () => {
    expect(slugify("!!!")).toBe("chatgpt_conversation");
  });

  it("handles emoji and trims underscores", () => {
    expect(slugify("  🚀 Rocket  Plan ")).toBe("rocket_plan");
  });

  it("appends suffix for reserved names", () => {
    expect(slugify("CON")).toBe("con_chatgpt");
  });

  it("truncates very long titles", () => {
    const long = "a".repeat(200);
    expect(slugify(long)).toHaveLength(120);
  });
});

describe("uniquePath", () => {
  it("returns a non-conflicting path by incrementing suffixes", () => {
    const tmp = mkdtempSync(path.join(os.tmpdir(), "csctm-slug-"));
    const first = path.join(tmp, "file.md");
    writeFileSync(first, "one", "utf8");
    const second = uniquePath(first);
    expect(second.endsWith("_2.md")).toBe(true);
    writeFileSync(second, "two", "utf8");
    const third = uniquePath(first);
    expect(third.endsWith("_3.md")).toBe(true);
  });
});

