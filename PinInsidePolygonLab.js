var markers = [];    // holds all pins in the map
var isDrawing = false; // true when drawing a polygon to avoid the creation of pins.
var drawnPolygon = { coordinates: [], geoJson: null, layer: null };

// map initialization
var osmUrl = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}.png',
    osmAttrib = '&copy; <a href="http://openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    osm = L.tileLayer(osmUrl, {
        maxZoom: 18,
        attribution: osmAttrib
    });


var greenIcon = L.icon({  // pin inside polygon
    iconUrl: 'images/green-pin.png',
    iconAnchor: [15, 31]
});
var pinkIcon = L.icon({   // pin outside polygon
    iconUrl: 'images/pink-pin.png',
    iconAnchor: [15, 31]
});

var map = {};
var drawnItems = new L.FeatureGroup();
var methods = [
{ value: 'danrel', text: 'Danrel Rex Method', mFunction: Danrel_PointIsInPolygon },
{ value: 'danrel optimized', text: 'Danrel Rex Optimized Method', mFunction: Danrel_PointIsInPolygonBoundsOptimized },
{ value: 'wrf', text: 'W. Randolph Franklin Method', mFunction: WRF_IsInPolygon },
{ value: 'wrf', text: 'W. Randolph Optimized Method', mFunction: WRF_IsInPolygonBoundsOptimized },
{ value: 'turfjs', text: 'Turf.js Method', mFunction: Turfjs_IsInPolygon },
{ value: 'd3js', text: 'D3.js Method', mFunction: D3js_IsInPolygon },
{ value: 'leafletpip', text: 'Leaflet PIP Method', mFunction: LeafletPIP_IsInPolygon },
];

window.addEventListener("load", function () {

    // initialize the map on the "map" div with a given center and zoom
    map = L.map('map').setView([-22.968943664897527, -43.18708419799805], 14).addLayer(osm);

    map.addLayer(drawnItems);

    var drawControl = new L.Control.Draw({ //polygon draw control
        edit: {
            featureGroup: drawnItems
        },
        draw: {
            polyline: false,
            polygon: { showArea: true },
            rectangle: false,
            circle: false,
            marker: false,
            circlemarker: false
        }

    });

    map.addControl(drawControl);

    map.on('click', onMapClick);

    map.on('draw:drawstart', function (e) {
        isDrawing = true;
    });
    map.on('draw:drawstop', function (e) {
        isDrawing = false;
    });
    map.on('draw:editstart', function (e) {
        isDrawing = true;
    });
    map.on('draw:editstop', function (e) {
        isDrawing = false;
    });
    map.on('draw:deletestop', function (e) {
        RemovePolygon();
    });

    map.on('draw:created', function (event) {
        if (event.layerType != 'polygon')
            return;

        drawnItems.clearLayers();

        PolygonEdited(event.layer);

        RedrawAllPins();
    });
    map.on('draw:edited', function (event) {

        drawnItems.clearLayers();

        event.layers.eachLayer(function (layer) {
            PolygonEdited(layer);
        });
    });

    methods.forEach(option => {
        var cmbSelect = document.getElementById("cmbSelect");
        el = document.createElement("option");
        el.value = option.value;
        el.textContent = option.text;
        cmbSelect.appendChild(el);
    });

});

// Script for adding marker on map click
function onMapClick(e) {
    if (isDrawing) return;

    InsertMarker(e.latlng.lng, e.latlng.lat);
}

function PolygonEdited(polygonLayer) {
    drawnItems.addLayer(polygonLayer);

    drawnPolygon.geoJson = polygonLayer.toGeoJSON();
    drawnPolygon.coordinates = drawnPolygon.geoJson.geometry.coordinates[0];
    drawnPolygon.layer = L.polygon(drawnPolygon.coordinates.map(item => [item[1], item[0]]));
    drawnPolygon.preCalcDone = false; // for use by the Danrel Method

    RedrawAllPins();
}

