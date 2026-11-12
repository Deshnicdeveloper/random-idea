import type { Metadata } from "next";
import Talk from "@/components/Talk";

export const metadata: Metadata = { title: "Selah · Talk", description: "Talk with a pastor, by voice, and interrupt naturally." };

export default function Page() {
  return <Talk />;
}
