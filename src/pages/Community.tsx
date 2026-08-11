import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PlatformStats from "@/components/PlatformStats";
import UserRanking from "@/components/UserRanking";
import CommunityGallery from "@/components/CommunityGallery";
import CountryCategories from "@/components/CountryCategories";

const Community = () => (
  <div className="min-h-screen bg-background">
    <Header />
    <main id="main-content" className="pt-16 md:pt-20">
      <PlatformStats />
      <CountryCategories />
      <UserRanking />
      <CommunityGallery />
    </main>
    <Footer />
  </div>
);

export default Community;