// return if a point is inside the poluygon according to the method selected in the combobox
function PointIsInPolygon(lng, lat) {
    var methodValue = document.getElementById("cmbSelect").value;

    var method = methods.find((item) => item.value == methodValue);

    if (method)
        return method.mFunction(drawnPolygon, lng, lat);

    return false;
}

// redraw all pins according with the method selected in the combobox
function RedrawAllPins() {
    var old_array = markers.slice(0);
    markers = [];
    old_array.forEach(mk => {
        InsertMarker(mk.getLatLng().lng, mk.getLatLng().lat);
        map.removeLayer(mk);
    });
}

function InsertMarker(lng, lat) {
    var inPolygon = PointIsInPolygon(lng, lat);
    var markerPin = inPolygon ? greenIcon : pinkIcon;

    var marker = L.marker([lat, lng], {
        draggable: true,
        title: "Resource location",
        alt: "Resource Location",
        icon: markerPin,
        riseOnHover: true
    }).addTo(map)
      .bindPopup(getPinInfo(lng, lat));

    marker.id = fakeGuid();
    markers.push(marker);

    // Update marker on changing it's position
    marker.on("dragend", function (ev) {
        var changedPos = ev.target.getLatLng();

        // remove and re-insert a new marker 
        map.removeLayer(ev.target);

        var exitingPinIndex = markers.findIndex(m => m.id == ev.target.id);
        markers.splice(exitingPinIndex, 1);

        InsertMarker(changedPos.lng, changedPos.lat);
    });
    showInfo();
}

function RemoveAllPins() {
    var old_array = markers.slice(0);
    markers = [];
    old_array.forEach(mk => {
        map.removeLayer(mk);
    });
    showInfo();
}

function RemovePolygon() {
    drawnItems.clearLayers();
    drawnPolygon.geoJson = null;
    drawnPolygon.coordinates = [];
    drawnPolygon.layer = null;
    drawnPolygon.preCalcDone = false;
    RedrawAllPins();
    showInfo();
}

function getPinInfo(lng, lat) {
    var results = "";
    methods.forEach(method => {
        var result = method.mFunction(drawnPolygon, lng, lat);
        results = results + "<br>" + method.text + " = " + (result ? "inside" : "outside")
    });

    return "<b>Lat: " + lat.toFixed(6) + " / Long: " + lng.toFixed(6) + "</b>" +
        "<br>" + results;
}

function Turfjs_IsInPolygon(polygonData, lng, lat)    //http://turfjs.org/docs#pointsWithinPolygon
{
    if (!polygonData || polygonData.coordinates.length == 0) return false;
    var tpoints = turf.points([[lng, lat]]);
    polp = [];
    polp.push(polygonData.coordinates);

    var pol = turf.polygon(polp);
    var pt = turf.pointsWithinPolygon(tpoints, pol);
    return pt.features.length > 0;
}

function D3js_IsInPolygon(polygonData, lng, lat)      //http://docs.w3cub.com/d3~4/d3-geo/#geoContains
{
    if (!polygonData.geoJson) return false;
    return d3.geoContains(polygonData.geoJson, [lng, lat]);
}

function LeafletPIP_IsInPolygon(polygonData, lng, lat)   //https://github.com/mapbox/leaflet-pip
{
    if (!polygonData.layer) return false;
    var marker = L.marker([lng, lat]);
    return polygonData.layer.contains(marker.getLatLng());
}

function Danrel_PointIsInPolygon(polygonData, lng, lat) { //method described in http://alienryderflex.com/polygon/

    if( polygonData.coordinates.length == 0 )
    return false;

    if (!polygonData.preCalcDone) {
        preCalcForPointInPolygon(polygonData.coordinates);
        polygonData.preCalcDone = true;
    }

    var polyCorners = polygonData.coordinates.length;
    var j = polyCorners - 1;
    var oddNodes = 0;

    for (var i = 0; i < polyCorners; i++) {
        if ((polygonData.coordinates[i][1] < lat && polygonData.coordinates[j][1] >= lat ||
            polygonData.coordinates[j][1] < lat && polygonData.coordinates[i][1] >= lat)) {
            oddNodes ^= (lat * calc_multiple[i] + calc_constant[i] < lng);
        }
        j = i;
    }
    return oddNodes ? true : false;
}

