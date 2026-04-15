document.addEventListener('DOMContentLoaded', async () => {
    const videoElement = document.getElementById('camera-feed');
    const container = document.querySelector('.video-container');
    const pointersContainer = document.getElementById('pointers-container');
    const gridResults = document.getElementById('grid-results');
    const cameraSelect = document.getElementById('camera-select');
    const resetPointerBtn = document.getElementById('reset-pointer');
    const ghTokenInput = document.getElementById('gh-token');
    const ghRepoInput = document.getElementById('gh-repo');
    const ghStatus = document.getElementById('gh-status');

    let currentStream = null;
    let isLoopRunning = false;
    let pointers = [];
    let currentMosaicoData = {};

    // Cargar config guardada
    ghTokenInput.value = localStorage.getItem('gh-token') || '';
    ghRepoInput.value = localStorage.getItem('gh-repo') || '';

    ghTokenInput.addEventListener('change', () => localStorage.setItem('gh-token', ghTokenInput.value));
    ghRepoInput.addEventListener('change', () => localStorage.setItem('gh-repo', ghRepoInput.value));

    // Definición de colores base para aproximación
    const baseColors = [
        { name: 'VERDE', rgb: [0, 255, 0], color: '#00FF00', code: "2" },
        { name: 'AZUL', rgb: [0, 0, 255], color: '#0000FF', code: "3" },
        { name: 'AMARILLO', rgb: [255, 255, 0], color: '#FFFF00', code: "1" },
        { name: 'BLANCO', rgb: [255, 255, 255], color: '#FFFFFF', code: "0" }
    ];

    let lastMosaicoData = "";
    let lastSaveTime = 0;
    const SAVE_INTERVAL = 3000; // 3 segundos para no saturar la API de GitHub

    async function saveMosaico(data) {
        const now = Date.now();
        const jsonData = JSON.stringify(data, null, 4);
        
        if (now - lastSaveTime < SAVE_INTERVAL || jsonData === lastMosaicoData) return;
        
        lastSaveTime = now;
        lastMosaicoData = jsonData;

        // Intentar guardado local (por si acaso hay un server corriendo)
        fetch('/save-mosaico', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: jsonData
        }).catch(() => {});

        // Intentar guardado en GitHub
        const token = ghTokenInput.value.trim();
        const repo = ghRepoInput.value.trim();
        const path = 'wro3/mosaico.json';

        if (token && repo) {
            try {
                ghStatus.textContent = 'Actualizando GitHub...';
                ghStatus.className = 'status-indicator';

                // 1. Obtener el SHA del archivo actual
                const getRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                    headers: { 'Authorization': `token ${token}` }
                });
                
                let sha = null;
                if (getRes.ok) {
                    const fileData = await getRes.json();
                    sha = fileData.sha;
                }

                // 2. Actualizar el archivo
                const putRes = await fetch(`https://api.github.com/repos/${repo}/contents/${path}`, {
                    method: 'PUT',
                    headers: {
                        'Authorization': `token ${token}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        message: 'Update mosaico.json from ColorWRO Live',
                        content: btoa(jsonData),
                        sha: sha
                    })
                });

                if (putRes.ok) {
                    ghStatus.textContent = 'GitHub: Actualizado ✅';
                    ghStatus.className = 'status-indicator connected';
                } else {
                    throw new Error('Error en PUT');
                }
            } catch (error) {
                console.error('Error saving to GitHub:', error);
                ghStatus.textContent = 'Error GitHub ❌';
                ghStatus.className = 'status-indicator error';
            }
        }
    }

    function getClosestColor(r, g, b) {
        let minDistance = Infinity;
        let closest = baseColors[0];

        baseColors.forEach(color => {
            const distance = Math.sqrt(
                Math.pow(r - color.rgb[0], 2) +
                Math.pow(g - color.rgb[1], 2) +
                Math.pow(b - color.rgb[2], 2)
            );

            if (distance < minDistance) {
                minDistance = distance;
                closest = color;
            }
        });
        
        return closest;
    }

    // Inicializar los 12 punteros (4 filas x 3 columnas)
    function initPointers() {
        pointersContainer.innerHTML = '';
        gridResults.innerHTML = '';
        pointers = [];

        for (let row = 1; row <= 4; row++) {
            for (let col = 1; col <= 3; col++) {
                const id = `${row},${col}`;
                
                // Crear el elemento visual del puntero
                const pointerEl = document.createElement('div');
                pointerEl.className = 'pointer';
                pointerEl.id = `pointer-${row}-${col}`;
                
                // Posición inicial en cuadrícula
                const initialX = 25 * col;
                const initialY = 20 * row;
                pointerEl.style.left = `${initialX}%`;
                pointerEl.style.top = `${initialY}%`;
                
                const label = document.createElement('span');
                label.className = 'pointer-label';
                label.textContent = `(${row},${col})`;
                pointerEl.appendChild(label);
                
                pointersContainer.appendChild(pointerEl);

                // Crear el elemento de resultado en el sidebar
                const cellEl = document.createElement('div');
                cellEl.className = 'grid-cell';
                cellEl.id = `cell-${row}-${col}`;
                cellEl.innerHTML = `
                    <div class="cell-coord">(${row},${col})</div>
                    <div class="cell-color-name">---</div>
                    <div class="cell-hex">#000000</div>
                `;
                gridResults.appendChild(cellEl);

                const pointerObj = {
                    id: id,
                    el: pointerEl,
                    cellEl: cellEl,
                    x: initialX,
                    y: initialY
                };

                // Hacer el puntero arrastrable
                makeDraggable(pointerObj);
                pointers.push(pointerObj);
            }
        }
    }

    function makeDraggable(pointerObj) {
        let isDragging = false;

        const onStart = (e) => {
            isDragging = true;
            pointerObj.el.classList.add('dragging');
        };

        const onMove = (e) => {
            if (!isDragging) return;
            
            const rect = container.getBoundingClientRect();
            let clientX, clientY;

            if (e.type === 'touchmove') {
                clientX = e.touches[0].clientX;
                clientY = e.touches[0].clientY;
                e.preventDefault();
            } else {
                clientX = e.clientX;
                clientY = e.clientY;
            }

            let x = ((clientX - rect.left) / rect.width) * 100;
            let y = ((clientY - rect.top) / rect.height) * 100;

            pointerObj.x = Math.max(0, Math.min(100, x));
            pointerObj.y = Math.max(0, Math.min(100, y));

            pointerObj.el.style.left = `${pointerObj.x}%`;
            pointerObj.el.style.top = `${pointerObj.y}%`;
        };

        const onEnd = () => {
            isDragging = false;
            pointerObj.el.classList.remove('dragging');
        };

        pointerObj.el.addEventListener('mousedown', onStart);
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);

        pointerObj.el.addEventListener('touchstart', onStart, { passive: false });
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onEnd);
    }

    // Enumerar cámaras disponibles
    async function getCameras() {
        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            const videoDevices = devices.filter(device => device.kind === 'videoinput');
            
            cameraSelect.innerHTML = '';
            videoDevices.forEach((device, index) => {
                const option = document.createElement('option');
                option.value = device.deviceId;
                option.text = device.label || `Cámara ${index + 1}`;
                cameraSelect.appendChild(option);
            });

            if (videoDevices.length === 0) {
                cameraSelect.innerHTML = '<option value="">No se detectaron cámaras</option>';
            }
        } catch (error) {
            console.error('Error al enumerar cámaras:', error);
        }
    }

    cameraSelect.addEventListener('change', () => {
        if (cameraSelect.value) {
            initCamera(cameraSelect.value);
        }
    });

    resetPointerBtn.addEventListener('click', () => {
        initPointers();
    });

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    function updateColor() {
        if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
            canvas.width = videoElement.videoWidth;
            canvas.height = videoElement.videoHeight;
            ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);

            const mosaicoData = {};

            pointers.forEach(p => {
                const pixelX = Math.floor((p.x / 100) * canvas.width);
                const pixelY = Math.floor((p.y / 100) * canvas.height);

                const pixel = ctx.getImageData(pixelX, pixelY, 1, 1).data;
                const r = pixel[0], g = pixel[1], b = pixel[2];
                const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase()}`;
                const closest = getClosestColor(r, g, b);

                // Rellenar datos para el JSON
                const coord = p.id.replace(',', ''); // Convierte "3,2" en "32"
                mosaicoData[`c${coord}`] = closest.code;

                // Actualizar la celda correspondiente en el sidebar
                p.cellEl.style.backgroundColor = closest.color;
            });

            currentMosaicoData = mosaicoData; // Guardar globalmente
            // Guardar los datos en mosaico.json (esto seguirá intentando POST localmente)
            saveMosaico(mosaicoData);
        }
        requestAnimationFrame(updateColor);
    }

    async function initCamera(deviceId = null) {
        if (currentStream) {
            currentStream.getTracks().forEach(track => track.stop());
        }

        try {
            const constraints = {
                video: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    facingMode: deviceId ? undefined : 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            };

            const stream = await navigator.mediaDevices.getUserMedia(constraints);
            currentStream = stream;
            videoElement.srcObject = stream;
            
            videoElement.onloadedmetadata = () => {
                videoElement.play();
                if (!isLoopRunning) {
                    isLoopRunning = true;
                    updateColor();
                }
            };

            await getCameras();
            
        } catch (error) {
            console.error('Error al acceder a la cámara:', error);
            const errorMessage = document.createElement('div');
            errorMessage.className = 'error-overlay';
            errorMessage.innerHTML = `<p>⚠️ No se pudo acceder a la cámara: ${error.message}</p>`;
            container.appendChild(errorMessage);
        }
    }

    initPointers();
    await initCamera();
});
