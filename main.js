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
    duracionFinal = duracionBase;

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
        } else if (dispositivo === "Red" || dispositivo === "Sonido" || dispositivo === "Puerto SCSI") {
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
            prioridad: irqInfo ? irqInfo.prioridad : "-"
        });
    }

    interrupciones.sort((a, b) => a.inicio - b.inicio);

    document.getElementById("cronograma").innerHTML = generarCronograma(interrupciones);
    document.getElementById("bitacora").innerHTML = generarBitacora(interrupciones, duracionBase);

    interrupciones.forEach(int => {
        if (int.inicio <= duracionFinal) duracionFinal += int.duracion;
    });
    document.getElementById("duracionTotal").innerText = `${duracionFinal} segundos`;
}

function generarCronograma(interrupciones) {
    let html = `<table class="table table-bordered"><thead><tr><th>Programa (s/p)</th>`;
    const dispositivosUnicos = [...new Set(interrupciones.map(i => i.dispositivo))];
    html += dispositivosUnicos.map(d => `<th>${d}</th>`).join("");
    html += `</tr></thead><tbody>`;

    const duracionPrograma = parseInt(document.getElementById("duracionPrograma").value);
    let ejecutadoPrograma = 0;
    let tiempoActual = 0;

    window.tramosCronograma = [];

    const eventos = [...interrupciones.map(i => ({ ...i }))].sort((a, b) => a.inicio - b.inicio);
    const pendientes = []; // cola de interrupciones pendientes

    // programa activo
    let activo = { tipo: "Programa", restante: duracionPrograma };

    while (ejecutadoPrograma < duracionPrograma || eventos.length > 0 || pendientes.length > 0) {
        let siguienteEvento = eventos[0]?.inicio ?? Infinity;

        // ¿hay algo pendiente más prioritario que lo que está ejecutándose ahora?
        pendientes.sort((a, b) => {
            const irqA = IRQ_DISTRIBUCION.find(d => d.funcion.includes(a.dispositivo) || d.funcion === a.dispositivo).prioridad;
            const irqB = IRQ_DISTRIBUCION.find(d => d.funcion.includes(b.dispositivo) || d.funcion === b.dispositivo).prioridad;
            return irqA - irqB;
        });

        // si activo es Programa y llega evento en el futuro
        if (activo.tipo === "Programa" && siguienteEvento > tiempoActual) {
            let duracionTramo = Math.min(siguienteEvento - tiempoActual, activo.restante);
            html += `<tr><td>T = ${tiempoActual} → T = ${tiempoActual + duracionTramo} (${duracionTramo}s)</td>`;
            dispositivosUnicos.forEach(() => html += `<td></td>`);
            html += `</tr>`;

            window.tramosCronograma.push({ tipo: "Programa", inicio: tiempoActual, fin: tiempoActual + duracionTramo });
            ejecutadoPrograma += duracionTramo;
            activo.restante -= duracionTramo;
            tiempoActual += duracionTramo;

            if (activo.restante === 0) activo = null;
            continue;
        }

        if (siguienteEvento <= tiempoActual) {
            const evento = eventos.shift();
            const irqEvento = IRQ_DISTRIBUCION.find(d => d.funcion.includes(evento.dispositivo) || d.funcion === evento.dispositivo);

            if (activo?.tipo !== "Programa") {
                const irqActivo = IRQ_DISTRIBUCION.find(d => d.funcion.includes(activo.tipo) || d.funcion === activo.tipo);
                if (irqEvento.prioridad < irqActivo.prioridad) {
                    // interrumpe activo
                    pendientes.push({ ...activo, restante: activo.restante - (tiempoActual - activo.inicio) });
                    activo = { tipo: evento.dispositivo, restante: evento.duracion, inicio: tiempoActual };
                } else {
                    pendientes.push({ ...evento, restante: evento.duracion, inicio: evento.inicio });
                }
            } else {
                activo = { tipo: evento.dispositivo, restante: evento.duracion, inicio: tiempoActual };
            }

            continue;
        }

        // si no hay evento próximo, retomar pendientes
        if (pendientes.length > 0) {
            const siguientePendiente = pendientes.shift();
            const duracionTramo = siguientePendiente.restante;

            html += `<tr><td></td>`;
            dispositivosUnicos.forEach(d => {
                if (d === siguientePendiente.tipo) {
                    html += `<td>T = ${tiempoActual} → T = ${tiempoActual + duracionTramo} (${duracionTramo}s)</td>`;
                } else {
                    html += `<td></td>`;
                }
            });
            html += `</tr>`;

            window.tramosCronograma.push({ tipo: siguientePendiente.tipo, inicio: tiempoActual, fin: tiempoActual + duracionTramo });

            tiempoActual += duracionTramo;
            activo = null;
        } else if (activo?.tipo === "Programa" && activo.restante > 0) {
            // continuar programa si nada más hay pendiente
            let duracionTramo = activo.restante;
            html += `<tr><td>T = ${tiempoActual} → T = ${tiempoActual + duracionTramo} (${duracionTramo}s)</td>`;
            dispositivosUnicos.forEach(() => html += `<td></td>`);
            html += `</tr>`;

            window.tramosCronograma.push({ tipo: "Programa", inicio: tiempoActual, fin: tiempoActual + duracionTramo });
            ejecutadoPrograma += duracionTramo;
            tiempoActual += duracionTramo;
            activo.restante = 0;
            activo = null;
        } else {
            break; // todo terminado
        }
    }

    html += `</tbody></table>`;
    return html;
}

