import { FinalCta } from './sections/cta/FinalCta.tsx';
import { Features } from './sections/features/Features.tsx';
import { Footer } from './sections/footer/Footer.tsx';
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
      <Hero />
      <main>
        <PromoVideo />
        <Features />
        <Precision />
        <PieMenus />
        <Tutorial />
        <Setup />
        <Pace />
        <SceneSection />
        <Shortcuts />
        <UnderTheHood />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
