let path = require("path");
let express = require("express");
let app = express();
let { Pool } = require('pg');
let http = require('http');
let server = http.createServer(app);
let { Server } = require('socket.io');
let io = new Server(server, {
    cors: {
        origin: process.env.NODE_ENV === 'production' 
            ? [/\.fly\.dev$/, /^https?:\/\/where2eat\.fly\.dev/]
            : "*",
        methods: ["GET", "POST"]
    },
    transports: ['websocket', 'polling'],
    allowUpgrades: true,
    pingTimeout: 60000,
    pingInterval: 25000
});
let fs = require("fs");
let cookieParser = require("cookie-parser");
app.use(express.json());
app.use(cookieParser());

let cookieOptions = {
  httpOnly: true, // JS can't access it
  secure: false, // Set to true only when deploying to HTTPS
  sameSite: "strict", // only sent to this domain
  maxAge: 7 * 24 * 60 * 60 * 1000 // 1 week
};

// connect to Neon db
let pool = new Pool({
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
            `, [session_id, creator_user_id])
            .then(() => {
                res.cookie(`session_${session_id}`, creator_user_id, cookieOptions);
                
                let link = `${req.protocol}://${req.get('host')}/session/${session_id}`;
                res.status(200).json({data: link});
            });
        });
    })
    .catch((error) => {
        console.error("Error generating a session:", error);
        res.status(500).json({ data: "Error generating a session." });
    })
});

app.post("/session/:session_id/join", (req, res) => {
    let session_id = req.params.session_id;
    let { name, existingUserId, isExistingUser } = req.body;

    if (isExistingUser) {
        // User selected existing name

        if (!existingUserId) {
            return res.status(400).json({ error: "Please select a user" });
        }
        
        pool.query(`
            SELECT user_id FROM session_users 
            WHERE session_id = $1 AND user_id = $2
        `, [session_id, existingUserId])
        .then((result) => {
            if (result.rows.length === 0) {
                return res.status(400).json({ error: "User not found in session" });
            }
    
            res.cookie(`session_${session_id}`, existingUserId, cookieOptions);
            
            return pool.query(`SELECT name FROM users WHERE user_id = $1`, [existingUserId])
            .then((userResult) => {
                res.status(200).json({name: userResult.rows[0].name});
            });
        })
        .catch((error) => {
            console.error("Error selecting existing user:", error);
            res.status(500).json({ error: "Error selecting user" });
        });
        
    } else {
        // new user joining
        if (!name || typeof name !== "string" || name.trim().length === 0) {
            return res.status(400).json({ error: "Name is required" });
        }

        pool.query(`INSERT INTO users (name) VALUES ($1) RETURNING user_id`, [name.trim()])
        .then((result) => {
            let user_id = result.rows[0].user_id;

            return pool.query(`INSERT INTO session_users (session_id, user_id) VALUES ($1, $2)`, [session_id, user_id])
            .then(() => {
                res.cookie(`session_${session_id}`, user_id, cookieOptions);

                res.status(200).json({ name: name.trim() });
            });
        })
        .catch((error) => {
            console.error("Error joining session:", error);
            res.status(500).json({ error: "Error joining session" });
        });
    }
});

app.get("/api/session/:session_id/user", (req, res) => {
    let session_id = req.params.session_id;
    let userCookie = req.cookies[`session_${session_id}`];
    
    if (!userCookie) {
        return res.status(404).json({ error: "User not found in session" });
    }
    
    pool.query(`
        SELECT u.name 
        FROM users u 
        JOIN session_users su ON u.user_id = su.user_id 
        WHERE su.session_id = $1 AND u.user_id = $2
    `, [session_id, userCookie])
    .then((result) => {
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        res.status(200).json({ name: result.rows[0].name });
    })
    .catch((error) => {
        console.error("Error fetching user:", error);
        res.status(500).json({ error: "Error fetching user" });
    });
});

app.get("/api/session/:session_id/users", (req, res) => {
    let session_id = req.params.session_id;
    
    pool.query(`
        SELECT u.user_id, u.name 
        FROM users u 
        JOIN session_users su ON u.user_id = su.user_id 
        WHERE su.session_id = $1
        ORDER BY u.name
    `, [session_id])
    .then((result) => {
        res.status(200).json({ users: result.rows });
    })
    .catch((error) => {
        console.error("Error fetching session users:", error);
        res.status(500).json({ error: "Error fetching users" });
    });
});

