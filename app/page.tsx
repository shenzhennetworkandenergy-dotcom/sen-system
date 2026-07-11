import { BrandsSection } from "@/components/home/BrandsSection";
import { CapabilitiesSection } from "@/components/home/CapabilitiesSection";
import { FeaturedProducts } from "@/components/home/FeaturedProducts";
import { FeaturedSolutions } from "@/components/home/FeaturedSolutions";
import { FinalCta } from "@/components/home/FinalCta";
import { HeroSection } from "@/components/home/HeroSection";
import { IndustriesSection } from "@/components/home/IndustriesSection";
import { ProjectWorkflow } from "@/components/home/ProjectWorkflow";
import { TechnologyShowcase } from "@/components/home/TechnologyShowcase";
import { WhyChooseSen } from "@/components/home/WhyChooseSen";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";

export default function Home() {
  return <><PublicHeader /><main><HeroSection /><TechnologyShowcase /><FeaturedProducts /><FeaturedSolutions /><WhyChooseSen /><IndustriesSection /><ProjectWorkflow /><CapabilitiesSection /><BrandsSection /><FinalCta /></main><PublicFooter /></>;
}
