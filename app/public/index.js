$('.menu .item').tab();
$('.ui.index').form({
    fields: {
        session_title: {
            identifier: 'session_title',
            rules: [{
                type: 'notEmpty',
                prompt: 'Please enter a session title'
            }]
        },
        event_date: {
            identifier: 'event_date',
            rules: [{
                type: 'notEmpty',
                prompt: 'Please select an event date on or after the end date'
            }]
        },
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
        zip: {
            identifier: 'zip',
            rules: [{
                type: 'integer',
                prompt: 'Please enter your zip code'
            }]
        },
        end_date: {
            identifier: 'end_date',
            rules: [{
                type: 'notEmpty',
                prompt: 'Please select an end voting date'
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
            session_title: form.session_title.value,
            event_date: form.event_date.value,
            name: form.name.value,
            email: form.email.value,
            zip: form.zip.value,
            end_date: form.end_date.value
        })
    }).then(response => {
        if (response.status === 200) {
            return response.json().then(body => {
                window.location.href = body.data;
            });
        } else {
            return response.json().then(body => {
                errorBox.textContent = "";
                if (body.data && Array.isArray(body.data)) {
                    body.data.forEach(msg => {
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
        console.error('Error:', error);
        errorBox.textContent = "Network error. Please try again.";
        errorBox.classList.add("visible");
        errorBox.style.display = "block";
    });
}