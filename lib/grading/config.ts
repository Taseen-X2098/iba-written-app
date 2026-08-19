export type GradingRubricSource =
  | { type: "local_function" }
  | { type: "file_search"; vectorStoreId: string };

export function requireGradingVectorStoreId(
  env?: { OPENAI_VECTOR_IBA_WRITTEN?: string }
): string {
  const vectorStoreId = (
    env ? env.OPENAI_VECTOR_IBA_WRITTEN : process.env.OPENAI_VECTOR_IBA_WRITTEN
  )?.trim();

  if (!vectorStoreId) {
    throw new Error(
      "Real AI grading is not configured: set OPENAI_VECTOR_IBA_WRITTEN to the OpenAI vector store ID containing the rubrics."
    );
  }

  if (!vectorStoreId.startsWith("vs_")) {
    throw new Error(
      "OPENAI_VECTOR_IBA_WRITTEN must be an OpenAI vector store ID beginning with 'vs_'."
    );
  }

  return vectorStoreId;
}

export function rubricSourceForGrader(
  useMockGrader: boolean,
  env?: { OPENAI_VECTOR_IBA_WRITTEN?: string }
): GradingRubricSource {
  return useMockGrader
    ? { type: "local_function" }
    : { type: "file_search", vectorStoreId: requireGradingVectorStoreId(env) };
}
