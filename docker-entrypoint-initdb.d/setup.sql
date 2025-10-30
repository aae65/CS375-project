\c restaurant-voting

-- use this to clear any existing tables to reinsert fresh data
-- you'll need to add a DROP TABLE for every table you add
-- we don't drop the database because that causes errors with fly
DROP TABLE IF EXISTS session;

-- create whatever tables you need here
CREATE TABLE session (
	id SERIAL PRIMARY KEY,
	datum TEXT
);

-- dummy data
INSERT INTO foo (datum) VALUES ('Hello this is some text');
INSERT INTO foo (datum) VALUES ('Another sentence');
INSERT INTO foo (datum) VALUES ('How are you?');

\q
