import {
  requireGradingVectorStoreId,
  rubricSourceForGrader,
} from "./config";

describe("grading rubric source configuration", () => {
  it("keeps mock grading on the local rubric function", () => {
    expect(rubricSourceForGrader(true, {})).toEqual({ type: "local_function" });
  });

  it("requires the rubric vector store for real grading", () => {
    expect(() => rubricSourceForGrader(false, {})).toThrow(
      "OPENAI_VECTOR_IBA_WRITTEN"
    );
  });

  it("returns the configured vector store for real grading", () => {
    expect(
      rubricSourceForGrader(false, { OPENAI_VECTOR_IBA_WRITTEN: "  vs_rubrics123  " })
    ).toEqual({ type: "file_search", vectorStoreId: "vs_rubrics123" });
  });

  it("rejects an API key accidentally placed in the vector store variable", () => {
    expect(() =>
      requireGradingVectorStoreId({ OPENAI_VECTOR_IBA_WRITTEN: "sk-not-a-store" })
    ).toThrow("beginning with 'vs_'");
  });
});
