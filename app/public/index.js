$('.menu .item').tab();
$('.ui.index').form({
    fields: {
        name: {
            identifier: 'name',
            rules: [{
                type: 'notEmpty',
                prompt: 'Please enter your name'
            }]
        },
        email : {
            identifier: 'email',
            rules: [{
                type: 'email',
                prompt: 'Please enter your email'
            }]
        },
        phone : {
            identifier: 'phone',
            rules: [{
                type: 'integer',
                prompt: 'Please enter your phone number'
            }]
        },
        zip: {
            identifier: 'zip',
            rules: [{
                type: 'integer',
                prompt: 'Please enter your zip code'
            }]
        }
    }
});

let submit = document.getElementById("submit");
let form = document.getElementById("form");
let errorBox = document.getElementById("errorBox");

submit.addEventListener("click", submitForm);

function submitForm(event) {
    event.preventDefault();
    fetch(`/generate-session`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            name: form.name.value,
            email: form.email.value,
            phone: form.phone.value,
            zip: form.zip.value
        })
    }).then(response => {
        if (response.status === 200) {
            return response.json().then(body => {
                window.location.href = body.data;
            });
        } else {
            return response.json().then(body => {
                errorBox.textContent = "";
                if (body.errors && Array.isArray(body.errors)) {
                    body.errors.forEach(msg => {
                        let p = document.createElement("p");
                        p.textContent = msg;
                        errorBox.appendChild(p);
                    });
                }
                errorBox.classList.add("visible");
                errorBox.style.display = "block";
            });
        }
    }).catch(error => {
        // Added error handling for network issues
        console.error('Error:', error);
        errorBox.textContent = "Network error. Please try again.";
        errorBox.classList.add("visible");
        errorBox.style.display = "block";
    });
}