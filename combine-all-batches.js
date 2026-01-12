const ExcelJS = require('exceljs');
const fs = require('fs');

async function combineAll() {
    // Files to combine based on conversation history:
    // Batch 1 (1-794): backup_FINAL_2026-01-09T04-58.json
    // Batch 2 (795-2469): backup_progress_2026-01-09T19-32.json
    // Batch 3 (2470-3209): backup_FINAL_2026-01-12T04-08.json
    // Batch 4 (3210-4519): backup_FINAL_2026-01-12T18-05.json

    const files = [
        './excels/backup_FINAL_2026-01-09T01-49.json',  // Batch 1 part 1 (1-43)
        './excels/backup_FINAL_2026-01-09T04-58.json',  // Batch 1 part 2 (44-794)
        './excels/backup_progress_2026-01-09T19-32.json', // Batch 2 (795-2469)
        './excels/backup_FINAL_2026-01-12T04-08.json',  // Batch 3 (2470-3209)
        './excels/backup_FINAL_2026-01-12T18-05.json'   // Batch 4 (3210-4519)
    ];

    let allPatients = [];
    let allEvolutions = [];

    for (const file of files) {
        console.log(`\n=== ${file} ===`);
        const data = JSON.parse(fs.readFileSync(file, 'utf8'));
        console.log(`Patients: ${data.patients.length}, Evolutions: ${data.evolutions.length}`);

        if (data.patients.length > 0) {
            const ids = data.patients.map(p => parseInt(p.external_id)).filter(x => !isNaN(x));
            console.log(`ID range: ${Math.min(...ids)} - ${Math.max(...ids)}`);
        }

        allPatients.push(...data.patients);
        allEvolutions.push(...data.evolutions);
    }

    console.log('\n' + '='.repeat(60));
    console.log(`TOTAL COMBINADO: ${allPatients.length} pacientes, ${allEvolutions.length} evoluciones`);
    console.log('='.repeat(60));

    // Remove duplicates based on external_id
    const uniquePatients = [];
    const seenIds = new Set();
    for (const p of allPatients) {
        if (!seenIds.has(p.external_id)) {
            seenIds.add(p.external_id);
            uniquePatients.push(p);
        }
    }
    console.log(`Pacientes únicos: ${uniquePatients.length}`);

    // Generate Excel
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pacientes');

    sheet.addRow([
        'external_id', 'name', 'lastname', 'document', 'email', 'address',
        'municipality', 'province', 'phone', 'health_insurance', 'health_insurance_plan',
        'health_insurance_number', 'birth_date', 'gender_id', 'debt_pesos', 'debt_dollars'
    ]);

    uniquePatients.forEach(p => {
        sheet.addRow([
            p.external_id, p.name, p.lastname, p.document, p.email, p.address,
            p.municipality, p.province, p.phone, p.health_insurance, p.health_insurance_plan,
            p.health_insurance_number, p.birth_date, p.gender_id, p.debt_pesos, p.debt_dollars
        ]);
    });

    // Style header
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0066CC' } };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    await workbook.xlsx.writeFile('./excels/pacientes_TODOS.xlsx');
    console.log('\nGuardado: ./excels/pacientes_TODOS.xlsx');

    // CSV de evoluciones
    const csvRows = ['external_id,date,doctor,plan_id,content'];
    allEvolutions.forEach(e => {
        const row = [
            e.external_id || '',
            e.date || '',
            e.doctor || '',
            e.plan_id || '',
            (e.content || '').replace(/"/g, '""').replace(/\n/g, ' ')
        ];
        csvRows.push(row.map(v => `"${v}"`).join(','));
    });

    fs.writeFileSync('./excels/evoluciones_TODOS.csv', csvRows.join('\n'), 'utf8');
    console.log('Guardado: ./excels/evoluciones_TODOS.csv');

    // JSON backup
    fs.writeFileSync('./excels/backup_TODOS.json', JSON.stringify({ patients: uniquePatients, evolutions: allEvolutions }, null, 2));
    console.log('Guardado: ./excels/backup_TODOS.json');

    // Estadísticas de deuda
    let totalDeuda = 0;
    let pacientesConDeuda = 0;
    uniquePatients.forEach(p => {
        const deuda = parseFloat(p.debt_pesos || 0);
        if (deuda > 0) {
            totalDeuda += deuda;
            pacientesConDeuda++;
        }
    });

    console.log(`\n=== ESTADÍSTICAS FINALES ===`);
    console.log(`Total pacientes únicos: ${uniquePatients.length}`);
    console.log(`Total evoluciones: ${allEvolutions.length}`);
    console.log(`Pacientes con deuda: ${pacientesConDeuda}`);
    console.log(`Deuda total: $${totalDeuda.toLocaleString('es-AR')}`);
}

combineAll().catch(console.error);
