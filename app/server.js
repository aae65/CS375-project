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
    if (req.body.name && req.body.email && req.body.phone && req.body.zip) {
        res.status(200).sendFile(__dirname + "/public/session.html");
    } else {
        res.status(400).json();
    }
})

app.listen(3000, "localhost", () => {
    console.log("Server running at http://localhost:3000");
});
