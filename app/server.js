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

    let session_title = typeof req.body.session_title === "string" &&
        req.body.session_title.trim().length > 0;

    let name = typeof req.body.name === "string" &&
        req.body.name.trim().length > 0 &&
        !req.body.name.includes(" ");

    let email = typeof req.body.email === "string" &&
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email.trim());

    let zip = typeof req.body.zip === "string" &&
        /^\d{5}$/.test(req.body.zip.trim());

    let end_date = null;
    let validEndDate = false;
    if (typeof req.body.end_date === "string" && req.body.end_date.trim().length > 0) {
        end_date = new Date(req.body.end_date.trim());
        let today = new Date();
        today.setHours(0, 0, 0, 0); 
        validEndDate = !isNaN(end_date.getTime()) && end_date >= today;
    } 

    let event_date = null;
    let validEventDate = false;
    if (typeof req.body.event_date === "string" && req.body.event_date.trim().length > 0) {
        event_date = new Date(req.body.event_date.trim());
        let today = new Date();
        today.setHours(0, 0, 0, 0);
        validEventDate = !isNaN(event_date.getTime()) && event_date >= today;
        
        // Event date should be on or after end date
        if (validEndDate && validEventDate && event_date < end_date) {
            validEventDate = false;
        }
    }

    if (!session_title || !name || !email || !zip || !validEndDate || !validEventDate)  {
        if (!session_title) {
            errors.push("Session title must not be empty");
        }
        if (!name) {
            errors.push("Name must not have spaces or be empty");
        }
        if (!email) {
            errors.push("Email address must not be empty, have spaces, or omit email characters");
        }
        if (!zip) {
            errors.push("Zip must not be empty, be a string, or have spaces");
        }
        if (!validEndDate) {
            errors.push("End date must be a valid date and not in the past");
        }
        if (!validEventDate) {
            errors.push("Event date must be a valid date, not in the past, and on or after the end date");
        }
        if (errors.length > 0) {
            console.log("Error: ", errors);
            return res.status(400).json({data: errors});
        }
    }

    pool.query(`INSERT INTO session 
        DEFAULT VALUES RETURNING session_id;`)
    .then((result) => {
        let session_id = result.rows[0].session_id;
        return pool.query(`
            INSERT INTO session_settings (session_id, session_title, creator_name, email, zipcode, end_date, event_date) 
            VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [session_id, req.body.session_title.trim(), req.body.name.trim(), req.body.email.trim(), req.body.zip.trim(), end_date, event_date])
        .then(() => {
            return pool.query(`
                INSERT INTO users (name) VALUES ($1) RETURNING user_id
            `, [req.body.name.trim()]);
        })
        .then((userResult) => {
            let creator_user_id = userResult.rows[0].user_id;
            return pool.query(`
                INSERT INTO session_users (session_id, user_id) VALUES ($1, $2)
            `, [session_id, creator_user_id]);
        })
        .then(() => {
            let link = `${req.protocol}://${req.get('host')}/session/${session_id}`;
            res.status(200).json({data: link});
        });
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
