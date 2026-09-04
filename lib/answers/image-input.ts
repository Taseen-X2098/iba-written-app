/**
 * FileList objects belong to their input and may be emptied as soon as the
 * input value is cleared. Copy the files first so same-file re-uploads work
 * without losing the selection before OCR consumes it.
 */
export function consumeSelectedFiles(
  input: Pick<HTMLInputElement, "files" | "value">,
): File[] {
  const files = input.files ? Array.from(input.files) : [];
  input.value = "";
  return files;
}
