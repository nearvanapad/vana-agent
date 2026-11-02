import { ShieldCheck } from "lucide-react";
import { ConnectButton } from "@/components/wallet/connect-button";

export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4">
      <header className="flex items-center justify-between py-4">
        <h1 className="font-display text-2xl tracking-wide text-accent">VANA</h1>
        <ConnectButton />
      </header>

      <main className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
        <ShieldCheck className="text-accent" size={40} />
        <h2 className="font-display text-3xl">Is this NEAR token safe?</h2>
        <p className="max-w-md text-text-2">
          Ask about any NEP-141 token. VANA checks the contract, holders and liquidity, cites every number, and can swap
          it for you through NEAR Intents. Your wallet signs — never the AI.
        </p>
      </main>
    </div>
  );
}
