require('dotenv').config();
const { login } = require('./login');
const fs = require('fs');

const PATIENT_ID = process.argv[2] || '3'; // Por defecto el paciente con deuda

async function extractPatient() {
    console.log(`🔍 Extrayendo datos del paciente #${PATIENT_ID}...\n`);

    let browser, page;

    try {
        const loginResult = await login();
        browser = loginResult.browser;
        page = loginResult.page;

        const baseUrl = process.env.BILOG_URL.split('?')[0];
        const patientData = { id: PATIENT_ID, datos_personales: {}, prestaciones: [], pagos: [], evoluciones: [] };

        // 1. Datos personales
        console.log('📋 Extrayendo datos personales...');
        await page.goto(`${baseUrl}/dashboard/patients/personal-data`, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(2000);

        // Cerrar tutoriales
        for (let i = 0; i < 3; i++) {
            await page.evaluate(() => {
                const dialogs = document.querySelectorAll('[role="alertdialog"], [role="dialog"]');
                dialogs.forEach(d => {
                    const closeBtn = d.querySelector('button');
                    if (closeBtn) closeBtn.click();
                });
            });
            await page.waitForTimeout(500);
        }

        // Cambiar filtro a Historia Clínica
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        const filterBtns = await page.$$('#searchbar-patient button');
        if (filterBtns.length >= 2) {
            await filterBtns[1].click();
            await page.waitForTimeout(500);
            await page.evaluate(() => {
                document.querySelectorAll('[role="menuitemradio"]').forEach(item => {
                    if (item.textContent?.includes('Historia clínica')) item.click();
                });
            });
            await page.waitForTimeout(500);
        }

        // Buscar paciente
        const searchInput = await page.$('[placeholder*="historia clínica"], [placeholder*="Historia clínica"]');
        if (searchInput) {
            await searchInput.click({ clickCount: 3 });
            await page.keyboard.press('Backspace');
            await searchInput.type(PATIENT_ID, { delay: 30 });
            await page.waitForTimeout(2000);

            // Click en resultado
            await page.evaluate(() => {
                const row = document.querySelector('[role="listbox"] table tbody tr');
                if (row) row.click();
            });
            await page.waitForTimeout(2000);

            // Extraer datos
            patientData.datos_personales = await page.evaluate(() => {
                const getByName = (n) => document.querySelector(`[name="${n}"]`)?.value?.trim() || '';

                // Extraer deuda
                let debtPesos = '0', debtDollars = '0';
                document.querySelectorAll('button[data-state="closed"] div').forEach(div => {
                    if (!div.classList.contains('text-red-500')) return;
                    const t = div.textContent.trim();
                    if (t.startsWith('$')) debtPesos = t.replace('$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
                    else if (t.startsWith('USD')) debtDollars = t.replace('USD', '').replace(/\./g, '').replace(',', '.');
                });

                // Extraer nombre
                const nombre = getByName('full_name');
                const partes = nombre.trim().split(/\s+/);

                // Extraer fecha de nacimiento (inputs 4, 5, 6 sin name)
                const allInputs = document.querySelectorAll('input');
                let birthDay = '', birthMonth = '', birthYear = '';
                if (allInputs[4]) birthDay = allInputs[4].value || '';
                if (allInputs[5]) birthMonth = allInputs[5].value || '';
                if (allInputs[6]) birthYear = allInputs[6].value || '';

                let birthDate = '';
                if (birthDay && birthMonth && birthYear) {
                    birthDate = `${birthYear}-${birthMonth.padStart(2, '0')}-${birthDay.padStart(2, '0')}`;
                }

                return {
                    external_id: getByName('clinical_history_number'),
                    name: partes.slice(1).join(' ') || partes[0] || '',
                    lastname: partes[0] || '',
                    document: getByName('document_number') || '00000',
                    email: getByName('email'),
                    address: getByName('address'),
                    city: getByName('city'),
                    state: getByName('state'),
                    phone: getByName('mobile_phone') || getByName('cellphone') || '',
                    home_phone: getByName('home_phone'),
                    work_phone: getByName('work_phone'),
                    health_insurance: getByName('holder_name'),
                    affiliate_number: getByName('affiliate_number'),
                    birth_date: birthDate,
                    marital_status: getByName('marital_status'),
                    occupation: getByName('occupation'),
                    notes: getByName('notes'),
                    alert: getByName('alert'),
                    debt_pesos: debtPesos,
                    debt_dollars: debtDollars
                };
            });
            console.log(`  ✓ ${patientData.datos_personales.lastname} ${patientData.datos_personales.name}`);
            console.log(`  💰 Deuda: $${patientData.datos_personales.debt_pesos}`);
        }

        // 2. Prestaciones (benefits)
        console.log('\n💰 Extrayendo prestaciones...');
        await page.goto(`${baseUrl}/dashboard/patients/benefits`, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: './screenshots/prestaciones.png' });

        patientData.prestaciones = await page.evaluate(() => {
            const items = [];
            // Buscar tablas o cards con prestaciones
            document.querySelectorAll('table tbody tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    items.push({
                        descripcion: cells[0]?.textContent?.trim() || '',
                        monto: cells[cells.length - 1]?.textContent?.trim() || ''
                    });
                }
            });
            // También buscar en cards
            document.querySelectorAll('[class*="card"], [class*="item"]').forEach(card => {
                const text = card.textContent?.trim();
                if (text && text.length < 200) {
                    items.push({ descripcion: text, monto: '' });
                }
            });
            return items.slice(0, 20); // Limitar
        });
        console.log(`  ✓ ${patientData.prestaciones.length} prestaciones`);

        // 3. Pagos
        console.log('\n💳 Extrayendo pagos...');
        await page.goto(`${baseUrl}/dashboard/patients/payments`, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: './screenshots/pagos.png' });

        patientData.pagos = await page.evaluate(() => {
            const items = [];
            document.querySelectorAll('table tbody tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    items.push({
                        fecha: cells[0]?.textContent?.trim() || '',
                        monto: cells[1]?.textContent?.trim() || '',
                        metodo: cells[2]?.textContent?.trim() || ''
                    });
                }
            });
            return items;
        });
        console.log(`  ✓ ${patientData.pagos.length} pagos`);

        // 4. Historia clínica / Evoluciones
        console.log('\n📝 Extrayendo evoluciones...');
        await page.goto(`${baseUrl}/dashboard/patients/medical-history`, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(2000);
        await page.screenshot({ path: './screenshots/evoluciones.png' });

        patientData.evoluciones = await page.evaluate(() => {
            const items = [];
            // Buscar en tablas
            document.querySelectorAll('table tbody tr').forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length >= 2) {
                    items.push({
                        fecha: cells[0]?.textContent?.trim() || '',
                        descripcion: cells[1]?.textContent?.trim() || '',
                        profesional: cells[2]?.textContent?.trim() || ''
                    });
                }
            });
            // Buscar en cards o divs
            document.querySelectorAll('[class*="evolution"], [class*="history-item"], [class*="timeline"]').forEach(item => {
                const text = item.textContent?.trim();
                if (text && text.length < 500) {
                    items.push({ fecha: '', descripcion: text, profesional: '' });
                }
            });
            return items.slice(0, 50);
        });
        console.log(`  ✓ ${patientData.evoluciones.length} evoluciones`);

        // Guardar
        const filename = `./excels/paciente_${PATIENT_ID}_completo.json`;
        fs.writeFileSync(filename, JSON.stringify(patientData, null, 2));
        console.log(`\n💾 Guardado en ${filename}`);

        // También mostrar resumen
        console.log('\n═══════════════════════════════════════');
        console.log('RESUMEN DEL PACIENTE');
        console.log('═══════════════════════════════════════');
        console.log(`Nombre: ${patientData.datos_personales.lastname} ${patientData.datos_personales.name}`);
        console.log(`HC: ${patientData.datos_personales.external_id}`);
        console.log(`Documento: ${patientData.datos_personales.document}`);
        console.log(`Deuda: $${patientData.datos_personales.debt_pesos}`);
        console.log(`Prestaciones: ${patientData.prestaciones.length}`);
        console.log(`Pagos: ${patientData.pagos.length}`);
        console.log(`Evoluciones: ${patientData.evoluciones.length}`);

        await browser.close();
        return patientData;

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (page) await page.screenshot({ path: './screenshots/error.png' });
        if (browser) await browser.close();
        throw error;
    }
}

extractPatient()
    .then(() => { console.log('\n✅ Extracción completada'); process.exit(0); })
    .catch(e => { console.error('\n❌ Fallido:', e.message); process.exit(1); });
