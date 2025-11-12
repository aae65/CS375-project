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

// Socket.IO connection
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
socket.on('restaurant-added', (data) => {
    console.log('Restaurant added:', data);
    addRestaurantToVotingList(data.id, data.name);
});

// Listen for vote submissions from other users
socket.on('vote-submitted', (data) => {
    console.log('Vote submitted:', data);
    // You can add visual feedback here, like showing who voted
    if (data.userName) {
        showVoteNotification(data.userName, data.vote);
    }
});

$(modal).modal("attach events", shareLink, "show");
$(".menu.item").tab();

// Display stored name
if (document.getElementById("name")) document.getElementById("name").textContent = name;

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

// Map Variables
let map;
let mapInited = false;
let marker = null;
let infoWindow;
let resultMarkers = [];
let lastOverviewId = null;

// Remove Old Markers
function clearResultMarkers() {
  for (const marker of resultMarkers) {
    if (marker.setMap) marker.setMap(null);
    else if (marker.map) marker.map = null;
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
    const imgTag = photo ? `<img src="${photo}" referrerpolicy="no-referrer" width="32" height="32" style="border-radius:50%;object-fit:cover;margin-right:8px">` : "";
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
  const PlaceCtor = google?.maps?.places?.Place;
  const supports = !!PlaceCtor?.prototype?.isOpen;
  if (!overviewEl || !PlaceCtor || !supports) return;
  if (placeId && placeId === lastOverviewId) return;
  lastOverviewId = placeId;
  overviewEl.place = new PlaceCtor({ id: placeId });
  renderReviews(placeId);
}

// Map Initialization
function initMap() {
  if (mapInited) return;
  mapInited = true;

  const start = { lat: 39.9526, lng: -75.1652 };
  map = new google.maps.Map(document.getElementById("map"), {
    center: start,
    zoom: 13,
    mapId: "DEMO_MAP_ID",
    mapTypeControl: false,
  });

  infoWindow = new google.maps.InfoWindow();

  const autocompleteEl = document.getElementById("autocomplete");
  if (autocompleteEl) {
    autocompleteEl.addEventListener("gmpx-placechange", () => {
      const place = autocompleteEl.value;
      if (place && place.location) {
        map.panTo(place.location);
        map.setZoom(15);
        addOrMoveMarker(place.location, place.displayName || "Selected place");
        if (place?.id) setOverviewByPlaceId(place.id);
        
        // Add restaurant to voting list via WebSocket
        if (place.displayName && place.id) {
          socket.emit('add-restaurant', {
            id: place.id,
            name: place.displayName
          });
        }
      }
    });
  }

  doNearbySearch();
}

window.initMap = initMap;

// Add or Move Marker
function addOrMoveMarker(position, title = "Selected") {
  if (marker) {
    marker.setPosition(position);
  } else {
    marker = new google.maps.Marker({
      position,
      map,
      title
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
        center: { latitude: center.lat(), longitude: center.lng() },
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
        "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.userRatingCount,places.photos.name"
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
    const pos = { lat, lng };

    const marker = new google.maps.Marker({
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
      if (place.id) setOverviewByPlaceId(place.id);
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
      const position = { lat: pos.coords.latitude, lng: pos.coords.longitude };
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
    if (tabName === "group" && window.google && google.maps) {
      initMap();
    }
  }
});

voteButton.style.display = "none";
message.textContent = "No restaurants added. Add some to vote!";
testAdd.addEventListener('click', onTestAddClick);
voteButton.addEventListener('click', onVoteClick);
let id = 0;
let restaurantIds = new Set(); // Track existing restaurant IDs to avoid duplicates

function onTestAddClick(){
    message.textContent = "";
    id++;
    const restaurantName = `This is test #${id}`;
    
    // Emit to WebSocket so all users get the update
    socket.emit('add-restaurant', {
        id: id,
        name: restaurantName
    });
}

// Helper function to add restaurant to voting list
function addRestaurantToVotingList(restaurantId, restaurantName) {
    // Avoid duplicates
    if (restaurantIds.has(restaurantId)) {
        return;
    }
    restaurantIds.add(restaurantId);
    
    // Update message and show vote button if this is the first restaurant
    if (restaurantIds.size === 1) {
        message.textContent = "";
        voteButton.style.display = "block";
    }
    
    // Add the restaurant to the voting form
    vote.insertAdjacentHTML("beforeend", `
      <div class="field">
        <div class="ui radio checkbox">
          <input type="radio" name="choice" id="r${restaurantId}" value="${restaurantName}">
          <label>${restaurantName}</label>
        </div>
      </div>
    `);
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
        
        // Emit vote to WebSocket
        socket.emit('submit-vote', {
            vote: selection,
            userName: name || 'Anonymous'
        });
    }
}

// Helper function to show vote notifications
function showVoteNotification(userName, votedFor) {
    // Create a temporary notification
    const notification = document.createElement('div');
    notification.className = 'ui message';
    notification.style.position = 'fixed';
    notification.style.top = '60px';
    notification.style.right = '10px';
    notification.style.zIndex = '1001';
    notification.style.minWidth = '200px';
    notification.innerHTML = `<i class="check icon"></i> ${userName} voted for ${votedFor}`;
    
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
        notification.remove();
    }, 3000);
}

window.addEventListener("DOMContentLoaded", () => {
  const locBtn = document.getElementById("locBtn");
  if (locBtn) locBtn.addEventListener("click", showLocation);
});