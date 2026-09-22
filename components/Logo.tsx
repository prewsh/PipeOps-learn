import Image from "next/image";

/**
 * The PipeOps mark.
 *
 * Two files: the wordmark is ink on light and white on the admin's
 * ink-surface rail, while the rocket keeps its brand purple in both.
 *
 * Intrinsic dimensions are passed so Next can reserve space, and the rendered
 * size comes from CSS with `h-auto` on the counterpart axis — otherwise Next
 * warns that only one dimension was overridden.
 */
const INTRINSIC = { width: 901, height: 213 };

export function Logo({
  variant = "dark",
  height = 26,
  className = "",
}: {
  variant?: "dark" | "white";
  height?: number;
  className?: string;
}) {
  return (
    <Image
      src={variant === "white" ? "/brand/pipeops-logo-white.svg" : "/brand/pipeops-logo.svg"}
      alt="PipeOps"
      width={INTRINSIC.width}
      height={INTRINSIC.height}
      priority
      className={`h-auto w-auto ${className}`}
      style={{ height, width: "auto" }}
    />
  );
}
