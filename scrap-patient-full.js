require('dotenv').config();
const { login } = require('./login');
const ExcelJS = require('exceljs');
const fs = require('fs');

/**
 * Extrae datos completos de un paciente incluyendo prestaciones, pagos e historia clínica
 */
async function extractFullPatientData(page, patientId) {
    const baseUrl = process.env.BILOG_URL.split('?')[0];

    // Datos del paciente
    const patientData = {
        id: patientId,
        datos_personales: {},
        prestaciones: [],
        pagos: [],
        evoluciones: []
    };

    try {
        // 1. Navegar a datos personales del paciente
        console.log(`  📋 Extrayendo datos personales...`);
        await page.goto(`${baseUrl}/dashboard/patients/personal-data`, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(1500);

        // Buscar por Historia Clínica
        const searchInput = await page.$('[placeholder*="historia clínica"], [placeholder*="Historia clínica"], input[type="text"]');
        if (searchInput) {
            // Cambiar filtro a Historia Clínica
            const filterButtons = await page.$$('#searchbar-patient button');
            if (filterButtons.length >= 2) {
                await filterButtons[1].click();
                await page.waitForTimeout(500);
                await page.evaluate(() => {
                    const menuItems = document.querySelectorAll('[role="menuitemradio"]');
                    for (const item of menuItems) {
                        if (item.textContent?.includes('Historia clínica')) {
                            item.click();
                            return;
                        }
                    }
                });
                await page.waitForTimeout(500);
            }

            const hcInput = await page.$('[placeholder*="historia clínica"], [placeholder*="Historia clínica"]');
            if (hcInput) {
                await hcInput.click({ clickCount: 3 });
                await page.keyboard.press('Backspace');
                await hcInput.type(patientId.toString(), { delay: 30 });
                await page.waitForTimeout(2000);

                // Click en el resultado
                const clicked = await page.evaluate(() => {
                    const row = document.querySelector('[role="listbox"] table tbody tr');
                    if (row) { row.click(); return true; }
                    return false;
                });

                if (clicked) {
                    await page.waitForTimeout(2000);

                    // Extraer datos personales
                    patientData.datos_personales = await page.evaluate(() => {
                        const getByName = (name) => document.querySelector(`[name="${name}"]`)?.value?.trim() || '';
                        const getSaldos = () => {
                            let debtPesos = '0', debtDollars = '0';
                            document.querySelectorAll('button[data-state="closed"] div').forEach(div => {
                                if (!div.classList.contains('text-red-500')) return;
                                const text = div.textContent.trim();
                                if (text.startsWith('$')) debtPesos = text.replace('$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
                                else if (text.startsWith('USD')) debtDollars = text.replace('USD', '').replace(/\./g, '').replace(',', '.');
                            });
                            return { debtPesos, debtDollars };
                        };
                        const saldos = getSaldos();
                        const nombreCompleto = getByName('full_name');
                        const partes = nombreCompleto.trim().split(/\s+/);

                        return {
                            external_id: getByName('clinical_history_number'),
                            name: partes.slice(1).join(' ') || '',
                            lastname: partes[0] || '',
                            document: getByName('document_number') || '00000',
                            email: getByName('email'),
                            address: getByName('address') || '',
                            phone: getByName('cellphone') || '',
                            debt_pesos: saldos.debtPesos,
                            debt_dollars: saldos.debtDollars
                        };
                    });
                    console.log(`    ✓ ${patientData.datos_personales.lastname} ${patientData.datos_personales.name} | Deuda: $${patientData.datos_personales.debt_pesos}`);
                }
            }
        }

        // 2. Navegar a Prestaciones/Presupuestos
        console.log(`  💰 Extrayendo prestaciones...`);
        await page.goto(`${baseUrl}/dashboard/patients/budget`, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(2000);

        patientData.prestaciones = await page.evaluate(() => {
            const prestaciones = [];
            document.querySelectorAll('table tbody tr, [class*="budget"] [class*="item"]').forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length > 0) {
                    prestaciones.push({
                        descripcion: cells[0]?.textContent?.trim() || '',
                        cantidad: cells[1]?.textContent?.trim() || '',
                        precio: cells[2]?.textContent?.trim() || '',
                        estado: cells[3]?.textContent?.trim() || ''
                    });
                }
            });
            return prestaciones;
        });
        console.log(`    ✓ ${patientData.prestaciones.length} prestaciones encontradas`);

        // 3. Navegar a Pagos
        console.log(`  💳 Extrayendo pagos...`);
        await page.goto(`${baseUrl}/dashboard/patients/payments`, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(2000);

        patientData.pagos = await page.evaluate(() => {
            const pagos = [];
            document.querySelectorAll('table tbody tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length > 0) {
                    pagos.push({
                        fecha: cells[0]?.textContent?.trim() || '',
                        monto: cells[1]?.textContent?.trim() || '',
                        metodo: cells[2]?.textContent?.trim() || '',
                        estado: cells[3]?.textContent?.trim() || ''
                    });
                }
            });
            return pagos;
        });
        console.log(`    ✓ ${patientData.pagos.length} pagos encontrados`);

        // 4. Navegar a Historia Clínica / Evoluciones
        console.log(`  📝 Extrayendo evoluciones...`);
        await page.goto(`${baseUrl}/dashboard/patients/clinical-history`, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(2000);

        patientData.evoluciones = await page.evaluate(() => {
            const evoluciones = [];
            document.querySelectorAll('[class*="evolution"], [class*="history"] [class*="item"], table tbody tr').forEach(item => {
                const fecha = item.querySelector('[class*="date"], td:first-child')?.textContent?.trim() || '';
                const descripcion = item.querySelector('[class*="description"], [class*="content"], td:nth-child(2)')?.textContent?.trim() || '';
                const profesional = item.querySelector('[class*="professional"], td:nth-child(3)')?.textContent?.trim() || '';
                if (fecha || descripcion) {
                    evoluciones.push({ fecha, descripcion, profesional });
                }
            });
            return evoluciones;
        });
        console.log(`    ✓ ${patientData.evoluciones.length} evoluciones encontradas`);

    } catch (error) {
        console.log(`  ⚠️ Error: ${error.message}`);
    }

    return patientData;
}

