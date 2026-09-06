jest.mock("server-only", () => ({}));

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMainUserContext } from "@/lib/main-user-context";
import TakeExamPage from "./page";

jest.mock("next/navigation", () => ({
  redirect: jest.fn((destination: string) => {
    throw new Error(`REDIRECT:${destination}`);
  }),
}));
jest.mock("@/lib/supabase/server", () => ({ createClient: jest.fn() }));
jest.mock("@/lib/main-user-context", () => ({ getMainUserContext: jest.fn() }));
jest.mock("@/components/exams/exam-start-gate", () => ({
  __esModule: true,
  default: () => null,
}));

describe("past exam practice page access", () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([null, "plan_1"] as const)(
    "redirects a user with %s before loading the exam title",
    async (planType) => {
      jest.mocked(getMainUserContext).mockResolvedValue({
        user: { id: "student-1" },
        subscription: planType ? { plan_type: planType } : null,
      } as never);

      await expect(TakeExamPage({
        params: Promise.resolve({ id: "past-exam" }),
        searchParams: Promise.resolve({ practice: "true" }),
      })).rejects.toThrow("REDIRECT:/exams");

      expect(redirect).toHaveBeenCalledWith("/exams");
      expect(createClient).not.toHaveBeenCalled();
    },
  );
});
