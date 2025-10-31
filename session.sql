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
    session_id UUID REFERENCES session(session_id)
    restaurant_id SERIAL PRIMARY KEY,
    name VARCHAR(100),
);

CREATE TABLE votes (
    session_id UUID REFERENCES session(session_id),
    vote_id SERIAL PRIMARY KEY,
    user_id INT REFERENCES users(user_id),
    restaurant_id INT REFERENCES restaurants(restaurant_id),
    vote_type SMALLINT CHECK (vote_type IN (1, -1))
);