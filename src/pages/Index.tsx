import Header from "@/components/Header";
import Hero from "@/components/Hero";
import About from "@/components/About";
import LanguageShowcase from "@/components/LanguageShowcase";
import PhotoGallery from "@/components/PhotoGallery";
import Footer from "@/components/Footer";
import CommunityLoop from "@/components/CommunityLoop";

const Index = () => (
  <div className="min-h-screen bg-background">
    <Header />
    <main id="main-content">
      <Hero />
      <CommunityLoop />
      <About />
      <LanguageShowcase />
      <PhotoGallery />
    </main>
    <Footer />
  </div>
);

export default Index;
