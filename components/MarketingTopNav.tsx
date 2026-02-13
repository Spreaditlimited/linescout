import Image from "next/image";
import Link from "next/link";
import MarketingTopNavMenu from "./marketing/MarketingTopNavMenu";

type NavItem = { href: string; label: string };

const navItems: NavItem[] = [
  { href: "/white-label", label: "White Label" },
];

export default function MarketingTopNav({
  backgroundClassName = "bg-[#F7F6F2]/95",
  borderClassName = "border-emerald-100",
  dividerClassName = "bg-emerald-200",
  accentClassName = "text-emerald-700",
  navTextClassName = "text-neutral-700",
  navHoverClassName = "hover:text-emerald-700",
  buttonBorderClassName = "border-emerald-100",
  buttonTextClassName = "text-emerald-900",
  menuBorderClassName = "border-emerald-100",
  menuBgClassName = "bg-white/90",
  menuTextClassName = "text-neutral-700",
  menuHoverClassName = "hover:text-emerald-700",
  disabledNavClassName = "text-neutral-400",
}: {
  backgroundClassName?: string;
  borderClassName?: string;
  dividerClassName?: string;
  accentClassName?: string;
  navTextClassName?: string;
  navHoverClassName?: string;
  buttonBorderClassName?: string;
  buttonTextClassName?: string;
  menuBorderClassName?: string;
  menuBgClassName?: string;
  menuTextClassName?: string;
  menuHoverClassName?: string;
  disabledNavClassName?: string;
}) {
  return (
    <header className={`relative z-40 border-b ${borderClassName} ${backgroundClassName} backdrop-blur`}>
      <div className="mx-auto flex w-full max-w-6xl items-center gap-4 px-4 py-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/" aria-label="LineScout home">
            <Image src="/linescout-logo.png" alt="LineScout" width={130} height={36} priority />
          </Link>
          <span className={`hidden h-7 w-px rounded-full sm:inline-block ${dividerClassName}`} />
          <div className="hidden sm:block">
            <p className={`text-xs font-semibold uppercase tracking-[0.25em] ${accentClassName}`}>
              Nigeria-first sourcing
            </p>
            <p className="text-xs text-neutral-500">AI clarity + specialist execution</p>
          </div>
        </div>
        <div className="ml-auto hidden items-center justify-end gap-6 lg:flex">
          <nav className={`flex items-center gap-6 text-sm font-semibold ${navTextClassName}`}>
            {navItems.map((item) => (
              <Link key={item.href} href={item.href} className={navHoverClassName}>
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/sign-in"
            className="inline-flex items-center gap-2 rounded-2xl bg-[var(--agent-blue,#2D3461)] px-6 py-3 text-sm font-semibold text-white shadow-[0_10px_30px_rgba(45,52,97,0.35)]"
          >
            Start Sourcing
          </Link>
        </div>
        <div className="ml-auto flex items-center lg:hidden">
          <MarketingTopNavMenu
            navItems={navItems}
            disabledNavLabel="Get the app"
            buttonBorderClassName={buttonBorderClassName}
            buttonTextClassName={buttonTextClassName}
            menuBorderClassName={menuBorderClassName}
            menuBgClassName={menuBgClassName}
            menuTextClassName={menuTextClassName}
            menuHoverClassName={menuHoverClassName}
            disabledNavClassName={disabledNavClassName}
          />
        </div>
      </div>
    </header>
  );
}
