import Image from "next/image";
import Link from "next/link";

type FooterVariant = "user" | "agent";

export default function Footer({ variant = "user" }: { variant?: FooterVariant }) {
  const year = new Date().getFullYear();
  const isAgent = variant === "agent";
  const shellClass = isAgent
    ? "border-t border-[rgba(45,52,97,0.4)] bg-[#0F142B]"
    : "border-t border-emerald-900/40 bg-[#0F1C18]";
  const headingClass = isAgent ? "text-[rgba(255,255,255,0.85)]" : "text-emerald-50";
  const bodyClass = isAgent ? "text-[rgba(255,255,255,0.7)]" : "text-emerald-50/75";
  const mutedClass = isAgent ? "text-[rgba(255,255,255,0.45)]" : "text-emerald-50/50";
  const dividerClass = isAgent ? "border-[rgba(255,255,255,0.08)]" : "border-emerald-900/40";

  return (
    <footer className={`flex-shrink-0 ${shellClass}`}>
      <div className="mx-auto w-full max-w-7xl px-4 pt-5 pb-1 sm:px-6 lg:px-8">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand */}
          <div className="lg:pr-4">
            <div className="flex items-center gap-3">
              <Image
                src="/linescout-logo.png"
                alt="LineScout"
                width={140}
                height={32}
                className="h-[22px] w-auto"
              />
            </div>

            <p className={`mt-3 max-w-[260px] text-sm leading-relaxed ${bodyClass}`}>
              LineScout is a Trademark of Sure Importers Limited focused on machine sourcing and white labeling products
              for Nigerian businesses in China.
            </p>
          </div>

          {/* Product */}
          <div>
            <div className={`text-sm font-semibold ${headingClass}`}>Product</div>
            <ul className={`mt-3 space-y-2 text-sm ${bodyClass}`}>
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
          </div>

          {/* Mobile Apps */}
          <div>
            <div className={`text-sm font-semibold ${headingClass}`}>Mobile apps</div>
            <ul className={`mt-3 space-y-2 text-sm ${bodyClass}`}>
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

          {/* Legal */}
          <div>
            <div className={`text-sm font-semibold ${headingClass}`}>Legal</div>
            <ul className={`mt-3 space-y-2 text-sm ${bodyClass}`}>
              <li>
                <a
                  href="https://www.sureimports.com/about"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white hover:underline"
                >
                  About
                </a>
              </li>
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
              <li>
                <a
                  href="https://affiliate.sureimports.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-white hover:underline"
                >
                  Affiliates
                </a>
              </li>
            </ul>
          </div>

          {/* Contact & Social */}
          <div>
            <div className={`text-sm font-semibold ${headingClass}`}>Contact</div>
            <div className={`mt-3 space-y-4 text-sm ${bodyClass}`}>
              <div>
                <div className={mutedClass}>Email</div>
                <a href="mailto:hello@sureimports.com" className="hover:text-white hover:underline">
                  hello@sureimports.com
                </a>
              </div>

              <div>
                <div className={mutedClass}>Nigeria Office</div>
                <div>5 Olutosin Ajayi (Martins Adegboyega) Street, Ajao Estate, Lagos, Nigeria</div>
                <div className="mt-2 grid gap-1">
                  <div>08037649956</div>
                  <div>08064583664</div>
                  <div>08068397263</div>
                </div>
              </div>

              <div>
                <div className={mutedClass}>China Office</div>
                <div>广州市白云区机场路111号建发广场5FB3-1</div>
              </div>
            </div>

            <div className="mt-6">
              <div className={`text-sm font-semibold ${headingClass}`}>Follow us</div>
              <ul className={`mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm ${bodyClass}`}>
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

        <div className={`mt-3 border-t pt-2 text-xs ${mutedClass} ${dividerClass}`}>
          © {year} LineScout. Built by Sure Importers Limited.
        </div>
      </div>
    </footer>
  );
}
