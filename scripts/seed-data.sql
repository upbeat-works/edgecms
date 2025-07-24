-- Seed test data for EdgeCMS

-- Insert languages
INSERT INTO languages (locale, "default") VALUES ('en', 1);
INSERT INTO languages (locale, "default") VALUES ('es', 0);
INSERT INTO languages (locale, "default") VALUES ('fr', 0);

-- Insert sections
INSERT INTO sections (name) VALUES ('homepage');
INSERT INTO sections (name) VALUES ('dashboard');
INSERT INTO sections (name) VALUES ('settings');

-- Insert translations

-- Homepage translations
INSERT INTO translations (key, language, value, section) VALUES 
('welcome.title', 'en', 'Welcome to EdgeCMS', 'homepage'),
('welcome.title', 'es', 'Bienvenido a EdgeCMS', 'homepage'),
('welcome.title', 'fr', 'Bienvenue sur EdgeCMS', 'homepage'),
('welcome.subtitle', 'en', 'Manage your content with ease', 'homepage'),
('welcome.subtitle', 'es', 'Gestiona tu contenido con facilidad', 'homepage'),
('welcome.subtitle', 'fr', 'Gérez votre contenu facilement', 'homepage');

-- Dashboard translations
INSERT INTO translations (key, language, value, section) VALUES 
('dashboard.title', 'en', 'Dashboard', 'dashboard'),
('dashboard.title', 'es', 'Panel de control', 'dashboard'),
('dashboard.title', 'fr', 'Tableau de bord', 'dashboard');

-- Common button translations
INSERT INTO translations (key, language, value, section) VALUES 
('button.save', 'en', 'Save', NULL),
('button.save', 'es', 'Guardar', NULL),
('button.save', 'fr', 'Enregistrer', NULL),
('button.cancel', 'en', 'Cancel', NULL),
('button.cancel', 'es', 'Cancelar', NULL),
('button.cancel', 'fr', 'Annuler', NULL),
('button.delete', 'en', 'Delete', NULL),
('button.delete', 'es', 'Eliminar', NULL),
('button.delete', 'fr', 'Supprimer', NULL);

-- Settings translations
INSERT INTO translations (key, language, value, section) VALUES 
('settings.title', 'en', 'Settings', 'settings'),
('settings.title', 'es', 'Configuración', 'settings'),
('settings.title', 'fr', 'Paramètres', 'settings'),
('settings.language', 'en', 'Language', 'settings'),
('settings.language', 'es', 'Idioma', 'settings'),
('settings.language', 'fr', 'Langue', 'settings'); 