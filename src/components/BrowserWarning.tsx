"use client";

export default function BrowserWarning() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-app p-8">
      <div className="glass p-8 max-w-md text-center">
        <div
          className="text-4xl mb-4"
          role="img"
          aria-label="warning"
        >
          &#9888;
        </div>
        <h2
          className="text-xl font-semibold mb-3"
          style={{ color: "var(--text-primary)" }}
        >
          Browser Not Supported
        </h2>
        <p
          className="mb-4 leading-relaxed"
          style={{ color: "var(--text-secondary)" }}
        >
          Selects requires the File System Access API, which is only available in
          Chrome or Edge. Please open this app in one of those browsers.
        </p>
        <a
          href="https://www.google.com/chrome/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-6 py-2.5 rounded-xl font-medium text-white transition-colors"
          style={{ background: "var(--accent)" }}
        >
          Get Chrome
        </a>
      </div>
    </div>
  );
}
