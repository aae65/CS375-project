let linkInput = document.querySelector('#modal input[type="text"]');
let shareLink = document.getElementById("generate");
let modal = document.getElementById("modal");
let copyLink = document.getElementById("copyLink");
let linkCopied = document.getElementById("link-copied");
let userId = sessionStorage.getItem("user_id");
let name = sessionStorage.getItem("name");
let isCreator = false;
let vote = document.getElementById("vote");
let voteButton = document.getElementById("vote-button");
let finishVotingButton = document.getElementById("finish-voting-button");
let message = document.getElementById("message");
let results = document.getElementById("results");
let session_id = window.location.pathname.split('/')[2];
let joinModal = document.getElementById('joinModal');
let sessionContent = document.getElementById('sessionContent');
let sessionZipCache = null;
let mobileToggleInitialized = false;
let memberListUpdateTimeout = null;
let sessionDataRefreshInterval = null;

async function fetchSessionZipIfNeeded() {
    if (sessionZipCache) return sessionZipCache;

    const attrZip = sessionContent?.getAttribute('data-zip');

    if (attrZip && attrZip.trim() && attrZip !== '<%= session.zip_code %>') {
        sessionZipCache = attrZip.trim();
        console.log("Using ZIP from data-zip:", sessionZipCache);
        return sessionZipCache;
    }

    const sessionId = getSessionId();

    try {
        const resp = await fetch(`/api/session/${sessionId}`);
        if (!resp.ok) {
            console.error('Failed to fetch session info for ZIP:', resp.status);
            return null;
        }

        const data = await resp.json();

        if (data.zip_code) {
            sessionZipCache = String(data.zip_code);
            console.log("Fetched ZIP from API:", sessionZipCache);

            if (sessionContent) {
                sessionContent.setAttribute('data-zip', sessionZipCache);
            }
            return sessionZipCache;
        }
    } catch (err) {
        console.error('Error fetching session ZIP:', err);
    }
    return null;
}

function getSessionZip() {
    return sessionZipCache;
}

// Resize map
function resizeMapLayout() {
    const layout = document.querySelector('.map-and-details');
    if (!layout) return;

    const rect = layout.getBoundingClientRect();
    const bottomPadding = 16;
    const available = window.innerHeight - rect.top - bottomPadding;

    if (available > 200) {
        layout.style.height = available + 'px';
    }
}

// Mobile map/list toggle
function setupMobileMapListToggle() {
    if (mobileToggleInitialized) return;

    const layout = document.querySelector('.map-and-details');
    const btnMap = document.getElementById('mobile-show-map');
    const btnList = document.getElementById('mobile-show-list');

    if (!layout || !btnMap || !btnList) return;

    function setView(mode) {
        layout.classList.remove('mobile-view-map', 'mobile-view-list');

        if (mode === 'map') {
            layout.classList.add('mobile-view-map');
            btnMap.classList.add('active');
            btnList.classList.remove('active');

            if (map && window.google && google.maps && google.maps.event) {
                google.maps.event.trigger(map, 'resize');
            }
        } else {
            layout.classList.add('mobile-view-list');
            btnList.classList.add('active');
            btnMap.classList.remove('active');
        }

        resizeMapLayout();
    }

    btnMap.addEventListener('click', () => setView('map'));
    btnList.addEventListener('click', () => setView('list'));

    mobileToggleInitialized = true;
    setView('map');
}

// Socket.IO should automatically use the current page's protocol and hostname
const socket = io({
    transports: ['websocket'],
    upgrade: false,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 10,
    timeout: 20000
});

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
    // Re-join session room on reconnection
    if (sessionId) {
        socket.emit('join-session', sessionId);
    }
    // Start periodic refresh when connected (every 3 seconds)
    startPeriodicRefresh();
});

socket.on('disconnect', () => {
    console.log('Disconnected from server');
    // Stop periodic refresh when disconnected
    stopPeriodicRefresh();
});

