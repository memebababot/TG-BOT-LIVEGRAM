DROP TABLE IF EXISTS botmembers;
DROP TABLE IF EXISTS botsettings;
DROP TABLE IF EXISTS botmedia;
DROP TABLE IF EXISTS botmessages;

CREATE TABLE IF NOT EXISTS botmembers (babaKey TEXT PRIMARY KEY, babaValue TEXT);
CREATE TABLE IF NOT EXISTS botsettings (babaKey TEXT PRIMARY KEY, babaValue TEXT);
CREATE TABLE IF NOT EXISTS botmedia (babaKey TEXT PRIMARY KEY, babaValue TEXT);
CREATE TABLE IF NOT EXISTS botmessages (babaKey TEXT PRIMARY KEY, babaValue TEXT);

INSERT INTO botsettings (babaKey, babaValue) VALUES ('GLOBAL_REQUEST_RATE','{"message_last":1770185214,"request_count":1}');