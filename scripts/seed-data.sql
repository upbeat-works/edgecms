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
INSERT INTO translations (key, language, value, section, version_id) VALUES 
('welcome.title', 'en', 'Welcome to EdgeCMS', 'homepage', 1),
('welcome.title', 'es', 'Bienvenido a EdgeCMS', 'homepage', 1),
('welcome.title', 'fr', 'Bienvenue sur EdgeCMS', 'homepage', 1),
('welcome.subtitle', 'en', 'Manage your content with ease', 'homepage', 1),
('welcome.subtitle', 'es', 'Gestiona tu contenido con facilidad', 'homepage', 1),
('welcome.subtitle', 'fr', 'Gérez votre contenu facilement', 'homepage', 1);

-- Dashboard translations
INSERT INTO translations (key, language, value, section, version_id) VALUES 
('dashboard.title', 'en', 'Dashboard', 'dashboard', 1),
('dashboard.title', 'es', 'Panel de control', 'dashboard', 1),
('dashboard.title', 'fr', 'Tableau de bord', 'dashboard', 1);

-- Common button translations
INSERT INTO translations (key, language, value, section, version_id) VALUES 
('button.save', 'en', 'Save', NULL, 1),
('button.save', 'es', 'Guardar', NULL, 1),
('button.save', 'fr', 'Enregistrer', NULL, 1),
('button.cancel', 'en', 'Cancel', NULL, 1),
('button.cancel', 'es', 'Cancelar', NULL, 1),
('button.cancel', 'fr', 'Annuler', NULL, 1),
('button.delete', 'en', 'Delete', NULL, 1),
('button.delete', 'es', 'Eliminar', NULL, 1),
('button.delete', 'fr', 'Supprimer', NULL, 1);

-- Settings translations
INSERT INTO translations (key, language, value, section, version_id) VALUES 
('settings.title', 'en', 'Settings', 'settings', 1),
('settings.title', 'es', 'Configuración', 'settings', 1),
('settings.title', 'fr', 'Paramètres', 'settings', 1),
('settings.language', 'en', 'Language', 'settings', 1),
('settings.language', 'es', 'Idioma', 'settings', 1),
('settings.language', 'fr', 'Langue', 'settings', 1); 