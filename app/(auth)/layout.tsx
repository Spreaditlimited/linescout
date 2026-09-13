import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PackageCheck, MessagesSquare, Route } from "lucide-react";
import styles from "@/components/auth/password-auth.module.css";

export const metadata: Metadata = { title: "Your account | LineScout", robots: { index: false, follow: false }, referrer: "no-referrer" };
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return <main className={styles.layout}>
    <section className={styles.story} aria-label="Your China sourcing workspace">
      <Image src="https://www.sureimports.com/images/hero-background-1.png" alt="" fill sizes="(max-width: 900px) 1px, 50vw" className={styles.photo} />
      <div className={styles.shade} />
      <Link href="/" className={styles.storyBrand} aria-label="Sure Imports LineScout home">
        <Image src="/images/svg-logo-white.svg" alt="Sure Imports" width={190} height={40} priority />
        <span>LineScout</span>
      </Link>
      <div className={styles.storyCopy}>
        <p className={styles.storyEyebrow}>YOUR CHINA SOURCING WORKSPACE</p>
        <h2>From your first idea<br /><span>to goods delivered.</span></h2>
        <p>Find products, work with sourcing specialists in China, and follow your orders in one place.</p>
        <ul className={styles.proof}>
          <li><PackageCheck size={19} /> Discover products for your business</li>
          <li><MessagesSquare size={19} /> Get support from real sourcing specialists</li>
          <li><Route size={19} /> Track your project from quote to delivery</li>
        </ul>
      </div>
      <p className={styles.storyFoot}>Powered by Sure Imports</p>
    </section>
    <section className={styles.workspace}>
      <div className={styles.content}>
        <Link href="/" className={styles.mobileBrand} aria-label="Sure Imports LineScout home">
          <Image src="/images/svg-logo.svg" alt="Sure Imports" width={180} height={40} className={styles.brandLight} priority />
          <Image src="/images/svg-logo-white.svg" alt="" width={180} height={40} className={styles.brandDark} />
        </Link>
        {children}
      </div>
    </section>
  </main>;
}
