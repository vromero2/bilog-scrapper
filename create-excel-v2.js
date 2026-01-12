const ExcelJS = require('exceljs');
const fs = require('fs');

async function createExcel() {
    const data = JSON.parse(fs.readFileSync('./excels/paciente_117_completo.json', 'utf8'));
    const p = data.datos_personales;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pacientes');

    // Headers - nueva estructura de 16 columnas
    sheet.addRow([
        'external_id',           // 0
        'name',                  // 1
        'lastname',              // 2
        'document',              // 3
        'email',                 // 4
        'address',               // 5
        'municipality',          // 6
        'province',              // 7
        'phone',                 // 8
        'health_insurance',      // 9
        'health_insurance_plan', // 10
        'health_insurance_number', // 11
        'birth_date',            // 12
        'gender_id',             // 13
        'debt_pesos',            // 14
        'debt_dollars'           // 15
    ]);

    // Data row
    sheet.addRow([
        p.external_id,           // 117
        p.name,                  // DANIELA
        p.lastname,              // BARCA
        p.document,              // 16262227
        p.email,                 // DANIELABARCA2013@GMAIL.COM
        p.address,               // Los Arrayanes Nº 1128
        p.city,                  // Costa del Este -> municipality
        p.state,                 // Buenos Aires -> province
        p.phone,                 // 1149746470
        p.health_insurance,      // IOMA
        '',                      // health_insurance_plan (vacío)
        p.affiliate_number,      // 9616262227/00 -> health_insurance_number
        p.birth_date,            // 1962-12-13
        '2',                     // gender_id = 2 (Femenino)
        p.debt_pesos,            // 120000.00
        p.debt_dollars           // 0
    ]);

    const outputPath = './excels/import_barca_daniela_v2.xlsx';
    await workbook.xlsx.writeFile(outputPath);
    console.log('Excel creado:', outputPath);

    // Mostrar datos
    console.log('\nDatos a importar:');
    console.log('- external_id:', p.external_id);
    console.log('- name:', p.name);
    console.log('- lastname:', p.lastname);
    console.log('- document:', p.document);
    console.log('- email:', p.email);
    console.log('- address:', p.address);
    console.log('- municipality:', p.city);
    console.log('- province:', p.state);
    console.log('- phone:', p.phone);
    console.log('- health_insurance:', p.health_insurance);
    console.log('- health_insurance_number:', p.affiliate_number);
    console.log('- birth_date:', p.birth_date);
    console.log('- gender_id: 2 (Femenino)');
    console.log('- debt_pesos:', p.debt_pesos);
    console.log('- debt_dollars:', p.debt_dollars);
}

createExcel().catch(console.error);
