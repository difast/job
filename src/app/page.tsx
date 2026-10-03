import type { Metadata } from 'next';
import { getUser } from '@/lib/auth';
import { FinalCta, Features, Hero, HowItWorks, LandingFooter, LandingHeader, Pricing, Professions } from '@/components/landing';

export const metadata: Metadata = {
  title: 'Карьерный навигатор — резюме, вакансии и собеседования под вашу профессию',
  description: 'AI-платформа: анализ резюме, адаптация под вакансию, сопроводительные письма и подготовка к собеседованию для вашей профессии и уровня.',
};

export default async function Landing() {
  const signedIn = !!(await getUser());
  return (
    <>
      <LandingHeader signedIn={signedIn} />
      <main>
        <Hero signedIn={signedIn} />
        <HowItWorks />
        <Features />
        <Professions />
        <Pricing signedIn={signedIn} />
        <FinalCta signedIn={signedIn} />
      </main>
      <LandingFooter />
    </>
  );
}
