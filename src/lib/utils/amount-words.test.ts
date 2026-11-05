import { describe, expect, it } from "vitest";
import { amountInWords, integerInIndianWords } from "./amount-words";

describe("amountInWords", () => {
  it.each([
    [0, "Rupees Zero Only"],
    [100, "Rupees One Only"],
    [5_000_000, "Rupees Fifty Thousand Only"],
    [5_000_050, "Rupees Fifty Thousand and Fifty Paise Only"],
    [11_800_000, "Rupees One Lakh Eighteen Thousand Only"],
    [1_234_567_89, "Rupees Twelve Lakh Thirty Four Thousand Five Hundred Sixty Seven and Eighty Nine Paise Only"],
    [25_00_00_000_00, "Rupees Twenty Five Crore Only"],
  ])("%i paise", (paise, words) => {
    expect(amountInWords(paise)).toBe(words);
  });

  it("handles large crore values", () => {
    expect(integerInIndianWords(1_05_00_00_000)).toBe("One Hundred Five Crore");
  });
});
