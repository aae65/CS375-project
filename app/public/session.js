let linkInput = document.querySelector('#modal input[type="text"]');
let shareLink = document.getElementById("generate");
let modal = document.getElementById("modal");
let copyLink = document.getElementById("copyLink");
let linkCopied = document.getElementById("link-copied");
let name = sessionStorage.getItem("name");
let vote = document.getElementById("vote");
let testAdd = document.getElementById("test-add");
let voteButton = document.getElementById("vote-button");
let message = document.getElementById("message");
let results = document.getElementById("results");
let session_id = window.location.pathname.split('/')[2];
let joinModal = document.getElementById('joinModal');
let sessionContent = document.getElementById('sessionContent');

// Socket.IO should automatically use the current page's protocol and hostname
const socket = io();

// Get session ID from URL
function getSessionId() {
    const path = window.location.pathname;
    return path.split('/').pop();
}

// Join session room
const sessionId = getSessionId();
if (sessionId) {
    socket.emit('join-session', sessionId);
}

// Listen for existing restaurants when joining
socket.on('existing-restaurants', (restaurants) => {
    console.log('Loading existing restaurants:', restaurants);
    restaurants.forEach(restaurant => {
        addRestaurantToVotingList(restaurant);
    });
});

// Update user count when it changes
socket.on('user-count', (count) => {
    const userCountElement = document.getElementById('user-count');
    if (userCountElement) {
        userCountElement.textContent = count;
    }
});

// Log connection events
socket.on('connect', () => {
    console.log('Connected to server');
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
});

// Listen for restaurant additions from other users
socket.on('restaurant-added', (restaurant) => {
    console.log('Restaurant added:', restaurant);
    addRestaurantToVotingList(restaurant);
    showAddNotification(restaurant.name);
});

// Listen for vote submissions from other users
socket.on('vote-submitted', (data) => {
    console.log('Vote submitted:', data);
    if (data.userName) {
        showVoteNotification(data.userName, data.vote);
    }
});

// Display stored name
let storedName = sessionStorage.getItem("name");
let nameElement = document.getElementById("name");
if (storedName && nameElement) {
    nameElement.textContent = storedName;
}

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
    if (document.getElementById("name")) {
        document.getElementById("name").textContent = name;
    }   
    sessionContent.style.display = 'block';
    $(joinModal).modal('hide');

    initializeShareFunctionality();

    let locBtn = document.getElementById('locBtn');
    if (locBtn) locBtn.addEventListener('click', showLocation);

    $('.menu .item').tab({
        onVisible: function (tabName) {
            // Tab Visibility and Event Bindings
            if (tabName === 'select' || tabName === 'vote') {
                if (!map) {
                    initMap();
                }
                setTimeout(() => {
                    if (map && window.google && google.maps && google.maps.event) {
                        google.maps.event.trigger(map, 'resize');
                    }
                }, 100);
            }
        }
    });
}

