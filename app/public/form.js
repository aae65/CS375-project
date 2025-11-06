$('.menu .item').tab();
$('.ui.form').form({
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
    fetch(`/session`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            name: form.name.value,
            email: form.email.value,
            phone: form.phone.value,
            zip: form.zip.value
        })
    }).then(response => response.json()
    ).then(body => {
        if (body.success) {
            window.location.href = "/session";
        } else {
            errorBox.textContent = "";
            body.errors.forEach(msg => {
                let p = document.createElement("p");
                p.textContent = msg;
                errorBox.appendChild(p);
            });
            errorBox.classList.add("visible");
            errorBox.style.display = "block";
        }
    });
}