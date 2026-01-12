require('dotenv').config();
const { login } = require('./login');
const ExcelJS = require('exceljs');
const fs = require('fs');

const START_ID = parseInt(process.argv[2]) || 1;
const END_ID = parseInt(process.argv[3]) || 794;
const MAX_CONSECUTIVE_FAILURES = 100;
const RETRY_ON_ERROR = 3;

async function closeTutorials(page) {
    try {
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => {
                document.querySelectorAll('[role="alertdialog"], [role="dialog"]').forEach(d => {
                    const btn = d.querySelector('button');
                    if (btn) btn.click();
                });
            });
            await page.waitForTimeout(500);
        }
    } catch (e) {}
}

async function searchPatient(page, id) {
    try {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(200);

        const filterBtns = await page.$$('#searchbar-patient button');
        if (filterBtns.length >= 2) {
            await filterBtns[1].click();
            await page.waitForTimeout(400);
            await page.evaluate(() => {
                document.querySelectorAll('[role="menuitemradio"]').forEach(item => {
                    if (item.textContent?.includes('Historia clínica')) item.click();
                });
            });
            await page.waitForTimeout(400);
        }

        const searchInput = await page.$('[placeholder*="historia clínica"], [placeholder*="Historia clínica"]');
        if (!searchInput) return false;

        await searchInput.click({ clickCount: 3 });
        await page.keyboard.press('Backspace');
        await searchInput.type(id.toString(), { delay: 30 });

        try {
            await page.waitForSelector('[role="listbox"] table tbody tr', { timeout: 3000 });
            return true;
        } catch (e) {
            return false;
        }
    } catch (e) {
        return false;
    }
}

