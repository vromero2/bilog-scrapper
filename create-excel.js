const ExcelJS = require('exceljs');

async function createImportExcel() {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Pacientes');

    // Headers según PatientImport.php
    worksheet.columns = [
        { header: 'external_id', key: 'external_id', width: 12 },
        { header: 'name', key: 'name', width: 20 },
        { header: 'lastname', key: 'lastname', width: 20 },
        { header: 'document', key: 'document', width: 15 },
        { header: 'email', key: 'email', width: 30 },
        { header: 'address', key: 'address', width: 30 },
        { header: 'phone', key: 'phone', width: 15 },
        { header: 'health_insurance', key: 'health_insurance', width: 20 },
        { header: 'health_insurance_plan', key: 'health_insurance_plan', width: 20 },
        { header: 'birth_date', key: 'birth_date', width: 12 },
        { header: 'debt_pesos', key: 'debt_pesos', width: 12 },
        { header: 'debt_dollars', key: 'debt_dollars', width: 12 }
    ];

    // Datos de Palacios Carina
    worksheet.addRow({
        external_id: '28',
        name: 'Carina',
        lastname: 'Palacios',
        document: '25554212',
        email: 'carinabpalacios@gmail.com',
        address: 'Av Belgrano Nº 327',
        phone: '',
        health_insurance: 'PRIVADOS',
        health_insurance_plan: '',
        birth_date: '1980-01-01',
        debt_pesos: '10000.00',
        debt_dollars: '0'
    });

    // Estilo header
    worksheet.getRow(1).font = { bold: true };
    worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
    };
    worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

    const filename = './excels/import_palacios_carina.xlsx';
    await workbook.xlsx.writeFile(filename);
    console.log(`✅ Excel creado: ${filename}`);
}

createImportExcel();
