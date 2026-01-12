require('dotenv').config();
const { login } = require('./login');
const ExcelJS = require('exceljs');
const fs = require('fs');
const iconv = require('iconv-lite');

/**
 * Cierra todos los tutoriales haciendo clic en la X (cruz)
 * @param {Page} page - Página de Puppeteer
 */
async function closeTutorials(page) {
    try {
        console.log('🔄 Cerrando tutoriales...');
        for (let i = 0; i < 5; i++) {
            await page.waitForTimeout(1000);

            // Buscar la X de cerrar en el diálogo
            const closeXButton = await page.evaluateHandle(() => {
                const dialogs = document.querySelectorAll('[role="alertdialog"], [role="dialog"]');
                for (const dialog of dialogs) {
                    const buttons = dialog.querySelectorAll('button');
                    for (const btn of buttons) {
                        const ariaLabel = btn.getAttribute('aria-label');
                        if (ariaLabel && (ariaLabel.includes('close') || ariaLabel.includes('cerrar'))) {
                            return btn;
                        }
                        if (btn.textContent.trim() === '×' || btn.textContent.trim() === '') {
                            const style = window.getComputedStyle(btn.parentElement || btn);
                            if (style.position === 'absolute' || btn.querySelector('svg')) {
                                return btn;
                            }
                        }
                    }
                }
                return null;
            });

            if (closeXButton.asElement()) {
                await closeXButton.asElement().click();
                console.log(`  ✓ Tutorial cerrado con X`);
                continue;
            }

            const closeButton = await page.$('button[data-action="close"]');
            if (closeButton) {
                await closeButton.click();
                console.log(`  ✓ Tutorial cerrado (close)`);
                continue;
            }

            console.log(`  ✓ No hay más tutoriales`);
            break;
        }

        console.log('✓ Todos los tutoriales cerrados');
        await page.waitForTimeout(1000);
    } catch (e) {
        console.log('  ⚠️  Error cerrando tutoriales:', e.message);
    }
}

/**
 * Busca un paciente por su número de Historia Clínica
 * @param {Page} page - Página de Puppeteer
 * @param {number} id - ID de Historia Clínica
 * @returns {Promise<boolean>} - True si se encontró el paciente
 */
async function searchByHistoriaClinica(page, id) {
    try {
        // 0. Cerrar cualquier menú/listbox abierto
        await page.keyboard.press('Escape');
        await page.waitForTimeout(300);

        // 1. SIEMPRE hacer clic en el botón de filtros (el filtro se resetea al volver a la página)
        const filterButtons = await page.$$('#searchbar-patient button');

        if (filterButtons.length < 2) {
            console.log(`❌ No se encontraron botones de filtro`);
            return false;
        }

        // Hacer clic en el botón de filtros (segundo botón)
        await filterButtons[1].click();
        await page.waitForTimeout(500);

        // 2. Seleccionar "Por Historia clínica" en el menú
        const menuResult = await page.evaluate(() => {
            const menuItems = document.querySelectorAll('[role="menuitemradio"]');
            for (const item of menuItems) {
                if (item.textContent?.includes('Historia clínica')) {
                    item.click();
                    return { success: true };
                }
            }
            return { success: false };
        });

        if (!menuResult.success) {
            console.log('❌ No se encontró opción "Por Historia clínica"');
            return false;
        }

        await page.waitForTimeout(500);

        // 3. Ahora buscar el input con el placeholder correcto
        const searchInput = await page.$('[placeholder*="historia clínica"], [placeholder*="Historia clínica"]');

        if (!searchInput) {
            console.log('❌ No se encontró input de búsqueda');
            return false;
        }

        // 4. Limpiar y escribir el ID
        await searchInput.click({ clickCount: 3 });
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(100);
        await searchInput.type(id.toString(), { delay: 50 });

        // 5. Esperar resultados en el listbox
        try {
            await page.waitForSelector('[role="listbox"] table tbody tr', { timeout: 5000 });
            return true;
        } catch (e) {
            return false;
        }

    } catch (error) {
        console.log(`⚠️  Error en búsqueda: ${error.message}`);
        return false;
    }
}

/**
 * Extrae los datos del paciente desde el formulario de detalles
 * @param {Page} page - Página de Puppeteer
 * @returns {Promise<Object>} - Datos del paciente
 */