async function extractPersonalData(page) {
    // Click en resultado
    await page.evaluate(() => {
        const row = document.querySelector('[role="listbox"] table tbody tr');
        if (row) row.click();
    });
    await page.waitForTimeout(2000);

    return await page.evaluate(() => {
        const getByName = (n) => document.querySelector(`[name="${n}"]`)?.value?.trim() || '';

        // Deuda - SOLO saldo deudor (rojo)
        let debtPesos = '0', debtDollars = '0';
        document.querySelectorAll('button[data-state="closed"] div').forEach(div => {
            if (!div.classList.contains('text-red-500')) return;
            const t = div.textContent.trim();
            if (t.startsWith('$')) debtPesos = t.replace('$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
            else if (t.startsWith('USD')) debtDollars = t.replace('USD', '').replace(/\./g, '').replace(',', '.');
        });

        // Nombre
        const nombre = getByName('full_name');
        const partes = nombre.trim().split(/\s+/);

        // Fecha nacimiento
        const allInputs = document.querySelectorAll('input');
        let birthDay = '', birthMonth = '', birthYear = '';
        if (allInputs[4]) birthDay = allInputs[4].value || '';
        if (allInputs[5]) birthMonth = allInputs[5].value || '';
        if (allInputs[6]) birthYear = allInputs[6].value || '';

        let birthDate = '';
        if (birthDay && birthMonth && birthYear) {
            birthDate = `${birthYear}-${birthMonth.padStart(2, '0')}-${birthDay.padStart(2, '0')}`;
        }

        // Genero - buscar combobox
        let genderId = '';
        const sexoLabels = document.querySelectorAll('label');
        for (const label of sexoLabels) {
            if (label.textContent.trim() === 'Sexo') {
                const container = label.parentElement;
                const btn = container.querySelector('button[role="combobox"] span');
                if (btn) {
                    const g = btn.textContent.toLowerCase();
                    if (g.includes('masculino') || g.includes('male')) genderId = '1';
                    else if (g.includes('femenino') || g.includes('female')) genderId = '2';
                    else genderId = '3';
                }
                break;
            }
        }

        return {
            external_id: getByName('clinical_history_number'),
            name: partes.slice(1).join(' ') || partes[0] || '',
            lastname: partes[0] || '',
            document: getByName('document_number') || '',
            email: getByName('email'),
            address: getByName('address'),
            municipality: getByName('city'),
            province: getByName('state'),
            phone: getByName('mobile_phone') || getByName('cellphone') || '',
            health_insurance: getByName('holder_name'),
            health_insurance_plan: '',
            health_insurance_number: getByName('affiliate_number'),
            birth_date: birthDate,
            gender_id: genderId,
            debt_pesos: debtPesos,
            debt_dollars: debtDollars
        };
    });
}

async function extractEvolutions(page, baseUrl, patientId) {
    try {
        await page.goto(`${baseUrl}/dashboard/patients/medical-history`, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(2000);
    } catch (e) {
        return [];
    }

    const evolutions = await page.evaluate((extId) => {
        const items = [];
        document.querySelectorAll('table tbody tr').forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length >= 2) {
                // Extraer fecha
                let fecha = cells[0]?.textContent?.trim() || '';
                // Convertir DD/MM/YYYY a YYYY-MM-DD
                if (fecha.includes('/')) {
                    const p = fecha.split('/');
                    if (p.length === 3) {
                        fecha = `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
                    }
                }

                items.push({
                    external_id: extId,
                    date: fecha,
                    doctor: cells[2]?.textContent?.trim() || '',
                    plan_id: '',
                    content: cells[1]?.textContent?.trim() || ''
                });
            }
        });
        return items;
    }, patientId);

    return evolutions;
}

async function scrapAllPatients() {
    console.log('='.repeat(60));
    console.log('SCRAPING COMPLETO DE PACIENTES BILOG');
    console.log('='.repeat(60));
    console.log(`Rango: ${START_ID} - ${END_ID}`);
    console.log('');

    let browser, page;
    const allPatients = [];
    const allEvolutions = [];
    let consecutiveFailures = 0;

    try {
        const loginResult = await login();
        browser = loginResult.browser;
        page = loginResult.page;

        const baseUrl = process.env.BILOG_URL.split('?')[0];
        const personalDataUrl = `${baseUrl}/dashboard/patients/personal-data`;

        // Navegar a pagina de pacientes
        await page.goto(personalDataUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(2000);
        await closeTutorials(page);

        for (let id = START_ID; id <= END_ID; id++) {
            process.stdout.write(`\r[${id}/${END_ID}] Buscando paciente #${id}...                    `);

            let retries = 0;
            let success = false;

            while (retries < RETRY_ON_ERROR && !success) {
                try {
                    // Navegar a datos personales
                    await page.goto(personalDataUrl, { waitUntil: 'networkidle2', timeout: 30000 });
                    await page.waitForTimeout(1500);

                    const found = await searchPatient(page, id);

                    if (!found) {
                        consecutiveFailures++;
                        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                            console.log(`\n\nDetenido: ${MAX_CONSECUTIVE_FAILURES} fallos consecutivos`);
                            id = END_ID + 1; // Salir del loop
                        }
                        success = true; // No reintentar si no existe
                        continue;
                    }

                    // Extraer datos personales
                    const patient = await extractPersonalData(page);

                    if (!patient.external_id && !patient.lastname) {
                        consecutiveFailures++;
                        success = true;
                        continue;
                    }

                    console.log(`\r[${id}/${END_ID}] ${patient.lastname} ${patient.name} | Deuda: $${patient.debt_pesos}                    `);

                    allPatients.push(patient);

                    // Extraer evoluciones
                    const evolutions = await extractEvolutions(page, baseUrl, patient.external_id);
                    if (evolutions.length > 0) {
                        allEvolutions.push(...evolutions);
                        console.log(`         -> ${evolutions.length} evoluciones`);
                    }

                    consecutiveFailures = 0;
                    success = true;

                } catch (e) {
                    retries++;
                    if (retries >= RETRY_ON_ERROR) {
                        console.log(`\r[${id}/${END_ID}] Error tras ${retries} intentos: ${e.message}                    `);
                        consecutiveFailures++;
                    } else {
                        await page.waitForTimeout(2000);
                    }
                }
            }

            // Guardar progreso cada 50 pacientes
            if (allPatients.length > 0 && allPatients.length % 50 === 0) {
                await saveProgress(allPatients, allEvolutions);
            }
        }

        console.log('\n');
        console.log('='.repeat(60));
        console.log(`RESUMEN: ${allPatients.length} pacientes, ${allEvolutions.length} evoluciones`);
        console.log('='.repeat(60));

        // Guardar archivos finales
        await saveProgress(allPatients, allEvolutions, true);

        await browser.close();
        return { patients: allPatients, evolutions: allEvolutions };

    } catch (error) {
        console.error('\nError fatal:', error.message);
        if (allPatients.length > 0) {
            await saveProgress(allPatients, allEvolutions, true);
        }
        if (browser) await browser.close();
        throw error;
    }
}

async function saveProgress(patients, evolutions, isFinal = false) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const prefix = isFinal ? 'FINAL' : 'progress';

    // Excel de pacientes (16 columnas)
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Pacientes');

    sheet.addRow([
        'external_id', 'name', 'lastname', 'document', 'email', 'address',
        'municipality', 'province', 'phone', 'health_insurance', 'health_insurance_plan',
        'health_insurance_number', 'birth_date', 'gender_id', 'debt_pesos', 'debt_dollars'
    ]);

    patients.forEach(p => {
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

    const patientsFile = `./excels/pacientes_${prefix}_${timestamp}.xlsx`;
    await workbook.xlsx.writeFile(patientsFile);
    console.log(`\nGuardado: ${patientsFile} (${patients.length} pacientes)`);

    // CSV de evoluciones
    if (evolutions.length > 0) {
        const csvRows = ['external_id,date,doctor,plan_id,content'];
        evolutions.forEach(e => {
            const row = [
                e.external_id || '',
                e.date || '',
                e.doctor || '',
                e.plan_id || '',
                (e.content || '').replace(/"/g, '""').replace(/\n/g, ' ')
            ];
            csvRows.push(row.map(v => `"${v}"`).join(','));
        });

        const evolutionsFile = `./excels/evoluciones_${prefix}_${timestamp}.csv`;
        fs.writeFileSync(evolutionsFile, csvRows.join('\n'), 'utf8');
        console.log(`Guardado: ${evolutionsFile} (${evolutions.length} evoluciones)`);
    }

    // JSON backup
    const jsonFile = `./excels/backup_${prefix}_${timestamp}.json`;
    fs.writeFileSync(jsonFile, JSON.stringify({ patients, evolutions }, null, 2));
    console.log(`Guardado: ${jsonFile}`);
}

if (require.main === module) {
    scrapAllPatients()
        .then(({ patients, evolutions }) => {
            console.log(`\nCompletado: ${patients.length} pacientes, ${evolutions.length} evoluciones`);
            process.exit(0);
        })
        .catch(e => {
            console.error('\nFallido:', e.message);
            process.exit(1);
        });
}

module.exports = { scrapAllPatients };
