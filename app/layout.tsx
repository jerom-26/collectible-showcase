import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Collectible Showcase",
  description: "Explore collectible NFTs inside a personal 3D display room.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
