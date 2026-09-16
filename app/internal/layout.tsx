import type { Metadata } from "next";
import InternalWorkspace from "./_components/InternalWorkspace";
import "./internal-design.css";
export const metadata: Metadata = { title: "Internal workspace | LineScout", robots: { index: false, follow: false } };
export default function InternalLayout({children}:{children:React.ReactNode}) { return <InternalWorkspace>{children}</InternalWorkspace>; }
