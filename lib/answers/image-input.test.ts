/**
 * @jest-environment jsdom
 */

import { consumeSelectedFiles } from "./image-input";

it("snapshots selected files before clearing the live file input", () => {
  const selected = [new File(["page"], "page.jpg", { type: "image/jpeg" })];
  let liveFiles = selected;
  const input = {
    get files() {
      return liveFiles as unknown as FileList;
    },
    get value() {
      return liveFiles.length ? "C:\\fakepath\\page.jpg" : "";
    },
    set value(next: string) {
      if (next === "") liveFiles = [];
    },
  };

  const consumed = consumeSelectedFiles(input);

  expect(consumed).toEqual(selected);
  expect(input.files).toHaveLength(0);
  expect(input.value).toBe("");
});
