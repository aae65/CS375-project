const path = require("path");
const express = require("express");
const app = express();
const { Pool } = require('pg');
app.use(express.json());

// connect to Neon db
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/index.html");
});

app.get("/api/test", async (req, res) => {
    try {
        let result = await pool.query('SELECT * FROM session;');
        res.json({ 
            success: true, 
            data: result.rows, 
            database: 'Neon (shared)' 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post("/generate-session", (req, res) => {

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

    if (!name || !email || !phone || !zip)  {
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
            console.log("Error: ", errors);
            res.status(400).json({data: errors});
        }
    }

    pool.query(`INSERT INTO session 
        DEFAULT VALUES RETURNING session_id;`)
    .then((result) => {
        console.log("pool query success");
        let data = result.rows[0].session_id;
        let link= `${req.protocol}://${req.get('host')}/session/${data}`;
        //TODO: for new branch ignore if not Vivian or Ashleigh
        res.status(200).json({data: link});
    })
    .catch((error) => {
        console.error("Error generating a session:", error);
        res.status(500).json({ data: "Error generating a session." });
    })
});

app.get("/session/:session_id", (req, res) => {
    let session_id = req.params.session_id;

    pool.query(`SELECT * FROM session WHERE session_id = $1`, [session_id])
    .then((result) => {
        if (result.rows.length === 0) {
            return res.status(404).send("Session not found.");
        } else {
            return res.sendFile(__dirname + "/public/session.html");
        }
    })
    .catch((error) => {
        console.error("Error fetching session:", error);
        return res.status(500).send("Error fetching session.");
    });
});

app.listen(3000, "0.0.0.0", () => {
    console.log("Server running at http://localhost:3000");
});
