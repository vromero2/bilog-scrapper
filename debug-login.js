require('dotenv').config();
const puppeteer = require('puppeteer');
const fs = require('fs');

async function debugLogin() {
    console.log('Debug de login en Bilog...');

    const browser = await puppeteer.launch({
        headless: false,
        defaultViewport: { width: 1920, height: 1080 },
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--start-maximized']
    });

    const page = await browser.newPage();

    try {
        const loginUrl = process.env.BILOG_URL;
        console.log(`Navegando a ${loginUrl}...`);

        await page.goto(loginUrl, { waitUntil: 'networkidle2', timeout: 30000 });
        await page.waitForTimeout(3000);

        // Extraer informacion del formulario
        const formInfo = await page.evaluate(() => {
            const info = {
                inputs: [],
                buttons: [],
                forms: [],
                html: ''
            };

            // Todos los inputs
            document.querySelectorAll('input').forEach((input, i) => {
                info.inputs.push({
                    index: i,
                    type: input.type,
                    name: input.name,
                    id: input.id,
                    placeholder: input.placeholder,
                    className: input.className
                });
            });

            // Todos los buttons
            document.querySelectorAll('button').forEach((btn, i) => {
                info.buttons.push({
                    index: i,
                    type: btn.type,
                    text: btn.textContent.trim(),
                    className: btn.className,
                    disabled: btn.disabled
                });
            });

            // Todos los forms
            document.querySelectorAll('form').forEach((form, i) => {
                info.forms.push({
                    index: i,
                    action: form.action,
                    method: form.method
                });
            });

            // HTML del formulario principal (si existe)
            const mainForm = document.querySelector('form') || document.querySelector('[class*="login"]') || document.querySelector('[class*="auth"]');
            if (mainForm) {
                info.html = mainForm.outerHTML;
            } else {
                // HTML del body truncado
                info.html = document.body.innerHTML.substring(0, 5000);
            }

            return info;
        });

        console.log('\n=== INPUTS ===');
        console.log(JSON.stringify(formInfo.inputs, null, 2));

        console.log('\n=== BUTTONS ===');
        console.log(JSON.stringify(formInfo.buttons, null, 2));

        console.log('\n=== FORMS ===');
        console.log(JSON.stringify(formInfo.forms, null, 2));

        // Guardar HTML para analisis
        fs.writeFileSync('./debug-form.html', formInfo.html);
        console.log('\nHTML guardado en debug-form.html');

        // Ahora intentar llenar el formulario
        console.log('\n=== INTENTANDO LLENAR FORMULARIO ===');

        // Llenar campos
        const textInputs = await page.$$('input[type="text"]');
        if (textInputs.length >= 1) {
            await textInputs[0].click({ clickCount: 3 });
            await textInputs[0].type(process.env.BILOG_USER);
            console.log('Campo 1 llenado');
        }
        if (textInputs.length >= 2) {
            await textInputs[1].click({ clickCount: 3 });
            await textInputs[1].type(process.env.ADMIN_USER);
            console.log('Campo 2 llenado');
        }

        const passwordInput = await page.$('input[type="password"]');
        if (passwordInput) {
            await passwordInput.click();
            await passwordInput.type(process.env.ADMIN_PASSWORD);
            console.log('Password llenado');
        }

        await page.waitForTimeout(1000);
        await page.screenshot({ path: './screenshots/debug-filled.png' });
        console.log('Screenshot guardado: debug-filled.png');

        // Esperar input del usuario antes de cerrar
        console.log('\n>>> Presiona Ctrl+C para cerrar o espera 60 segundos...');
        await page.waitForTimeout(60000);

        await browser.close();

    } catch (error) {
        console.error('Error:', error.message);
        await page.screenshot({ path: './screenshots/debug-error.png' });
        await browser.close();
    }
}

debugLogin();
