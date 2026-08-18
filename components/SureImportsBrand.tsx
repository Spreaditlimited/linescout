import Image from "next/image";

export default function SureImportsBrand({
  inverted = false,
  compact = false,
  priority = false,
}: {
  inverted?: boolean;
  compact?: boolean;
  priority?: boolean;
}) {
  return (
    <span className="inline-flex flex-col items-start">
      <Image
        src={`https://www.sureimports.com/images/${inverted ? "logo-white.png" : "logo.png"}`}
        alt="Sure Imports"
        width={664}
        height={106}
        priority={priority}
        className={compact ? "h-6 w-auto" : "h-7 w-auto sm:h-8"}
      />
      <span className={`mt-1 flex items-center gap-2 ${inverted ? "text-white/75" : "text-slate-600"}`}>
        <span className="h-px w-4 bg-orange-500" aria-hidden="true" />
        <span className="text-[9px] font-black uppercase tracking-[0.24em] sm:text-[10px]">LineScout</span>
        <span className={`hidden text-[8px] font-semibold uppercase tracking-[0.12em] sm:inline ${inverted ? "text-white/40" : "text-slate-400"}`}>
          Sourcing intelligence
        </span>
      </span>
    </span>
  );
}
