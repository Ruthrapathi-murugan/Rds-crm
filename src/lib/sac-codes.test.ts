import { describe, expect, it } from "vitest";
import { customSacOption, SAC_CODES, SAC_OPTIONS, SAC_PATTERN } from "./sac-codes";

describe("SAC code picker", () => {
  it("lists unique, valid codes", () => {
    const codes = SAC_CODES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    for (const code of codes) expect(code).toMatch(SAC_PATTERN);
    expect(SAC_OPTIONS.find((o) => o.value === "998314")?.description).toMatch(/IT design and development/);
  });

  it("offers a typed 4–8 digit code that is not in the list", () => {
    expect(customSacOption(" 998323 ")).toMatchObject({ value: "998323", label: "998323" });
    expect(customSacOption("9954")).toMatchObject({ value: "9954" });
  });

  it("ignores text that is not a code", () => {
    expect(customSacOption("")).toBeNull();
    expect(customSacOption("web")).toBeNull();
    expect(customSacOption("123")).toBeNull();
    expect(customSacOption("123456789")).toBeNull();
  });
});