socket.on('reconnect', (attemptNumber) => {
    console.log('Reconnected to server after', attemptNumber, 'attempts');
    // Refresh voting list after reconnection
    if (sessionId) {
        socket.emit('join-session', sessionId);
        refreshAllSessionData();
    }
});

// Periodic refresh functions - refresh all session data every 3 seconds
function startPeriodicRefresh() {
    stopPeriodicRefresh(); // Clear any existing intervals
    
    // Refresh all session data every 3 seconds
    sessionDataRefreshInterval = setInterval(() => {
        if (sessionId && socket.connected) {
            refreshAllSessionData();
        }
    }, 3000);
}

function stopPeriodicRefresh() {
    if (sessionDataRefreshInterval) {
        clearInterval(sessionDataRefreshInterval);
        sessionDataRefreshInterval = null;
    }
}

function refreshAllSessionData() {
    if (!sessionId) return;
    
    // Refresh member list (shows who voted)
    if (document.getElementById('member-list-cards')) {
        renderMemberList(sessionId);
    }
    
    // Refresh restaurant list
    fetch(`/api/session/${sessionId}/restaurants?_=${new Date().getTime()}`, {
        cache: "no-store",
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        }
    })
        .then(res => res.json())
        .then(data => {
            if (data.restaurants) {
                syncRestaurantList(data.restaurants);
            }
        })
        .catch(err => console.log('Restaurant refresh error:', err));
    
    // Check for results/winner
    fetch(`/api/session/${sessionId}/results?_=${new Date().getTime()}`, {
        cache: "no-store",
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        }
    })
        .then(res => res.json())
        .then(data => {
            if (data.winner) {
                const resultsElement = document.getElementById("results");
                const finishBtn = document.getElementById("finish-voting-button");
                const voteBtn = document.getElementById("vote-button");
                
                if (resultsElement && resultsElement.textContent !== data.winner) {
                    resultsElement.textContent = data.winner;
                }
                if (finishBtn) {
                    finishBtn.style.display = 'none';
                }
                if (voteBtn) {
                    voteBtn.style.display = 'none';
                }
            }
        })
        .catch(err => console.log('Results refresh error:', err));
}

function syncRestaurantList(restaurants) {
    restaurants.forEach(restaurant => {
        if (!restaurantIds.has(restaurant.id)) {
            addRestaurantToVotingList(restaurant);
        }
    });
}

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

socket.on('member-list-updated', () => {
    // Debounce member list updates to prevent duplicate renders
    if (memberListUpdateTimeout) {
        clearTimeout(memberListUpdateTimeout);
    }
    // Increased delay to ensure DB transaction is committed
    memberListUpdateTimeout = setTimeout(() => {
        renderMemberList(sessionId);
    }, 200);
});

