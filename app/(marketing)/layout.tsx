import type { Metadata } from "next";
import MarketingShell from "./MarketingShell";

export const metadata: Metadata = {
  title: {
    default: "Rivu AI — Make business data ready for what comes next",
    template: "%s · Rivu AI",
  },
  description:
    "Rivu is an AI-native data refinery that transforms fragmented, messy and unstructured business data into clean, structured and usable datasets.",
};

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return <MarketingShell>{children}</MarketingShell>;
}