import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    { error: "Use the durable attempt completion endpoint.", code: "ATTEMPT_NOT_ACTIVE" },
    { status: 410 },
  );
}

