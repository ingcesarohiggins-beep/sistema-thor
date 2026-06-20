// js/db.js
// Capa de Datos Asíncrona para Sistema de Control de Inventario
// Se conecta a Google Sheets mediante la URL de Google Apps Script. 
// Si no hay URL, opera en "Modo Demo" con LocalStorage y mocks locales.

const DB = {
  supabaseUrl: null,
  supabaseKey: null,
  supabase: null,
  cache: {},
  isDemoMode: true,

  // Limpiar y normalizar URL de Supabase para evitar errores si el usuario copia la URL REST
  sanitizeSupabaseUrl(url) {
    if (!url) return '';
    let clean = url.trim();
    const restIdx = clean.indexOf('/rest/v1');
    if (restIdx !== -1) {
      clean = clean.substring(0, restIdx);
    }
    if (clean.endsWith('/')) {
      clean = clean.slice(0, -1);
    }
    return clean;
  },

  // Inicialización
  async init() {
    this.supabaseUrl = 'https://sxhubnprneoyeqaauile.supabase.co';
    this.supabaseKey = 'sb_publishable_J9VWns-2lGZJsFZ3g7EphA_spg8F9fA';
    
    if (this.supabaseUrl && this.supabaseKey) {
      try {
        this.supabase = window.supabase.createClient(this.supabaseUrl, this.supabaseKey);
        this.isDemoMode = false;
        const connected = await this.syncAll();
        if (!connected) {
          console.warn("Fallo al conectar con Supabase. Iniciando en Modo Demo.");
          this.isDemoMode = true;
          this.initLocalDemo();
        } else {
          await this.autoHealProducts();
        }
      } catch (e) {
        console.error("Fallo al inicializar cliente Supabase:", e);
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

  // Sincronizar todos los datos desde Supabase (GET)
  async syncAll() {
    if (!this.supabase) return false;
    try {
      const tables = ['vendedores', 'proveedores', 'clientes', 'modelos', 'lotes', 'productos', 'ventas', 'egresos'];
      const promises = tables.map(table => this.supabase.from(table).select('*'));
      const results = await Promise.all(promises);
      
      const newCache = {};
      for (let i = 0; i < tables.length; i++) {
        const { data, error } = results[i];
        if (error) {
          console.error(`Error al cargar tabla ${tables[i]}:`, error);
          return false;
        }
        newCache[tables[i]] = data || [];
      }
      
      this.cache = newCache;
      return true;
    } catch (e) {
      console.error("Error al sincronizar con Supabase:", e);
      return false;
    }
  },

  // Guardar y probar configuración de Supabase
  async setSupabaseConfig(url, key) {
    url = this.sanitizeSupabaseUrl(url);
    key = key ? key.trim() : '';

    if (!url || !key) {
      localStorage.removeItem('cel_supabase_url');
      localStorage.removeItem('cel_supabase_key');
      this.supabaseUrl = null;
      this.supabaseKey = null;
      this.supabase = null;
      this.isDemoMode = true;
      this.initLocalDemo();
      return { success: true, message: 'Configuración de Supabase eliminada. Modo demo activado.' };
    }

    try {
      const testClient = window.supabase.createClient(url, key);
      const { data, error } = await testClient.from('vendedores').select('*').limit(1);
      if (error) {
        return { success: false, message: `Error al conectar a Supabase: ${error.message}` };
      }
      
      localStorage.setItem('cel_supabase_url', url);
      localStorage.setItem('cel_supabase_key', key);
      this.supabaseUrl = url;
      this.supabaseKey = key;
      this.supabase = testClient;
      this.isDemoMode = false;
      
      const connected = await this.syncAll();
      if (!connected) {
        return { success: false, message: 'Se conectó pero falló la sincronización de las tablas.' };
      }
      return { success: true, message: '¡Conexión y sincronización con Supabase establecidas con éxito!' };
    } catch (e) {
      return { success: false, message: `No se pudo conectar a Supabase. Detalle: ${e.message}` };
    }
  },

  async testSupabaseConfig(url, key) {
    url = this.sanitizeSupabaseUrl(url);
    key = key ? key.trim() : '';

    if (!url || !key) {
      return { success: false, message: 'La URL y la clave Anon Key son obligatorias.' };
    }
    try {
      const testClient = window.supabase.createClient(url, key);
      const { data, error } = await testClient.from('vendedores').select('*').limit(1);
      if (error) {
        return { success: false, message: `Error en la prueba de conexión: ${error.message}` };
      }
      return { success: true, message: '¡Prueba de conexión exitosa! Supabase responde correctamente.' };
    } catch (e) {
      return { success: false, message: `Error de red o conexión: ${e.message}` };
    }
  },

  // --- MÉTODOS CRUD GENÉRICOS (Trabajan con caché e impactan Sheets/Demo) ---

  getCollection(key) {
    return this.cache[key] || [];
  },

  async saveRow(sheetName, rowData) {
    const collection = this.getCollection(sheetName);
    
    if (!rowData.id) {
      rowData.id = sheetName.substring(0, 3) + '-' + Date.now();
    }

    if (this.isDemoMode) {
      // Guardado Local (Modo Demo)
      const idx = collection.findIndex(item => item.id === rowData.id);
      if (idx !== -1) {
        collection[idx] = rowData;
      } else {
        collection.push(rowData);
      }
      this.cache[sheetName] = collection;
      localStorage.setItem('demo_' + sheetName, JSON.stringify(collection));
      return rowData;
    } else {
      // Guardado en la Nube (Supabase)
      try {
        const { data, error } = await this.supabase
          .from(sheetName)
          .upsert(rowData)
          .select();
        
        if (error) throw error;
        
        const savedRow = (data && data[0]) ? data[0] : rowData;
        const idx = collection.findIndex(item => item.id === savedRow.id);
        if (idx !== -1) {
          collection[idx] = savedRow;
        } else {
          collection.push(savedRow);
        }
        this.cache[sheetName] = collection;
        return savedRow;
      } catch (err) {
        console.error(`Error al guardar fila en Supabase (${sheetName}):`, err);
        alert(`Error de conexión al guardar datos en Supabase: ${err.message || err}`);
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
        const { error } = await this.supabase
          .from(sheetName)
          .delete()
          .eq('id', id);
        
        if (error) throw error;
        
        this.cache[sheetName] = collection.filter(item => item.id !== id);
        return true;
      } catch (err) {
        console.error(`Error al eliminar fila en Supabase (${sheetName}):`, err);
        alert(`Error al eliminar datos en Supabase: ${err.message || err}`);
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

  // Recalcular costo real en todos los productos de un lote (flete desactivado)
  async recalcularProrrateoLote(loteId) {
    if (!loteId) return;
    const lotes = this.getCollection('lotes');
    const lote = lotes.find(l => l.id === loteId);
    if (!lote) return;

    const productos = this.getCollection('productos');
    const productosDelLote = productos.filter(p => p.loteId === loteId);
    if (productosDelLote.length === 0) return;

    for (let p of productos) {
      if (p.loteId === loteId) {
        p.costoReal = parseFloat(p.costoBase);
        p.precioSugerido = p.costoReal * 1.20; // Utilidad del 20%
        
        if (!p.precioVenta || p.precioVenta < p.costoReal) {
          p.precioVenta = p.precioSugerido;
        }

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
      color: prodOriginal.color || '',
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

    return true;
  },

  // --- REPORTES Y METRICAS CONTABLES ---
  
  getDailySummary(dateString, vendedorId = null) {
    const targetDate = dateString || new Date().toISOString().split('T')[0];
    
    const ventas = this.getCollection('ventas');
    const egresos = this.getCollection('egresos');
    
    let ventasDia = ventas.filter(v => v.fecha.startsWith(targetDate));
    let egresosDia = egresos.filter(e => e.fecha.startsWith(targetDate));

    if (vendedorId) {
      ventasDia = ventasDia.filter(v => v.vendedorId === vendedorId);
      egresosDia = egresosDia.filter(e => e.vendedorId === vendedorId);
    }

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

  // Autocorrección de datos desalineados en Sheets
  async autoHealProducts() {
    const products = this.getCollection('productos');
    let updatedAny = false;

    for (let p of products) {
      // Caso 1: Desalineado leve (color es 'imei' y tipoCodigo es un número (IMEI))
      if (p.color === 'imei' && typeof p.tipoCodigo === 'number') {
        const correctImei = p.tipoCodigo;
        const correctCostoBase = parseFloat(p.codigo) || 0;
        const correctCostoReal = parseFloat(p.costoBase) || 0;
        const correctPrecioSugerido = parseFloat(p.costoReal) || 0;
        const correctPrecioVenta = parseFloat(p.precioSugerido) || 0;
        const correctStock = parseInt(p.precioVenta) || 1;
        const correctEstado = p.stock || 'disponible';

        p.color = '';
        p.tipoCodigo = 'imei';
        p.codigo = correctImei.toString();
        p.costoBase = correctCostoBase;
        p.costoReal = correctCostoReal;
        p.precioSugerido = correctPrecioSugerido;
        p.precioVenta = correctPrecioVenta;
        p.stock = correctStock;
        p.estado = correctEstado;
        
        await this.saveRow('productos', p);
        updatedAny = true;
      }
      // Caso 2: Desalineado severo (color es un número (IMEI) y tipoCodigo es un número (Costo))
      else if (typeof p.color === 'number' && typeof p.tipoCodigo === 'number') {
        const correctImei = p.color;
        const correctCostoBase = p.tipoCodigo;
        const correctCostoReal = parseFloat(p.codigo) || 0;
        const correctPrecioSugerido = parseFloat(p.costoBase) || 0;
        const correctPrecioVenta = parseFloat(p.precioSugerido) || 0;
        const correctStock = parseInt(p.precioVenta) || 1;
        const correctEstado = p.stock || 'disponible';

        p.color = '';
        p.tipoCodigo = 'imei';
        p.codigo = correctImei.toString();
        p.costoBase = correctCostoBase;
        p.costoReal = correctCostoReal;
        p.precioSugerido = correctPrecioSugerido;
        p.precioVenta = correctPrecioVenta;
        p.stock = correctStock;
        p.estado = correctEstado;

        await this.saveRow('productos', p);
        updatedAny = true;
      }
    }

    if (updatedAny) {
      console.log("¡Base de datos sanada y sincronizada!");
      await this.syncAll();
    }
  },

  getValuedInventory() {
    const todosProductos = this.getCollection('productos');
    const disponibles = todosProductos.filter(p => p.estado === 'disponible');
    const bajas = todosProductos.filter(p => p.estado === 'baja');

    let inversionTotal = 0;
    let ventaEsperada = 0;

    disponibles.forEach(p => {
      const qty = p.tipoCodigo === 'ninguno' ? p.stock : 1;
      inversionTotal += p.costoReal * qty;
      ventaEsperada += p.precioVenta * qty;
    });

    let inversionBajas = 0;
    bajas.forEach(p => {
      const qty = p.tipoCodigo === 'ninguno' ? p.stock : 1;
      inversionBajas += p.costoBase * qty;
    });

    const gananciaEsperada = ventaEsperada - inversionTotal;

    return {
      inversionTotal,
      ventaEsperada,
      gananciaEsperada,
      totalArticulos: disponibles.length,
      inversionBajas,
      totalBajas: bajas.length
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
        // Eliminar en orden de dependencias para evitar violaciones de clave foránea
        const tablesToDelete = ['egresos', 'ventas', 'productos', 'lotes', 'modelos', 'clientes', 'proveedores', 'vendedores'];
        for (const table of tablesToDelete) {
          const { error } = await this.supabase.from(table).delete().neq('id', '_dummy_id_');
          if (error) throw error;
        }

        // Insertar vendedores iniciales
        const defaultSellers = [
          { id: 'v-1', nombre: 'Administrador Thor', usuario: 'admin@thor.com', contrasena: 'thor1996', rol: 'admin' },
          { id: 'v-2', nombre: 'Vendedor Uno', usuario: 'vendedor1@thor.com', contrasena: 'ventasthor1', rol: 'vendedor' },
          { id: 'v-3', nombre: 'Vendedor Dos', usuario: 'vendedor2@thor.com', contrasena: 'ventasthor2', rol: 'vendedor' }
        ];
        const { error: errSellers } = await this.supabase.from('vendedores').insert(defaultSellers);
        if (errSellers) throw errSellers;

        // Insertar proveedores iniciales
        const defaultProviders = [
          { id: 'p-1', nombre: 'Celular Express Mayorista', telefono: '+57 312 4567890', email: 'ventas@celularexpress.com' },
          { id: 'p-2', nombre: 'Accesorios & Cargas SAS', telefono: '+57 300 9876543', email: 'contacto@accesorioscargas.com' }
        ];
        const { error: errProviders } = await this.supabase.from('proveedores').insert(defaultProviders);
        if (errProviders) throw errProviders;

        // Insertar clientes iniciales
        const defaultClients = [
          { id: 'c-general', nombre: 'Cliente General (Venta Rápida)', documento: '99999999', telefono: '00000000' },
          { id: 'c-1', nombre: 'María Camila Ortega', documento: '1098765432', telefono: '+57 315 2223344' }
        ];
        const { error: errClients } = await this.supabase.from('clientes').insert(defaultClients);
        if (errClients) throw errClients;

        // Insertar modelos iniciales
        const defaultModels = [
          { id: 'm-1', marca: 'Apple', modelo: 'iPhone 11 R 64GB', tipo: 'Celular' },
          { id: 'm-2', marca: 'Apple', modelo: 'iPhone 13 R 128GB', tipo: 'Celular' },
          { id: 'm-3', marca: 'Apple', modelo: 'iPhone 14 eSIM 128GB', tipo: 'Celular' },
          { id: 'm-4', marca: 'Apple', modelo: 'iPhone 14 Chip 128GB', tipo: 'Celular' },
          { id: 'm-5', marca: 'Apple', modelo: 'iPhone 15 128GB', tipo: 'Celular' },
          { id: 'm-6', marca: 'Apple', modelo: 'iPhone 15 Pro Max eSIM 256GB', tipo: 'Celular' },
          { id: 'm-7', marca: 'Apple', modelo: 'iPhone 16 Chip 128GB', tipo: 'Celular' },
          { id: 'm-8', marca: 'Apple', modelo: 'iPhone 16 Chip 256GB', tipo: 'Celular' },
          { id: 'm-9', marca: 'Apple', modelo: 'iPhone 16 Plus 128GB', tipo: 'Celular' },
          { id: 'm-10', marca: 'Apple', modelo: 'iPhone 16 Pro Chip 128GB', tipo: 'Celular' },
          { id: 'm-11', marca: 'Apple', modelo: 'iPhone 16 Pro Max Chip 256GB', tipo: 'Celular' },
          { id: 'm-12', marca: 'Apple', modelo: 'iPhone 17 Chip 256GB', tipo: 'Celular' },
          { id: 'm-13', marca: 'Apple', modelo: 'iPhone 17 eSIM 256GB', tipo: 'Celular' },
          { id: 'm-14', marca: 'Apple', modelo: 'iPhone 17 Pro eSIM 256GB', tipo: 'Celular' },
          { id: 'm-15', marca: 'Apple', modelo: 'iPhone 17 Pro Chip 256GB', tipo: 'Celular' },
          { id: 'm-16', marca: 'Apple', modelo: 'iPhone 17 Pro eSIM 512GB', tipo: 'Celular' },
          { id: 'm-17', marca: 'Apple', modelo: 'iPhone 17 Pro Chip 1TB', tipo: 'Celular' },
          { id: 'm-18', marca: 'Apple', modelo: 'iPhone 17 Pro Max eSIM 256GB', tipo: 'Celular' },
          { id: 'm-19', marca: 'Apple', modelo: 'iPhone 17 Pro Max Chip 256GB', tipo: 'Celular' },
          { id: 'm-20', marca: 'Apple', modelo: 'iPhone 17 Pro Max eSIM 512GB', tipo: 'Celular' },
          { id: 'm-21', marca: 'Apple', modelo: 'iPhone 17 Pro Max Chip 512GB', tipo: 'Celular' },
          { id: 'm-22', marca: 'Apple', modelo: 'iPhone 17 Pro Max eSIM 1TB', tipo: 'Celular' },
          { id: 'm-23', marca: 'Apple', modelo: 'MacBook Pro 14" M3 (8GB/512GB)', tipo: 'Laptop' },
          { id: 'm-24', marca: 'Apple', modelo: 'MacBook Pro 14" M3 Pro (18GB/512GB)', tipo: 'Laptop' },
          { id: 'm-25', marca: 'Apple', modelo: 'MacBook Pro 16" M3 Max (36GB/1TB)', tipo: 'Laptop' },
          { id: 'm-26', marca: 'Genérico', modelo: 'Cargador Rápido Tipo-C 20W', tipo: 'Cargador' },
          { id: 'm-27', marca: 'Genérico', modelo: 'Cable USB-C a Lightning 1m', tipo: 'Cable' }
        ];
        const { error: errModels } = await this.supabase.from('modelos').insert(defaultModels);
        if (errModels) throw errModels;

        await this.syncAll();
        return true;
      } catch (err) {
        console.error("Error al resetear base de datos en Supabase:", err);
        alert(`Error al formatear Supabase: ${err.message || err}`);
        return false;
      }
    }
  }
};
