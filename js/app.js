// js/app.js
// Controlador Principal y Lógica de Interfaz de SmartControl (Asíncrono con Google Sheets)

// Estado de la Aplicación
let currentUser = null;
let cart = [];
let currentInventoryTab = 'productos';
let productPhotoBase64 = '';
let bajaPhotoBase64 = '';
let reemplazoPhotoBase64 = '';
let cameraStream = null;
let cashflowChart = null;

// Inicialización al cargar la página
document.addEventListener('DOMContentLoaded', async () => {
  // Inicializar DB (Carga local u obtiene Sheets si está guardado)
  await DB.init();

  // Actualizar UI del estado de conexión de Google Sheets
  updateConnectionStatusUI();
  updateCurrentDate();
  
  // Cargar URL en el input de configuración si existe
  if (DB.apiURL) {
    document.getElementById('sheets-url-input').value = DB.apiURL;
  }

  // Verificar si hay sesión activa guardada
  const activeUserId = localStorage.getItem('cel_active_user_id');
  const sellers = DB.getVendedores();
  
  if (activeUserId && sellers.length > 0) {
    const matched = sellers.find(s => s.id === activeUserId);
    if (matched) {
      currentUser = matched;
      updateUserUI();
      // Inicializar selectores dinámicos
      populateSelectors();
      // Ocultar pantalla de login y mostrar dashboard
      document.getElementById('login-screen').style.display = 'none';
      switchView('dashboard');
      return;
    }
  }

  // Si no hay sesión activa, mostrar pantalla de login
  showLoginScreen();
});

// --- GESTIÓN DE BANNER DE CONEXIÓN DE GOOGLE SHEETS ---
function updateConnectionStatusUI() {
  const banner = document.getElementById('connection-status-banner');
  const text = document.getElementById('connection-status-text');

  if (DB.isDemoMode) {
    banner.style.backgroundColor = 'var(--color-warning)';
    banner.style.color = '#0b0f19';
    text.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Operando en "Modo Demo" (LocalStorage). Conecta tu base de datos de Google Sheets en la pestaña Administración.';
  } else {
    banner.style.backgroundColor = 'var(--color-success)';
    banner.style.color = '#ffffff';
    text.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i> Conectado a Google Sheets (Nube) | Base de datos activa y sincronizada en tiempo real.';
  }
}

// --- ENRUTADOR DE VISTAS (SPA) ---
async function switchView(viewId) {
  // Ocultar todas las vistas
  document.querySelectorAll('.view-pane').forEach(pane => {
    pane.classList.remove('active');
  });
  
  // Desactivar items del menú
  document.querySelectorAll('.menu-item').forEach(item => {
    item.classList.remove('active');
  });

  // Mostrar vista objetivo
  const activePane = document.getElementById(`view-${viewId}`);
  if (activePane) {
    activePane.classList.add('active');
  }

  // Activar item de menú
  const menuItem = document.getElementById(`menu-${viewId}`);
  if (menuItem) {
    menuItem.classList.add('active');
  }

  // Cambiar título en header
  const titleMap = {
    'dashboard': 'Resumen Diario',
    'ventas': 'Venta de Productos',
    'inventario': 'Almacén y Lotes',
    'egresos': 'Control de Gastos / Egresos',
    'contactos': 'Clientes & Proveedores',
    'admin': 'Panel de Administración'
  };
  document.getElementById('view-title').textContent = titleMap[viewId] || 'Panel de Control';

  // Cerrar sidebar en móviles
  const sidebar = document.getElementById('app-sidebar');
  sidebar.classList.remove('active');

  // Acciones asíncronas al cargar cada panel
  if (viewId === 'dashboard') {
    renderDashboard();
  } else if (viewId === 'ventas') {
    renderSalesView();
  } else if (viewId === 'inventario') {
    if (!DB.isDemoMode) await DB.syncAll();
    renderInventory();
  } else if (viewId === 'egresos') {
    if (!DB.isDemoMode) await DB.syncAll();
    renderEgresos();
  } else if (viewId === 'contactos') {
    renderContacts();
  } else if (viewId === 'admin') {
    renderAdminPanel();
  }
}

function toggleSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  sidebar.classList.toggle('active');
}

function updateCurrentDate() {
  const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
  document.getElementById('header-date').textContent = new Date().toLocaleDateString('es-ES', options);
}

// --- GESTIÓN DE ROLES E INICIO DE SESIÓN ---
function updateUserUI() {
  if (!currentUser) return;

  // Guardar sesión
  localStorage.setItem('cel_active_user_id', currentUser.id);

  // Avatar e información
  document.getElementById('current-user-avatar').textContent = currentUser.nombre ? currentUser.nombre.charAt(0).toUpperCase() : 'U';
  document.getElementById('current-user-name').textContent = currentUser.nombre || 'Usuario';
  
  const roleBadge = document.getElementById('current-user-role-badge');
  const roleText = document.getElementById('current-user-role-text');
  
  roleBadge.className = `role-badge ${currentUser.rol || 'admin'}`;
  roleText.textContent = currentUser.rol === 'admin' ? 'Administrador' : 'Vendedor';

  // Mostrar u ocultar opciones administrativas
  const adminItems = document.querySelectorAll('.admin-only');
  if (currentUser.rol === 'admin') {
    adminItems.forEach(el => el.style.display = 'block');
  } else {
    adminItems.forEach(el => el.style.display = 'none');
  }

  // Refrescar vistas por si cambiaron privilegios
  const activePane = document.querySelector('.view-pane.active');
  if (activePane) {
    const viewId = activePane.id.replace('view-', '');
    if (viewId === 'admin' && currentUser.rol !== 'admin') {
      switchView('dashboard');
    } else {
      switchView(viewId);
    }
  }
}

function showLoginScreen() {
  currentUser = null;
  localStorage.removeItem('cel_active_user_id');
  
  // Mostrar pantalla de login y limpiar inputs
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('login-username').value = '';
  document.getElementById('login-password').value = '';
}

function handleLoginSubmit(event) {
  event.preventDefault();
  const usernameInput = document.getElementById('login-username').value.trim();
  const passwordInput = document.getElementById('login-password').value;

  const sellers = DB.getVendedores();
  let target = null;

  if (sellers.length === 0) {
    // Fallback defensivo por si es la primera inicialización y la DB está limpia
    if (usernameInput === 'admin@thor.com' && passwordInput === 'thor1996') {
      target = { id: 'v-1', nombre: 'Administrador Thor', usuario: 'admin@thor.com', contrasena: 'thor1996', rol: 'admin' };
    }
  } else {
    target = sellers.find(s => s.usuario === usernameInput);
  }

  if (target && target.contrasena === passwordInput) {
    currentUser = target;
    localStorage.setItem('cel_active_user_id', currentUser.id);
    updateUserUI();
    
    // Inicializar selectores dinámicos
    populateSelectors();
    
    // Ocultar pantalla de login y mostrar dashboard
    document.getElementById('login-screen').style.display = 'none';
    switchView('dashboard');
  } else {
    alert("Usuario o contraseña incorrectos. Por favor verifique sus datos.");
  }
}

function handleLogout() {
  if (confirm("¿Está seguro que desea cerrar la sesión?")) {
    showLoginScreen();
  }
}

// --- AUXILIARES MODALES ---
function openModal(id) {
  document.getElementById(id).classList.add('active');
}

// Cerrar y detener cámara
function closeModal(id) {
  document.getElementById(id).classList.remove('active');
  stopCameraStream();
}

