interface ZaiLayoutParsingResponse {
  md_results?: string;
  request_id?: string;
  code?: number;
  message?: string;
}

export class ZaiOcrError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ZaiOcrError";
  }
}

export async function extractTextWithZai(input: {
  apiKey: string;
  dataUrl: string;
  requestId: string;
  providerUserId: string;
  fetchImpl?: typeof fetch;
}): Promise<string> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const response = await fetchImpl("https://api.z.ai/api/paas/v4/layout_parsing", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      "Content-Type": "application/json",
      "Accept-Language": "en-US,en",
    },
    body: JSON.stringify({
      model: "glm-ocr",
      file: input.dataUrl,
      return_crop_images: false,
      need_layout_visualization: false,
      request_id: input.requestId,
      user_id: input.providerUserId,
    }),
  });

  let payload: ZaiLayoutParsingResponse = {};
  try {
    payload = await response.json() as ZaiLayoutParsingResponse;
  } catch {
    // Preserve the HTTP status below even if an upstream proxy returns HTML.
  }

  if (!response.ok) {
    throw new ZaiOcrError(
      payload.message || `Z.ai OCR request failed with HTTP ${response.status}.`,
      response.status,
    );
  }

  const text = payload.md_results?.trim();
  if (!text) {
    throw new ZaiOcrError(
      "Z.ai could not extract text from this image. Please try a clearer photo.",
      422,
    );
  }

  return text;
}