// Listen for voting completion and display winner
socket.on('voting-complete', (data) => {
    console.log('Voting complete:', data);
    if (data.winner) {
        const resultsElement = document.getElementById("results");
        const finishBtn = document.getElementById("finish-voting-button");
        const voteBtn = document.getElementById("vote-button");
        
        if (resultsElement) {
            resultsElement.textContent = `${data.winner}`;
        }
        if (finishBtn) {
            finishBtn.style.display = 'none';
        }
        if (voteBtn) {
            voteBtn.style.display = 'none';
        }
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
            sessionStorage.setItem("user_id", data.user_id);
            sessionStorage.setItem("name", data.name);
            userId = data.user_id;
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
        onApprove: function () {
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

    renderMemberList(sessionId);
    initializeShareFunctionality();

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

function renderMemberList(sessionId) {
    const container = document.getElementById('member-list-cards');
    if (!container) return;
    
    // Add timestamp to prevent caching
    const timestamp = new Date().getTime();
    fetch(`/api/session/${sessionId}/members?_=${timestamp}`, { 
        cache: "no-store",
        headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
        }
    })
    .then(res => {
        if (!res.ok) {
            throw new Error(`Failed to fetch members: ${res.status} ${res.statusText}`);
        }
        return res.json();
    })
    .then(data => {
        if (!data.members || !Array.isArray(data.members)) {
            throw new Error('Invalid member data received');
        }
        if (data.members.length === 0) {
            container.innerHTML = '<div class="ui message">No members found in this session.</div>';
            return;
        }
        
        // Update existing cards instead of clearing and rebuilding
        const existingCards = container.querySelectorAll('.ui.card');
        const memberMap = new Map();
        
        // Map existing cards by user_id
        existingCards.forEach(card => {
            const userId = card.getAttribute('data-user-id');
            if (userId) {
                memberMap.set(userId, card);
            }
        });
        
        // Process each member from the server
        data.members.forEach((member, index) => {
            const userId = String(member.user_id);
            const existingCard = memberMap.get(userId);
            
            if (existingCard) {
                // Update existing card's voted status
                const label = existingCard.querySelector('.label');
                const icon = existingCard.querySelector('i');
                
                if (label && icon) {
                    label.className = member.has_voted ? 'ui green mini label' : 'ui grey mini label';
                    icon.className = member.has_voted ? 'check circle icon' : 'circle outline icon';
                    
                    // Update text
                    const textNode = Array.from(label.childNodes).find(n => n.nodeType === Node.TEXT_NODE);
                    if (textNode) {
                        textNode.textContent = member.has_voted ? ' Voted' : ' Not Voted';
                    }
                }
                memberMap.delete(userId); // Mark as processed
            } else {
                // Create new card for new member
                const card = createMemberCard(member);
                container.appendChild(card);
            }
        });
        
        // Remove cards for members no longer in session
        memberMap.forEach(card => card.remove());
    })
    .catch(error => {
        container.innerHTML = `<div class="ui negative message">Error loading members: ${error.message}</div>`;
        console.error('renderMemberList error:', error);
    });
}

function createMemberCard(member) {
    const card = document.createElement('div');
    card.className = 'ui card';
    card.setAttribute('data-user-id', member.user_id);
    card.style.width = 'auto';
    card.style.minWidth = '180px';
    card.style.margin = '0.5em 0.5em 0.5em 0.5em';

    const content = document.createElement('div');
    content.className = 'content';
    content.style.display = 'flex';
    content.style.alignItems = 'center';
    content.style.justifyContent = 'space-between';
    content.style.padding = '0.8em 0.8em';

    // Name
    const nameSpan = document.createElement('span');
    nameSpan.textContent = member.name;
    nameSpan.style.fontWeight = '500';
    nameSpan.style.fontSize = '1em';
    nameSpan.style.flex = '1';
    nameSpan.style.overflow = 'hidden';
    nameSpan.style.textOverflow = 'ellipsis';
    nameSpan.style.whiteSpace = 'nowrap';

    // Status
    const label = document.createElement('span');
    label.className = member.has_voted
        ? 'ui green mini label'
        : 'ui grey mini label';
    label.style.margin = '0';
    label.style.fontSize = '0.95em';
    label.style.marginLeft = '1em';
    label.style.flexShrink = '0';

    const icon = document.createElement('i');
    icon.className = member.has_voted
        ? 'check circle icon'
        : 'circle outline icon';

    label.appendChild(icon);
    label.appendChild(document.createTextNode(member.has_voted ? ' Voted' : ' Not Voted'));

    content.appendChild(nameSpan);
    content.appendChild(label);
    card.appendChild(content);
    
    return card;
}

document.getElementById('joinButton').addEventListener('click', function (e) {
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
                        if (data.userId) {
                            userId = data.userId;
                            sessionStorage.setItem('user_Id', String(userId));
                        }
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
                        if (data.userId) {
                            userId = data.userId;
                            sessionStorage.setItem('user_Id', String(userId));
                        }
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
        currentPlaceForOverview = {id: placeId};
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
    resizeMapLayout();

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
    initMapCenterFromZip();
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

async function initMapCenterFromZip() {
    const apiKey = getApiKey();
    if (!apiKey || !map) {
        console.warn("apiKey/map missing, defaulting to nearby search");
        doNearbySearch();
        return;
    }

    const zip = await fetchSessionZipIfNeeded();
    console.log("initMapCenterFromZip → resolved zip:", zip, "apiKey present:", !!apiKey, "map present:", !!map);

    if (!zip) {
        console.warn("No ZIP available, defaulting to nearby search from current center");
        doNearbySearch();
        return;
    }

    try {
        const resp = await fetch("https://places.googleapis.com/v1/places:searchText", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "X-Goog-Api-Key": apiKey,
                "X-Goog-FieldMask": "places.location"
            },
            body: JSON.stringify({
                textQuery: `${zip} United States`,
                languageCode: "en",
                regionCode: "US"
            })
        });

        if (!resp.ok) {
            console.error("Places searchText failed:", resp.status);
            doNearbySearch();
            return;
        }

        const data = await resp.json();
        const place = data.places && data.places[0];
        const loc = place && place.location;

        if (!loc || loc.latitude == null || loc.longitude == null) {
            console.warn("ZIP did not return coordinates:", zip, data);
            doNearbySearch();
            return;
        }

        const center = { lat: loc.latitude, lng: loc.longitude };
        console.log("Centered by ZIP:", zip, center);

        map.setCenter(center);
        map.setZoom(13);
        doNearbySearch();
    } catch (err) {
        console.error("Error resolving ZIP:", err);
        doNearbySearch();
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
            infoWindow.open({map, anchor: marker});

            if (place.id) {
                placeById[place.id] = place;
                currentPlaceForOverview = place;
                setOverviewByPlaceId(place.id);
            }
        });

        resultMarkers.push(marker);
    }
}

// Map, Place, and Tab Visibility and Event Bindings
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
                resizeMapLayout();
            }, 100);
        }
    }
});

