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
  | "OCR_LIMIT_REACHED"
  | "RATE_LIMITED"
  | "CONFLICT"
  | "SERVICE_UNAVAILABLE"
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
