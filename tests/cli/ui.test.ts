import { describe, expect, test } from "bun:test";
import { color, formatSummary, formatTableRow, formatTableSeparator, ui } from "../../src/cli/ui";

describe("CLI UI utilities", () => {
  describe("ui object", () => {
    test("has all required methods", () => {
      expect(typeof ui.intro).toBe("function");
      expect(typeof ui.outro).toBe("function");
      expect(typeof ui.cancel).toBe("function");
      expect(typeof ui.info).toBe("function");
      expect(typeof ui.success).toBe("function");
      expect(typeof ui.warn).toBe("function");
      expect(typeof ui.error).toBe("function");
      expect(typeof ui.step).toBe("function");
      expect(typeof ui.message).toBe("function");
      expect(typeof ui.confirm).toBe("function");
      expect(typeof ui.select).toBe("function");
      expect(typeof ui.text).toBe("function");
      expect(typeof ui.multiselect).toBe("function");
      expect(typeof ui.spinner).toBe("function");
      expect(typeof ui.isCancel).toBe("function");
      expect(typeof ui.note).toBe("function");
    });
  });

  describe("color", () => {
    test("exports picocolors functions", () => {
      expect(typeof color.bold).toBe("function");
      expect(typeof color.dim).toBe("function");
      expect(typeof color.red).toBe("function");
      expect(typeof color.green).toBe("function");
      expect(typeof color.cyan).toBe("function");
      expect(typeof color.yellow).toBe("function");
    });

    test("applies color formatting", () => {
      // Colors add ANSI escape codes
      const bold = color.bold("test");
      const dim = color.dim("test");
      expect(bold).toContain("test");
      expect(dim).toContain("test");
    });
  });

  describe("formatSummary", () => {
    test("formats simple key-value pairs", () => {
      const result = formatSummary([
        { label: "Name", value: "test" },
        { label: "Count", value: 42 },
      ]);
      expect(result).toContain("Name");
      expect(result).toContain("test");
      expect(result).toContain("Count");
      expect(result).toContain("42");
    });

    test("aligns labels to max length", () => {
      const result = formatSummary([
        { label: "Short", value: "a" },
        { label: "Much Longer Label", value: "b" },
      ]);
      // Both labels should be in the output with proper spacing
      expect(result).toContain("Short");
      expect(result).toContain("Much Longer Label");
    });

    test("filters out null values", () => {
      const result = formatSummary([
        { label: "Present", value: "yes" },
        { label: "Missing", value: null },
      ]);
      expect(result).toContain("Present");
      expect(result).not.toContain("Missing");
    });

    test("filters out undefined values", () => {
      const result = formatSummary([
        { label: "Present", value: "yes" },
        { label: "Undefined", value: undefined },
      ]);
      expect(result).toContain("Present");
      expect(result).not.toContain("Undefined");
    });

    test("handles empty array", () => {
      const result = formatSummary([]);
      expect(result).toBe("");
    });

    test("handles all filtered values", () => {
      const result = formatSummary([
        { label: "A", value: null },
        { label: "B", value: undefined },
      ]);
      expect(result).toBe("");
    });

    test("joins multiple items with newlines", () => {
      const result = formatSummary([
        { label: "One", value: "1" },
        { label: "Two", value: "2" },
        { label: "Three", value: "3" },
      ]);
      const lines = result.split("\n");
      expect(lines.length).toBe(3);
    });

    test("handles numeric values", () => {
      const result = formatSummary([
        { label: "Zero", value: 0 },
        { label: "Negative", value: -5 },
        { label: "Float", value: 3.14 },
      ]);
      expect(result).toContain("0");
      expect(result).toContain("-5");
      expect(result).toContain("3.14");
    });
  });

  describe("formatTableRow", () => {
    test("formats columns with specified widths", () => {
      const result = formatTableRow(["Col1", "Col2", "Col3"], [10, 10, 10]);
      expect(result).toContain("Col1");
      expect(result).toContain("Col2");
      expect(result).toContain("Col3");
    });

    test("pads columns to specified width", () => {
      const result = formatTableRow(["A", "B"], [5, 5]);
      // The content 'A' should be padded to width 5
      expect(result).toContain("A    ");
    });

    test("handles empty columns", () => {
      const result = formatTableRow(["", "Value", ""], [5, 10, 5]);
      expect(result).toContain("Value");
    });

    test("handles long values", () => {
      const result = formatTableRow(["VeryLongValue", "Short"], [5, 10]);
      // Long value will overflow, but function should not error
      expect(result).toContain("VeryLongValue");
    });

    test("includes separator between columns", () => {
      const result = formatTableRow(["A", "B"], [5, 5]);
      // Should have vertical bar separator (possibly with ANSI codes)
      expect(result).toContain("│");
    });
  });

  describe("formatTableSeparator", () => {
    test("creates separator line with correct total width", () => {
      const result = formatTableSeparator([10, 10, 10]);
      // Should contain horizontal lines
      expect(result).toContain("─");
    });

    test("includes column separators", () => {
      const result = formatTableSeparator([10, 10]);
      // Should have cross/intersection character
      expect(result).toContain("┼");
    });

    test("handles single column", () => {
      const result = formatTableSeparator([20]);
      expect(result).toContain("─");
      // No intersection for single column
      expect(result).not.toContain("┼");
    });

    test("handles empty widths array", () => {
      const result = formatTableSeparator([]);
      expect(result).toBe(color.dim(""));
    });
  });
});
