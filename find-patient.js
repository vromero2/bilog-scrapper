require('dotenv').config();
const { login } = require('./login');
const fs = require('fs');

async function findPatientWithDebtAndHC() {
    console.log('🔍 Buscando paciente con deuda Y historia clínica...\n');

    let browser, page;

    try {
        const loginResult = await login();
        browser = loginResult.browser;
        page = loginResult.page;

        const baseUrl = process.env.BILOG_URL.split('?')[0];

        for (let id = 0; id <= 800; id++) {
            console.log(`\n[${id}] Verificando paciente #${id}...`);

            // 1. Ir a datos personales y buscar
            await page.goto(`${baseUrl}/dashboard/patients/personal-data`, { waitUntil: 'networkidle2', timeout: 30000 });
            await page.waitForTimeout(1000);

            // Cerrar tutoriales
            await page.evaluate(() => {
                document.querySelectorAll('[role="alertdialog"] button, [role="dialog"] button').forEach(b => b.click());
            });
            await page.waitForTimeout(300);

            // Cambiar filtro a HC
            await page.keyboard.press('Escape');
            const filterBtns = await page.$$('#searchbar-patient button');
            if (filterBtns.length >= 2) {
                await filterBtns[1].click();
                await page.waitForTimeout(300);
                await page.evaluate(() => {
                    document.querySelectorAll('[role="menuitemradio"]').forEach(item => {
                        if (item.textContent?.includes('Historia clínica')) item.click();
                    });
                });
                await page.waitForTimeout(300);
            }

            // Buscar
            const input = await page.$('[placeholder*="historia clínica"], [placeholder*="Historia clínica"]');
            if (!input) continue;

            await input.click({ clickCount: 3 });
            await page.keyboard.press('Backspace');
            await input.type(id.toString(), { delay: 20 });

            try {
                await page.waitForSelector('[role="listbox"] table tbody tr', { timeout: 2000 });
            } catch (e) {
                console.log(`  ✗ No encontrado`);
                continue;
            }

            // Click en resultado
            await page.evaluate(() => {
                const row = document.querySelector('[role="listbox"] table tbody tr');
                if (row) row.click();
            });
            await page.waitForTimeout(1500);

            // Extraer deuda
            const data = await page.evaluate(() => {
                const getByName = (n) => document.querySelector(`[name="${n}"]`)?.value?.trim() || '';
                let debtPesos = '0';
                document.querySelectorAll('button[data-state="closed"] div').forEach(div => {
                    if (!div.classList.contains('text-red-500')) return;
                    const t = div.textContent.trim();
                    if (t.startsWith('$')) debtPesos = t.replace('$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
                });
                return {
                    name: getByName('full_name'),
                    external_id: getByName('clinical_history_number'),
                    document: getByName('document_number'),
                    debt_pesos: debtPesos
                };
            });

            const deuda = parseFloat(data.debt_pesos) || 0;
            console.log(`  ${data.name} | Deuda: $${data.debt_pesos}`);

            if (deuda <= 0) {
                console.log(`  ✗ Sin deuda, siguiente...`);
                continue;
            }

            // 2. Verificar si tiene historia clínica
            console.log(`  💰 Tiene deuda! Verificando HC...`);
            await page.goto(`${baseUrl}/dashboard/patients/medical-history`, { waitUntil: 'networkidle2', timeout: 30000 });
            await page.waitForTimeout(1500);

            const hasHC = await page.evaluate(() => {
                // Buscar si hay contenido de historia clínica
                const tables = document.querySelectorAll('table tbody tr');
                const cards = document.querySelectorAll('[class*="evolution"], [class*="history"], [class*="timeline"]');
                const text = document.body.innerText;

                // Verificar que no sea página de error
                if (text.includes('No se encontró') || text.includes('no encontrado')) return false;

                return tables.length > 0 || cards.length > 0;
            });

            await page.screenshot({ path: `./screenshots/hc_${id}.png` });

            if (!hasHC) {
                console.log(`  ✗ Sin historia clínica, siguiente...`);
                continue;
            }

            // ¡ENCONTRADO!
            console.log(`\n✅ ¡ENCONTRADO! Paciente #${id}: ${data.name}`);
            console.log(`   Deuda: $${data.debt_pesos}`);
            console.log(`   Tiene historia clínica: SI`);

            // Extraer datos completos
            const fullData = {
                id: id,
                datos_personales: data,
                evoluciones: await page.evaluate(() => {
                    const items = [];
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
                    return items;
                })
            };

            // Guardar
            fs.writeFileSync(`./excels/paciente_ideal_${id}.json`, JSON.stringify(fullData, null, 2));
            console.log(`\n💾 Guardado en ./excels/paciente_ideal_${id}.json`);

            await browser.close();
            return fullData;
        }

        console.log('\n❌ No se encontró ningún paciente con deuda Y historia clínica');
        await browser.close();
        return null;

    } catch (error) {
        console.error('❌ Error:', error.message);
        if (browser) await browser.close();
        throw error;
    }
}

findPatientWithDebtAndHC()
    .then(data => {
        if (data) {
            console.log('\n✅ Búsqueda completada');
        }
        process.exit(0);
    })
    .catch(e => {
        console.error('\n❌ Fallido:', e.message);
        process.exit(1);
    });
