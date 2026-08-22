import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { loadEnvConfig } from "@next/env";
import OpenAI, { toFile } from "openai";
import { requireGradingVectorStoreId } from "../lib/grading/config";

const projectDir = process.cwd();
const rubricPath = path.join(projectDir, "md_files", "rubrics.md");
const apply = process.argv.includes("--apply");

async function main() {
  loadEnvConfig(projectDir, true);

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("Set OPENAI_API_KEY in .env.local before syncing rubrics.");
  }

  const vectorStoreId = requireGradingVectorStoreId();
  const client = new OpenAI({ apiKey });
  const vectorStore = await client.vectorStores.retrieve(vectorStoreId);
  if (vectorStore.status !== "completed") {
    throw new Error(
      `Rubric vector store ${vectorStoreId} is not ready (status: ${vectorStore.status}).`,
    );
  }

  const existingAttachments = [];
  for await (const attachment of client.vectorStores.files.list(vectorStoreId, {
    limit: 100,
  })) {
    existingAttachments.push(attachment);
  }

  const existingFiles = await Promise.all(
    existingAttachments.map(async (attachment) => ({
      attachment,
      file: await client.files.retrieve(attachment.id),
    })),
  );
  const replaceable = existingFiles.filter(({ attachment, file }) =>
    attachment.attributes?.role === "iba_written_rubrics"
      || file.filename.toLowerCase().includes("rubric"),
  );

  console.log(
    `Vector store ${vectorStoreId}: ${existingAttachments.length} attached file(s), ` +
      `${replaceable.length} recognized rubric file(s).`,
  );

  if (!apply) {
    console.log("Dry run only. Re-run with --apply to upload and replace the rubric document.");
    return;
  }

  const content = await readFile(rubricPath);
  const uploaded = await client.files.create({
    file: await toFile(content, "iba-written-rubrics.md", { type: "text/markdown" }),
    purpose: "assistants",
  });

  try {
    const attached = await client.vectorStores.files.createAndPoll(
      vectorStoreId,
      {
        file_id: uploaded.id,
        attributes: {
          role: "iba_written_rubrics",
          source: "md_files/rubrics.md",
          includes_story_completion: true,
        },
      },
      { pollIntervalMs: 1_000 },
    );

    if (attached.status !== "completed") {
      throw new Error(
        `Uploaded rubric did not finish processing (${attached.status}: ` +
          `${attached.last_error?.message ?? "no error details"}).`,
      );
    }

    for (const { attachment } of replaceable) {
      if (attachment.id === attached.id) continue;
      await client.vectorStores.files.delete(attachment.id, {
        vector_store_id: vectorStoreId,
      });
    }

    console.log(
      `Uploaded ${uploaded.id}, attached it as the active rubric, and detached ` +
        `${replaceable.length} previous rubric file(s).`,
    );
  } catch (error) {
    await client.files.delete(uploaded.id).catch(() => undefined);
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
