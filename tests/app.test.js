/** @jest-environment jsdom */
const {
  congestionColor,
  localFallbackDirections,
  localFallbackWait,
  FLOOD_THRESHOLD,
} = require("../public/app.js");

describe("Stadium Navigator Core Logic", () => {
  describe("Congestion Analytics", () => {
    test("Should return red for flooded gates", () => {
      expect(congestionColor(90)).toBe("var(--red)");
      expect(congestionColor(FLOOD_THRESHOLD)).toBe("var(--red)");
    });

    test("Should return gold for moderately busy gates", () => {
      expect(congestionColor(65)).toBe("var(--gold)");
      expect(congestionColor(75)).toBe("var(--gold)");
    });

    test("Should return green for clear gates", () => {
      expect(congestionColor(10)).toBe("var(--green)");
      expect(congestionColor(59)).toBe("var(--green)");
    });
  });

  describe("Generative AI Fallback Engine", () => {
    const mockGate = { label: "Gate A" };

    test("Should generate step-free mobility directions", () => {
      const directions = localFallbackDirections(mockGate, true, "en");
      expect(directions).toContain("Step-free ramp access is available");
      expect(directions).toContain("Gate A");
    });

    test("Should generate standard directions", () => {
      const directions = localFallbackDirections(mockGate, false, "en");
      expect(directions).toContain("Follow the green exit signs");
    });

    test("Should generate localized wait times (Spanish)", () => {
      const waitMsg = localFallbackWait(95, "es");
      expect(waitMsg).toContain("95%");
      expect(waitMsg).toContain("Todas las salidas están al límite");
    });
  });
});
