-- Create Languages table
CREATE TABLE languages (
  locale TEXT PRIMARY KEY,
  "default" BOOLEAN DEFAULT FALSE
);

-- Create Sections table
CREATE TABLE sections (
  name TEXT PRIMARY KEY
);

-- Create Translations table
CREATE TABLE translations (
  key TEXT NOT NULL,
  language TEXT NOT NULL,
  value TEXT NOT NULL,
  section TEXT,
  PRIMARY KEY (language, key),
  FOREIGN KEY (language) REFERENCES Languages(locale),
  FOREIGN KEY (section) REFERENCES Sections(name)
);

-- Create index on key for faster queries
CREATE INDEX idx_translations_key ON Translations(key);

-- Create Media table
CREATE TABLE media (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  filename TEXT NOT NULL UNIQUE,
  mimeType TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL,
  section TEXT,
  uploadedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (section) REFERENCES Sections(name)
); 