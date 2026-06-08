// js/scanner.js
// Integración de Escaneo de IMEI y Código de Barras usando la cámara trasera

const Scanner = {
  html5QrCode: null,
  activeCallback: null,
  isScanning: false,

  // Inicializar el escáner abriendo un modal
  openScanner(onScanSuccess) {
    this.activeCallback = onScanSuccess;
    
    // Crear el modal dinámicamente si no existe
    let modal = document.getElementById('scanner-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'scanner-modal';
      modal.className = 'modal-backdrop';
      modal.innerHTML = `
        <div class="modal-card scanner-card">
          <div class="modal-header">
            <h3>📷 Escanear Código de Barras / IMEI</h3>
            <button class="btn-close" onclick="Scanner.closeScanner()">&times;</button>
          </div>
          <div class="modal-body">
            <p class="scanner-instruction">Alinea el código de barras (IMEI) de la caja en el cuadro de abajo.</p>
            <div id="scanner-reader-wrapper">
              <div id="scanner-reader"></div>
            </div>
            <div class="scanner-fallback">
              <span class="scanner-warning-text">Asegúrate de dar permisos de cámara y tener buena luz.</span>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" onclick="Scanner.closeScanner()">Cancelar</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    
    modal.classList.add('active');
    this.startCamera();
  },

  // Iniciar la cámara trasera
  startCamera() {
    if (this.isScanning) return;

    this.isScanning = true;
    // Se espera que la librería Html5Qrcode esté cargada por CDN en index.html
    if (typeof Html5Qrcode === 'undefined') {
      console.error("Librería Html5Qrcode no encontrada. Cargando fallback.");
      alert("La cámara no está lista o no se cargó el módulo de escaneo. Introduce el código manualmente.");
      this.closeScanner();
      return;
    }

    try {
      this.html5QrCode = new Html5Qrcode("scanner-reader");
      
      const config = {
        fps: 15,
        // Configurar cuadro de escaneo alargado (ideal para códigos de barras horizontales)
        qrbox: function(width, height) {
          const widthLimit = Math.min(width * 0.8, 300);
          const heightLimit = Math.min(height * 0.4, 120);
          return { width: widthLimit, height: heightLimit };
        },
        aspectRatio: 1.0
      };

      this.html5QrCode.start(
        { facingMode: "environment" }, // Forzar cámara trasera
        config,
        (decodedText, decodedResult) => {
          // Éxito al escanear
          this.playBeep();
          if (this.activeCallback) {
            this.activeCallback(decodedText);
          }
          this.closeScanner();
        },
        (errorMessage) => {
          // Silenciar errores comunes de búsqueda de foco para no saturar consola
        }
      ).catch(err => {
        console.error("Error al iniciar cámara:", err);
        // Fallback si falla environment (cámara trasera), intentar con cualquier cámara
        this.html5QrCode.start(
          { facingMode: "user" },
          config,
          (decodedText, decodedResult) => {
            this.playBeep();
            if (this.activeCallback) this.activeCallback(decodedText);
            this.closeScanner();
          },
          (err) => {}
        ).catch(err2 => {
          alert("No se pudo acceder a la cámara trasera. Asegúrate de dar permisos de cámara.");
          this.closeScanner();
        });
      });
    } catch (e) {
      console.error("Excepción en escáner:", e);
      this.closeScanner();
    }
  },

  // Detener la cámara y cerrar modal
  closeScanner() {
    const modal = document.getElementById('scanner-modal');
    if (modal) {
      modal.classList.remove('active');
    }
    
    if (this.html5QrCode && this.isScanning) {
      this.html5QrCode.stop().then(() => {
        this.isScanning = false;
        this.html5QrCode = null;
      }).catch(err => {
        console.error("Error al detener cámara:", err);
        this.isScanning = false;
        this.html5QrCode = null;
      });
    } else {
      this.isScanning = false;
    }
  },

  // Reproducir un pitido rápido al detectar código
  playBeep() {
    try {
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(880, audioCtx.currentTime); // Tono de pitido (La5)
      gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);

      oscillator.start();
      oscillator.stop(audioCtx.currentTime + 0.15); // Duración 150ms
    } catch (e) {
      // AudioContext bloqueado o no soportado, ignorar
    }
  }
};
