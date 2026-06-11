import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create Trip · Kepi Travel",
  description: "Adaptive travel decision engine — intent to strategy in one screen.",
};

export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return children;
}
