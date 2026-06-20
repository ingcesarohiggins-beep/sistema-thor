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

  getDefaultColores() {
    return [
      { id: 'col-1', nombre: 'Space Gray' },
      { id: 'col-2', nombre: 'Silver' },
      { id: 'col-3', nombre: 'Gold' },
      { id: 'col-4', nombre: 'Midnight' },
      { id: 'col-5', nombre: 'Starlight' },
      { id: 'col-6', nombre: 'Negro' },
      { id: 'col-7', nombre: 'Blanco' },
      { id: 'col-8', nombre: 'Azul' },
      { id: 'col-9', nombre: 'Rojo' },
      { id: 'col-10', nombre: 'Verde' }
    ];
  },

  getDefaultCapacidades() {
    return [
      { id: 'cap-1', valor: '64GB' },
      { id: 'cap-2', valor: '128GB' },
      { id: 'cap-3', valor: '256GB' },
      { id: 'cap-4', valor: '512GB' },
      { id: 'cap-5', valor: '1TB' },
      { id: 'cap-6', valor: '8GB/512GB' },
      { id: 'cap-7', valor: '18GB/512GB' },
      { id: 'cap-8', valor: '36GB/1TB' }
    ];
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
          id: 'prod-1', loteId: 'l-1', tipo: 'Celular', modelo: 'Samsung Galaxy S23 Ultra 256GB', 
          tipoCodigo: 'imei', codigo: '358912345678901', costoBase: 3500000, costoReal: 3605000, 
          precioSugerido: 4326000, precioVenta: 4326000, stock: 1, estado: 'disponible', foto: '' 
        },
        { 
          id: 'prod-2', loteId: 'l-1', tipo: 'Celular', modelo: 'Xiaomi Redmi Note 13 Pro 128GB', 
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

    if (!localStorage.getItem('demo_colores')) {
      localStorage.setItem('demo_colores', JSON.stringify(this.getDefaultColores()));
    }
    if (!localStorage.getItem('demo_capacidades')) {
      localStorage.setItem('demo_capacidades', JSON.stringify(this.getDefaultCapacidades()));
    }

    // Cargar caché desde LocalStorage
    const tables = ['vendedores', 'proveedores', 'clientes', 'lotes', 'productos', 'ventas', 'egresos', 'modelos', 'colores', 'capacidades'];
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

      // Carga resiliente de catálogos (colores y capacidades)
      try {
        const { data: colData, error: colErr } = await this.supabase.from('colores').select('*');
        if (colErr) throw colErr;
        newCache['colores'] = colData || [];
      } catch (err) {
        console.warn("Tabla 'colores' no encontrada en Supabase. Cargando valores por defecto.", err);
        newCache['colores'] = this.getDefaultColores();
      }

      try {
        const { data: capData, error: capErr } = await this.supabase.from('capacidades').select('*');
        if (capErr) throw capErr;
        newCache['capacidades'] = capData || [];
      } catch (err) {
        console.warn("Tabla 'capacidades' no encontrada en Supabase. Cargando valores por defecto.", err);
        newCache['capacidades'] = this.getDefaultCapacidades();
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

  // Resetear base de datos completa con Datos de Prueba (Mocks masivos)
  async resetDatabaseToDefault() {
    if (this.isDemoMode) {
      const mockData = this.generateMockData();
      Object.keys(mockData).forEach(table => {
        localStorage.setItem('demo_' + table, JSON.stringify(mockData[table]));
      });
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

        // Limpiar catálogos opcionales si existen
        try {
          await this.supabase.from('colores').delete().neq('id', '_dummy_id_');
          await this.supabase.from('capacidades').delete().neq('id', '_dummy_id_');
        } catch (e) {
          console.warn("No se pudieron limpiar las tablas opcionales de catálogos en Supabase", e);
        }

        const mockData = this.generateMockData();

        // Insertar en orden correcto para respetar claves foráneas (FK)
        const { error: errSellers } = await this.supabase.from('vendedores').insert(mockData.vendedores);
        if (errSellers) throw errSellers;

        const { error: errProviders } = await this.supabase.from('proveedores').insert(mockData.proveedores);
        if (errProviders) throw errProviders;

        const { error: errClients } = await this.supabase.from('clientes').insert(mockData.clientes);
        if (errClients) throw errClients;

        const { error: errModels } = await this.supabase.from('modelos').insert(mockData.modelos);
        if (errModels) throw errModels;

        // Insertar colores y capacidades opcionales
        try {
          await this.supabase.from('colores').insert(mockData.colores);
          await this.supabase.from('capacidades').insert(mockData.capacidades);
        } catch (e) {
          console.warn("No se pudieron insertar colores y capacidades en Supabase", e);
        }

        const { error: errLotes } = await this.supabase.from('lotes').insert(mockData.lotes);
        if (errLotes) throw errLotes;

        // Insertar productos masivos (300 celulares + 50 laptops + accesorios)
        // El SDK de Supabase maneja perfectamente un array de ~350 filas en un solo insert
        const { error: errProducts } = await this.supabase.from('productos').insert(mockData.productos);
        if (errProducts) throw errProducts;

        await this.syncAll();
        return true;
      } catch (err) {
        console.error("Error al resetear base de datos en Supabase con Mocks:", err);
        alert(`Error al formatear Supabase: ${err.message || err}`);
        return false;
      }
    }
  },

  // Generador Programático de Datos Masivos para Pruebas Completas
  generateMockData() {
    const defaultSellers = [
      { id: 'v-1', nombre: 'Administrador Thor', usuario: 'admin@thor.com', contrasena: 'thor1996', rol: 'admin' },
      { id: 'v-2', nombre: 'Vendedor Uno', usuario: 'vendedor1@thor.com', contrasena: 'ventasthor1', rol: 'vendedor' },
      { id: 'v-3', nombre: 'Vendedor Dos', usuario: 'vendedor2@thor.com', contrasena: 'ventasthor2', rol: 'vendedor' }
    ];

    // 25 Proveedores
    const providers = [];
    const providerNames = [
      'Celular Express Mayorista', 'Accesorios & Cargas SAS', 'Importaciones Thor Lima', 'Tech Distribution PE',
      'Global Phones S.A.C.', 'Mayorista Alianza Movil', 'Proveedor Alpha Electronica', 'Accesorios Moviles del Peru',
      'Suministros Corporativos Tech', 'Importadora Cellnet', 'Distribuidor Movil Central', 'Inversiones Telefonicas PE',
      'Smarttech Mayoristas', 'Grupo Conectividad Peru', 'Master Cell Peru', 'Premium Accessories S.A.',
      'Suministros Alfa & Omega', 'Distribuidora Lima Celular', 'Mayorista Omega Tech', 'Comercializadora Movil SAC',
      'Redes y Cables Peru', 'Cargadores y Mas', 'Accesorios Express SAC', 'Fenix Import Tech', 'Celulares del Norte Mayoristas'
    ];
    for (let i = 1; i <= 25; i++) {
      providers.push({
        id: `p-${i}`,
        nombre: providerNames[i-1] || `Proveedor Mayorista #${i}`,
        telefono: `+51 987 654 3${String(i).padStart(2, '0')}`,
        email: `ventas${i}@proveedor.pe`
      });
    }

    // 100 Clientes
    const clients = [
      { id: 'c-general', nombre: 'Cliente General (Venta Rápida)', documento: '99999999', telefono: '00000000' }
    ];
    const firstNames = ['Juan', 'Maria', 'Pedro', 'Ana', 'Luis', 'Carlos', 'Sofia', 'Jorge', 'Lucia', 'Diego', 'Camila', 'Andrea', 'Manuel', 'Gabriela', 'Raul', 'Rosa', 'Hector', 'Elena', 'Oscar', 'Silvia'];
    const lastNames = ['Perez', 'Gomez', 'Rodriguez', 'Lopez', 'Martinez', 'Sanchez', 'Pereda', 'Flores', 'Torres', 'Ramirez', 'Cruz', 'Diaz', 'Reyes', 'Morales', 'Ortiz', 'Gutierrez', 'Castillo', 'Vargas', 'Rojas', 'Salazar'];
    for (let i = 1; i <= 100; i++) {
      const fn = firstNames[Math.floor(Math.random() * firstNames.length)];
      const ln = lastNames[Math.floor(Math.random() * lastNames.length)];
      const doc = String(10000000 + i * 87431).substring(0, 8);
      clients.push({
        id: `c-${i}`,
        nombre: `${fn} ${ln}`,
        documento: doc,
        telefono: `+51 955 ${String(100 + i * 7).padStart(3, '0')} ${String(i * 3).padStart(3, '0')}`
      });
    }

    // 20 Lotes
    const lotes = [];
    for (let i = 1; i <= 20; i++) {
      const pId = `p-${Math.floor(Math.random() * 25) + 1}`;
      const day = String(Math.floor(Math.random() * 28) + 1).padStart(2, '0');
      const month = Math.random() > 0.5 ? '05' : '06';
      lotes.push({
        id: `l-${i}`,
        nombre: `Lote de Importación #${String(i).padStart(2, '0')}`,
        proveedorId: pId,
        flete: 0,
        fecha: `2026-${month}-${day}`
      });
    }

    // Modelos predefinidos base
    const baseModelsCelulares = [
      { marca: 'Apple', modelo: 'iPhone 11', tipo: 'Celular' },
      { marca: 'Apple', modelo: 'iPhone 13', tipo: 'Celular' },
      { marca: 'Apple', modelo: 'iPhone 14', tipo: 'Celular' },
      { marca: 'Apple', modelo: 'iPhone 15', tipo: 'Celular' },
      { marca: 'Apple', modelo: 'iPhone 15 Pro Max', tipo: 'Celular' },
      { marca: 'Apple', modelo: 'iPhone 16', tipo: 'Celular' },
      { marca: 'Apple', modelo: 'iPhone 16 Plus', tipo: 'Celular' },
      { marca: 'Apple', modelo: 'iPhone 16 Pro', tipo: 'Celular' },
      { marca: 'Apple', modelo: 'iPhone 16 Pro Max', tipo: 'Celular' },
      { marca: 'Apple', modelo: 'iPhone 17', tipo: 'Celular' },
      { marca: 'Apple', modelo: 'iPhone 17 Pro', tipo: 'Celular' },
      { marca: 'Apple', modelo: 'iPhone 17 Pro Max', tipo: 'Celular' }
    ];

    const baseModelsLaptops = [
      { marca: 'Apple', modelo: 'MacBook Pro 14" M3', tipo: 'Laptop' },
      { marca: 'Apple', modelo: 'MacBook Pro 14" M3 Pro', tipo: 'Laptop' },
      { marca: 'Apple', modelo: 'MacBook Pro 16" M3 Max', tipo: 'Laptop' }
    ];

    const colors = ['Space Gray', 'Silver', 'Gold', 'Midnight', 'Starlight', 'Negro', 'Blanco', 'Azul', 'Rojo', 'Verde'];
    const capacitiesCelulares = ['64GB', '128GB', '256GB', '512GB', '1TB'];
    const capacitiesLaptops = ['8GB/512GB', '18GB/512GB', '36GB/1TB'];

    const productos = [];

    // Generar 300 celulares
    for (let i = 1; i <= 300; i++) {
      const base = baseModelsCelulares[Math.floor(Math.random() * baseModelsCelulares.length)];
      const cap = capacitiesCelulares[Math.floor(Math.random() * capacitiesCelulares.length)];
      const col = colors[Math.floor(Math.random() * colors.length)];
      const lId = `l-${Math.floor(Math.random() * 20) + 1}`;
      const imei = '358912' + String(100000000 + i * 29381).substring(0, 9);
      const costoBase = Math.floor(Math.random() * 2000) + 1500; // 1500 a 3500 soles

      productos.push({
        id: `prod-cel-${i}`,
        loteId: lId,
        tipo: 'Celular',
        modelo: `${base.modelo} ${cap}`,
        color: col,
        tipoCodigo: 'imei',
        codigo: imei,
        stock: 1,
        costoBase: costoBase,
        costoReal: costoBase,
        precioSugerido: costoBase * 1.20,
        precioVenta: Math.round(costoBase * 1.20),
        estado: 'disponible',
        foto: ''
      });
    }

    // Generar 50 laptops
    for (let i = 1; i <= 50; i++) {
      const base = baseModelsLaptops[Math.floor(Math.random() * baseModelsLaptops.length)];
      const cap = capacitiesLaptops[Math.floor(Math.random() * capacitiesLaptops.length)];
      const col = colors[Math.floor(Math.random() * 2)]; // Space Gray o Silver
      const lId = `l-${Math.floor(Math.random() * 20) + 1}`;
      const serial = 'C02G' + String(10000000 + i * 49201).substring(0, 8).toUpperCase();
      const costoBase = Math.floor(Math.random() * 4000) + 5000; // 5000 a 9000 soles

      productos.push({
        id: `prod-lap-${i}`,
        loteId: lId,
        tipo: 'Laptop',
        modelo: `${base.modelo} ${cap}`,
        color: col,
        tipoCodigo: 'serial',
        codigo: serial,
        stock: 1,
        costoBase: costoBase,
        costoReal: costoBase,
        precioSugerido: costoBase * 1.20,
        precioVenta: Math.round(costoBase * 1.20),
        estado: 'disponible',
        foto: ''
      });
    }

    // Generar 50 cubos y cables (accesorios sin código, distribuidos en stock de productos)
    const baseAccessories = [
      { modelo: 'Cargador Rápido Tipo-C 20W', tipo: 'Cargador', color: 'Blanco', stock: 10, costoBase: 50, precioVenta: 70 },
      { modelo: 'Cargador Rápido Tipo-C 20W', tipo: 'Cargador', color: 'Negro', stock: 10, costoBase: 50, precioVenta: 70 },
      { modelo: 'Cubo Cargador 20W', tipo: 'Cubo', color: 'Blanco', stock: 5, costoBase: 40, precioVenta: 60 },
      { modelo: 'Cubo Cargador 35W Dual', tipo: 'Cubo', color: 'Blanco', stock: 5, costoBase: 70, precioVenta: 100 },
      { modelo: 'Cubo Cargador 60W GaN', tipo: 'Cubo', color: 'Negro', stock: 5, costoBase: 120, precioVenta: 160 },
      { modelo: 'Cable USB-C a Lightning 1m', tipo: 'Cable', color: 'Blanco', stock: 10, costoBase: 30, precioVenta: 50 },
      { modelo: 'Cable USB-C a USB-C 2m', tipo: 'Cable', color: 'Negro', stock: 10, costoBase: 35, precioVenta: 55 }
    ];

    baseAccessories.forEach((acc, idx) => {
      const lId = `l-${Math.floor(Math.random() * 20) + 1}`;
      productos.push({
        id: `prod-acc-${idx+1}`,
        loteId: lId,
        tipo: acc.tipo,
        modelo: acc.modelo,
        color: acc.color,
        tipoCodigo: 'ninguno',
        codigo: '',
        stock: acc.stock,
        costoBase: acc.costoBase,
        costoReal: acc.costoBase,
        precioSugerido: acc.costoBase * 1.20,
        precioVenta: acc.precioVenta,
        estado: 'disponible',
        foto: ''
      });
    });

    const modelos = [
      { id: 'm-1', marca: 'Apple', modelo: 'iPhone 11', tipo: 'Celular' },
      { id: 'm-2', marca: 'Apple', modelo: 'iPhone 13', tipo: 'Celular' },
      { id: 'm-3', marca: 'Apple', modelo: 'iPhone 14', tipo: 'Celular' },
      { id: 'm-4', marca: 'Apple', modelo: 'iPhone 15', tipo: 'Celular' },
      { id: 'm-5', marca: 'Apple', modelo: 'iPhone 15 Pro Max', tipo: 'Celular' },
      { id: 'm-6', marca: 'Apple', modelo: 'iPhone 16', tipo: 'Celular' },
      { id: 'm-7', marca: 'Apple', modelo: 'iPhone 16 Plus', tipo: 'Celular' },
      { id: 'm-8', marca: 'Apple', modelo: 'iPhone 16 Pro', tipo: 'Celular' },
      { id: 'm-9', marca: 'Apple', modelo: 'iPhone 16 Pro Max', tipo: 'Celular' },
      { id: 'm-10', marca: 'Apple', modelo: 'iPhone 17', tipo: 'Celular' },
      { id: 'm-11', marca: 'Apple', modelo: 'iPhone 17 Pro', tipo: 'Celular' },
      { id: 'm-12', marca: 'Apple', modelo: 'iPhone 17 Pro Max', tipo: 'Celular' },
      { id: 'm-13', marca: 'Apple', modelo: 'MacBook Pro 14" M3', tipo: 'Laptop' },
      { id: 'm-14', marca: 'Apple', modelo: 'MacBook Pro 14" M3 Pro', tipo: 'Laptop' },
      { id: 'm-15', marca: 'Apple', modelo: 'MacBook Pro 16" M3 Max', tipo: 'Laptop' },
      { id: 'm-16', marca: 'Genérico', modelo: 'Cargador Rápido Tipo-C 20W', tipo: 'Cargador' },
      { id: 'm-17', marca: 'Genérico', modelo: 'Cubo Cargador 20W', tipo: 'Cubo' },
      { id: 'm-18', marca: 'Genérico', modelo: 'Cubo Cargador 35W Dual', tipo: 'Cubo' },
      { id: 'm-19', marca: 'Genérico', modelo: 'Cubo Cargador 60W GaN', tipo: 'Cubo' },
      { id: 'm-20', marca: 'Genérico', modelo: 'Cable USB-C a Lightning 1m', tipo: 'Cable' },
      { id: 'm-21', marca: 'Genérico', modelo: 'Cable USB-C a USB-C 2m', tipo: 'Cable' }
    ];

    return {
      vendedores: defaultSellers,
      proveedores: providers,
      clientes: clients,
      lotes: lotes,
      productos: productos,
      modelos: modelos,
      ventas: [],
      egresos: [],
      colores: this.getDefaultColores(),
      capacidades: this.getDefaultCapacidades()
    };
  },

  // Vaciar base de datos completamente (Dejar solo Admin principal para empezar de cero)
  async wipeDatabaseCompletely() {
    if (this.isDemoMode) {
      localStorage.removeItem('demo_vendedores');
      localStorage.removeItem('demo_proveedores');
      localStorage.removeItem('demo_clientes');
      localStorage.removeItem('demo_lotes');
      localStorage.removeItem('demo_productos');
      localStorage.removeItem('demo_ventas');
      localStorage.removeItem('demo_egresos');
      localStorage.removeItem('demo_modelos');
      localStorage.removeItem('demo_colores');
      localStorage.removeItem('demo_capacidades');
      
      const defaultSellers = [
        { id: 'v-1', nombre: 'Administrador Thor', usuario: 'admin@thor.com', contrasena: 'thor1996', rol: 'admin' }
      ];
      localStorage.setItem('demo_vendedores', JSON.stringify(defaultSellers));
      this.initLocalDemo();
      return true;
    } else {
      try {
        const tablesToDelete = ['egresos', 'ventas', 'productos', 'lotes', 'modelos', 'clientes', 'proveedores', 'vendedores'];
        for (const table of tablesToDelete) {
          const { error } = await this.supabase.from(table).delete().neq('id', '_dummy_id_');
          if (error) throw error;
        }
        
        try {
          await this.supabase.from('colores').delete().neq('id', '_dummy_id_');
          await this.supabase.from('capacidades').delete().neq('id', '_dummy_id_');
        } catch (e) {
          console.warn("No se pudieron limpiar las tablas opcionales de catálogos en Supabase", e);
        }

        // Insertar vendedor admin principal
        const defaultSellers = [
          { id: 'v-1', nombre: 'Administrador Thor', usuario: 'admin@thor.com', contrasena: 'thor1996', rol: 'admin' }
        ];
        const { error: errSellers } = await this.supabase.from('vendedores').insert(defaultSellers);
        if (errSellers) throw errSellers;

        await this.syncAll();
        return true;
      } catch (err) {
        console.error("Error al vaciar base de datos en Supabase:", err);
        alert(`Error al vaciar Supabase: ${err.message || err}`);
        return false;
      }
    }
  }
};
