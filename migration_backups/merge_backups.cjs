const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const JSZip = require('jszip');

const BACKUPS_DIR = './migration_backups';
const OUTPUT_ZIP_PATH = path.join(BACKUPS_DIR, 'consolidated-backup.zip');

const VERSIONED_TABLES = [
  'products',
  'customers',
  'orders',
  'order_items',
  'deposits',
  'expenses',
  'shipping_details',
  'stock_alerts',
  'order_returns',
  'order_refunds'
];

const GLOBAL_TABLES = ['app_settings', 'staff_members'];

async function merge() {
  console.log('Starting migration backup merge...');

  // 1. Find all zip files in migration_backups (except consolidated-backup.zip)
  const files = fs.readdirSync(BACKUPS_DIR);
  const zipFiles = files.filter(f => f.endsWith('.zip') && f !== 'consolidated-backup.zip');

  if (zipFiles.length === 0) {
    console.error('No backup ZIP files found in migration_backups folder. Please copy the 4 files there and try again.');
    return;
  }

  console.log(`Found ${zipFiles.length} backup files:`, zipFiles);

  const mergedData = {
    versions: [],
    products: [],
    customers: [],
    orders: [],
    order_items: [],
    deposits: [],
    expenses: [],
    shipping_details: [],
    stock_alerts: [],
    order_returns: [],
    order_refunds: [],
    app_settings: [],
    staff_members: []
  };

  // Track global IDs to check and resolve collisions
  const existingIds = new Set();
  
  for (let idx = 0; idx < zipFiles.length; idx++) {
    const zipName = zipFiles[idx];
    const zipPath = path.join(BACKUPS_DIR, zipName);
    console.log(`\nProcessing: ${zipName}...`);

    // Propose branch name based on ZIP filename (clean up timestamps and words like backup)
    let branchName = zipName
      .replace(/\.zip$/i, '')
      .split(/[-_]backup|[-_]auto[-_]backup|[-_]\d/i)[0]
      .replace(/[-_]/g, ' ')
      .trim();
    
    if (!branchName || branchName.toLowerCase() === 'babyland') {
      branchName = `الفرع ${idx + 1}`;
    } else {
      // Capitalize first letter of each word
      branchName = branchName
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
    }

    const versionId = crypto.randomUUID();
    console.log(`Assigned version name: "${branchName}" with ID: ${versionId}`);

    // Create the version row
    mergedData.versions.push({
      id: versionId,
      name: branchName,
      is_active: false,
      created_at: new Date().toISOString()
    });

    // Load zip
    const zipData = fs.readFileSync(zipPath);
    const zip = await JSZip.loadAsync(zipData);

    const projectData = {};
    const idMap = new Map(); // maps old_id -> new_id for collisions

    // Extract all JSON contents from this ZIP
    for (const [relativePath, entry] of Object.entries(zip.files)) {
      if (entry.dir || !relativePath.endsWith('.json') || relativePath.endsWith('manifest.json')) continue;
      
      const content = await entry.async('string');
      try {
        const payload = JSON.parse(content);
        const baseName = path.basename(relativePath, '.json');
        
        let tableName = payload?.table;
        if (!tableName && baseName === '_version') tableName = 'versions';
        if (!tableName) tableName = baseName;

        let rows = [];
        if (Array.isArray(payload)) {
          rows = payload;
        } else if (payload && Array.isArray(payload.rows)) {
          rows = payload.rows;
        }

        if (rows && rows.length > 0) {
          if (!projectData[tableName]) {
            projectData[tableName] = [];
          }
          projectData[tableName].push(...rows);
        }
      } catch (e) {
        console.warn(`Failed to parse JSON file in zip: ${relativePath}`, e);
      }
    }

    // Deduplicate accumulated rows within the project by row.id
    for (const table of Object.keys(projectData)) {
      const uniqueRowsMap = new Map();
      for (const row of projectData[table]) {
        if (row && row.id) {
          uniqueRowsMap.set(row.id, row);
        } else {
          uniqueRowsMap.set(`${uniqueRowsMap.size}_${Math.random()}`, row);
        }
      }
      projectData[table] = Array.from(uniqueRowsMap.values());
    }

    // Identify and resolve ID collisions
    // We process parent tables first to populate the idMap before children use them
    const tablesInOrder = [
      'versions', 'app_settings', 'staff_members', 'products', 'customers', 
      'orders', 'order_items', 'deposits', 'expenses', 'shipping_details', 
      'stock_alerts', 'order_returns', 'order_refunds'
    ];

    for (const table of tablesInOrder) {
      const rows = projectData[table] || [];
      for (const row of rows) {
        if (row.id) {
          if (existingIds.has(row.id)) {
            // Collision detected! Generate a new UUID.
            const newId = crypto.randomUUID();
            idMap.set(row.id, newId);
            console.log(`Collision resolved: Table ${table}, ID ${row.id} -> ${newId}`);
            row.id = newId;
          } else {
            existingIds.add(row.id);
          }
        }
      }
    }

    // Remap Foreign Keys to use the newly generated IDs
    for (const table of tablesInOrder) {
      if (table === 'versions') continue; // Skip importing old version rows from the ZIP
      const rows = projectData[table] || [];
      for (const row of rows) {
        // Remap customer_id in orders
        if (row.customer_id && idMap.has(row.customer_id)) {
          row.customer_id = idMap.get(row.customer_id);
        }
        // Remap order_id in order_items, deposits, order_refunds
        if (row.order_id && idMap.has(row.order_id)) {
          row.order_id = idMap.get(row.order_id);
        }
        // Remap product_id in order_items, stock_alerts, order_refunds
        if (row.product_id && idMap.has(row.product_id)) {
          row.product_id = idMap.get(row.product_id);
        }
        // Remap staff_member_id in orders
        if (row.staff_member_id && idMap.has(row.staff_member_id)) {
          row.staff_member_id = idMap.get(row.staff_member_id);
        }

        // Set version_id for versioned tables
        if (VERSIONED_TABLES.includes(table) || table === 'staff_members' || table === 'app_settings') {
          row.version_id = versionId;
        }

        // Push to merged collection
        if (mergedData[table]) {
          mergedData[table].push(row);
        }
      }
    }
  }

  // 3. Build a consolidated ZIP archive
  console.log('\nCreating consolidated backup zip...');
  const outZip = new JSZip();

  const manifest = {
    version: 2,
    layout: 'by-version',
    created_at: new Date().toISOString(),
    app: 'babyland',
    global: {
      versions: mergedData.versions.length
    },
    versions: []
  };

  const globalFolder = outZip.folder('global');
  
  // Versions list
  globalFolder.file('versions.json', JSON.stringify({
    table: 'versions',
    version: 1,
    exported_at: new Date().toISOString(),
    count: mergedData.versions.length,
    rows: mergedData.versions
  }, null, 2));

  // Write files for each version
  const versionsFolder = outZip.folder('versions');
  
  for (const v of mergedData.versions) {
    const folderName = `${v.name.replace(/[^a-zA-Z0-9\u0600-\u06FF_\- ]/g, '_').trim() || 'unnamed'}__${v.id.slice(0, 8)}`;
    const vFolder = versionsFolder.folder(folderName);

    const versionManifest = {
      version_id: v.id,
      version_name: v.name,
      is_active: false,
      tables: {}
    };

    // Save _version.json
    vFolder.file('_version.json', JSON.stringify({
      table: 'versions',
      version: 1,
      rows: [v]
    }, null, 2));

    // Save versioned tables
    const tablesToSave = [...VERSIONED_TABLES, ...GLOBAL_TABLES];

    for (const table of tablesToSave) {
      const rows = mergedData[table].filter(r => r.version_id === v.id);
      vFolder.file(`${table}.json`, JSON.stringify({
        table,
        version: 1,
        exported_at: new Date().toISOString(),
        count: rows.length,
        rows
      }, null, 2));
      versionManifest.tables[table] = rows.length;
    }

    vFolder.file('manifest.json', JSON.stringify(versionManifest, null, 2));
    manifest.versions.push({
      id: v.id,
      name: v.name,
      folder: `versions/${folderName}`,
      tables: versionManifest.tables
    });
  }

  outZip.file('manifest.json', JSON.stringify(manifest, null, 2));
  
  const content = await outZip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(OUTPUT_ZIP_PATH, content);
  
  console.log(`\nSuccessfully created consolidated backup at: ${OUTPUT_ZIP_PATH}`);
  console.log(`Total merged versions: ${mergedData.versions.length}`);
}

merge().catch(err => console.error('Error merging backups:', err));
