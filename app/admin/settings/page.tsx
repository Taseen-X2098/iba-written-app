import { Settings as SettingsIcon, Shield, Server, CreditCard } from "lucide-react";

export const dynamic = 'force-dynamic';

export default function AdminSettingsPage() {
  return (
    <div className="animate-fade-in max-w-6xl mx-auto pb-12">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
            <SettingsIcon className="text-brand-600" size={32} /> System Settings
          </h1>
          <p className="text-muted-foreground mt-1">Configure global application variables and APIs.</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-8">
        {/* Grading Engine Settings */}
        <div className="bg-card border border-border rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center text-blue-700">
              <Server size={20} />
            </div>
            <h2 className="text-xl font-bold">Grading Engine</h2>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border">
              <div>
                <p className="font-bold text-foreground">Mock Grader</p>
                <p className="text-xs text-muted-foreground">Bypass OpenAI and return mock JSON instantly.</p>
              </div>
              <div className="px-3 py-1 bg-brand-100 text-brand-700 font-mono text-xs font-bold rounded">
                {process.env.USE_MOCK_GRADER === "true" ? "ENABLED" : "DISABLED"}
              </div>
            </div>

            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border">
              <div>
                <p className="font-bold text-foreground">Mock OCR</p>
                <p className="text-xs text-muted-foreground">Bypass Z.AI and return mock text instantly.</p>
              </div>
              <div className="px-3 py-1 bg-brand-100 text-brand-700 font-mono text-xs font-bold rounded">
                {process.env.Z_AI_MOCK === "true" ? "ENABLED" : "DISABLED"}
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground mt-2 italic">
              Note: These settings are currently managed via the `.env.local` file for security.
            </p>
          </div>
        </div>

        {/* Payments Settings */}
        <div className="bg-card border border-border rounded-xl shadow-sm p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-10 w-10 rounded-lg bg-green-100 flex items-center justify-center text-green-700">
              <CreditCard size={20} />
            </div>
            <h2 className="text-xl font-bold">Payment Gateway</h2>
          </div>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg border border-border">
              <div>
                <p className="font-bold text-foreground">bKash Environment</p>
                <p className="text-xs text-muted-foreground">Sandbox vs Production API URLs.</p>
              </div>
              <div className="px-3 py-1 bg-gray-100 text-gray-700 font-mono text-xs font-bold rounded">
                {process.env.BKASH_BASE_URL?.includes("sandbox") ? "SANDBOX" : "PRODUCTION"}
              </div>
            </div>
            
            <p className="text-xs text-muted-foreground mt-2 italic">
              Note: These settings are currently managed via the `.env.local` file for security.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
