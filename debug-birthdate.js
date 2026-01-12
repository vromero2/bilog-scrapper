require('dotenv').config();
const { login } = require('./login');

async function debugBirthdate() {
    const { browser, page } = await login();
    const baseUrl = process.env.BILOG_URL.split('?')[0];

    await page.goto(baseUrl + '/dashboard/patients/personal-data', { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000);
    await page.evaluate(() => document.querySelectorAll('[role="dialog"] button').forEach(b => b.click()));
    await page.keyboard.press('Escape');

    // Buscar paciente 117
    const btns = await page.$$('#searchbar-patient button');
    if (btns.length >= 2) {
        await btns[1].click();
        await page.waitForTimeout(300);
        await page.evaluate(() => {
            document.querySelectorAll('[role="menuitemradio"]').forEach(i => {
                if (i.textContent?.includes('Historia clínica')) i.click();
            });
        });
    }

    const input = await page.$('[placeholder*="historia clínica"], [placeholder*="Historia clínica"]');
    await input.click({ clickCount: 3 });
    await input.type('117', { delay: 20 });
    await page.waitForTimeout(2000);
    await page.evaluate(() => document.querySelector('[role="listbox"] table tbody tr')?.click());
    await page.waitForTimeout(2000);

    // Buscar todos los inputs con sus labels cercanos
    const allInputs = await page.evaluate(() => {
        const results = [];
        document.querySelectorAll('input').forEach((inp, idx) => {
            // Buscar label cercano
            let label = '';
            const parent = inp.closest('div');
            if (parent) {
                const labelEl = parent.querySelector('label') || parent.previousElementSibling;
                if (labelEl) label = labelEl.textContent?.trim() || '';
            }

            results.push({
                index: idx,
                name: inp.name || '',
                id: inp.id || '',
                type: inp.type || '',
                value: inp.value || '',
                placeholder: inp.placeholder || '',
                label: label
            });
        });
        return results;
    });

    console.log('=== TODOS LOS INPUTS CON LABELS ===');
    allInputs.forEach(inp => {
        if (inp.value || inp.name) {
            console.log(`[${inp.index}] name="${inp.name}" value="${inp.value}" type="${inp.type}" label="${inp.label}"`);
        }
    });

    // Buscar específicamente campos de fecha
    const dateFields = await page.evaluate(() => {
        const dates = {};
        // Buscar por texto "nacimiento" en labels
        document.querySelectorAll('label, span, div').forEach(el => {
            const text = el.textContent?.toLowerCase() || '';
            if (text.includes('nacimiento') || text.includes('nac')) {
                const parent = el.closest('div');
                if (parent) {
                    const inputs = parent.querySelectorAll('input');
                    inputs.forEach((inp, i) => {
                        dates[`birth_${i}_${inp.name || inp.id || 'unknown'}`] = inp.value;
                    });
                }
            }
        });
        return dates;
    });

    console.log('\n=== CAMPOS DE FECHA DE NACIMIENTO ===');
    console.log(JSON.stringify(dateFields, null, 2));

    await browser.close();
}

debugBirthdate().catch(e => console.error(e.message));
