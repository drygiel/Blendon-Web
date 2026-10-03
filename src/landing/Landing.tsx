import { FinalCta } from './sections/cta/FinalCta.tsx';
import { Features } from './sections/features/Features.tsx';
import { Footer } from './sections/footer/Footer.tsx';
import { Hero } from './sections/hero/Hero.tsx';
import { UnderTheHood } from './sections/hood/UnderTheHood.tsx';
import { PromoVideo } from './sections/video/PromoVideo.tsx';
import { PieMenus } from './sections/pies/PieMenus.tsx';
import { Playground } from './sections/playground/Playground.tsx';
import { Precision } from './sections/precision/Precision.tsx';
import { Setup } from './sections/setup/Setup.tsx';
import { Shortcuts } from './sections/shortcuts/Shortcuts.tsx';
import { SpecStrip } from './sections/spec/SpecStrip.tsx';
import { Tutorial } from './sections/tutorial/Tutorial.tsx';

export function Landing() {
  return (
    <>
      <Hero />
      <main>
        <SpecStrip />
        <Features />
        <Precision />
        <PieMenus />
        <Setup />
        <Playground />
        <Tutorial />
        <Shortcuts />
        <UnderTheHood />
        <PromoVideo />
        <FinalCta />
      </main>
      <Footer />
    </>
  );
}
