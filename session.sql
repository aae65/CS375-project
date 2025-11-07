CREATE TABLE session (
    session_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE session_settings (
    session_id UUID PRIMARY KEY REFERENCES session(session_id),
    session_title VARCHAR(100) NOT NULL,
    creator_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) NOT NULL,
    zipcode VARCHAR(10) NOT NULL,
    end_date DATE NOT NULL,           
    event_date DATE NOT NULL
);

CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    username VARCHAR(50)
);

CREATE TABLE session_users (
    session_id UUID REFERENCES session(session_id),
    user_id INT REFERENCES users(user_id),
    PRIMARY KEY (session_id, user_id)
);

CREATE TABLE restaurants (
    session_id UUID REFERENCES session(session_id),
    restaurant_id SERIAL PRIMARY KEY,
    name VARCHAR(100),
    address VARCHAR(200),
);

CREATE TABLE votes (
    vote_id SERIAL PRIMARY KEY,
    session_id UUID REFERENCES session(session_id),
    user_id INT REFERENCES users(user_id),
    restaurant_id INT REFERENCES restaurants(restaurant_id),
    UNIQUE(session_id, user_id, restaurant_id)
);