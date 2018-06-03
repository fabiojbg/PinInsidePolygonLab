var markers = [];    // holds all pins in the map
var isDrawing = false; // true when drawing a polygon to avoid the creation of pins.
var drawnPolygon = { coordinates: [], geoJson: null, layer : null};

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

window.addEventListener("load", function(){

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
        if( event.layerType!='polygon')
            return;
    
        drawnItems.clearLayers();
        
        PolygonEdited(event.layer);
        
        RedrawAllPins();    
    });    
    map.on('draw:edited', function (event) {
   
        drawnItems.clearLayers();
        
        event.layers.eachLayer(function(layer){
            PolygonEdited(layer);
         });
    });    
});

// Script for adding marker on map click
function onMapClick(e) {
    if( isDrawing ) return;
    
    InsertMarker(e.latlng.lng, e.latlng.lat);
}

function PolygonEdited(polygonLayer)
{
    drawnItems.addLayer(polygonLayer);
        
    drawnPolygon.geoJson =polygonLayer.toGeoJSON();
    drawnPolygon.coordinates = drawnPolygon.geoJson.geometry.coordinates[0];
    drawnPolygon.layer = L.polygon(drawnPolygon.coordinates);
    drawnPolygon.preCalcDone = false; // for use by the Danrel Method
    
    RedrawAllPins();    
}          

// return if a point is inside the poluygon according to the method selected in the combobox
function PointIsInPolygon(lng, lat)
{
    var method = document.getElementById("cmbSelect").value;
    if( method == "danrel")
        return DanrelPointIsInPolygon(drawnPolygon, lng, lat);

    if( method == "turfjs")
        return Turfjs_IsInPolygon(drawnPolygon, lng, lat);

    if( method == "d3js")
        return D3js_IsInPolygon(drawnPolygon, lng, lat);

    if( method == "leafletpip")
        return LeafletPIP_IsInPolygon(drawnPolygon, lng, lat);    

    return false;
}

// redraw all pins according with the method selected in the combobox
function RedrawAllPins()
{
    var old_array = markers.slice(0);
    markers = [];
    old_array.forEach( mk => {
        InsertMarker(mk.getLatLng().lng, mk.getLatLng().lat);        
        map.removeLayer(mk);
    });    
}

function InsertMarker(lng, lat)
{
    var inPolygon = PointIsInPolygon(lng,lat);
    var markerPin = inPolygon ? greenIcon : pinkIcon;

    var marker = L.marker([lat, lng], {
    draggable: true,
    title: "Resource location",
    alt: "Resource Location",
    icon: markerPin,
    riseOnHover: true
    }).addTo(map)
    .bindPopup(getPinInfo(lng,lat));
    
    marker.id = fakeGuid();
    markers.push(marker);

    // Update marker on changing it's position
    marker.on("dragend", function (ev) {
        var changedPos = ev.target.getLatLng();    
        
        // remove and re-insert a new marker 
        map.removeLayer(ev.target);
        
        var exitingPinIndex = markers.findIndex( m => m.id == ev.target.id);
        markers.splice(exitingPinIndex, 1);

        InsertMarker(changedPos.lng, changedPos.lat);
    });               
}

function RemoveAllPins()
{
    var old_array = markers.slice(0);
    markers = [];
    old_array.forEach( mk => {
        map.removeLayer(mk);
    });    
}

function RemovePolygon()
{
    drawnItems.clearLayers();
    drawnPolygon.geoJson = null;
    drawnPolygon.coordinates = [];
    drawnPolygon.layer = null;
    drawnPolygon.preCalcDone = false;
    RedrawAllPins();
}

function getPinInfo(lng, lat)
{        
    var danrelMethodResult = DanrelPointIsInPolygon(drawnPolygon, lng, lat);
    
    var turfjsMethodResult = Turfjs_IsInPolygon(drawnPolygon, lng, lat);

    var d3jsMethodResult = D3js_IsInPolygon(drawnPolygon, lng, lat);   

    var leafletPIPMethodResult = LeafletPIP_IsInPolygon(drawnPolygon, lng, lat); 

    return "Lat: " + lat.toFixed(6) + " / Long:" + lng.toFixed(6) + "<br>Danrel Rex Method = " + (danrelMethodResult ? "inside" : "outside")
                                           + "<br>Turf.js Method = " + (turfjsMethodResult  ? "inside" : "outside")                                           
                                           + "<br>D3.js Method = " + (d3jsMethodResult ? "inside" : "outside")
                                           + "<br>LeafletPIP Method = " + (leafletPIPMethodResult ? "inside" : "outside");
}
  
