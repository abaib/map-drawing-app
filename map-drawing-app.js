// map-drawing-app.js
class MapDrawingApp {
    constructor() {
        this.map = null;
        this.lines = []; // Array of drawn lines
        this.lineCounter = 1; // Counter for line IDs (A1, A2, A3...)
        this.markers = []; // Array of markers
        this.currentLine = null; // Current line being drawn
        this.selectedFeature = null; // Currently selected feature
        this.gpsWatchId = null; // GPS watch ID
        this.gpsMarker = null; // Current GPS position marker
        this.capturing = false; // Whether capturing points
        this.captureState = 'idle'; // 'idle', 'waiting_for_start', 'waiting_for_end'
        this.captureStartPoint = null; // Start point for capture
        this.captureEndPoint = null; // End point for capture
        this.captureTempLine = null; // Temporary line during capture
        this.captureStartMarker = null; // Start marker for capture
        this.captureEndMarker = null; // End marker for capture
        this.mode = 'draw'; // 'draw', 'select', 'delete'
        this.startIcon = 'circle';
        this.endIcon = 'flag';
        this.lineColor = '#007bff';
        this.lineLayer = L.layerGroup(); // Layer for all drawn lines
        this.markerLayer = L.layerGroup(); // Layer for markers
        this.distanceLabels = L.layerGroup(); // Layer for distance labels
        
        // Map layers
        this.streetLayer = null;
        this.satelliteLayer = null;
        this.currentBaseLayer = null;
        
        // Excavation types (Arabic)
        this.excavationTypes = [
            "العادي",
            "الطارئ", 
            "المتعدد",
            "توصيلة المباني",
            "مخططات جديدة"
        ];
        
        // Road types
        this.roadTypes = [
            "Soil",
            "Asphalt", 
            "tiles/blocks"
        ];
        
        this.init();
    }
    
    init() {
        this.initializeMap();
        this.setupEventListeners();
        this.setupLayers();
        this.setupIconSelector();
        this.requestLocationPermission();
    }
    