function populateSelectors() {
  const providers = DB.getProveedores();
  const provSelect = document.getElementById('lote-provider');
  if (provSelect) {
    provSelect.innerHTML = providers.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
  }
}

// --- 1. MÓDULO DASHBOARD / RESUMEN DIARIO ---
function renderDashboard() {
  const summary = DB.getDailySummary();

  // Valores numéricos
  document.getElementById('dash-ingresos').textContent = formatCurrency(summary.totalVendido);
  document.getElementById('dash-egresos').textContent = formatCurrency(summary.totalEgresos);
  
  const utilNetaVal = document.getElementById('dash-utilidad');
  const utilLabel = document.getElementById('dash-utilidad-label');
  
  if (currentUser && currentUser.rol === 'admin') {
    utilLabel.textContent = 'Utilidad Neta (Hoy)';
    utilNetaVal.textContent = formatCurrency(summary.utilidadNeta);
  } else {
    utilLabel.textContent = 'Efectivo en Caja';
    utilNetaVal.textContent = formatCurrency(summary.efectivo);
  }

  document.getElementById('dash-cant-ventas').textContent = summary.cantidadVentas;

  // Renderizar Lista de Movimientos Recientes de Hoy
  const list = document.getElementById('dash-recent-list');
  list.innerHTML = '';

  const todosMovimientos = [];
  
  summary.ventas.forEach(v => {
    todosMovimientos.push({
      tipo: 'venta',
      titulo: `Venta - Recibo ${v.id.substr(4, 6)}`,
      sub: `${v.articulos.length} artículos | Pago: ${v.metodoPago}`,
      monto: v.total,
      fecha: new Date(v.fecha)
    });
  });

  summary.egresos.forEach(e => {
    todosMovimientos.push({
      tipo: 'egreso',
      titulo: e.descripcion,
      sub: `Registrado hoy`,
      monto: e.monto,
      fecha: new Date() // hoy
    });
  });

  todosMovimientos.sort((a, b) => b.fecha - a.fecha);

  if (todosMovimientos.length === 0) {
    list.innerHTML = `<div style="text-align: center; color: var(--text-dim); padding: 16px; font-size: 13px;">No hay movimientos hoy.</div>`;
  } else {
    todosMovimientos.forEach(mov => {
      const item = document.createElement('div');
      item.className = 'recent-item';
      item.innerHTML = `
        <div class="recent-details">
          <span class="recent-title">${mov.titulo}</span>
          <span class="recent-sub">${mov.sub}</span>
        </div>
        <span class="recent-price ${mov.tipo === 'venta' ? 'income' : 'expense'}">
          ${mov.tipo === 'venta' ? '+' : '-'}${formatCurrency(mov.monto)}
        </span>
      `;
      list.appendChild(item);
    });
  }

  renderChart(summary);
}

function renderChart(summary) {
  const ctx = document.getElementById('cashflow-chart').getContext('2d');
  
  if (cashflowChart) {
    cashflowChart.destroy();
  }

  const labels = ['Ingresos (Ventas)', 'Egresos (Gastos)'];
  const dataValues = [summary.totalVendido, summary.totalEgresos];
  const colors = ['#10b981', '#ef4444'];
  
  if (currentUser && currentUser.rol === 'admin') {
    labels.push('Utilidad Neta');
    dataValues.push(Math.max(0, summary.utilidadNeta));
    colors.push('#7c3aed');
  }

  cashflowChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Monto ($)',
        data: dataValues,
        backgroundColor: colors,
        borderRadius: 8,
        borderWidth: 0,
        maxBarThickness: 45
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        y: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
        },
        x: {
          grid: { display: false },
          ticks: { color: '#94a3b8', font: { family: 'Outfit' } }
        }
      }
    }
  });
}

// --- 2. MÓDULO VENTAS & CARRITO ---
function renderSalesView() {
  cart = [];
  updateCartUI();

  const clients = DB.getClientes();
  const select = document.getElementById('sales-client-select');
  select.innerHTML = clients.map(c => `<option value="${c.id}">${c.nombre} (${c.documento})</option>`).join('');

  document.getElementById('sales-search-results').style.display = 'none';
  document.getElementById('sales-search-input').value = '';
}

function searchProductForSales() {
  const q = document.getElementById('sales-search-input').value.trim().toLowerCase();
  const resultsDiv = document.getElementById('sales-search-results');
  
  if (q.length < 2) {
    resultsDiv.style.display = 'none';
    return;
  }

  const products = DB.getProductos().filter(p => p.estado === 'disponible');
  const filtered = products.filter(p => {
    return p.modelo.toLowerCase().includes(q) || 
           (p.codigo && p.codigo.toLowerCase().includes(q)) ||
           p.tipo.toLowerCase().includes(q);
  });

  if (filtered.length === 0) {
    resultsDiv.innerHTML = `<div style="padding: 12px; color: var(--text-dim); font-size: 13px;">No se encontraron artículos disponibles.</div>`;
  } else {
    resultsDiv.innerHTML = filtered.map(p => {
      const codeLabel = p.tipoCodigo !== 'ninguno' ? ` | ${p.tipoCodigo.toUpperCase()}: ${p.codigo}` : ' | Accesorio';
      const stockLabel = p.tipoCodigo === 'ninguno' ? ` (Stock: ${p.stock})` : '';
      return `
        <div onclick="addProductToCartById('${p.id}')" style="padding: 10px 14px; border-bottom: 1px solid var(--border-color); cursor: pointer; display: flex; justify-content: space-between; font-size: 13px;" class="menu-item-hover">
          <div>
            <strong>[${p.tipo}]</strong> ${p.modelo}${codeLabel}${stockLabel}
          </div>
          <span style="color: var(--color-success); font-weight: bold;">${formatCurrency(p.precioVenta)}</span>
        </div>
      `;
    }).join('');
  }
  resultsDiv.style.display = 'block';
}

function addProductToCartById(id) {
  const products = DB.getProductos();
  const prod = products.find(p => p.id === id);
  if (!prod) return;

  if (prod.tipoCodigo === 'ninguno' && prod.stock <= 0) {
    alert("Este producto no tiene stock disponible.");
    return;
  }

  const existing = cart.find(item => item.productoId === id);
  if (existing) {
    if (prod.tipoCodigo === 'ninguno') {
      if (existing.cantidad < prod.stock) {
        existing.cantidad++;
      } else {
        alert("No hay más unidades en stock.");
      }
    } else {
      alert("Este producto único con IMEI/Serial ya está en el carrito.");
    }
  } else {
    cart.push({
      productoId: prod.id,
      modelo: prod.modelo,
      imei: prod.codigo,
      precioVenta: prod.precioVenta,
      costoReal: prod.costoReal,
      tipoCodigo: prod.tipoCodigo,
      maxStock: prod.stock,
      cantidad: 1
    });
  }

  document.getElementById('sales-search-input').value = '';
  document.getElementById('sales-search-results').style.display = 'none';

  updateCartUI();
}

