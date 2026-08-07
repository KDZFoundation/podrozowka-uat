import Header from "@/components/Header";
import Hero from "@/components/Hero";
import PostcardPreview from "@/components/PostcardPreview";
import PlatformStats from "@/components/PlatformStats";
import About from "@/components/About";
import DistributionMap from "@/components/DistributionMap";
import CountryCategories from "@/components/CountryCategories";
import UserRanking from "@/components/UserRanking";
import CommunityGallery from "@/components/CommunityGallery";
import LanguageShowcase from "@/components/LanguageShowcase";
import PhotoGallery from "@/components/PhotoGallery";
import Footer from "@/components/Footer";
import ConnectionsGallery from "@/components/ConnectionsGallery";
import { useAuth } from "@/hooks/useAuth";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";

const Index = () => {
  const { isAdmin } = useAuth();
  const { flags } = useFeatureFlags();
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main id="main-content">
        <Hero />
        <PostcardPreview />
        <PlatformStats />
        <About />
        <DistributionMap />
        <CountryCategories />
        {isAdmin && flags?.wall_of_connections && (
          <section className="py-12 bg-muted/30">
            <div className="container mx-auto px-4">
              <div className="text-center mb-10">
                <span className="text-sm font-bold text-primary mb-2 block">BETA LAB</span>
                <h2 className="text-3xl font-display font-bold">Ściana Relacji</h2>
              </div>
              <ConnectionsGallery />
            </div>
          </section>
        )}
        <UserRanking />
        <CommunityGallery />
        <LanguageShowcase />
        <PhotoGallery />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
