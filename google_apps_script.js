/**
 * Google Apps Script - API REST para Sistema de Control de Inventario y Ventas
 * 
 * INSTRUCCIONES DE ACTUALIZACIÓN:
 * 1. Abre tu Hoja de Cálculo en Google Sheets.
 * 2. Ve a Extensiones > Apps Script.
 * 3. Borra el código actual, pega este código actualizado.
 * 4. Guardar.
 * 5. Implementar > Administrar implementaciones > Editar > Nueva versión > Implementar.
 */

const SCHEMAS = {
  vendedores: ['id', 'nombre', 'usuario', 'contrasena', 'rol'],
  proveedores: ['id', 'nombre', 'telefono', 'email'],
  clientes: ['id', 'nombre', 'documento', 'telefono'],
  lotes: ['id', 'nombre', 'proveedorId', 'flete', 'fecha'],
  productos: ['id', 'loteId', 'tipo', 'modelo', 'tipoCodigo', 'codigo', 'costoBase', 'costoReal', 'precioSugerido', 'precioVenta', 'stock', 'estado', 'foto'],
  ventas: ['id', 'clienteId', 'vendedorId', 'fecha', 'total', 'articulos', 'metodoPago'],
  egresos: ['id', 'descripcion', 'monto', 'fecha', 'vendedorId'],
  modelos: ['id', 'marca', 'modelo', 'tipo']
};

function doGet(e) {
  try {
    var action = e.parameter.action;
    checkAndCreateSheets();

    if (action === 'getAll') {
      return handleGetAll();
    }
    
    return JSONResponse({ status: 'error', message: 'Acción GET no reconocida' });
  } catch (err) {
    return JSONResponse({ status: 'error', message: err.toString() });
  }
}

function doPost(e) {
  try {
    var postData = JSON.parse(e.postData.contents);
    var action = postData.action;

    checkAndCreateSheets();

    if (action === 'save') {
      return handleSave(postData.sheetName, postData.row);
    }
    if (action === 'delete') {
      return handleDelete(postData.sheetName, postData.id);
    }
    if (action === 'reset') {
      return handleReset();
    }

    return JSONResponse({ status: 'error', message: 'Acción POST no reconocida' });
  } catch (err) {
    return JSONResponse({ status: 'error', message: err.toString() });
  }
}

// --- MANEJADORES DE OPERACIONES ---

