import { z } from "zod";

import { ApiError } from "@/lib/api/api-error";
import { parseJsonRequest, parseRequestValue } from "@/lib/api/request";

const schema = z.object({ id: z.string().uuid(), count: z.number().int().min(1) });
const validBody = {
  id: "10000000-0000-4000-8000-000000000001",
  count: 2,
};

function request(body: string, contentType = "application/json") {
  return new Request("https://example.test/api/test", {
    method: "POST",
    headers: { "content-type": contentType },
    body,
  });
}

describe("API request parsing", () => {
  it("returns schema-validated JSON", async () => {
    await expect(parseJsonRequest(request(JSON.stringify(validBody)), schema)).resolves.toEqual(validBody);
  });

  it("rejects non-JSON content before parsing", async () => {
    await expect(parseJsonRequest(request(JSON.stringify(validBody), "text/plain"), schema)).rejects.toMatchObject({
      status: 415,
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects malformed JSON as a client error", async () => {
    await expect(parseJsonRequest(request("{"), schema)).rejects.toMatchObject({
      status: 400,
      code: "VALIDATION_ERROR",
    });
  });

  it("rejects bodies over the route limit", async () => {
    await expect(parseJsonRequest(request(JSON.stringify(validBody)), schema, { maxBytes: 10 })).rejects.toMatchObject({
      status: 413,
      code: "VALIDATION_ERROR",
    });
  });

  it("reports schema failures without passing unchecked values through", () => {
    expect(() => parseRequestValue(schema, { id: "not-a-uuid", count: 0 })).toThrow(ApiError);
  });
});
