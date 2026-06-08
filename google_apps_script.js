/**
 * Google Apps Script - API REST para Sistema de Control de Inventario y Ventas
 * 
 * INSTRUCCIONES DE INSTALACIÓN:
 * 1. Crea una nueva Hoja de Cálculo en Google Drive.
 * 2. Ve al menú superior: Extensiones > Apps Script.
 * 3. Borra el código existente y pega este archivo completo.
 * 4. Haz clic en "Implementar" (botón azul arriba a la derecha) > "Nueva implementación".
 * 5. Tipo de implementación: selecciona "Aplicación web" (icono de engranaje).
 * 6. Configuración:
 *    - Descripción: API Control Inventario
 *    - Ejecutar como: "Tú" (tu cuenta de Google)
 *    - Quién tiene acceso: "Cualquiera" (esto permite que la web acceda sin login complejo).
 * 7. Haz clic en "Implementar", autoriza los permisos y COPIA la "URL de la aplicación web".
 * 8. Pega esa URL en el panel de Administración de la aplicación web.
 */

// Pestañas por defecto y sus encabezados de columnas
const SCHEMAS = {
  vendedores: ['id', 'nombre', 'usuario', 'contrasena', 'rol'],
  proveedores: ['id', 'nombre', 'telefono', 'email'],
  clientes: ['id', 'nombre', 'documento', 'telefono'],
  lotes: ['id', 'nombre', 'proveedorId', 'flete', 'fecha'],
  productos: ['id', 'loteId', 'tipo', 'modelo', 'tipoCodigo', 'codigo', 'costoBase', 'costoReal', 'precioSugerido', 'precioVenta', 'stock', 'estado', 'foto'],
  ventas: ['id', 'clienteId', 'vendedorId', 'fecha', 'total', 'articulos', 'metodoPago'],
  egresos: ['id', 'descripcion', 'monto', 'fecha', 'vendedorId']
};

function doGet(e) {
  try {
    var action = e.parameter.action;
    
    // Autogenerar pestañas faltantes al leer
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

// Obtener todas las tablas en un solo objeto JSON consolidado
function handleGetAll() {
  var db = {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  for (var sheetName in SCHEMAS) {
    var sheet = ss.getSheetByName(sheetName);
    db[sheetName] = getSheetData(sheet);
  }
  
  return JSONResponse({ status: 'success', data: db });
}

// Guardar o Actualizar una fila según su campo 'id'
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
  
  // Buscar si ya existe la fila por ID (empezando en fila 2 para saltar cabeceras)
  if (rowData.id) {
    for (var i = 1; i < data.length; i++) {
      if (data[i][idIndex] && data[i][idIndex].toString() === rowData.id.toString()) {
        foundRowIndex = i + 1; // 1-based index
        break;
      }
    }
  } else {
    // Si no tiene ID, le generamos uno único
    rowData.id = sheetName.substring(0, 3) + '-' + new Date().getTime() + Math.floor(Math.random() * 1000);
  }

  // Alinear valores de rowData con el orden de las cabeceras
  var rowValues = headers.map(function(header) {
    var val = rowData[header];
    // Convertir arreglos u objetos a JSON text para almacenarlo en celdas
    if (typeof val === 'object' && val !== null) {
      return JSON.stringify(val);
    }
    return val !== undefined ? val : '';
  });

  if (foundRowIndex !== -1) {
    // Actualizar fila existente
    sheet.getRange(foundRowIndex, 1, 1, headers.length).setValues([rowValues]);
  } else {
    // Agregar nueva fila
    sheet.appendRow(rowValues);
  }

  return JSONResponse({ status: 'success', data: rowData });
}

// Eliminar una fila por su campo 'id'
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

// Resetear y cargar datos mock por defecto
function handleReset() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Borrar todas las hojas
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

  // Re-crear pestañas con cabeceras y mocks básicos
  checkAndCreateSheets();
  
  // Borrar hoja temp si existe
  var temp = ss.getSheetByName('temp_clean');
  if (temp) ss.deleteSheet(temp);

  // Inyectar datos mock iniciales directamente
  var defaultSellers = [
    ['v-1', 'Administrador Principal', 'admin', 'admin', 'admin'],
    ['v-2', 'Juan Vendedor', 'juan', '1234', 'vendedor']
  ];
  var sSheet = ss.getSheetByName('vendedores');
  sSheet.getRange(2, 1, defaultSellers.length, 5).setValues(defaultSellers);

  var defaultProviders = [
    ['p-1', 'Celular Express Mayorista', '+57 312 4567890', 'ventas@celularexpress.com'],
    ['p-2', 'Accesorios & Cargas SAS', '+57 300 9876543', 'contacto@accesorioscargas.com']
  ];
  var pSheet = ss.getSheetByName('proveedores');
  pSheet.getRange(2, 1, defaultProviders.length, 4).setValues(defaultProviders);

  var defaultClients = [
    ['c-general', 'Cliente General (Venta Rápida)', '99999999', '00000000'],
    ['c-1', 'María Camila Ortega', '1098765432', '+57 315 2223344']
  ];
  var cSheet = ss.getSheetByName('clientes');
  cSheet.getRange(2, 1, defaultClients.length, 4).setValues(defaultClients);

  return JSONResponse({ status: 'success', message: 'Base de datos de Google Sheets reseteada correctamente' });
}

// --- FUNCIONES AUXILIARES ---

// Retornar respuesta JSON con CORS permitido
function JSONResponse(object) {
  return ContentService.createTextOutput(JSON.stringify(object))
    .setMimeType(ContentService.MimeType.JSON);
}

// Leer datos de una hoja y transformarlos a arreglo de objetos clave-valor
function getSheetData(sheet) {
  var rows = [];
  var data = sheet.getDataRange().getValues();
  if (data.length <= 1) return []; // Solo cabecera o vacía

  var headers = data[0];
  for (var i = 1; i < data.length; i++) {
    var row = {};
    for (var j = 0; j < headers.length; j++) {
      var cellVal = data[i][j];
      
      // Intentar parsear celdas que contienen strings JSON (ej. lista de artículos)
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

// Verificar existencia de pestañas y crearlas con cabeceras si no existen
function checkAndCreateSheets() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  for (var sheetName in SCHEMAS) {
    var sheet = ss.getSheetByName(sheetName);
    if (!sheet) {
      sheet = ss.insertSheet(sheetName);
      sheet.appendRow(SCHEMAS[sheetName]);
      // Dar formato en negrita a la cabecera
      sheet.getRange(1, 1, 1, SCHEMAS[sheetName].length).setFontWeight("bold");
    }
  }
}
