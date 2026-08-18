const fs = require('fs');
const JSZip = require('jszip');

async function run() {
  const data = fs.readFileSync('migration_backups/consolidated-backup.zip');
  const zip = await JSZip.loadAsync(data);
  console.log('ZIP Structure & Counts:');
  for (const name of Object.keys(zip.files)) {
    if (name.endsWith('.json')) {
      const content = await zip.files[name].async('string');
      try {
        const payload = JSON.parse(content);
        console.log(`- ${name}: ${payload.rows ? payload.rows.length : 0} rows`);
      } catch (e) {
        console.log(`- ${name}: [ERROR parsing JSON]`);
      }
    }
  }
}
run().catch(console.error);
