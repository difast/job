/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: ['pdfkit', 'pdf-parse', 'mammoth', '@prisma/client', 'bcryptjs'],
  outputFileTracingIncludes: { '/api/adaptations/[id]/pdf': ['./assets/fonts/**'] },
};
