import { AnimatedThread } from "@/components/AnimatedThread";
import { BrandSystemSection } from "@/components/BrandSystemSection";
import { CTASection } from "@/components/CTASection";
import { Footer } from "@/components/Footer";
import { GallerySection } from "@/components/GallerySection";
import { Header } from "@/components/Header";
import { HeritageSection } from "@/components/HeritageSection";
import { HeroSection } from "@/components/HeroSection";
import { InitialLoader } from "@/components/InitialLoader";
import { LocationsSection } from "@/components/LocationsSection";
import { ProductsSection } from "@/components/ProductsSection";
import { StorySection } from "@/components/StorySection";

export default function Home() {
  return (
    <main className="relative isolate overflow-hidden bg-ivory">
      <InitialLoader />
      <AnimatedThread />
      <Header />
      <HeroSection />
      <HeritageSection />
      <ProductsSection />
      <BrandSystemSection />
      <StorySection />
      <LocationsSection />
      <GallerySection />
      <CTASection />
      <Footer />
    </main>
  );
}
