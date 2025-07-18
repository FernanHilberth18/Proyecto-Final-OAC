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

// Mapa genérico para nombres de dispositivos
const deviceDisplayMap = {
    "Controlador Floppy - Diskette": "Controlador Floppy",
    "Co-procesador matemático": "Co-procesador matemático",
    "Reloj (tics) en tiempo real CMOS": "Reloj CMOS",
    "Puerto Paralelo - Impresora": "Impresora",
    "Canal IDE primario (Disco)": "Disco"
};

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

    window.tramosCronograma = [];

    document.getElementById("cronograma").innerHTML = generarCronograma(interrupciones, duracionBase);
    document.getElementById("bitacora").innerHTML = generarBitacora(interrupciones);

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

    // Esta sigue siendo la lista cruda, para bitácora
    window.tramosCronograma = [];

    while (ejecutadoPrograma < duracionPrograma || eventos.length > 0 || pendientes.length > 0 || enEjecucion) {
        while (eventos.length > 0 && eventos[0].inicio <= tiempo) {
            pendientes.push({
                tipo: eventos[0].dispositivo,
                prioridad: eventos[0].prioridad,
                restante: eventos[0].duracion,
                inicioOriginal: eventos[0].inicio
            });
            eventos.shift();
        }

        if (enEjecucion && enEjecucion.restante > 0) {
            let pendientePrioritaria = pendientes.find(p => p.prioridad < enEjecucion.prioridad);

            if (pendientePrioritaria) {
                let duracionTramo = pendientePrioritaria.inicioOriginal - tiempo;

                if (duracionTramo > 0) {
                    registrarTramo(tiempo, tiempo + duracionTramo, enEjecucion.tipo);
                    if (enEjecucion.tipo === "Programa") ejecutadoPrograma += duracionTramo;
                    enEjecucion.restante -= duracionTramo;
                    tiempo += duracionTramo;
                }

                pendientes.push({ ...enEjecucion });
                pendientes.sort((a, b) => a.prioridad - b.prioridad);
                enEjecucion = pendientes.shift();
            } else {
                let siguienteEventoTiempo = eventos.length > 0 ? eventos[0].inicio : Infinity;
                let siguienteCambioTiempo = Math.min(tiempo + enEjecucion.restante, siguienteEventoTiempo);

                registrarTramo(tiempo, siguienteCambioTiempo, enEjecucion.tipo);
                if (enEjecucion.tipo === "Programa") ejecutadoPrograma += (siguienteCambioTiempo - tiempo);
                enEjecucion.restante -= (siguienteCambioTiempo - tiempo);
                tiempo = siguienteCambioTiempo;

                if (enEjecucion.restante <= 0) {
                    enEjecucion = null;
                }
            }
        } else {
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

    // Agrupar solo para visualización
    const tramosAgrupados = [];
    for (let tramo of window.tramosCronograma) {
        if (
            tramosAgrupados.length > 0 &&
            tramosAgrupados[tramosAgrupados.length - 1].tipo === tramo.tipo
        ) {
            tramosAgrupados[tramosAgrupados.length - 1].fin = tramo.fin;
        } else {
            tramosAgrupados.push({ ...tramo });
        }
    }

    // Renderizar tabla con los tramos agrupados
    tramosAgrupados.forEach(tr => {
        html += filaCronograma(tr.inicio, tr.fin, tr.tipo, dispositivosUnicos);
    });

    html += `</tbody></table>`;
    return html;
}

function registrarTramo(inicio, fin, tipo) {
    window.tramosCronograma.push({ tipo, inicio, fin });
}

function filaCronograma(inicio, fin, tipo, dispositivosUnicos) {
    let fila = `<tr><td>${tipo === "Programa" ? `T = ${inicio} → T = ${fin} (${fin - inicio}s)` : ""}</td>`;
    dispositivosUnicos.forEach(d => {
        fila += `<td>${d === tipo ? `T = ${inicio} → T = ${fin} (${fin - inicio}s)` : ""}</td>`;
    });
    fila += `</tr>`;
    return fila;
}



function generarBitacora() {
    const tiemposMonitoreo = window.tiemposMonitoreo.sort((a, b) => a - b);

    let html = `<table class="table table-bordered"><thead><tr>
        <th>Tiempo monitoreo (s)</th>
        <th>Dispositivo activo</th>
        <th>Interrumpido antes de terminar</th>
        <th>Rango de tiempo actual</th>
        <th>Tiempo faltante si interrumpido</th>
    </tr></thead><tbody>`;

    const interrupcionesOriginales = Array.from(document.querySelectorAll('#interrupciones > div')).map((div, i) => {
        const disp = div.querySelector(`#disp${i}`).value;
        const inicio = parseInt(div.querySelector(`#inicio${i}`).value);
        const duracion = parseInt(div.querySelector(`#duracion${i}`).value);
        return { disp, inicio, duracion };
    });

    const duracionPrograma = parseInt(document.getElementById("duracionPrograma").value);

    tiemposMonitoreo.forEach(t => {
        const tramo = window.tramosCronograma.find(tr => t >= tr.inicio && t < tr.fin);

        let dispositivo = "-";
        let rango = "-";
        let interrumpido = "NO";
        let faltante = "-";

        if (tramo) {
            dispositivo = tramo.tipo;
            rango = `T = ${tramo.inicio} → T = ${tramo.fin}`;

            if (dispositivo !== "Programa") {
                // Encontrar la interrupción original correspondiente
                const interrupcionOriginal = interrupcionesOriginales.find(i => i.disp === dispositivo && i.inicio <= t && t < i.inicio + i.duracion);

                if (interrupcionOriginal) {
                    const tramosMismaInterrupcion = window.tramosCronograma
                        .filter(tr => tr.tipo === dispositivo && tr.inicio >= interrupcionOriginal.inicio && tr.inicio < interrupcionOriginal.inicio + interrupcionOriginal.duracion);

                    const tiempoEjecutado = tramosMismaInterrupcion.reduce((acc, tr) => acc + (tr.fin - tr.inicio), 0);

                    if (tiempoEjecutado < interrupcionOriginal.duracion) {
                        interrumpido = "SÍ";
                        faltante = `${interrupcionOriginal.duracion - tiempoEjecutado}s`;
                    }
                }
            } else {
                // Para Programa
                const ejecutadoHastaAqui = window.tramosCronograma
                    .filter(tr => tr.tipo === "Programa" && tr.inicio < tramo.fin)
                    .reduce((acc, tr) => acc + (tr.fin - tr.inicio), 0);

                if (ejecutadoHastaAqui < duracionPrograma) {
                    interrumpido = "SÍ";
                    faltante = `${duracionPrograma - ejecutadoHastaAqui}s`;
                }
            }
        }

        html += `<tr>
            <td>${t}</td>
            <td>${dispositivo}</td>
            <td>${interrumpido}</td>
            <td>${rango}</td>
            <td>${faltante}</td>
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

    // Duración Total (real, incluyendo interrupciones)
    const duracionTotalReal = Math.max(...window.tramosCronograma.map(tr => tr.fin));

    doc.addPage();
    doc.setFontSize(16);
    doc.text("Duración Total del Proceso", 14, 20);
    doc.setFontSize(14);
    doc.text(`${duracionTotalReal} segundos`, 14, 30);

    doc.save("Simulacion_Interrupciones.pdf");
}


