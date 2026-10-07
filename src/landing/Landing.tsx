import { Compare } from './sections/compare/Compare.tsx';
import { FinalCta } from './sections/cta/FinalCta.tsx';
import { Faq } from './sections/faq/Faq.tsx';
import { Features } from './sections/features/Features.tsx';
import { Footer } from './sections/footer/Footer.tsx';
import { PlotterLayer } from './plotter/PlotterLayer.tsx';
import { Hero } from './sections/hero/Hero.tsx';
import { UnderTheHood } from './sections/hood/UnderTheHood.tsx';
import { PromoVideo } from './sections/video/PromoVideo.tsx';
import { Pace } from './sections/pace/Pace.tsx';
import { PieMenus } from './sections/pies/PieMenus.tsx';
import { Precision } from './sections/precision/Precision.tsx';
import { SceneSection } from './sections/scene/SceneSection.tsx';
import { Setup } from './sections/setup/Setup.tsx';
import { Shortcuts } from './sections/shortcuts/Shortcuts.tsx';
import { Tutorial } from './sections/tutorial/Tutorial.tsx';

export function Landing() {
  return (
    <>
      <PlotterLayer />
      <Hero />
      <main>
        <PromoVideo />
        <Compare />
        <Features />
        <Precision />
        <PieMenus />
        <Tutorial />
        <Setup />
        <Pace />
        <SceneSection />
        <Shortcuts />
        <UnderTheHood />
        <Faq />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