async function scrapPatientsWithDebt() {
    console.log('👤 Buscando pacientes con deuda y evoluciones...\n');

    let browser, page;
    const patientsWithDebt = [];

    try {
        const loginResult = await login();
        browser = loginResult.browser;
        page = loginResult.page;

        const baseUrl = process.env.BILOG_URL.split('?')[0];
        const START_ID = 0;
        const END_ID = 100; // Buscar en los primeros 100

        for (let id = START_ID; id <= END_ID; id++) {
            console.log(`\n🔍 [${id}/${END_ID}] Buscando paciente #${id}...`);

            // Navegar a la página de pacientes
            await page.goto(`${baseUrl}/dashboard/patients/personal-data`, { waitUntil: 'networkidle2', timeout: 30000 });
            await page.waitForTimeout(1000);

            // Buscar por Historia Clínica
            const filterButtons = await page.$$('#searchbar-patient button');
            if (filterButtons.length >= 2) {
                await filterButtons[1].click();
                await page.waitForTimeout(300);
                await page.evaluate(() => {
                    const menuItems = document.querySelectorAll('[role="menuitemradio"]');
                    for (const item of menuItems) {
                        if (item.textContent?.includes('Historia clínica')) {
                            item.click();
                            return;
                        }
                    }
                });
                await page.waitForTimeout(300);
            }

            const hcInput = await page.$('[placeholder*="historia clínica"], [placeholder*="Historia clínica"]');
            if (!hcInput) continue;

            await hcInput.click({ clickCount: 3 });
            await page.keyboard.press('Backspace');
            await hcInput.type(id.toString(), { delay: 20 });

            try {
                await page.waitForSelector('[role="listbox"] table tbody tr', { timeout: 3000 });
            } catch (e) {
                console.log(`  ✗ No encontrado`);
                continue;
            }

            // Click en resultado
            const clicked = await page.evaluate(() => {
                const row = document.querySelector('[role="listbox"] table tbody tr');
                if (row) { row.click(); return true; }
                return false;
            });

            if (!clicked) continue;
            await page.waitForTimeout(1500);

            // Extraer datos básicos y verificar deuda
            const basicData = await page.evaluate(() => {
                const getByName = (name) => document.querySelector(`[name="${name}"]`)?.value?.trim() || '';
                let debtPesos = '0';
                document.querySelectorAll('button[data-state="closed"] div').forEach(div => {
                    if (!div.classList.contains('text-red-500')) return;
                    const text = div.textContent.trim();
                    if (text.startsWith('$')) debtPesos = text.replace('$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
                });
                return {
                    external_id: getByName('clinical_history_number'),
                    full_name: getByName('full_name'),
                    debt_pesos: debtPesos
                };
            });

            const deuda = parseFloat(basicData.debt_pesos) || 0;
            console.log(`  ✓ ${basicData.full_name} | Deuda: $${basicData.debt_pesos}`);

            if (deuda > 0) {
                console.log(`  🎯 ¡PACIENTE CON DEUDA ENCONTRADO!`);

                // Extraer datos completos
                const fullData = await extractFullPatientData(page, id);
                patientsWithDebt.push(fullData);

                // Si encontramos uno con deuda y evoluciones, perfecto
                if (fullData.evoluciones.length > 0) {
                    console.log(`\n✅ Paciente ideal encontrado: ${basicData.full_name}`);
                    console.log(`   Deuda: $${basicData.debt_pesos}`);
                    console.log(`   Evoluciones: ${fullData.evoluciones.length}`);
                    break;
                }
            }
        }

        // Guardar resultados
        if (patientsWithDebt.length > 0) {
            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
            const filename = `./excels/pacientes_deuda_${timestamp}.json`;
            fs.writeFileSync(filename, JSON.stringify(patientsWithDebt, null, 2));
            console.log(`\n💾 Datos guardados en ${filename}`);
        }

        await browser.close();
        return patientsWithDebt;

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (browser) await browser.close();
        throw error;
    }
}

scrapPatientsWithDebt()
    .then(data => {
        console.log(`\n✅ Proceso completado: ${data.length} pacientes con deuda`);
        process.exit(0);
    })
    .catch(error => {
        console.error('\n❌ Proceso fallido:', error.message);
        process.exit(1);
    });
