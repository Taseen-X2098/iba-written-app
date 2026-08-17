import { NextResponse } from "next/server";

export async function POST(_request?: Request) {
  return NextResponse.json(
    {
      error: "This submission endpoint has been replaced by attempt completion.",
      code: "ATTEMPT_NOT_ACTIVE",
    },
    { status: 410 },
  );
}
