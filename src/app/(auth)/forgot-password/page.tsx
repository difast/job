import type { Metadata } from 'next';
import Link from 'next/link';
import PartnerFrame from '@/components/PartnerFrame';
import { ForgotForm } from '@/components/PasswordForms';

export const metadata: Metadata = { title: 'Восстановление пароля', alternates: { canonical: '/forgot-password' } };

export default function ForgotPassword() {
  return (
    <PartnerFrame>
      <h1 className="text-[24px] font-semibold tracking-tight">Восстановление пароля</h1>
      <p className="mb-6 mt-2 text-[15px] leading-relaxed text-ink-2">Укажите e-mail, с которым вы регистрировались. Мы пришлём ссылку для смены пароля.</p>
      <ForgotForm />
      <p className="mt-6 text-sm text-ink-2">Вспомнили пароль? <Link href="/login" className="font-medium text-accent-600 hover:underline">Войти</Link></p>
    </PartnerFrame>
  );
}
