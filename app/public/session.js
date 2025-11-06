let linkInput = document.querySelector('#modal input[type="text"]');
let shareLink = document.getElementById("generate");
let modal = document.getElementById("modal");
let copyLink = document.getElementById("copyLink");
let linkCopied = document.getElementById('link-copied');
let name = sessionStorage.getItem('name');


$(modal).modal('attach events', shareLink, 'show');
$('.menu.item').tab();
document.getElementById("name").textContent = name;

copyLink.addEventListener('click', () => {
    linkInput.select();
    linkInput.setSelectionRange(0, 99999);
    document.execCommand('copy');
    $(copyLink).popup('show');
});

$(copyLink).popup({
    popup: linkCopied,
    position: 'top center',
    on: 'manual'
});


// Leaflet & OpenStreetMap
let map, marker;

function initMap() {
    map = L.map('map').setView([0, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap Contributors'
    }).addTo(map);
}

function showLocation() {
    if (!navigator.geolocation) {
        alert("Geolocation not supported by your browser")
        return;
    }

    navigator.geolocation.getCurrentPosition((position) => {
            const latitude = position.coords.latitude;
            const longitude = position.coords.longitude;
            map.setView([latitude, longitude], 14);

            if (marker) marker.remove();

            marker = L.marker([latitude, longitude])
                .addTo(map)
                .bindPopup("You are here")
                .openPopup();
        },
        (error) => {
            alert("Could not get location:" + error.message);
        },
        {enableHighAccuracy: true, timeout: 5000}
    );
}

$('.menu .item').tab({
    onVisible: function (tabName) {
        if (tabName === 'group') {
            initMap();
            setTimeout(() => map && map.invalidateSize(), 0)
        }
    }
});

window.addEventListener('DOMContentLoaded', () => {
    const locBtn = document.getElementById('locBtn');
    if (locBtn) locBtn.addEventListener('click', showLocation);

    const groupActive = document.querySelector('.ui.tab.active[date-tab="group"]');
    if (groupActive) {
        initMap();
        setTimeout(() => map && map.invalidateSize(), 0);
    }
})