function Danrel_PointIsInPolygonBoundsOptimized(polygonData, lng, lat) { //method described in http://alienryderflex.com/polygon/

    if( polygonData.coordinates.length == 0 )
    return false;

    var maxx = polygonData.layer.getBounds().getEast();
    var minx = polygonData.layer.getBounds().getWest();
    var maxy = polygonData.layer.getBounds().getNorth();
    var miny = polygonData.layer.getBounds().getSouth();
    if( lng>maxx || lng<minx || lat>maxy || lat<miny)
        return false;

    if (!polygonData.preCalcDone) {
        preCalcForPointInPolygon(polygonData.coordinates);
        polygonData.preCalcDone = true;
    }

    var polyCorners = polygonData.coordinates.length;
    var j = polyCorners - 1;
    var oddNodes = 0;

    for (var i = 0; i < polyCorners; i++) {
        if ((polygonData.coordinates[i][1] < lat && polygonData.coordinates[j][1] >= lat ||
            polygonData.coordinates[j][1] < lat && polygonData.coordinates[i][1] >= lat)) {
            oddNodes ^= (lat * calc_multiple[i] + calc_constant[i] < lng);
        }
        j = i;
    }
    return oddNodes ? true : false;
}

function WRF_IsInPolygon(polygonData, lng, lat) {
    // W. Randolph Franklin algorithm based on
    //https://wrf.ecse.rpi.edu//Research/Short_Notes/pnpoly.html
    var xi, xj, yi, yj,
        intersect,
        inside = false,
        x = lng,
        y = lat,
        vs = polygonData.coordinates;

        if( polygonData.coordinates.length == 0 )
            return false;
            
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        xi = vs[i][0],
        yi = vs[i][1],
        xj = vs[j][0],
        yj = vs[j][1],
        intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) 
            inside = !inside;
    }
    return inside;
}

