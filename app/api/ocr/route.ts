import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const image = formData.get("image") as File;

    if (!image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    // In a real application, we would send this to Z.AI.
    // For now, if Z_AI_MOCK=true, we return simulated OCR text.
    const isMock = process.env.Z_AI_MOCK === "true";

    if (isMock) {
      // Simulate network delay for OCR processing
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return NextResponse.json({
        text: "The main argument presented by the author revolves around the impact of artificial intelligence on modern education. While some argue that AI will replace teachers, the author posits that it will instead serve as a powerful tool to augment teaching methodologies. By automating administrative tasks, educators can focus more on personalized student engagement. Furthermore, AI-driven analytics can identify learning gaps faster than traditional testing.",
      });
    } else {
      // Real Z.AI Integration (Placeholder)
      // const apiKey = process.env.Z_AI_API_KEY;
      // const response = await fetch("https://api.z.ai/v1/ocr", { ... });
      // ...
      return NextResponse.json({
        error: "Real OCR not implemented yet.",
      }, { status: 501 });
    }
  } catch (error: any) {
    console.error("OCR API Error:", error);
    return NextResponse.json(
      { error: "Failed to process image" },
      { status: 500 }
    );
  }
}
