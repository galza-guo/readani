import { describe, expect, test } from "bun:test";
import { getErrorMessage } from "./errorMessage";

describe("error message", () => {
  test("reads Error instances", () => {
    expect(getErrorMessage(new Error("cache failed"))).toBe("cache failed");
  });

  test("keeps string errors", () => {
    expect(getErrorMessage("plain failure")).toBe("plain failure");
  });

  test("serializes object errors", () => {
    expect(getErrorMessage({ message: "oops", code: 500 })).toContain("\"code\":500");
  });
});
