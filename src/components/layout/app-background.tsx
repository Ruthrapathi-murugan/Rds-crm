import type { CSSProperties } from "react";

/**
 * Decorative backdrop behind the app: a soft colour mesh, three slowly drifting
 * glows and a faint dot grid. Blobs use radial gradients (not CSS blur) and
 * animate only `transform`, so they stay on the compositor and are cheap.
 */
export function AppBackground() {
  return (
    <div aria-hidden="true" className="no-print bg-mesh pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="animate-float absolute -top-40 -left-32 size-[38rem] rounded-full bg-[radial-gradient(circle,var(--mesh-1),transparent_65%)]"
        style={{ "--float-duration": "18s", "--float-x": "60px", "--float-y": "40px" } as CSSProperties}
      />
      <div
        className="animate-float absolute -top-24 right-[-10rem] size-[34rem] rounded-full bg-[radial-gradient(circle,var(--mesh-2),transparent_65%)]"
        style={{ "--float-duration": "22s", "--float-x": "-50px", "--float-y": "60px" } as CSSProperties}
      />
      <div
        className="animate-float absolute right-[10%] bottom-[-14rem] size-[36rem] rounded-full bg-[radial-gradient(circle,var(--mesh-3),transparent_65%)]"
        style={{ "--float-duration": "26s", "--float-x": "-40px", "--float-y": "-50px" } as CSSProperties}
      />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,color-mix(in_oklch,var(--foreground)_7%,transparent)_1px,transparent_0)] [mask-image:linear-gradient(to_bottom,black,transparent_70%)] [background-size:24px_24px]" />
    </div>
  );
}
