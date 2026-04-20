import type { Metadata } from "next";
import "@/app/globals.css";
import Navbar from "@/components/Navbar";
import EnvironmentStatus from "@/components/EnvironmentStatus";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AppToaster } from "@/components/ui/toaster";
import { Web3Provider } from "@/context/Web3Context";

export const metadata: Metadata = {
  title: "EscrowX | Decentralized Escrow Marketplace",
  description: "Secure peer-to-peer escrow payments on Ethereum Sepolia.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          <Web3Provider>
            <Navbar />
            <main className="mx-auto max-w-7xl px-4 py-8">
              <EnvironmentStatus />
              {children}
            </main>
            <AppToaster />
          </Web3Provider>
        </ThemeProvider>
      </body>
    </html>
  );
}