function WRF_IsInPolygonBoundsOptimized(polygonData, lng, lat) {
    // W. Randolph Franklin algorithm based on
    //https://wrf.ecse.rpi.edu//Research/Short_Notes/pnpoly.html
    var xi, xj, yi, yj,
        intersect,
        inside = false,
        x = lng,
        y = lat,
        vs = polygonData.coordinates;

        if( polygonData.coordinates.length == 0 )
            return false;

        var maxx = polygonData.layer.getBounds().getEast();
        var minx = polygonData.layer.getBounds().getWest();
        var maxy = polygonData.layer.getBounds().getNorth();
        var miny = polygonData.layer.getBounds().getSouth();
        if( x>maxx || x<minx || y>maxy || y<miny)
            return false;
            
    for (var i = 0, j = vs.length - 1; i < vs.length; j = i++) {
        xi = vs[i][0],
        yi = vs[i][1],
        xj = vs[j][0],
        yj = vs[j][1],
        intersect = ((yi > y) != (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) 
            inside = !inside;
    }
    return inside;
}



var calc_constant = [];
var calc_multiple = [];
function preCalcForPointInPolygon(polygonCoordinates) {
    var polyCorners = polygonCoordinates.length;
    var j = polyCorners - 1;

    for (var i = 0; i < polyCorners; i++) {
        var cix = polygonCoordinates[i][0];
        var ciy = polygonCoordinates[i][1];
        var cjx = polygonCoordinates[j][0];
        var cjy = polygonCoordinates[j][1];

        if (cjy == ciy) {
            calc_constant[i] = cix;
            calc_multiple[i] = 0;
        }
        else {
            calc_constant[i] = cix - (ciy * cjx) / (cjy - ciy) + (ciy * cix) / (cjy - ciy);
            calc_multiple[i] = (cjx - cix) / (cjy - ciy);
        }
        j = i;
    }
}

var benchmarking = 0;
function Benchmark() {
    if (!drawnPolygon.coordinates || drawnPolygon.coordinates.length == 0 || markers.length == 0) {
        alert("A polygon and points must be drawn first");
        return;
    }
    if (benchmarking > 0)
        return;

    var max = parseInt(txtNumIterations.value);
    if (isNaN(max) || max < 1 || max > 10000)
        alert("Invalid number of iterations");

    var results = "Results for " + max + " iterations in the shown polygon and points" + "\n";
    results += "points = " + markers.length + "/ polygon vertices = " + drawnPolygon.coordinates.length + "\n\n";
    benchmarkInfo.innerHTML = results.replace(/\n/g, "<br>");
    // for (mi = 0; mi < methods.length; mi++) {
    //    var method = methods[mi];
    benchmarking = 0;
    methods.forEach(method => {
        setTimeout(function () {
            var i = 0, j = 0;
            benchmarking = benchmarking + 1;
            results += method.text + " = ";
            benchmarkInfo.innerHTML = results.replace(/\n/g, "<br>");
            var start = performance.now();
            for (j = 0; j < markers.length; j++) {
                var lng = markers[j].getLatLng().lng;
                var lat = markers[j].getLatLng().lat;
                for (i = 0; i < max; i++) {
                    method.mFunction(drawnPolygon, lng, lat);
                }
            }
            var end = performance.now();
            elapsed = end - start;
            var pointsPerSecond = Math.trunc(1000 / (elapsed / max / markers.length));
            results += elapsed.toFixed(1) + " milliseconds / " + pointsPerSecond.toLocaleString('pt') + " verifications per second.\n";
            benchmarkInfo.innerHTML = results.replace(/\n/g, "<br>");
            benchmarking = benchmarking - 1;
        }, 100);
    });

    benchmarkInfo.style.display = "block";
    benchmarkInfo.title = "Click here to dispatch";
    benchmarkInfo.onclick = function () { this.style.display = 'none'; }

}

function randomPins() {
    if (!drawnPolygon.coordinates || drawnPolygon.coordinates.length == 0) {
        alert("Draw a polygon first!");
        return;
    }
    var numPins = parseInt(txtNumPins.value);
    if (isNaN(numPins) || numPins < 1)
        alert("Invalid number of points");

    var bounds = drawnPolygon.layer.getBounds();
    var xmax = bounds.getNorthEast().lng;
    var ymax = bounds.getNorthEast().lat;
    var xmin = bounds.getSouthWest().lng;
    var ymin = bounds.getSouthWest().lat;
    var width = xmax - xmin;
    var height = ymax - ymin;

    for (var i = 0; i < numPins; i++) {
        var lng = xmin + Math.random() * width;
        var lat = ymin + Math.random() * height;

        InsertMarker(lng, lat);
    }
    showInfo();

}

function randomPolygon() {
    var numVertices = parseInt(txtNumVertices.value);
    if (isNaN(numVertices) || numVertices < 5)
        alert("Invalid number of vertices");
    var bounds = map.getBounds();
    var xmax = bounds.getNorthEast().lng;
    var ymax = bounds.getNorthEast().lat;
    var xmin = bounds.getSouthWest().lng;
    var ymin = bounds.getSouthWest().lat;
    var width = xmax - xmin;
    var height = ymax - ymin;
    var gapx = width/20;
    var gapy = height/20;
    xmin = xmin + gapx;
    ymin = ymin + gapy;
    width = width - gapx*2;
    height = height - gapy*2;
    var coordinates = [];
    for (var i = 0; i < numVertices - 1; i++) {
        var lng = xmin + Math.random() * width;
        var lat = ymin + Math.random() * height;

        coordinates.push([lat, lng]);
    }
    drawnItems.clearLayers();
    PolygonEdited(L.polygon(coordinates));
    showInfo();
}

function showInfo() {
    drawnItemsInfo.innerHTML = "points = " + markers.length + "<br>vertices = " + drawnPolygon.coordinates.length;
}

function fakeGuid() {
    function s4() {
        return Math.floor((1 + Math.random()) * 0x10000)
            .toString(16)
            .substring(1);
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}