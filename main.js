const IRQ_DISTRIBUCION = [
    { irq: 0, prioridad: 1, funcion: "Reloj del sistema" },
    { irq: 1, prioridad: 2, funcion: "Teclado" },
    { irq: 2, prioridad: "Reservada", funcion: "Controlador PIC" },
    { irq: 3, prioridad: 11, funcion: "COM2 y COM4" },
    { irq: 4, prioridad: 12, funcion: "COM1 y COM3" },
    { irq: 5, prioridad: 13, funcion: "Libre" },
    { irq: 6, prioridad: 14, funcion: "Controlador Floppy - Diskette" },
    { irq: 7, prioridad: 15, funcion: "Puerto Paralelo - Impresora" },
    { irq: 8, prioridad: 3, funcion: "Reloj (tics) en tiempo real CMOS" },
    { irq: 9, prioridad: 4, funcion: "Red, sonido, puerto SCSI" },
    { irq: 10, prioridad: 5, funcion: "Libre" },
    { irq: 11, prioridad: 6, funcion: "Libre" },
    { irq: 12, prioridad: 7, funcion: "PS-mouse" },
    { irq: 13, prioridad: 8, funcion: "Co-procesador matemático" },
    { irq: 14, prioridad: 9, funcion: "Canal IDE primario (Disco)" },
    { irq: 15, prioridad: 10, funcion: "Libre" }
];

const dispositivosValidos = [
    "COM1", "COM2", "COM3", "COM4", "Reloj del sistema", "Teclado", "Controlador PIC",
    "Controlador Floppy - Diskette", "Puerto Paralelo - Impresora", "Reloj (tics) en tiempo real CMOS",
    "Red", "Sonido", "Puerto SCSI", "PS-mouse", "Co-procesador matemático", "Disco"
];

let contador = 0;
let duracionFinal = 0;

function agregarInterrupcion() {
    const div = document.createElement("div");
    div.classList.add("mb-2");
    div.innerHTML = `
        <div class="d-flex flex-wrap align-items-end gap-2">
            <div>
                <label class="form-label mb-0">Dispositivo:</label>
                <select id="disp${contador}" class="form-select w-auto">
                    ${dispositivosValidos.map(d => `<option value="${d}">${d}</option>`).join("")}
                </select>
            </div>
            <div>
                <label class="form-label mb-0">Tiempo inicio (s):</label>
                <input type="number" id="inicio${contador}" min="0" value="0" class="form-control w-auto">
            </div>
            <div>
                <label class="form-label mb-0">Duración (s):</label>
                <input type="number" id="duracion${contador}" min="1" value="1" class="form-control w-auto">
            </div>
            <div>
                <button class="btn btn-danger btn-sm" onclick="this.parentNode.parentNode.remove()">Eliminar</button>
            </div>
        </div>
    `;
    document.getElementById("interrupciones").appendChild(div);
    contador++;
}

function iniciarSimulacion() {
    const duracionBase = parseInt(document.getElementById("duracionPrograma").value);
    let duracionFinal = duracionBase;

    const tiemposMonitoreoInput = document.getElementById("tiemposMonitoreo").value;
    window.tiemposMonitoreo = tiemposMonitoreoInput.split(",").map(v => parseInt(v.trim())).filter(v => !isNaN(v));

    let interrupciones = [];
    for (let i = 0; i < contador; i++) {
        const disp = document.getElementById(`disp${i}`);
        if (!disp) continue;

        const dispositivo = disp.value;
        const inicio = parseInt(document.getElementById(`inicio${i}`).value);
        const duracion = parseInt(document.getElementById(`duracion${i}`).value);

        let irqInfo;
        if (["COM1", "COM3"].includes(dispositivo)) {
            irqInfo = IRQ_DISTRIBUCION.find(d => d.irq === 4);
        } else if (["COM2", "COM4"].includes(dispositivo)) {
            irqInfo = IRQ_DISTRIBUCION.find(d => d.irq === 3);
        } else if (["Red", "Sonido", "Puerto SCSI"].includes(dispositivo)) {
            irqInfo = IRQ_DISTRIBUCION.find(d => d.irq === 9);
        } else if (dispositivo === "Disco") {
            irqInfo = IRQ_DISTRIBUCION.find(d => d.irq === 14);
        } else {
            irqInfo = IRQ_DISTRIBUCION.find(d => d.funcion === dispositivo);
        }

        interrupciones.push({
            dispositivo,
            inicio,
            duracion,
            irq: irqInfo ? irqInfo.irq : "-",
            prioridad: irqInfo && irqInfo.prioridad !== "Reservada" ? parseInt(irqInfo.prioridad) : 99
        });
    }

    window.tramosCronograma = []; // inicializa

    document.getElementById("cronograma").innerHTML = generarCronograma(interrupciones, duracionBase);
    document.getElementById("bitacora").innerHTML = generarBitacora(interrupciones, duracionBase);

    const ultimaSalida = window.tramosCronograma.at(-1)?.fin || duracionBase;
    document.getElementById("duracionTotal").innerText = `${ultimaSalida} segundos`;
}

