"use client";

import Link from "next/link";
import Badge from "@/components/Badge";
import AmbientGlow from "@/components/AmbientGlow";
import { useEffect, useState } from "react";
import { isFileSystemAccessSupported } from "@/lib/fs";
import BrowserWarning from "@/components/BrowserWarning";

export default function Home() {
  const [supported, setSupported] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSupported(isFileSystemAccessSupported());
  }, []);

  if (!mounted) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!supported) {
    return <BrowserWarning />;
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center relative min-h-screen">
      <AmbientGlow />

      <div className="relative z-10 flex flex-col items-center text-center px-6">
        <Badge label="Video Review Tool" />

        <h1
          className="text-5xl sm:text-6xl font-bold tracking-tight mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Selects
        </h1>
        <p
          className="text-lg sm:text-xl mb-12 max-w-md"
          style={{ color: "var(--text-secondary)" }}
        >
          Review footage. Build your shortlist.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 w-full max-w-2xl">
          <Link href="/review" className="flex-1 group">
            <div className="glass glass-hover transition-glass p-6 text-center cursor-pointer h-full">
              <div className="text-3xl mb-3">
                <svg
                  className="w-8 h-8 mx-auto"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  style={{ color: "var(--accent)" }}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z"
                  />
                </svg>
              </div>
              <h2
                className="text-lg font-semibold mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                Start Reviewing
              </h2>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Select a folder and begin reviewing clips
              </p>
            </div>
          </Link>

          <Link href="/shortlist" className="flex-1 group">
            <div className="glass glass-hover transition-glass p-6 text-center cursor-pointer h-full">
              <div className="text-3xl mb-3">
                <svg
                  className="w-8 h-8 mx-auto"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  style={{ color: "var(--hx-green)" }}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
                  />
                </svg>
              </div>
              <h2
                className="text-lg font-semibold mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                View Shortlist
              </h2>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Browse and play your shortlisted clips
              </p>
            </div>
          </Link>
          <Link href="/generate" className="flex-1 group">
            <div className="glass glass-hover transition-glass p-6 text-center cursor-pointer h-full">
              <div className="text-3xl mb-3">
                <svg
                  className="w-8 h-8 mx-auto"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  style={{ color: "var(--amber)" }}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="m15.75 10.5 4.72-4.72a.75.75 0 0 1 1.28.53v11.38a.75.75 0 0 1-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 0 0 2.25-2.25v-9a2.25 2.25 0 0 0-2.25-2.25h-9A2.25 2.25 0 0 0 2.25 7.5v9a2.25 2.25 0 0 0 2.25 2.25Z"
                  />
                </svg>
              </div>
              <h2
                className="text-lg font-semibold mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                Generate Social
              </h2>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Create 9:16 videos with captions from selects
              </p>
            </div>
          </Link>
          <Link href="/generate/ai" className="flex-1 group">
            <div className="glass glass-hover transition-glass p-6 text-center cursor-pointer h-full">
              <div className="text-3xl mb-3">
                <svg
                  className="w-8 h-8 mx-auto"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  style={{ color: "var(--hx-yellow, #FFF800)" }}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z"
                  />
                </svg>
              </div>
              <h2
                className="text-lg font-semibold mb-1"
                style={{ color: "var(--text-primary)" }}
              >
                AI Video Generator
              </h2>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                Upload footage, AI creates audience-targeted videos
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
