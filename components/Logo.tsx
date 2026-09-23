import Image from "next/image";

/**
 * The PipeOps mark.
 *
 * Two files: the wordmark is ink on light and white on dark, while the rocket
 * keeps its brand purple in both.
 *
 * `auto` (the default) follows the theme: both files are rendered and CSS
 * shows the right one, so the server never has to know which theme the
 * browser will pick. `white` is for surfaces that are dark in every theme —
 * the admin rail.
 *
 * Intrinsic dimensions are passed so Next can reserve space, and the rendered
 * size comes from CSS with `h-auto` on the counterpart axis — otherwise Next
 * warns that only one dimension was overridden.
 */
const INTRINSIC = { width: 901, height: 213 };

export function Logo({
  variant = "auto",
  height = 26,
  className = "",
}: {
  variant?: "auto" | "white";
  height?: number;
  className?: string;
}) {
  const mark = (src: string, extra: string, decorative = false) => (
    <Image
      src={src}
      alt={decorative ? "" : "PipeOps"}
      aria-hidden={decorative || undefined}
      width={INTRINSIC.width}
      height={INTRINSIC.height}
      priority
      className={`h-auto w-auto ${extra} ${className}`}
      style={{ height, width: "auto" }}
    />
  );

  if (variant === "white") return mark("/brand/pipeops-logo-white.svg", "");

  return (
    <>
      {mark("/brand/pipeops-logo.svg", "dark:hidden")}
      {mark("/brand/pipeops-logo-white.svg", "hidden dark:block", true)}
    </>
  );
}
