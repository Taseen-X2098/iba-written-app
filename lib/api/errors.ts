import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "VALIDATION_ERROR"
  | "EXAM_NOT_FOUND"
  | "EXAM_NOT_AVAILABLE"
  | "PLAN_REQUIRED"
  | "ATTEMPT_ACTIVE"
  | "ATTEMPT_EXPIRED"
  | "ATTEMPT_NOT_ACTIVE"
  | "ATTEMPT_ALREADY_COMPLETED"
  | "WRITER_REVOKED"
  | "INSUFFICIENT_SLOTS"
  | "GRADING_INCOMPLETE"
  | "RESULTS_EMBARGOED"
  | "INTERNAL_ERROR";

export class ApiError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiErrorResponse(error: unknown) {
  if (error instanceof ApiError) {
    return NextResponse.json(
      { error: error.message, code: error.code, details: error.details },
      { status: error.status },
    );
  }

  console.error(error);
  return NextResponse.json(
    { error: "An unexpected error occurred", code: "INTERNAL_ERROR" },
    { status: 500 },
  );
}

