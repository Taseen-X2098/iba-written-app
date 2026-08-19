import { webcrypto } from "node:crypto";

import {
  clearEncryptedRecovery,
  loadEncryptedRecovery,
  saveEncryptedRecovery,
} from "./recovery-client";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

describe("encrypted answer recovery", () => {
  beforeAll(() => {
    Object.defineProperty(globalThis, "crypto", {
      configurable: true,
      value: webcrypto,
    });
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
    Object.defineProperty(globalThis, "sessionStorage", {
      configurable: true,
      value: new MemoryStorage(),
    });
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("restores answer text after a refresh without storing it as plaintext", async () => {
    const recoveryId = "standalone:question-1";
    const answers = {
      "question-1": {
        ocrText: "Original OCR text",
        editedText: "Corrected OCR text",
      },
    };

    await saveEncryptedRecovery(recoveryId, answers);

    expect(localStorage.length).toBe(1);
    expect(sessionStorage.length).toBe(1);
    expect(localStorage.getItem(localStorage.key(0)!)).not.toContain("Corrected OCR text");
    await expect(loadEncryptedRecovery(recoveryId)).resolves.toEqual(answers);

    clearEncryptedRecovery(recoveryId);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
