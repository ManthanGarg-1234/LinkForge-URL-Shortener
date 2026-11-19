
import { describe, expect, it } from "vitest";
import { generateShortCode } from "../utils/short-code.utils.js";

describe("Short code generator", () => {
  it("generates an 8-character code", () => {
    const code = generateShortCode();

    expect(code).toHaveLength(8);
  });

  it("uses only Base62 characters", () => {
    const code = generateShortCode();

    expect(code).toMatch(/^[0-9A-Za-z]{8}$/);
  });

  it("generates different codes across repeated calls", () => {
    const codes = new Set(
      Array.from({ length: 1000 }, () => generateShortCode()),
    );

    expect(codes.size).toBeGreaterThan(990);
  });
});
