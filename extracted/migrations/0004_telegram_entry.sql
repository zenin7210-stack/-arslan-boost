CREATE TABLE telegram_entry (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    menu_url TEXT NOT NULL,
    webhook_connected INTEGER NOT NULL CHECK (webhook_connected IN (0, 1)),
    has_main_web_app INTEGER NOT NULL CHECK (has_main_web_app IN (0, 1))
);