function generarBitacora(interrupciones, duracionBase) {
    const tiemposMonitoreo = document.getElementById("tiemposMonitoreo").value
        .split(",")
        .map(t => parseInt(t.trim()))
        .filter(t => !isNaN(t))
        .sort((a, b) => a - b);

    let html = `<table class="table table-bordered"><thead><tr>
        <th>Tiempo real donde se desea monitorear el proceso</th>
        <th>Área o dispositivo donde se encuentra en este momento el control del proceso</th>
        <th>Interrupción afecta al dispositivo antes que culmine (SÍ / NO)</th>
        <th>Rango de Tiempo en el dispositivo, con interrupción o sin ella. Cuándo entró y cuándo salió</th>
        <th>Tiempo faltante para culminar la tarea (seg), si fue interrumpido</th>
    </tr></thead><tbody>`;

    tiemposMonitoreo.forEach(t => {
        const tramo = window.tramosCronograma.find(tr => t >= tr.inicio && t < tr.fin);

        let dispositivo = "-";
        let rango = "-";
        let interrumpidoAntes = "NO";
        let tiempoFaltante = "-";

        let tiempoProgramaEjecutado = 0;

        if (tramo) {
            dispositivo = tramo.tipo;
            rango = `T = ${tramo.inicio} → T = ${tramo.fin}`;

            // calcular cuánto programa ya ejecutó hasta t
            window.tramosCronograma.forEach(tr => {
                if (tr.tipo === "Programa") {
                    if (tr.fin <= t) {
                        tiempoProgramaEjecutado += (tr.fin - tr.inicio);
                    } else if (tr.inicio <= t && t < tr.fin) {
                        tiempoProgramaEjecutado += (t - tr.inicio);
                    }
                }
            });

            if (tramo.tipo === "Programa") {
                if (tiempoProgramaEjecutado < duracionBase) {
                    interrumpidoAntes = "SÍ";
                    tiempoFaltante = `${duracionBase - tiempoProgramaEjecutado}s`;
                }
            } else {
                const irq = IRQ_DISTRIBUCION.find(d => d.funcion.includes(tramo.tipo) || d.funcion === tramo.tipo);
                const interrupcionMayor = interrupciones.find(int => {
                    const irqInt = IRQ_DISTRIBUCION.find(d => d.funcion.includes(int.dispositivo) || d.funcion === int.dispositivo);
                    return irqInt && irq && irqInt.prioridad < irq.prioridad && int.inicio > t && int.inicio < tramo.fin;
                });
                if (interrupcionMayor) {
                    interrumpidoAntes = "SÍ";
                    tiempoFaltante = `${tramo.fin - interrupcionMayor.inicio}s`;
                }
            }
        }

        html += `
        <tr>
            <td>a los ${t} seg.</td>
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


