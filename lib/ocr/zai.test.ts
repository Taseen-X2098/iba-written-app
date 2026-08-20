import { extractTextWithZai, ZaiOcrError } from "./zai";

describe("Z.ai OCR client", () => {
  it("calls GLM-OCR with the single API key as a bearer token", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ md_results: "  Extracted answer\n  " }),
    });

    await expect(extractTextWithZai({
      apiKey: "zai-test-key",
      dataUrl: "data:image/png;base64,YW5zd2Vy",
      requestId: "request-1",
      providerUserId: "user-anonymous-hash",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).resolves.toBe("Extracted answer");

    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.z.ai/api/paas/v4/layout_parsing",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer zai-test-key",
        }),
      }),
    );
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body).toEqual(expect.objectContaining({
      model: "glm-ocr",
      file: "data:image/png;base64,YW5zd2Vy",
      request_id: "request-1",
      user_id: "user-anonymous-hash",
    }));
  });

  it("preserves the provider status when Z.ai rejects the request", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ message: "Invalid API key" }),
    });

    await expect(extractTextWithZai({
      apiKey: "bad-key",
      dataUrl: "data:image/png;base64,YQ==",
      requestId: "request-2",
      providerUserId: "user-hash",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toEqual(expect.objectContaining<Partial<ZaiOcrError>>({
      message: "Invalid API key",
      status: 401,
    }));
  });

  it("rejects an empty OCR result", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ md_results: "   " }),
    });

    await expect(extractTextWithZai({
      apiKey: "zai-test-key",
      dataUrl: "data:image/png;base64,YQ==",
      requestId: "request-3",
      providerUserId: "user-hash",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).rejects.toEqual(expect.objectContaining<Partial<ZaiOcrError>>({ status: 422 }));
  });

  it("converts a centered Markdown heading to plain text without losing the title", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        md_results: '<div align="center">\n\n# The Assistant\n\n</div>\n\nThe candidate answer.',
      }),
    });

    await expect(extractTextWithZai({
      apiKey: "zai-test-key",
      dataUrl: "data:image/png;base64,YQ==",
      requestId: "request-4",
      providerUserId: "user-hash",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).resolves.toBe("The Assistant\n\nThe candidate answer.");
  });

  it("preserves legitimate prose that mentions an assistant", async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ md_results: "The assistant manager approved the proposal." }),
    });

    await expect(extractTextWithZai({
      apiKey: "zai-test-key",
      dataUrl: "data:image/png;base64,YQ==",
      requestId: "request-5",
      providerUserId: "user-hash",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    })).resolves.toBe("The assistant manager approved the proposal.");
  });
});
