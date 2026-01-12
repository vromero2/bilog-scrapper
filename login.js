require('dotenv').config();
const puppeteer = require('puppeteer');

/**
 * Hace login en Bilog y retorna el browser y la página autenticada
 */
async function login() {
    console.log('Iniciando login en Bilog...');

    const browser = await puppeteer.launch({
        headless: 'new', // Modo headless para mayor velocidad
        defaultViewport: { width: 1920, height: 1080 },
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
    });

    const page = await browser.newPage();

    try {
        const loginUrl = process.env.BILOG_URL;
        console.log(`Navegando a ${loginUrl}...`);

        await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(2000);

        // 1. Usuario Bilog (codigo de clinica) - name="webuser"
        console.log('Ingresando usuario Bilog...');
        await page.click('input[name="webuser"]');
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await page.keyboard.type(process.env.BILOG_USER, { delay: 20 });
        console.log(`  webuser: ${process.env.BILOG_USER}`);

        await page.waitForTimeout(300);

        // 2. Usuario - name="user"
        console.log('Ingresando usuario...');
        await page.click('input[name="user"]');
        await page.keyboard.down('Control');
        await page.keyboard.press('a');
        await page.keyboard.up('Control');
        await page.keyboard.type(process.env.ADMIN_USER, { delay: 20 });
        console.log(`  user: ${process.env.ADMIN_USER}`);

        await page.waitForTimeout(300);

        // 3. Contrasena - name="password"
        console.log('Ingresando contrasena...');
        await page.click('input[name="password"]');
        await page.keyboard.type(process.env.ADMIN_PASSWORD, { delay: 20 });
        console.log('  password: ********');

        await page.waitForTimeout(300);

        // 4. Hacer clic en el boton Continuar (type="submit")
        console.log('Haciendo clic en Continuar...');
        await page.click('button[type="submit"]');

        // 5. Esperar navegacion
        console.log('Esperando navegacion...');
        try {
            await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
        } catch (e) {
            console.log('No hubo navegacion automatica');
        }

        await page.waitForTimeout(3000);

        const currentUrl = page.url();
        console.log(`URL actual: ${currentUrl}`);

        await page.screenshot({ path: './screenshots/login-result.png' });

        if (currentUrl.includes('dashboard')) {
            console.log('Login exitoso!');
        } else {
            console.log('Login puede haber fallado. Revisando...');
            // Ver si hay mensaje de error
            const errorMsg = await page.evaluate(() => {
                const errors = document.querySelectorAll('[class*="error"], [class*="destructive"], .text-red-500');
                return Array.from(errors).map(e => e.textContent).join(', ');
            });
            if (errorMsg) {
                console.log(`Errores encontrados: ${errorMsg}`);
            }
        }

        return { browser, page };

    } catch (error) {
        console.error('Error en login:', error.message);
        await page.screenshot({ path: './screenshots/login-error.png' });
        throw error;
    }
}

module.exports = { login };
