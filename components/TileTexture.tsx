import type { CSSProperties } from "react";
import { assetPath } from "@/lib/paths";

type TileBaseProps = {
  className?: string;
  overlayClassName?: string;
  tileSize?: string;
};

type TileBandProps = TileBaseProps & {
  position?: CSSProperties["backgroundPosition"];
};

const tileBackground = {
  backgroundImage: `url('${assetPath("/patterns/piastrella-napoletana.png")}')`,
  backgroundRepeat: "repeat"
};

function tileStyle(tileSize: string, position?: CSSProperties["backgroundPosition"]) {
  return {
    ...tileBackground,
    backgroundPosition: position ?? "center",
    backgroundSize: `${tileSize} ${tileSize}`
  };
}

export function TileBand({
  className = "",
  overlayClassName = "bg-ivory/16",
  tileSize = "clamp(64px, 6vw, 88px)",
  position
}: TileBandProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none relative shrink-0 overflow-hidden ${className}`}
      style={{
        ...tileStyle(tileSize, position),
        height: tileSize,
        minHeight: tileSize
      }}
    >
      <div className={`absolute inset-0 ${overlayClassName}`} />
    </div>
  );
}

export function TilePanel({
  className = "",
  overlayClassName = "bg-ivory/24",
  tileSize = "118px"
}: TileBaseProps) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none relative overflow-hidden ${className}`}
      style={tileStyle(tileSize)}
    >
      <div className={`absolute inset-0 ${overlayClassName}`} />
    </div>
  );
}

export const TileTexture = TilePanel;
