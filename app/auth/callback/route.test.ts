import { createClient } from "@/lib/supabase/server";
import { GET } from "./route";

jest.mock("@/lib/supabase/server", () => ({
  createClient: jest.fn(),
}));

const mockedCreateClient = jest.mocked(createClient);

describe("auth callback redirects", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("keeps the reset redirect on the browser's public origin", async () => {
    const exchangeCodeForSession = jest.fn().mockResolvedValue({ error: null });
    mockedCreateClient.mockResolvedValue({
      auth: { exchangeCodeForSession },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const response = await GET(new Request(
      "https://localhost:8080/auth/callback?code=recovery-code&next=/reset-password",
    ));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("/reset-password");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("recovery-code");
  });

  it("rejects an external next destination", async () => {
    const exchangeCodeForSession = jest.fn().mockResolvedValue({ error: null });
    mockedCreateClient.mockResolvedValue({
      auth: { exchangeCodeForSession },
    } as unknown as Awaited<ReturnType<typeof createClient>>);

    const response = await GET(new Request(
      "https://localhost:8080/auth/callback?code=recovery-code&next=//example.com",
    ));

    expect(response.headers.get("location")).toBe("/");
  });
});