async function extractPatientData(page) {
    try {
        // Click en primera fila de resultados dentro del listbox
        console.log('  📋 Esperando tabla de resultados...');
        await page.waitForSelector('[role="listbox"] table tbody tr', { timeout: 5000 });

        console.log('  🖱️  Haciendo click en primera fila...');
        // Usar evaluate para asegurar que el click se ejecuta
        const clicked = await page.evaluate(() => {
            const listbox = document.querySelector('[role="listbox"]');
            if (!listbox) return false;

            const firstRow = listbox.querySelector('table tbody tr');
            if (!firstRow) return false;

            firstRow.click();
            return true;
        });

        if (!clicked) {
            console.log('  ❌ No se pudo hacer click en la fila');
            return null;
        }

        // Esperar que cierre el listbox y cargue el formulario
        await page.waitForTimeout(2000);

        // Extraer todos los campos usando name attributes y selectores específicos
        const data = await page.evaluate(() => {
            // NUEVO: Usar atributos name directamente (más confiable que buscar por labels)
            const getByName = (name) => {
                const input = document.querySelector(`[name="${name}"]`);
                return input?.value?.trim() || '';
            };

            // Helper para combobox: buscar por class .select-trigger que contiene el span con el valor
            const getComboByLabel = (labelText) => {
                const labels = document.querySelectorAll('label');
                for (const label of labels) {
                    if (label.textContent.trim() === labelText) {
                        // Encontrar el siguiente .select-trigger en el mismo contenedor
                        const container = label.parentElement;
                        const trigger = container.querySelector('.select-trigger span span');
                        if (trigger) {
                            return trigger.textContent.trim();
                        }
                        // Intentar sin el span anidado
                        const trigger2 = container.querySelector('.select-trigger span');
                        if (trigger2) {
                            return trigger2.textContent.trim();
                        }
                    }
                }
                return '';
            };

            // Helper mejorado para Obra Social usando el label
            const getObraSocial = () => {
                const labels = document.querySelectorAll('label');
                for (const label of labels) {
                    if (label.textContent.trim() === 'Obra social') {
                        // Buscar el botón combobox hermano
                        const container = label.parentElement;
                        const button = container.querySelector('button[role="combobox"] span.truncate');
                        if (button) {
                            return button.textContent.trim();
                        }
                    }
                }
                return '';
            };

            // Helper mejorado para Plan usando el label
            const getPlan = () => {
                const labels = document.querySelectorAll('label');
                for (const label of labels) {
                    if (label.textContent.trim() === 'Plan') {
                        // Buscar el botón combobox hermano
                        const container = label.parentElement;
                        const button = container.querySelector('button[role="combobox"] span.truncate');
                        if (button) {
                            return button.textContent.trim();
                        }
                    }
                }
                return '';
            };

            // Helper para fecha usando class específica
            const getFechaByClass = (className) => {
                const container = document.querySelector(`.${className}`);
                if (!container) return '';

                const inputs = container.querySelectorAll('input[type="text"]');
                if (inputs.length >= 3) {
                    const day = inputs[0].value || '';
                    const month = inputs[1].value || '';
                    const year = inputs[2].value || '';
                    return day && month && year ? `${day}/${month}/${year}` : '';
                }
                return '';
            };

            // Helper para extraer saldos (solo deuda real - saldo negativo en rojo)
            const getSaldos = () => {
                const buttons = document.querySelectorAll('button[data-state="closed"] div');
                let debtPesos = '0';
                let debtDollars = '0';

                for (const div of buttons) {
                    // Solo extraer si es saldo negativo (clase text-red-500)
                    if (!div.classList.contains('text-red-500')) {
                        continue;
                    }

                    const text = div.textContent.trim();
                    if (text.startsWith('$')) {
                        // Extraer número: "$ 1.234,56" -> "1234.56"
                        debtPesos = text.replace('$', '').replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
                    } else if (text.startsWith('USD')) {
                        // Extraer número: "USD1.234" -> "1234"
                        debtDollars = text.replace('USD', '').replace(/\./g, '').replace(',', '.');
                    }
                }
                return { debtPesos, debtDollars };
            };

            // Extraer usando name attributes directamente
            const nombreCompleto = getByName('full_name');
            const partes = nombreCompleto.trim().split(/\s+/);
            const apellido = partes[0] || '';
            const nombre = partes.slice(1).join(' ') || '';

            // Extraer y formatear fecha de nacimiento DD/MM/YYYY -> YYYY-MM-DD
            const fechaNacRaw = getFechaByClass('date-picker-birth');
            let fechaNacimiento = '';
            if (fechaNacRaw) {
                const parts = fechaNacRaw.split('/');
                if (parts.length === 3) {
                    fechaNacimiento = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
                }
            }

            // Extraer teléfono celular - buscar por label "Teléfono celular"
            const getTelefonoCelular = () => {
                const labels = document.querySelectorAll('label');
                for (const label of labels) {
                    if (label.textContent.trim() === 'Teléfono celular') {
                        const container = label.parentElement;
                        const input = container.querySelector('input[type="text"]');
                        if (input) {
                            return input.value.trim();
                        }
                    }
                }
                // Fallback: buscar por name
                const inputByName = document.querySelector('[name="cellphone"]');
                return inputByName ? inputByName.value.trim() : '';
            };

            const telefonoCompleto = getTelefonoCelular();
            let prefijo = '';
            let telefono = telefonoCompleto;

            // Si el teléfono tiene más de 8 dígitos, separar prefijo
            const digitosSolo = telefonoCompleto.replace(/\D/g, '');
            if (digitosSolo.length > 10) {
                // Más de 10 dígitos: separar los últimos 8 como teléfono
                prefijo = digitosSolo.slice(0, -8);
                telefono = digitosSolo.slice(-8);
            } else if (digitosSolo.length === 10) {
                // 10 dígitos: teléfono argentino completo (código área + número)
                prefijo = '54'; // Código de Argentina
                telefono = digitosSolo;
            } else if (digitosSolo.length > 0) {
                // Menos de 10 dígitos: asumir que es solo el número local
                prefijo = '54';
                telefono = digitosSolo;
            }

            // Documento: solo el número (sin tipo)
            const numeroDoc = getByName('document_number');

            // Género: convertir a M/F
            const generoTexto = getComboByLabel('Sexo');
            let genero = '';
            if (generoTexto.toLowerCase().includes('masculino') || generoTexto.toLowerCase().includes('male')) {
                genero = 'M';
            } else if (generoTexto.toLowerCase().includes('femenino') || generoTexto.toLowerCase().includes('female')) {
                genero = 'F';
            }

            // Extraer saldos
            const saldos = getSaldos();

            return {
                // Campos según nuevo formato de exportación
                external_id: getByName('clinical_history_number'),
                name: nombre,
                lastname: apellido,
                document: numeroDoc || '00000',
                email: getByName('email'),
                address: getByName('address') || 'Dirección desconocida',
                phone: prefijo + telefono || 'Teléfono desconocido',
                health_insurance: getObraSocial() || 'No disponible',
                health_insurance_plan: getPlan(),
                birth_date: fechaNacimiento,
                debt_pesos: saldos.debtPesos,
                debt_dollars: saldos.debtDollars
            };
        });

        return data;

    } catch (error) {
        console.log(`⚠️  Error extrayendo datos: ${error.message}`);
        throw error;
    }
}

