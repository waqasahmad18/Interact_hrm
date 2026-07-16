/** Fixed Interact Global dotted-sphere mark — not removable. */
export function InteractGlobeLogo({
  className,
  title = "Interact Global",
}: {
  className?: string;
  title?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src="/interact-globe-logo.png"
      alt={title}
      width={240}
      height={240}
      draggable={false}
    />
  );
}