function updateCartUI() {
  const list = document.getElementById('sales-cart-list');
  
  if (cart.length === 0) {
    list.innerHTML = `
      <div class="cart-empty">
        <i class="fa-solid fa-cart-arrow-down" style="font-size: 48px; margin-bottom: 12px; display: block;"></i>
        El carrito está vacío. Escanea un IMEI o busca un artículo arriba.
      </div>
    `;
    document.getElementById('sales-total').textContent = '$0';
    return;
  }

  list.innerHTML = '';
  let total = 0;

  cart.forEach((item, index) => {
    const itemSubtotal = item.precioVenta * item.cantidad;
    total += itemSubtotal;

    const row = document.createElement('div');
    row.className = 'cart-item';
    row.innerHTML = `
      <div class="cart-item-info">
        <span class="cart-item-name">${item.modelo}</span>
        <span class="cart-item-code">${item.imei ? `IMEI/Cod: ${item.imei}` : 'Accesorio (Sin Código)'}</span>
      </div>
      <div class="cart-item-actions">
        ${item.tipoCodigo === 'ninguno' ? `
          <div style="display: flex; align-items: center; gap: 4px; background-color: var(--bg-primary); padding: 4px; border-radius: 8px; border: 1px solid var(--border-color);">
            <button class="btn btn-secondary btn-sm" style="padding: 2px 8px; border-radius: 4px;" onclick="changeCartQty(${index}, -1)">-</button>
            <span style="font-size: 13px; min-width: 20px; text-align: center;">${item.cantidad}</span>
            <button class="btn btn-secondary btn-sm" style="padding: 2px 8px; border-radius: 4px;" onclick="changeCartQty(${index}, 1)">+</button>
          </div>
        ` : ''}
        
        <div style="display: flex; align-items: center; gap: 4px;">
          <span style="font-size: 12px; color: var(--text-dim);">$</span>
          <input type="number" value="${item.precioVenta}" style="width: 100px; padding: 4px 8px; background: var(--bg-primary); border: 1px solid var(--border-color); color: white; border-radius: 6px; font-size: 13px;" onchange="updateCartItemPrice(${index}, this.value)">
        </div>

        <button class="btn-remove" onclick="removeCartItem(${index})">
          <i class="fa-solid fa-trash"></i>
        </button>
      </div>
    `;
    list.appendChild(row);
  });

  document.getElementById('sales-total').textContent = formatCurrency(total);
}

function changeCartQty(index, dir) {
  const item = cart[index];
  if (!item) return;

  const newQty = item.cantidad + dir;
  if (newQty >= 1 && newQty <= item.maxStock) {
    item.cantidad = newQty;
    updateCartUI();
  }
}

function updateCartItemPrice(index, value) {
  const price = parseFloat(value) || 0;
  const item = cart[index];
  
  if (price < item.costoReal) {
    alert(`Advertencia: El precio de venta no puede ser menor al costo real con flete (${formatCurrency(item.costoReal)}).`);
    updateCartUI();
    return;
  }

  item.precioVenta = price;
  updateCartUI();
}

function removeCartItem(index) {
  cart.splice(index, 1);
  updateCartUI();
}

function clearCart() {
  cart = [];
  updateCartUI();
}

function startSalesScanner() {
  Scanner.openScanner((code) => {
    const products = DB.getProductos().filter(p => p.estado === 'disponible');
    const matched = products.find(p => p.codigo === code);

    if (matched) {
      addProductToCartById(matched.id);
    } else {
      alert(`No se encontró ningún artículo disponible con el código/IMEI: ${code}`);
    }
  });
}

async function processSale() {
  if (cart.length === 0) {
    alert("Agregue al menos un producto al carrito.");
    return;
  }

  const clientId = document.getElementById('sales-client-select').value;
  const paymentMethod = document.getElementById('sales-payment-method').value;

  const clients = DB.getClientes();
  const cliente = clients.find(c => c.id === clientId);
  
  const totalVenta = cart.reduce((sum, item) => sum + (item.precioVenta * item.cantidad), 0);

  const nuevaVenta = {
    id: null,
    clienteId: clientId,
    vendedorId: currentUser.id,
    fecha: new Date().toISOString(),
    total: totalVenta,
    metodoPago: paymentMethod,
    articulos: cart.map(item => ({
      productoId: item.productoId,
      modelo: item.modelo,
      imei: item.imei,
      precioVenta: item.precioVenta,
      costoReal: item.costoReal,
      cantidad: item.cantidad
    }))
  };

  try {
    const ventaGuardada = await DB.registrarVentaCompleta(nuevaVenta);
    PDFGen.generateReceipt(ventaGuardada, cliente, currentUser);
    alert("Venta procesada con éxito y recibo PDF generado.");
    clearCart();
    await switchView('dashboard');
  } catch (e) {
    alert("Hubo un error al guardar la venta: " + e.message);
  }
}

// --- 3. MÓDULO INVENTARIO Y LOTES ---
function switchInventoryTab(tabName) {
  currentInventoryTab = tabName;
  const tabProd = document.getElementById('tab-inventory-products');
  const tabLotes = document.getElementById('tab-inventory-lotes');
  const btnProd = document.getElementById('btn-tab-prod');
  const btnLotes = document.getElementById('btn-tab-lotes');

  if (tabName === 'productos') {
    tabProd.style.display = 'block';
    tabLotes.style.display = 'none';
    btnProd.classList.add('btn-primary');
    btnProd.classList.remove('btn-secondary');
    btnLotes.classList.add('btn-secondary');
    btnLotes.classList.remove('btn-primary');
  } else {
    tabProd.style.display = 'none';
    tabLotes.style.display = 'block';
    btnProd.classList.add('btn-secondary');
    btnProd.classList.remove('btn-primary');
    btnLotes.classList.add('btn-primary');
    btnLotes.classList.remove('btn-secondary');
  }
}

