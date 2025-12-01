// map-drawing-app.js - UPDATED VERSION
class MapDrawingApp {
    constructor() {
        this.map = null;
        this.lines = []; // Array of drawn lines
        this.markers = []; // Array of markers
        this.currentLine = null; // Current line being drawn
        this.selectedFeature = null; // Currently selected feature
        this.gpsWatchId = null; // GPS watch ID
        this.gpsMarker = null; // Current GPS position marker
        this.capturing = false; // Whether capturing points
        this.captureState = 'idle'; // 'idle', 'waiting_for_start', 'waiting_for_end'
        this.captureStartPoint = null; // Start point for capture
        this.captureEndPoint = null; // End point for capture
        this.mode = 'draw'; // 'draw', 'select', 'delete'
        this.startIcon = 'circle';
        this.endIcon = 'flag';
        this.lineColor = '#007bff';
        this.lineLayer = L.layerGroup(); // Layer for all drawn lines
        this.markerLayer = L.layerGroup(); // Layer for markers
        this.distanceLabels = L.layerGroup(); // Layer for distance labels
        
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
        this.map = L.map('map').setView([51.505, -0.09], 13);
        
        // Add base tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors',
            maxZoom: 19
        }).addTo(this.map);
        
        // Add layers to map
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
        
        // Capture buttons - UPDATED
        document.getElementById('start-capture-btn').addEventListener('click', () => this.startCapture());
        document.getElementById('stop-capture-btn').addEventListener('click', () => this.stopCapture());
        
        // Color picker
        document.getElementById('line-color').addEventListener('change', (e) => {
            this.lineColor = e.target.value;
            this.lineStyle.color = this.lineColor;
        });
        
        // Save/Load buttons
        document.getElementById('save-btn').addEventListener('click', () => this.saveDrawing());
        document.getElementById('load-btn').addEventListener('click', () => this.loadDrawing());
        document.getElementById('export-btn').addEventListener('click', () => this.exportGeoJSON());
        
        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Delete' && this.selectedFeature) {
                this.deleteSelectedFeature();
            }
            if (e.key === 'Escape') {
                this.cancelDrawing();
                this.cancelCapture();
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
            color: this.lineColor
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
        
        // Create final line
        const line = L.polyline(this.currentLine.points, this.lineStyle);
        line.addTo(this.lineLayer);
        
        // Calculate distance
        const distance = this.calculateDistance(this.currentLine.latlngs[0], this.currentLine.latlngs[1]);
        
        // Store line data
        const lineData = {
            id: Date.now(),
            type: 'line',
            latlngs: this.currentLine.latlngs,
            startIcon: this.currentLine.startIcon,
            endIcon: this.currentLine.endIcon,
            color: this.currentLine.color,
            layer: line,
            startMarker: this.currentLine.startMarker,
            endMarker: null,
            distance: distance,
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
        
        // Add to coordinates list
        this.addToCoordinatesList(this.currentLine.latlngs, distance);
        
        // Reset current line
        this.currentLine = null;
        
        // Update status
        document.getElementById('drawing-status').textContent = `Line created! Distance: ${distance.toFixed(2)} meters`;
        
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
    
    // UPDATED: GPS Capture Functions (Start/End Points Only)
    startCapture() {
        // Change UI state
        this.captureState = 'waiting_for_start';
        
        // Update UI
        document.getElementById('start-capture-btn').style.display = 'none';
        document.getElementById('stop-capture-btn').style.display = 'inline-flex';
        document.getElementById('stop-capture-btn').innerHTML = '<i class="fas fa-crosshairs"></i> Capture Start Point';
        
        // Start GPS if not already running
        if (!this.gpsWatchId) {
            this.startGPS();
        }
        
        // Clear any previous capture data
        this.captureStartPoint = null;
        this.captureEndPoint = null;
        
        // Remove any existing temporary capture line
        if (this.captureTempLine) {
            this.lineLayer.removeLayer(this.captureTempLine);
            this.captureTempLine = null;
        }
        
        // Remove any existing capture markers
        if (this.captureStartMarker) {
            this.markerLayer.removeLayer(this.captureStartMarker);
            this.captureStartMarker = null;
        }
        if (this.captureEndMarker) {
            this.markerLayer.removeLayer(this.captureEndMarker);
            this.captureEndMarker = null;
        }
        
        document.getElementById('drawing-status').textContent = 
            'Move to start point and click "Capture Start Point" when ready';
    }
    
    stopCapture() {
        if (this.captureState === 'waiting_for_start') {
            // Capture start point
            if (this.gpsMarker) {
                const latlng = this.gpsMarker.getLatLng();
                this.captureStartPoint = { lat: latlng.lat, lng: latlng.lng };
                
                // Create start marker
                this.captureStartMarker = this.createMarker(latlng.lat, latlng.lng, 'start');
                this.captureStartMarker.addTo(this.markerLayer);
                
                // Change to waiting for end point
                this.captureState = 'waiting_for_end';
                document.getElementById('stop-capture-btn').innerHTML = '<i class="fas fa-flag-checkered"></i> Capture End Point';
                document.getElementById('drawing-status').textContent = 
                    'Move to end point and click "Capture End Point" when ready';
                
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
            }
        } else if (this.captureState === 'waiting_for_end') {
            // Capture end point
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
                this.createCaptureLine();
                
                // Reset capture state
                this.captureState = 'idle';
                
                // Update UI
                document.getElementById('start-capture-btn').style.display = 'inline-flex';
                document.getElementById('stop-capture-btn').style.display = 'none';
                
                document.getElementById('drawing-status').textContent = 'GPS line captured!';
            }
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
            document.getElementById('start-capture-btn').style.display = 'inline-flex';
            document.getElementById('stop-capture-btn').style.display = 'none';
            
            document.getElementById('drawing-status').textContent = 'GPS capture cancelled';
        }
    }
    
    createCaptureLine() {
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
            latlngs: [this.captureStartPoint, this.captureEndPoint],
            startIcon: 'circle',
            endIcon: this.endIcon,
            color: '#28a745',
            layer: line,
            startMarker: this.captureStartMarker,
            endMarker: this.captureEndMarker,
            distance: distance,
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
        
        // Add to coordinates list
        const pointsArray = [this.captureStartPoint, this.captureEndPoint];
        this.addToCoordinatesList(pointsArray, distance);
        
        // Clear capture markers references (they're already on the map)
        this.captureStartMarker = null;
        this.captureEndMarker = null;
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
                background: rgba(255, 255, 255, 0.9);
                border: 2px solid ${lineData.color};
                border-radius: 4px;
                padding: 4px 8px;
                font-size: 14px;
                font-weight: bold;
                color: #333;
                white-space: nowrap;
                box-shadow: 0 2px 4px rgba(0,0,0,0.2);
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
    
    // UPDATED: GPS tracking updates temporary line
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
                    html: '<div style="width: 24px; height: 24px; background: #28a745; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>',
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
        if (this.captureState === 'waiting_for_start') {
            document.getElementById('drawing-status').textContent = 
                `Move to start point (Accuracy: ${Math.round(accuracy)}m)`;
        } else if (this.captureState === 'waiting_for_end') {
            document.getElementById('drawing-status').textContent = 
                `Move to end point (Accuracy: ${Math.round(accuracy)}m)`;
        }
    }
    
    // Rest of the class methods remain the same...
    // (Only showing the updated methods above. The rest of your existing methods should stay as they were)
    
    // Keep all your existing methods like:
    // updateGPSStatus, createLinePopup, selectFeature, deselectFeature, deleteLine, 
    // calculateDistance, addToCoordinatesList, saveDrawing, loadDrawing, exportGeoJSON, etc.
    // They should remain unchanged from your previous version.
    
    // Only replace the GPS capture related methods as shown above.
    
    // Also update the addToCoordinatesList method to accept distance parameter:
    addToCoordinatesList(points, distance = null) {
        const container = document.getElementById('coordinates-container');
        
        // Clear previous coordinates
        container.innerHTML = '<h4>Line Coordinates</h4>';
        
        points.forEach((point, index) => {
            const coordItem = document.createElement('div');
            coordItem.className = 'coordinate-item';
            coordItem.innerHTML = `
                <span class="index">${index === 0 ? 'START' : 'END'}</span>
                ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}
                ${point.accuracy ? `<br><small>±${Math.round(point.accuracy)}m</small>` : ''}
            `;
            container.appendChild(coordItem);
        });
        
        if (distance !== null) {
            const distanceItem = document.createElement('div');
            distanceItem.className = 'coordinate-item';
            distanceItem.style.borderLeftColor = '#28a745';
            distanceItem.innerHTML = `
                <span class="index">DIST</span>
                <strong>${distance.toFixed(2)} meters</strong>
            `;
            container.appendChild(distanceItem);
        }
    }
}
