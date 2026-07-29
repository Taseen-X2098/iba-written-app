import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

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

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
    if (!allowedTypes.includes(image.type)) {
      return NextResponse.json({ error: "Unsupported image type. Use JPEG, PNG, WebP, or GIF." }, { status: 400 });
    }

    // Limit file size to 10MB
    const MAX_SIZE = 10 * 1024 * 1024;
    if (image.size > MAX_SIZE) {
      return NextResponse.json({ error: "Image too large. Maximum size is 10MB." }, { status: 400 });
    }

    const isMock = process.env.Z_AI_MOCK === "true";

    if (isMock) {
      // Simulate network delay for OCR processing
      await new Promise((resolve) => setTimeout(resolve, 2000));
      return NextResponse.json({
        text: "The main argument presented by the author revolves around the impact of artificial intelligence on modern education. While some argue that AI will replace teachers, the author posits that it will instead serve as a powerful tool to augment teaching methodologies. By automating administrative tasks, educators can focus more on personalized student engagement. Furthermore, AI-driven analytics can identify learning gaps faster than traditional testing.",
      });
    }

    // ─── Real OCR via OpenAI Vision ──────────────────────────────────────
    // Uses GPT-5.6-luna (cheapest & fastest) to extract handwritten text.
    // If you get a Z.AI API key later, swap this block for a direct fetch
    // to their endpoint. The response shape stays the same: { text: string }.

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: "OCR service not configured. Set OPENAI_API_KEY or enable Z_AI_MOCK." },
        { status: 503 }
      );
    }

    // Convert image to base64 data URL
    const arrayBuffer = await image.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    const dataUrl = `data:${image.type};base64,${base64}`;

    const openai = new OpenAI({ apiKey });

    const response = await openai.responses.create({
      model: "gpt-5.2",
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: "Extract all handwritten text from this image. Return ONLY the extracted text, preserving paragraph breaks. Do not add any commentary, headings, labels, or formatting — just the raw text as written.",
            },
            {
              type: "input_image",
              image_url: dataUrl,
            },
          ],
        },
      ],
    } as any);

    const extractedText = response.output_text?.trim();

    if (!extractedText) {
      return NextResponse.json(
        { error: "Could not extract text from the image. Please try a clearer photo." },
        { status: 422 }
      );
    }

    return NextResponse.json({ text: extractedText });

  } catch (error: any) {
    console.error("OCR API Error:", error);

    // Surface helpful messages for common OpenAI errors
    if (error?.status === 401) {
      return NextResponse.json({ error: "Invalid API key for OCR service." }, { status: 503 });
    }
    if (error?.status === 429) {
      return NextResponse.json({ error: "OCR rate limit reached. Please wait a moment and try again." }, { status: 429 });
    }

    return NextResponse.json(
      { error: "Failed to process image" },
      { status: 500 }
    );
  }
}
