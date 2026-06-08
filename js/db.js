// js/db.js
// Capa de Datos Asíncrona para Sistema de Control de Inventario
// Se conecta a Google Sheets mediante la URL de Google Apps Script. 
// Si no hay URL, opera en "Modo Demo" con LocalStorage y mocks locales.

const DB = {
  apiURL: null,
  cache: {},
  isDemoMode: true,

  // Inicialización
  async init() {
    // Configurar la URL provista por el usuario como valor predeterminado
    const defaultUrl = 'https://script.google.com/macros/s/AKfycbwNuoqtEyxS9JWgeITZ1EXQq3WPXFWhIG4JevEljiLyMeBzyd5j6ZfSmhHNsi9cIyvWfA/exec';
    this.apiURL = localStorage.getItem('cel_google_sheet_url') || defaultUrl;
    
    // Si no está guardado aún en localStorage, lo guardamos para consistencia
    if (!localStorage.getItem('cel_google_sheet_url')) {
      localStorage.setItem('cel_google_sheet_url', defaultUrl);
    }
    
    if (this.apiURL) {
      this.isDemoMode = false;
      const connected = await this.syncAll();
      if (!connected) {
        console.warn("Fallo al conectar con Google Sheets. Iniciando en Modo Demo.");
        this.isDemoMode = true;
        this.initLocalDemo();
      }
    } else {
      this.isDemoMode = true;
      this.initLocalDemo();
    }
  },

  // Inicializar base de datos local (Modo Demo / Fallback)
  initLocalDemo() {
    console.log("Iniciando Modo Demo en LocalStorage...");
    
    // Iniciar Mocks si no existen localmente
    if (!localStorage.getItem('demo_vendedores')) {
      const defaultSellers = [
        { id: 'v-1', nombre: 'Administrador Principal', usuario: 'admin', contrasena: 'admin', rol: 'admin' },
        { id: 'v-2', nombre: 'Juan Vendedor', usuario: 'juan', contrasena: '1234', rol: 'vendedor' }
      ];
      localStorage.setItem('demo_vendedores', JSON.stringify(defaultSellers));
      
      const defaultProviders = [
        { id: 'p-1', nombre: 'Celular Express Mayorista', telefono: '+57 312 4567890', email: 'ventas@celularexpress.com' },
        { id: 'p-2', nombre: 'Accesorios & Cargas SAS', telefono: '+57 300 9876543', email: 'contacto@accesorioscargas.com' }
      ];
      localStorage.setItem('demo_proveedores', JSON.stringify(defaultProviders));

      const defaultClients = [
        { id: 'c-general', nombre: 'Cliente General (Venta Rápida)', documento: '99999999', telefono: '00000000' },
        { id: 'c-1', nombre: 'María Camila Ortega', documento: '1098765432', telefono: '+57 315 2223344' }
      ];
      localStorage.setItem('demo_clientes', JSON.stringify(defaultClients));

      const defaultBatches = [
        { id: 'l-1', nombre: 'Lote Celulares Mayo 2026', proveedorId: 'p-1', flete: 150000, fecha: '2026-05-15' },
        { id: 'l-2', nombre: 'Lote Accesorios Importados', proveedorId: 'p-2', flete: 50000, fecha: '2026-06-01' }
      ];
      localStorage.setItem('demo_lotes', JSON.stringify(defaultBatches));

      const defaultProducts = [
        { 
          id: 'prod-1', loteId: 'l-1', tipo: 'Celular', modelo: 'Samsung Galaxy S23 Ultra', 
          tipoCodigo: 'imei', codigo: '358912345678901', costoBase: 3500000, costoReal: 3605000, 
          precioSugerido: 4326000, precioVenta: 4326000, stock: 1, estado: 'disponible', foto: '' 
        },
        { 
          id: 'prod-2', loteId: 'l-1', tipo: 'Celular', modelo: 'Xiaomi Redmi Note 13 Pro', 
          tipoCodigo: 'imei', codigo: '354456789123456', costoBase: 1500000, costoReal: 1545000, 
          precioSugerido: 1854000, precioVenta: 1854000, stock: 1, estado: 'disponible', foto: '' 
        },
        { 
          id: 'prod-3', loteId: 'l-2', tipo: 'Cargador', modelo: 'Cargador Rápido Tipo-C 25W', 
          tipoCodigo: 'ninguno', codigo: '', costoBase: 30000, costoReal: 33000, 
          precioSugerido: 39600, precioVenta: 39600, stock: 25, estado: 'disponible', foto: '' 
        }
      ];
      localStorage.setItem('demo_productos', JSON.stringify(defaultProducts));

      const defaultSales = [
        {
          id: 'vta-1', clienteId: 'c-1', vendedorId: 'v-2', fecha: new Date().toISOString(), total: 1854000, metodoPago: 'efectivo',
          articulos: [{ productoId: 'prod-2', modelo: 'Xiaomi Redmi Note 13 Pro', imei: '354456789123456', precioVenta: 1854000, costoReal: 1545000, cantidad: 1 }]
        }
      ];
      localStorage.setItem('demo_ventas', JSON.stringify(defaultSales));

      const defaultExpenses = [
        { id: 'egr-1', descripcion: 'Papelería y Cinta', monto: 12000, fecha: new Date().toISOString().split('T')[0], vendedorId: 'v-2' }
      ];
      localStorage.setItem('demo_egresos', JSON.stringify(defaultExpenses));
    }

    // Cargar caché desde LocalStorage para operar rápido
    const tables = ['vendedores', 'proveedores', 'clientes', 'lotes', 'productos', 'ventas', 'egresos'];
    tables.forEach(t => {
      this.cache[t] = JSON.parse(localStorage.getItem('demo_' + t)) || [];
    });
  },

  // Sincronizar todos los datos desde Google Sheets (GET)
  async syncAll() {
    if (!this.apiURL) return false;
    try {
      const res = await fetch(`${this.apiURL}?action=getAll`, { method: 'GET' });
      const json = await res.json();
      if (json.status === 'success') {
        this.cache = json.data;
        return true;
      }
      return false;
    } catch (e) {
      console.error("Error al sincronizar con Google Sheets:", e);
      return false;
    }
  },

  // Establecer y validar la URL de conexión
  async setGoogleSheetsUrl(url) {
    if (!url || url.trim() === '') {
      localStorage.removeItem('cel_google_sheet_url');
      this.apiURL = null;
      this.isDemoMode = true;
      this.initLocalDemo();
      return { success: true, message: 'URL limpiada. Modo demo activado.' };
    }

    try {
      const res = await fetch(`${url}?action=getAll`, { method: 'GET' });
      const json = await res.json();
      if (json.status === 'success') {
        localStorage.setItem('cel_google_sheet_url', url);
        this.apiURL = url;
        this.isDemoMode = false;
        this.cache = json.data;
        return { success: true, message: '¡Conexión establecida con éxito!' };
      }
      return { success: false, message: 'La URL no devolvió una estructura válida.' };
    } catch (e) {
      return { success: false, message: 'No se pudo conectar a la URL. Verifica CORS o acceso público.' };
    }
  },

  // --- MÉTODOS CRUD GENÉRICOS (Trabajan con caché e impactan Sheets/Demo) ---

  getCollection(key) {
    return this.cache[key] || [];
  },

  async saveRow(sheetName, rowData) {
    const collection = this.getCollection(sheetName);
    
    if (this.isDemoMode) {
      // Guardado Local (Modo Demo)
      if (rowData.id) {
        const idx = collection.findIndex(item => item.id === rowData.id);
        if (idx !== -1) collection[idx] = rowData;
      } else {
        rowData.id = sheetName.substring(0, 3) + '-' + Date.now();
        collection.push(rowData);
      }
      this.cache[sheetName] = collection;
      localStorage.setItem('demo_' + sheetName, JSON.stringify(collection));
      return rowData;
    } else {
      // Guardado en la Nube (Google Sheets)
      try {
        const res = await fetch(this.apiURL, {
          method: 'POST',
          redirect: 'follow', // Muy importante para redirecciones de Google Apps Script
          body: JSON.stringify({
            action: 'save',
            sheetName: sheetName,
            row: rowData
          })
        });
        const json = await res.json();
        if (json.status === 'success') {
          // Actualizar caché
          const savedRow = json.data;
          const idx = collection.findIndex(item => item.id === savedRow.id);
          if (idx !== -1) {
            collection[idx] = savedRow;
          } else {
            collection.push(savedRow);
          }
          this.cache[sheetName] = collection;
          return savedRow;
        } else {
          throw new Error(json.message);
        }
      } catch (err) {
        console.error("Error al guardar fila en Sheets:", err);
        alert("Error de conexión al guardar datos en Google Sheets. Se reintentará.");
        throw err;
      }
    }
  },

  async deleteRow(sheetName, id) {
    const collection = this.getCollection(sheetName);

    if (this.isDemoMode) {
      const filtrados = collection.filter(item => item.id !== id);
      this.cache[sheetName] = filtrados;
      localStorage.setItem('demo_' + sheetName, JSON.stringify(filtrados));
      return true;
    } else {
      try {
        const res = await fetch(this.apiURL, {
          method: 'POST',
          redirect: 'follow',
          body: JSON.stringify({
            action: 'delete',
            sheetName: sheetName,
            id: id
          })
        });
        const json = await res.json();
        if (json.status === 'success') {
          this.cache[sheetName] = collection.filter(item => item.id !== id);
          return true;
        }
        throw new Error(json.message);
      } catch (err) {
        console.error("Error al eliminar fila en Sheets:", err);
        throw err;
      }
    }
  },

  // --- OPERACIONES COMPUESTAS Y PRORRATEOS ---

  // Recalcular prorrateo de flete en todos los productos de un lote
  async recalcularProrrateoLote(loteId) {
    if (!loteId) return;
    const lotes = this.getCollection('lotes');
    const lote = lotes.find(l => l.id === loteId);
    if (!lote) return;

    const productos = this.getCollection('productos');
    const productosDelLote = productos.filter(p => p.loteId === loteId);
    if (productosDelLote.length === 0) return;

    // Calcular el costo base total del lote de productos activos (disponibles o bajas)
    let totalCostoBase = 0;
    productosDelLote.forEach(p => {
      const qty = p.tipoCodigo === 'ninguno' ? (parseInt(p.stock) || 1) : 1;
      totalCostoBase += parseFloat(p.costoBase) * qty;
    });

    const fleteTotal = parseFloat(lote.flete) || 0;

    // Guardar secuencialmente para evitar concurrencias
    for (let p of productos) {
      if (p.loteId === loteId) {
        let fleteProrrateado = 0;
        if (totalCostoBase > 0) {
          fleteProrrateado = (parseFloat(p.costoBase) / totalCostoBase) * fleteTotal;
        } else {
          fleteProrrateado = fleteTotal / productosDelLote.length;
        }

        p.costoReal = parseFloat(p.costoBase) + fleteProrrateado;
        p.precioSugerido = p.costoReal * 1.20; // Utilidad del 20%
        
        if (!p.precioVenta || p.precioVenta < p.costoReal) {
          p.precioVenta = p.precioSugerido;
        }

        // Guardar cambios en el producto
        await this.saveRow('productos', p);
      }
    }
  },

  // Registrar venta
  async registrarVentaCompleta(venta) {
    // 1. Guardar la venta
    const ventaGuardada = await this.saveRow('ventas', venta);

    // 2. Descontar Inventario
    const productos = this.getCollection('productos');
    for (let art of venta.articulos) {
      const prod = productos.find(p => p.id === art.productoId);
      if (prod) {
        if (prod.tipoCodigo === 'ninguno') {
          prod.stock = Math.max(0, prod.stock - art.cantidad);
        } else {
          prod.estado = 'vendido';
        }
        await this.saveRow('productos', prod);
      }
    }

    return ventaGuardada;
  },

  // Dar de Baja Burocrática (Daño o Defecto)
  async registrarBajaBurocratica(prodId, motivo, justificacion, fotoEvidencia, vendedorId) {
    const productos = this.getCollection('productos');
    const prod = productos.find(p => p.id === prodId);
    if (!prod) return false;

    // 1. Cambiar estado a 'baja' y guardar detalles del acta
    prod.estado = 'baja';
    prod.bajaDetalle = {
      motivo,
      justificacion,
      fotoEvidencia, // Base64
      fecha: new Date().toISOString(),
      vendedorId
    };
    await this.saveRow('productos', prod);

    // 2. Registrar el Egreso (Pérdida contable)
    const egreso = {
      id: null,
      descripcion: `[BAJA:${prod.id}] - ${prod.modelo} (${prod.codigo || 'Sin código'}) - Motivo: ${motivo}`,
      monto: prod.costoReal,
      fecha: new Date().toISOString().split('T')[0],
      vendedorId: vendedorId
    };
    await this.saveRow('egresos', egreso);

    return true;
  },

  // Registrar Reemplazo de Garantía por el Proveedor
  async registrarReemplazoGarantia(prodBajaId, nuevoImei, nuevaFotoBase64, observaciones, vendedorId) {
    const productos = this.getCollection('productos');
    const prodOriginal = productos.find(p => p.id === prodBajaId);
    if (!prodOriginal || prodOriginal.estado !== 'baja') return false;

    // 1. Marcar el producto viejo como 'reemplazado'
    prodOriginal.estado = 'reemplazado';
    if (!prodOriginal.reemplazoDetalle) prodOriginal.reemplazoDetalle = {};
    prodOriginal.reemplazoDetalle = {
      nuevoImei,
      observaciones,
      fecha: new Date().toISOString(),
      vendedorId
    };
    await this.saveRow('productos', prodOriginal);

    // 2. Crear el nuevo producto listo para la venta (hereda costos del lote)
    const nuevoProd = {
      id: null,
      loteId: prodOriginal.loteId,
      tipo: prodOriginal.tipo,
      modelo: prodOriginal.modelo,
      tipoCodigo: prodOriginal.tipoCodigo,
      codigo: nuevoImei,
      costoBase: prodOriginal.costoBase,
      costoReal: prodOriginal.costoReal,
      precioSugerido: prodOriginal.precioSugerido,
      precioVenta: prodOriginal.precioVenta,
      stock: 1,
      estado: 'disponible',
      foto: nuevaFotoBase64 || prodOriginal.foto // Si no hay nueva, hereda la anterior
    };
    await this.saveRow('productos', nuevoProd);

    // 3. Anular/Revertir el Egreso por Pérdida
    // Buscamos el egreso que contenga la marca del producto dado de baja [BAJA:ID]
    const egresos = this.getCollection('egresos');
    const egresoOriginal = egresos.find(e => e.descripcion.includes(`[BAJA:${prodOriginal.id}]`));
    
    if (egresoOriginal) {
      if (this.isDemoMode) {
        // En modo demo simplemente lo eliminamos del LocalStorage
        await this.deleteRow('egresos', egresoOriginal.id);
      } else {
        // En Sheets lo ponemos a $0 y actualizamos descripción para mantener rastro
        egresoOriginal.monto = 0;
        egresoOriginal.descripcion = `[REEMPLAZADO] ${egresoOriginal.descripcion}`;
        await this.saveRow('egresos', egresoOriginal);
      }
    }

    return true;
  },

  // --- REPORTES Y METRICAS CONTABLES ---
  
  getDailySummary(dateString) {
    const targetDate = dateString || new Date().toISOString().split('T')[0];
    
    const ventas = this.getCollection('ventas');
    const egresos = this.getCollection('egresos');
    
    const ventasDia = ventas.filter(v => v.fecha.startsWith(targetDate));
    const egresosDia = egresos.filter(e => e.fecha.startsWith(targetDate));

    let totalVendido = 0;
    let costoTotalVendido = 0;
    let efectivo = 0;
    let transferencia = 0;

    ventasDia.forEach(v => {
      totalVendido += v.total;
      if (v.metodoPago === 'efectivo') efectivo += v.total;
      else transferencia += v.total;

      v.articulos.forEach(art => {
        costoTotalVendido += (art.costoReal || 0) * (art.cantidad || 1);
      });
    });

    const totalEgresos = egresosDia.reduce((sum, e) => sum + parseFloat(e.monto), 0);
    const utilidadBruta = totalVendido - costoTotalVendido;
    const utilidadNeta = utilidadBruta - totalEgresos;

    return {
      fecha: targetDate,
      totalVendido,
      utilidadBruta,
      utilidadNeta,
      totalEgresos,
      efectivo,
      transferencia,
      cantidadVentas: ventasDia.length,
      egresos: egresosDia,
      ventas: ventasDia
    };
  },

  // Calcular el valorizado de todo el almacén (inventario activo disponible)
  getValuedInventory() {
    const productos = this.getCollection('productos').filter(p => p.estado === 'disponible');
    
    let inversionTotal = 0;
    let ventaEsperada = 0;

    productos.forEach(p => {
      const qty = p.tipoCodigo === 'ninguno' ? p.stock : 1;
      inversionTotal += p.costoReal * qty;
      ventaEsperada += p.precioVenta * qty;
    });

    const gananciaEsperada = ventaEsperada - inversionTotal;

    return {
      inversionTotal,
      ventaEsperada,
      gananciaEsperada,
      totalArticulos: productos.length
    };
  },

  // Resetear base de datos completa
  async resetDatabaseToDefault() {
    if (this.isDemoMode) {
      localStorage.removeItem('demo_vendedores');
      localStorage.removeItem('demo_proveedores');
      localStorage.removeItem('demo_clientes');
      localStorage.removeItem('demo_lotes');
      localStorage.removeItem('demo_productos');
      localStorage.removeItem('demo_ventas');
      localStorage.removeItem('demo_egresos');
      this.initLocalDemo();
      return true;
    } else {
      try {
        const res = await fetch(this.apiURL, {
          method: 'POST',
          redirect: 'follow',
          body: JSON.stringify({ action: 'reset' })
        });
        const json = await res.json();
        if (json.status === 'success') {
          await this.syncAll();
          return true;
        }
        return false;
      } catch (err) {
        console.error("Error al resetear Sheets:", err);
        return false;
      }
    }
  }
};
