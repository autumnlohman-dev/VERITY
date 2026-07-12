import type { Metadata } from "next";
import ForPlansClient from "./ForPlansClient";

export const metadata: Metadata = {
  title: "For Health Plans & Employers",
  description:
    "Verity partners with health plans, TPAs, and self-funded employers to find billing errors, resolve disputes, and protect members from improper charges.",
  openGraph: {
    title: "For Health Plans & Employers",
    description:
      "Verity partners with health plans, TPAs, and self-funded employers to find billing errors, resolve disputes, and protect members from improper charges.",
    type: "website",
    url: "/for-plans",
    siteName: "Verity",
  },
};

export default function ForPlansPage() {
  return <ForPlansClient />;
}
