// js/pdf-gen.js
// Módulo para generar recibos PDF simples de control interno usando jsPDF

const PDFGen = {
  // Generar recibo para una venta realizada
  generateReceipt(venta, cliente, vendedor) {
    if (typeof jspdf === 'undefined') {
      alert("Error: La librería jsPDF no está cargada. Asegúrate de estar conectado a internet.");
      return;
    }

    const { jsPDF } = window.jspdf;
    // Creamos un documento A4 simple
    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    // Paleta de Colores para el PDF (Monocromo Profesional)
    const primaryColor = [30, 41, 59]; // Slate 800
    const secondaryColor = [100, 116, 139]; // Slate 500
    const lightGray = [241, 245, 249]; // Slate 100

    // Margen
    let y = 20;
    const margin = 20;
    const pageWidth = doc.internal.pageSize.width;

    // --- ENCABEZADO ---
    doc.setFillColor(...primaryColor);
    doc.rect(margin, y, pageWidth - (margin * 2), 8, 'F');
    y += 15;

    // Título y Tipo Documento
    doc.setFont("helvetica", "bold");
    doc.setFontSize(22);
    doc.setTextColor(...primaryColor);
    doc.text("RECIBO DE CONTROL INTERNO", margin, y);
    
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...secondaryColor);
    doc.text(`N° Recibo: ${venta.id}`, pageWidth - margin, y, { align: 'right' });
    y += 7;

    // Subtítulo del Negocio
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...secondaryColor);
    doc.text("SISTEMA DE CONTROL DE CELULARES & ACCESORIOS", margin, y);
    
    // Fecha y hora
    const fechaFormateada = new Date(venta.fecha).toLocaleString('es-ES', { 
      year: 'numeric', month: 'long', day: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Fecha: ${fechaFormateada}`, pageWidth - margin, y, { align: 'right' });
    y += 15;

    // --- LÍNEA DIVISORIA ---
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 10;

    // --- INFORMACIÓN DE LA TRANSACCIÓN (Dos Columnas) ---
    // Columna 1: Cliente
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...primaryColor);
    doc.text("CLIENTE:", margin, y);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Nombre: ${cliente.nombre}`, margin, y + 5);
    doc.text(`Cédula/Documento: ${cliente.documento}`, margin, y + 10);
    doc.text(`Teléfono: ${cliente.telefono}`, margin, y + 15);

    // Columna 2: Vendedor & Pago
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("DETALLES DE VENTA:", 120, y);
    
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.text(`Vendedor: ${vendedor.nombre}`, 120, y + 5);
    const refStr = venta.referencia ? ` (REF: ${venta.referencia})` : '';
    doc.text(`Método de Pago: ${venta.metodoPago.toUpperCase()}${refStr}`, 120, y + 10);
    doc.text(`Estado: ENTREGADO`, 120, y + 15);
    
    y += 25;

    // --- TABLA DE ARTÍCULOS ---
    // Cabecera de la tabla
    doc.setFillColor(...primaryColor);
    doc.rect(margin, y, pageWidth - (margin * 2), 8, 'F');
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text("Producto / Descripción", margin + 2, y + 5.5);
    doc.text("IMEI / Código / Serial", margin + 70, y + 5.5);
    doc.text("Cant.", margin + 132, y + 5.5, { align: 'center' });
    doc.text("Precio Unit.", margin + 162, y + 5.5, { align: 'right' });
    doc.text("Subtotal", pageWidth - margin - 2, y + 5.5, { align: 'right' });
    
    y += 8;
    
    // Contenido de la tabla
    doc.setTextColor(...primaryColor);
    doc.setFont("helvetica", "normal");
    
    let isAlt = false;
    venta.articulos.forEach(art => {
      // Fondo alternado para filas
      if (isAlt) {
        doc.setFillColor(...lightGray);
        doc.rect(margin, y, pageWidth - (margin * 2), 8, 'F');
      }
      isAlt = !isAlt;

      const desc = (art.modelo || '').toString();
      const cod = (art.imei || 'Sin código (Accesorios)').toString();
      const cant = art.cantidad || 1;
      const precioUnit = art.precioVenta;
      const subtotal = precioUnit * cant;

      doc.text(desc, margin + 2, y + 5.5);
      doc.text(cod, margin + 70, y + 5.5);
      doc.text(cant.toString(), margin + 132, y + 5.5, { align: 'center' });
      doc.text(this.formatCurrency(precioUnit), margin + 162, y + 5.5, { align: 'right' });
      doc.text(this.formatCurrency(subtotal), pageWidth - margin - 2, y + 5.5, { align: 'right' });

      y += 8;
    });

    y += 5;

    // --- TOTAL ---
    doc.setDrawColor(200, 200, 200);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.setTextColor(...primaryColor);
    doc.text("TOTAL PAGADO:", pageWidth - margin - 40, y, { align: 'right' });
    doc.text(this.formatCurrency(venta.total), pageWidth - margin - 2, y, { align: 'right' });

    y += 20;

    // --- FIRMAS Y NOTAS DE CONTROL ---
    doc.setDrawColor(220, 220, 220);
    doc.line(margin + 10, y + 15, margin + 70, y + 15);
    doc.line(pageWidth - margin - 70, y + 15, pageWidth - margin - 10, y + 15);

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...secondaryColor);
    doc.text("Firma Recibido Cliente", margin + 40, y + 20, { align: 'center' });
    doc.text("Firma Entregado Vendedor", pageWidth - margin - 40, y + 20, { align: 'center' });

    y += 35;

    // Pie de página aviso legal interno
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.setTextColor(150, 150, 150);
    doc.text("Documento de control interno para garantía de producto y constancia de entrega de inventario.", pageWidth / 2, y, { align: 'center' });
    doc.text("Este recibo NO representa una factura legal ni tiene efectos tributarios.", pageWidth / 2, y + 4, { align: 'center' });

    // Guardar el archivo PDF
    doc.save(`recibo_${venta.id}.pdf`);
  },

  // Formatear valor como moneda colombiana/latina (COP/USD)
  formatCurrency(value) {
    return 'S/ ' + parseFloat(value).toLocaleString('es-PE', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }
};
