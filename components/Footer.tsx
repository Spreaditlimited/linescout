import Image from "next/image";
import Link from "next/link";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="flex-shrink-0 border-t border-neutral-800 bg-neutral-950">
      <div className="mx-auto w-full max-w-[1400px] px-4 py-10 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-3">
              <Image
                src="/linescout-logo.png"
                alt="LineScout"
                width={140}
                height={32}
                className="h-[22px] w-auto"
              />
            </div>

            <p className="mt-3 text-sm leading-relaxed text-neutral-300">
              LineScout is a Trademark of Sure Importers Limited focused on machine sourcing and white labeling products
              for Nigerian businesses in China.
            </p>
          </div>

          {/* Contact */}
          <div>
            <div className="text-sm font-semibold text-white">Contact</div>

            <div className="mt-3 space-y-3 text-sm text-neutral-300">
              <div>
                <div className="text-neutral-400">Email</div>
                <a href="mailto:hello@sureimports.com" className="hover:text-white hover:underline">
                  hello@sureimports.com
                </a>
              </div>

              <div>
                <div className="text-neutral-400">Nigeria Office</div>
                <div>5 Olutosin Ajay Street, Ajao Estate, Lagos, Nigeria</div>
                <div className="mt-2 space-y-1">
                  <div>08037649956</div>
                  <div>08064583664</div>
                  <div>08068397263</div>
                </div>
              </div>

              <div>
                <div className="text-neutral-400">China Office</div>
                <div>广州市白云区机场路111号建发广场5FB3-1</div>
              </div>
            </div>
          </div>

          {/* Legal & Support */}
          <div>
            <div className="text-sm font-semibold text-white">Legal &amp; Support</div>
            <ul className="mt-3 space-y-2 text-sm text-neutral-300">
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

          {/* Follow */}
          <div>
            <div className="text-sm font-semibold text-white">Follow us</div>
            <ul className="mt-3 space-y-2 text-sm text-neutral-300">
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

        <div className="mt-10 border-t border-neutral-800 pt-6 text-xs text-neutral-500">
          © {year} LineScout. Built by Sure Importers Limited.
        </div>
      </div>
    </footer>
  );
}