    initializeMap() {
        // Initialize map with OpenStreetMap tiles
        this.map = L.map('map').setView([24.7136, 46.6753], 13); // Default to Riyadh
        
        // Create street layer
        this.streetLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        });
        
        // Create satellite layer (using Esri World Imagery)
        this.satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '© Esri',
            maxZoom: 19
        });
        
        // Add default street layer
        this.streetLayer.addTo(this.map);
        this.currentBaseLayer = this.streetLayer;
        
        // Add feature layers
        this.lineLayer.addTo(this.map);
        this.markerLayer.addTo(this.map);
        this.distanceLabels.addTo(this.map);
    }
    
    setupLayers() {
        // Style for drawn lines
        this.lineStyle = {
            color: this.lineColor,
            weight: 4,
            opacity: 0.8,
            dashArray: null
        };
        
        // Style for selected lines
        this.selectedStyle = {
            color: '#ff0000',
            weight: 6,
            opacity: 1,
            dashArray: '10, 10'
        };
    }
    
    setupEventListeners() {
        // Map click event
        this.map.on('click', (e) => this.onMapClick(e));
        
        // Tool buttons
        document.getElementById('draw-line-btn').addEventListener('click', () => {
            this.setMode('draw');
            this.updateButtonStates();
        });
        
        document.getElementById('select-mode-btn').addEventListener('click', () => {
            this.setMode('select');
            this.updateButtonStates();
        });
        
        document.getElementById('delete-btn').addEventListener('click', () => {
            this.setMode('delete');
            this.updateButtonStates();
        });
        
        // Map layer buttons
        document.getElementById('street-layer-btn').addEventListener('click', () => this.switchToStreetLayer());
        document.getElementById('satellite-layer-btn').addEventListener('click', () => this.switchToSatelliteLayer());
        
        // GPS Capture buttons
        document.getElementById('capture-start-btn').addEventListener('click', () => this.captureStartPoint());
        document.getElementById('capture-end-btn').addEventListener('click', () => this.captureEndPoint());
        
        // Color picker
        document.getElementById('line-color').addEventListener('change', (e) => {
            this.lineColor = e.target.value;
            this.lineStyle.color = this.lineColor;
        });
        
        // Save/Load buttons
        document.getElementById('save-btn').addEventListener('click', () => this.saveDrawing());
        document.getElementById('load-btn').addEventListener('click', () => this.loadDrawing());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' && this.selectedFeature) {
                this.deleteSelectedFeature();
            }
            if (e.key === 'Escape') {
                this.cancelDrawing();
                this.cancelCapture();
            }
            if (e.key === 's' && e.ctrlKey) {
                e.preventDefault();
                this.saveDrawing();
            }
        });
    }
    
    setupIconSelector() {
        const iconButtons = document.querySelectorAll('.icon-btn');
        iconButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Update active button
                iconButtons.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const icon = btn.dataset.icon;
                this.endIcon = icon;
                
                if (this.selectedFeature && this.selectedFeature.type === 'line') {
                    // Update end marker for selected line
                    this.updateLineEndMarker(this.selectedFeature, icon);
                }
            });
        });
    }
    
    switchToStreetLayer() {
        if (this.currentBaseLayer !== this.streetLayer) {
            this.map.removeLayer(this.currentBaseLayer);
            this.streetLayer.addTo(this.map);
            this.currentBaseLayer = this.streetLayer;
            
            document.getElementById('street-layer-btn').classList.add('active');
            document.getElementById('satellite-layer-btn').classList.remove('active');
        }
    }
    
    switchToSatelliteLayer() {
        if (this.currentBaseLayer !== this.satelliteLayer) {
            this.map.removeLayer(this.currentBaseLayer);
            this.satelliteLayer.addTo(this.map);
            this.currentBaseLayer = this.satelliteLayer;
            
            document.getElementById('satellite-layer-btn').classList.add('active');
            document.getElementById('street-layer-btn').classList.remove('active');
        }
    }
    
    setMode(mode) {
        this.mode = mode;
        
        // If switching to draw mode and there's a partial line, cancel it
        if (mode !== 'draw' && this.currentLine) {
            this.cancelDrawing();
        }
        
        // Update status
        const statusText = {
            'draw': 'Click on map to start drawing a line',
            'select': 'Click on a line to select it',
            'delete': 'Click on a line to delete it'
        };
        document.getElementById('drawing-status').textContent = statusText[mode];
        this.updateButtonStates();
    }
    
    updateButtonStates() {
        // Update active button state
        document.getElementById('draw-line-btn').classList.toggle('active', this.mode === 'draw');
        document.getElementById('select-mode-btn').classList.toggle('active', this.mode === 'select');
        document.getElementById('delete-btn').classList.toggle('active', this.mode === 'delete');
    }
    
    onMapClick(e) {
        const { lat, lng } = e.latlng;
        
        switch(this.mode) {
            case 'draw':
                this.handleDrawingClick(lat, lng);
                break;
            case 'select':
                this.selectFeatureAt(lat, lng);
                break;
            case 'delete':
                this.deleteFeatureAt(lat, lng);
                break;
        }
    }
    
    handleDrawingClick(lat, lng) {
        if (!this.currentLine) {
            // Start new line
            this.startNewLine(lat, lng);
        } else {
            // Finish current line
            this.finishLine(lat, lng);
        }
    }
    
    startNewLine(lat, lng) {
        this.currentLine = {
            points: [[lat, lng]],
            latlngs: [{ lat, lng }],
            startIcon: this.startIcon,
            endIcon: this.endIcon,
            color: this.lineColor,
            lineId: `A${this.lineCounter}`
        };
        
        // Add start marker
        const startMarker = this.createMarker(lat, lng, 'start');
        this.currentLine.startMarker = startMarker;
        startMarker.addTo(this.markerLayer);
        
        // Create temporary line
        this.currentLine.tempLine = L.polyline([[lat, lng]], {
            ...this.lineStyle,
            dashArray: '10, 10'
        }).addTo(this.lineLayer);
        
        document.getElementById('drawing-status').textContent = 'Click to set end point (ESC to cancel)';
    }
    
    finishLine(lat, lng) {
        if (!this.currentLine) return;
        
        // Add end point
        this.currentLine.points.push([lat, lng]);
        this.currentLine.latlngs.push({ lat, lng });
        
        // Remove temporary line
        if (this.currentLine.tempLine) {
            this.lineLayer.removeLayer(this.currentLine.tempLine);
        }
        
        // Calculate distance
        const distance = this.calculateDistance(this.currentLine.latlngs[0], this.currentLine.latlngs[1]);
        
        // Create final line
        const line = L.polyline(this.currentLine.points, this.lineStyle);
        line.addTo(this.lineLayer);
        
        // Store line data
        const lineData = {
            id: Date.now(),
            type: 'line',
            lineId: `A${this.lineCounter}`,
            latlngs: this.currentLine.latlngs,
            startIcon: this.currentLine.startIcon,
            endIcon: this.currentLine.endIcon,
            color: this.currentLine.color,
            layer: line,
            startMarker: this.currentLine.startMarker,
            endMarker: null,
            distance: distance,
            depth: 0,
            width: 0,
            excavationType: this.excavationTypes[0],
            roadType: this.roadTypes[0],
            created: new Date().toISOString()
        };
        
        // Add end marker
        const endMarker = this.createMarker(lat, lng, 'end');
        lineData.endMarker = endMarker;
        endMarker.addTo(this.markerLayer);
        
        // Add distance label in the middle
        this.addDistanceLabel(lineData);
        
        // Bind popup with info
        const popupContent = this.createLinePopup(lineData);
        line.bindPopup(popupContent);
        
        // Store in lines array
        this.lines.push(lineData);
        
        // Add to table
        this.addLineToTable(lineData);
        
        // Increment line counter
        this.lineCounter++;
        
        // Reset current line
        this.currentLine = null;
        
        // Update status
        document.getElementById('drawing-status').textContent = `Line ${lineData.lineId} created! Distance: ${distance.toFixed(2)} meters`;
        
        // Auto-select the new line
        this.selectFeature(lineData);
    }
    
    cancelDrawing() {
        if (this.currentLine) {
            // Remove temporary line
            if (this.currentLine.tempLine) {
                this.lineLayer.removeLayer(this.currentLine.tempLine);
            }
            // Remove start marker
            if (this.currentLine.startMarker) {
                this.markerLayer.removeLayer(this.currentLine.startMarker);
            }
            this.currentLine = null;
            document.getElementById('drawing-status').textContent = 'Click on map to start drawing a line';
        }
    }
    
    // GPS Capture Functions
    captureStartPoint() {
        // Start GPS if not already running
        if (!this.gpsWatchId) {
            this.startGPS();
        }
        
        if (this.gpsMarker) {
            const latlng = this.gpsMarker.getLatLng();
            this.captureStartPoint = { lat: latlng.lat, lng: latlng.lng };
            
            // Create start marker
            this.captureStartMarker = this.createMarker(latlng.lat, latlng.lng, 'start');
            this.captureStartMarker.addTo(this.markerLayer);
            
            // Change UI state
            this.captureState = 'waiting_for_end';
            document.getElementById('capture-start-btn').style.display = 'none';
            document.getElementById('capture-end-btn').style.display = 'flex';
            
            // Create temporary line from start to current GPS position
            this.captureTempLine = L.polyline([
                [latlng.lat, latlng.lng],
                [latlng.lat, latlng.lng]
            ], {
                color: '#28a745',
                weight: 3,
                opacity: 0.7,
                dashArray: '10, 10'
            }).addTo(this.lineLayer);
            
            document.getElementById('drawing-status').textContent = 
                'Start point captured. Move to end point and click "Capture End Point"';
        } else {
            document.getElementById('drawing-status').textContent = 
                'Waiting for GPS signal... Please wait';
        }
    }
    
    captureEndPoint() {
        if (this.gpsMarker && this.captureStartPoint) {
            const latlng = this.gpsMarker.getLatLng();
            this.captureEndPoint = { lat: latlng.lat, lng: latlng.lng };
            
            // Remove temporary line
            if (this.captureTempLine) {
                this.lineLayer.removeLayer(this.captureTempLine);
                this.captureTempLine = null;
            }
            
            // Create end marker
            this.captureEndMarker = this.createMarker(latlng.lat, latlng.lng, 'end');
            this.captureEndMarker.addTo(this.markerLayer);
            
            // Draw the final line
            this.createGPSLine();
            
            // Reset capture state
            this.captureState = 'idle';
            
            // Update UI
            document.getElementById('capture-end-btn').style.display = 'none';
            document.getElementById('capture-start-btn').style.display = 'flex';
            
            document.getElementById('drawing-status').textContent = 'GPS line captured!';
        }
    }
    
    cancelCapture() {
        if (this.captureState !== 'idle') {
            // Remove temporary elements
            if (this.captureTempLine) {
                this.lineLayer.removeLayer(this.captureTempLine);
                this.captureTempLine = null;
            }
            if (this.captureStartMarker) {
                this.markerLayer.removeLayer(this.captureStartMarker);
                this.captureStartMarker = null;
            }
            if (this.captureEndMarker) {
                this.markerLayer.removeLayer(this.captureEndMarker);
                this.captureEndMarker = null;
            }
            
            // Reset state
            this.captureState = 'idle';
            this.captureStartPoint = null;
            this.captureEndPoint = null;
            
            // Update UI
            document.getElementById('capture-end-btn').style.display = 'none';
            document.getElementById('capture-start-btn').style.display = 'flex';
            
            document.getElementById('drawing-status').textContent = 'GPS capture cancelled';
        }
    }
    
    createGPSLine() {
        if (!this.captureStartPoint || !this.captureEndPoint) return;
        
        // Calculate distance
        const distance = this.calculateDistance(this.captureStartPoint, this.captureEndPoint);
        
        // Create line
        const points = [
            [this.captureStartPoint.lat, this.captureStartPoint.lng],
            [this.captureEndPoint.lat, this.captureEndPoint.lng]
        ];
        
        const line = L.polyline(points, {
            color: '#28a745',
            weight: 4,
            opacity: 0.8
        }).addTo(this.lineLayer);
        
        // Store line data
        const lineData = {
            id: Date.now(),
            type: 'gps-line',
            lineId: `A${this.lineCounter}`,
            latlngs: [this.captureStartPoint, this.captureEndPoint],
            startIcon: 'circle',
            endIcon: this.endIcon,
            color: '#28a745',
            layer: line,
            startMarker: this.captureStartMarker,
            endMarker: this.captureEndMarker,
            distance: distance,
            depth: 0,
            width: 0,
            excavationType: this.excavationTypes[0],
            roadType: this.roadTypes[0],
            created: new Date().toISOString(),
            capturedByGPS: true
        };
        
        // Add distance label in the middle
        this.addDistanceLabel(lineData);
        
        // Bind popup
        const popupContent = this.createLinePopup(lineData);
        line.bindPopup(popupContent);
        
        // Store in lines array
        this.lines.push(lineData);
        
        // Add to table
        this.addLineToTable(lineData);
        
        // Increment line counter
        this.lineCounter++;
        
        // Clear capture markers references (they're already on the map)
        this.captureStartMarker = null;
        this.captureEndMarker = null;
        this.captureStartPoint = null;
        this.captureEndPoint = null;
    }
    
    addDistanceLabel(lineData) {
        if (lineData.latlngs.length !== 2) return;
        
        // Calculate midpoint
        const midLat = (lineData.latlngs[0].lat + lineData.latlngs[1].lat) / 2;
        const midLng = (lineData.latlngs[0].lng + lineData.latlngs[1].lng) / 2;
        
        // Create a custom div icon for the distance label
        const distanceLabel = L.divIcon({
            className: 'distance-label',
            html: `<div style="
                background: rgba(255, 255, 255, 0.95);
                border: 2px solid ${lineData.color};
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 14px;
                font-weight: bold;
                color: #333;
                white-space: nowrap;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
                transform: translateY(-50%);
            ">${lineData.distance.toFixed(2)} m</div>`,
            iconSize: null,
            iconAnchor: [0, 0]
        });
        
        // Create marker for the label
        const labelMarker = L.marker([midLat, midLng], {
            icon: distanceLabel,
            interactive: false // Make it non-interactive
        });
        
        labelMarker.addTo(this.distanceLabels);
        lineData.distanceLabel = labelMarker;
    }
    
    createMarker(lat, lng, type) {
        const iconColor = type === 'start' ? '#007bff' : this.lineColor;
        const icon = L.divIcon({
            className: `${type}-marker`,
            html: `<div style="
                width: 20px;
                height: 20px;
                background: ${iconColor};
                border-radius: 50%;
                border: 3px solid white;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
            "></div>`,
            iconSize: [26, 26],
            iconAnchor: [13, 13]
        });
        
        const marker = L.marker([lat, lng], { icon });
        
        // Add click handler
        marker.on('click', (e) => {
            e.originalEvent.stopPropagation();
            // Find which line this marker belongs to
            const line = this.lines.find(l => 
                l.startMarker === marker || l.endMarker === marker
            );
            if (line) {
                this.selectFeature(line);
            }
        });
        
        return marker;
    }
    
    createLinePopup(lineData) {
        const distance = lineData.distance;
        const start = lineData.latlngs[0];
        const end = lineData.latlngs[1];
        
        return `
            <div class="popup-content">
                <strong>Line ${lineData.lineId}</strong><br>
                Distance: ${distance.toFixed(2)} meters<br>
                Start: ${start.lat.toFixed(6)}, ${start.lng.toFixed(6)}<br>
                End: ${end.lat.toFixed(6)}, ${end.lng.toFixed(6)}<br>
                Depth: ${lineData.depth}m<br>
                Width: ${lineData.width}m<br>
                Excavation: ${lineData.excavationType}<br>
                Road: ${lineData.roadType}<br>
                <button onclick="app.deleteLine('${lineData.lineId}')">Delete Line</button>
            </div>
        `;
    }
    
    addLineToTable(lineData) {
        const tbody = document.getElementById('lines-table-body');
        const row = document.createElement('tr');
        row.id = `row-${lineData.lineId}`;
        row.dataset.lineId = lineData.lineId;
        
        const start = lineData.latlngs[0];
        const end = lineData.latlngs[lineData.latlngs.length - 1];
        
        // Create excavation type dropdown
        const excavationSelect = document.createElement('select');
        this.excavationTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            if (type === lineData.excavationType) option.selected = true;
            excavationSelect.appendChild(option);
        });
        excavationSelect.onchange = (e) => {
            const line = this.lines.find(l => l.lineId === lineData.lineId);
            if (line) {
                line.excavationType = e.target.value;
            }
        };
        
        // Create road type dropdown
        const roadTypeSelect = document.createElement('select');
        this.roadTypes.forEach(type => {
            const option = document.createElement('option');
            option.value = type;
            option.textContent = type;
            if (type === lineData.roadType) option.selected = true;
            roadTypeSelect.appendChild(option);
        });
        roadTypeSelect.onchange = (e) => {
            const line = this.lines.find(l => l.lineId === lineData.lineId);
            if (line) {
                line.roadType = e.target.value;
            }
        };
        
        row.innerHTML = `
            <td><strong>${lineData.lineId}</strong></td>
            <td class="coord-cell">${start.lat.toFixed(6)}, ${start.lng.toFixed(6)}</td>
            <td class="coord-cell">${end.lat.toFixed(6)}, ${end.lng.toFixed(6)}</td>
            <td>${lineData.distance.toFixed(2)}</td>
            <td><input type="number" step="0.01" value="${lineData.depth}" class="depth-input" data-line-id="${lineData.lineId}"></td>
            <td><input type="number" step="0.01" value="${lineData.width}" class="width-input" data-line-id="${lineData.lineId}"></td>
            <td></td>
            <td></td>
        `;
        
        // Replace the empty cells with actual dropdowns
        row.cells[6].appendChild(excavationSelect);
        row.cells[7].appendChild(roadTypeSelect);
        
        tbody.appendChild(row);
        
        // Add event listeners to depth and width inputs
        const depthInput = row.querySelector('.depth-input');
        const widthInput = row.querySelector('.width-input');
        
        depthInput.addEventListener('change', (e) => {
            const line = this.lines.find(l => l.lineId === lineData.lineId);
            if (line) {
                line.depth = parseFloat(e.target.value) || 0;
            }
        });
        
        widthInput.addEventListener('change', (e) => {
            const line = this.lines.find(l => l.lineId === lineData.lineId);
            if (line) {
                line.width = parseFloat(e.target.value) || 0;
            }
        });
    }
    
    updateLineInTable(lineData) {
        const row = document.getElementById(`row-${lineData.lineId}`);
        if (row) {
            const start = lineData.latlngs[0];
            const end = lineData.latlngs[lineData.latlngs.length - 1];
            
            row.cells[1].textContent = `${start.lat.toFixed(6)}, ${start.lng.toFixed(6)}`;
            row.cells[2].textContent = `${end.lat.toFixed(6)}, ${end.lng.toFixed(6)}`;
            row.cells[3].textContent = lineData.distance.toFixed(2);
            row.cells[4].querySelector('input').value = lineData.depth;
            row.cells[5].querySelector('input').value = lineData.width;
            row.cells[6].querySelector('select').value = lineData.excavationType;
            row.cells[7].querySelector('select').value = lineData.roadType;
        }
    }
    
    removeLineFromTable(lineId) {
        const row = document.getElementById(`row-${lineId}`);
        if (row) {
            row.remove();
        }
    }
    
    // GPS Functions
    requestLocationPermission() {
        if (!navigator.geolocation) {
            this.updateGPSStatus('Geolocation not supported', false);
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            (position) => this.onLocationSuccess(position),
            (error) => this.onLocationError(error),
            { enableHighAccuracy: true }
        );
    }
    
    startGPS() {
        if (!navigator.geolocation) return;
        
        this.gpsWatchId = navigator.geolocation.watchPosition(
            (position) => this.onLocationSuccess(position),
            (error) => this.onLocationError(error),
            {
                enableHighAccuracy: true,
                maximumAge: 0,
                timeout: 5000,
                distanceFilter: 1
            }
        );
        
        this.updateGPSStatus('Tracking active', true);
    }
    
    stopGPS() {
        if (this.gpsWatchId) {
            navigator.geolocation.clearWatch(this.gpsWatchId);
            this.gpsWatchId = null;
        }
        
        if (this.gpsMarker) {
            this.map.removeLayer(this.gpsMarker);
            this.gpsMarker = null;
        }
        
        this.updateGPSStatus('Tracking stopped', false);
    }
    
    onLocationSuccess(position) {
        const { latitude, longitude, accuracy } = position.coords;
        
        // Update status display
        document.getElementById('gps-coords').textContent = 
            `Lat: ${latitude.toFixed(6)}, Lng: ${longitude.toFixed(6)}`;
        document.getElementById('gps-accuracy').textContent = 
            `Accuracy: ${Math.round(accuracy)} meters`;
        
        // Create or update GPS marker
        if (!this.gpsMarker) {
            this.gpsMarker = L.marker([latitude, longitude], {
                icon: L.divIcon({
                    className: 'gps-marker',
                    html: '<div style="width: 24px; height: 24px; background: #28a745; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3); animation: pulse 2s infinite;"></div>',
                    iconSize: [30, 30],
                    iconAnchor: [15, 15]
                })
            }).addTo(this.map);
        } else {
            this.gpsMarker.setLatLng([latitude, longitude]);
        }
        
        // Update GPS indicator
        this.updateGPSStatus('Tracking active', true);
        
        // If we're waiting for end point and have a start point, update the temporary line
        if (this.captureState === 'waiting_for_end' && this.captureStartPoint && this.captureTempLine) {
            this.captureTempLine.setLatLngs([
                [this.captureStartPoint.lat, this.captureStartPoint.lng],
                [latitude, longitude]
            ]);
        }
        
        // Update drawing status with current accuracy
        if (this.captureState === 'waiting_for_end') {
            document.getElementById('drawing-status').textContent = 
                `Move to end point (Accuracy: ${Math.round(accuracy)}m)`;
        }
    }
    
    onLocationError(error) {
        const messages = {
            1: 'Permission denied',
            2: 'Position unavailable',
            3: 'Timeout'
        };
        this.updateGPSStatus(messages[error.code] || 'GPS error', false);
    }
    
    updateGPSStatus(message, active) {
        const indicator = document.getElementById('gps-indicator');
        const statusText = document.getElementById('gps-status-text');
        
        statusText.textContent = `GPS: ${message}`;
        indicator.classList.toggle('active', active);
    }
    
    selectFeatureAt(lat, lng) {
        // Find line at clicked location
        for (const line of this.lines) {
            if (this.isPointNearLine(lat, lng, line.latlngs)) {
                this.selectFeature(line);
                return;
            }
        }
        
        // Deselect if nothing clicked
        this.deselectFeature();
    }
    
    selectFeature(feature) {
        // Deselect current feature
        this.deselectFeature();
        
        // Select new feature
        this.selectedFeature = feature;
        
        if (feature.type === 'line') {
            // Highlight line
            feature.layer.setStyle(this.selectedStyle);
            
            // Open popup
            feature.layer.openPopup();
            
            // Update drawing status
            document.getElementById('drawing-status').textContent = 
                `Line ${feature.lineId} selected - Distance: ${feature.distance.toFixed(2)} meters`;
        }
    }
    
    deselectFeature() {
        if (this.selectedFeature && this.selectedFeature.type === 'line') {
            // Reset line style
            this.selectedFeature.layer.setStyle({
                ...this.lineStyle,
                color: this.selectedFeature.color
            });
            
            // Close popup
            this.selectedFeature.layer.closePopup();
        }
        
        this.selectedFeature = null;
    }
    
    deleteFeatureAt(lat, lng) {
        for (let i = this.lines.length - 1; i >= 0; i--) {
            const line = this.lines[i];
            if (this.isPointNearLine(lat, lng, line.latlngs)) {
                this.deleteLine(line.lineId);
                break;
            }
        }
    }
    
    deleteLine(lineId) {
        const index = this.lines.findIndex(line => line.lineId === lineId);
        if (index !== -1) {
            const line = this.lines[index];
            
            // Remove from map
            this.lineLayer.removeLayer(line.layer);
            this.markerLayer.removeLayer(line.startMarker);
            if (line.endMarker) {
                this.markerLayer.removeLayer(line.endMarker);
            }
            if (line.distanceLabel) {
                this.distanceLabels.removeLayer(line.distanceLabel);
            }
            
            // Remove from array
            this.lines.splice(index, 1);
            
            // Remove from table
            this.removeLineFromTable(lineId);
            
            // Deselect if it was selected
            if (this.selectedFeature && this.selectedFeature.lineId === lineId) {
                this.deselectFeature();
            }
            
            document.getElementById('drawing-status').textContent = `Line ${lineId} deleted`;
            
            // Re-index remaining lines in table
            this.reindexTable();
        }
    }
    
    reindexTable() {
        // Clear table
        const tbody = document.getElementById('lines-table-body');
        tbody.innerHTML = '';
        
        // Re-add all lines with updated IDs
        this.lines.forEach((line, index) => {
            const newLineId = `A${index + 1}`;
            line.lineId = newLineId;
            this.addLineToTable(line);
        });
        
        // Update line counter
        this.lineCounter = this.lines.length + 1;
    }
    
    deleteSelectedFeature() {
        if (this.selectedFeature) {
            this.deleteLine(this.selectedFeature.lineId);
        }
    }
    
    updateLineEndMarker(line, iconType) {
        // Update icon and color
        const newColor = iconType === 'start' ? '#007bff' : this.lineColor;
        
        if (line.endMarker) {
            // Update end marker icon
            const newIcon = L.divIcon({
                className: 'end-marker',
                html: `<div style="background: ${newColor}"></div>`,
                iconSize: [20, 20]
            });
            line.endMarker.setIcon(newIcon);
        }
    }
    
    isPointNearLine(lat, lng, latlngs) {
        if (latlngs.length < 2) return false;
        
        // Simple point-line distance calculation
        for (let i = 0; i < latlngs.length - 1; i++) {
            const p1 = latlngs[i];
            const p2 = latlngs[i + 1];
            
            const distance = this.pointToLineDistance(lat, lng, p1.lat, p1.lng, p2.lat, p2.lng);
            
            // Convert distance to meters (rough approximation)
            const distanceMeters = distance * 111320; // 1 degree ≈ 111,320 meters
            
            if (distanceMeters < 20) { // 20 meter threshold
                return true;
            }
        }
        
        return false;
    }
    
    pointToLineDistance(lat, lng, lat1, lng1, lat2, lng2) {
        // Calculate distance from point to line segment (in degrees)
        const A = lat - lat1;
        const B = lng - lng1;
        const C = lat2 - lat1;
        const D = lng2 - lng1;
        
        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;
        
        if (lenSq !== 0) {
            param = dot / lenSq;
        }
        
        let xx, yy;
        
        if (param < 0) {
            xx = lat1;
            yy = lng1;
        } else if (param > 1) {
            xx = lat2;
            yy = lng2;
        } else {
            xx = lat1 + param * C;
            yy = lng1 + param * D;
        }
        
        const dx = lat - xx;
        const dy = lng - yy;
        return Math.sqrt(dx * dx + dy * dy);
    }
    
    calculateDistance(point1, point2) {
        // Haversine formula for distance in meters
        const R = 6371000; // Earth's radius in meters
        const lat1 = point1.lat * Math.PI / 180;
        const lat2 = point2.lat * Math.PI / 180;
        const dLat = (point2.lat - point1.lat) * Math.PI / 180;
        const dLng = (point2.lng - point1.lng) * Math.PI / 180;
        
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1) * Math.cos(lat2) *
                Math.sin(dLng/2) * Math.sin(dLng/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        
        return R * c;
    }
    
    saveDrawing() {
        const drawingData = {
            lines: this.lines.map(line => ({
                id: line.id,
                type: line.type,
                lineId: line.lineId,
                latlngs: line.latlngs,
                startIcon: line.startIcon,
                endIcon: line.endIcon,
                color: line.color,
                distance: line.distance,
                depth: line.depth,
                width: line.width,
                excavationType: line.excavationType,
                roadType: line.roadType,
                created: line.created,
                capturedByGPS: line.capturedByGPS || false
            })),
            metadata: {
                version: '3.0',
                savedAt: new Date().toISOString(),
                totalLines: this.lines.length,
                lineCounter: this.lineCounter
            }
        };
        
        // Convert to JSON
        const json = JSON.stringify(drawingData, null, 2);
        
        // Create download link
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `map-drawing-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        // Also save to localStorage
        localStorage.setItem('mapDrawing', json);
        
        document.getElementById('drawing-status').textContent = 'Drawing saved successfully!';
    }
    
    loadDrawing() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        
        input.onchange = (e) => {
            const file = e.target.files[0];
            const reader = new FileReader();
            
            reader.onload = (event) => {
                try {
                    const data = JSON.parse(event.target.result);
                    this.loadDrawingData(data);
                } catch (error) {
                    alert('Error loading file: ' + error.message);
                }
            };
            
            reader.readAsText(file);
        };
        
        input.click();
    }
    
    loadDrawingData(data) {
        // Clear existing lines
        this.lines.forEach(line => {
            this.lineLayer.removeLayer(line.layer);
            if (line.startMarker) this.markerLayer.removeLayer(line.startMarker);
            if (line.endMarker) this.markerLayer.removeLayer(line.endMarker);
            if (line.distanceLabel) this.distanceLabels.removeLayer(line.distanceLabel);
        });
        
        this.lines = [];
        
        // Clear table
        document.getElementById('lines-table-body').innerHTML = '';
        
        // Load new lines
        data.lines.forEach(lineData => {
            const points = lineData.latlngs.map(p => [p.lat, p.lng]);
            
            const line = L.polyline(points, {
                color: lineData.color || this.lineColor,
                weight: 4,
                opacity: 0.8
            }).addTo(this.lineLayer);
            
            // Create markers
            const startPoint = lineData.latlngs[0];
            const endPoint = lineData.latlngs[lineData.latlngs.length - 1];
            
            const startMarker = this.createMarker(startPoint.lat, startPoint.lng, 'start');
            const endMarker = this.createMarker(endPoint.lat, endPoint.lng, 'end');
            
            startMarker.addTo(this.markerLayer);
            endMarker.addTo(this.markerLayer);
            
            // Calculate distance if not present
            if (!lineData.distance && lineData.latlngs.length === 2) {
                lineData.distance = this.calculateDistance(lineData.latlngs[0], lineData.latlngs[1]);
            }
            
            // Create line object
            const lineObj = {
                ...lineData,
                layer: line,
                startMarker,
                endMarker
            };
            
            // Add distance label
            if (lineData.distance) {
                this.addDistanceLabel(lineObj);
            }
            
            // Bind popup
            const popupContent = this.createLinePopup(lineObj);
            line.bindPopup(popupContent);
            
            this.lines.push(lineObj);
            
            // Add to table
            this.addLineToTable(lineObj);
        });
        
        // Update line counter
        if (data.metadata && data.metadata.lineCounter) {
            this.lineCounter = data.metadata.lineCounter;
        } else {
            this.lineCounter = this.lines.length + 1;
        }
        
        document.getElementById('drawing-status').textContent = `Loaded ${data.lines.length} lines`;
    }
    
    exportExcel() {
        // Create CSV content
        let csv = 'Line,Start Lat,Start Lng,End Lat,End Lng,Length (m),Depth,Width,Excavation Type,Road Type\n';
        
        this.lines.forEach(line => {
            const start = line.latlngs[0];
            const end = line.latlngs[line.latlngs.length - 1];
            
            csv += `"${line.lineId}",${start.lat},${start.lng},${end.lat},${end.lng},${line.distance.toFixed(2)},${line.depth},${line.width},"${line.excavationType}","${line.roadType}"\n`;
        });
        
        // Create Blob and download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `lines-export-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        document.getElementById('drawing-status').textContent = 'Data exported to CSV!';
    }
    
    exportCSV() {
        this.exportExcel(); // Same function for now
    }
}

// Initialize app when page loads
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new MapDrawingApp();
    window.app = app; // Make app available globally for button callbacks
    
    // Load auto-saved drawing if exists
    const saved = localStorage.getItem('mapDrawing');
    if (saved) {
        try {
            const data = JSON.parse(saved);
            app.loadDrawingData(data);
        } catch (e) {
            console.log('No valid auto-save found');
        }
    }
});

// Handle page unload
window.addEventListener('beforeunload', (e) => {
    if (app && (app.captureState !== 'idle' || app.currentLine)) {
        e.preventDefault();
        e.returnValue = 'You are currently drawing or capturing. Are you sure you want to leave?';
        return e.returnValue;
    }
});
