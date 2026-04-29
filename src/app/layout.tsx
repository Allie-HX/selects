import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Selects — Video Review & Shortlisting",
  description: "Review footage. Build your shortlist.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-app">{children}</body>
    </html>
  );
}
