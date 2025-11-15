let linkInput = document.querySelector('#modal input[type="text"]');
let shareLink = document.getElementById("generate");
let modal = document.getElementById("modal");
let copyLink = document.getElementById("copyLink");
let linkCopied = document.getElementById('link-copied');
let name = sessionStorage.getItem('name');
let session_id = window.location.pathname.split('/')[2];
let joinModal = document.getElementById('joinModal');
let sessionContent = document.getElementById('sessionContent');

// Check if user is already in session via cookie
fetch(`/api/session/${session_id}/user`)
.then(response => response.json())
.then(data => {
    if (data.name) {
        showSessionContent(data.name);
    } else {
        showJoinModal();
    }
}).catch(error => {
    console.error('Error fetching user:', error);
    showJoinModal();
});

function showJoinModal() {
    sessionContent.style.display = 'none';
    loadExistingUsers();
    
    $('#joinTabs .item').tab();
    $('.ui.dropdown').dropdown();
    
    $(joinModal).modal({
        closable: false,
        onApprove: function() {
            return false;
        }
    }).modal('show');
}

function loadExistingUsers() {
    fetch(`/api/session/${session_id}/users`)
    .then(response => response.json())
    .then(data => {
        let dropdown = document.getElementById('existingUserSelect');

        dropdown.textContent = '';

        let defaultOption = document.createElement('option');
        defaultOption.value = '';
        defaultOption.textContent = 'Choose your name...';
        dropdown.append(defaultOption);
        
        data.users.forEach(user => {
            let option = document.createElement('option');
            option.value = user.user_id;
            option.textContent = user.name;
            dropdown.append(option);
        });
    
        $('.ui.dropdown').dropdown('refresh');
    })
    .catch(error => {
        console.error('Error loading users:', error);
    });
}

function showSessionContent(name) {
    document.getElementById("name").textContent = name;
    sessionContent.style.display = 'block';
    $(joinModal).modal('hide');

    initializeShareFunctionality();

    let locBtn = document.getElementById('locBtn');
    if (locBtn) locBtn.addEventListener('click', showLocation);

    $('.menu .item').tab({
        onVisible: function (tabName) {
            if (tabName === 'vote') {
                initMap();
                setTimeout(() => map && map.invalidateSize(), 0);
            }
        }
    });

    $('[data-tab="group"]').tab('change tab', 'group');
}

document.getElementById('joinButton').addEventListener('click', function(e) {
    e.preventDefault();
    
    let joinErrorBox = document.getElementById('joinErrorBox');
    let activeTab = document.querySelector('.tab.segment.active').getAttribute('data-tab');
    
    if (activeTab === 'existing') {
        let selectedUserId = document.getElementById('existingUserSelect').value;
        
        if (!selectedUserId) {
            joinErrorBox.textContent = 'Please select your name from the list';
            joinErrorBox.style.display = 'block';
            return;
        }
        
        fetch(`/session/${session_id}/join`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                isExistingUser: true,
                existingUserId: selectedUserId
            })
        })
        .then(response => {
            if (response.status === 200) {
                return response.json().then(data => {
                    showSessionContent(data.name);
                });
            } else {
                return response.json().then(data => {
                    joinErrorBox.textContent = data.error || 'Error selecting user';
                    joinErrorBox.style.display = 'block';
                });
            }
        })
        .catch(error => {
            console.error('Error:', error);
            joinErrorBox.textContent = 'Network error. Please try again.';
            joinErrorBox.style.display = 'block';
        });
        
    } else {
        let newUsername = document.querySelector('input[name="newName"]').value;
        
        if (!newUsername || newUsername.trim().length === 0) {
            joinErrorBox.textContent = 'Please enter your name';
            joinErrorBox.style.display = 'block';
            return;
        }
        
        fetch(`/session/${session_id}/join`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                isExistingUser: false,
                name: newUsername
            })
        })
        .then(response => {
            if (response.status === 200) {
                return response.json().then(data => {
                    showSessionContent(data.name);
                });
            } else {
                return response.json().then(data => {
                    joinErrorBox.textContent = data.error || 'Error joining session';
                    joinErrorBox.style.display = 'block';
                });
            }
        })
        .catch(error => {
            console.error('Error:', error);
            joinErrorBox.textContent = 'Network error. Please try again.';
            joinErrorBox.style.display = 'block';
        });
    }
});

function initializeShareFunctionality() {
    // Share modal functionality
    $(modal).modal('attach events', shareLink, 'show');
    
    shareLink.addEventListener('click', () => {
        linkInput.value = window.location.href;
        $(modal).modal('show');
    });

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
}


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