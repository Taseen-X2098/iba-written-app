import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In",
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center bg-gradient-to-br from-brand-50 via-white to-brand-100 px-4 py-8">
      {/* Logo */}
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">
          IBA Wr
          <span className="text-brand-500">!</span>
          tten
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          AI-Powered Written Exam Preparation
        </p>
      </div>

      {/* Auth Card */}
      <div className="w-full max-w-md animate-fade-in">
        <div className="rounded-xl border border-border bg-card p-6 shadow-lg shadow-brand-100/50">
          {children}
        </div>
      </div>
    </div>
  );
}
