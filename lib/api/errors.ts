import { NextResponse } from "next/server";
import { ApiError } from "@/lib/api/api-error";

export { ApiError, type ApiErrorCode } from "@/lib/api/api-error";

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
