/**
 * Google Apps Script - API REST para Sistema de Control de Inventario y Ventas
 * 
 * INSTRUCCIONES DE ACTUALIZACIÓN:
 * 1. Abre tu Hoja de Cálculo en Google Sheets.
 * 2. Ve a Extensiones > Apps Script.
 * 3. Borra el código actual, pega este código actualizado.
 * 4. Haz clic en "Guardar" (icono de disquete).
 * 5. Haz clic en "Implementar" > "Administrar implementaciones".
 * 6. Selecciona tu implementación actual (Aplicación web), haz clic en el lápiz (Editar).
 * 7. En "Versión", selecciona "Nueva versión".
 * 8. Haz clic en "Implementar" (¡muy importante para que los cambios se activen!).
 */

// Pestañas por defecto y sus encabezados de columnas (Se añadió 'modelos')
const SCHEMAS = {
  vendedores: ['id', 'nombre', 'usuario', 'contrasena', 'rol'],
  proveedores: ['id', 'nombre', 'telefono', 'email'],
  clientes: ['id', 'nombre', 'documento', 'telefono'],
  lotes: ['id', 'nombre', 'proveedorId', 'flete', 'fecha'],
  productos: ['id', 'loteId', 'tipo', 'modelo', 'tipoCodigo', 'codigo', 'costoBase', 'costoReal', 'precioSugerido', 'precioVenta', 'stock', 'estado', 'foto'],
  ventas: ['id', 'clienteId', 'vendedorId', 'fecha', 'total', 'articulos', 'metodoPago'],
  egresos: ['id', 'descripcion', 'monto', 'fecha', 'vendedorId'],
  modelos: ['id', 'marca', 'modelo', 'tipo'] // Catálogo de Modelos sugerido
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

// Resetear y cargar credenciales personalizadas de usuarios
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

  // 1. Cargar Usuarios Predeterminados Solicitados
  var defaultSellers = [
    ['v-1', 'Administrador Thor', 'admin@thor.com', 'thor1996', 'admin'],
    ['v-2', 'Vendedor Uno', 'vendedor1@thor.com', 'ventasthor1', 'vendedor'],
    ['v-3', 'Vendedor Dos', 'vendedor2@thor.com', 'ventasthor2', 'vendedor']
  ];
  var sSheet = ss.getSheetByName('vendedores');
  sSheet.getRange(2, 1, defaultSellers.length, 5).setValues(defaultSellers);

  // 2. Cargar Proveedores Mock
  var defaultProviders = [
    ['p-1', 'Celular Express Mayorista', '+57 312 4567890', 'ventas@celularexpress.com'],
    ['p-2', 'Accesorios & Cargas SAS', '+57 300 9876543', 'contacto@accesorioscargas.com']
  ];
  var pSheet = ss.getSheetByName('proveedores');
  pSheet.getRange(2, 1, defaultProviders.length, 4).setValues(defaultProviders);

  // 3. Cargar Clientes Mock
  var defaultClients = [
    ['c-general', 'Cliente General (Venta Rápida)', '99999999', '00000000'],
    ['c-1', 'María Camila Ortega', '1098765432', '+57 315 2223344']
  ];
  var cSheet = ss.getSheetByName('clientes');
  cSheet.getRange(2, 1, defaultClients.length, 4).setValues(defaultClients);

  // 4. Cargar Catálogo Inicial de Modelos de Prueba
  var defaultModels = [
    ['m-1', 'Samsung', 'Samsung Galaxy S23 Ultra', 'Celular'],
    ['m-2', 'Xiaomi', 'Xiaomi Redmi Note 13 Pro', 'Celular'],
    ['m-3', 'Apple', 'iPhone 15 Pro Max', 'Celular'],
    ['m-4', 'Lenovo', 'Laptop Lenovo ThinkPad L14', 'Laptop'],
    ['m-5', 'Genérico', 'Cargador Rápido Tipo-C 25W', 'Cargador'],
    ['m-6', 'Genérico', 'Cable Trenzado Tipo-C a C 2m', 'Cable']
  ];
  var mSheet = ss.getSheetByName('modelos');
  mSheet.getRange(2, 1, defaultModels.length, 4).setValues(defaultModels);

  return JSONResponse({ status: 'success', message: 'Google Sheets formateado con las credenciales de Thor y catálogo de modelos.' });
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
