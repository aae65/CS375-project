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

submit.addEventListener("click", submitForm);

function submitForm() {
    fetch(`/session`, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            name: form.name.value,
            email: form.email.value,
            phone: form.phone.value,
            zip: form.zip.value
        })
    }).then(response => {
        sessionStorage.setItem("name", form.name.value);
        return response.json();
    });
}