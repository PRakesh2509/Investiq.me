import { createServerFn } from "@tanstack/react-start";
import type { IPO } from "./ipos";
import type { IpoResearch } from "./ipo-research";
import { researchIpo } from "./ipo-research.server";

export const getIpoResearch = createServerFn({ method: "POST" })
  .validator((input: { ipo: IPO }) => input)
  .handler(async ({ data }): Promise<IpoResearch> => researchIpo(data.ipo));
