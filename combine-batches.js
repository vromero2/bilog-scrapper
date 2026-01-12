const ExcelJS = require('exceljs');
const fs = require('fs');

async function combine() {
    // Cargar primer batch (1-43)
    const batch1 = JSON.parse(fs.readFileSync('./excels/backup_FINAL_2026-01-09T01-49.json', 'utf8'));

    // Cargar segundo batch (44-794)
    const batch2 = JSON.parse(fs.readFileSync('./excels/backup_FINAL_2026-01-09T04-58.json', 'utf8'));

    console.log(`Batch 1: ${batch1.patients.length} pacientes, ${batch1.evolutions.length} evoluciones`);
    console.log(`Batch 2: ${batch2.patients.length} pacientes, ${batch2.evolutions.length} evoluciones`);

    // Combinar
    const allPatients = [...batch1.patients, ...batch2.patients];
    const allEvolutions = [...batch1.evolutions, ...batch2.evolutions];

    console.log(`\nTOTAL: ${allPatients.length} pacientes, ${allEvolutions.length} evoluciones`);

    // Generar Excel de pacientes (16 columnas)
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pacientes');

    sheet.addRow([
        'external_id', 'name', 'lastname', 'document', 'email', 'address',
        'municipality', 'province', 'phone', 'health_insurance', 'health_insurance_plan',
        'health_insurance_number', 'birth_date', 'gender_id', 'debt_pesos', 'debt_dollars'
    ]);

    allPatients.forEach(p => {
        sheet.addRow([
            p.external_id, p.name, p.lastname, p.document, p.email, p.address,
            p.municipality, p.province, p.phone, p.health_insurance, p.health_insurance_plan,
            p.health_insurance_number, p.birth_date, p.gender_id, p.debt_pesos, p.debt_dollars
        ]);
    });

    // Estilo header
    sheet.getRow(1).font = { bold: true };
    sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0066CC' } };
    sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    await workbook.xlsx.writeFile('./excels/pacientes_COMPLETO.xlsx');
    console.log('\nGuardado: ./excels/pacientes_COMPLETO.xlsx');

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

    fs.writeFileSync('./excels/evoluciones_COMPLETO.csv', csvRows.join('\n'), 'utf8');
    console.log('Guardado: ./excels/evoluciones_COMPLETO.csv');

    // JSON backup
    fs.writeFileSync('./excels/backup_COMPLETO.json', JSON.stringify({ patients: allPatients, evolutions: allEvolutions }, null, 2));
    console.log('Guardado: ./excels/backup_COMPLETO.json');

    // Estadísticas de deuda
    let totalDeuda = 0;
    let pacientesConDeuda = 0;
    allPatients.forEach(p => {
        const deuda = parseFloat(p.debt_pesos || 0);
        if (deuda > 0) {
            totalDeuda += deuda;
            pacientesConDeuda++;
        }
    });

    console.log(`\n=== ESTADÍSTICAS ===`);
    console.log(`Total pacientes: ${allPatients.length}`);
    console.log(`Total evoluciones: ${allEvolutions.length}`);
    console.log(`Pacientes con deuda: ${pacientesConDeuda}`);
    console.log(`Deuda total: $${totalDeuda.toLocaleString('es-AR')}`);
}

combine().catch(console.error);
