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
    
    // Limpieza de caché local antigua si existía de sesiones anteriores de pruebas
    const localSellers = JSON.parse(localStorage.getItem('demo_vendedores')) || [];
    const hasThorLocal = localSellers.some(s => s.usuario === 'admin@thor.com');
    if (!hasThorLocal && localStorage.getItem('demo_vendedores')) {
      console.log("Limpiando caché local antigua para actualizar credenciales de Thor...");
      localStorage.removeItem('demo_vendedores');
      localStorage.removeItem('demo_proveedores');
      localStorage.removeItem('demo_clientes');
      localStorage.removeItem('demo_lotes');
      localStorage.removeItem('demo_productos');
      localStorage.removeItem('demo_ventas');
      localStorage.removeItem('demo_egresos');
      localStorage.removeItem('demo_modelos');
    }

    // Forzar la última URL provista para evitar conflictos con URLs antiguas en caché de LocalStorage
    const storedUrl = localStorage.getItem('cel_google_sheet_url');
    if (storedUrl !== defaultUrl) {
      console.log("Actualizando URL de base de datos a la última versión configurada...");
      localStorage.setItem('cel_google_sheet_url', defaultUrl);
      this.apiURL = defaultUrl;
    } else {
      this.apiURL = storedUrl || defaultUrl;
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

  // Inicializar base de datos local (Modo Demo / Fallback) con credenciales de Thor y modelos
  initLocalDemo() {
    console.log("Iniciando Modo Demo en LocalStorage...");
    
    // Iniciar Mocks si no existen localmente
    if (!localStorage.getItem('demo_vendedores')) {
      const defaultSellers = [
        { id: 'v-1', nombre: 'Administrador Thor', usuario: 'admin@thor.com', contrasena: 'thor1996', rol: 'admin' },
        { id: 'v-2', nombre: 'Vendedor Uno', usuario: 'vendedor1@thor.com', contrasena: 'ventasthor1', rol: 'vendedor' },
        { id: 'v-3', nombre: 'Vendedor Dos', usuario: 'vendedor2@thor.com', contrasena: 'ventasthor2', rol: 'vendedor' }
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
        }
      ];
      localStorage.setItem('demo_productos', JSON.stringify(defaultProducts));

      const defaultSales = [];
      localStorage.setItem('demo_ventas', JSON.stringify(defaultSales));

      const defaultExpenses = [];
      localStorage.setItem('demo_egresos', JSON.stringify(defaultExpenses));

      const defaultModels = [
        { id: 'm-1', marca: 'Samsung', modelo: 'Samsung Galaxy S23 Ultra', tipo: 'Celular' },
        { id: 'm-2', marca: 'Xiaomi', modelo: 'Xiaomi Redmi Note 13 Pro', tipo: 'Celular' },
        { id: 'm-3', marca: 'Apple', modelo: 'iPhone 15 Pro Max', tipo: 'Celular' },
        { id: 'm-4', marca: 'Lenovo', modelo: 'Laptop Lenovo ThinkPad L14', tipo: 'Laptop' },
        { id: 'm-5', marca: 'Genérico', modelo: 'Cargador Rápido Tipo-C 25W', tipo: 'Cargador' },
        { id: 'm-6', marca: 'Genérico', modelo: 'Cable Trenzado Tipo-C a C 2m', tipo: 'Cable' }
      ];
      localStorage.setItem('demo_modelos', JSON.stringify(defaultModels));
    }

    // Cargar caché desde LocalStorage
    const tables = ['vendedores', 'proveedores', 'clientes', 'lotes', 'productos', 'ventas', 'egresos', 'modelos'];
    tables.forEach(t => {
      this.cache[t] = JSON.parse(localStorage.getItem('demo_' + t)) || [];
    });
  },

  // Sincronizar todos los datos desde Google Sheets (GET)
  async syncAll() {
    if (!this.apiURL) return false;
    try {
      const res = await fetch(`${this.apiURL}?action=getAll&_=${Date.now()}`, { method: 'GET' });
      const json = await res.json();
      if (json.status === 'success') {
        this.cache = json.data;
        
        // BOOTSTRAP AUTOMÁTICO: Si la base de datos en la nube está vacía de usuarios, inicializarla
        if (!this.cache.vendedores || this.cache.vendedores.length === 0) {
          console.log("Inicializando base de datos vacía en Google Sheets...");
          await this.bootstrapGoogleSheets();
        }
        return true;
      }
      return false;
    } catch (e) {
      console.error("Error al sincronizar con Google Sheets:", e);
      return false;
    }
  },

  // Inicialización automática de datos requeridos en Google Sheets
  async bootstrapGoogleSheets() {
    const defaultSellers = [
      { id: 'v-1', nombre: 'Administrador Thor', usuario: 'admin@thor.com', contrasena: 'thor1996', rol: 'admin' },
      { id: 'v-2', nombre: 'Vendedor Uno', usuario: 'vendedor1@thor.com', contrasena: 'ventasthor1', rol: 'vendedor' },
      { id: 'v-3', nombre: 'Vendedor Dos', usuario: 'vendedor2@thor.com', contrasena: 'ventasthor2', rol: 'vendedor' }
    ];
    for (let s of defaultSellers) {
      await this.saveRow('vendedores', s);
    }

    const defaultModels = [
      { id: 'm-1', marca: 'Samsung', modelo: 'Samsung Galaxy S23 Ultra', tipo: 'Celular' },
      { id: 'm-2', marca: 'Xiaomi', modelo: 'Xiaomi Redmi Note 13 Pro', tipo: 'Celular' },
      { id: 'm-3', marca: 'Apple', modelo: 'iPhone 15 Pro Max', tipo: 'Celular' },
      { id: 'm-4', marca: 'Lenovo', modelo: 'Laptop Lenovo ThinkPad L14', tipo: 'Laptop' },
      { id: 'm-5', marca: 'Genérico', modelo: 'Cargador Rápido Tipo-C 25W', tipo: 'Cargador' },
      { id: 'm-6', marca: 'Genérico', modelo: 'Cable Trenzado Tipo-C a C 2m', tipo: 'Cable' }
    ];
    for (let m of defaultModels) {
      await this.saveRow('modelos', m);
    }

    // Cargar proveedores iniciales de prueba
    const defaultProviders = [
      { id: 'p-1', nombre: 'Celular Express Mayorista', telefono: '+57 312 4567890', email: 'ventas@celularexpress.com' },
      { id: 'p-2', nombre: 'Accesorios & Cargas SAS', telefono: '+57 300 9876543', email: 'contacto@accesorioscargas.com' }
    ];
    for (let p of defaultProviders) {
      await this.saveRow('proveedores', p);
    }

    // Cargar clientes iniciales de prueba
    const defaultClients = [
      { id: 'c-general', nombre: 'Cliente General (Venta Rápida)', documento: '99999999', telefono: '00000000' },
      { id: 'c-1', nombre: 'María Camila Ortega', documento: '1098765432', telefono: '+57 315 2223344' }
    ];
    for (let c of defaultClients) {
      await this.saveRow('clientes', c);
    }

    // Volver a descargar todo ya inicializado
    const res = await fetch(`${this.apiURL}?action=getAll&_=${Date.now()}`, { method: 'GET' });
    const json = await res.json();
    if (json.status === 'success') {
      this.cache = json.data;
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
      const res = await fetch(`${url}?action=getAll&_=${Date.now()}`, { method: 'GET' });
      const json = await res.json();
      if (json.status === 'success') {
        localStorage.setItem('cel_google_sheet_url', url);
        this.apiURL = url;
        this.isDemoMode = false;
        this.cache = json.data;
        
        if (!this.cache.vendedores || this.cache.vendedores.length === 0) {
          await this.bootstrapGoogleSheets();
        }
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

  // --- MODELOS ---
  getModelos() { return this.getCollection('modelos'); },
  getVendedores() { return this.getCollection('vendedores'); },
  getClientes() { return this.getCollection('clientes'); },
  getProveedores() { return this.getCollection('proveedores'); },
  getLotes() { return this.getCollection('lotes'); },
  getProductos() { return this.getCollection('productos'); },
  getVentas() { return this.getCollection('ventas'); },
  getEgresos() { return this.getCollection('egresos'); },

  // --- CRUD HELPERS FOR LOTES AND PRODUCTS ---
  async saveLote(lote) {
    const savedLote = await this.saveRow('lotes', lote);
    await this.recalcularProrrateoLote(savedLote.id);
    return savedLote;
  },

  async saveProducto(producto) {
    const savedProducto = await this.saveRow('productos', producto);
    await this.recalcularProrrateoLote(savedProducto.loteId);
    return savedProducto;
  },

  async deleteProduct(id) {
    const products = this.getCollection('productos');
    const prod = products.find(p => p.id === id);
    const loteId = prod ? prod.loteId : null;
    const deleted = await this.deleteRow('productos', id);
    if (deleted && loteId) {
      await this.recalcularProrrateoLote(loteId);
    }
    return deleted;
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
    const ventaGuardada = await this.saveRow('ventas', venta);

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

    prod.estado = 'baja';
    prod.bajaDetalle = {
      motivo,
      justificacion,
      fotoEvidencia, // Base64
      fecha: new Date().toISOString(),
      vendedorId
    };
    await this.saveRow('productos', prod);

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

    prodOriginal.estado = 'reemplazado';
    if (!prodOriginal.reemplazoDetalle) prodOriginal.reemplazoDetalle = {};
    prodOriginal.reemplazoDetalle = {
      nuevoImei,
      observaciones,
      fecha: new Date().toISOString(),
      vendedorId
    };
    await this.saveRow('productos', prodOriginal);

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
      foto: nuevaFotoBase64 || prodOriginal.foto
    };
    await this.saveRow('productos', nuevoProd);

    const egresos = this.getCollection('egresos');
    const egresoOriginal = egresos.find(e => e.descripcion.includes(`[BAJA:${prodOriginal.id}]`));
    
    if (egresoOriginal) {
      if (this.isDemoMode) {
        await this.deleteRow('egresos', egresoOriginal.id);
      } else {
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
      localStorage.removeItem('demo_modelos');
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
