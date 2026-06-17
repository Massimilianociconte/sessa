import Image from "next/image";
import { assetPath } from "@/lib/paths";

export function HeroSection() {
  return (
    <section id="top" className="relative bg-ivory">
      <div className="relative overflow-hidden bg-white">
        <div className="mx-auto flex min-h-[200px] max-w-[1480px] items-center justify-center px-4 py-7 sm:min-h-[260px] lg:min-h-[320px]">
          <h1 className="relative z-30 font-script text-[clamp(8rem,24vw,23rem)] leading-[0.72] text-terracotta">
            Sessa
          </h1>
        </div>
      </div>
      <div className="relative mx-auto h-[430px] w-full max-w-[1480px] overflow-hidden bg-ink sm:h-[560px] lg:h-[690px]">
        <Image
          src={assetPath("/images/editorial/baba-hero-cinematic.jpg")}
          alt="Babà napoletani serviti su un piatto decorato"
          fill
          priority
          sizes="100vw"
          className="object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-ink/44 via-ink/[0.08] to-ink/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-ink/34 via-transparent to-transparent" />
        <div className="relative z-30 flex h-full items-start px-6 pt-10 sm:px-10 sm:pt-14 lg:px-16 lg:pt-12">
          <p
            className="max-w-[980px] font-serif text-[clamp(3.15rem,7vw,8rem)] font-medium leading-[0.88] text-white"
            style={{ textShadow: "0 10px 34px rgba(23, 20, 18, 0.54)" }}
          >
            Dal 1930
            <br />
            Un&apos;esplosione di
            <br />
            gusto e felicità
          </p>
        </div>
      </div>
    </section>
  );
}
