import Image from "next/image";

export default function Footer() {
  return (
    <footer className="border-t border-neutral-800 bg-neutral-900 py-10 mt-20">
      <div className="mx-auto max-w-7xl px-4 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
        
        {/* Logo */}
        <div className="flex items-center space-x-3">
          <Image
            src="/linescout-logo.png"
            alt="LineScout Logo"
            width={130}
            height={36}
            className="h-auto w-auto opacity-90"
          />
        </div>

        {/* Footer Navigation */}
        <div className="flex flex-col md:flex-row md:space-x-6 text-neutral-400 text-sm">
          <a href="/machine-sourcing" className="hover:text-white">
            Machine Sourcing
          </a>
          <a href="/business-plan" className="hover:text-white">
            Business Plan
          </a>
          <a href="https://sureimports.com" target="_blank" className="hover:text-white">
            Sure Imports
          </a>
        </div>

        {/* Copyright */}
        <p className="text-neutral-500 text-xs md:text-sm">
          © {new Date().getFullYear()} LineScout by Sure Imports. All rights reserved.
        </p>
      </div>
    </footer>
  );
}