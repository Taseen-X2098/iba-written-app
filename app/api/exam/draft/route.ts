import { NextResponse } from "next/server";

export async function POST(_request: Request) {
  return NextResponse.json(
    {
      error: "This draft endpoint has been replaced by the authenticated batch-attempt endpoint.",
      code: "ATTEMPT_NOT_ACTIVE",
    },
    { status: 410 },
  );
}
