import { z } from "zod";

import { ApiError } from "@/lib/api/api-error";

const DEFAULT_MAX_JSON_BYTES = 1_000_000;

export function parseRequestValue<T>(
  schema: z.ZodType<T>,
  value: unknown,
  message = "Invalid request",
): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new ApiError(
      "VALIDATION_ERROR",
      message,
      400,
      parsed.error.flatten(),
    );
  }
  return parsed.data;
}

export async function parseJsonRequest<T>(
  request: Request,
  schema: z.ZodType<T>,
  options?: { maxBytes?: number; message?: string },
): Promise<T> {
  const maxBytes = options?.maxBytes ?? DEFAULT_MAX_JSON_BYTES;
  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    throw new ApiError(
      "VALIDATION_ERROR",
      "Content-Type must be application/json",
      415,
    );
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
    throw new ApiError("VALIDATION_ERROR", "Request body is too large", 413);
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > maxBytes) {
    throw new ApiError("VALIDATION_ERROR", "Request body is too large", 413);
  }

  let value: unknown;
  try {
    value = JSON.parse(rawBody);
  } catch {
    throw new ApiError("VALIDATION_ERROR", "Request body must be valid JSON", 400);
  }

  return parseRequestValue(
    schema,
    value,
    options?.message ?? "Invalid request body",
  );
}