async function scrapPatients() {
    console.log('👤 Iniciando scraping de pacientes...');

    let browser, page;

    try {
        const loginResult = await login();
        browser = loginResult.browser;
        page = loginResult.page;

        // Navegar a la página de pacientes (usar URL base sin query params)
        const baseUrl = process.env.BILOG_URL.split('?')[0];
        const patientsUrl = `${baseUrl}/dashboard/patients/personal-data`;
        console.log(`📍 Navegando a ${patientsUrl}...`);

        await page.goto(patientsUrl, {
            waitUntil: 'networkidle2',
            timeout: 30000
        });

        // Esperar que cargue la página
        await page.waitForTimeout(2000);

        // Cerrar tutoriales que puedan aparecer
        await closeTutorials(page);

        console.log('✓ Página de pacientes cargada');

        // Iterar buscando pacientes por ID de Historia Clínica
        const allPatients = [];
        const START_ID = 0;
        const END_ID = 794;
        let consecutiveFailures = 0;
        const MAX_CONSECUTIVE_FAILURES = 50;

        for (let currentId = START_ID; currentId <= END_ID; currentId++) {
            console.log(`\n🔍 [${currentId}/${END_ID}] Buscando paciente con Historia Clínica #${currentId}...`);

            const found = await searchByHistoriaClinica(page, currentId);

            if (found) {
                console.log(`✓ Paciente encontrado con ID ${currentId}`);

                try {
                    const patientData = await extractPatientData(page);
                    allPatients.push(patientData);
                    console.log(`✓ Datos extraídos: ${patientData.lastname} ${patientData.name} | Deuda: $${patientData.debt_pesos} / USD${patientData.debt_dollars}`);
                    consecutiveFailures = 0; // Reset contador

                    // Volver a la página de búsqueda
                    console.log('↩️  Volviendo a la página de búsqueda...');
                    await page.goto(patientsUrl, {
                        waitUntil: 'networkidle2',
                        timeout: 30000
                    });
                    // Esperar más tiempo para que se estabilice la página
                    await page.waitForTimeout(3000);

                } catch (error) {
                    console.log(`❌ Error extrayendo datos del paciente ${currentId}: ${error.message}`);
                    consecutiveFailures++;
                }

            } else {
                console.log(`✗ No se encontró paciente con ID ${currentId}`);
                consecutiveFailures++;

                // Recargar página para limpiar estado del buscador
                await page.goto(patientsUrl, {
                    waitUntil: 'networkidle2',
                    timeout: 30000
                });
                await page.waitForTimeout(1500);
            }

            // Si hay muchos fallos consecutivos, detener
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                console.log(`⚠️  ${MAX_CONSECUTIVE_FAILURES} fallos consecutivos, deteniendo...`);
                break;
            }
        }

        console.log(`\n📊 Total: ${allPatients.length} pacientes extraídos`);

        if (allPatients.length === 0) {
            console.log('⚠️  No se encontraron pacientes. Revisa los selectores manualmente.');

            // Guardar HTML para análisis
            const html = await page.content();
            fs.writeFileSync('./debug-patients.html', html);
            console.log('💾 HTML guardado en ./debug-patients.html para análisis');
        }

        // Crear Excel
        console.log('\n📝 Creando archivos de exportación...');
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Pacientes');

        // Definir columnas para Excel (solo las que tienen datos, más legible)
        worksheet.columns = [
            { header: 'external_id', key: 'external_id', width: 15 },
            { header: 'name', key: 'name', width: 20 },
            { header: 'lastname', key: 'lastname', width: 20 },
            { header: 'document', key: 'document', width: 15 },
            { header: 'email', key: 'email', width: 30 },
            { header: 'address', key: 'address', width: 40 },
            { header: 'phone', key: 'phone', width: 20 },
            { header: 'health_insurance', key: 'health_insurance', width: 25 },
            { header: 'health_insurance_plan', key: 'health_insurance_plan', width: 25 },
            { header: 'birth_date', key: 'birth_date', width: 15 },
            { header: 'debt_pesos', key: 'debt_pesos', width: 15 },
            { header: 'debt_dollars', key: 'debt_dollars', width: 15 }
        ];

        // Agregar filas
        allPatients.forEach(p => worksheet.addRow(p));

        // Estilo header
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF0066CC' }
        };

        worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };

        // Bordes
        worksheet.eachRow((row, rowNumber) => {
            row.eachCell((cell) => {
                cell.border = {
                    top: { style: 'thin' },
                    left: { style: 'thin' },
                    bottom: { style: 'thin' },
                    right: { style: 'thin' }
                };
            });
        });

        // Auto-filtro (12 columnas: A-L)
        worksheet.autoFilter = {
            from: 'A1',
            to: 'L1'
        };

        // Guardar con timestamp para evitar conflictos
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T').join('_').slice(0, -5);
        const filenameXlsx = `./excels/pacientes_${timestamp}.xlsx`;
        await workbook.xlsx.writeFile(filenameXlsx);
        console.log(`✅ Excel guardado: ${filenameXlsx}`);

        // Generar CSV con encoding Latin1 (columnas de corrido, sin vacías)
        const headers = ['external_id', 'name', 'lastname', 'document', 'email', 'address', 'phone', 'health_insurance', 'health_insurance_plan', 'birth_date', 'debt_pesos', 'debt_dollars'];
        const csvRows = [headers.join(',')];

        allPatients.forEach(p => {
            const row = [
                p.external_id || '',
                p.name || '',
                p.lastname || '',
                p.document || '00000',
                p.email || '',
                p.address || 'Dirección desconocida',
                p.phone || 'Teléfono desconocido',
                p.health_insurance || 'No disponible',
                p.health_insurance_plan || '',
                p.birth_date || '',
                p.debt_pesos || '0',
                p.debt_dollars || '0'
            ];
            // Escapar comillas y encerrar en comillas
            csvRows.push(row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
        });

        const csvContent = csvRows.join('\n');
        const latin1Buffer = iconv.encode(csvContent, 'ISO-8859-1');
        const filenameCsv = `./excels/pacientes_${timestamp}.csv`;
        fs.writeFileSync(filenameCsv, latin1Buffer);
        console.log(`✅ CSV guardado: ${filenameCsv} (encoding: Latin1)`);

        await browser.close();
        return allPatients;

    } catch (error) {
        console.error('❌ Error en scraping de pacientes:', error.message);

        if (page) {
            try {
                await page.screenshot({ path: './screenshots/error-patients.png' });
                console.log('📸 Screenshot guardado en ./screenshots/error-patients.png');
            } catch (e) {
                // Ignorar error de screenshot
            }
        }

        if (browser) {
            await browser.close();
        }

        throw error;
    }
}

if (require.main === module) {
    scrapPatients()
        .then((data) => {
            console.log(`\n✅ Proceso completado: ${data.length} pacientes`);
            process.exit(0);
        })
        .catch((error) => {
            console.error('\n❌ Proceso fallido:', error.message);
            process.exit(1);
        });
}

module.exports = { scrapPatients };
