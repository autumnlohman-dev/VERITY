import type { Metadata } from "next";
import { sanitizeNext } from "@/lib/gate";

export const metadata: Metadata = {
  title: "ClearClaim",
  robots: { index: false, follow: false },
};

export default async function GatePage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const { next, error } = await searchParams;
  const safeNext = sanitizeNext(next);

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0D0D0D",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
      }}
    >
      <div style={{ width: "100%", maxWidth: "380px", textAlign: "center" }}>
        {/* Wordmark */}
        <div
          style={{
            fontFamily: "var(--font-dm-sans), system-ui, sans-serif",
            fontSize: "14px",
            letterSpacing: "0.3em",
            textTransform: "uppercase",
            color: "#F5F0E8",
            fontWeight: 500,
            marginBottom: "12px",
          }}
        >
          ClearClaim
        </div>
        <div
          style={{
            fontFamily: "var(--font-cormorant), Georgia, serif",
            fontSize: "30px",
            fontStyle: "italic",
            color: "#A89F96",
            lineHeight: 1.2,
            marginBottom: "36px",
          }}
        >
          Private preview.
        </div>

        <form
          action="/api/gate"
          method="POST"
          style={{ display: "flex", flexDirection: "column", gap: "14px" }}
        >
          <input type="hidden" name="next" value={safeNext} />

          <input
            type="password"
            name="password"
            required
            autoFocus
            aria-label="Access password"
            placeholder="Access password"
            style={{
              width: "100%",
              padding: "14px 16px",
              background: "#1A1A1A",
              border: `1px solid ${error ? "#C47C6A" : "#2A2A2A"}`,
              color: "#F5F0E8",
              fontSize: "14px",
              letterSpacing: "0.05em",
              outline: "none",
              boxSizing: "border-box",
            }}
          />

          {error && (
            <p
              role="alert"
              style={{ color: "#C47C6A", fontSize: "13px", margin: 0, textAlign: "left" }}
            >
              Incorrect password. Try again.
            </p>
          )}

          <button
            type="submit"
            style={{
              width: "100%",
              padding: "14px",
              background: "#C8A97E",
              color: "#0D0D0D",
              border: "none",
              fontSize: "11px",
              fontWeight: 500,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Enter
          </button>
        </form>
      </div>
    </div>
  );
}