document.getElementById('joinButton').addEventListener('click', function(e) {
    e.preventDefault();
    
    let joinErrorBox = document.getElementById('joinErrorBox');
    let activeTab = document.querySelector('#joinTabs .item.active').getAttribute('data-tab');
    
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
        let newName = document.querySelector('input[name="newName"]').value;
        
        if (!newName || newName.trim().length === 0) {
            joinErrorBox.textContent = 'Please enter your name';
            joinErrorBox.style.display = 'block';
            return;
        }
        
        fetch(`/session/${session_id}/join`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                isExistingUser: false,
                name: newName
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

    // Copy session link to clipboard
    if (copyLink && linkInput) {
        copyLink.addEventListener("click", () => {
            linkInput.select();
            linkInput.setSelectionRange(0, 99999);
            document.execCommand("copy");
            $(copyLink).popup("show");
        });
    }

    $(copyLink).popup({
        popup: linkCopied,
        position: 'top center',
        on: 'manual'
    });
}

$(copyLink).popup({
    popup: linkCopied,
    position: 'top center',
    on: 'manual'
});

// Map Variables
let map;
let mapInited = false;
let marker = null;
let infoWindow;
let resultMarkers = [];
let lastOverviewId = null;
let placeById = {};
let currentPlaceForOverview = null;

// Voting globals
let id = 0;
let restaurantIds = new Set();

// Hook into gmpx-api-loader so initMap runs when Maps JS API is ready
(function setupMapInit() {
    const apiLoader = document.querySelector("gmpx-api-loader");

    if (apiLoader) {
        apiLoader.addEventListener("gmpx-api-load", () => {
            if (!mapInited) initMap();
        });
    } else if (window.google && google.maps && !mapInited) {
        initMap();
    }
})();

// Remove Old Markers
function clearResultMarkers() {
    for (const marker of resultMarkers) {
        if (marker.setMap) {
            marker.setMap(null);
        }
        if ("map" in marker) {
            marker.map = null;
        }
    }
    resultMarkers = [];
}

// Get Google API Key
function getApiKey() {
    const loader = document.querySelector("gmpx-api-loader");
    const apiKey = loader?.getAttribute("key");
    if (apiKey) return apiKey;

    const scripts = Array.from(document.scripts);
    for (const script of scripts) {
        const src = script.getAttribute("src") || "";
        const match = src.match(/[?&]key=([^&]+)/);
        if (match) return decodeURIComponent(match[1]);
    }
    return "";
}

// DOM Setup for Reviews
function ensureReviewsContainer() {
    let reviewContainer = document.getElementById("reviews");
    if (reviewContainer) return reviewContainer;

    const overview = document.getElementById("overview");
    reviewContainer = document.createElement("div");
    reviewContainer.id = "reviews";
    reviewContainer.style.marginTop = "8px";
    reviewContainer.className = "ui segment";

    if (overview && overview.parentNode) {
        overview.parentNode.insertBefore(reviewContainer, overview.nextSibling);
    } else {
        document.body.appendChild(reviewContainer);
    }
    return reviewContainer;
}

// Fetch and Render Reviews
async function renderReviews(placeId) {
    const apiKey = getApiKey();
    if (!apiKey || !placeId) return;
    const container = ensureReviewsContainer();
    container.innerHTML = "";

    const resp = await fetch(`https://places.googleapis.com/v1/places/${placeId}?languageCode=en`, {
        headers: {
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask": "id,displayName,formattedAddress,reviews.authorAttribution.displayName,reviews.authorAttribution.photoUri,reviews.rating,reviews.text.text"
        }
    });

    if (!resp.ok) return;

    const data = await resp.json();
    const reviews = data.reviews || [];
    if (!reviews.length) {
        container.innerHTML = `<div class="ui message">No reviews available.</div>`;
        return;
    }

    const top = reviews.slice(0, 5);
    const html = top.map(review => {
        const name = review.authorAttribution?.displayName || "Reviewer";
        const photo = review.authorAttribution?.photoUri || "";
        const rating = review.rating ? `⭐ ${review.rating}` : "";
        const text = review.text?.text || "";
        const imgTag = photo
            ? `<img src="${photo}" referrerpolicy="no-referrer" width="32" height="32" style="border-radius:50%;object-fit:cover;margin-right:8px">`
            : "";
        return `<div class="item" style="display:flex;align-items:flex-start;margin-bottom:10px">
                    ${imgTag}
                    <div>
                        <div style="font-weight:600">${name} ${rating}</div>
                        <div>${text}</div>
                    </div>
                </div>`;
    }).join("");
    container.innerHTML = `<h4 class="ui header">Reviews</h4><div class="ui list">${html}</div>`;
}

// Load Place Overview and Reviews
function setOverviewByPlaceId(placeId) {
    const overviewEl = document.getElementById("overview");
    if (!overviewEl || !placeId) return;
    if (placeId === lastOverviewId) return;

    lastOverviewId = placeId;
    overviewEl.setAttribute("place", placeId);

    // Load reviews via Places API v1
    renderReviews(placeId);

    // Track the current place locally for "Add to voting" button
    if (placeById[placeId]) {
        currentPlaceForOverview = placeById[placeId];
    } else {
        currentPlaceForOverview = { id: placeId };
    }
    ensureOverviewAddButton();
    showAddButton();
}

// Add Button for Overview
function ensureOverviewAddButton() {
    const container = document.getElementById("add-button-container");
    if (!container) return;

    let button = document.getElementById("overview-add-to-vote");
    if (!button) {
        button = document.createElement("button");
        button.id = "overview-add-to-vote";
        button.className = "ui large primary fluid button";
        button.textContent = "Add this place to voting";
        button.style.display = "block";
        button.style.margin = "12px 0";
        button.style.opacity = "0";
        button.style.transform = "translateY(-6px)";
        button.style.pointerEvents = "none";
        button.style.transition = "opacity 0.25s ease, transform 0.25s ease";

        container.appendChild(button);

        button.addEventListener("click", () => {
            if (!currentPlaceForOverview) {
                message.textContent = "Select a place first.";
                return;
            }
            addPlaceToSession(currentPlaceForOverview);
        });
    }
}

// Show Add Button on Overview
function showAddButton() {
    const button = document.getElementById("overview-add-to-vote");
    if (!button) return;

    button.style.opacity = "1";
    button.style.transform = "translateY(0)";
    button.style.pointerEvents = "auto";
}

// Map Initialization
function initMap() {
    if (mapInited) return;
    mapInited = true;

    const start = {lat: 39.9526, lng: -75.1652};
    map = new google.maps.Map(document.getElementById("map"), {
        center: start,
        zoom: 13,
        mapId: "DEMO_MAP_ID",
        mapTypeControl: false,
    });

    infoWindow = new google.maps.InfoWindow();

    const autocompleteElement = document.getElementById("autocomplete");
    if (autocompleteElement) {
        autocompleteElement.addEventListener("gmpx-placechange", () => {
            const place = autocompleteElement.value;
            if (place && place.location) {
                map.panTo(place.location);
                map.setZoom(15);
                addOrMoveMarker(place.location, place.displayName || "Selected place");

                if (place?.id) {
                    placeById[place.id] = place;
                    currentPlaceForOverview = place;
                    setOverviewByPlaceId(place.id);
                }
            }
        });
    }
    doNearbySearch();
}

window.initMap = initMap;

// Add or Move Marker (AdvancedMarkerElement)
function addOrMoveMarker(position, title = "Selected") {
    if (marker) {
        marker.position = position;
        marker.title = title;
    } else {
        marker = new google.maps.marker.AdvancedMarkerElement({
            map,
            position,
            title,
        });
    }
}

// Search Nearby Restaurants/Cafes
async function doNearbySearch() {
    const center = map.getCenter();
    if (!center) return;
    const apiKey = getApiKey();
    if (!apiKey) return;

    clearResultMarkers();

    const body = {
        includedTypes: ["restaurant", "cafe", "bar"],
        maxResultCount: 20,
        rankPreference: "DISTANCE",
        locationRestriction: {
            circle: {
                center: {latitude: center.lat(), longitude: center.lng()},
                radius: 2000
            }
        }
    };

    const resp = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": apiKey,
            "X-Goog-FieldMask":
                "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.priceLevel,places.photos.name"
        },
        body: JSON.stringify(body)
    });

    if (!resp.ok) return;
    const data = await resp.json();
    const places = data.places || [];

    for (const place of places) {
        const lat = place.location?.latitude;
        const lng = place.location?.longitude;
        if (lat == null || lng == null) continue;
        const pos = {lat, lng};

        if (place.id) {
            placeById[place.id] = place;
        }

        const marker = new google.maps.marker.AdvancedMarkerElement({
            map,
            position: pos,
            title: place.displayName?.text || "Place",
        });

        marker.addListener("click", () => {
            const photoHTML = place.photos?.length
                ? `<img src="https://places.googleapis.com/v1/${place.photos[0].name}/media?max_height_px=120&max_width_px=180&key=${apiKey}" 
                style="width:100%;max-height:100px;object-fit:cover;border-radius:4px;margin-bottom:4px">`
                : "";
            infoWindow.setContent(
                `<div style="max-width:220px;line-height:1.4">
       ${photoHTML}
       <div style="font-weight:600;font-size:14px;">${place.displayName?.text || ""}</div>
       <div style="font-size:12px;color:#555;">${place.formattedAddress || ""}</div>
       ${place.rating ? `<div style="margin-top:2px;font-size:12px;">⭐ ${place.rating} (${place.userRatingCount || 0})</div>` : ""}
     </div>`
            );
            infoWindow.open({ map, anchor: marker });

            if (place.id) {
                placeById[place.id] = place;
                currentPlaceForOverview = place;
                setOverviewByPlaceId(place.id);
            }
        });

        resultMarkers.push(marker);
    }
}

