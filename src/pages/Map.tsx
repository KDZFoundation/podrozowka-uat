import Header from "@/components/Header";
import Footer from "@/components/Footer";
import DistributionMap from "@/components/DistributionMap";

const Map = () => (
  <div className="min-h-screen bg-background">
    <Header />
    <main id="main-content" className="pt-16 md:pt-20">
      <DistributionMap />
    </main>
    <Footer />
  </div>
);

export default Map;
