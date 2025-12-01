// map-drawing-app.js
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
        this.capturedPoints = []; // Array of captured GPS points
        this.mode = 'draw'; // 'draw', 'select', 'delete'
        this.startIcon = 'circle';
        this.endIcon = 'flag';
        this.lineColor = '#007bff';
        this.lineLayer = L.layerGroup(); // Layer for all drawn lines
        this.markerLayer = L.layerGroup(); // Layer for markers
        
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
        
        // Capture buttons
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
                
                if (this.selectedFeature && this.selectedFeature.type === 'line') {
                    // Update end marker for selected line
                    this.updateLineEndMarker(this.selectedFeature, icon);
                } else {
                    // Set as default for new lines
                    this.endIcon = icon;
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
            created: new Date().toISOString()
        };
        
        // Add end marker
        const endMarker = this.createMarker(lat, lng, 'end');
        lineData.endMarker = endMarker;
        endMarker.addTo(this.markerLayer);
        
        // Bind popup with info
        const popupContent = this.createLinePopup(lineData);
        line.bindPopup(popupContent);
        
        // Store in lines array
        this.lines.push(lineData);
        
        // Add to coordinates list
        this.addToCoordinatesList(this.currentLine.latlngs);
        
        // Reset current line
        this.currentLine = null;
        
        // Update status
        document.getElementById('drawing-status').textContent = 'Line created! Click to start new line';
        
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
    
    createMarker(lat, lng, type) {
        const icon = L.divIcon({
            className: `${type}-marker`,
            html: `<div style="background: ${type === 'start' ? '#007bff' : this.lineColor}"></div>`,
            iconSize: [20, 20]
        });
        
        const marker = L.marker([lat, lng], { icon });
        
        // Add click handler
        marker.on('click', (e) => {
            e.originalEvent.stopPropagation();
            this.selectFeature(marker);
        });
        
        return marker;
    }
    
    createLinePopup(lineData) {
        const distance = this.calculateDistance(lineData.latlngs[0], lineData.latlngs[1]);
        const bearing = this.calculateBearing(lineData.latlngs[0], lineData.latlngs[1]);
        
        return `
            <div class="popup-content">
                <strong>Line Details</strong><br>
                Distance: ${distance.toFixed(2)} meters<br>
                Bearing: ${bearing.toFixed(1)}°<br>
                Created: ${new Date(lineData.created).toLocaleString()}<br>
                <button onclick="app.deleteLine(${lineData.id})">Delete</button>
            </div>
        `;
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
                `Line selected (${feature.latlngs.length} points)`;
        }
    }
    
    deselectFeature() {
        if (this.selectedFeature && this.selectedFeature.type === 'line') {
            // Reset line style
            this.selectedFeature.layer.setStyle(this.lineStyle);
            
            // Close popup
            this.selectedFeature.layer.closePopup();
        }
        
        this.selectedFeature = null;
    }
    
    deleteFeatureAt(lat, lng) {
        for (let i = this.lines.length - 1; i >= 0; i--) {
            const line = this.lines[i];
            if (this.isPointNearLine(lat, lng, line.latlngs)) {
                this.deleteLine(line.id);
                break;
            }
        }
    }
    
    deleteLine(id) {
        const index = this.lines.findIndex(line => line.id === id);
        if (index !== -1) {
            const line = this.lines[index];
            
            // Remove from map
            this.lineLayer.removeLayer(line.layer);
            this.markerLayer.removeLayer(line.startMarker);
            if (line.endMarker) {
                this.markerLayer.removeLayer(line.endMarker);
            }
            
            // Remove from array
            this.lines.splice(index, 1);
            
            // Deselect if it was selected
            if (this.selectedFeature && this.selectedFeature.id === id) {
                this.deselectFeature();
            }
            
            // Update coordinates list
            this.updateCoordinatesList();
        }
    }
    
    deleteSelectedFeature() {
        if (this.selectedFeature) {
            this.deleteLine(this.selectedFeature.id);
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
                maximumAge: 30000,
                timeout: 27000
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
                    html: '<div></div>',
                    iconSize: [24, 24]
                })
            }).addTo(this.map);
            
            // Center map on first GPS fix
            this.map.setView([latitude, longitude], 16);
        } else {
            this.gpsMarker.setLatLng([latitude, longitude]);
        }
        
        // Update GPS indicator
        this.updateGPSStatus('Tracking active', true);
        
        // If capturing is active, add point to captured points
        if (this.capturing) {
            this.capturePoint(latitude, longitude, accuracy);
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
    
    // Capture Functions
    startCapture() {
        this.capturing = true;
        this.capturedPoints = [];
        
        // Update UI
        document.getElementById('start-capture-btn').style.display = 'none';
        document.getElementById('stop-capture-btn').style.display = 'inline-flex';
        
        // Start GPS if not already running
        if (!this.gpsWatchId) {
            this.startGPS();
        }
        
        // Create capture line
        this.captureLine = L.polyline([], {
            color: '#28a745',
            weight: 3,
            opacity: 0.7
        }).addTo(this.lineLayer);
        
        document.getElementById('drawing-status').textContent = 
            'Capturing GPS points... Click Stop Capture to finish';
    }
    
    stopCapture() {
        this.capturing = false;
        
        // Update UI
        document.getElementById('start-capture-btn').style.display = 'inline-flex';
        document.getElementById('stop-capture-btn').style.display = 'none';
        
        if (this.capturedPoints.length > 1) {
            // Create final line from captured points
            const points = this.capturedPoints.map(p => [p.lat, p.lng]);
            
            const line = L.polyline(points, {
                color: '#28a745',
                weight: 4,
                opacity: 0.8
            }).addTo(this.lineLayer);
            
            // Store captured line
            const lineData = {
                id: Date.now(),
                type: 'gps-track',
                latlngs: this.capturedPoints,
                color: '#28a745',
                layer: line,
                created: new Date().toISOString(),
                accuracy: this.capturedPoints.map(p => p.accuracy)
            };
            
            this.lines.push(lineData);
            
            // Add markers at start and end
            const startPoint = this.capturedPoints[0];
            const endPoint = this.capturedPoints[this.capturedPoints.length - 1];
            
            const startMarker = this.createMarker(startPoint.lat, startPoint.lng, 'start');
            const endMarker = this.createMarker(endPoint.lat, endPoint.lng, 'end');
            
            startMarker.addTo(this.markerLayer);
            endMarker.addTo(this.markerLayer);
            
            lineData.startMarker = startMarker;
            lineData.endMarker = endMarker;
            
            // Bind popup
            const distance = this.calculateTotalDistance(this.capturedPoints);
            const popupContent = `
                <div class="popup-content">
                    <strong>GPS Track</strong><br>
                    Points: ${this.capturedPoints.length}<br>
                    Distance: ${distance.toFixed(2)} meters<br>
                    Created: ${new Date(lineData.created).toLocaleString()}<br>
                    <button onclick="app.deleteLine(${lineData.id})">Delete</button>
                </div>
            `;
            line.bindPopup(popupContent);
            
            // Remove temporary capture line
            this.lineLayer.removeLayer(this.captureLine);
            this.captureLine = null;
            
            // Update coordinates list
            this.addToCoordinatesList(this.capturedPoints);
            
            document.getElementById('drawing-status').textContent = 
                `GPS track captured (${this.capturedPoints.length} points)`;
        }
    }
    
    capturePoint(lat, lng, accuracy) {
        const point = {
            lat,
            lng,
            accuracy,
            timestamp: new Date().toISOString()
        };
        
        this.capturedPoints.push(point);
        
        // Update capture line
        if (this.captureLine) {
            const points = this.capturedPoints.map(p => [p.lat, p.lng]);
            this.captureLine.setLatLngs(points);
        }
        
        // Add to coordinates list
        this.addCoordinateToList(point, this.capturedPoints.length);
    }
    
    // Coordinates List Functions
    addToCoordinatesList(points) {
        const container = document.getElementById('coordinates-container');
        
        points.forEach((point, index) => {
            const coordItem = document.createElement('div');
            coordItem.className = 'coordinate-item';
            coordItem.innerHTML = `
                <span class="index">${index + 1}</span>
                ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}
                ${point.accuracy ? `<br><small>Accuracy: ${Math.round(point.accuracy)}m</small>` : ''}
            `;
            container.appendChild(coordItem);
        });
    }
    
    addCoordinateToList(point, index) {
        const container = document.getElementById('coordinates-container');
        const coordItem = document.createElement('div');
        coordItem.className = 'coordinate-item';
        coordItem.innerHTML = `
            <span class="index">${index}</span>
            ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}
            <br><small>Accuracy: ${Math.round(point.accuracy)}m</small>
        `;
        container.appendChild(coordItem);
        
        // Auto-scroll to bottom
        container.scrollTop = container.scrollHeight;
    }
    
    updateCoordinatesList() {
        const container = document.getElementById('coordinates-container');
        container.innerHTML = '';
        
        // Collect all points from all lines
        let pointIndex = 1;
        this.lines.forEach(line => {
            line.latlngs.forEach(point => {
                const coordItem = document.createElement('div');
                coordItem.className = 'coordinate-item';
                coordItem.innerHTML = `
                    <span class="index">${pointIndex++}</span>
                    ${point.lat.toFixed(6)}, ${point.lng.toFixed(6)}
                `;
                container.appendChild(coordItem);
            });
        });
    }
    
    // Save/Load Functions
    saveDrawing() {
        const drawingData = {
            lines: this.lines.map(line => ({
                id: line.id,
                type: line.type,
                latlngs: line.latlngs,
                startIcon: line.startIcon,
                endIcon: line.endIcon,
                color: line.color,
                created: line.created,
                accuracy: line.accuracy
            })),
            metadata: {
                version: '2.0',
                savedAt: new Date().toISOString(),
                totalLines: this.lines.length,
                totalPoints: this.lines.reduce((sum, line) => sum + line.latlngs.length, 0)
            }
        };
        
        // Save to localStorage
        localStorage.setItem('mapDrawing', JSON.stringify(drawingData));
        
        // Also download as file
        this.downloadJSON(drawingData, 'map-drawing.json');
        
        alert('Drawing saved successfully!');
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
        });
        
        this.lines = [];
        
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
            
            // Create line object
            const lineObj = {
                ...lineData,
                layer: line,
                startMarker,
                endMarker
            };
            
            // Bind popup
            const popupContent = this.createLinePopup(lineObj);
            line.bindPopup(popupContent);
            
            this.lines.push(lineObj);
        });
        
        // Update coordinates list
        this.updateCoordinatesList();
        
        alert(`Loaded ${data.lines.length} lines with ${data.metadata.totalPoints} points`);
    }
    
    exportGeoJSON() {
        const geoJSON = {
            type: "FeatureCollection",
            features: this.lines.map(line => ({
                type: "Feature",
                geometry: {
                    type: "LineString",
                    coordinates: line.latlngs.map(p => [p.lng, p.lat]) // GeoJSON uses [lng, lat]
                },
                properties: {
                    id: line.id,
                    type: line.type,
                    startIcon: line.startIcon,
                    endIcon: line.endIcon,
                    color: line.color,
                    created: line.created,
                    accuracy: line.accuracy,
                    length: line.latlngs.length > 1 ? 
                        this.calculateTotalDistance(line.latlngs) : 0
                }
            }))
        };
        
        this.downloadJSON(geoJSON, 'drawing.geojson');
    }
    
    downloadJSON(data, filename) {
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }
    
    // Utility Functions
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
    
    calculateTotalDistance(points) {
        let total = 0;
        for (let i = 0; i < points.length - 1; i++) {
            total += this.calculateDistance(points[i], points[i + 1]);
        }
        return total;
    }
    
    calculateBearing(point1, point2) {
        // Calculate bearing from point1 to point2
        const lat1 = point1.lat * Math.PI / 180;
        const lat2 = point2.lat * Math.PI / 180;
        const dLng = (point2.lng - point1.lng) * Math.PI / 180;
        
        const y = Math.sin(dLng) * Math.cos(lat2);
        const x = Math.cos(lat1) * Math.sin(lat2) -
                Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
        
        let bearing = Math.atan2(y, x) * 180 / Math.PI;
        return (bearing + 360) % 360;
    }
}

// Initialize app when page loads
let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new MapDrawingApp();
    window.app = app; // Make app available globally for button callbacks
});

// Handle page unload
window.addEventListener('beforeunload', (e) => {
    if (app && app.capturing) {
        e.preventDefault();
        e.returnValue = 'You are currently capturing GPS points. Are you sure you want to leave?';
        return e.returnValue;
    }
});
