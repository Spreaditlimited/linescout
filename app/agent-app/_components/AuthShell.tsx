"use client";

import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import styles from "./AgentAuth.module.css";

export default function AuthShell({title, subtitle, topSlot, children}: {
  title: string; subtitle?: string; topSlot?: ReactNode; children: ReactNode;
}) {
  return (
    <main className={styles.layout}>
      <section className={styles.story} aria-label="Your LineScout workspace">
        <Image src="/images/hero-background-1.png" alt="" fill sizes="50vw" className={styles.photo} />
        <Link href="/agent-app" className={styles.storyLogo} aria-label="LineScout agent home">
          <Image src="/images/svg-logo-white.svg" width={180} height={38} alt="Sure Imports" />
          <span>LINESCOUT AGENTS</span>
        </Link>
        <div className={styles.storyCopy}>
          <span>YOUR SOURCING WORKSPACE</span>
          <h2>Good sourcing.<br />Great partnerships.</h2>
          <p>Connect with customers, manage your projects, and keep every order moving from enquiry to delivery.</p>
        </div>
      </section>
      <section className={styles.workspace} aria-labelledby="agent-auth-title">
        <div className={styles.inner}>
          <Link href="/agent-app" className={styles.mobileLogo} aria-label="LineScout agent home">
            <Image className={styles.lightLogo} src="/images/svg-logo.svg" width={180} height={38} alt="Sure Imports" />
            <Image className={styles.darkLogo} src="/images/svg-logo-white.svg" width={180} height={38} alt="Sure Imports" />
            <span>LINESCOUT AGENTS</span>
          </Link>
          {topSlot ? <div className={styles.back}>{topSlot}</div> : null}
          <header className={styles.heading}>
            <span className={styles.eyebrow}>AGENT WORKSPACE</span>
            <h1 id="agent-auth-title">{title}</h1>
            {subtitle ? <p>{subtitle}</p> : null}
          </header>
          <div className={styles.content}>{children}</div>
        </div>
      </section>
    </main>
  );
}
