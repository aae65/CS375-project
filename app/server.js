const path = require("path");
const express = require("express");
const app = express();

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/index.html");
});

app.get("/session", (req, res) => {
    res.sendFile(__dirname + "/public/session.html");
})

app.post("/session", (req, res) => {
    console.log("Received body: ", req.body);
    let errors = [];

    let name = typeof req.body.name === "string" &&
        req.body.name.trim().length > 0 &&
        !req.body.name.includes(" ");

    let email = typeof req.body.email === "string" &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email.trim());

    let phone = typeof req.body.phone === "string" &&
        /^\d{10}$/.test(req.body.phone.trim());

    let zip = typeof req.body.zip === "string" &&
        /^\d{5}$/.test(req.body.zip.trim());

    if (name && email && phone && zip) {
        return res.status(200).json({success: true});
    } else {
        if (!name) {
            errors.push("Name must not have spaces or be empty");
        }
        if (!email) {
            errors.push("Email address must not be empty, have spaces, or omit email characters");
        }
        if (!phone) {
            errors.push("Phone number must not be empty, be less than 10 digits, or be a string");
        }
        if (!zip) {
            errors.push("Zip must not be empty, be a string, or have spaces");
        }
        if (errors.length > 0) {
            res.status(400).json({errors});
        }
    }
})

app.listen(3000, "localhost", () => {
    console.log("Server running at http://localhost:3000");
});
