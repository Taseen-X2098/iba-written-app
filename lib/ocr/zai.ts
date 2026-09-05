interface ZaiLayoutParsingResponse {
  md_results?: string;
  request_id?: string;
  code?: number;
  message?: string;
}

const BLOCK_HTML_TAG = /<\/?(?:address|article|aside|blockquote|div|dl|fieldset|figcaption|figure|footer|form|h[1-6]|header|hr|main|nav|ol|p|pre|section|table|tbody|tfoot|thead|tr|ul)\b[^>]*>/gimu;
const BREAK_HTML_TAG = /<br\b[^>]*\/?\s*>/gimu;
const CELL_HTML_TAG = /<\/?(?:td|th)\b[^>]*>/gimu;
const LIST_ITEM_OPEN_TAG = /<li\b[^>]*>/gimu;
const REMAINING_HTML = /<!--[^]*?-->|<![^>]*>|<\/?[a-z][^>]*>/gimu;

function stripHtmlLayout(value: string) {
  return value
    .replace(BREAK_HTML_TAG, "\n")
    .replace(CELL_HTML_TAG, "\t")
    .replace(LIST_ITEM_OPEN_TAG, "\n- ")
    .replace(BLOCK_HTML_TAG, "\n")
    .replace(REMAINING_HTML, "");
}

function decodeHtmlEntities(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };

  return value.replace(/&(#(?:x[0-9a-f]+|\d+)|[a-z]+);/gimu, (entity, body: string) => {
    if (body[0] !== "#") return named[body.toLowerCase()] ?? entity;
    const hexadecimal = body[1]?.toLowerCase() === "x";
    const codePoint = Number.parseInt(body.slice(hexadecimal ? 2 : 1), hexadecimal ? 16 : 10);
    if (!Number.isInteger(codePoint) || codePoint < 0 || codePoint > 0x10ffff) return entity;
    try {
      return String.fromCodePoint(codePoint);
    } catch {
      return entity;
    }
  });
}

// GLM-OCR returns layout-aware Markdown and sometimes raw/escaped HTML. The
// answer editor is a plain-text boundary: preserve recognized words and line
// structure, but never let provider markup reach storage or the browser.
export function normalizeZaiOcrMarkdown(markdown: string) {
  let plainText = markdown
    .replace(/\\(?=<\/?[a-z!])/gimu, "");
  plainText = stripHtmlLayout(plainText);

  // Decode after stripping once, then strip again so encoded tags cannot
  // become markup in the normalized result.
  plainText = stripHtmlLayout(decodeHtmlEntities(plainText));

  return plainText
    .replace(/^\s{0,3}#{1,6}[\t ]+/gmu, "")
    .replace(/[\t ]+\n/g, "\n")
    .replace(/\n[\t ]+/g, "\n")
    .replace(/[\t ]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

  const text = payload.md_results
    ? normalizeZaiOcrMarkdown(payload.md_results)
    : "";
  if (!text) {
    throw new ZaiOcrError(
      "Z.ai could not extract text from this image. Please try a clearer photo.",
      422,
    );
  }

  return text;
}
