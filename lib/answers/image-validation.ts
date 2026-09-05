import { ApiError } from "@/lib/api/errors";
import { getPageLimitViolation } from "@/lib/answers/page-limit";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Set(["image/jpeg", "image/png"]);

async function hasValidImageSignature(image: File) {
  const bytes = new Uint8Array(await image.slice(0, 8).arrayBuffer());
  if (image.type === "image/png") {
    const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    return pngSignature.every((byte, index) => bytes[index] === byte);
  }
  if (image.type === "image/jpeg") {
    return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  return false;
}

export async function validateAnswerImageEntries(entries: FormDataEntryValue[]) {
  if (entries.length === 0 || entries.some((entry) => !(entry instanceof File))) {
    throw new ApiError("VALIDATION_ERROR", "Upload at least one valid image file.", 400);
  }

  const images = entries as File[];
  const pageLimitViolation = getPageLimitViolation(images.length);
  if (pageLimitViolation) {
    throw new ApiError(
      "VALIDATION_ERROR",
      `This question allows a maximum of ${pageLimitViolation.pageLimit} answer-page photo${pageLimitViolation.pageLimit === 1 ? "" : "s"}. You selected ${pageLimitViolation.imageCount}.`,
      400,
      pageLimitViolation,
    );
  }

  for (const image of images) {
    if (!ALLOWED_IMAGE_TYPES.has(image.type)) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Unsupported image type. Upload JPEG or PNG page photos.",
        415,
      );
    }

    if (image.size < 1 || image.size > MAX_FILE_SIZE_BYTES) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "Each image must be between 1 byte and 10 MB.",
        413,
      );
    }

    if (!(await hasValidImageSignature(image))) {
      throw new ApiError(
        "VALIDATION_ERROR",
        "The uploaded file contents do not match a valid JPEG or PNG image.",
        415,
      );
    }
  }

  return images;
}