function generarCronograma(interrupciones, duracionPrograma) {
    let html = `<table class="table table-bordered"><thead><tr><th>Programa (s/p)</th>`;
    const dispositivosUnicos = [...new Set(interrupciones.map(i => i.dispositivo))];
    html += dispositivosUnicos.map(d => `<th>${d}</th>`).join("");
    html += `</tr></thead><tbody>`;

    let tiempo = 0;
    let ejecutadoPrograma = 0;
    let pendientes = [];
    let enEjecucion = { tipo: "Programa", prioridad: Infinity, restante: duracionPrograma };

    let eventos = interrupciones.map(i => ({ ...i }));
    eventos.sort((a, b) => a.inicio - b.inicio);

    while (ejecutadoPrograma < duracionPrograma || eventos.length > 0 || pendientes.length > 0) {
        let siguienteEvento = eventos.length > 0 ? eventos[0] : null;
        let finActual = tiempo + enEjecucion.restante;

        if (siguienteEvento && siguienteEvento.inicio < finActual) {
            let tramoDuracion = siguienteEvento.inicio - tiempo;
            if (tramoDuracion > 0) {
                if (enEjecucion.tipo === "Programa") ejecutadoPrograma += tramoDuracion;
                html += filaCronograma(tiempo, tiempo + tramoDuracion, enEjecucion.tipo, dispositivosUnicos);
                window.tramosCronograma.push({ tipo: enEjecucion.tipo, inicio: tiempo, fin: tiempo + tramoDuracion });
                enEjecucion.restante -= tramoDuracion;
                tiempo = siguienteEvento.inicio;
            }

            if (siguienteEvento.prioridad < enEjecucion.prioridad) {
                if (enEjecucion.tipo !== "Programa") pendientes.push({ ...enEjecucion });
                enEjecucion = {
                    tipo: siguienteEvento.dispositivo,
                    prioridad: siguienteEvento.prioridad,
                    restante: siguienteEvento.duracion
                };
            } else {
                pendientes.push({
                    tipo: siguienteEvento.dispositivo,
                    prioridad: siguienteEvento.prioridad,
                    restante: siguienteEvento.duracion
                });
            }
            eventos.shift();
        } else {
            let tramoDuracion = enEjecucion.restante;
            if (enEjecucion.tipo === "Programa") ejecutadoPrograma += tramoDuracion;
            html += filaCronograma(tiempo, tiempo + tramoDuracion, enEjecucion.tipo, dispositivosUnicos);
            window.tramosCronograma.push({ tipo: enEjecucion.tipo, inicio: tiempo, fin: tiempo + tramoDuracion });
            tiempo += tramoDuracion;

            if (pendientes.length > 0) {
                pendientes.sort((a, b) => a.prioridad - b.prioridad);
                enEjecucion = pendientes.shift();
            } else if (ejecutadoPrograma < duracionPrograma) {
                enEjecucion = { tipo: "Programa", prioridad: Infinity, restante: duracionPrograma - ejecutadoPrograma };
            } else {
                break;
            }
        }
    }

    html += `</tbody></table>`;
    return html;
}

function filaCronograma(inicio, fin, tipo, dispositivosUnicos) {
    let fila = `<tr><td>${tipo === "Programa" ? `T = ${inicio} → T = ${fin} (${fin - inicio}s)` : ""}</td>`;
    dispositivosUnicos.forEach(d => {
        fila += `<td>${d === tipo ? `T = ${inicio} → T = ${fin} (${fin - inicio}s)` : ""}</td>`;
    });
    fila += `</tr>`;
    return fila;
}

