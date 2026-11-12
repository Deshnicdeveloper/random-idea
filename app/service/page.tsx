import type { Metadata } from "next";
import Service from "@/components/Service";

export const metadata: Metadata = { title: "Selah · Service", description: "Live scripture display for church services." };

export default function Page() {
  return <Service />;
}
