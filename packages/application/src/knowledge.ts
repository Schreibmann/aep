import {
  type AssembledKnowledgeContext,
  assembleKnowledgeContext,
  type BuildKnowledgePacksResult,
  buildKnowledgePacks,
  type KnowledgePack,
  listKnowledgePacks,
  ProjectProfilesError,
  updateKnowledgePack,
} from "@aep/project-profiles";
import { ApplicationError } from "./errors.js";

function rethrow(error: unknown): never {
  if (error instanceof ProjectProfilesError) {
    throw new ApplicationError(error.code, error.message);
  }
  throw error;
}

export async function buildProjectKnowledgePacks(input: {
  readonly projectRoot: string;
  readonly overwriteExisting?: boolean;
}): Promise<BuildKnowledgePacksResult> {
  try {
    return buildKnowledgePacks({
      projectRoot: input.projectRoot,
      ...(input.overwriteExisting === undefined
        ? {}
        : { overwriteExisting: input.overwriteExisting }),
    });
  } catch (error) {
    rethrow(error);
  }
}

export async function listProjectKnowledgePacks(
  projectRoot: string,
): Promise<ReadonlyArray<KnowledgePack>> {
  try {
    return listKnowledgePacks(projectRoot);
  } catch (error) {
    rethrow(error);
  }
}

export async function editProjectKnowledgePack(input: {
  readonly projectRoot: string;
  readonly packId: string;
  readonly content: string;
  readonly title?: string;
}): Promise<KnowledgePack> {
  try {
    return updateKnowledgePack({
      projectRoot: input.projectRoot,
      packId: input.packId,
      content: input.content,
      ...(input.title === undefined ? {} : { title: input.title }),
    });
  } catch (error) {
    rethrow(error);
  }
}

export function assembleProjectKnowledgeContext(input: {
  readonly projectRoot: string;
  readonly query?: string;
  readonly tokenBudget?: number;
}): AssembledKnowledgeContext {
  try {
    return assembleKnowledgeContext({
      projectRoot: input.projectRoot,
      ...(input.query === undefined ? {} : { query: input.query }),
      ...(input.tokenBudget === undefined ? {} : { tokenBudget: input.tokenBudget }),
    });
  } catch (error) {
    rethrow(error);
  }
}
