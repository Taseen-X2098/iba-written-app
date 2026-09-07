import { createHash, randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { ApiError, apiErrorResponse } from "@/lib/api/errors";
import { parseRequestValue } from "@/lib/api/request";
import { getWordLimitViolation } from "@/lib/answers/word-limit";
import { requireApiUser } from "@/lib/auth";
import { persistAttemptDraftUpdates } from "@/lib/exams/attempts";
import { uuidSchema } from "@/lib/exams/contracts";
import { finalizeOfficialAttempt, lockPracticeAttempt } from "@/lib/exams/finalize";
import { resolveOcrContext } from "@/lib/ocr/context";
import {
  beginExamOcrOperation,
  finishExamOcrOperation,
  requirePendingExamOcrOperation,
} from "@/lib/ocr/exam-operations";
import {
  enforceOcrDailyProviderLimit,
  enforceOcrRateLimit,
} from "@/lib/ocr/rate-limit";
import { requireOcrAccess } from "@/lib/ocr/access";
import { completeOcrRequest, reserveOcrRequest } from "@/lib/ocr/usage";
import { extractTextWithZai, normalizeZaiOcrMarkdown, ZaiOcrError } from "@/lib/ocr/zai";
import { validateAnswerImageEntries } from "@/lib/answers/image-validation";

// v3 prevents any previously cached partial HTML normalization from being
// replayed after the OCR output boundary was made strictly plain text.
const OCR_CACHE_VERSION = "v3";
const MOCK_OCR_TEXT =
  "The quick brown fox jumps over the lazy dog. This is sample OCR text extracted from the uploaded image.";

export async function POST(request: Request) {
  const requestStartedAt = Date.now();
  let examOperation: { id: string; userId: string } | null = null;
  let examOperationPending = false;
  let headerOperationId: string | null = null;

  try {
    const user = await requireApiUser();
    const rawHeaderOperationId = request.headers.get("x-exam-ocr-operation-id");
    if (rawHeaderOperationId) {
      headerOperationId = parseRequestValue(
        uuidSchema,
        rawHeaderOperationId,
        "A valid page-scan reservation is required",
      );
      // Remember the reservation before parsing the potentially large
      // multipart body. If parsing or validation fails, the catch path can
      // release this user's lease immediately instead of waiting for expiry.
      examOperation = { id: headerOperationId, userId: user.id };
      examOperationPending = true;
    }
    const formData = await request.formData();
    const rawReservedOperationId = formData.get("ocrOperationId");
    const reservedOperationId = rawReservedOperationId === null
      ? null
      : parseRequestValue(
        uuidSchema,
        rawReservedOperationId,
        "A valid page-scan reservation is required",
      );
    if (headerOperationId && headerOperationId !== reservedOperationId) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "The page-scan reservation does not match this upload",
        400,
      );
    }
    if (reservedOperationId && !examOperation) {
      examOperation = { id: reservedOperationId, userId: user.id };
      examOperationPending = true;
    }

    const context = await resolveOcrContext(formData, user.id, requestStartedAt, {
      // The reservation endpoint already proved the operation began before
      // the deadline. The image transfer and OCR may legitimately finish
      // after it without reopening post-timeout editing.
      allowReservedOperationAfterExpiry: reservedOperationId !== null,
    });
    await requireOcrAccess({ userId: user.id, attemptId: context.attemptId });

    if (
      context.attemptId
      && context.examQuestionId
      && context.writerToken
    ) {
      if (reservedOperationId) {
        await requirePendingExamOcrOperation({
          operationId: reservedOperationId,
          attemptId: context.attemptId,
          examQuestionId: context.examQuestionId,
          userId: user.id,
          writerToken: context.writerToken,
        });
      } else {
        // Compatibility for clients that loaded immediately before this
        // deployment. Current clients reserve before uploading the image.
        const operationId = randomUUID();
        await beginExamOcrOperation({
          operationId,
          attemptId: context.attemptId,
          examQuestionId: context.examQuestionId,
          userId: user.id,
          writerToken: context.writerToken,
        });
        examOperation = { id: operationId, userId: user.id };
        examOperationPending = true;
      }
    } else if (reservedOperationId) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Page-scan reservations can only be used for an active exam question",
        400,
      );
    }

    const images = await validateAnswerImageEntries(formData.getAll("image"));

    const isMock = process.env.Z_AI_MOCK === "true";
    const apiKey = process.env.Z_AI_API_KEY?.trim();

    if (!isMock && !apiKey) {
      throw new ApiError(
        "SERVICE_UNAVAILABLE",
        "Z.ai OCR is not configured. Set Z_AI_API_KEY or enable Z_AI_MOCK.",
        503,
      );
    }

    await enforceOcrRateLimit(user.id);
    // A mock response must never satisfy a later real-provider request for the
    // same image. Keep processor identity in the cache namespace so changing
    // modes or OCR models cannot replay output produced by a different path.
    const processorCacheKey = isMock
      ? `mock:${OCR_CACHE_VERSION}`
      : `zai:glm-ocr:${OCR_CACHE_VERSION}`;
    const extractedPages: string[] = [];
    let allCached = true;

    for (const image of images) {
      const imageBytes = Buffer.from(await image.arrayBuffer());
      const imageSha256 = createHash("sha256").update(imageBytes).digest("hex");
      const reservationToken = randomUUID();
      const reservation = await reserveOcrRequest({
        userId: user.id,
        ...context,
        contextKey: `${context.contextKey}:processor:${processorCacheKey}`,
        imageSha256,
        requestToken: reservationToken,
      });
      if (reservation.status === "succeeded" && reservation.extracted_text) {
        const cachedText = normalizeZaiOcrMarkdown(reservation.extracted_text);
        if (!cachedText) {
          throw new ZaiOcrError("The cached OCR result did not contain readable text.", 422);
        }
        extractedPages.push(cachedText);
        continue;
      }

      if (reservation.request_token !== reservationToken) {
        throw new ApiError(
          "CONFLICT",
          "One of these images is already being processed. Please try again shortly.",
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
        text = normalizeZaiOcrMarkdown(text);
        if (!text) {
          throw new ZaiOcrError("Z.ai could not extract readable text from this image.", 422);
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
      extractedPages.push(text);
      allCached = false;
    }

    const extractedText = normalizeZaiOcrMarkdown(extractedPages.join("\n\n"));
    let draftSaved = false;
    let completionTriggered = false;

    if (examOperation && context.attemptId && context.examQuestionId) {
      const violation = context.questionMarks === null
        ? null
        : getWordLimitViolation(extractedText, context.questionMarks);
      if (violation) {
        throw new ApiError(
          "VALIDATION_ERROR",
          `Scanned answer exceeds the ${violation.wordLimit}-word limit (${violation.wordCount} words).`,
          400,
          { examQuestionId: context.examQuestionId, ...violation },
        );
      }

      const updatedAt = new Date().toISOString();
      try {
        await persistAttemptDraftUpdates(context.attemptId, {
          [context.examQuestionId]: {
            ocrText: extractedText,
            editedText: extractedText,
            updatedAt,
          },
        });
        draftSaved = true;
      } catch (error) {
        // Postgres still stores the successful OCR result below and the
        // finalization function can snapshot it directly, so a cache outage
        // cannot turn this recognized answer into a blank submission.
        console.error("Failed to mirror OCR result to the attempt draft cache:", error);
      }

      await finishExamOcrOperation({
        operationId: examOperation.id,
        userId: examOperation.userId,
        success: true,
        extractedText,
      });
      examOperationPending = false;
      // The operation row is a durable, finalizer-readable copy even when the
      // Redis mirror was temporarily unavailable.
      draftSaved = true;

      if (
        context.attemptExpiresAt
        && context.attemptMode
        && Date.now() >= new Date(context.attemptExpiresAt).getTime()
      ) {
        try {
          if (context.attemptMode === "official") {
            await finalizeOfficialAttempt({ attemptId: context.attemptId });
          } else if (context.writerToken) {
            await lockPracticeAttempt({
              attemptId: context.attemptId,
              userId: user.id,
              writerToken: context.writerToken,
            });
          }
          completionTriggered = true;
          draftSaved = true;
        } catch (error) {
          // Another image from the same attempt may still be running. Its
          // request becomes the finalizer when it is the last operation to
          // finish; the client also retries the idempotent completion call.
          if (!(error instanceof ApiError && error.code === "OCR_PENDING")) {
            console.error("OCR finished but automatic attempt completion failed:", error);
          }
        }
      }
    }

    return NextResponse.json({
      text: extractedText,
      cached: allCached,
      ...(context.attemptId ? { draftSaved, completionTriggered } : {}),
    });
  } catch (error) {
    if (examOperation && examOperationPending) {
      await finishExamOcrOperation({
        operationId: examOperation.id,
        userId: examOperation.userId,
        success: false,
      }).catch(() => undefined);
    }

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