// Initial voting UI state
window.addEventListener('DOMContentLoaded', () => {
    const voteBtn = document.getElementById("vote-button");
    const msgElement = document.getElementById("message");
    
    if (voteBtn) voteBtn.style.display = "none";
    if (msgElement) msgElement.textContent = "No restaurants added. Add some to vote!";
});

// Event listeners for add/vote
window.addEventListener('DOMContentLoaded', () => {
    const voteBtn = document.getElementById("vote-button");
    if (voteBtn) {
        voteBtn.addEventListener('click', onVoteClick);
    }
});

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

    // Get elements fresh each time
    const voteContainer = document.getElementById("vote");
    const voteBtn = document.getElementById("vote-button");
    const msgElement = document.getElementById("message");
    
    if (!voteContainer) {
        console.warn('Vote container not found');
        return;
    }

    // Update message and show vote button if this is the first restaurant
    if (restaurantIds.size === 1) {
        if (msgElement) msgElement.textContent = "";
        if (voteBtn) voteBtn.style.display = "block";
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

    voteContainer.insertAdjacentHTML(
        "beforeend",
        `
        <div class="field">
        <div class="ui radio checkbox">
            <input type="radio" name="choice" id="r${id}" value="${id}" data-name="${name}">
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
    const voteBtn = document.getElementById("vote-button");
    const msgElement = document.getElementById("message");
    const voteContainer = document.getElementById("vote");
    const resultsElement = document.getElementById("results");
    
    if (!voteBtn || !msgElement || !voteContainer) {
        console.error('Required elements not found');
        return;
    }
    
    let choices = document.getElementsByName("choice");
    let restaurantId;
    let restaurantName;
    for (let i = 0; i < choices.length; i++) {
        if (choices[i].checked) {
            restaurantId = choices[i].value;
            restaurantName = choices[i].getAttribute('data-name');
            break;
        }
    }
    if (!restaurantId) {
        msgElement.textContent = "Please select a choice";
    } else {
        msgElement.textContent = `You have voted for ${restaurantName}`;
        voteBtn.className = "ui disabled button";
        for (let i = 0; i < voteContainer.children.length; i++) {
            voteContainer.children[i].className = "disabled field";
        }

        socket.emit('submit-vote', {
            vote: restaurantName,
            userName: name || 'Anonymous'
        });

        if (!userId) {
            console.error('userId not found in sessionStorage');
            msgElement.textContent = 'Error: User ID not found. Please refresh the page.';
            return;
        }

        fetch("/vote", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                session_id: sessionId,
                user_id: parseInt(userId),
                restaurant_id: parseInt(restaurantId)
            })
        })
            .then(res => {
                if (!res.ok) {
                    return res.json().then(data => {
                        throw new Error(data.error || 'Voting failed');
                    });
                }
                return res.json();
            })
            .then(data => {
                voteBtn.classList.add("disabled");
                msgElement.textContent = `You voted for ${restaurantName}`;

                if (data.allVoted && data.winner) {
                    if (resultsElement) {
                        resultsElement.textContent = `${data.winner}`;
                    }
                }
                
                // Update member list to show voted status
                renderMemberList(sessionId);
            })
            .catch(err => {
                console.error('Voting error:', err);
                if (err.message.includes('Voting period has ended')) {
                    msgElement.textContent = 'Voting period has ended. You can no longer vote.';
                    voteBtn.style.display = 'none';
                } else {
                    msgElement.textContent = `Error: ${err.message}`;
                }
            });
    }
}

function onFinishVotingClick() {
    if (!isCreator) {
        message.textContent = 'Only the session creator can finish voting early.';
        return;
    }

    if (!confirm('Are you sure you want to finish voting? This will calculate the winner immediately.')) {
        return;
    }

    fetch(`/session/${sessionId}/finish-voting`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: parseInt(userId) })
    })
        .then(res => {
            if (!res.ok) {
                return res.json().then(data => {
                    throw new Error(data.error || 'Failed to finish voting');
                });
            }
            return res.json();
        })
        .then(data => {
            message.textContent = 'Voting has been finished!';
            finishVotingButton.style.display = 'none';
            voteButton.style.display = 'none';
            if (data.winner) {
                results.textContent = `${data.winner}`;
            }
        })
        .catch(err => {
            console.error('Error finishing voting:', err);
            message.textContent = `Error: ${err.message}`;
        });
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
    // Always fetch userId from server (it's stored in cookies)
    const sessionId = getSessionId();
    fetch(`/api/session/${sessionId}/current-user`)
        .then(res => {
            if (!res.ok) {
                // User not logged in, will show join modal
                return null;
            }
            return res.json();
        })
        .then(data => {
            if (data && data.userId) {
                userId = data.userId;
                sessionStorage.setItem('user_Id', String(userId));
                console.log('Retrieved userId from server:', userId);

                // If we have a userId but no name in sessionStorage, store it
                if (data.name && !name) {
                    name = data.name;
                    sessionStorage.setItem('name', name);
                }

                // Check if user is the creator
                if (data.isCreator) {
                    isCreator = true;
                    if (finishVotingButton) {
                        finishVotingButton.style.display = 'inline-block';
                    }
                }
            }
        })
        .catch(err => console.error('Error getting userId on load:', err));

    // Add finish voting button event listener
    if (finishVotingButton) {
        finishVotingButton.addEventListener('click', onFinishVotingClick);
    }

    function handleResponsiveSetup() {
        resizeMapLayout();

        if (window.innerWidth <= 768) {
            setupMobileMapListToggle();
        }
    }

    handleResponsiveSetup();
    window.addEventListener('resize', handleResponsiveSetup);
});

//debugging
socket.on("connect_error", (err) => {
  console.error("connect_error:", err.message, err);
});
