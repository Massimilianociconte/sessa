import Image from "next/image";
import { assetPath } from "@/lib/paths";

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
    const maskId = `sessa-signature-mask-${idSuffix ?? tail}`;
    const logoPath = assetPath("/brand/sessa-logo-white.png");
    const writingPath =
      "M2 365 C92 292 258 254 430 254 C600 254 704 298 768 382 C805 429 832 471 868 466 C900 461 895 393 886 329 C877 262 864 186 888 101 C908 30 944 -6 970 28 C1002 71 947 142 883 193 C823 242 750 258 701 248 C760 260 834 238 882 193 C870 245 874 297 884 352 C896 421 933 456 970 421 C1012 381 1052 281 1025 268 C1000 256 949 318 953 367 C958 429 1045 416 1094 361 C1140 310 1165 257 1178 251 C1197 241 1194 281 1168 323 C1135 377 1130 451 1174 451 C1217 451 1264 382 1308 321 C1336 282 1362 253 1380 262 C1403 274 1374 326 1338 358 C1288 404 1264 454 1303 455 C1355 457 1387 382 1418 321 C1448 266 1498 276 1499 337 C1500 392 1435 435 1389 412 C1344 390 1366 316 1430 292 C1488 270 1525 325 1501 383 C1482 431 1530 451 1600 427 C1670 403 1734 391 1800 407";

    return (
      <svg
        aria-label={ariaLabel}
        className={`sessa-signature sessa-signature--drawn ${
          animate ? "sessa-signature--animate" : ""
        } sessa-signature--${tail} ${className}`}
        role="img"
        viewBox="0 0 1800 489"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <mask
            height="589"
            id={maskId}
            maskContentUnits="userSpaceOnUse"
            maskUnits="userSpaceOnUse"
            width="1900"
            x="-50"
            y="-50"
          >
            <rect fill="black" height="589" width="1900" x="-50" y="-50" />
            <path
              className="sessa-signature__mask-stroke sessa-signature__mask-stroke--main"
              d={writingPath}
              fill="none"
              pathLength={1}
            />
          </mask>
        </defs>
        <image
          className="sessa-signature__draw-image"
          height="489"
          href={logoPath}
          mask={`url(#${maskId})`}
          preserveAspectRatio="xMidYMid meet"
          width="1800"
          x="0"
          y="0"
        />
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
          src={assetPath("/brand/sessa-logo-white.png")}
          unoptimized
          width={1800}
        />
      </span>
    </span>
  );
}
