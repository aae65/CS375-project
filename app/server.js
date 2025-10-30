const path = require("path");
const express = require("express");
const app = express();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false // Required for Neon
    }
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
    res.sendFile(__dirname + "/public/index.html");
});

app.get("/api/test", async (req, res) => {
    try {
        const result = await pool.query('SELECT * FROM session');
        res.json({ 
            success: true, 
            data: result.rows, 
            database: 'Neon (shared)' 
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.listen(3000, "0.0.0.0", () => {
    console.log("Server running at http://localhost:3000");
});
