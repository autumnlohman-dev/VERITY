import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div
      style={{
        backgroundColor: "var(--bg)",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <nav
        className="px-6 md:px-12 lg:px-16"
        style={{
          padding: "24px 0",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="px-6 md:px-12 lg:px-16 flex items-center justify-between">
          <Link href="/" className="no-underline">
            <span
              className="font-[family-name:var(--font-dm-sans)] uppercase"
              style={{
                fontSize: "12px",
                letterSpacing: "0.25em",
                fontWeight: 500,
                color: "var(--text-primary)",
              }}
            >
              ClearClaim
            </span>
          </Link>
          <Link
            href="/"
            className="no-underline font-[family-name:var(--font-dm-sans)] uppercase"
            style={{
              fontSize: "11px",
              letterSpacing: "0.2em",
              fontWeight: 400,
              color: "var(--text-muted)",
            }}
          >
            ← Home
          </Link>
        </div>
      </nav>

      <main
        className="flex-1 px-6 md:px-12 lg:px-16 flex flex-col items-start justify-center py-24 lg:py-32"
        style={{ maxWidth: "720px", margin: "0 auto", width: "100%" }}
      >
        <div
          className="font-[family-name:var(--font-dm-sans)] uppercase mb-8"
          style={{
            fontSize: "10px",
            letterSpacing: "0.3em",
            color: "var(--text-muted)",
            fontWeight: 400,
          }}
        >
          — Privacy Policy
        </div>
        <h1
          className="font-[family-name:var(--font-cormorant)] mb-8"
          style={{
            fontSize: "clamp(44px, 5.5vw, 72px)",
            fontWeight: 300,
            lineHeight: 1.02,
            letterSpacing: "-0.02em",
            color: "var(--text-primary)",
          }}
        >
          Coming{" "}
          <em
            style={{
              fontStyle: "italic",
              color: "var(--amber)",
              fontWeight: 300,
            }}
          >
            soon.
          </em>
        </h1>
        <p
          className="font-[family-name:var(--font-dm-sans)]"
          style={{
            fontSize: "15px",
            lineHeight: 1.8,
            color: "var(--text-muted)",
            fontWeight: 300,
            maxWidth: "560px",
            marginBottom: "32px",
          }}
        >
          Our full privacy policy is being finalized. In the meantime: documents
          you upload are encrypted in transit and at rest, we do not sell or
          share your information with third parties, and access is limited to
          the team members working on your case.
        </p>
        <p
          className="font-[family-name:var(--font-dm-sans)]"
          style={{
            fontSize: "13px",
            lineHeight: 1.8,
            color: "var(--text-muted)",
            fontWeight: 300,
            maxWidth: "560px",
          }}
        >
          Questions in the meantime? Email{" "}
          <a
            href="mailto:support@clearclaim.co"
            style={{ color: "var(--amber)", textDecoration: "none" }}
          >
            support@clearclaim.co
          </a>
          .
        </p>
      </main>
    </div>
  );
}
