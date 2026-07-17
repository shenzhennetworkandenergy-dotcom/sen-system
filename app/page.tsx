import { BusinessCategories } from "@/components/home/BusinessCategories";
import { BrandsSection } from "@/components/home/BrandsSection";
import { CapabilitiesSection } from "@/components/home/CapabilitiesSection";
import { CompanyIntroduction } from "@/components/home/CompanyIntroduction";
import { FeaturedProducts } from "@/components/home/FeaturedProducts";
import { FeaturedSolutions } from "@/components/home/FeaturedSolutions";
import { FinalCta } from "@/components/home/FinalCta";
import { HeroSection } from "@/components/home/HeroSection";
import { IndustriesSection } from "@/components/home/IndustriesSection";
import { ProjectWorkflow } from "@/components/home/ProjectWorkflow";
import { WhyChooseSen } from "@/components/home/WhyChooseSen";
import { PublicFooter } from "@/components/layout/PublicFooter";
import { PublicHeader } from "@/components/layout/PublicHeader";

export const dynamic = "force-dynamic";

export default function Home() {
  return <><PublicHeader /><main><HeroSection /><BusinessCategories /><CompanyIntroduction /><FeaturedSolutions /><FeaturedProducts /><WhyChooseSen /><IndustriesSection /><ProjectWorkflow /><CapabilitiesSection /><BrandsSection /><FinalCta /></main><PublicFooter /></>;
}
