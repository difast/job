export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startPartnerJobs, startMailJobs, startBillingJobs } = await import('./instrumentation-node');
    startPartnerJobs();
    startMailJobs();
    startBillingJobs();
    // Оплата ЮKassa: без ключей магазина оплата выключена — пишем, чего не хватает (без значений)
    if (process.env.PAYMENT_PROVIDER === 'yookassa') {
      const { ykConfig } = await import('./lib/billing/yookassa');
      const c = ykConfig();
      if (!c.ok) console.error(`[billing] PAYMENT_PROVIDER=yookassa, но не заданы: ${c.missing.join(', ')} — оплата через ЮKassa не работает`);
      else console.info('[billing] ЮKassa настроена, автопродление включено');
    }
    // Диагностика ИИ при старте: только провайдер, модель и имя недостающей переменной — без значений
    const { aiStatus } = await import('./lib/ai/provider');
    const st = aiStatus();
    if (st.provider === 'none') console.info('[ai] провайдер не настроен — AI-функции работают в упрощённом режиме без ИИ');
    else if (st.configured) console.info(`[ai] провайдер ${st.provider}, модель ${st.model}`);
    else console.error(`[ai] провайдер ${st.provider} выбран, но не настроен: ${st.problem}. AI-функции будут возвращать ошибку.`);
  }
}
