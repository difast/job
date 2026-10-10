export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startPartnerJobs, startMailJobs } = await import('./instrumentation-node');
    startPartnerJobs();
    startMailJobs();
  }
}
