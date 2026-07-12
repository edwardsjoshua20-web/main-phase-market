import { uploadPublicDataSelection } from './lib/supabase-public-data-upload.mjs';

async function main() {
  const uploadPrefix = process.argv[2] || '';
  const includeImages = process.argv.includes('--include-images');
  const quietProgress = process.argv.includes('--quiet-progress');
  const normalizedPrefix = String(uploadPrefix || '').trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  const relativePaths = normalizedPrefix ? [normalizedPrefix] : ['data'];
  await uploadPublicDataSelection(
    { relativePaths },
    { projectRoot: process.cwd(), includeImages, quietProgress }
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