function generarBitacora(interrupciones, duracionBase) {
    const tiemposMonitoreo = document.getElementById("tiemposMonitoreo").value
        .split(",")
        .map(t => parseInt(t.trim()))
        .filter(t => !isNaN(t))
        .sort((a, b) => a - b);

    let html = `<table class="table table-bordered"><thead><tr>
        <th>Tiempo monitoreo (s)</th>
        <th>Dispositivo activo</th>
        <th>Interrumpido antes de terminar</th>
        <th>Rango de tiempo actual</th>
        <th>Tiempo faltante si interrumpido</th>
    </tr></thead><tbody>`;

    tiemposMonitoreo.forEach(t => {
        const tramo = window.tramosCronograma.find(tr => t >= tr.inicio && t < tr.fin);

        let dispositivo = "-";
        let rango = "-";
        let interrumpidoAntes = "NO";
        let tiempoFaltante = "-";

        if (tramo) {
            dispositivo = tramo.tipo;
            rango = `T = ${tramo.inicio} → T = ${tramo.fin}`;

            if (dispositivo !== "Programa") {
                // buscar si alguna interrupción con mayor prioridad lo interrumpió antes de terminar
                const irqActual = IRQ_DISTRIBUCION.find(d => d.funcion.includes(dispositivo) || d.funcion === dispositivo);
                const siguienteInterrupcion = window.tramosCronograma.find(next =>
                    next.inicio > t && next.inicio < tramo.fin &&
                    IRQ_DISTRIBUCION.find(d => d.funcion.includes(next.tipo) || d.funcion === next.tipo)?.prioridad < irqActual?.prioridad
                );

                if (siguienteInterrupcion) {
                    interrumpidoAntes = "SÍ";
                    tiempoFaltante = `${tramo.fin - siguienteInterrupcion.inicio}s`;
                }
            } else {
                // Si es el programa, verificar si queda tiempo pendiente
                let tiempoEjecutadoPrograma = 0;
                window.tramosCronograma.forEach(tr => {
                    if (tr.tipo === "Programa") {
                        if (tr.fin <= t) {
                            tiempoEjecutadoPrograma += (tr.fin - tr.inicio);
                        } else if (tr.inicio <= t && t < tr.fin) {
                            tiempoEjecutadoPrograma += (t - tr.inicio);
                        }
                    }
                });

                if (tiempoEjecutadoPrograma < duracionBase) {
                    interrumpidoAntes = "SÍ";
                    tiempoFaltante = `${duracionBase - tiempoEjecutadoPrograma}s`;
                }
            }
        }

        html += `
        <tr>
            <td>${t}</td>
            <td>${dispositivo}</td>
            <td>${interrumpidoAntes}</td>
            <td>${rango}</td>
            <td>${tiempoFaltante}</td>
        </tr>`;
    });

    html += `</tbody></table>`;
    return html;
}

function exportarPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    doc.setFont("helvetica");

    // Extraer datos del cronograma
    const cronogramaTable = document.querySelector('#cronograma table');
    const cronogramaHead = [];
    const cronogramaBody = [];

    cronogramaTable.querySelectorAll('thead tr').forEach(tr => {
        const row = [];
        tr.querySelectorAll('th').forEach(th => {
            row.push(th.textContent.trim());
        });
        cronogramaHead.push(row);
    });

    cronogramaTable.querySelectorAll('tbody tr').forEach(tr => {
        const row = [];
        tr.querySelectorAll('td').forEach(td => {
            row.push(td.textContent.trim().replace(/→/g, '->'));
        });
        cronogramaBody.push(row);
    });

    // Título principal
    doc.setFontSize(16);
    doc.text("Simulación de Interrupciones", 14, 15);

    // Cronograma
    doc.setFontSize(12);
    doc.text("Cronograma:", 14, 25);

    doc.autoTable({
        head: cronogramaHead,
        body: cronogramaBody,
        startY: 30,
        theme: 'grid',
        headStyles: {
            fillColor: [41, 128, 185],
            fontStyle: 'bold',
            halign: 'center'
        },
        bodyStyles: {
            fontSize: 8,
            halign: 'center'
        },
        alternateRowStyles: {
            fillColor: [240, 240, 240]
        },
        styles: {
            cellPadding: 2,
            overflow: 'linebreak'
        }
    });

    // Bitácora
    const bitacoraTable = document.querySelector('#bitacora table');
    const bitacoraHead = [];
    const bitacoraBody = [];

    bitacoraTable.querySelectorAll('thead tr').forEach(tr => {
        const row = [];
        tr.querySelectorAll('th').forEach(th => {
            row.push(th.textContent.trim());
        });
        bitacoraHead.push(row);
    });

    bitacoraTable.querySelectorAll('tbody tr').forEach(tr => {
        const row = [];
        tr.querySelectorAll('td').forEach(td => {
            row.push(td.textContent.trim().replace(/→/g, '->'));
        });
        bitacoraBody.push(row);
    });

    doc.addPage();
    doc.setFontSize(16);
    doc.text("Bitácora de Interrupciones", 14, 15);

    doc.autoTable({
        head: bitacoraHead,
        body: bitacoraBody,
        startY: 25,
        theme: 'grid',
        headStyles: {
            fillColor: [231, 76, 60],
            fontStyle: 'bold',
            halign: 'center'
        },
        bodyStyles: {
            fontSize: 8,
            halign: 'center'
        },
        alternateRowStyles: {
            fillColor: [245, 245, 245]
        },
        styles: {
            cellPadding: 2,
            overflow: 'linebreak'
        }
    });

    // Duración Total
    doc.addPage();
    doc.setFontSize(16);
    doc.text("Duración Total del Proceso", 14, 20);
    doc.setFontSize(14);
    doc.text(`${duracionFinal} segundos`, 14, 30);

    doc.save("Simulacion_Interrupciones.pdf");
}


