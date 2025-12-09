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
    transports: ['websocket'],
    allowUpgrades: false,
    pingTimeout: 60000,
    pingInterval: 25000,
    connectTimeout: 45000,
    maxHttpBufferSize: 1e6,
    perMessageDeflate: false
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
                res.status(200).json({name: userResult.rows[0].name, userId: existingUserId});
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

                // Notify all users in session to update member list
                io.to(`session-${session_id}`).emit('member-list-updated');

                res.status(200).json({ name: name.trim(), userId: user_id });
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

app.get("/api/session/:session_id/current-user", (req, res) => {
    let session_id = req.params.session_id;
    let userCookie = req.cookies[`session_${session_id}`];

    if (!userCookie) {
        return res.status(404).json({ error: "User not found in session" });
    }

    pool.query(`
        SELECT u.user_id, u.name, ss.creator_name
        FROM users u 
        JOIN session_users su ON u.user_id = su.user_id 
        JOIN session_settings ss ON ss.session_id = su.session_id
        WHERE su.session_id = $1 AND u.user_id = $2
    `, [session_id, userCookie])
    .then((result) => {
        if (result.rows.length === 0) {
            return res.status(404).json({ error: "User not found" });
        }
        const user = result.rows[0];
        res.status(200).json({
            userId: user.user_id,
            name: user.name,
            isCreator: user.name === user.creator_name
        });
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

app.get("/api/session/:session_id/members", (req, res) => {
    const session_id = req.params.session_id;
    pool.query(`
        SELECT u.user_id, u.name,
            EXISTS (
                SELECT 1 FROM votes v
                WHERE v.session_id = su.session_id AND v.user_id = su.user_id
            ) AS has_voted
        FROM users u
        JOIN session_users su ON u.user_id = su.user_id
        WHERE su.session_id = $1
        ORDER BY u.name
    `, [session_id])
    .then(result => {
        res.json({ members: result.rows });
    })
    .catch(err => {
        res.status(500).json({ error: "Error fetching members. Please refresh and try again." });
    });
});

app.get("/api/session/:session_id/restaurants", (req, res) => {
    const session_id = req.params.session_id;
    pool.query(`
        SELECT restaurant_id as id, name, address
        FROM restaurants
        WHERE session_id = $1
        ORDER BY restaurant_id
    `, [session_id])
    .then(result => {
        res.json({ restaurants: result.rows });
    })
    .catch(err => {
        console.error('Error fetching restaurants:', err);
        res.status(500).json({ error: "Error fetching restaurants" });
    });
});

app.get("/session/:session_id", (req, res) => {
    let session_id = req.params.session_id;

    // Get the session and its settings so we can read zipcode
    pool.query(`
        SELECT s.session_id, ss.zipcode
        FROM session s
                 LEFT JOIN session_settings ss ON s.session_id = ss.session_id
        WHERE s.session_id = $1
    `, [session_id])
        .then((result) => {
            if (result.rows.length === 0) {
                return res.status(404).send("Session not found.");
            } else {
                let zip = result.rows[0].zipcode || "";
                let htmlPath = path.join(__dirname, "public", "session.html");
                let html = fs.readFileSync(htmlPath, "utf8");

                html = html.replace(/YOUR_API_KEY/g, process.env.GOOGLE_MAPS_API_KEY || "");
                html = html.replace(/<%= session.zip_code %>/g, zip);

                return res.type("html").send(html);
            }
        })
        .catch((error) => {
            console.error("Error fetching session:", error);
            return res.status(500).send("Error fetching session.");
        });
});

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
        
        // Send existing restaurants to the newly joined user from database
        pool.query(`
            SELECT restaurant_id as id, name, address
            FROM restaurants
            WHERE session_id = $1
        `, [sessionId])
        .then((result) => {
            if (result.rows.length > 0) {
                socket.emit('existing-restaurants', result.rows);
            }
        })
        .catch((err) => console.error('Error fetching restaurants:', err));
        
        // Notify all users to update member list
        io.to(`session-${sessionId}`).emit('member-list-updated');
        
        console.log(`User ${socket.id} joined session ${sessionId}. Total users: ${userCount}`);
    });

    // Handle restaurant addition
    socket.on('add-restaurant', async (data) => {
        if (socket.sessionId) {
            console.log(`Restaurant added to session ${socket.sessionId}:`, data);
            
            try {
                // Check if restaurant already exists
                const existing = await pool.query(`
                    SELECT restaurant_id FROM restaurants
                    WHERE session_id = $1 AND name = $2
                `, [socket.sessionId, data.name]);

                let restaurant_id;
                if (existing.rows.length > 0) {
                    restaurant_id = existing.rows[0].restaurant_id;
                } else {
                    // Insert into database
                    const result = await pool.query(`
                        INSERT INTO restaurants (session_id, name, address)
                        VALUES ($1, $2, $3)
                        RETURNING restaurant_id
                    `, [socket.sessionId, data.name, data.address || '']);

                    restaurant_id = result.rows[0].restaurant_id;
                }

                // Broadcast to all users in the session (including sender)
                io.to(`session-${socket.sessionId}`).emit('restaurant-added', {
                    id: restaurant_id,
                    name: data.name,
                    address: data.address || ''
                });
            } catch (err) {
                console.error('Error adding restaurant:', err);
            }
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
    const { session_id, user_id, restaurant_id } = req.body;

    console.log('Vote request:', { session_id, user_id, restaurant_id });

    if (!session_id || !user_id || !restaurant_id) {
        console.error('Missing required fields:', { session_id, user_id, restaurant_id });
        return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    try {
        // Check if voting period has ended
        const sessionSettings = await pool.query(`
            SELECT end_date FROM session_settings
            WHERE session_id = $1
        `, [session_id]);

        if (sessionSettings.rows.length === 0) {
            return res.status(400).json({ success: false, error: 'Session not found' });
        }

        const endDate = new Date(sessionSettings.rows[0].end_date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        endDate.setHours(0, 0, 0, 0);

        if (today > endDate) {
            return res.status(400).json({
                success: false,
                error: 'Voting period has ended',
                votingEnded: true
            });
        }

        // Verify user is in session
        const userCheck = await pool.query(`
            SELECT user_id FROM session_users
            WHERE session_id = $1 AND user_id = $2
        `, [session_id, user_id]);

        if (userCheck.rows.length === 0) {
            console.error('User not in session:', { session_id, user_id });
            return res.status(400).json({ success: false, error: 'User not in session' });
        }

        // Delete any existing vote from this user in this session
        await pool.query(`
            DELETE FROM votes
            WHERE session_id = $1 AND user_id = $2
        `, [session_id, user_id]);

        // Insert new vote
        await pool.query(`
            INSERT INTO votes (session_id, user_id, restaurant_id)
            VALUES ($1, $2, $3)
        `, [session_id, user_id, restaurant_id]);

        // Get total users in session
        const totalResult = await pool.query(`
            SELECT COUNT(*) AS total
            FROM session_users
            WHERE session_id = $1
        `, [session_id]);

        // Get number of users who voted
        const votedResult = await pool.query(`
            SELECT COUNT(DISTINCT user_id) AS voted
            FROM votes
            WHERE session_id = $1
        `, [session_id]);
        const totalUsers = parseInt(totalResult.rows[0].total, 10);

        const total = parseInt(totalResult.rows[0].total);
        const voted = parseInt(votedResult.rows[0].voted);

        let winner = null;
        let winnerName = null;

        if (total === voted) {
            // Get winner by counting votes
            const winnerResult = await pool.query(`
                SELECT r.restaurant_id, r.name, COUNT(*) as vote_count
                FROM votes v
                JOIN restaurants r ON v.restaurant_id = r.restaurant_id
                WHERE v.session_id = $1
                GROUP BY r.restaurant_id, r.name
                ORDER BY vote_count DESC
                LIMIT 1
            `, [session_id]);

            if (winnerResult.rows.length > 0) {
                winner = winnerResult.rows[0].restaurant_id;
                winnerName = winnerResult.rows[0].name;

                // Broadcast winner to all users in the session
                io.to(`session-${session_id}`).emit('voting-complete', {
                    winner: winnerName
                });
            }
        }

        io.to(`session-${session_id}`).emit('member-list-updated');

        res.json({
            success: true,
            allVoted: total === voted,
            winner: winnerName
        });

    } catch (err) {
        console.error("Error updating vote:", err);
        res.status(500).json({ success: false, error: err.message });
    }
});

app.post("/session/:session_id/finish-voting", async (req, res) => {
    const session_id = req.params.session_id;
    const { user_id } = req.body;

    try {
        // Verify user is the session creator
        const creatorCheck = await pool.query(`
            SELECT ss.creator_name, u.name
            FROM session_settings ss
            JOIN session_users su ON su.session_id = ss.session_id
            JOIN users u ON u.user_id = su.user_id
            WHERE ss.session_id = $1 AND u.user_id = $2
        `, [session_id, user_id]);

        if (creatorCheck.rows.length === 0) {
            return res.status(403).json({ error: 'User not found in session' });
        }

        if (creatorCheck.rows[0].creator_name !== creatorCheck.rows[0].name) {
            return res.status(403).json({ error: 'Only the session creator can finish voting early' });
        }

        // Get winner by counting votes
        const winnerResult = await pool.query(`
            SELECT r.restaurant_id, r.name, COUNT(*) as vote_count
            FROM votes v
            JOIN restaurants r ON v.restaurant_id = r.restaurant_id
            WHERE v.session_id = $1
            GROUP BY r.restaurant_id, r.name
            ORDER BY vote_count DESC
            LIMIT 1
        `, [session_id]);

        let winnerName = null;
        if (winnerResult.rows.length > 0) {
            winnerName = winnerResult.rows[0].name;

            // Broadcast winner to all users in the session
            io.to(`session-${session_id}`).emit('voting-complete', {
                winner: winnerName,
                finishedEarly: true
            });
        } else {
            return res.status(400).json({ error: 'No votes have been cast yet' });
        }

        res.json({
            success: true,
            winner: winnerName
        });

    } catch (err) {
        console.error("Error finishing voting:", err);
        res.status(500).json({ error: err.message });
    }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});

// debugging

io.engine.on("connection_error", (err) => {
    console.log("Engine.IO connection_error"), {
        code: err.code,
        message: err.message,
        context: err.context
    }
});