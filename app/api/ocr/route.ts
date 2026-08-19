import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { ApiError, apiErrorResponse } from "@/lib/api/errors";
import { requireApiUser } from "@/lib/auth";
import { getAvailableTestSlots } from "@/lib/exams/attempts";
import { resolveOcrContext } from "@/lib/ocr/context";
import {
  enforceOcrDailyProviderLimit,
  enforceOcrRateLimit,
} from "@/lib/ocr/rate-limit";
import { completeOcrRequest, reserveOcrRequest } from "@/lib/ocr/usage";
import { extractTextWithZai, ZaiOcrError } from "@/lib/ocr/zai";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);
const OCR_CACHE_VERSION = "v1";
const MOCK_OCR_TEXT =
  "The quick brown fox jumps over the lazy dog. This is sample OCR text extracted from the uploaded image.";

export async function POST(request: Request) {
  try {
    const user = await requireApiUser();
    const availableSlots = await getAvailableTestSlots(user.id);

    if (availableSlots < 1) {
      throw new ApiError(
        "INSUFFICIENT_SLOTS",
        "OCR is available only while you have at least one test slot remaining.",
        403,
      );
    }

    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      throw new ApiError("VALIDATION_ERROR", "No image file was uploaded.", 400);
    }

    if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Unsupported image type. Upload a JPEG or PNG image.",
        415,
      );
    }

    if (image.size < 1 || image.size > MAX_FILE_SIZE_BYTES) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "The image must be between 1 byte and 10 MB.",
        413,
      );
    }

    const isMock = process.env.Z_AI_MOCK === "true";
    const apiKey = process.env.Z_AI_API_KEY?.trim();

    if (!isMock && !apiKey) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Z.ai OCR is not configured. Set Z_AI_API_KEY or enable Z_AI_MOCK.",
        503,
      );
    }

    const context = await resolveOcrContext(formData, user.id);
    await enforceOcrRateLimit(user.id);

    const imageBytes = Buffer.from(await image.arrayBuffer());
    const imageSha256 = createHash("sha256").update(imageBytes).digest("hex");
    const reservationToken = randomUUID();
    // A mock response must never satisfy a later real-provider request for the
    // same image. Keep processor identity in the cache namespace so changing
    // modes or OCR models cannot replay output produced by a different path.
    const processorCacheKey = isMock
      ? `mock:${OCR_CACHE_VERSION}`
      : `zai:glm-ocr:${OCR_CACHE_VERSION}`;

    const reservation = await reserveOcrRequest({
      userId: user.id,
      ...context,
      contextKey: `${context.contextKey}:processor:${processorCacheKey}`,
      imageSha256,
      requestToken: reservationToken,
    });
    if (reservation.status === "succeeded" && reservation.extracted_text) {
      return NextResponse.json({ text: reservation.extracted_text, cached: true });
    }

    if (reservation.request_token !== reservationToken) {
      throw new ApiError(
        "CONFLICT",
        "This image is already being processed. Please try again shortly.",
        409,
      );
    }

    let text: string;

    try {
      await enforceOcrDailyProviderLimit(user.id);
      if (isMock) {
        await new Promise((resolve) => setTimeout(resolve, 200));
        text = MOCK_OCR_TEXT;
      } else {
        const providerUserId = `user_${createHash("sha256")
          .update(user.id)
          .digest("hex")
          .slice(0, 32)}`;
        const dataUrl = `data:${image.type};base64,${imageBytes.toString("base64")}`;

        text = await extractTextWithZai({
          apiKey: apiKey!,
          dataUrl,
          requestId: reservation.id,
          providerUserId,
        });
      }
    } catch (error) {
      await completeOcrRequest({
        requestId: reservation.id,
        userId: user.id,
        requestToken: reservationToken,
        success: false,
      }).catch(() => undefined);
      throw error;
    }

    await completeOcrRequest({
      requestId: reservation.id,
      userId: user.id,
      requestToken: reservationToken,
      success: true,
      extractedText: text,
    });

    return NextResponse.json({ text, cached: false });
  } catch (error) {
    if (error instanceof ApiError) {
      return apiErrorResponse(error);
    }

    if (error instanceof ZaiOcrError) {
      if (error.status === 401 || error.status === 403) {
        return apiErrorResponse(
          new ApiError(
            "SERVICE_UNAVAILABLE",
            "Z.ai rejected the configured API key.",
            503,
          ),
        );
      }

      if (error.status === 429) {
        return apiErrorResponse(
          new ApiError("RATE_LIMITED", "Z.ai is temporarily rate limited.", 429),
        );
      }

      if (error.status === 422) {
        return apiErrorResponse(
          new ApiError(
            "VALIDATION_ERROR",
            "Z.ai could not extract readable text from this image.",
            422,
          ),
        );
      }

      return apiErrorResponse(
        new ApiError("INTERNAL_ERROR", "Z.ai OCR is temporarily unavailable.", 502),
      );
    }

    console.error("OCR error:", error);
    return apiErrorResponse(
      new ApiError("INTERNAL_ERROR", "Failed to extract text from the image.", 500),
    );
  }
}
