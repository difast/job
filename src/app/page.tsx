import type { Metadata } from 'next';
import { getUser } from '@/lib/auth';
import { BRAND } from '@/lib/brand';
import { FinalCta, Features, Hero, HowItWorks, LandingFooter, LandingHeader, Pricing, Professions } from '@/components/landing';

export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} — резюме, вакансии и собеседования под вашу профессию` },
  description: BRAND.description,
  alternates: { canonical: '/' },
};

export default async function Landing() {
  const signedIn = !!(await getUser());
  return (
    <>
      <LandingHeader signedIn={signedIn} />
      <main>
        <Hero signedIn={signedIn} />
        <Features />
        <HowItWorks />
        <Professions signedIn={signedIn} />
        <Pricing signedIn={signedIn} />
        <FinalCta signedIn={signedIn} />
      </main>
      <LandingFooter />
    </>
  );
}
