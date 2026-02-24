import Image from "next/image";
import Link from "next/link";

type FooterVariant = "user" | "agent";

export default function Footer({ variant = "user" }: { variant?: FooterVariant }) {
  const year = new Date().getFullYear();
  const isAgent = variant === "agent";
  const shellClass = isAgent
    ? "border-t border-[rgba(45,52,97,0.4)] bg-gradient-to-b from-[#121935] via-[#0F142B] to-[#0B1023]"
    : "border-t border-emerald-900/40 bg-gradient-to-b from-[#10241E] via-[#0F1C18] to-[#0B1512]";
  const headingClass = isAgent ? "text-[rgba(255,255,255,0.85)]" : "text-emerald-50";
  const bodyClass = isAgent ? "text-[rgba(255,255,255,0.7)]" : "text-emerald-50/75";
  const mutedClass = isAgent ? "text-[rgba(255,255,255,0.45)]" : "text-emerald-50/50";
  const dividerClass = isAgent ? "border-[rgba(255,255,255,0.08)]" : "border-emerald-900/40";

  return (
    <footer className={`flex-shrink-0 ${shellClass}`}>
      <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1.5fr_1.1fr_1.1fr_1.3fr]">
          {/* Brand */}
          <div className="lg:pr-4">
            <div className="flex items-center gap-2">
              <Image
                src="/linescout-logo.png"
                alt="LineScout"
                width={140}
                height={32}
                className="h-[22px] w-auto"
              />
            </div>

            <p className={`mt-3 max-w-[360px] text-sm leading-relaxed ${bodyClass}`}>
              LineScout is a Trademark of Sure Importers Limited (Nigeria) and Spreadit Sourcing Ltd (United Kingdom)
              focused on sourcing machine and white labeling products for businesses in China.
            </p>
            <div className="mt-3">
              <a
                href="https://www.sureimports.com/about"
                target="_blank"
                rel="noopener noreferrer"
                className={`text-sm hover:text-white hover:underline ${bodyClass}`}
              >
                About
              </a>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span
                className={`rounded-full border px-2.5 py-1 ${mutedClass} ${
                  isAgent ? "border-white/10" : "border-emerald-900/50"
                }`}
              >
                UK
              </span>
              <span
                className={`rounded-full border px-2.5 py-1 ${mutedClass} ${
                  isAgent ? "border-white/10" : "border-emerald-900/50"
                }`}
              >
                Canada
              </span>
              <span
                className={`rounded-full border px-2.5 py-1 ${mutedClass} ${
                  isAgent ? "border-white/10" : "border-emerald-900/50"
                }`}
              >
                Nigeria
              </span>
            </div>
          </div>

          {/* Product */}
          <div>
            <div className={`text-sm font-semibold ${headingClass}`}>Product</div>
            <ul className={`mt-2 space-y-1.5 text-sm ${bodyClass}`}>
              <li>
                <Link href="/machine" className="hover:text-white hover:underline">
                  LineScout Sourcing
                </Link>
              </li>
              <li>
                <Link href="/agent-app" className="hover:text-white hover:underline">
                  Agent web app
                </Link>
              </li>
            </ul>
            <div className={`mt-4 text-sm font-semibold ${headingClass}`}>Mobile apps</div>
            <ul className={`mt-2 space-y-1.5 text-sm ${bodyClass}`}>
              <li>
                <a href="#app-download" className="hover:text-white hover:underline">
                  LineScout app (iOS / Android)
                </a>
              </li>
              <li>
                <Link href="/agent-app#agent-app" className="hover:text-white hover:underline">
                  Agent app (iOS / Android)
                </Link>
              </li>
            </ul>
          </div>

          {/* Policies */}
          <div>
            <div className={`text-sm font-semibold ${headingClass}`}>Policies</div>
            <ul className={`mt-2 space-y-1.5 text-sm ${bodyClass}`}>
              <li>
                <a
                  href="https://www.sureimports.com/terms-and-conditions"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white hover:underline"
                >
                  Terms &amp; Conditions
                </a>
              </li>
              <li>
                <a
                  href="https://www.sureimports.com/privacy-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white hover:underline"
                >
                  Privacy Policy
                </a>
              </li>
              <li>
                <a
                  href="https://www.sureimports.com/warranty-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white hover:underline"
                >
                  Warranty Policy
                </a>
              </li>
              <li>
                <a
                  href="https://www.sureimports.com/shipping-policy"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white hover:underline"
                >
                  Shipping Policy
                </a>
              </li>
            </ul>
          </div>

          {/* Contact & Social */}
          <div>
            <div className={`text-sm font-semibold ${headingClass}`}>Contact</div>
            <div className="mt-2 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-1">
              <div className={`space-y-3 ${bodyClass}`}>
                <div>
                  <div className={mutedClass}>Email</div>
                  <a href="mailto:hello@sureimports.com" className="hover:text-white hover:underline">
                    hello@sureimports.com
                  </a>
                </div>
                <div>
                  <div className={mutedClass}>Nigeria Office</div>
                  <div>5 Olutosin Ajayi (Martins Adegboyega) Street, Ajao Estate, Lagos, Nigeria</div>
                  <div className="mt-1 grid gap-0.5">
                    <div>08037649956</div>
                    <div>08064583664</div>
                    <div>08068397263</div>
                  </div>
                </div>
              </div>

              <div className={`space-y-3 ${bodyClass}`}>
                <div>
                  <div className={mutedClass}>United Kingdom</div>
                  <div>33 Bevan Court, Dunlop Street</div>
                  <div>Warrington, England</div>
                  <div className="mt-1">070881194138</div>
                </div>
                <div>
                  <div className={mutedClass}>China Office</div>
                  <div>广州市白云区机场路111号建发广场5FB3-1</div>
                </div>
              </div>
            </div>

          </div>
        </div>

        <div className={`mt-5 border-t pt-3 text-xs ${mutedClass} ${dividerClass}`}>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>© {year} LineScout. Built by Sure Importers Limited.</div>
            <ul className={`flex flex-wrap gap-x-4 gap-y-1.5 text-sm ${bodyClass}`}>
              <li>
                <a
                  href="https://www.facebook.com/share/1BEjP95X7E/?mibextid=wwXIfr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white hover:underline"
                >
                  Facebook
                </a>
              </li>
              <li>
                <a
                  href="https://www.instagram.com/sureimport?igsh=NjRtaHJpbXlnMGxo&utm_source=qr"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white hover:underline"
                >
                  Instagram
                </a>
              </li>
              <li>
                <a
                  href="https://youtube.com/@sureimports?si=gP4cw3zUC1iQN3Rd"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white hover:underline"
                >
                  YouTube
                </a>
              </li>
              <li>
                <a
                  href="https://www.tiktok.com/@tochukwunkwocha?_t=ZS-8yeC5xnNBmH&_r=1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white hover:underline"
                >
                  TikTok
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </footer>
  );
}