app.get("/session/:session_id", (req, res) => {
    let session_id = req.params.session_id;

    pool.query(`SELECT * FROM session WHERE session_id = $1`, [session_id])
    .then((result) => {
        if (result.rows.length === 0) {
            return res.status(404).send("Session not found.");
        } else {
            let htmlPath = path.join(__dirname, "public", "session.html");  
            let html = fs.readFileSync(htmlPath, "utf8");                     
            html = html.replace(/YOUR_API_KEY/g, process.env.GOOGLE_MAPS_API_KEY || "");
            return res.type("html").send(html);
        }
    })
    .catch((error) => {
        console.error("Error fetching session:", error);
        return res.status(500).send("Error fetching session.");
    });
});

// In-memory storage for session restaurants
const sessionRestaurants = new Map();

// Socket.IO connection handling
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join a session room
    socket.on('join-session', (sessionId) => {
        socket.join(`session-${sessionId}`);
        socket.sessionId = sessionId;
        
        // Get user count in room
        const room = io.sockets.adapter.rooms.get(`session-${sessionId}`);
        const userCount = room ? room.size : 1;
        
        // Tell everyone in the session about the new user count
        io.to(`session-${sessionId}`).emit('user-count', userCount);
        
        // Send existing restaurants to the newly joined user
        const existingRestaurants = sessionRestaurants.get(sessionId) || [];
        if (existingRestaurants.length > 0) {
            socket.emit('existing-restaurants', existingRestaurants);
        }
        
        console.log(`User ${socket.id} joined session ${sessionId}. Total users: ${userCount}`);
    });

    // Handle restaurant addition
    socket.on('add-restaurant', (data) => {
        if (socket.sessionId) {
            console.log(`Restaurant added to session ${socket.sessionId}:`, data);
            
            // Store restaurant in memory
            if (!sessionRestaurants.has(socket.sessionId)) {
                sessionRestaurants.set(socket.sessionId, []);
            }
            const restaurants = sessionRestaurants.get(socket.sessionId);
            
            // Avoid duplicates
            if (!restaurants.some(r => r.id === data.id)) {
                restaurants.push(data);
            }
            
            // Broadcast to all users in the session (including sender)
            io.to(`session-${socket.sessionId}`).emit('restaurant-added', data);
        }
    });

    // Handle vote submission
    socket.on('submit-vote', (data) => {
        if (socket.sessionId) {
            console.log(`Vote submitted in session ${socket.sessionId}:`, data);
            // Broadcast to all users in the session
            io.to(`session-${socket.sessionId}`).emit('vote-submitted', {
                userId: socket.id,
                vote: data.vote,
                userName: data.userName
            });
        }
    });

    socket.on('disconnect', () => {
        if (socket.sessionId) {
            // Update user count after disconnect
            setTimeout(() => {
                const room = io.sockets.adapter.rooms.get(`session-${socket.sessionId}`);
                const userCount = room ? room.size : 0;
                io.to(`session-${socket.sessionId}`).emit('user-count', userCount);
            }, 100);
        }
        console.log('User disconnected:', socket.id);
    });
});

app.post("/vote", async (req, res) => {
    const { session_id, user_id, selection } = req.body;

    try {
        await pool.query(`
            UPDATE users
            SET "votedFor" = $1
            WHERE user_id = $2 AND session_id = $3
        `, [selection, user_id, session_id]);

        const result = await pool.query(`
            SELECT COUNT(*) AS total,
                   COUNT("votedFor") AS voted
            FROM users
            WHERE session_id = $1
        `, [session_id]);

        const total = parseInt(result.rows[0].total);
        const voted = parseInt(result.rows[0].voted);

        let winner = null;

        if (total === voted) {
            const voteResult = await pool.query(`
                SELECT "votedFor", COUNT(*) AS count
                FROM users
                WHERE session_id = $1
                GROUP BY "votedFor"
                ORDER BY count DESC
                LIMIT 1
            `, [session_id]);

            winner = voteResult.rows[0].votedFor;
        }

        res.json({
            success: true,
            allVoted: total === voted,
            winner
        });

    } catch (err) {
        console.error("Error updating vote:", err);
        res.status(500).json({ success: false });
    }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
