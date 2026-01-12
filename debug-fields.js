require('dotenv').config();
const { login } = require('./login');

async function debugFields() {
    const { browser, page } = await login();
    const baseUrl = process.env.BILOG_URL.split('?')[0];

    // Ir a datos personales
    await page.goto(baseUrl + '/dashboard/patients/personal-data', { waitUntil: 'networkidle2' });
    await page.waitForTimeout(2000);

    // Cerrar modales
    await page.evaluate(() => document.querySelectorAll('[role="dialog"] button').forEach(b => b.click()));
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);

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

    // Extraer TODOS los inputs
    const fields = await page.evaluate(() => {
        const data = {};
        document.querySelectorAll('input, select, textarea').forEach(el => {
            const name = el.name || el.id || el.placeholder || 'unknown';
            const value = el.value || '';
            const type = el.type || el.tagName;
            if (name !== 'unknown') {
                data[name] = { value, type };
            }
        });
        return data;
    });

    console.log('=== CAMPOS ENCONTRADOS ===');
    Object.entries(fields).forEach(([key, val]) => {
        console.log(`${key}: "${val.value}" (${val.type})`);
    });

    await page.screenshot({ path: './screenshots/datos-personales.png' });
    await browser.close();
}

debugFields().catch(e => console.error(e.message));