function handleGetAll() {
  var db = {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  for (var sheetName in SCHEMAS) {
    var sheet = ss.getSheetByName(sheetName);
    db[sheetName] = getSheetData(sheet);
  }
  
  return JSONResponse({ status: 'success', data: db });
}

function handleSave(sheetName, rowData) {
  if (!SCHEMAS[sheetName]) {
    return JSONResponse({ status: 'error', message: 'Nombre de hoja no válido: ' + sheetName });
  }
  
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  var headers = SCHEMAS[sheetName];
  
  var data = sheet.getDataRange().getValues();
  var idIndex = headers.indexOf('id');
  var foundRowIndex = -1;
  
  if (rowData.id) {
    for (var i = 1; i < data.length; i++) {
      if (data[i][idIndex] && data[i][idIndex].toString() === rowData.id.toString()) {
        foundRowIndex = i + 1;
        break;
      }
    }
  } else {
    rowData.id = sheetName.substring(0, 3) + '-' + new Date().getTime() + Math.floor(Math.random() * 1000);
  }

  var rowValues = headers.map(function(header) {
    var val = rowData[header];
    if (typeof val === 'object' && val !== null) {
      return JSON.stringify(val);
    }
    return val !== undefined ? val : '';
  });

  if (foundRowIndex !== -1) {
    sheet.getRange(foundRowIndex, 1, 1, headers.length).setValues([rowValues]);
  } else {
    sheet.appendRow(rowValues);
  }

  return JSONResponse({ status: 'success', data: rowData });
}

function handleDelete(sheetName, id) {
  if (!SCHEMAS[sheetName]) {
    return JSONResponse({ status: 'error', message: 'Nombre de hoja no válido' });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  var headers = SCHEMAS[sheetName];
  
  var data = sheet.getDataRange().getValues();
  var idIndex = headers.indexOf('id');
  
  for (var i = 1; i < data.length; i++) {
    if (data[i][idIndex] && data[i][idIndex].toString() === id.toString()) {
      sheet.deleteRow(i + 1);
      return JSONResponse({ status: 'success', message: 'Fila eliminada correctamente' });
    }
  }

  return JSONResponse({ status: 'error', message: 'No se encontró el ID a eliminar' });
}

// Resetear y cargar credenciales personalizadas de usuarios más stock inicial
function handleReset() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var sheets = ss.getSheets();
  sheets.forEach(function(s) {
    try {
      if (ss.getSheets().length > 1) {
        ss.deleteSheet(s);
      } else {
        s.clear();
        s.setName('temp_clean');
      }
    } catch(e){}
  });

  checkAndCreateSheets();
  
  var temp = ss.getSheetByName('temp_clean');
  if (temp) ss.deleteSheet(temp);

  // 1. Cargar Usuarios
  var defaultSellers = [
    ['v-1', 'Administrador Thor', 'admin@thor.com', 'thor1996', 'admin'],
    ['v-2', 'Vendedor Uno', 'vendedor1@thor.com', 'ventasthor1', 'vendedor'],
    ['v-3', 'Vendedor Dos', 'vendedor2@thor.com', 'ventasthor2', 'vendedor']
  ];
  var sSheet = ss.getSheetByName('vendedores');
  sSheet.getRange(2, 1, defaultSellers.length, 5).setValues(defaultSellers);

  // 2. Cargar Proveedores
  var defaultProviders = [
    ['p-1', 'Celular Express Mayorista', '+57 312 4567890', 'ventas@celularexpress.com'],
    ['p-2', 'Accesorios & Cargas SAS', '+57 300 9876543', 'contacto@accesorioscargas.com']
  ];
  var pSheet = ss.getSheetByName('proveedores');
  pSheet.getRange(2, 1, defaultProviders.length, 4).setValues(defaultProviders);

  // 3. Cargar Clientes
  var defaultClients = [
    ['c-general', 'Cliente General (Venta Rápida)', '99999999', '00000000'],
    ['c-1', 'María Camila Ortega', '1098765432', '+57 315 2223344']
  ];
  var cSheet = ss.getSheetByName('clientes');
  cSheet.getRange(2, 1, defaultClients.length, 4).setValues(defaultClients);

  // 4. Catálogo de Modelos (Celulares según imagen, macbook y accesorios)
  var defaultModels = [
    ['m-1', 'Apple', 'iPhone 11 R 64GB', 'Celular'],
    ['m-2', 'Apple', 'iPhone 13 R 128GB', 'Celular'],
    ['m-3', 'Apple', 'iPhone 14 eSIM 128GB', 'Celular'],
    ['m-4', 'Apple', 'iPhone 14 Chip 128GB', 'Celular'],
    ['m-5', 'Apple', 'iPhone 15 128GB', 'Celular'],
    ['m-6', 'Apple', 'iPhone 15 Pro Max eSIM 256GB', 'Celular'],
    ['m-7', 'Apple', 'iPhone 16 Chip 128GB', 'Celular'],
    ['m-8', 'Apple', 'iPhone 16 Chip 256GB', 'Celular'],
    ['m-9', 'Apple', 'iPhone 16 Plus 128GB', 'Celular'],
    ['m-10', 'Apple', 'iPhone 16 Pro Chip 128GB', 'Celular'],
    ['m-11', 'Apple', 'iPhone 16 Pro Max Chip 256GB', 'Celular'],
    ['m-12', 'Apple', 'iPhone 17 Chip 256GB', 'Celular'],
    ['m-13', 'Apple', 'iPhone 17 eSIM 256GB', 'Celular'],
    ['m-14', 'Apple', 'iPhone 17 Pro eSIM 256GB', 'Celular'],
    ['m-15', 'Apple', 'iPhone 17 Pro Chip 256GB', 'Celular'],
    ['m-16', 'Apple', 'iPhone 17 Pro eSIM 512GB', 'Celular'],
    ['m-17', 'Apple', 'iPhone 17 Pro Chip 1TB', 'Celular'],
    ['m-18', 'Apple', 'iPhone 17 Pro Max eSIM 256GB', 'Celular'],
    ['m-19', 'Apple', 'iPhone 17 Pro Max Chip 256GB', 'Celular'],
    ['m-20', 'Apple', 'iPhone 17 Pro Max eSIM 512GB', 'Celular'],
    ['m-21', 'Apple', 'iPhone 17 Pro Max Chip 512GB', 'Celular'],
    ['m-22', 'Apple', 'iPhone 17 Pro Max eSIM 1TB', 'Celular'],
    ['m-23', 'Apple', 'MacBook Pro 14" M3 (8GB/512GB)', 'Laptop'],
    ['m-24', 'Apple', 'MacBook Pro 14" M3 Pro (18GB/512GB)', 'Laptop'],
    ['m-25', 'Apple', 'MacBook Pro 16" M3 Max (36GB/1TB)', 'Laptop'],
    ['m-26', 'Genérico', 'Cargador Rápido Tipo-C 20W', 'Cargador'],
    ['m-27', 'Genérico', 'Cable USB-C a Lightning 1m', 'Cable']
  ];
  var mSheet = ss.getSheetByName('modelos');
  mSheet.getRange(2, 1, defaultModels.length, 4).setValues(defaultModels);

  // 5. Crear 10 Lotes de Carga Inicial (Requisito: al menos 10 lotes)
  var lSheet = ss.getSheetByName('lotes');
  var batchList = [];
  var providerIds = ['p-1', 'p-2'];
  for (var b = 1; b <= 10; b++) {
    var bId = 'l-thor-' + b;
    var providerId = providerIds[(b - 1) % 2];
    var flete = 120000; // Flete de 120,000 COP por lote
    var fecha = '2026-06-0' + b;
    var name = 'Importación Lote Thor #' + b;
    batchList.push({ id: bId, nombre: name, proveedorId: providerId, flete: flete, fecha: fecha });
    lSheet.appendRow([bId, name, providerId, flete, fecha]);
  }

  // 6. Generar Productos y Stock Iniciales Solicitados
  var rawProducts = [];
  
  // Accesorios (stock 40-60)
  var chargersStock = Math.floor(Math.random() * 21) + 40;
  var cablesStock = Math.floor(Math.random() * 21) + 40;
  
  rawProducts.push({ id: 'prod-char', loteId: 'l-thor-1', tipo: 'Cargador', modelo: 'Cargador Rápido Tipo-C 20W', tipoCodigo: 'ninguno', codigo: '', costoBase: 60000, stock: chargersStock, estado: 'disponible', foto: '' });
  rawProducts.push({ id: 'prod-cable', loteId: 'l-thor-2', tipo: 'Cable', modelo: 'Cable USB-C a Lightning 1m', tipoCodigo: 'ninguno', codigo: '', costoBase: 30000, stock: cablesStock, estado: 'disponible', foto: '' });

  // Celulares (stock 5-15, precios de mercado realistas)
  var phoneList = [
    { name: 'iPhone 11 R 64GB', cost: 1000000 },
    { name: 'iPhone 13 R 128GB', cost: 1800000 },
    { name: 'iPhone 14 eSIM 128GB', cost: 2400000 },
    { name: 'iPhone 14 Chip 128GB', cost: 2600000 },
    { name: 'iPhone 15 128GB', cost: 3000000 },
    { name: 'iPhone 15 Pro Max eSIM 256GB', cost: 4200000 },
    { name: 'iPhone 16 Chip 128GB', cost: 3800000 },
    { name: 'iPhone 16 Chip 256GB', cost: 4200000 },
    { name: 'iPhone 16 Plus 128GB', cost: 4200000 },
    { name: 'iPhone 16 Pro Chip 128GB', cost: 4800000 },
    { name: 'iPhone 16 Pro Max Chip 256GB', cost: 5400000 },
    { name: 'iPhone 17 Chip 256GB', cost: 5200000 },
    { name: 'iPhone 17 eSIM 256GB', cost: 5000000 },
    { name: 'iPhone 17 Pro eSIM 256GB', cost: 6000000 },
    { name: 'iPhone 17 Pro Chip 256GB', cost: 6200000 },
    { name: 'iPhone 17 Pro eSIM 512GB', cost: 6800000 },
    { name: 'iPhone 17 Pro Chip 1TB', cost: 7600000 },
    { name: 'iPhone 17 Pro Max eSIM 256GB', cost: 6800000 },
    { name: 'iPhone 17 Pro Max Chip 256GB', cost: 7000000 },
    { name: 'iPhone 17 Pro Max eSIM 512GB', cost: 7600000 },
    { name: 'iPhone 17 Pro Max Chip 512GB', cost: 7800000 },
    { name: 'iPhone 17 Pro Max eSIM 1TB', cost: 8800000 }
  ];

  var pCounter = 1;
  var imeiBase = 358912345000000;
  phoneList.forEach(function(p) {
    var stock = Math.floor(Math.random() * 11) + 5; // 5 a 15
    for (var s = 0; s < stock; s++) {
      var prodId = 'prod-c-' + pCounter;
      var imei = (imeiBase + pCounter).toString();
      // Distribuir de forma equitativa entre los 10 lotes
      var loteIdx = (pCounter % 10) + 1;
      var loteId = 'l-thor-' + loteIdx;
      
      rawProducts.push({
        id: prodId,
        loteId: loteId,
        tipo: 'Celular',
        modelo: p.name,
        tipoCodigo: 'imei',
        codigo: imei,
        costoBase: p.cost,
        stock: 1,
        estado: 'disponible',
        foto: ''
      });
      pCounter++;
    }
  });

  // MacBook Pro (stock 5-10, precios de mercado realistas)
  var macList = [
    { name: 'MacBook Pro 14" M3 (8GB/512GB)', cost: 6000000 },
    { name: 'MacBook Pro 14" M3 Pro (18GB/512GB)', cost: 8000000 },
    { name: 'MacBook Pro 16" M3 Max (36GB/1TB)', cost: 13000000 }
  ];

  var mCounter = 1;
  macList.forEach(function(m) {
    var stock = Math.floor(Math.random() * 6) + 5; // 5 a 10
    for (var s = 0; s < stock; s++) {
      var prodId = 'prod-m-' + mCounter;
      var serial = 'SN-MBP-' + (10000 + mCounter);
      // Distribuir de forma equitativa entre los 10 lotes
      var loteIdx = (mCounter % 10) + 1;
      var loteId = 'l-thor-' + loteIdx;
      
      rawProducts.push({
        id: prodId,
        loteId: loteId,
        tipo: 'Laptop',
        modelo: m.name,
        tipoCodigo: 'serial',
        codigo: serial,
        costoBase: m.cost,
        stock: 1,
        estado: 'disponible',
        foto: ''
      });
      mCounter++;
    }
  });

  // Calcular prorrateo de flete por lote
  var costBaseTotals = {};
  var itemCounts = {};
  rawProducts.forEach(function(p) {
    var qty = p.tipoCodigo === 'ninguno' ? p.stock : 1;
    costBaseTotals[p.loteId] = (costBaseTotals[p.loteId] || 0) + (p.costoBase * qty);
    itemCounts[p.loteId] = (itemCounts[p.loteId] || 0) + 1;
  });

  var productsToInsert = [];
  rawProducts.forEach(function(p) {
    var batch = batchList.find(function(b) { return b.id === p.loteId; });
    var fleteTotal = batch ? batch.flete : 0;
    var totalCostoBase = costBaseTotals[p.loteId] || 0;
    var count = itemCounts[p.loteId] || 1;
    
    var fleteProrrateado = 0;
    if (totalCostoBase > 0) {
      fleteProrrateado = (p.costoBase / totalCostoBase) * fleteTotal;
    } else {
      fleteProrrateado = fleteTotal / count;
    }
    
    var costoReal = p.costoBase + fleteProrrateado;
    var precioSugerido = Math.round(costoReal * 1.20);
    var precioVenta = precioSugerido;

    productsToInsert.push([
      p.id,
      p.loteId,
      p.tipo,
      p.modelo,
      p.tipoCodigo,
      p.codigo,
      p.costoBase,
      costoReal,
      precioSugerido,
      precioVenta,
      p.stock,
      p.estado,
      p.foto
    ]);
  });

  var prodSheet = ss.getSheetByName('productos');
  prodSheet.getRange(2, 1, productsToInsert.length, SCHEMAS.productos.length).setValues(productsToInsert);

  return JSONResponse({ status: 'success', message: 'Google Sheets formateado e inicializado con catálogo y stock inicial de Thor en 10 lotes.' });
}

// --- FUNCIONES AUXILIARES ---

function JSONResponse(object) {
  return ContentService.createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheetData(sheet) {
  var rows = [];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  var headers = data[0];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      var cellVal = data[i][j];
      if (typeof cellVal === 'string' && (cellVal.startsWith('[') || cellVal.startsWith('{'))) {
        try {
          cellVal = JSON.parse(cellVal);
        } catch(e){}
      }
      row[headers[j]] = cellVal;
    }
    rows.push(row);
  }
  return rows;
}

function checkAndCreateSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  for (var sheetName in SCHEMAS) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(SCHEMAS[sheetName]);
      sheet.getRange(1, 1, 1, SCHEMAS[sheetName].length).setFontWeight("bold");
    }
  }
}
