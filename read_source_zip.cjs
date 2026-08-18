const fs = require('fs');
const JSZip = require('jszip');

async function run() {
  const data = fs.readFileSync('migration_backups/bubbles-backup-2026-07-01.zip');
  const zip = await JSZip.loadAsync(data);
  console.log('Original Bubbles ZIP files:');
  for (const name of Object.keys(zip.files)) {
    if (name.endsWith('.json')) {
      const content = await zip.files[name].async('string');
      try {
        const payload = JSON.parse(content);
        let rowsCount = 0;
        if (payload.rows) rowsCount = payload.rows.length;
        else if (Array.isArray(payload)) rowsCount = payload.length; // old format?
        console.log(`- ${name}: ${rowsCount} rows`);
      } catch (e) {
        console.log(`- ${name}: [ERROR parsing JSON]`);
      }
    }
  }
}
run().catch(console.error);
