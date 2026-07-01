import Image from "next/image";

type SessaSignatureProps = {
  animate?: boolean;
  ariaLabel?: string;
  className?: string;
  idSuffix?: string;
  tail?: "none" | "short" | "long";
};

export function SessaSignature({
  animate = false,
  ariaLabel = "Sessa",
  className = "",
  idSuffix,
  tail = "short"
}: SessaSignatureProps) {
  if (animate) {
    const isLong = tail === "long";
    const viewBox = isLong ? "0 0 1160 280" : "0 0 620 240";
    const textX = isLong ? 394 : 110;
    const textY = isLong ? 186 : 166;
    const fontSize = isLong ? 178 : 142;
    const leftFlourishPath = isLong
      ? "M28 178 C126 132 290 138 426 176 C302 214 110 210 34 184 C-8 166 35 146 122 148 C236 150 342 168 392 183"
      : "M18 154 C78 126 166 130 238 153 C164 178 62 178 20 160 C-4 150 20 139 70 140 C134 141 198 152 226 160";
    const tailPath = isLong
      ? "M786 166 C872 176 946 145 1160 90"
      : "M388 148 C460 158 526 136 608 112";
    const clipId = `sessa-signature-reveal-${idSuffix ?? tail}`;

    return (
      <svg
        aria-label={ariaLabel}
        className={`sessa-signature sessa-signature--drawn ${
          animate ? "sessa-signature--animate" : ""
        } sessa-signature--${tail} ${className}`}
        role="img"
        viewBox={viewBox}
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <clipPath id={clipId}>
            <rect
              className="sessa-signature__reveal"
              height="100%"
              width="100%"
              x="0"
              y="0"
            />
          </clipPath>
        </defs>
        <path
          className="sessa-signature__flourish"
          d={leftFlourishPath}
          fill="none"
          pathLength={1}
        />
        <g clipPath={`url(#${clipId})`}>
          <text
            className="sessa-signature__word"
            dominantBaseline="alphabetic"
            fontSize={fontSize}
            style={{ fontFamily: "var(--font-signature), var(--font-script), cursive" }}
            x={textX}
            y={textY}
          >
            Sessa
          </text>
        </g>
        {tail !== "none" ? (
          <path
            className="sessa-signature__tail"
            d={tailPath}
            fill="none"
            pathLength={1}
          />
        ) : null}
      </svg>
    );
  }

  return (
    <span
      aria-label={ariaLabel}
      className={`sessa-signature sessa-signature--logo sessa-signature--${tail} ${className}`}
      role="img"
    >
      <span className="sessa-signature__image-wrap">
        <Image
          alt=""
          aria-hidden="true"
          className="sessa-signature__image"
          draggable={false}
          height={489}
          priority={tail === "long"}
          src="/brand/sessa-logo-white.png"
          unoptimized
          width={1800}
        />
      </span>
    </span>
  );
}