function Turfjs_IsInPolygon(polygonData, lng, lat)    //http://turfjs.org/docs#pointsWithinPolygon
{
    if(!polygonData || polygonData.coordinates.length == 0) return false;
    var tpoints = turf.points([[lng, lat]]);
    polp = [];
    polp.push(polygonData.coordinates);
    
    var pol = turf.polygon(polp);
    var pt = turf.pointsWithinPolygon(tpoints, pol );
    return pt.features.length > 0;
}
    
function D3js_IsInPolygon(polygonData, lng, lat)      //http://docs.w3cub.com/d3~4/d3-geo/#geoContains
{
    if(!polygonData.geoJson) return false;
    return d3.geoContains(polygonData.geoJson, [lng, lat]);
}

function LeafletPIP_IsInPolygon(polygonData, lng, lat)   //https://github.com/mapbox/leaflet-pip
{
    if( !polygonData.layer) return false;
    var marker = L.marker( [lng, lat]);
    return polygonData.layer.contains(marker.getLatLng());
}

function DanrelPointIsInPolygon(polygonData, lng, lat) { //method described in http://alienryderflex.com/polygon/
    if (!polygonData.preCalcDone) {
        preCalcForPointInPolygon(polygonData.coordinates);
        polygonData.preCalcDone = true;
    }

    var polyCorners = polygonData.coordinates.length;
    var j=polyCorners - 1;
    var oddNodes= 0;

    for(var i = 0; i<polyCorners; i++) {
        if ((polygonData.coordinates[i][1] < lat && polygonData.coordinates[j][1] >= lat ||
            polygonData.coordinates[j][1] < lat && polygonData.coordinates[i][1] >= lat)) 
        {
            oddNodes ^= (lat * calc_multiple[i] + calc_constant[i] < lng);
        }
        j = i; 
    }
    return oddNodes ? true : false; 
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

function Benchmark()
{
    if( !drawnPolygon.coordinates || drawnPolygon.coordinates.length == 0 || markers.length==0)
    {
        alert("A polygon and points must be drawn first");
        return;
    }

    var max = 10000;
    var result = "Results for " + max + " iterations in the shown polygon and points" + "\n";
    var i = 0, j=0;
    var start = performance.now();
    for(j=0; j<markers.length; j++)
    {
        var lng = markers[j].getLatLng().lng;
        var lat = markers[j].getLatLng().lat;
        for(i=0; i<max; i++)
        {            
            DanrelPointIsInPolygon(drawnPolygon, lng, lat);
        }
    }
    var end = performance.now();
    elapsed = end-start;
    result += "Danrel = " + elapsed.toFixed(1) + " milliseconds" + "\n";

    start = performance.now();
    for(j=0; j<markers.length; j++)
    {
        var lng = markers[j].getLatLng().lng;
        var lat = markers[j].getLatLng().lat;
        for(i=0; i<max; i++)
        {            
            Turfjs_IsInPolygon(drawnPolygon, lng, lat);
        }
    }
    end = performance.now();
    elapsed = end-start;
    result += "Turf.js = " + elapsed.toFixed(1) + " milliseconds" + "\n";

    start = performance.now();
    for(j=0; j<markers.length; j++)
    {
        var lng = markers[j].getLatLng().lng;
        var lat = markers[j].getLatLng().lat;
        for(i=0; i<max; i++)
        {            
            D3js_IsInPolygon(drawnPolygon, lng, lat);
        }
    }
    end = performance.now();
    elapsed = end-start;
    result += "D3.js = " + elapsed.toFixed(1) + " milliseconds" + "\n";

    start = performance.now();
    for(j=0; j<markers.length; j++)
    {
        var lng = markers[j].getLatLng().lng;
        var lat = markers[j].getLatLng().lat;
        for(i=0; i<max; i++)
        {            
            LeafletPIP_IsInPolygon(drawnPolygon, lng, lat);
        }
    }
    end = performance.now();
    elapsed = end-start;
    result += "LeafletPIP = " + elapsed.toFixed(1) + " milliseconds" + "\r\n";    

    console.log(result);
    alert(result);
}

function fakeGuid() {
  function s4() {
    return Math.floor((1 + Math.random()) * 0x10000)
      .toString(16)
      .substring(1);
  }
  return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
}