// Geolocation: Show User’s Position
function showLocation() {
    if (!navigator.geolocation) {
        alert("Geolocation not supported on this browser.");
        return;
    }
    navigator.geolocation.getCurrentPosition(
        pos => {
            const position = {lat: pos.coords.latitude, lng: pos.coords.longitude};
            map.setCenter(position);
            map.setZoom(14);
            addOrMoveMarker(position, "You are here");
            doNearbySearch();
        },
        err => {
            console.error(err);
            alert("Unable to get your location.");
        }
    );
}

// Tab Visibility and Event Bindings
$(".menu .item").tab({
    onVisible: function (tabName) {
        if (tabName === "select" && window.google && google.maps) {
            initMap();
        }
    }
});

// Initial voting UI state
voteButton.style.display = "none";
message.textContent = "No restaurants added. Add some to vote!";

// Event listeners for add/vote
testAdd.addEventListener('click', onTestAddClick);
voteButton.addEventListener('click', onVoteClick);

function onTestAddClick() {
    message.textContent = "";
    id++;
    const restaurantName = `This is test #${id}`;

    socket.emit('add-restaurant', {
        id: id,
        name: restaurantName,
        address: "",
        rating: null,
        userRatingCount: null,
        priceLevel: null
    });
}

// Helper function to add place to session
function addPlaceToSession(place) {
    if (!place || !place.id) return;

    const displayName =
        (place.displayName && place.displayName.text)
            ? place.displayName.text
            : "Unnamed place";

    const restaurantData = {
        id: place.id,
        name: displayName,
        address: place.formattedAddress || "",
        rating: place.rating || null,
        userRatingCount: place.userRatingCount || null,
        priceLevel: place.priceLevel || null
    };

    showAddNotification(displayName);
    socket.emit('add-restaurant', restaurantData);
}

