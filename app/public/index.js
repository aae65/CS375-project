document.addEventListener('DOMContentLoaded', function () {
    const getStartedBtn = document.getElementById("get-started");
    const formEl = document.getElementById("form");
    const submitBtn = document.getElementById("submit");
    const errorBox = document.getElementById("errorBox");

    // Open the "Create Session" modal when clicking Get Startted
    if (getStartedBtn) {
        getStartedBtn.addEventListener("click", function () {
            if (errorBox) {
                errorBox.innerHTML = "";
                errorBox.classList.remove("visible");
                errorBox.style.display = "none";
            }
            $('#createSessionModal').modal('show');
        });
    }

    // Initialize Semantic UI validation on the create-session form
    if (formEl) {
        $('#form').form({
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
                email: {
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
    }

    if (submitBtn && formEl) {
        submitBtn.addEventListener("click", submitForm);
    }

    function submitForm(event) {
        event.preventDefault();
        const isValid = $('#form').form('is valid');

        if (!isValid) {
            return;
        }

        fetch(`/generate-session`, {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({
                session_title: formEl.session_title.value,
                event_date: formEl.event_date.value,
                name: formEl.name.value,
                email: formEl.email.value,
                zip: formEl.zip.value,
                end_date: formEl.end_date.value
            })
        }).then(response => {
            if (response.status === 200) {
                return response.json().then(body => {
                    window.location.href = body.data;
                });
            } else {
                return response.json().then(body => {
                    if (!errorBox) return;

                    errorBox.innerHTML = "";
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
            if (!errorBox) return;
            errorBox.textContent = "Network error. Please try again.";
            errorBox.classList.add("visible");
            errorBox.style.display = "block";
        });
    }
});
