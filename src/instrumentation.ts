export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startPartnerJobs } = await import('./instrumentation-node');
    startPartnerJobs();
  }
}