// Helper function to add restaurant to voting list
function addRestaurantToVotingList(restaurant) {
    const {id, name, address, rating, userRatingCount, priceLevel} = restaurant;
    // Avoid duplicates
    if (restaurantIds.has(id)) {
        return;
    }
    restaurantIds.add(id);
    
    // Update message and show vote button if this is the first restaurant
    if (restaurantIds.size === 1) {
        message.textContent = "";
        voteButton.style.display = "block";
    }
    
    const details = [];

    if (rating) {
        const ratingText = `⭐ ${rating}${userRatingCount ? ` (${userRatingCount})` : ""}`;
        details.push(ratingText);
    }

    if (typeof priceLevel === "number") {
        details.push("$".repeat(priceLevel + 1));
    }

    if (address) {
        details.push(address);
    }

    const detailsHtml = details.length
        ? `<div style="font-size: 0.85em; color: #555; margin-top: 2px;">${details.join(" • ")}</div>`
        : "";

    vote.insertAdjacentHTML(
        "beforeend",
        `
        <div class="field">
        <div class="ui radio checkbox">
            <input type="radio" name="choice" id="r${id}" value="${name}">
            <label>
                <div><strong>${name}</strong></div>
                ${detailsHtml}
            </label>
        </div>
    </div>
    `
    );
}

function onVoteClick() {
    let choices = document.getElementsByName("choice");
    let selection;
    for (let i = 0; i < choices.length; i++) {
        if (choices[i].checked) {
            selection = choices[i].value;
            break;
        }
    }
    if (!selection) {
        message.textContent = "Please select a choice";
    } else {
        message.textContent = `You have voted for ${selection}`;
        voteButton.className = "ui disabled button";
        for (let i = 0; i < vote.children.length; i++) {
            vote.children[i].className = "disabled field";
        }

        socket.emit('submit-vote', {
            vote: selection,
            userName: name || 'Anonymous'
        });

        fetch("/vote", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                session_id: sessionId,
                user_id: userId,
                selection
            })
        })
            .then(res => res.json())
            .then(data => {
                voteButton.classList.add("disabled");
                message.textContent = `You voted for ${selection}`;

                if (data.allVoted && data.winner) {
                    results.textContent = `The winner is: ${data.winner}`;
                }
            })
            .catch(err => console.error(err));
    }
}

// Helper function to show restaurants added-to-vote notification
function showAddNotification(restaurantName) {
    const notification = document.createElement('div');
    notification.className = 'ui info message';
    notification.style.position = 'fixed';
    notification.style.top = '60px';
    notification.style.right = '-300px';
    notification.style.zIndex = '1001';
    notification.style.minWidth = '250px';
    notification.style.maxWidth = '350px';
    notification.style.transition = 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
    notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    notification.innerHTML = `<i class="plus circle icon"></i> Added <strong>${restaurantName}</strong> to voting`;

    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.right = '10px';
    }, 10);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(20px)';
    }, 2500);

    setTimeout(() => {
        notification.remove();
    }, 3000);
}

// Helper function to show vote notifications
function showVoteNotification(userName, votedFor) {
    const notification = document.createElement('div');
    notification.className = 'ui positive message';
    notification.style.position = 'fixed';
    notification.style.top = '60px';
    notification.style.right = '-300px'; 
    notification.style.zIndex = '1001';
    notification.style.minWidth = '250px';
    notification.style.maxWidth = '350px';
    notification.style.transition = 'all 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55)';
    notification.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
    notification.innerHTML = `<i class="check circle icon"></i> <strong>${userName}</strong> voted for <em>${votedFor}</em>`;

    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.style.right = '10px';
    }, 10);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(20px)';
    }, 2500);
    
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

window.addEventListener("DOMContentLoaded", () => {
    const locBtn = document.getElementById("locBtn");
    if (locBtn) locBtn.addEventListener("click", showLocation);
});
