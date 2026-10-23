import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DownMusic - Spotify Downloader",
  description: "Download your Spotify tracks with full metadata, album art and lyrics",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col font-mono">{children}</body>
    </html>
  );
}
