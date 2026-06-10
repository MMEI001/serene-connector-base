type Props = { size?: number; withWordmark?: boolean };

export function BrandMark({ size = 36, withWordmark = true }: Props) {
  return (
    <div className="flex items-center gap-2.5">
      <div
        aria-hidden
        style={{ width: size, height: size }}
        className="rounded-full bg-primary shadow-sm ring-1 ring-primary/20"
      />
      {withWordmark && (
        <span
          className="text-xl font-medium tracking-tight text-foreground"
          style={{ fontFamily: "var(--font-display)" }}
        >
          HoofdRust
        </span>
      )}
    </div>
  );
}
