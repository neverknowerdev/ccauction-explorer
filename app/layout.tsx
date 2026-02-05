import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { ConnectWalletButtonWrapper } from "@/components/ConnectWalletButtonWrapper";

export const metadata: Metadata = {
  title: "CCA Auctions Explorer",
  description: "Explore and participate in CCA auctions",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <ConnectWalletButtonWrapper />
          {children}
        </Providers>
      </body>
    </html>
  );
}