function renderInventory() {
  const q = document.getElementById('inventory-search').value.toLowerCase();
  const filterType = document.getElementById('filter-type').value;
  const filterStatus = document.getElementById('filter-status').value;
  const filterBatch = document.getElementById('filter-batch').value;

  const lotes = DB.getLotes();
  const providers = DB.getProveedores();
  const products = DB.getProductos();

  const filterBatchSelect = document.getElementById('filter-batch');
  const oldVal = filterBatchSelect.value;
  filterBatchSelect.innerHTML = '<option value="">Todos los Lotes</option>' + 
    lotes.map(l => `<option value="${l.id}">${l.nombre}</option>`).join('');
  filterBatchSelect.value = oldVal;

  const isAdmin = currentUser && currentUser.rol === 'admin';

  const valCards = document.getElementById('inventory-valuation-cards');
  if (isAdmin) {
    valCards.style.display = 'grid';
    const val = DB.getValuedInventory();
    document.getElementById('val-costo').textContent = formatCurrency(val.inversionTotal);
    document.getElementById('val-venta').textContent = formatCurrency(val.ventaEsperada);
    document.getElementById('val-utilidad').textContent = formatCurrency(val.gananciaEsperada);
  } else {
    valCards.style.display = 'none';
  }

  const tbodyProd = document.getElementById('inventory-table-body');
  tbodyProd.innerHTML = '';

  const filteredProducts = products.filter(p => {
    const batch = lotes.find(l => l.id === p.loteId);
    const batchName = batch ? batch.nombre.toLowerCase() : '';
    const matchesSearch = p.modelo.toLowerCase().includes(q) || 
                          (p.codigo && p.codigo.toLowerCase().includes(q)) || 
                          batchName.includes(q);
    const matchesType = !filterType || p.tipo === filterType;
    const matchesStatus = !filterStatus || p.estado === filterStatus;
    const matchesBatch = !filterBatch || p.loteId === filterBatch;

    return matchesSearch && matchesType && matchesStatus && matchesBatch;
  });

  filteredProducts.forEach(p => {
    const batch = lotes.find(l => l.id === p.loteId);
    const tr = document.createElement('tr');
    
    const costRealField = isAdmin ? formatCurrency(p.costoReal) : '***';
    const costBaseField = isAdmin ? formatCurrency(p.costoBase) : '***';
    const fleteProrrateadoField = isAdmin ? formatCurrency(p.costoReal - p.costoBase) : '***';
    const suggestedField = isAdmin ? formatCurrency(p.precioSugerido) : '***';

    let stockStatusText = '';
    if (p.tipoCodigo === 'ninguno') {
      stockStatusText = `<span class="badge ${p.stock > 5 ? 'badge-success' : 'badge-warning'}">Cant: ${p.stock}</span>`;
    } else {
      if (p.estado === 'disponible') stockStatusText = `<span class="badge badge-success">Disponible</span>`;
      else if (p.estado === 'vendido') stockStatusText = `<span class="badge badge-info">Vendido</span>`;
      else if (p.estado === 'baja') stockStatusText = `<span class="badge badge-danger">De Baja</span>`;
      else if (p.estado === 'reemplazado') stockStatusText = `<span class="badge badge-warning" style="background-color: rgba(245,158,11,0.1); color: #f59e0b;">Reemplazado</span>`;
    }

    const imgSource = p.foto ? `<img src="${p.foto}" style="width: 45px; height: 45px; object-fit: cover; border-radius: 8px;">` : `<i class="fa-solid fa-image" style="font-size: 24px; color: var(--text-dim);"></i>`;

    let actionsHtml = `
      <button class="btn btn-secondary btn-sm" onclick="openEditProductModal('${p.id}')" title="Editar">
        <i class="fa-solid fa-pen"></i>
      </button>
    `;

    if (p.estado === 'disponible' && p.tipoCodigo !== 'ninguno') {
      actionsHtml += `
        <button class="btn btn-danger btn-sm" onclick="openBajaModal('${p.id}')" title="Dar de Baja">
          <i class="fa-solid fa-circle-minus"></i>
        </button>
      `;
    }

    if (p.estado === 'baja' && p.bajaDetalle && p.bajaDetalle.motivo.includes('Garantía') && isAdmin) {
      actionsHtml += `
        <button class="btn btn-success btn-sm" onclick="openReemplazoModal('${p.id}')" title="Registrar Reemplazo">
          <i class="fa-solid fa-arrows-spin"></i> Reemplazo
        </button>
      `;
    }

    if (isAdmin) {
      actionsHtml += `
        <button class="btn btn-danger btn-sm" onclick="deleteProduct('${p.id}')" title="Eliminar definitivamente">
          <i class="fa-solid fa-trash"></i>
        </button>
      `;
    }

    tr.innerHTML = `
      <td style="text-align: center; vertical-align: middle;">${imgSource}</td>
      <td><strong>${p.tipo}</strong></td>
      <td>${p.modelo}</td>
      <td>${batch ? batch.nombre : 'Sin Lote'}</td>
      <td>
        ${p.tipoCodigo !== 'ninguno' 
          ? `<span style="font-family: monospace; font-size: 13px; color: var(--color-info); cursor: pointer; text-decoration: underline;" onclick="viewImeiLifecycle('${p.codigo}')">${p.codigo}</span>` 
          : '<span style="color: var(--text-dim);">Ninguno (Accesorio)</span>'
        }
      </td>
      <td>${costBaseField}</td>
      <td>${fleteProrrateadoField}</td>
      <td style="font-weight: 500;">${costRealField}</td>
      <td>${suggestedField}</td>
      <td style="font-weight: 600; color: var(--color-success);">${formatCurrency(p.precioVenta)}</td>
      <td>${stockStatusText}</td>
      <td>
        <div style="display: flex; gap: 4px;">
          ${actionsHtml}
        </div>
      </td>
    `;
    tbodyProd.appendChild(tr);
  });

  const tbodyLotes = document.getElementById('lotes-table-body');
  tbodyLotes.innerHTML = '';

  lotes.forEach(l => {
    const prov = providers.find(p => p.id === l.proveedorId);
    const prodLote = products.filter(p => p.loteId === l.id);
    
    let totalCostoLote = 0;
    prodLote.forEach(p => {
      const qty = p.tipoCodigo === 'ninguno' ? p.stock : 1;
      totalCostoLote += p.costoBase * qty;
    });
    totalCostoLote += l.flete;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${l.nombre}</strong></td>
      <td>${prov ? prov.nombre : 'Sin proveedor'}</td>
      <td>${formatCurrency(l.flete)}</td>
      <td style="font-weight: 600;">${formatCurrency(totalCostoLote)}</td>
      <td>${l.fecha}</td>
      <td><span class="badge badge-info">${prodLote.length} artículos</span></td>
      <td>
        <button class="btn btn-secondary btn-sm" onclick="openEditBatchModal('${l.id}')">
          <i class="fa-solid fa-pen"></i> Editar Lote
        </button>
      </td>
    `;
    tbodyLotes.appendChild(tr);
  });
}

// CRUD LOTES
function openNewBatchModal() {
  const form = document.getElementById('form-lote');
  form.reset();
  const providers = DB.getProveedores();
  document.getElementById('lote-provider').innerHTML = providers.map(p => `<option value="${p.id}">${p.nombre}</option>`).join('');
  openModal('modal-lote');
}

async function saveLoteForm(event) {
  event.preventDefault();
  
  const lote = {
    id: null,
    nombre: document.getElementById('lote-nombre').value.trim(),
    proveedorId: document.getElementById('lote-provider').value,
    flete: parseFloat(document.getElementById('lote-flete').value) || 0,
    fecha: new Date().toISOString().split('T')[0]
  };

  try {
    await DB.saveLote(lote);
    closeModal('modal-lote');
    renderInventory();
    alert("Lote guardado y costos de fletes actualizados.");
  } catch (e) {
    alert("Error al registrar el lote.");
  }
}

function openEditBatchModal(id) {
  const lotes = DB.getLotes();
  const lote = lotes.find(l => l.id === id);
  if (!lote) return;

  openNewBatchModal();
  
  const form = document.getElementById('form-lote');
  let inputId = form.querySelector('#edit-lote-id');
  if (!inputId) {
    inputId = document.createElement('input');
    inputId.type = 'hidden';
    inputId.id = 'edit-lote-id';
    form.appendChild(inputId);
  }
  inputId.value = lote.id;

  document.getElementById('lote-nombre').value = lote.nombre;
  document.getElementById('lote-provider').value = lote.proveedorId;
  document.getElementById('lote-flete').value = lote.flete;

  form.onsubmit = async function(event) {
    event.preventDefault();
    lote.nombre = document.getElementById('lote-nombre').value;
    lote.proveedorId = document.getElementById('lote-provider').value;
    lote.flete = parseFloat(document.getElementById('lote-flete').value) || 0;
    
    try {
      await DB.saveLote(lote);
      closeModal('modal-lote');
      renderInventory();
      form.onsubmit = saveLoteForm; // restaurar original
      alert("Lote editado con éxito.");
    } catch (e) {
      alert("Error al guardar lote.");
    }
  };
}

// --- GESTIÓN DE CATÁLOGO DE MODELOS PREDETERMINADOS ---
function populateModelsSelector(selectedId = '') {
  const presetSelect = document.getElementById('prod-modelo-preset');
  const models = DB.getCollection('modelos');
  
  let options = '<option value="">--- Escribir modelo manualmente ---</option>';
  models.sort((a,b) => a.marca.localeCompare(b.marca));
  
  models.forEach(m => {
    options += `<option value="${m.id}" ${m.id === selectedId ? 'selected' : ''}>[${m.tipo}] ${m.marca} - ${m.modelo}</option>`;
  });
  
  presetSelect.innerHTML = options;
}

function onModelPresetChanged() {
  const presetId = document.getElementById('prod-modelo-preset').value;
  const models = DB.getCollection('modelos');
  const matched = models.find(m => m.id === presetId);
  
  const tipoInput = document.getElementById('prod-tipo');
  const modeloInput = document.getElementById('prod-modelo');
  
  if (matched) {
    tipoInput.value = matched.tipo;
    modeloInput.value = matched.modelo;
    
    onProductTypeChanged();
  } else {
    modeloInput.value = '';
  }
}

function openNewModelModal() {
  const form = document.getElementById('form-nuevo-modelo');
  form.reset();
  openModal('modal-nuevo-modelo');
}

async function saveNewModelForm(event) {
  event.preventDefault();
  
  const model = {
    id: null,
    marca: document.getElementById('model-marca').value.trim(),
    modelo: document.getElementById('model-nombre').value.trim(),
    tipo: document.getElementById('model-tipo').value
  };

  try {
    const saved = await DB.saveRow('modelos', model);
    closeModal('modal-nuevo-modelo');
    
    populateModelsSelector(saved.id);
    onModelPresetChanged();
    alert("Modelo agregado al catálogo con éxito.");
  } catch (e) {
    alert("Error al registrar modelo en el catálogo.");
  }
}

// CRUD PRODUCTOS
function openNewProductModal(isEdit = false) {
  const form = document.getElementById('form-producto');
  form.reset();
  
  document.getElementById('prod-id').value = '';
  productPhotoBase64 = '';
  document.getElementById('photo-preview-img').style.display = 'none';
  document.getElementById('photo-placeholder').style.display = 'flex';

  const lotes = DB.getLotes();
  document.getElementById('prod-lote').innerHTML = lotes.map(l => `<option value="${l.id}">${l.nombre}</option>`).join('');

  populateModelsSelector();

  if (!isEdit) {
    document.getElementById('modal-producto-title').textContent = "Registrar Nuevo Producto";
    onProductTypeChanged();
  }
  
  openModal('modal-producto');
}

function onProductTypeChanged() {
  const tipo = document.getElementById('prod-tipo').value;
  const selectCodigo = document.getElementById('prod-tipo-codigo');

  if (tipo === 'Celular') selectCodigo.value = 'imei';
  else if (tipo === 'Laptop') selectCodigo.value = 'serial';
  else selectCodigo.value = 'ninguno';

  onTypeCodeChanged();
}

function onTypeCodeChanged() {
  const tipoCodigo = document.getElementById('prod-tipo-codigo').value;
  const codeWrapper = document.getElementById('prod-codigo-wrapper');
  const stockWrapper = document.getElementById('prod-stock-wrapper');
  const codeLabel = document.getElementById('prod-codigo-label');
  const codeInput = document.getElementById('prod-codigo');

  if (tipoCodigo === 'ninguno') {
    codeWrapper.style.display = 'none';
    stockWrapper.style.display = 'block';
    codeInput.removeAttribute('required');
  } else {
    codeWrapper.style.display = 'block';
    stockWrapper.style.display = 'none';
    codeInput.setAttribute('required', 'required');
    
    if (tipoCodigo === 'imei') {
      codeLabel.textContent = "IMEI (15 dígitos)";
      codeInput.placeholder = "Escribe o escanea IMEI de la caja";
    } else {
      codeLabel.textContent = "Número de Serie / Código";
      codeInput.placeholder = "Escribe o escanea número de serie";
    }
  }

  calculateSuggestedPriceFromForm();
}

function calculateSuggestedPriceFromForm() {
  const loteId = document.getElementById('prod-lote').value;
  const costoBase = parseFloat(document.getElementById('prod-costo-base').value) || 0;
  
  const lotes = DB.getLotes();
  const lote = lotes.find(l => l.id === loteId);
  if (!lote) return;

  const products = DB.getProductos();
  const productsInBatch = products.filter(p => p.loteId === loteId);

  let totalCostoBase = costoBase;
  productsInBatch.forEach(p => {
    const qty = p.tipoCodigo === 'ninguno' ? p.stock : 1;
    totalCostoBase += p.costoBase * qty;
  });

  let fleteEstimado = 0;
  if (totalCostoBase > 0) {
    fleteEstimado = (costoBase / totalCostoBase) * lote.flete;
  }

  const costoReal = costoBase + fleteEstimado;
  const sugerido = costoReal * 1.20;

  document.getElementById('prod-flete-prorrateado').value = formatCurrency(fleteEstimado);
  document.getElementById('prod-precio-sugerido').value = formatCurrency(sugerido);
  
  const finalPriceInput = document.getElementById('prod-precio-venta');
  if (!finalPriceInput.value || finalPriceInput.value == 0) {
    finalPriceInput.value = Math.round(sugerido);
  }
}

function startProductScanner() {
  Scanner.openScanner((code) => {
    document.getElementById('prod-codigo').value = code;
  });
}

function handlePhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    productPhotoBase64 = e.target.result;
    const img = document.getElementById('photo-preview-img');
    img.src = productPhotoBase64;
    img.style.display = 'block';
    document.getElementById('photo-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function triggerPhotoInput() {
  document.getElementById('prod-photo-input').click();
}

function startCameraForPhoto() {
  const video = document.getElementById('camera-stream');
  const btnCapture = document.getElementById('btn-capture-photo');
  
  navigator.mediaDevices.getUserMedia({ 
    video: { facingMode: 'environment' }, 
    audio: false 
  })
  .then(stream => {
    cameraStream = stream;
    video.srcObject = stream;
    video.style.display = 'block';
    video.play();
    btnCapture.style.display = 'block';
    document.getElementById('photo-preview-box').style.display = 'none';
  })
  .catch(err => {
    alert("No se pudo acceder a la cámara trasera: " + err.message);
  });

  btnCapture.onclick = function() {
    const canvas = document.getElementById('camera-canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    productPhotoBase64 = canvas.toDataURL('image/jpeg');
    
    const img = document.getElementById('photo-preview-img');
    img.src = productPhotoBase64;
    img.style.display = 'block';
    
    document.getElementById('photo-placeholder').style.display = 'none';
    document.getElementById('photo-preview-box').style.display = 'flex';
    
    stopCameraStream();
  };
}

async function saveProductoForm(event) {
  event.preventDefault();

  const id = document.getElementById('prod-id').value;
  const loteId = document.getElementById('prod-lote').value;
  const tipo = document.getElementById('prod-tipo').value;
  const modelo = document.getElementById('prod-modelo').value.trim();
  const tipoCodigo = document.getElementById('prod-tipo-codigo').value;
  const codigo = tipoCodigo !== 'ninguno' ? document.getElementById('prod-codigo').value.trim() : '';
  const stock = tipoCodigo === 'ninguno' ? parseInt(document.getElementById('prod-stock').value) || 0 : 1;
  const costoBase = parseFloat(document.getElementById('prod-costo-base').value) || 0;
  const precioVenta = parseFloat(document.getElementById('prod-precio-venta').value) || 0;

  const lotes = DB.getLotes();
  const lote = lotes.find(l => l.id === loteId);
  const products = DB.getProductos();
  const productsInBatch = products.filter(p => p.loteId === loteId && p.id !== id);

  let totalCostoBase = costoBase;
  productsInBatch.forEach(p => {
    const qty = p.tipoCodigo === 'ninguno' ? p.stock : 1;
    totalCostoBase += p.costoBase * qty;
  });

  let fleteEstimado = 0;
  if (totalCostoBase > 0 && lote) {
    fleteEstimado = (costoBase / totalCostoBase) * lote.flete;
  }
  const costoRealEstimado = costoBase + fleteEstimado;

  if (precioVenta < costoRealEstimado) {
    alert(`Error: El precio de venta ($${precioVenta}) no puede ser menor al costo real estimado ($${Math.round(costoRealEstimado)}) (Costo Base + Flete).`);
    return;
  }

  const producto = {
    id: id || null,
    loteId,
    tipo,
    modelo,
    tipoCodigo,
    codigo,
    stock,
    costoBase,
    precioVenta,
    foto: productPhotoBase64,
    estado: 'disponible'
  };

  try {
    await DB.saveProducto(producto);
    closeModal('modal-producto');
    renderInventory();
    alert("Producto guardado correctamente en inventario.");
  } catch (e) {
    alert("Error al guardar el producto.");
  }
}

function openEditProductModal(id) {
  const products = DB.getProductos();
  const p = products.find(prod => prod.id === id);
  if (!p) return;

  openNewProductModal(true);
  
  document.getElementById('modal-producto-title').textContent = "Editar Producto";
  document.getElementById('prod-id').value = p.id;
  document.getElementById('prod-lote').value = p.loteId;
  document.getElementById('prod-tipo').value = p.tipo;
  document.getElementById('prod-modelo').value = p.modelo;
  document.getElementById('prod-tipo-codigo').value = p.tipoCodigo;
  
  onTypeCodeChanged();

  if (p.tipoCodigo !== 'ninguno') {
    document.getElementById('prod-codigo').value = p.codigo;
  } else {
    document.getElementById('prod-stock').value = p.stock;
  }

  document.getElementById('prod-costo-base').value = p.costoBase;
  document.getElementById('prod-precio-venta').value = p.precioVenta;

  if (p.foto) {
    productPhotoBase64 = p.foto;
    const img = document.getElementById('photo-preview-img');
    img.src = p.foto;
    img.style.display = 'block';
    document.getElementById('photo-placeholder').style.display = 'none';
  }

  calculateSuggestedPriceFromForm();
}

async function deleteProduct(id) {
  if (confirm("¿Está seguro de eliminar este producto del inventario? Esto recalculará el flete del lote.")) {
    try {
      await DB.deleteProduct(id);
      renderInventory();
    } catch (e) {
      alert("Error al eliminar.");
    }
  }
}

// --- MODAL DE BAJA BUROCRÁTICA ---
function openBajaModal(prodId) {
  document.getElementById('baja-prod-id').value = prodId;
  document.getElementById('baja-justificacion').value = '';
  bajaPhotoBase64 = '';
  
  document.getElementById('baja-photo-preview-img').style.display = 'none';
  document.getElementById('baja-photo-placeholder').style.display = 'flex';
  
  openModal('modal-baja');
}

function handleBajaPhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    bajaPhotoBase64 = e.target.result;
    const img = document.getElementById('baja-photo-preview-img');
    img.src = bajaPhotoBase64;
    img.style.display = 'block';
    document.getElementById('baja-photo-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function startCameraForBajaPhoto() {
  const video = document.getElementById('baja-camera-stream');
  const btnCapture = document.getElementById('baja-btn-capture-photo');
  
  navigator.mediaDevices.getUserMedia({ 
    video: { facingMode: 'environment' }, 
    audio: false 
  })
  .then(stream => {
    cameraStream = stream;
    video.srcObject = stream;
    video.style.display = 'block';
    video.play();
    btnCapture.style.display = 'block';
    document.getElementById('baja-photo-preview-box').style.display = 'none';
  })
  .catch(err => {
    alert("Error de cámara: " + err.message);
  });

  btnCapture.onclick = function() {
    const canvas = document.getElementById('baja-camera-canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    bajaPhotoBase64 = canvas.toDataURL('image/jpeg');
    
    const img = document.getElementById('baja-photo-preview-img');
    img.src = bajaPhotoBase64;
    img.style.display = 'block';
    
    document.getElementById('baja-photo-placeholder').style.display = 'none';
    document.getElementById('baja-photo-preview-box').style.display = 'flex';
    
    stopCameraStreamForBaja();
  };
}

function stopCameraStreamForBaja() {
  const video = document.getElementById('baja-camera-stream');
  const btnCapture = document.getElementById('baja-btn-capture-photo');
  
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  
  if (video) video.style.display = 'none';
  if (btnCapture) btnCapture.style.display = 'none';
  document.getElementById('baja-photo-preview-box').style.display = 'flex';
}

async function submitProductBaja(event) {
  event.preventDefault();

  const prodId = document.getElementById('baja-prod-id').value;
  const motivo = document.getElementById('baja-motivo').value;
  const justificacion = document.getElementById('baja-justificacion').value.trim();

  if (!bajaPhotoBase64) {
    alert("Error: Es obligatorio tomar o subir una foto de evidencia para respaldar la baja del producto.");
    return;
  }

  try {
    const success = await DB.registrarBajaBurocratica(prodId, motivo, justificacion, bajaPhotoBase64, currentUser.id);
    if (success) {
      alert("Acta de baja registrada con éxito. Se generó un egreso por pérdida contable.");
      closeModal('modal-baja');
      stopCameraStreamForBaja();
      renderInventory();
    } else {
      alert("Error al dar de baja el producto.");
    }
  } catch (e) {
    alert("Error de conexión con Sheets.");
  }
}

// --- MODAL DE REEMPLAZO DE GARANTÍA ---
function openReemplazoModal(prodId) {
  document.getElementById('reemplazo-prod-id').value = prodId;
  document.getElementById('reemplazo-imei').value = '';
  document.getElementById('reemplazo-observaciones').value = '';
  reemplazoPhotoBase64 = '';
  
  document.getElementById('reem-photo-preview-img').style.display = 'none';
  document.getElementById('reem-photo-placeholder').style.display = 'flex';
  
  openModal('modal-reemplazo');
}

function handleReemplazoPhotoUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    reemplazoPhotoBase64 = e.target.result;
    const img = document.getElementById('reem-photo-preview-img');
    img.src = reemplazoPhotoBase64;
    img.style.display = 'block';
    document.getElementById('reem-photo-placeholder').style.display = 'none';
  };
  reader.readAsDataURL(file);
}

function startCameraForReemplazoPhoto() {
  const video = document.getElementById('reem-camera-stream');
  const btnCapture = document.getElementById('reem-btn-capture-photo');
  
  navigator.mediaDevices.getUserMedia({ 
    video: { facingMode: 'environment' }, 
    audio: false 
  })
  .then(stream => {
    cameraStream = stream;
    video.srcObject = stream;
    video.style.display = 'block';
    video.play();
    btnCapture.style.display = 'block';
    document.getElementById('reem-photo-preview-box').style.display = 'none';
  })
  .catch(err => {
    alert("Error de cámara: " + err.message);
  });

  btnCapture.onclick = function() {
    const canvas = document.getElementById('reem-camera-canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    
    reemplazoPhotoBase64 = canvas.toDataURL('image/jpeg');
    
    const img = document.getElementById('reem-photo-preview-img');
    img.src = reemplazoPhotoBase64;
    img.style.display = 'block';
    
    document.getElementById('reem-photo-placeholder').style.display = 'none';
    document.getElementById('reem-photo-preview-box').style.display = 'flex';
    
    stopCameraStreamForReemplazo();
  };
}

function stopCameraStreamForReemplazo() {
  const video = document.getElementById('reem-camera-stream');
  const btnCapture = document.getElementById('reem-btn-capture-photo');
  
  if (cameraStream) {
    cameraStream.getTracks().forEach(track => track.stop());
    cameraStream = null;
  }
  
  if (video) video.style.display = 'none';
  if (btnCapture) btnCapture.style.display = 'none';
  document.getElementById('reem-photo-preview-box').style.display = 'flex';
}

function startReemplazoScanner() {
  Scanner.openScanner((code) => {
    document.getElementById('reemplazo-imei').value = code;
  });
}

async function submitProductReemplazo(event) {
  event.preventDefault();

  const prodBajaId = document.getElementById('reemplazo-prod-id').value;
  const nuevoImei = document.getElementById('reemplazo-imei').value.trim();
  const observaciones = document.getElementById('reemplazo-observaciones').value.trim();

  try {
    const success = await DB.registrarReemplazoGarantia(prodBajaId, nuevoImei, reemplazoPhotoBase64, observaciones, currentUser.id);
    if (success) {
      alert("Reemplazo registrado. El nuevo equipo está disponible y se anuló el egreso por pérdida.");
      closeModal('modal-reemplazo');
      stopCameraStreamForReemplazo();
      renderInventory();
    } else {
      alert("Error al registrar reemplazo.");
    }
  } catch (e) {
    alert("Error al conectar con la base de datos.");
  }
}

// Ver Historial / Ciclo de Vida del IMEI
function viewImeiLifecycle(imei) {
  const products = DB.getProductos();
  const prod = products.find(p => p.codigo === imei);
  if (!prod) return;

  const lotes = DB.getLotes();
  const batch = lotes.find(l => l.id === prod.loteId);

  const providers = DB.getProveedores();
  const provider = batch ? providers.find(pr => pr.id === batch.proveedorId) : null;

  const sales = DB.getVentas();
  const sale = sales.find(s => s.articulos.some(art => art.imei === imei));

  let client = null;
  let seller = null;
  if (sale) {
    const clients = DB.getClientes();
    client = clients.find(c => c.id === sale.clienteId);
    
    const sellers = DB.getVendedores();
    seller = sellers.find(s => s.id === sale.vendedorId);
  }

  const container = document.getElementById('ciclo-vida-body');
  
  let auditoriaBajaHtml = '';
  if (prod.estado === 'baja' && prod.bajaDetalle) {
    auditoriaBajaHtml = `
      <div style="background-color: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2); padding: 14px; border-radius: 10px; margin-top: 10px;">
        <h4 style="color: var(--color-danger); margin-bottom: 8px;">🚨 Acta de Baja Registrada</h4>
        <p><strong>Motivo:</strong> ${prod.bajaDetalle.motivo}</p>
        <p><strong>Justificación:</strong> ${prod.bajaDetalle.justificacion}</p>
        <p><strong>Fecha Baja:</strong> ${new Date(prod.bajaDetalle.fecha).toLocaleString()}</p>
        ${prod.bajaDetalle.fotoEvidencia ? `<div style="margin-top:8px;"><img src="${prod.bajaDetalle.fotoEvidencia}" style="width:100%; max-height:150px; object-fit:cover; border-radius:8px;"></div>` : ''}
      </div>
    `;
  }

  if (prod.estado === 'reemplazado' && prod.reemplazoDetalle) {
    auditoriaBajaHtml = `
      <div style="background-color: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.2); padding: 14px; border-radius: 10px; margin-top: 10px;">
        <h4 style="color: var(--color-warning); margin-bottom: 8px;">🔁 Reemplazado por Garantía</h4>
        <p><strong>Nuevo IMEI:</strong> ${prod.reemplazoDetalle.nuevoImei}</p>
        <p><strong>Fecha Cambio:</strong> ${new Date(prod.reemplazoDetalle.fecha).toLocaleString()}</p>
        <p><strong>Observaciones:</strong> ${prod.reemplazoDetalle.observaciones || 'Ninguna'}</p>
      </div>
    `;
  }

  container.innerHTML = `
    <div style="display: flex; flex-direction: column; gap: 16px;">
      <div style="background-color: var(--bg-primary); padding: 14px; border-radius: 10px; border: 1px solid var(--border-color);">
        <h4 style="color: var(--color-info); margin-bottom: 8px;">📱 Datos del Producto</h4>
        <p><strong>Modelo:</strong> ${prod.modelo}</p>
        <p><strong>IMEI/Serial:</strong> ${prod.codigo}</p>
        <p><strong>Costo Adquisición:</strong> ${formatCurrency(prod.costoReal)}</p>
        <p><strong>Precio Venta:</strong> ${formatCurrency(prod.precioVenta)}</p>
      </div>

      <div style="background-color: var(--bg-primary); padding: 14px; border-radius: 10px; border: 1px solid var(--border-color);">
        <h4 style="color: var(--color-accent); margin-bottom: 8px;">📥 Registro de Ingreso</h4>
        <p><strong>Lote:</strong> ${batch ? batch.nombre : 'N/A'}</p>
        <p><strong>Proveedor:</strong> ${provider ? provider.nombre : 'N/A'}</p>
        <p><strong>Fecha Ingreso:</strong> ${batch ? batch.fecha : 'N/A'}</p>
      </div>

      <div style="background-color: var(--bg-primary); padding: 14px; border-radius: 10px; border: 1px solid var(--border-color);">
        <h4 style="color: var(--color-success); margin-bottom: 8px;">📤 Estado de Salida</h4>
        ${sale ? `
          <p><strong>Fecha de Venta:</strong> ${new Date(sale.fecha).toLocaleString()}</p>
          <p><strong>Cliente:</strong> ${client ? client.nombre : 'N/A'}</p>
          <p><strong>Vendido por:</strong> ${seller ? seller.nombre : 'N/A'}</p>
          <p><strong>Método Pago:</strong> ${sale.metodoPago.toUpperCase()}</p>
          <p><strong>Valor:</strong> ${formatCurrency(sale.total)}</p>
        ` : `
          <p style="color: var(--color-warning);">Estado actual: <strong>${prod.estado.toUpperCase()}</strong></p>
        `}
      </div>
      
      ${auditoriaBajaHtml}
    </div>
  `;

  openModal('modal-ciclo-vida');
}

// --- 4. MÓDULO EGRESOS ---
function renderEgresos() {
  const egresos = DB.getEgresos();
  const sellers = DB.getVendedores();
  
  const tbody = document.getElementById('egresos-table-body');
  tbody.innerHTML = '';

  const egresosHoy = egresos.filter(e => e.fecha === new Date().toISOString().split('T')[0]);

  if (egresosHoy.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-dim);">No hay gastos registrados el día de hoy.</td></tr>`;
    return;
  }

  egresosHoy.forEach(e => {
    const seller = sellers.find(s => s.id === e.vendedorId);
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${e.descripcion}</td>
      <td style="color: var(--color-danger); font-weight: 600;">-${formatCurrency(e.monto)}</td>
      <td>${e.fecha}</td>
      <td>${seller ? seller.nombre : 'N/A'}</td>
      <td>
        <button class="btn btn-danger btn-sm" onclick="deleteEgreso('${e.id}')">
          <i class="fa-solid fa-trash"></i>
        </button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function saveEgresoForm(event) {
  event.preventDefault();
  
  const egreso = {
    id: null,
    descripcion: document.getElementById('egreso-desc').value.trim(),
    monto: parseFloat(document.getElementById('egreso-monto').value) || 0,
    fecha: new Date().toISOString().split('T')[0],
    vendedorId: currentUser.id
  };

  try {
    await DB.saveRow('egresos', egreso);
    document.getElementById('form-egreso').reset();
    renderEgresos();
    alert("Egreso registrado correctamente.");
  } catch (e) {
    alert("Error al registrar el egreso.");
  }
}

async function deleteEgreso(id) {
  if (confirm("¿Está seguro de eliminar este gasto de la caja del día?")) {
    try {
      await DB.deleteRow('egresos', id);
      renderEgresos();
    } catch (e) {
      alert("Error al eliminar egreso.");
    }
  }
}

// --- 5. MÓDULO CLIENTES & PROVEEDORES ---
function renderContacts() {
  const clients = DB.getClientes();
  const providers = DB.getProveedores();

  const tbodyCli = document.getElementById('clients-table-body');
  tbodyCli.innerHTML = clients.map(c => `
    <tr>
      <td><strong>${c.nombre}</strong></td>
      <td>${c.documento}</td>
      <td>${c.telefono}</td>
    </tr>
  `).join('');

  const tbodyProv = document.getElementById('providers-table-body');
  tbodyProv.innerHTML = providers.map(p => `
    <tr>
      <td><strong>${p.nombre}</strong></td>
      <td>${p.telefono}</td>
      <td>${p.email || '<span style="color: var(--text-dim);">N/A</span>'}</td>
    </tr>
  `).join('');
}

function openQuickClientModal() { openModal('modal-cliente'); }
function openNewClientModal() { openModal('modal-cliente'); }
function openNewProviderModal() { openModal('modal-proveedor'); }

async function saveClienteForm(event) {
  event.preventDefault();
  const cliente = {
    id: null,
    nombre: document.getElementById('cli-nombre').value.trim(),
    documento: document.getElementById('cli-doc').value.trim(),
    telefono: document.getElementById('cli-tel').value.trim()
  };
  try {
    await DB.saveRow('clientes', cliente);
    closeModal('modal-cliente');
    document.getElementById('form-cliente').reset();
    renderContacts();
    renderSalesView();
  } catch (e) {
    alert("Error al guardar cliente.");
  }
}

async function saveProveedorForm(event) {
  event.preventDefault();
  const proveedor = {
    id: null,
    nombre: document.getElementById('prov-nombre').value.trim(),
    telefono: document.getElementById('prov-tel').value.trim(),
    email: document.getElementById('prov-email').value.trim()
  };
  try {
    await DB.saveRow('proveedores', proveedor);
    closeModal('modal-proveedor');
    document.getElementById('form-proveedor').reset();
    renderContacts();
    populateSelectors();
  } catch (e) {
    alert("Error al guardar proveedor.");
  }
}

// --- 6. MÓDULO ADMINISTRACIÓN (Solo Admin) ---
function renderAdminPanel() {
  if (currentUser.rol !== 'admin') return;

  const sellers = DB.getVendedores();
  const tbody = document.getElementById('sellers-table-body');
  tbody.innerHTML = '';

  sellers.forEach(s => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td><strong>${s.nombre}</strong></td>
      <td>${s.usuario}</td>
      <td><span class="badge ${s.rol === 'admin' ? 'badge-success' : 'badge-info'}">${s.rol}</span></td>
      <td>
        <div style="display: flex; gap: 4px;">
          <button class="btn btn-secondary btn-sm" onclick="openEditSellerModal('${s.id}')">
            <i class="fa-solid fa-pen"></i>
          </button>
          ${s.id !== 'v-1' ? `
            <button class="btn btn-danger btn-sm" onclick="deleteSeller('${s.id}')">
              <i class="fa-solid fa-trash"></i>
            </button>
          ` : '<span style="font-size: 11px; color: var(--text-dim);">Fijo</span>'}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function openNewSellerModal() {
  const form = document.getElementById('form-vendedor');
  form.reset();
  document.getElementById('vend-id').value = '';
  document.getElementById('modal-vendedor-title').textContent = "Registrar Nuevo Vendedor";
  openModal('modal-vendedor');
}

function openEditSellerModal(id) {
  const sellers = DB.getVendedores();
  const s = sellers.find(v => v.id === id);
  if (!s) return;

  openNewSellerModal();
  document.getElementById('modal-vendedor-title').textContent = "Editar Vendedor";
  document.getElementById('vend-id').value = s.id;
  document.getElementById('vend-nombre').value = s.nombre;
  document.getElementById('vend-user').value = s.usuario;
  document.getElementById('vend-pass').value = s.contrasena;
  document.getElementById('vend-rol').value = s.rol;
}

async function saveSellerForm(event) {
  event.preventDefault();
  
  const id = document.getElementById('vend-id').value;
  const seller = {
    id: id || null,
    nombre: document.getElementById('vend-nombre').value.trim(),
    usuario: document.getElementById('vend-user').value.trim(),
    contrasena: document.getElementById('vend-pass').value.trim(),
    rol: document.getElementById('vend-rol').value
  };

  try {
    await DB.saveRow('vendedores', seller);
    closeModal('modal-vendedor');
    renderAdminPanel();
    
    if (id === currentUser.id) {
      currentUser = seller;
      updateUserUI();
    }
    alert("Vendedor guardado.");
  } catch (e) {
    alert("Error al guardar vendedor.");
  }
}

async function deleteSeller(id) {
  if (id === currentUser.id) {
    alert("No puedes eliminar tu propio usuario activo.");
    return;
  }
  if (confirm("¿Desea eliminar a este vendedor del sistema?")) {
    try {
      await DB.deleteRow('vendedores', id);
      renderAdminPanel();
    } catch (e) {
      alert("Error al eliminar.");
    }
  }
}

// --- AJUSTES GOOGLE SHEETS DESDE FRONTEND ---
async function saveSheetsConfiguration() {
  const url = document.getElementById('sheets-url-input').value.trim();
  
  const btn = document.querySelector('[onclick="saveSheetsConfiguration()"]');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Conectando...';
  btn.disabled = true;

  const result = await DB.setGoogleSheetsUrl(url);
  
  btn.innerHTML = originalHtml;
  btn.disabled = false;

  alert(result.message);
  if (result.success) {
    window.location.reload();
  }
}

async function testSheetsConnection() {
  const url = document.getElementById('sheets-url-input').value.trim();
  if (!url) {
    alert("Por favor ingresa una URL antes de probar.");
    return;
  }
  const btn = document.querySelector('[onclick="testSheetsConnection()"]');
  const originalHtml = btn.innerHTML;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Probando...';
  
  const result = await DB.setGoogleSheetsUrl(url);
  btn.innerHTML = originalHtml;
  
  alert(result.message);
}

async function resetDatabaseToDefault() {
  if (confirm("⚠️ ¿Está completamente seguro? Esto eliminará todo el inventario y ventas reales de la base de datos activa.")) {
    if (confirm("⚠️ Segunda confirmación: Se perderán los datos permanentes.")) {
      const success = await DB.resetDatabaseToDefault();
      if (success) {
        alert("Base de datos formateada y mocks iniciales cargados con éxito.");
        window.location.reload();
      } else {
        alert("Error al restablecer la base de datos.");
      }
    }
  }
}

// --- RESPALDOS LOCALES JSON ---
function exportDatabaseToFile() {
  const jsonString = DB.exportBackup ? DB.exportBackup() : JSON.stringify(DB.cache, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `smartcontrol_respaldo_${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function triggerImportFileInput() {
  document.getElementById('import-file-input').click();
}

function importDatabaseFromFile(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async function(e) {
    const result = DB.importBackup ? DB.importBackup(e.target.result) : false;
    if (result) {
      alert("Copia de seguridad importada. La aplicación se recargará.");
      window.location.reload();
    } else {
      alert("Error al importar el archivo JSON.");
    }
  };
  reader.readAsText(file);
}

// --- UTILIDADES ---
function formatCurrency(value) {
  return '$' + parseFloat(value).toLocaleString('es-CO', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}
