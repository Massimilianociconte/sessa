import { AnimatedThread } from "@/components/AnimatedThread";
import { CTASection } from "@/components/CTASection";
import { Footer } from "@/components/Footer";
import { GallerySection } from "@/components/GallerySection";
import { Header } from "@/components/Header";
import { HeritageSection } from "@/components/HeritageSection";
import { HeroSection } from "@/components/HeroSection";
import { LocationsSection } from "@/components/LocationsSection";
import { ProductsSection } from "@/components/ProductsSection";
import { StorySection } from "@/components/StorySection";
import { TileBand } from "@/components/TileTexture";

export default function Home() {
  return (
    <main className="relative isolate overflow-hidden bg-ivory">
      <AnimatedThread />
      <Header />
      <HeroSection />
      <TileBand className="relative z-30" overlayClassName="bg-ivory/12" />
      <HeritageSection />
      <ProductsSection />
      <StorySection />
      <LocationsSection />
      <GallerySection />
      <CTASection />
      <Footer />
    </main>
  );
}
